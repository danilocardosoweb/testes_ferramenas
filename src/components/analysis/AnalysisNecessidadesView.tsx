import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Tipos retornados pelas RPCs existentes
interface SeqRPC {
  matriz: string;
  seq: string | null;
  ativa: string | null;
  produzido_seq: number;
  cap_total_seq: number;
  cap_restante_seq: number;
  demanda_mensal_seq: number | null; // da RPC (igual entre seqs); aqui recalculamos pela distribuição
  meses_cobertura_seq: number | null; // idem
  data_eol_seq: string | null;
  data_pedido_seq: string | null;
}

interface SummaryRPC {
  matriz: string;
  seq_ativas: number;
  produzido_total: number;
  cap_total: number;
  cap_restante: number;
  demanda_media_mensal: number | null;
  meses_cobertura: number | null;
  data_eol: string | null;
  data_pedido: string | null;
}

interface AggRPC {
  ferramenta: string;
  pedido_kg_sum: number;
  avg6m: number;
  avg12m: number;
  pedido_count: number;
  cliente_count: number;
}

// Helpers
function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatDateBR(iso?: string | null) {
  if (!iso) return "";
  const s = String(iso);
  const y = s.slice(0,4);
  const m = s.slice(5,7);
  const d = s.slice(8,10);
  return `${d}/${m}/${y}`;
}
function formatNumberBR(n?: number | null) {
  if (n == null || !isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function addMonthsApprox(baseISO: string, months: number) {
  const dt = new Date(baseISO + 'T00:00:00');
  const intm = Math.max(0, Math.floor(months));
  dt.setMonth(dt.getMonth() + intm);
  const frac = Math.max(0, months - intm);
  if (frac > 0) dt.setDate(dt.getDate() + Math.round(frac * 30));
  return toISO(dt);
}

// Tipos da tela
type DistMode = "igual" | "proporcional";

interface NeedRow {
  matriz: string;
  seq: string;
  seq_ativas: number;
  produzido_seq: number;
  restante_seq: number;
  demanda_matriz_mensal: number;
  demanda_seq_mensal: number;
  meses_cobertura: number | null;
  data_eol: string | null;
  data_pedido: string | null;
  desgaste_perc: number; // produzido_seq / 30.000
  crescimento_ratio: number; // 6m/12m
  insuf_seq: { required: number; has: number } | null;
  score: number;
  prioridade: "Alta" | "Média" | "Baixa";
  motivo: string;
}

export function AnalysisNecessidadesView() {
  const [periodEnd, setPeriodEnd] = useState(() => toISO(new Date()));
  const [months, setMonths] = useState(6);
  const [leadTime, setLeadTime] = useState(25);
  const [mode, setMode] = useState<DistMode>("proporcional");
  const [rows, setRows] = useState<NeedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const periodStart = (() => {
          const dt = new Date(periodEnd + 'T00:00:00');
          dt.setMonth(dt.getMonth() - (months - 1));
          dt.setDate(1);
          return toISO(dt);
        })();

        const [seqRes, sumRes, aggRes] = await Promise.all([
          supabase.rpc('matrix_lifespan_by_sequence', {
            period_end: periodEnd,
            months,
            lead_time_days: leadTime,
            matriz_code: null,
          }),
          supabase.rpc('matrix_lifespan_summary', {
            period_end: periodEnd,
            months,
            lead_time_days: leadTime,
            matriz_filter: null,
          }),
          supabase.rpc('analysis_carteira_flat_agg', {
            period_start: periodStart,
            period_end: periodEnd,
            ferramenta_filter: null,
            cliente_filter: null,
          })
        ]);
        if (seqRes.error) throw seqRes.error;
        if (sumRes.error) throw sumRes.error;
        if (aggRes.error) throw aggRes.error;

        const seqRows = (seqRes.data as SeqRPC[]) || [];
        const sumRows = (sumRes.data as SummaryRPC[]) || [];
        const aggRows = (aggRes.data as AggRPC[]) || [];

        // Índices por Matriz
        const summaryBy: Record<string, SummaryRPC & { demanda_effective: number; demanda_is_estimada: boolean }> = {};
        sumRows.forEach(r => {
          const raw = r.demanda_media_mensal || 0;
          const effective = raw > 0 && raw < 300 ? 300 : raw;
          summaryBy[r.matriz] = { ...r, demanda_effective: effective, demanda_is_estimada: raw > 0 && raw < 300 } as any;
        });
        const growthBy: Record<string, number> = {};
        aggRows.forEach(a => {
          const k = (a.ferramenta || '').toUpperCase();
          const g = (a.avg12m && a.avg12m > 0) ? (a.avg6m / a.avg12m) : (a.avg6m > 0 ? 1.2 : 1);
          growthBy[k] = g;
        });

        // Agrupar por Matriz para pesos proporcionais
        const group: Record<string, { sumProd: number; seqs: SeqRPC[] }> = {};
        seqRows.forEach(s => {
          const k = (s.matriz || '').toUpperCase();
          if (!group[k]) group[k] = { sumProd: 0, seqs: [] };
          group[k].seqs.push(s);
          group[k].sumProd += (s.produzido_seq || 0);
        });

        const out: NeedRow[] = [];
        Object.keys(group).forEach(mkey => {
          const sum = summaryBy[mkey];
          const seqs = group[mkey].seqs;
          const sumProd = group[mkey].sumProd || 0;
          if (!sum) return;
          const demandaTot = sum.demanda_effective || 0;
          const nAtivas = sum.seq_ativas || 0;
          const crescimento = growthBy[mkey] || 1;

          // sequência por sequência
          seqs.forEach(s => {
            const weight = (mode === 'proporcional' && sumProd > 0) ? ((s.produzido_seq || 0) / sumProd) : (nAtivas > 0 ? 1 / nAtivas : 0);
            const demSeq = demandaTot * weight;
            const meses = demSeq > 0 ? ((s.cap_restante_seq || 0) / demSeq) : null;
            const eol = meses != null ? addMonthsApprox(periodEnd, Math.max(0, meses)) : null;
            const pedido = eol ? toISO(new Date(new Date(eol + 'T00:00:00').getTime() - (leadTime || 0) * 24 * 3600 * 1000)) : null;
            const desgaste = (s.produzido_seq || 0) / 30000;
            const insufReq = demandaTot > 0 ? Math.ceil((demandaTot * 12) / 30000) : 0;
            const insufSeq = insufReq > nAtivas ? { required: insufReq, has: nAtivas } : null;

            const s1 = clamp01(1 - (meses != null ? meses : 3) / 2); // cobertura baixa pesa mais
            const s2 = clamp01(desgaste);
            const s3 = (s.produzido_seq || 0) >= 30000 ? 1 : 0;
            const s4 = clamp01(Math.max(0, (crescimento - 1) / 1));
            const s5 = insufSeq ? clamp01((insufSeq.required - insufSeq.has) / insufSeq.required) : 0;
            const score = 0.35 * s1 + 0.25 * s2 + 0.2 * s3 + 0.1 * s4 + 0.1 * s5;
            const prioridade = score >= 0.7 ? 'Alta' : score >= 0.45 ? 'Média' : 'Baixa';

            const motivos: string[] = [];
            if ((s.cap_restante_seq || 0) <= 0) motivos.push('restante zerado');
            if (meses != null && meses <= 1) motivos.push('cobertura < 1 mês');
            if ((s.produzido_seq || 0) >= 30000) motivos.push('excedeu 30 t');
            if (crescimento > 1.1) motivos.push('demanda crescente (6m > 12m)');
            if (insufSeq) motivos.push(`sequências insuficientes (necessárias ${insufSeq.required}, ativas ${insufSeq.has})`);
            if (sum.demanda_is_estimada) motivos.push('demanda baixa: usando piso de 300 kg/mês');

            out.push({
              matriz: mkey,
              seq: s.seq || '-',
              seq_ativas: nAtivas,
              produzido_seq: s.produzido_seq || 0,
              restante_seq: s.cap_restante_seq || 0,
              demanda_matriz_mensal: demandaTot,
              demanda_seq_mensal: demSeq,
              meses_cobertura: meses,
              data_eol: eol,
              data_pedido: pedido,
              desgaste_perc: desgaste,
              crescimento_ratio: crescimento,
              insuf_seq: insufSeq,
              score,
              prioridade,
              motivo: motivos.join('; '),
            });
          });
        });

        // Ordenar por score desc e pegar ao menos 20
        out.sort((a,b) => b.score - a.score);
        const top = out.slice(0, Math.max(20, out.length));
        if (!active) return;
        setRows(top);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? String(e));
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false };
  }, [periodEnd, months, leadTime, mode]);

  const displayed = useMemo(() => rows, [rows]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Até</label>
          <input type="date" className="h-9 w-40 rounded-md border bg-background px-3 text-sm" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Janela (meses)</label>
          <select className="h-9 w-28 rounded-md border bg-background px-3 text-sm" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={3}>3</option>
            <option value={6}>6</option>
            <option value={12}>12</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Lead time (dias)</label>
          <input type="number" className="h-9 w-28 rounded-md border bg-background px-3 text-sm" min={0} value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value))} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Distribuição</label>
          <select className="h-9 w-48 rounded-md border bg-background px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as DistMode)}>
            <option value="igual">Igual entre sequências</option>
            <option value="proporcional">Proporcional à Qte.Prod.</option>
          </select>
        </div>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Gerando relatório…</div>}
      {error && <div className="text-sm text-red-600">Erro: {error}</div>}

      {!loading && !error && (
        <div className="overflow-auto">
          <table className="w-full table-auto border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className="sticky top-0 bg-muted px-2 py-2 text-left">Matriz</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-left">Seq</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right">Consumo m/mês (kg)</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right">Consumo a/a (kg)</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right">Seq Ativas</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right">Desgaste (%)</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right">Restante (kg)</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right">Meses cobertura</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right">Prev. Reposição</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-left">Prioridade</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-left">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r, i) => (
                <tr key={`${r.matriz}-${r.seq}-${i}`} className="border-b hover:bg-muted/40">
                  <td className="px-2 py-1.5 text-left whitespace-nowrap">{r.matriz}</td>
                  <td className="px-2 py-1.5 text-left">{r.seq}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR(r.demanda_seq_mensal)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR((r.demanda_seq_mensal || 0) * 12)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.seq_ativas}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR(r.desgaste_perc * 100)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR(r.restante_seq)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR(r.meses_cobertura ?? 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatDateBR(r.data_pedido)}</td>
                  <td className="px-2 py-1.5 text-left">
                    <span className={
                      r.prioridade === 'Alta' ? 'rounded border border-red-600/40 bg-red-600/10 text-red-700 px-2 py-0.5' :
                      r.prioridade === 'Média' ? 'rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 px-2 py-0.5' :
                      'rounded border border-emerald-600/30 bg-emerald-600/10 text-emerald-700 px-2 py-0.5'
                    }>{r.prioridade}</span>
                  </td>
                  <td className="px-2 py-1.5 text-left">{r.motivo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-muted-foreground">
            Exibindo {displayed.length} sequências com maior prioridade de necessidade.
          </div>
        </div>
      )}
    </div>
  );
}
