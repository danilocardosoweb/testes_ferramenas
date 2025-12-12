import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wrench, AlertTriangle, TrendingDown, Clock, Factory, Target, Zap, ChevronRight, AlertCircle, CheckCircle2, Info, Skull, TrendingUp, ShieldAlert, Layers, BarChart3, ArrowUpRight, Activity } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type VidaRow = {
  matriz: string;
  seq_ativas: number;
  produzido_total: number;
  cap_total: number;
  cap_restante: number;
  demanda_media_mensal: number | null;
  meses_cobertura: number | null;
  data_eol: string | null;    // YYYY-MM-DD
  data_pedido: string | null; // YYYY-MM-DD
  risk_level?: string | null;
  seq_overlimit_count?: number | null;
  overrun_kg_total?: number | null;
  risk_prob?: number | null;
  demanda_effective?: number | null;
  demanda_is_estimada?: boolean;
};

type SeqRow = {
  matriz: string;
  seq: string | null;
  ativa: string | null;
  produzido_seq: number;
  cap_total_seq: number;
  cap_restante_seq: number;
  demanda_mensal_seq: number | null;
  meses_cobertura_seq: number | null;
  data_eol_seq: string | null;
  data_pedido_seq: string | null;
};

type SortKey =
  | 'matriz'
  | 'seq_ativas'
  | 'produzido_total'
  | 'cap_total'
  | 'cap_restante'
  | 'demanda_media_mensal'
  | 'meses_cobertura'
  | 'data_eol'
  | 'data_pedido';

type DistribMode = "igual" | "proporcional" | "manual" | "capacidade_risco" | "exaustao";

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

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function riskProbSeq(produzido: number, cap: number, meses?: number | null) {
  const over = Math.max(0, produzido - cap);
  const ratio = clamp01(over / cap);
  const k = 5;
  const logistic = 1 / (1 + Math.exp(-k * (ratio - 0.5)));
  const boost = meses != null && meses <= 0.5 ? 0.2 : meses != null && meses <= 1 ? 0.1 : 0;
  return clamp01(logistic + boost);
}

function addMonthsApprox(baseISO: string, months: number) {
  const dt = new Date(baseISO + 'T00:00:00');
  const intm = Math.max(0, Math.floor(months));
  dt.setMonth(dt.getMonth() + intm);
  const frac = Math.max(0, months - intm);
  if (frac > 0) dt.setDate(dt.getDate() + Math.round(frac * 30));
  return toISO(dt);
}

function normalizeMatrizCode(code: string | null | undefined): string {
  return (code ?? "").trim();
}

interface VidaProps {
  onOpenFerramentas?: (matriz: string) => void;
}

