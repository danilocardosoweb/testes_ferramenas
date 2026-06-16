import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Gauge,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DecisionStatus = "confeccionar" | "planejar" | "monitorar";

type VidaRow = {
  matriz: string;
  seq_ativas: number;
  cap_total: number;
  cap_restante: number;
  demanda_media_mensal: number | null;
  meses_cobertura: number | null;
  data_eol: string | null;
  data_pedido: string | null;
};

type DecisionRow = VidaRow & {
  crescimento: number;
  avg6m: number;
  avg12m: number;
  sequenciasDisponiveis: number;
  capacidadeDisponivelKg: number;
  totalSequencias: number;
  eficienciaMedia: number | null;
  produtividadeMedia: number | null;
  pedidos12m: number;
  kgPedidos12m: number;
  clientes12m: number;
  paradas12m: number;
  registrosProducao12m: number;
  motivosParada: string[];
  criterioBloqueio: string | null;
  criterioEntrada: string;
  demandaSuficiente: boolean;
  tendenciaCompensa: boolean;
  tendenciaLabel: string;
  score: number;
  status: DecisionStatus;
  motivos: string[];
  acao: string;
  prazo: string;
};

interface AnalysisDecisaoRapidaViewProps {
  onOpenDetailedDecision?: () => void;
  onOpenNeeds?: () => void;
  onOpenLife?: () => void;
}

type DemandInfo = {
  pedidos12m: number;
  kgPedidos12m: number;
  clientes12m: number;
  avg6m: number;
  avg12m: number;
};

type StopInfo = {
  paradas12m: number;
  registrosProducao12m: number;
  motivosParada: string[];
};

type AvailabilityInfo = {
  sequenciasDisponiveis: number;
  capacidadeDisponivelKg: number;
  totalSequencias: number;
};

const DEMAND_PERIOD_MONTHS = 12;
const MIN_PEDIDOS_12M = 6;
const MIN_KG_12M = 3000;
const MIN_PEDIDOS_TENDENCIA = 3;
const MIN_KG_TENDENCIA = 1000;
const TENDENCIA_COMPENSA_PCT = 25;
const MIN_SEQUENCIAS_DISPONIVEIS = 2;

