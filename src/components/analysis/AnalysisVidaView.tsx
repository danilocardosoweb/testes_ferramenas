import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";
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
      )}
    </div>
  );
}