export function AnalysisVidaView({ onOpenFerramentas }: VidaProps) {
  const [matrizFilter, setMatrizFilter] = useState("");
  const [periodEnd, setPeriodEnd] = useState(() => toISO(new Date()));
  const [months, setMonths] = useState(6);
  const [leadTime, setLeadTime] = useState(25);
  const [rows, setRows] = useState<VidaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, SeqRow[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<Record<string, boolean>>({});
  const [errorDetail, setErrorDetail] = useState<Record<string, string | null>>({});
  const [modeByMatriz, setModeByMatriz] = useState<Record<string, DistribMode>>({});
  const [manualPerc, setManualPerc] = useState<Record<string, Record<string, number>>>({});
  const [lastPedidoCarteira, setLastPedidoCarteira] = useState<Record<string, string | null>>({});
  const [sortKey, setSortKey] = useState<SortKey>('data_pedido');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc('matrix_lifespan_summary', {
          period_end: periodEnd,
          months,
          lead_time_days: leadTime,
          matriz_filter: matrizFilter || null,
        });
        if (error) throw error;
        if (!active) return;
        const vidaRows = (data as VidaRow[]) ?? [];
        setRows(vidaRows);

        // Buscar última data de pedido a partir da VIEW agregada (analysis_carteira_last_implant)
        const ferramentas = Array.from(
          new Set(
            vidaRows
              .map((r) => normalizeMatrizCode(r.matriz).toUpperCase())
              .filter((m) => !!m)
          )
        );
        if (ferramentas.length) {
          try {
            const map: Record<string, string | null> = {};
            const batchSize = 200;
            for (let i = 0; i < ferramentas.length; i += batchSize) {
              if (!active) break;
              const batch = ferramentas.slice(i, i + batchSize);
              const { data: carteiraData, error: carteiraError } = await supabase
                .from('analysis_carteira_last_implant')
                .select('ferramenta_key,last_implant')
                .in('ferramenta_key', batch);
              if (carteiraError) throw carteiraError;
              (carteiraData ?? []).forEach((row: any) => {
                const key = String(row.ferramenta_key || '').toUpperCase();
                if (!key || map[key]) return;
                const iso = row.last_implant as string | null;
                map[key] = iso && iso.length >= 10 ? iso.slice(0, 10) : null;
              });
            }
            if (active) setLastPedidoCarteira(map);
          } catch {
            if (active) setLastPedidoCarteira({});
          }
        } else {
          setLastPedidoCarteira({});
        }
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? String(e));
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [periodEnd, months, leadTime, matrizFilter]);

  const finalRows = useMemo(() => {
    // Clamp meses/eol/pedido quando cap_restante <= 0
    const normalized = rows.map((r) => {
      const capRest = r.cap_restante ?? 0;
      const demandaRaw = r.demanda_media_mensal ?? 0;
      const demandaEffective = demandaRaw > 0 && demandaRaw < 300 ? 300 : demandaRaw; // mínimo 300 kg/mês quando houver valor muito baixo
      const isEstimada = demandaRaw > 0 && demandaRaw < 300;
      let meses = demandaEffective > 0 ? (capRest / demandaEffective) : null;
      let eol: string | null = null;
      let pedido: string | null = null;
      if (capRest <= 0) {
        meses = 0;
        // EOL = periodEnd; Pedido = EOL - leadTime
        eol = periodEnd;
        const dt = new Date(periodEnd + 'T00:00:00');
        dt.setDate(dt.getDate() - (leadTime || 0));
        pedido = toISO(dt);
      } else {
        if (meses != null && meses < 0) meses = 0;
        if (meses != null) {
          const dt = new Date(periodEnd + 'T00:00:00');
          dt.setMonth(dt.getMonth() + Math.max(0, Math.floor(meses)));
          const frac = Math.max(0, meses - Math.floor(meses));
          if (frac > 0) dt.setDate(dt.getDate() + Math.round(frac * 30));
          eol = toISO(dt);
          const dp = new Date(dt);
          dp.setDate(dp.getDate() - (leadTime || 0));
          pedido = toISO(dp);
        }
      }
      return { ...r, meses_cobertura: meses, data_eol: eol, data_pedido: pedido, demanda_effective: demandaEffective || null, demanda_is_estimada: isEstimada } as VidaRow;
    });

    const arr = normalized.slice();
    const k = sortKey;
    const dir = sortDir;
    const num = new Set<SortKey>(['seq_ativas','produzido_total','cap_total','cap_restante','demanda_media_mensal','meses_cobertura']);
    arr.sort((a, b) => {
      let va: any = (a as any)[k];
      let vb: any = (b as any)[k];
      if (k === 'demanda_media_mensal') { va = (a as any).demanda_effective ?? va; vb = (b as any).demanda_effective ?? vb; }
      if (num.has(k)) {
        const na = typeof va === 'number' ? va : (va == null ? (dir==='asc'? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : Number(va));
        const nb = typeof vb === 'number' ? vb : (vb == null ? (dir==='asc'? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : Number(vb));
        return dir==='asc' ? na - nb : nb - na;
      }
      // datas/strings
      const sa = (va ?? (dir==='asc' ? '9999-12-31' : '0001-01-01')) as string;
      const sb = (vb ?? (dir==='asc' ? '9999-12-31' : '0001-01-01')) as string;
      return dir==='asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return arr;
  }, [rows, periodEnd, leadTime, sortKey, sortDir]);

  function handleSort(k: SortKey) {
    setSortKey((prevK) => {
      if (prevK === k) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevK;
      }
      setSortDir('asc');
      return k;
    });
  }

  async function loadDetails(m: string) {
    setLoadingDetail((ld) => ({ ...ld, [m]: true }));
    setErrorDetail((ed) => ({ ...ed, [m]: null }));
    try {
      const { data, error } = await supabase.rpc('matrix_lifespan_by_sequence', {
        period_end: periodEnd,
        months,
        lead_time_days: leadTime,
        matriz_code: m,
      });
      if (error) throw error;
      setDetails((d) => ({ ...d, [m]: (data as SeqRow[]) ?? [] }));
    } catch (e: any) {
      setErrorDetail((ed) => ({ ...ed, [m]: e?.message ?? String(e) }));
      setDetails((d) => ({ ...d, [m]: [] }));
    } finally {
      setLoadingDetail((ld) => ({ ...ld, [m]: false }));
    }
  }

  async function toggleExpand(m: string) {
    const key = m;
    const isOpen = !!expanded[key];
    if (isOpen) {
      setExpanded((e) => ({ ...e, [key]: false }));
      return;
    }
    setExpanded((e) => ({ ...e, [key]: true }));
    await loadDetails(key);
  }

  useEffect(() => {
    const keys = Object.keys(expanded).filter((k) => expanded[k]);
    if (keys.length === 0) return;
    keys.forEach((k) => {
      loadDetails(k);
    });
  }, [periodEnd, months, leadTime]);

  function exportCSV(matriz: string, arr: SeqRow[], demandaTotal: number, mode: DistribMode) {
    const effectiveMode: "igual" | "proporcional" | "manual" =
      mode === "proporcional" || mode === "manual" ? mode : "igual";
    const n = arr.length || 1;
    const mp = manualPerc[matriz] || {};
    const sumProd = arr.reduce((s, it) => s + (it.produzido_seq || 0), 0) || 0;
    const sumPct = arr.reduce((s, it, idx) => s + (mp[`${matriz}::${it.seq || idx}`] ?? (100 / n)), 0) || 100;

    const lines: string[] = [];
    lines.push(["Matriz","Seq","Ativa","Produzido (kg)","Cap. Total (kg)","Restante (kg)","Demanda m/mês (kg)","Meses cobertura","Data EOL","Data Pedido"].join(";"));
    arr.forEach((d, i) => {
      let weight = 1 / n;
      if (effectiveMode === "proporcional") {
        weight = sumProd > 0 ? (d.produzido_seq || 0) / sumProd : 1 / n;
      } else if (effectiveMode === "manual") {
        const key = `${matriz}::${d.seq || i}`;
        const val = mp[key] ?? (100 / n);
        weight = sumPct > 0 ? (val / sumPct) : (1 / n);
      }
      const demanda = demandaTotal * weight;
      const meses = demanda > 0 ? (d.cap_restante_seq || 0) / demanda : 0;
      const eol = (() => {
        if (!(demanda > 0)) return "";
        const dt = new Date(periodEnd + 'T00:00:00');
        const intm = Math.max(0, Math.floor(meses));
        dt.setMonth(dt.getMonth() + intm);
        const frac = Math.max(0, meses - intm);
        if (frac > 0) dt.setDate(dt.getDate() + Math.round(frac * 30));
        return formatDateBR(toISO(dt));
      })();
      const pedido = (() => {
        if (!eol) return "";
        const [d,m,y] = eol.split('/');
        const dt = new Date(`${y}-${m}-${d}T00:00:00`);
        dt.setDate(dt.getDate() - (leadTime || 0));
        return formatDateBR(toISO(dt));
      })();
      const row = [
        matriz,
        d.seq || "",
        d.ativa || "",
        String(d.produzido_seq).replace('.', ','),
        String(d.cap_total_seq).replace('.', ','),
        String(d.cap_restante_seq).replace('.', ','),
        String(demanda.toFixed(2)).replace('.', ','),
        String(meses.toFixed(2)).replace('.', ','),
        eol,
        pedido,
      ];
      lines.push(row.join(';'));
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    const d = new Date(periodEnd + 'T00:00:00');
    const name = `Vida-${matriz}-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.csv`;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Até (data de corte)</label>
          <input
            type="date"
            className="h-9 w-40 rounded-md border bg-background px-3 text-sm"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            title="Data de corte: considera registros até esta data, inclusive"
            aria-label="Data de corte: considera registros até esta data, inclusive"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Período analisado (meses)</label>
          <select
            className="h-9 w-28 rounded-md border bg-background px-3 text-sm"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            title="Quantidade de meses considerados retroativamente a partir da data de corte"
            aria-label="Período analisado em meses a partir da data de corte"
          >
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
          <label className="text-xs text-muted-foreground">Matriz</label>
          <Input className="h-9 w-48" placeholder="Ex.: TR-0100" value={matrizFilter} onChange={(e) => setMatrizFilter(e.target.value)} />
        </div>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {error && <div className="text-sm text-red-600">Erro: {error}</div>}
      {!loading && !error && (
        <>
          {/* KPIs Estratégicos */}
          {(() => {
            const criticas = finalRows.filter(r => r.cap_restante <= 0 || (r.meses_cobertura != null && r.meses_cobertura <= 1)).length;
            const atencao = finalRows.filter(r => r.meses_cobertura != null && r.meses_cobertura > 1 && r.meses_cobertura <= 3).length;
            const saudaveis = finalRows.length - criticas - atencao;
            const capRestanteTotal = finalRows.reduce((s, r) => s + (r.cap_restante || 0), 0);
            const capTotalGeral = finalRows.reduce((s, r) => s + (r.cap_total || 0), 0);
            const utilizacaoMedia = capTotalGeral > 0 ? ((capTotalGeral - capRestanteTotal) / capTotalGeral * 100) : 0;
            const eol30dias = finalRows.filter(r => {
              if (!r.data_eol) return false;
              const eolDate = new Date(r.data_eol + 'T00:00:00');
              const hoje = new Date(periodEnd + 'T00:00:00');
              const diff = (eolDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
              return diff >= 0 && diff <= 30;
            }).length;
            const eol60dias = finalRows.filter(r => {
              if (!r.data_eol) return false;
              const eolDate = new Date(r.data_eol + 'T00:00:00');
              const hoje = new Date(periodEnd + 'T00:00:00');
              const diff = (eolDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
              return diff > 30 && diff <= 60;
            }).length;
            const seqAtivas = finalRows.reduce((s, r) => s + (r.seq_ativas || 0), 0);

            // Insights automáticos
            const insights: Array<{tipo: 'critico' | 'alerta' | 'info' | 'sucesso', msg: string, icon: any}> = [];
            if (criticas > 0) {
              insights.push({ tipo: 'critico', msg: `${criticas} matriz(es) em estado CRÍTICO requer(em) ação imediata`, icon: AlertTriangle });
            }
            if (eol30dias > 0) {
              insights.push({ tipo: 'alerta', msg: `${eol30dias} matriz(es) atingirá(ão) fim de vida nos próximos 30 dias`, icon: Clock });
            }
            if (utilizacaoMedia > 80) {
              insights.push({ tipo: 'alerta', msg: `Utilização média do parque em ${utilizacaoMedia.toFixed(0)}% — considere ampliar capacidade`, icon: TrendingDown });
            }
            if (atencao > 0 && criticas === 0) {
              insights.push({ tipo: 'info', msg: `${atencao} matriz(es) em atenção — monitorar nas próximas semanas`, icon: Info });
            }
            if (saudaveis === finalRows.length && finalRows.length > 0) {
              insights.push({ tipo: 'sucesso', msg: `Todas as ${finalRows.length} matrizes estão com cobertura saudável`, icon: CheckCircle2 });
            }

            return (
              <div className="mb-4 space-y-4">
                {/* Cards de KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-red-50 to-red-100/50 p-3 shadow-sm cursor-help"
                    title="🔴 CRÍTICAS — Matrizes em estado crítico que requerem ação imediata.&#10;&#10;📊 Como é calculado:&#10;Conta as matrizes onde:&#10;• Capacidade restante ≤ 0 kg, OU&#10;• Meses de cobertura ≤ 1 mês&#10;&#10;⚠️ O que significa:&#10;Essas matrizes podem não atender a demanda atual. É necessário confeccionar novas sequências ou solicitar reposição urgente."
                  >
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs font-medium">Críticas</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-red-700">{criticas}</div>
                    <div className="text-[10px] text-red-600/70">Cobertura ≤ 1 mês</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-amber-50 to-amber-100/50 p-3 shadow-sm cursor-help"
                    title="🟡 EM ATENÇÃO — Matrizes que precisam de monitoramento.&#10;&#10;📊 Como é calculado:&#10;Conta as matrizes onde:&#10;• Meses de cobertura entre 1 e 3 meses&#10;&#10;⚠️ O que significa:&#10;Essas matrizes ainda atendem a demanda, mas em breve podem se tornar críticas. Planeje a reposição nas próximas semanas."
                  >
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">Em Atenção</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-amber-700">{atencao}</div>
                    <div className="text-[10px] text-amber-600/70">Cobertura 1-3 meses</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-3 shadow-sm cursor-help"
                    title="🟢 SAUDÁVEIS — Matrizes com capacidade adequada.&#10;&#10;📊 Como é calculado:&#10;Conta as matrizes onde:&#10;• Meses de cobertura > 3 meses&#10;&#10;✅ O que significa:&#10;Essas matrizes têm capacidade suficiente para atender a demanda por mais de 3 meses. Não requerem ação imediata."
                  >
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Saudáveis</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-emerald-700">{saudaveis}</div>
                    <div className="text-[10px] text-emerald-600/70">Cobertura &gt; 3 meses</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-blue-50 to-blue-100/50 p-3 shadow-sm cursor-help"
                    title="⏰ EOL 30 DIAS — End of Life (Fim de Vida) nos próximos 30 dias.&#10;&#10;📊 Como é calculado:&#10;Conta as matrizes onde:&#10;• Data EOL está entre hoje e 30 dias à frente&#10;&#10;📅 Data EOL = Data atual + (Capacidade Restante ÷ Demanda Mensal)&#10;&#10;⚠️ O que significa:&#10;Essas matrizes atingirão capacidade zero em até 30 dias se a demanda continuar no ritmo atual. Ação urgente necessária!"
                  >
                    <div className="flex items-center gap-2 text-blue-700">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-medium">EOL 30 dias</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-blue-700">{eol30dias}</div>
                    <div className="text-[10px] text-blue-600/70">Fim de vida iminente</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-purple-50 to-purple-100/50 p-3 shadow-sm cursor-help"
                    title="🏭 SEQUÊNCIAS ATIVAS — Total de sequências em operação.&#10;&#10;📊 Como é calculado:&#10;Soma todas as sequências marcadas como 'Ativa' em todas as matrizes do período filtrado.&#10;&#10;ℹ️ O que significa:&#10;Representa o parque total de ferramentas disponíveis para produção. Quanto mais sequências ativas, maior a capacidade produtiva."
                  >
                    <div className="flex items-center gap-2 text-purple-700">
                      <Factory className="h-4 w-4" />
                      <span className="text-xs font-medium">Seq. Ativas</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-purple-700">{seqAtivas}</div>
                    <div className="text-[10px] text-purple-600/70">Total no parque</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-slate-50 to-slate-100/50 p-3 shadow-sm cursor-help"
                    title={`📊 UTILIZAÇÃO — Percentual de capacidade já consumida.&#10;&#10;📊 Como é calculado:&#10;Utilização = (Cap. Total - Cap. Restante) ÷ Cap. Total × 100&#10;&#10;Valores atuais:&#10;• Cap. Total: ${formatNumberBR(capTotalGeral)} kg&#10;• Cap. Restante: ${formatNumberBR(capRestanteTotal)} kg&#10;• Consumido: ${formatNumberBR(capTotalGeral - capRestanteTotal)} kg&#10;&#10;ℹ️ O que significa:&#10;• < 50%: Parque com folga&#10;• 50-80%: Utilização saudável&#10;• > 80%: Considere ampliar capacidade`}
                  >
                    <div className="flex items-center gap-2 text-slate-700">
                      <Target className="h-4 w-4" />
                      <span className="text-xs font-medium">Utilização</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-slate-700">{utilizacaoMedia.toFixed(0)}%</div>
                    <div className="text-[10px] text-slate-600/70">Capacidade consumida</div>
                  </div>
                </div>

                {/* Insights Automáticos */}
                {insights.length > 0 && (
                  <div className="rounded-lg border bg-white/50 p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-semibold text-gray-700">Insights Automáticos</span>
                    </div>
                    <div className="space-y-1.5">
                      {insights.map((ins, idx) => {
                        const Icon = ins.icon;
                        const colors = {
                          critico: 'bg-red-50 border-red-200 text-red-800',
                          alerta: 'bg-amber-50 border-amber-200 text-amber-800',
                          info: 'bg-blue-50 border-blue-200 text-blue-800',
                          sucesso: 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        };
                        return (
                          <div key={idx} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${colors[ins.tipo]}`}>
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span>{ins.msg}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {/* ANÁLISES ESTRATÉGICAS AVANÇADAS */}
                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {(() => {
                  // 1. Calcular Score de Risco Composto para cada matriz
                  const matrizesComScore = finalRows.map(r => {
                    const demanda = r.demanda_media_mensal || 0;
                    const cobertura = r.meses_cobertura ?? 0;
                    const desgaste = r.cap_total > 0 ? ((r.cap_total - r.cap_restante) / r.cap_total) : 0;
                    const seqUnica = r.seq_ativas === 1;
                    
                    // Score composto: quanto maior, mais crítico (0-100)
                    let score = 0;
                    
                    // Fator 1: Cobertura (peso 40) - quanto menor, pior
                    if (cobertura <= 0) score += 40;
                    else if (cobertura <= 1) score += 35;
                    else if (cobertura <= 2) score += 25;
                    else if (cobertura <= 3) score += 15;
                    else if (cobertura <= 6) score += 5;
                    
                    // Fator 2: Desgaste (peso 25) - quanto maior, pior
                    score += Math.min(25, desgaste * 25);
                    
                    // Fator 3: Demanda alta (peso 20) - matrizes mais demandadas são mais críticas
                    const demandaNormalizada = Math.min(1, demanda / 5000); // 5000 kg/mês = máximo
                    score += demandaNormalizada * 20;
                    
                    // Fator 4: Single Point of Failure (peso 15) - apenas 1 seq ativa
                    if (seqUnica && demanda > 0) score += 15;
                    
                    // Fator 5: Capacidade esgotada (bônus crítico)
                    if (r.cap_restante <= 0) score += 10;
                    
                    return {
                      ...r,
                      scoreRisco: Math.min(100, Math.round(score)),
                      desgastePerc: desgaste * 100,
                      singlePointOfFailure: seqUnica && demanda > 0,
                      diasParaEOL: r.data_eol ? Math.round((new Date(r.data_eol + 'T00:00:00').getTime() - new Date(periodEnd + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)) : null
                    };
                  });

                  // Top 10 mais críticas ordenadas por score
                  const top10Criticas = [...matrizesComScore]
                    .sort((a, b) => b.scoreRisco - a.scoreRisco)
                    .slice(0, 10);

                  // Single Point of Failure - matrizes com apenas 1 seq ativa e demanda
                  const singlePointFailures = matrizesComScore.filter(m => m.singlePointOfFailure);

                  // Matrizes com consumo acelerado (desgaste > 80%)
                  const consumoAcelerado = matrizesComScore.filter(m => m.desgastePerc >= 80);

                  // Previsão de gargalos - EOL nos próximos 30/60/90 dias
                  const gargalos30d = matrizesComScore.filter(m => m.diasParaEOL !== null && m.diasParaEOL >= 0 && m.diasParaEOL <= 30);
                  const gargalos60d = matrizesComScore.filter(m => m.diasParaEOL !== null && m.diasParaEOL > 30 && m.diasParaEOL <= 60);
                  const gargalos90d = matrizesComScore.filter(m => m.diasParaEOL !== null && m.diasParaEOL > 60 && m.diasParaEOL <= 90);

                  // Capacidade restante por faixa de risco
                  const capCritica = matrizesComScore.filter(m => m.scoreRisco >= 70).reduce((s, m) => s + (m.cap_restante || 0), 0);
                  const capAtencao = matrizesComScore.filter(m => m.scoreRisco >= 40 && m.scoreRisco < 70).reduce((s, m) => s + (m.cap_restante || 0), 0);
                  const capSaudavel = matrizesComScore.filter(m => m.scoreRisco < 40).reduce((s, m) => s + (m.cap_restante || 0), 0);

                  return (
                    <div className="space-y-4">
                      {/* Título da seção */}
                      <div className="flex items-center gap-2 pt-2">
                        <Activity className="h-5 w-5 text-indigo-600" />
                        <h3 className="text-sm font-bold text-gray-800">Análises Estratégicas Avançadas</h3>
                      </div>

                      {/* Grid de análises */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* SALA DE GUERRA - Top 10 Críticas */}
                        <div 
                          className="rounded-lg border border-red-200 bg-gradient-to-br from-red-50/80 to-orange-50/50 p-4 shadow-sm cursor-help"
                          title="🚨 SALA DE GUERRA — Ranking das 10 matrizes mais críticas.&#10;&#10;📊 Como funciona:&#10;Cada matriz recebe um SCORE DE RISCO (0-100) calculado assim:&#10;&#10;• Cobertura (peso 40%):&#10;  - 0 meses = 40 pts&#10;  - ≤1 mês = 35 pts&#10;  - ≤2 meses = 25 pts&#10;  - ≤3 meses = 15 pts&#10;  - ≤6 meses = 5 pts&#10;&#10;• Desgaste (peso 25%):&#10;  - % da capacidade já consumida × 25&#10;&#10;• Demanda (peso 20%):&#10;  - Demanda mensal normalizada (5.000 kg = máx)&#10;&#10;• Single Seq (peso 15%):&#10;  - +15 pts se tiver apenas 1 sequência&#10;&#10;🎯 Interpretação do Score:&#10;• ≥70: 🔴 CRÍTICO — Ação imediata&#10;• 40-69: 🟡 ATENÇÃO — Planejar&#10;• <40: 🟢 OK — Monitorar"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <Skull className="h-4 w-4 text-red-600" />
                            <span className="text-sm font-bold text-red-800">🚨 Sala de Guerra — Top 10 Críticas</span>
                          </div>
                          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                            {top10Criticas.length === 0 ? (
                              <div className="text-xs text-gray-500 italic">Nenhuma matriz crítica identificada</div>
                            ) : (
                              top10Criticas.map((m, i) => (
                                <div key={m.matriz} className="flex items-center gap-2 bg-white/70 rounded px-2 py-1.5 border border-red-100">
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i < 3 ? 'bg-red-600 text-white' : 'bg-red-200 text-red-800'}`}>
                                    {i + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-gray-800 truncate">{m.matriz}</div>
                                    <div className="text-[10px] text-gray-500">
                                      {m.seq_ativas} seq • {formatNumberBR(m.cap_restante)} kg rest. • {m.meses_cobertura?.toFixed(1) || '0'} meses
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                      m.scoreRisco >= 70 ? 'bg-red-600 text-white' :
                                      m.scoreRisco >= 40 ? 'bg-amber-500 text-white' :
                                      'bg-emerald-500 text-white'
                                    }`}>
                                      {m.scoreRisco}
                                    </span>
                                    <span className="text-[9px] text-gray-400">score</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="mt-2 pt-2 border-t border-red-200 text-[10px] text-red-700">
                            Score = Cobertura (40%) + Desgaste (25%) + Demanda (20%) + Single Seq (15%)
                          </div>
                        </div>

                        {/* PREVISÃO DE GARGALOS */}
                        <div 
                          className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50/80 to-yellow-50/50 p-4 shadow-sm cursor-help"
                          title="📉 PREVISÃO DE GARGALOS — Matrizes que atingirão fim de vida (EOL).&#10;&#10;📊 Como é calculado:&#10;Para cada matriz, calcula-se a Data EOL:&#10;Data EOL = Data Atual + (Cap. Restante ÷ Demanda Mensal)&#10;&#10;Depois, conta-se quantas matrizes têm EOL em cada faixa:&#10;&#10;🔴 Próx. 30 dias (URGENTE):&#10;Matrizes que esgotarão em até 1 mês.&#10;Ação: Confeccionar nova sequência AGORA.&#10;&#10;🟡 30-60 dias (ATENÇÃO):&#10;Matrizes que esgotarão em 1-2 meses.&#10;Ação: Solicitar reposição nas próximas semanas.&#10;&#10;🔵 60-90 dias (PLANEJAR):&#10;Matrizes que esgotarão em 2-3 meses.&#10;Ação: Incluir no planejamento de compras."
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingDown className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-bold text-amber-800">📉 Previsão de Gargalos</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div 
                              className="text-center p-2 bg-red-100/60 rounded-lg border border-red-200 cursor-help"
                              title="🔴 URGENTE — Matrizes que atingirão EOL nos próximos 30 dias.&#10;&#10;Essas matrizes precisam de ação IMEDIATA para evitar ruptura no atendimento aos pedidos."
                            >
                              <div className="text-2xl font-bold text-red-700">{gargalos30d.length}</div>
                              <div className="text-[10px] text-red-600 font-medium">Próx. 30 dias</div>
                              <div className="text-[9px] text-red-500 mt-1">URGENTE</div>
                            </div>
                            <div 
                              className="text-center p-2 bg-amber-100/60 rounded-lg border border-amber-200 cursor-help"
                              title="🟡 ATENÇÃO — Matrizes que atingirão EOL entre 30 e 60 dias.&#10;&#10;Planeje a reposição nas próximas semanas para evitar que se tornem urgentes."
                            >
                              <div className="text-2xl font-bold text-amber-700">{gargalos60d.length}</div>
                              <div className="text-[10px] text-amber-600 font-medium">30-60 dias</div>
                              <div className="text-[9px] text-amber-500 mt-1">ATENÇÃO</div>
                            </div>
                            <div 
                              className="text-center p-2 bg-blue-100/60 rounded-lg border border-blue-200 cursor-help"
                              title="🔵 PLANEJAR — Matrizes que atingirão EOL entre 60 e 90 dias.&#10;&#10;Inclua no planejamento de compras e confecção para os próximos meses."
                            >
                              <div className="text-2xl font-bold text-blue-700">{gargalos90d.length}</div>
                              <div className="text-[10px] text-blue-600 font-medium">60-90 dias</div>
                              <div className="text-[9px] text-blue-500 mt-1">PLANEJAR</div>
                            </div>
                          </div>
                          {gargalos30d.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-amber-200">
                              <div className="text-[10px] font-medium text-amber-800 mb-1">Matrizes críticas (30d):</div>
                              <div className="text-[10px] text-amber-700 line-clamp-2">
                                {gargalos30d.slice(0, 5).map(m => m.matriz).join(', ')}
                                {gargalos30d.length > 5 && ` +${gargalos30d.length - 5} mais`}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* SINGLE POINT OF FAILURE */}
                        <div 
                          className="rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50/80 to-fuchsia-50/50 p-4 shadow-sm cursor-help"
                          title="⚠️ SINGLE POINT OF FAILURE — Matrizes vulneráveis sem redundância.&#10;&#10;📊 Como é calculado:&#10;Identifica matrizes onde:&#10;• Existe apenas 1 sequência ativa, E&#10;• A demanda mensal é maior que zero&#10;&#10;🔴 Por que isso é um risco:&#10;Se essa única sequência apresentar problemas (quebra, desgaste excessivo, necessidade de manutenção), não há backup disponível para continuar a produção.&#10;&#10;✅ Recomendação:&#10;Para matrizes com alta demanda e apenas 1 sequência, considere solicitar a confecção de uma segunda sequência para criar redundância e evitar paradas na produção."
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <ShieldAlert className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-bold text-purple-800">⚠️ Single Point of Failure</span>
                          </div>
                          <div className="flex items-center gap-4 mb-3">
                            <div className="text-center">
                              <div className="text-3xl font-bold text-purple-700">{singlePointFailures.length}</div>
                              <div className="text-[10px] text-purple-600">Matrizes vulneráveis</div>
                            </div>
                            <div className="flex-1 text-xs text-purple-700 bg-purple-100/50 rounded p-2">
                              Matrizes com <strong>apenas 1 sequência ativa</strong> atendendo demanda. 
                              Se falhar, não há backup.
                            </div>
                          </div>
                          {singlePointFailures.length > 0 && (
                            <div className="space-y-1 max-h-[80px] overflow-y-auto">
                              {singlePointFailures.slice(0, 5).map(m => (
                                <div key={m.matriz} className="flex justify-between items-center text-[10px] bg-white/60 rounded px-2 py-1 border border-purple-100">
                                  <span className="font-medium text-purple-800">{m.matriz}</span>
                                  <span className="text-purple-600">{formatNumberBR(m.demanda_media_mensal)} kg/mês</span>
                                </div>
                              ))}
                              {singlePointFailures.length > 5 && (
                                <div className="text-[10px] text-purple-500 text-center">+{singlePointFailures.length - 5} mais</div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* DISTRIBUIÇÃO DE CAPACIDADE */}
                        <div 
                          className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50/80 to-gray-50/50 p-4 shadow-sm cursor-help"
                          title="📊 DISTRIBUIÇÃO DE CAPACIDADE — Visão geral do parque por faixa de risco.&#10;&#10;📊 Como é calculado:&#10;A capacidade restante total é dividida em 3 categorias baseadas no Score de Risco:&#10;&#10;🔴 Crítico (Score ≥ 70):&#10;Capacidade restante de matrizes em estado crítico.&#10;Risco alto de ruptura.&#10;&#10;🟡 Atenção (Score 40-69):&#10;Capacidade restante de matrizes que precisam de monitoramento.&#10;Planejar reposição.&#10;&#10;🟢 Saudável (Score < 40):&#10;Capacidade restante de matrizes em bom estado.&#10;Sem ação imediata necessária.&#10;&#10;📈 Consumo Acelerado:&#10;Matrizes com desgaste > 80% da capacidade total.&#10;Podem precisar de avaliação física."
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <BarChart3 className="h-4 w-4 text-slate-600" />
                            <span className="text-sm font-bold text-slate-800">📊 Distribuição de Capacidade</span>
                          </div>
                          <div className="space-y-2">
                            {/* Barra de capacidade por risco */}
                            <div className="h-6 w-full rounded-full overflow-hidden flex bg-gray-200">
                              {capRestanteTotal > 0 && (
                                <>
                                  <div 
                                    className="bg-red-500 h-full transition-all" 
                                    style={{ width: `${(capCritica / capRestanteTotal) * 100}%` }}
                                    title={`Crítico: ${formatNumberBR(capCritica)} kg`}
                                  />
                                  <div 
                                    className="bg-amber-400 h-full transition-all" 
                                    style={{ width: `${(capAtencao / capRestanteTotal) * 100}%` }}
                                    title={`Atenção: ${formatNumberBR(capAtencao)} kg`}
                                  />
                                  <div 
                                    className="bg-emerald-500 h-full transition-all" 
                                    style={{ width: `${(capSaudavel / capRestanteTotal) * 100}%` }}
                                    title={`Saudável: ${formatNumberBR(capSaudavel)} kg`}
                                  />
                                </>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-gray-600">Crítico:</span>
                                <span className="font-medium">{formatNumberBR(capCritica)} kg</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                                <span className="text-gray-600">Atenção:</span>
                                <span className="font-medium">{formatNumberBR(capAtencao)} kg</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-gray-600">Saudável:</span>
                                <span className="font-medium">{formatNumberBR(capSaudavel)} kg</span>
                              </div>
                            </div>
                            <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-600">
                              <strong>Consumo acelerado (&gt;80% desgaste):</strong> {consumoAcelerado.length} matrizes
                              {consumoAcelerado.length > 0 && (
                                <span className="text-slate-500 ml-1">
                                  ({consumoAcelerado.slice(0, 3).map(m => m.matriz).join(', ')}{consumoAcelerado.length > 3 && '...'})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Ações Recomendadas Detalhadas */}
                      {(top10Criticas.filter(m => m.scoreRisco >= 70).length > 0 || singlePointFailures.length > 0 || gargalos30d.length > 0) && (
                        <div className="rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <ArrowUpRight className="h-4 w-4 text-indigo-600" />
                            <span className="text-sm font-bold text-indigo-800">🎯 Plano de Ação Recomendado</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {gargalos30d.length > 0 && (
                              <div className="bg-white/60 rounded-lg p-3 border border-red-200">
                                <div className="flex items-center gap-2 text-red-700 font-medium text-xs mb-1">
                                  <Skull className="h-3.5 w-3.5" />
                                  URGENTE - Confeccionar Agora
                                </div>
                                <div className="text-[10px] text-gray-600 mb-2">
                                  {gargalos30d.length} matrizes atingirão EOL em até 30 dias
                                </div>
                                <div className="text-[10px] text-red-600 font-medium">
                                  {gargalos30d.slice(0, 3).map(m => m.matriz).join(', ')}
                                </div>
                              </div>
                            )}
                            {singlePointFailures.filter(m => m.scoreRisco >= 50).length > 0 && (
                              <div className="bg-white/60 rounded-lg p-3 border border-purple-200">
                                <div className="flex items-center gap-2 text-purple-700 font-medium text-xs mb-1">
                                  <Layers className="h-3.5 w-3.5" />
                                  Criar Redundância
                                </div>
                                <div className="text-[10px] text-gray-600 mb-2">
                                  {singlePointFailures.filter(m => m.scoreRisco >= 50).length} matrizes críticas sem backup
                                </div>
                                <div className="text-[10px] text-purple-600 font-medium">
                                  Solicitar nova sequência para eliminar vulnerabilidade
                                </div>
                              </div>
                            )}
                            {consumoAcelerado.length > 0 && (
                              <div className="bg-white/60 rounded-lg p-3 border border-amber-200">
                                <div className="flex items-center gap-2 text-amber-700 font-medium text-xs mb-1">
                                  <TrendingUp className="h-3.5 w-3.5" />
                                  Avaliar Condição Física
                                </div>
                                <div className="text-[10px] text-gray-600 mb-2">
                                  {consumoAcelerado.length} matrizes com desgaste &gt;80%
                                </div>
                                <div className="text-[10px] text-amber-600 font-medium">
                                  Inspecionar e planejar substituição preventiva
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

        <div className="overflow-auto">
          <table className="w-full table-auto border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-left w-[220px] cursor-pointer select-none" onClick={() => handleSort('matriz')}>
                  Matriz {sortKey==='matriz' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[90px] cursor-pointer select-none" onClick={() => handleSort('seq_ativas')}>
                  Seq Ativas {sortKey==='seq_ativas' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-center w-[80px]">Risco</th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[130px]">
                  Último Pedido (Carteira)
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[120px] cursor-pointer select-none" onClick={() => handleSort('produzido_total')}>
                  Produzido (kg) {sortKey==='produzido_total' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[120px] cursor-pointer select-none" onClick={() => handleSort('cap_total')}>
                  Cap. Total (kg) {sortKey==='cap_total' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[120px] cursor-pointer select-none" onClick={() => handleSort('cap_restante')}>
                  Restante (kg) {sortKey==='cap_restante' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[140px] cursor-pointer select-none" onClick={() => handleSort('demanda_media_mensal')}>
                  Demanda m/mês (kg) {sortKey==='demanda_media_mensal' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[120px] cursor-pointer select-none" onClick={() => handleSort('meses_cobertura')}>
                  Meses cobertura {sortKey==='meses_cobertura' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[110px] cursor-pointer select-none" onClick={() => handleSort('data_eol')}>
                  Data EOL {sortKey==='data_eol' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
                <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[130px] cursor-pointer select-none" onClick={() => handleSort('data_pedido')}>
                  Data Pedido {sortKey==='data_pedido' ? (sortDir==='asc'?'▲':'▼') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {finalRows.map((r) => (
                <>
                  <tr key={r.matriz} className="hover:bg-muted/40 border-b">
                    {/* Matriz + botão */}
                    <td className="px-2 py-1.5 text-left whitespace-nowrap">
                      <button type="button" className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] shrink-0" onClick={() => toggleExpand(r.matriz)}>
                        {expanded[r.matriz] ? "▾" : "▸"}
                      </button>
                      <span className="align-middle">{r.matriz}</span>
                      {onOpenFerramentas && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="ml-2 h-7 px-2.5 rounded-full gap-1.5 text-[11px]"
                          onClick={() => onOpenFerramentas(r.matriz)}
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          Abrir Ferramentas
                        </Button>
                      )}
                    </td>
                    {/* Seq Ativas */}
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.seq_ativas}</td>
                    {/* Risco */}
                    <td className="px-2 py-1.5 text-center">
                      {(() => {
                        const lvl = (r.risk_level || '').toLowerCase();
                        let level: 'ok'|'atencao'|'critico' = 'ok';
                        if (r.cap_restante <= 0 || (r.seq_overlimit_count || 0) > 0) level = 'critico';
                        else if (r.meses_cobertura != null && r.meses_cobertura <= 1) level = 'atencao';
                        else if (lvl === 'crítico' || lvl === 'critico') level = 'critico';
                        else if (lvl === 'atenção' || lvl === 'atencao') level = 'atencao';
                        const cls = level==='critico' ? 'bg-red-600/15 text-red-700 border-red-600/40' : level==='atencao' ? 'bg-amber-500/15 text-amber-700 border-amber-500/40' : 'bg-emerald-600/10 text-emerald-700 border-emerald-600/30';
                        const label = level==='critico' ? 'Crítico' : level==='atencao' ? 'Atenção' : 'OK';
                        const tooltip = (() => {
                          if (r.cap_restante > 0 || !(r.demanda_media_mensal && r.demanda_media_mensal > 0)) return '';
                          const bonusCap = (r.seq_ativas || 0) * 30000; // hipótese +30t por sequência
                          const monthsExtra = bonusCap / r.demanda_media_mensal;
                          const eolExtra = addMonthsApprox(periodEnd, monthsExtra);
                          return `Faixa EOL: Hoje — ${formatDateBR(eolExtra)} (hipótese +30t/seq)`;
                        })();
                        return <span title={tooltip} className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] ${cls}`}>{label}</span>;
                      })()}
                    </td>
                    {/* Último Pedido (Carteira) */}
                    <td className="px-2 py-1.5 text-right text-xs">
                      {(() => {
                        const key = normalizeMatrizCode(r.matriz).toUpperCase();
                        const last = lastPedidoCarteira[key];
                        if (last) return formatDateBR(last);
                        return <span className="text-muted-foreground" title="Data do último pedido é anterior ao período carregado na Carteira ou não foi encontrada.">Anterior ao período da Carteira</span>;
                      })()}
                    </td>
                    {/* Produzido / Capacidade / Demanda / Meses / Datas calculadas */}
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR(r.produzido_total)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR(r.cap_total)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR(r.cap_restante)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatNumberBR((r.demanda_effective ?? r.demanda_media_mensal) || 0)}
                      {r.demanda_is_estimada && (
                        <span className="ml-2 inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">Estimado</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumberBR(r.meses_cobertura ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatDateBR(r.data_eol)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatDateBR(r.data_pedido)}</td>
                  </tr>
                  {expanded[r.matriz] && (
                    <tr>
                      <td className="px-2 py-2" colSpan={11}>
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Distribuição</span>
                          <select
                            className="h-7 rounded border bg-background px-2"
                            value={modeByMatriz[r.matriz] || "igual"}
                            onChange={(e) => setModeByMatriz((m) => ({ ...m, [r.matriz]: e.target.value as DistribMode }))}
                          >
                            <option value="igual">Igual entre sequências</option>
                            <option value="proporcional">Proporcional à Qte.Prod.</option>
                            <option value="manual">Manual (%)</option>
                            <option value="capacidade_risco">Capacidade + Risco (30t/39t)</option>
                            <option value="exaustao">Exaustão por Restante</option>
                          </select>
                          <button
                            type="button"
                            className="ml-auto inline-flex h-7 items-center rounded border px-2"
                            onClick={() => exportCSV(r.matriz, details[r.matriz] ?? [], (r as any).demanda_effective ?? (r.demanda_media_mensal || 0), modeByMatriz[r.matriz] || "igual")}
                          >
                            Exportar Excel
                          </button>
                        </div>
                        {loadingDetail[r.matriz] && (
                          <div className="text-xs text-muted-foreground">Carregando sequências…</div>
                        )}
                        {errorDetail[r.matriz] && (
                          <div className="text-xs text-red-600">Erro: {errorDetail[r.matriz]}</div>
                        )}
                        {!loadingDetail[r.matriz] && !errorDetail[r.matriz] && (
                          <table className="w-full table-auto border-collapse text-xs">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left px-2 py-1">Seq</th>
                                <th className="text-center px-2 py-1">Ativa</th>
                                <th className="text-center px-2 py-1">Risco</th>
                                <th className="text-right px-2 py-1">Produzido (kg)</th>
                                <th className="text-right px-2 py-1">Cap. Total (kg)</th>
                                <th className="text-right px-2 py-1">Restante (kg)</th>
                                <th className="text-right px-2 py-1">Demanda m/mês (kg)</th>
                                { (modeByMatriz[r.matriz] || "igual") === "manual" && (
                                  <th className="text-right px-2 py-1">% Manual</th>
                                )}
                                <th className="text-right px-2 py-1">Meses cobertura</th>
                                <th className="text-right px-2 py-1">Data EOL</th>
                                <th className="text-right px-2 py-1">Data Pedido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const arr = details[r.matriz] ?? [];
                                const mode = modeByMatriz[r.matriz] || "igual";
                                const demandTotal = (r as any).demanda_effective ?? (r.demanda_media_mensal || 0);
                                const n = arr.length || 1;
                                const mp = manualPerc[r.matriz] || {};
                                const sumProd = arr.reduce((s, it) => s + (it.produzido_seq || 0), 0) || 0;
                                const sumPct = arr.reduce((s, it, idx) => s + (mp[`${r.matriz}::${it.seq || idx}`] ?? (100 / n)), 0) || 100;
                                let remainingDemand = demandTotal;

                                return arr.map((d, i) => {
                                  const key = `${r.matriz}::${d.seq || i}`;
                                  let demanda = 0;
                                  let meses: number | null = null;
                                  let normalCap = 0;
                                  let riskCap = 0;

                                  if (mode === "capacidade_risco") {
                                    const produced = d.produzido_seq || 0;
                                    const theoreticalCap = 30000;
                                    const extendedCap = 39000;
                                    if (remainingDemand > 0 && produced < extendedCap) {
                                      const usedNormalAlready = Math.min(produced, theoreticalCap);
                                      const availableNormal = Math.max(0, theoreticalCap - usedNormalAlready);
                                      const usedNormal = Math.min(remainingDemand, availableNormal);
                                      remainingDemand -= usedNormal;

                                      const usedRiskAlready = Math.max(0, produced - theoreticalCap);
                                      const availableRisk = Math.max(0, extendedCap - theoreticalCap - usedRiskAlready);
                                      const usedRisk = remainingDemand > 0 ? Math.min(remainingDemand, availableRisk) : 0;
                                      remainingDemand -= usedRisk;

                                      normalCap = usedNormal;
                                      riskCap = usedRisk;
                                      demanda = usedNormal + usedRisk;
                                    } else {
                                      demanda = 0;
                                    }
                                  } else if (mode === "exaustao") {
                                    const capRest = Math.max(0, d.cap_restante_seq || 0);
                                    if (remainingDemand > 0 && capRest > 0) {
                                      demanda = Math.min(remainingDemand, capRest);
                                      remainingDemand -= demanda;
                                    } else {
                                      demanda = 0;
                                    }
                                  } else {
                                    let weight = 1 / (n || 1);
                                    if (mode === "proporcional") {
                                      weight = sumProd > 0 ? (d.produzido_seq || 0) / sumProd : 1 / (n || 1);
                                    } else if (mode === "manual") {
                                      const val = mp[key] ?? (100 / (n || 1));
                                      weight = sumPct > 0 ? (val / sumPct) : (1 / (n || 1));
                                    }
                                    demanda = demandTotal * weight;
                                  }

                                  meses = demanda > 0 ? (d.cap_restante_seq || 0) / demanda : null;
                                  const eol = demanda > 0 && meses != null ? new Date(periodEnd + 'T00:00:00') : null;
                                  const eolStr = (() => {
                                    if (!eol || meses == null) return null;
                                    const dt = new Date(eol);
                                    dt.setMonth(dt.getMonth() + Math.max(0, Math.floor(meses)));
                                    const frac = Math.max(0, (meses - Math.floor(meses)));
                                    if (frac > 0) dt.setDate(dt.getDate() + Math.round(frac * 30));
                                    return toISO(dt);
                                  })();
                                  const pedidoStr = (() => {
                                    if (!eolStr) return null;
                                    const dt = new Date(eolStr + 'T00:00:00');
                                    dt.setDate(dt.getDate() - (leadTime || 0));
                                    return toISO(dt);
                                  })();

                                  return (
                                    <tr key={`${r.matriz}-${i}`} className="border-b hover:bg-muted/30">
                                      <td className="px-2 py-1 text-left">{d.seq || "-"}</td>
                                      <td className="px-2 py-1 text-center">{d.ativa || ""}</td>
                                      <td className="px-2 py-1 text-center">
                                        {(() => {
                                          const level: 'ok'|'atencao'|'critico' = (d.cap_restante_seq <= 0 || (d.produzido_seq || 0) >= 30000) ? 'critico' : (meses != null && meses <= 1 ? 'atencao' : 'ok');
                                          const prob = riskProbSeq(d.produzido_seq || 0, 30000, meses);
                                          const cls = level==='critico' ? 'bg-red-600/15 text-red-700 border-red-600/40' : level==='atencao' ? 'bg-amber-500/15 text-amber-700 border-amber-500/40' : 'bg-emerald-600/10 text-emerald-700 border-emerald-600/30';
                                          const label = level==='critico' ? 'Crítico' : level==='atencao' ? 'Atenção' : 'OK';
                                          const extra = (d.produzido_seq || 0) > 30000 ? ` (+${formatNumberBR((d.produzido_seq||0) - 30000)} kg | ${(prob*100).toFixed(0)}%)` : '';
                                          const tooltipBase = (() => {
                                            if (!(d.cap_restante_seq <= 0) || !(demanda > 0)) return '';
                                            const monthsExtra = 30000 / demanda; // hipótese +30t nesta sequência
                                            const eolExtra = addMonthsApprox(periodEnd, monthsExtra);
                                            return `Faixa EOL: Hoje — ${formatDateBR(eolExtra)} (hipótese +30t)`;
                                          })();
                                          const tooltipExtra = mode === "capacidade_risco" && (normalCap > 0 || riskCap > 0)
                                            ? `Cap. normal: ${formatNumberBR(normalCap)} kg | Cap. risco: ${formatNumberBR(riskCap)} kg`
                                            : '';
                                          const tooltip = [tooltipBase, tooltipExtra].filter(Boolean).join(' | ');
                                          return <span title={tooltip} className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] ${cls}`}>{label}{extra}</span>;
                                        })()}
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">{formatNumberBR(d.produzido_seq)}</td>
                                      <td className="px-2 py-1 text-right tabular-nums">{formatNumberBR(d.cap_total_seq)}</td>
                                      <td className="px-2 py-1 text-right tabular-nums">{formatNumberBR(d.cap_restante_seq)}</td>
                                      <td className="px-2 py-1 text-right tabular-nums">{formatNumberBR(demanda)}</td>
                                      {mode === "manual" && (
                                        <td className="px-2 py-1 text-right">
                                          <input
                                            type="number"
                                            className="h-7 w-20 rounded border bg-background px-2 text-right"
                                            value={(manualPerc[r.matriz]?.[key] ?? (100 / n)).toFixed(2)}
                                            onChange={(e) => {
                                              const v = Number(e.target.value);
                                              setManualPerc((mp) => ({
                                                ...mp,
                                                [r.matriz]: { ...(mp[r.matriz] || {}), [key]: isFinite(v) ? v : 0 },
                                              }));
                                            }}
                                          />
                                        </td>
                                      )}
                                      <td className="px-2 py-1 text-right tabular-nums">{formatNumberBR(meses ?? 0)}</td>
                                      <td className="px-2 py-1 text-right tabular-nums">{formatDateBR(eolStr)}</td>
                                      <td className="px-2 py-1 text-right tabular-nums">{formatDateBR(pedidoStr)}</td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-muted-foreground">
            Exibindo {finalRows.length} matrizes.
          </div>
        </div>
        </>
      )}
    </div>
  );
}
