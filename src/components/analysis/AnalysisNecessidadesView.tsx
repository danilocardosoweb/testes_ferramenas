import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AlertTriangle, TrendingUp, Package, Hammer, Clock, Target, Zap, AlertCircle, CheckCircle2, Info, ArrowUpRight, Layers } from "lucide-react";

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
        <>
          {/* KPIs Estratégicos de Necessidades */}
          {(() => {
            const altaPrioridade = rows.filter(r => r.prioridade === 'Alta').length;
            const mediaPrioridade = rows.filter(r => r.prioridade === 'Média').length;
            const baixaPrioridade = rows.filter(r => r.prioridade === 'Baixa').length;
            const matrizesUnicas = new Set(rows.map(r => r.matriz)).size;
            const comInsuficiencia = rows.filter(r => r.insuf_seq !== null).length;
            const demandaCrescente = rows.filter(r => r.crescimento_ratio > 1.1).length;
            const reposicao30dias = rows.filter(r => {
              if (!r.data_pedido) return false;
              const pedidoDate = new Date(r.data_pedido + 'T00:00:00');
              const hoje = new Date(periodEnd + 'T00:00:00');
              const diff = (pedidoDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
              return diff >= 0 && diff <= 30;
            }).length;
            const desgasteAlto = rows.filter(r => r.desgaste_perc >= 1).length; // >= 100%

            // Insights automáticos
            const insights: Array<{tipo: 'critico' | 'alerta' | 'info' | 'sucesso', msg: string, icon: any}> = [];
            if (altaPrioridade > 0) {
              insights.push({ tipo: 'critico', msg: `${altaPrioridade} sequência(s) com prioridade ALTA — necessitam ação imediata de reposição/confecção`, icon: AlertTriangle });
            }
            if (comInsuficiencia > 0) {
              insights.push({ tipo: 'alerta', msg: `${comInsuficiencia} matriz(es) com sequências insuficientes para atender demanda anual`, icon: Layers });
            }
            if (demandaCrescente > 0) {
              insights.push({ tipo: 'alerta', msg: `${demandaCrescente} sequência(s) com demanda crescente (6m > 12m) — considere ampliar capacidade`, icon: TrendingUp });
            }
            if (reposicao30dias > 0) {
              insights.push({ tipo: 'info', msg: `${reposicao30dias} sequência(s) com previsão de reposição nos próximos 30 dias`, icon: Clock });
            }
            if (desgasteAlto > 0) {
              insights.push({ tipo: 'alerta', msg: `${desgasteAlto} sequência(s) ultrapassaram 30t de produção — avaliar condição física`, icon: Hammer });
            }
            if (altaPrioridade === 0 && mediaPrioridade === 0) {
              insights.push({ tipo: 'sucesso', msg: `Nenhuma necessidade crítica ou média identificada no momento`, icon: CheckCircle2 });
            }

            return (
              <div className="mb-4 space-y-4">
                {/* Cards de KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-red-50 to-red-100/50 p-3 shadow-sm cursor-help"
                    title="🔴 PRIORIDADE ALTA — Sequências que requerem ação imediata.&#10;&#10;📊 Como é calculado:&#10;Sequências são classificadas como Alta quando o SCORE é ≥ 60.&#10;&#10;O Score considera:&#10;• Cobertura baixa (poucos meses restantes)&#10;• Desgaste alto (muita produção acumulada)&#10;• Produção excedente (acima de 30t)&#10;• Demanda crescente (6m > 12m)&#10;• Sequências insuficientes na matriz&#10;&#10;⚠️ Ação necessária:&#10;Confeccionar nova sequência ou solicitar reposição urgente para evitar ruptura no atendimento."
                  >
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs font-medium">Prioridade Alta</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-red-700">{altaPrioridade}</div>
                    <div className="text-[10px] text-red-600/70">Ação imediata</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-amber-50 to-amber-100/50 p-3 shadow-sm cursor-help"
                    title="🟡 PRIORIDADE MÉDIA — Sequências que precisam de planejamento.&#10;&#10;📊 Como é calculado:&#10;Sequências são classificadas como Média quando o SCORE está entre 30 e 59.&#10;&#10;⚠️ Ação necessária:&#10;Incluir no planejamento de reposição das próximas semanas. Monitorar evolução para evitar que se tornem críticas."
                  >
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">Prioridade Média</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-amber-700">{mediaPrioridade}</div>
                    <div className="text-[10px] text-amber-600/70">Planejar reposição</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-3 shadow-sm cursor-help"
                    title="🟢 PRIORIDADE BAIXA — Sequências em situação estável.&#10;&#10;📊 Como é calculado:&#10;Sequências são classificadas como Baixa quando o SCORE é < 30.&#10;&#10;✅ Situação:&#10;Não requerem ação imediata. Manter monitoramento regular para identificar mudanças de tendência."
                  >
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Prioridade Baixa</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-emerald-700">{baixaPrioridade}</div>
                    <div className="text-[10px] text-emerald-600/70">Monitoramento</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-blue-50 to-blue-100/50 p-3 shadow-sm cursor-help"
                    title="⏰ REPOSIÇÃO 30 DIAS — Sequências que precisam ser repostas no próximo mês.&#10;&#10;📊 Como é calculado:&#10;Conta as sequências onde a Data de Pedido está nos próximos 30 dias.&#10;&#10;📅 Data de Pedido = Data EOL - Lead Time (dias de antecedência para solicitar)&#10;&#10;⚠️ Ação necessária:&#10;Iniciar processo de confecção ou compra imediatamente para garantir entrega a tempo."
                  >
                    <div className="flex items-center gap-2 text-blue-700">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-medium">Reposição 30d</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-blue-700">{reposicao30dias}</div>
                    <div className="text-[10px] text-blue-600/70">Próximo mês</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-purple-50 to-purple-100/50 p-3 shadow-sm cursor-help"
                    title="📈 DEMANDA CRESCENTE — Sequências com tendência de aumento de consumo.&#10;&#10;📊 Como é calculado:&#10;Compara a demanda média dos últimos 6 meses com os últimos 12 meses.&#10;Se a razão (6m ÷ 12m) for > 1.1 (10% de aumento), a demanda é considerada crescente.&#10;&#10;⚠️ O que significa:&#10;Essas matrizes estão sendo mais demandadas recentemente. A capacidade atual pode não ser suficiente no futuro.&#10;&#10;✅ Recomendação:&#10;Considere ampliar a capacidade (nova sequência) antes que se torne crítico."
                  >
                    <div className="flex items-center gap-2 text-purple-700">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-xs font-medium">Demanda Crescente</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-purple-700">{demandaCrescente}</div>
                    <div className="text-[10px] text-purple-600/70">Tendência alta</div>
                  </div>
                  <div 
                    className="rounded-lg border bg-gradient-to-br from-slate-50 to-slate-100/50 p-3 shadow-sm cursor-help"
                    title="📦 MATRIZES ANALISADAS — Total de matrizes únicas no período.&#10;&#10;📊 Como é calculado:&#10;Conta o número de matrizes distintas que possuem dados de produção e demanda no período selecionado.&#10;&#10;ℹ️ O que significa:&#10;Representa a abrangência da análise. Quanto mais matrizes, mais completa é a visão do parque de ferramentas."
                  >
                    <div className="flex items-center gap-2 text-slate-700">
                      <Package className="h-4 w-4" />
                      <span className="text-xs font-medium">Matrizes Analisadas</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-slate-700">{matrizesUnicas}</div>
                    <div className="text-[10px] text-slate-600/70">Total no período</div>
                  </div>
                </div>

                {/* Insights Automáticos */}
                {insights.length > 0 && (
                  <div className="rounded-lg border bg-white/50 p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-semibold text-gray-700">Insights de Necessidades</span>
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

                {/* Resumo de Ações Sugeridas */}
                {(altaPrioridade > 0 || comInsuficiencia > 0) && (
                  <div 
                    className="rounded-lg border bg-gradient-to-r from-indigo-50 to-violet-50 p-3 shadow-sm cursor-help"
                    title="🎯 AÇÕES RECOMENDADAS — Resumo das ações prioritárias.&#10;&#10;Este painel consolida as principais ações necessárias com base na análise de todas as sequências.&#10;&#10;Cada ação é derivada dos indicadores calculados e visa evitar rupturas no atendimento aos pedidos."
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-semibold text-gray-700">Ações Recomendadas</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                      {altaPrioridade > 0 && (
                        <div 
                          className="flex items-start gap-2 bg-white/60 rounded p-2 border border-indigo-100 cursor-help"
                          title="🔧 CONFECCIONAR/REPOR&#10;&#10;Sequências com prioridade ALTA que precisam de ação imediata.&#10;&#10;O que fazer:&#10;1. Verificar qual matriz/sequência está crítica&#10;2. Solicitar confecção de nova sequência ao fornecedor&#10;3. Ou solicitar reposição se houver sequência disponível em estoque&#10;&#10;Prazo: URGENTE - Agir imediatamente"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5 text-indigo-600 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium text-indigo-800">Confeccionar/Repor</span>
                            <p className="text-gray-600 mt-0.5">{altaPrioridade} seq. requerem confecção urgente</p>
                          </div>
                        </div>
                      )}
                      {comInsuficiencia > 0 && (
                        <div 
                          className="flex items-start gap-2 bg-white/60 rounded p-2 border border-indigo-100 cursor-help"
                          title="📦 AMPLIAR CAPACIDADE&#10;&#10;Matrizes com sequências insuficientes para atender a demanda anual projetada.&#10;&#10;O que significa:&#10;A capacidade atual de todas as sequências ativas somadas não é suficiente para atender 12 meses de demanda.&#10;&#10;O que fazer:&#10;1. Avaliar quais matrizes precisam de mais sequências&#10;2. Solicitar confecção de sequências adicionais&#10;3. Redistribuir produção se possível&#10;&#10;Prazo: Médio prazo - Planejar nas próximas semanas"
                        >
                          <Layers className="h-3.5 w-3.5 text-indigo-600 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium text-indigo-800">Ampliar Capacidade</span>
                            <p className="text-gray-600 mt-0.5">{comInsuficiencia} matrizes precisam de novas seq.</p>
                          </div>
                        </div>
                      )}
                      {demandaCrescente > 0 && (
                        <div 
                          className="flex items-start gap-2 bg-white/60 rounded p-2 border border-indigo-100 cursor-help"
                          title="📈 REVISAR PLANEJAMENTO&#10;&#10;Sequências com demanda crescente (últimos 6 meses > últimos 12 meses).&#10;&#10;O que significa:&#10;O consumo está aumentando. Se a tendência continuar, a capacidade atual pode se tornar insuficiente.&#10;&#10;O que fazer:&#10;1. Analisar se o aumento é sazonal ou permanente&#10;2. Ajustar previsões de demanda&#10;3. Considerar antecipar confecção de novas sequências&#10;&#10;Prazo: Avaliar e planejar nas próximas revisões"
                        >
                          <TrendingUp className="h-3.5 w-3.5 text-indigo-600 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium text-indigo-800">Revisar Planejamento</span>
                            <p className="text-gray-600 mt-0.5">{demandaCrescente} seq. com tendência de alta</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        <div className="overflow-auto">
          <table className="w-full table-auto border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className="sticky top-0 bg-muted px-2 py-2 text-left font-medium">Matriz</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-left font-medium">Seq</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right font-medium">Consumo m/mês (kg)</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right font-medium">Consumo a/a (kg)</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right font-medium">Seq Ativas</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right font-medium">Desgaste (%)</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right font-medium">Restante (kg)</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right font-medium">Meses cobertura</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-right font-medium">Prev. Reposição</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-left font-medium">Prioridade</th>
                <th className="sticky top-0 bg-muted px-2 py-2 text-left font-medium">Motivo</th>
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
        </>
      )}
    </div>
  );
}