function formatNumberBR(value?: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateBR(value?: string | null) {
  if (!value) return "-";
  const clean = String(value).slice(0, 10);
  const [year, month, day] = clean.split("-");
  if (!year || !month || !day) return "-";
  return `${day}/${month}/${year}`;
}

function normalizeCode(value?: string | null) {
  return (value ?? "").toUpperCase().trim();
}

function normalizeMatrixKey(value?: string | null) {
  const clean = normalizeCode(value).replace(/^F-/, "");
  return clean.includes("/") ? clean.split("/")[0].trim() : clean;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthsAgoISO(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getDaysUntil(dateISO?: string | null) {
  if (!dateISO) return null;
  const target = new Date(`${dateISO.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function scoreVida(row: VidaRow) {
  const cobertura = row.meses_cobertura;
  const desgaste = row.cap_total > 0 ? (row.cap_total - row.cap_restante) / row.cap_total : 0;
  const diasEol = getDaysUntil(row.data_eol);

  let score = 0;
  if (cobertura != null) {
    if (cobertura <= 0) score += 48;
    else if (cobertura <= 1) score += 42;
    else if (cobertura <= 2) score += 34;
    else if (cobertura <= 3) score += 24;
    else if (cobertura <= 6) score += 12;
  }

  if (diasEol != null) {
    if (diasEol <= 0) score += 28;
    else if (diasEol <= 30) score += 22;
    else if (diasEol <= 60) score += 16;
    else if (diasEol <= 90) score += 10;
  }

  if (desgaste >= 0.9) score += 24;
  else if (desgaste >= 0.8) score += 18;
  else if (desgaste >= 0.7) score += 12;
  else if (desgaste >= 0.5) score += 7;

  return clamp(score);
}

function scoreDemanda(row: VidaRow, crescimento: number) {
  const demanda = row.demanda_media_mensal ?? 0;
  const growthScore = clamp((crescimento - 1) * 180, 0, 55);
  const demandScore = clamp((demanda / 5000) * 45, 0, 45);
  return clamp(growthScore + demandScore);
}

function scoreOperacional(row: VidaRow) {
  const demanda = row.demanda_media_mensal ?? 0;
  if (demanda <= 0) return row.seq_ativas <= 1 ? 18 : 0;
  if (row.seq_ativas <= 1) return 75;
  if (row.seq_ativas === 2) return 35;
  return 8;
}

function scoreDesempenho(eficiencia: number | null) {
  if (eficiencia == null) return 18;
  if (eficiencia >= 86) return 0;
  if (eficiencia >= 80) return 12;
  if (eficiencia >= 70) return 28;
  if (eficiencia >= 55) return 52;
  return 76;
}

function getTrendLabel(growthPct: number, avg6m: number, avg12m: number) {
  if (avg6m <= 0 && avg12m <= 0) return "Sem base";
  if (growthPct >= TENDENCIA_COMPENSA_PCT) return "Alta forte";
  if (growthPct >= 10) return "Alta moderada";
  if (growthPct <= -20) return "Queda forte";
  if (growthPct <= -8) return "Queda";
  return "Estavel";
}

function getPayloadValue(payload: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function isRelevantStop(code: string) {
  const raw = normalizeCode(code);
  if (!raw) return false;
  const numeric = raw.match(/\d+/)?.[0] ?? "";
  const ignored = new Set(["001", "400", "401", "402", "306", "313", "315", "121"]);
  if (ignored.has(numeric.padStart(3, "0"))) return false;
  if (raw.includes("PEDIDO ATENDIDO")) return false;
  if (raw.includes("SEM PARADA")) return false;
  return true;
}

function isAvailableSequence(row: any) {
  const status = normalizeCode(row.ativa ?? row.status ?? row.descricao_status ?? "");

  if (!status) return true;
  if (status.includes("MANUT")) return false;
  if (status.includes("SUCATA")) return false;
  if (status.includes("INAT")) return false;
  if (status.includes("ELIM")) return false;
  return true;
}

function buildDecision(
  row: VidaRow,
  demand: DemandInfo,
  stops: StopInfo,
  availability: AvailabilityInfo,
  prod?: { eficienciaMedia: number | null; produtividadeMedia: number | null },
): DecisionRow {
  const disponibilidadeReal = Math.max(row.seq_ativas || 0, availability.sequenciasDisponiveis || 0);
  const capacidadeDisponivelReal = Math.max(row.cap_restante || 0, availability.capacidadeDisponivelKg || 0);
  const growth = demand.avg12m > 0 ? demand.avg6m / demand.avg12m : demand.avg6m > 0 ? 1.2 : 1;
  const vida = scoreVida(row);
  const demanda = scoreDemanda(row, growth);
  const operacional = scoreOperacional(row);
  const desempenho = scoreDesempenho(prod?.eficienciaMedia ?? null);
  const paradaRate = stops.registrosProducao12m > 0 ? stops.paradas12m / stops.registrosProducao12m : 0;
  const scoreParadas = clamp(stops.paradas12m * 4 + paradaRate * 120, 0, 28);
  let total = clamp(vida * 0.36 + demanda * 0.26 + operacional * 0.16 + desempenho * 0.10 + scoreParadas * 0.12);

  let status: DecisionStatus = "monitorar";
  if (total >= 68 || (row.meses_cobertura != null && row.meses_cobertura <= 1)) status = "confeccionar";
  else if (total >= 40 || (row.meses_cobertura != null && row.meses_cobertura <= 3)) status = "planejar";

  const motivos: string[] = [];
  const desgaste = row.cap_total > 0 ? ((row.cap_total - row.cap_restante) / row.cap_total) * 100 : 0;
  const growthPct = (growth - 1) * 100;
  const demandaSuficiente = demand.pedidos12m >= MIN_PEDIDOS_12M || demand.kgPedidos12m >= MIN_KG_12M;
  const tendenciaCompensa =
    growthPct >= TENDENCIA_COMPENSA_PCT &&
    demand.pedidos12m >= MIN_PEDIDOS_TENDENCIA &&
    demand.kgPedidos12m >= MIN_KG_TENDENCIA;
  const tendenciaLabel = getTrendLabel(growthPct, demand.avg6m, demand.avg12m);
  const temFolgaDeFerramenta = disponibilidadeReal >= MIN_SEQUENCIAS_DISPONIVEIS;
  const criterioEntrada = demandaSuficiente
    ? `Entrada OK: minimo ${MIN_PEDIDOS_12M} pedidos ou ${formatNumberBR(MIN_KG_12M, 0)} kg em 12 meses`
    : tendenciaCompensa
    ? `Entrada por tendencia: poucos pedidos, mas alta de ${formatNumberBR(growthPct, 0)}%`
    : `Abaixo da entrada minima: ${MIN_PEDIDOS_12M} pedidos ou ${formatNumberBR(MIN_KG_12M, 0)} kg em 12 meses`;
  let criterioBloqueio: string | null = null;

  if (demand.pedidos12m <= 0 && demand.kgPedidos12m <= 0) {
    criterioBloqueio = "Sem pedidos nos ultimos 12 meses";
    status = "monitorar";
    total = Math.min(total, 32);
  } else if (temFolgaDeFerramenta) {
    criterioBloqueio = `${disponibilidadeReal} ferramentas disponiveis para uso`;
    status = stops.paradas12m >= 3 ? "planejar" : "monitorar";
    total = Math.min(total, stops.paradas12m >= 3 ? 59 : 39);
  } else if (!demandaSuficiente && !tendenciaCompensa && stops.paradas12m < 3) {
    criterioBloqueio = "Abaixo do minimo de pedidos e sem paradas suficientes para justificar nova sequencia";
    status = status === "confeccionar" ? "planejar" : "monitorar";
    total = Math.min(total, 45);
  } else if (status === "confeccionar" && !demandaSuficiente && stops.paradas12m < 3) {
    criterioBloqueio = "Confeccao exige confirmacao: tendencia ajuda, mas a entrada de pedidos ainda e baixa";
    status = "planejar";
    total = Math.min(total, 58);
  }

  if (criterioBloqueio) {
    motivos.push(criterioBloqueio);
  }
  if (row.meses_cobertura != null && row.meses_cobertura <= 3) {
    motivos.push(`Cobertura de ${formatNumberBR(row.meses_cobertura)} meses`);
  }
  if (desgaste >= 75) {
    motivos.push(`Desgaste de ${formatNumberBR(desgaste, 0)}%`);
  }
  if (growthPct >= 10) {
    motivos.push(`Tendencia ${tendenciaLabel.toLowerCase()}: ${formatNumberBR(growthPct, 0)}%`);
  }
  if (!demandaSuficiente && tendenciaCompensa) {
    motivos.push("Tendencia compensa entrada baixa");
  }
  if (row.seq_ativas <= 1 && (row.demanda_media_mensal ?? 0) > 0) {
    motivos.push("Apenas 1 sequencia ativa");
  }
  if (temFolgaDeFerramenta) {
    motivos.push("Ha ferramenta disponivel antes de confeccionar");
  }
  if ((prod?.eficienciaMedia ?? 100) < 70) {
    motivos.push(`Eficiencia media de ${formatNumberBR(prod?.eficienciaMedia, 0)}%`);
  }
  if (stops.paradas12m >= 3) {
    motivos.push(`${stops.paradas12m} paradas relevantes em 12 meses`);
  }
  if (motivos.length === 0) {
    motivos.push("Sem sinal critico imediato");
  }

  const actionByStatus: Record<DecisionStatus, { acao: string; prazo: string }> = {
    confeccionar: { acao: "Abrir solicitacao de nova sequencia", prazo: "Agora" },
    planejar: { acao: "Separar especificacao e colocar no plano", prazo: "30 a 60 dias" },
    monitorar: { acao: "Manter em observacao", prazo: "Revisar em 30 dias" },
  };
  const action = temFolgaDeFerramenta
    ? { acao: "Usar ferramenta disponivel antes de confeccionar", prazo: "Acompanhar consumo" }
    : actionByStatus[status];

  return {
    ...row,
    crescimento: growth,
    avg6m: demand.avg6m,
    avg12m: demand.avg12m,
    sequenciasDisponiveis: disponibilidadeReal,
    capacidadeDisponivelKg: capacidadeDisponivelReal,
    totalSequencias: Math.max(row.seq_ativas || 0, availability.totalSequencias || 0),
    eficienciaMedia: prod?.eficienciaMedia ?? null,
    produtividadeMedia: prod?.produtividadeMedia ?? null,
    pedidos12m: demand.pedidos12m,
    kgPedidos12m: demand.kgPedidos12m,
    clientes12m: demand.clientes12m,
    paradas12m: stops.paradas12m,
    registrosProducao12m: stops.registrosProducao12m,
    motivosParada: stops.motivosParada,
    criterioBloqueio,
    criterioEntrada,
    demandaSuficiente,
    tendenciaCompensa,
    tendenciaLabel,
    score: total,
    status,
    motivos: motivos.slice(0, 3),
    acao: action.acao,
    prazo: action.prazo,
  };
}

function statusMeta(status: DecisionStatus) {
  if (status === "confeccionar") {
    return {
      label: "Confeccionar agora",
      short: "Agora",
      icon: AlertTriangle,
      hero: "border-red-300 bg-red-50 text-red-950",
      badge: "bg-red-100 text-red-800 border-red-300",
      bar: "bg-red-600",
    };
  }
  if (status === "planejar") {
    return {
      label: "Planejar reposicao",
      short: "Planejar",
      icon: Clock,
      hero: "border-amber-300 bg-amber-50 text-amber-950",
      badge: "bg-amber-100 text-amber-800 border-amber-300",
      bar: "bg-amber-500",
    };
  }
  return {
    label: "Monitorar",
    short: "OK",
    icon: CheckCircle2,
    hero: "border-emerald-300 bg-emerald-50 text-emerald-950",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    bar: "bg-emerald-600",
  };
}

function SignalCard({ label, value, tone, helper }: { label: string; value: string; tone: string; helper: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold", tone)}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </Card>
  );
}

export function AnalysisDecisaoRapidaView({
  onOpenDetailedDecision,
  onOpenNeeds,
  onOpenLife,
}: AnalysisDecisaoRapidaViewProps) {
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DecisionStatus | "todas" | "com-paradas" | "sem-pedidos" | "entrada-baixa" | "tendencia-alta">("todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const periodStart = monthsAgoISO(12);
      const periodEnd = todayISO();
      const [vidaRes, carteiraRes, prodRes, paradasRes] = await Promise.all([
        supabase.rpc("matrix_lifespan_summary"),
        supabase.rpc("analysis_carteira_flat_agg", {
          cliente_filter: null,
          ferramenta_filter: null,
          period_start: periodStart,
          period_end: periodEnd,
        }),
        supabase.rpc("get_productivity_stats", {
          p_months_back: 12,
          p_matriz_filter: null,
          p_prensa_filter: null,
          p_seq_filter: null,
          p_liga_filter: null,
        }),
        supabase
          .from("analysis_producao")
          .select("payload,produced_on")
          .gte("produced_on", periodStart)
          .lte("produced_on", periodEnd)
          .limit(100000),
      ]);

      if (vidaRes.error) throw vidaRes.error;
      if (carteiraRes.error) throw carteiraRes.error;
      if (prodRes.error) throw prodRes.error;
      if (paradasRes.error) throw paradasRes.error;

      const demandByMatrix = new Map<string, DemandInfo>();
      (carteiraRes.data ?? []).forEach((row: any) => {
        const key = normalizeMatrixKey(row.ferramenta);
        const avg6m = Number(row.avg6m ?? 0);
        const avg12m = Number(row.avg12m ?? 0);
        if (!key) return;
        demandByMatrix.set(key, {
          pedidos12m: Number(row.pedido_count ?? 0),
          kgPedidos12m: Number(row.pedido_kg_sum ?? 0),
          clientes12m: Number(row.cliente_count ?? 0),
          avg6m,
          avg12m,
        });
      });

      const prodByMatrix = new Map<string, { eficienciaMedia: number | null; produtividadeMedia: number | null }>();
      (prodRes.data ?? []).forEach((row: any) => {
        const key = normalizeMatrixKey(row.matriz);
        if (!key) return;
        const current = prodByMatrix.get(key);
        const eficiencia = Number(row.avg_eficiencia ?? 0) || null;
        const produtividade = Number(row.avg_produtividade ?? 0) || null;
        if (!current) {
          prodByMatrix.set(key, { eficienciaMedia: eficiencia, produtividadeMedia: produtividade });
          return;
        }
        prodByMatrix.set(key, {
          eficienciaMedia: current.eficienciaMedia ?? eficiencia,
          produtividadeMedia: current.produtividadeMedia ?? produtividade,
        });
      });

      const stopByMatrix = new Map<string, StopInfo>();
      (paradasRes.data ?? []).forEach((row: any) => {
        const payload = (row.payload ?? {}) as Record<string, any>;
        const matrixKey = normalizeMatrixKey(
          getPayloadValue(payload, ["Matriz", "Ferramenta", "Ferramenta Codigo", "Ferramenta Código"]),
        );
        if (!matrixKey) return;

        const current = stopByMatrix.get(matrixKey) ?? {
          paradas12m: 0,
          registrosProducao12m: 0,
          motivosParada: [],
        };
        current.registrosProducao12m += 1;

        const stopCode = getPayloadValue(payload, ["Cod Parada", "Cod. Parada", "Codigo Parada", "Código Parada"]);
        const observation = getPayloadValue(payload, ["Observação Lote", "Observacao Lote", "Observacoes Lote"]);

        if (isRelevantStop(stopCode)) {
          current.paradas12m += 1;
          const reason = stopCode || observation;
          if (reason && !current.motivosParada.includes(reason)) {
            current.motivosParada.push(reason);
          }
        }

        stopByMatrix.set(matrixKey, current);
      });

      const availabilityByMatrix = new Map<string, AvailabilityInfo>();
      const matrizCodes = Array.from(
        new Set(
          (vidaRes.data ?? [])
            .map((row: any) => normalizeMatrixKey(row.matriz))
            .filter(Boolean),
        ),
      );

      for (let i = 0; i < matrizCodes.length; i += 25) {
        const batch = matrizCodes.slice(i, i + 25);
        const batchResults = await Promise.all(
          batch.map(async (matriz) => {
            const { data, error } = await supabase.rpc("matrix_lifespan_by_sequence", {
              matriz_code: matriz,
              period_end: null,
              months: 12,
              lead_time_days: 20,
            });
            if (error) {
              console.warn("Erro ao carregar sequencias disponiveis:", matriz, error);
              return [matriz, { sequenciasDisponiveis: 0, capacidadeDisponivelKg: 0, totalSequencias: 0 }] as const;
            }

            const rows = data ?? [];
            const availableRows = rows.filter(isAvailableSequence);
            const capacidadeDisponivelKg = availableRows.reduce((sum: number, seq: any) => {
              const remaining = Number(seq.cap_restante_seq ?? seq.cap_restante ?? seq.saldo_a_produzir ?? 0);
              if (remaining > 0) return sum + remaining;
              const capacity = Number(seq.cap_total_seq ?? seq.cap_total ?? 30000);
              const produced = Number(seq.produzido_seq ?? seq.produzido ?? 0);
              return sum + Math.max(0, capacity - produced);
            }, 0);

            return [
              matriz,
              {
                sequenciasDisponiveis: availableRows.length,
                capacidadeDisponivelKg,
                totalSequencias: rows.length,
              },
            ] as const;
          }),
        );

        batchResults.forEach(([matriz, availability]) => {
          availabilityByMatrix.set(matriz, availability);
        });
      }

      const decisions = (vidaRes.data ?? [])
        .map((row: any) => {
          const matriz = normalizeMatrixKey(row.matriz);
          const vida: VidaRow = {
            matriz,
            seq_ativas: Number(row.seq_ativas ?? 0),
            cap_total: Number(row.cap_total ?? 0),
            cap_restante: Number(row.cap_restante ?? 0),
            demanda_media_mensal: row.demanda_media_mensal == null ? null : Number(row.demanda_media_mensal),
            meses_cobertura: row.meses_cobertura == null ? null : Number(row.meses_cobertura),
            data_eol: row.data_eol ?? null,
            data_pedido: row.data_pedido ?? null,
          };
          return buildDecision(
            vida,
            demandByMatrix.get(matriz) ?? { pedidos12m: 0, kgPedidos12m: 0, clientes12m: 0, avg6m: 0, avg12m: 0 },
            stopByMatrix.get(matriz) ?? { paradas12m: 0, registrosProducao12m: 0, motivosParada: [] },
            availabilityByMatrix.get(matriz) ?? { sequenciasDisponiveis: vida.seq_ativas, capacidadeDisponivelKg: vida.cap_restante, totalSequencias: vida.seq_ativas },
            prodByMatrix.get(matriz),
          );
        })
        .filter((row: DecisionRow) => row.matriz)
        .sort((a: DecisionRow, b: DecisionRow) => b.score - a.score);

      setRows(decisions);
      setSelected((current) => current && decisions.some((row) => row.matriz === current) ? current : decisions[0]?.matriz ?? null);
    } catch (err: any) {
      console.error("Erro ao carregar decisao rapida:", err);
      setError(err?.message ?? String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchSearch = term ? row.matriz.toLowerCase().includes(term) : true;
      const matchFilter =
        filter === "todas"
          ? true
          : filter === "com-paradas"
          ? row.paradas12m > 0
          : filter === "sem-pedidos"
          ? row.pedidos12m <= 0 && row.kgPedidos12m <= 0
          : filter === "entrada-baixa"
          ? !row.demandaSuficiente
          : filter === "tendencia-alta"
          ? row.tendenciaCompensa || (row.crescimento - 1) * 100 >= 10
          : row.status === filter;
      return matchSearch && matchFilter;
    });
  }, [rows, search, filter]);

  const selectedRow = useMemo(() => {
    return rows.find((row) => row.matriz === selected) ?? filteredRows[0] ?? null;
  }, [rows, selected, filteredRows]);

  const stats = useMemo(() => ({
    confeccionar: rows.filter((row) => row.status === "confeccionar").length,
    planejar: rows.filter((row) => row.status === "planejar").length,
    monitorar: rows.filter((row) => row.status === "monitorar").length,
    comParadas: rows.filter((row) => row.paradas12m > 0).length,
    semPedidos: rows.filter((row) => row.pedidos12m <= 0 && row.kgPedidos12m <= 0).length,
    entradaBaixa: rows.filter((row) => !row.demandaSuficiente).length,
    tendenciaAlta: rows.filter((row) => row.tendenciaCompensa || (row.crescimento - 1) * 100 >= 10).length,
  }), [rows]);

  if (loading) {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Carregando decisao rapida...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Nao foi possivel carregar a decisao rapida: {error}
      </Card>
    );
  }

  if (!selectedRow) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Nenhuma matriz encontrada para decisao.
      </Card>
    );
  }

  const meta = statusMeta(selectedRow.status);
  const StatusIcon = meta.icon;
  const desgaste = selectedRow.cap_total > 0
    ? ((selectedRow.cap_total - selectedRow.cap_restante) / selectedRow.cap_total) * 100
    : null;
  const crescimentoPct = (selectedRow.crescimento - 1) * 100;
  const periodStartLabel = formatDateBR(monthsAgoISO(DEMAND_PERIOD_MONTHS));
  const periodEndLabel = formatDateBR(todayISO());

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
        <button
          type="button"
          onClick={() => setFilter("confeccionar")}
          className={cn("rounded-lg border p-3 text-left transition hover:border-red-300", filter === "confeccionar" && "border-red-400 bg-red-50")}
        >
          <div className="flex items-center gap-2 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Confeccionar agora
          </div>
          <div className="mt-1 text-2xl font-semibold">{stats.confeccionar}</div>
        </button>
        <button
          type="button"
          onClick={() => setFilter("planejar")}
          className={cn("rounded-lg border p-3 text-left transition hover:border-amber-300", filter === "planejar" && "border-amber-400 bg-amber-50")}
        >
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <Clock className="h-4 w-4" />
            Planejar
          </div>
          <div className="mt-1 text-2xl font-semibold">{stats.planejar}</div>
        </button>
        <button
          type="button"
          onClick={() => setFilter("monitorar")}
          className={cn("rounded-lg border p-3 text-left transition hover:border-emerald-300", filter === "monitorar" && "border-emerald-400 bg-emerald-50")}
        >
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Monitorar
          </div>
          <div className="mt-1 text-2xl font-semibold">{stats.monitorar}</div>
        </button>
        <button
          type="button"
          onClick={() => setFilter("com-paradas")}
          className={cn("rounded-lg border p-3 text-left transition hover:border-sky-300", filter === "com-paradas" && "border-sky-400 bg-sky-50")}
        >
          <div className="flex items-center gap-2 text-xs text-sky-700">
            <Gauge className="h-4 w-4" />
            Com paradas
          </div>
          <div className="mt-1 text-2xl font-semibold">{stats.comParadas}</div>
        </button>
        <button
          type="button"
          onClick={() => setFilter("sem-pedidos")}
          className={cn("rounded-lg border p-3 text-left transition hover:border-slate-300", filter === "sem-pedidos" && "border-slate-400 bg-slate-50")}
        >
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <PackageSearch className="h-4 w-4" />
            Sem pedidos 12m
          </div>
          <div className="mt-1 text-2xl font-semibold">{stats.semPedidos}</div>
        </button>
        <button
          type="button"
          onClick={() => setFilter("entrada-baixa")}
          className={cn("rounded-lg border p-3 text-left transition hover:border-orange-300", filter === "entrada-baixa" && "border-orange-400 bg-orange-50")}
        >
          <div className="flex items-center gap-2 text-xs text-orange-700">
            <PackageSearch className="h-4 w-4" />
            Entrada baixa
          </div>
          <div className="mt-1 text-2xl font-semibold">{stats.entradaBaixa}</div>
        </button>
        <button
          type="button"
          onClick={() => setFilter("tendencia-alta")}
          className={cn("rounded-lg border p-3 text-left transition hover:border-cyan-300", filter === "tendencia-alta" && "border-cyan-400 bg-cyan-50")}
        >
          <div className="flex items-center gap-2 text-xs text-cyan-700">
            <TrendingUp className="h-4 w-4" />
            Tendencia alta
          </div>
          <div className="mt-1 text-2xl font-semibold">{stats.tendenciaAlta}</div>
        </button>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Total analisado</div>
          <div className="mt-1 text-2xl font-semibold">{rows.length}</div>
          <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2" onClick={loadData}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col rounded-lg border">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Buscar matriz"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={filter === "todas" ? "default" : "outline"} onClick={() => setFilter("todas")}>
                Todas
              </Button>
              <Button type="button" size="sm" variant={filter === "com-paradas" ? "default" : "outline"} onClick={() => setFilter("com-paradas")}>
                Paradas
              </Button>
              <Button type="button" size="sm" variant={filter === "sem-pedidos" ? "default" : "outline"} onClick={() => setFilter("sem-pedidos")}>
                Sem pedidos
              </Button>
              <Button type="button" size="sm" variant={filter === "entrada-baixa" ? "default" : "outline"} onClick={() => setFilter("entrada-baixa")}>
                Entrada baixa
              </Button>
              <Button type="button" size="sm" variant={filter === "tendencia-alta" ? "default" : "outline"} onClick={() => setFilter("tendencia-alta")}>
                Tendencia
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setSearch("")}>
                Limpar
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredRows.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Nenhum item nesse filtro.</div>
            ) : (
              <div className="space-y-2">
                {filteredRows.map((row) => {
                  const rowMeta = statusMeta(row.status);
                  return (
                    <button
                      key={row.matriz}
                      type="button"
                      onClick={() => setSelected(row.matriz)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition hover:border-primary/40",
                        selectedRow.matriz === row.matriz && "border-primary bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{row.matriz}</span>
                        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", rowMeta.badge)}>
                          {row.score.toFixed(0)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", rowMeta.bar)} style={{ width: `${Math.min(row.score, 100)}%` }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{rowMeta.short}</span>
                        <span>{formatNumberBR(row.meses_cobertura)} meses</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{row.pedidos12m} pedidos 12m</span>
                        <span>{row.tendenciaLabel}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{formatNumberBR(row.kgPedidos12m, 0)} kg</span>
                        <span>{row.paradas12m} paradas</span>
                      </div>
                      {row.criterioBloqueio ? (
                        <div className="mt-2 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          Freio: {row.criterioBloqueio}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          <Card className={cn("border-2 p-5", meta.hero)}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn("border", meta.badge)} variant="outline">
                    {meta.label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Score {selectedRow.score.toFixed(0)}/100</span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-normal">{selectedRow.matriz}</h2>
                <p className="mt-2 max-w-2xl text-sm">
                  {selectedRow.status === "confeccionar"
                    ? "A decisao recomendada e iniciar a nova sequencia sem esperar nova rodada de analise."
                    : selectedRow.status === "planejar"
                    ? selectedRow.sequenciasDisponiveis >= MIN_SEQUENCIAS_DISPONIVEIS
                      ? "Ainda ha ferramenta disponivel para uso; nao ha necessidade de confeccionar agora, mas vale acompanhar o consumo."
                      : "A matriz ainda permite planejamento, mas ja merece entrar no radar de reposicao."
                    : "Nao ha sinal forte de confeccao agora; o melhor ganho e manter revisao periodica."}
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-white/60 px-4 py-3">
                <StatusIcon className="h-8 w-8" />
                <div>
                  <div className="text-xs text-muted-foreground">Proximo passo</div>
                  <div className="font-semibold">{selectedRow.acao}</div>
                  <div className="text-xs text-muted-foreground">{selectedRow.prazo}</div>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <SignalCard
              label="Cobertura"
              value={`${formatNumberBR(selectedRow.meses_cobertura)} meses`}
              helper={`EOL ${formatDateBR(selectedRow.data_eol)}`}
              tone={(selectedRow.meses_cobertura ?? 99) <= 2 ? "text-red-700" : (selectedRow.meses_cobertura ?? 99) <= 4 ? "text-amber-700" : "text-emerald-700"}
            />
            <SignalCard
              label="Desgaste"
              value={`${formatNumberBR(desgaste, 0)}%`}
              helper={`${formatNumberBR(selectedRow.cap_restante, 0)} kg restantes`}
              tone={(desgaste ?? 0) >= 80 ? "text-red-700" : (desgaste ?? 0) >= 65 ? "text-amber-700" : "text-emerald-700"}
            />
            <SignalCard
              label="Tendencia 6m/12m"
              value={`${formatNumberBR(crescimentoPct, 0)}%`}
              helper={`${selectedRow.tendenciaLabel} | ${formatNumberBR(selectedRow.demanda_media_mensal, 0)} kg/mes`}
              tone={crescimentoPct >= 15 ? "text-red-700" : crescimentoPct >= 5 ? "text-amber-700" : "text-emerald-700"}
            />
            <SignalCard
              label="Ferramentas disp."
              value={String(selectedRow.sequenciasDisponiveis)}
              helper={`${selectedRow.totalSequencias} seq. cadastradas | ${selectedRow.seq_ativas} ativas`}
              tone={selectedRow.sequenciasDisponiveis <= 0 ? "text-red-700" : selectedRow.sequenciasDisponiveis === 1 ? "text-amber-700" : "text-emerald-700"}
            />
            <SignalCard
              label="Pedidos 12m"
              value={String(selectedRow.pedidos12m)}
              helper={`${periodStartLabel} a ${periodEndLabel}`}
              tone={selectedRow.pedidos12m <= 0 ? "text-slate-700" : selectedRow.pedidos12m <= 2 ? "text-amber-700" : "text-emerald-700"}
            />
            <SignalCard
              label="Paradas 12m"
              value={String(selectedRow.paradas12m)}
              helper={`${selectedRow.registrosProducao12m} registros analisados`}
              tone={selectedRow.paradas12m >= 5 ? "text-red-700" : selectedRow.paradas12m >= 2 ? "text-amber-700" : "text-emerald-700"}
            />
          </div>

          <Card className="mt-4 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Inteligencia de demanda</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Periodo analisado: {periodStartLabel} ate {periodEndLabel}. A entrada minima para considerar confeccao e {MIN_PEDIDOS_12M} pedidos ou {formatNumberBR(MIN_KG_12M, 0)} kg em 12 meses.
                </p>
              </div>
              <Badge variant="outline" className={cn(
                "w-fit",
                selectedRow.demandaSuficiente ? "border-emerald-300 bg-emerald-50 text-emerald-800" : selectedRow.tendenciaCompensa ? "border-cyan-300 bg-cyan-50 text-cyan-800" : "border-orange-300 bg-orange-50 text-orange-800",
              )}>
                {selectedRow.demandaSuficiente ? "Entrada suficiente" : selectedRow.tendenciaCompensa ? "Tendencia compensa" : "Entrada baixa"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Pedidos 12m</div>
                <div className="mt-1 text-lg font-semibold">{selectedRow.pedidos12m}</div>
                <div className="text-xs text-muted-foreground">minimo {MIN_PEDIDOS_12M}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Volume 12m</div>
                <div className="mt-1 text-lg font-semibold">{formatNumberBR(selectedRow.kgPedidos12m, 0)} kg</div>
                <div className="text-xs text-muted-foreground">minimo {formatNumberBR(MIN_KG_12M, 0)} kg</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Media ultimos 6m</div>
                <div className="mt-1 text-lg font-semibold">{formatNumberBR(selectedRow.avg6m, 0)} kg/mes</div>
                <div className="text-xs text-muted-foreground">comparada com 12m</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Tendencia</div>
                <div className="mt-1 text-lg font-semibold">{selectedRow.tendenciaLabel}</div>
                <div className="text-xs text-muted-foreground">{formatNumberBR(crescimentoPct, 0)}% vs media 12m</div>
              </div>
            </div>
          </Card>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Motivos da recomendacao</h3>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {selectedRow.motivos.map((motivo) => (
                  <div key={motivo} className="rounded-lg border bg-muted/30 p-3 text-sm">
                    {motivo}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Confirmacao rapida</h3>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Data ideal pedido</span>
                  <span className="font-medium">{formatDateBR(selectedRow.data_pedido)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Eficiencia media</span>
                  <span className="font-medium">{formatNumberBR(selectedRow.eficienciaMedia, 0)}%</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Produtividade</span>
                  <span className="font-medium">{formatNumberBR(selectedRow.produtividadeMedia, 0)} kg/h</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card className={cn("p-4", selectedRow.criterioBloqueio ? "border-slate-300 bg-slate-50" : "border-emerald-200 bg-emerald-50")}>
              <div className="flex items-center gap-2">
                <PackageSearch className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Criterios para evitar confeccao desnecessaria</h3>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {selectedRow.criterioBloqueio ? (
                  <div className="rounded-lg border bg-white/70 p-3">
                    <div className="font-semibold">Nao confeccionar automaticamente</div>
                    <div className="mt-1 text-muted-foreground">{selectedRow.criterioBloqueio}</div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-white/70 p-3">
                    <div className="font-semibold">Sem freio automatico ativo</div>
                    <div className="mt-1 text-muted-foreground">
                      Existe movimento suficiente nos ultimos 12 meses, tendencia compensando ou sinais operacionais que justificam manter no radar.
                    </div>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border bg-white/70 p-3">
                    <div className="text-xs text-muted-foreground">Entrada de pedidos</div>
                    <div className="font-semibold">{selectedRow.demandaSuficiente ? "Atendido" : "Nao atendido"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selectedRow.criterioEntrada}</div>
                  </div>
                  <div className="rounded-lg border bg-white/70 p-3">
                    <div className="text-xs text-muted-foreground">Ferramenta disponivel</div>
                    <div className="font-semibold">
                      {selectedRow.sequenciasDisponiveis >= MIN_SEQUENCIAS_DISPONIVEIS ? "Suficiente" : "Baixa"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedRow.sequenciasDisponiveis} disponiveis | {formatNumberBR(selectedRow.capacidadeDisponivelKg, 0)} kg de saldo
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white/70 p-3">
                    <div className="text-xs text-muted-foreground">Parada relevante</div>
                    <div className="font-semibold">{selectedRow.paradas12m > 0 ? "Sim" : "Nao"}</div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Paradas e motivos</h3>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Paradas relevantes</span>
                  <span className="font-semibold">{selectedRow.paradas12m}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Registros analisados</span>
                  <span className="font-semibold">{selectedRow.registrosProducao12m}</span>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Principais motivos</div>
                  {selectedRow.motivosParada.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedRow.motivosParada.slice(0, 5).map((motivo) => (
                        <Badge key={motivo} variant="outline" className="bg-background">
                          {motivo}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-muted-foreground">Sem motivo de parada relevante no periodo.</div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={onOpenDetailedDecision}>
              <Eye className="mr-2 h-4 w-4" />
              Ver analise completa
            </Button>
            <Button type="button" variant="outline" onClick={onOpenNeeds}>
              <AlertCircle className="mr-2 h-4 w-4" />
              Ver necessidades
            </Button>
            <Button type="button" variant="outline" onClick={onOpenLife}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Ver vida util
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
