import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, Clock, TrendingUp, Zap, AlertCircle, Info, ChevronDown, ChevronUp, Sliders, HelpCircle, Sparkles, ListOrdered, X, Loader2, Settings, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { gerarParecerLocal, gerarRankingLocal, chamarLLMExterna } from "@/services/llm";
import type { ParecerData, RankingData, MatrizContexto, LLMProvider } from "@/types/llm";
import { getCurrentSession } from "@/services/auth";

// Tooltips explicativos para leigos
const TOOLTIPS = {
  scoreUnico: "Pontuação de 0 a 100 que indica o risco de ruptura. Quanto maior, mais urgente é a reposição.",
  vidaUtil: "Quanto tempo a matriz ainda pode ser usada? Baseado na capacidade restante e demanda mensal.",
  pressaoDemanda: "A demanda está crescendo? Quanto mais cresce, mais rápido a matriz se esgota.",
  desempenho: "A matriz está produzindo bem? Problemas de eficiência aceleram o desgaste.",
  riscoOperacional: "Quantas sequências backup existem? Se apenas 1, há risco de parar a produção.",
  cobertura: "Meses restantes até a matriz se esgotar. Menos de 1 mês é crítico.",
  desgaste: "Quanto da capacidade total já foi usado? 100% significa matriz no limite.",
  eol: "Dias até o fim da vida útil. Negativo significa já passou da data.",
  crescimento: "Aumento da demanda nos últimos 6 meses comparado aos 12 meses anteriores.",
  seqAtivas: "Quantas sequências diferentes estão em uso? Mais = mais segurança.",
};

const STATUS_EXPLICACAO = {
  confeccionar: "Risco ALTO: Confeccione uma nova matriz AGORA. A atual pode falhar em breve.",
  planejar: "Risco MÉDIO: Comece o processo de reposição nos próximos 30-60 dias.",
  ok: "Risco BAIXO: A matriz está saudável. Reavaliar em 30 dias.",
};

type DecisaoRow = {
  matriz: string;
  seq_ativas: number;
  cap_total: number;
  cap_restante: number;
  demanda_media_mensal: number | null;
  meses_cobertura: number | null;
  data_eol: string | null;
  data_pedido: string | null;
  produtividade_score?: number;
  eficiencia_media?: number;
};

type SequenciaRow = {
  matriz: string;
  seq: string | null;
  ativa: string | null;
  cap_total_seq: number;
  cap_restante_seq: number;
  demanda_mensal_seq: number | null;
  meses_cobertura_seq: number | null;
  data_eol_seq: string | null;
  produzido_seq: number;
};

type DecisaoScore = {
  scoreVida: number;
  scoreDemanda: number;
  scoreDesempenho: number;
  scoreOperacional: number;
  scoreTotal: number;
  status: "confeccionar" | "planejar" | "ok";
  motivos: string[];
};

type SimuladorState = {
  demandaAumento: number;
  sequenciasAdicionais: number;
  resetarDesgaste: boolean;
};

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateBR(iso?: string | null) {
  if (!iso) return "";
  const s = String(iso);
  const y = s.slice(0, 4);
  const m = s.slice(5, 7);
  const d = s.slice(8, 10);
  return `${d}/${m}/${y}`;
}

function formatNumberBR(n?: number | null) {
  if (n == null || !isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addMonthsApprox(baseISO: string, months: number) {
  const dt = new Date(baseISO + "T00:00:00");
  const intm = Math.max(0, Math.floor(months));
  dt.setMonth(dt.getMonth() + intm);
  const frac = Math.max(0, months - intm);
  if (frac > 0) dt.setDate(dt.getDate() + Math.round(frac * 30));
  return toISO(dt);
}

function calcularScoreVida(
  mesesCobertura: number | null,
  desgaste: number,
  diasEOL: number | null
): number {
  let score = 0;

  // Cobertura (50%)
  if (mesesCobertura == null) {
    score += 0;
  } else if (mesesCobertura <= 0) {
    score += 50;
  } else if (mesesCobertura <= 1) {
    score += 45;
  } else if (mesesCobertura <= 2) {
    score += 35;
  } else if (mesesCobertura <= 3) {
    score += 25;
  } else if (mesesCobertura <= 6) {
    score += 12.5;
  }

  // EOL (30%)
  if (diasEOL == null) {
    score += 0;
  } else if (diasEOL <= 0) {
    score += 30;
  } else if (diasEOL <= 30) {
    score += 24;
  } else if (diasEOL <= 60) {
    score += 18;
  } else if (diasEOL <= 90) {
    score += 12;
  }

  // Desgaste (20%)
  if (desgaste >= 0.9) {
    score += 20;
  } else if (desgaste >= 0.8) {
    score += 16;
  } else if (desgaste >= 0.7) {
    score += 12;
  } else if (desgaste >= 0.5) {
    score += 8;
  } else if (desgaste >= 0.3) {
    score += 4;
  }

  return Math.min(100, score);
}

function calcularScoreDemanda(
  demandaMensal: number | null,
  mesesCobertura: number | null,
  crescimento: number
): number {
  let score = 0;

  // Crescimento (60%)
  if (crescimento <= 1.0) {
    score += 0;
  } else if (crescimento <= 1.1) {
    score += 18;
  } else if (crescimento <= 1.2) {
    score += 36;
  } else if (crescimento <= 1.3) {
    score += 48;
  } else if (crescimento <= 1.4) {
    score += 54;
  } else {
    score += 60;
  }

  // Demanda (40%) - normalizar por 5000 kg/mês como referência
  if (demandaMensal == null || demandaMensal <= 0) {
    score += 0;
  } else {
    const demandaNorm = Math.min(1, demandaMensal / 5000);
    score += demandaNorm * 40;
  }

  return Math.min(100, score);
}

function calcularScoreDesempenho(produtividadeScore: number, eficienciaMedia: number): number {
  // Baseado na eficiência real:
  // >= 86%: extraordinário (risco 0)
  // >= 85%: bom (risco baixo ~10)
  // 50-85%: atenção (risco moderado 20-50)
  // < 50%: crítico (risco alto 60-100)
  
  const efic = eficienciaMedia || 0;
  
  let riscoEficiencia: number;
  if (efic >= 86) {
    riscoEficiencia = 0; // Extraordinário
  } else if (efic >= 85) {
    riscoEficiencia = 10; // Bom
  } else if (efic >= 70) {
    riscoEficiencia = 20 + (85 - efic) * 1; // 20-35
  } else if (efic >= 50) {
    riscoEficiencia = 35 + (70 - efic) * 1.5; // 35-65
  } else {
    riscoEficiencia = 65 + (50 - efic) * 0.7; // 65-100
  }
  
  return Math.min(100, Math.max(0, riscoEficiencia));
}

function calcularScoreOperacional(
  seqAtivas: number,
  demandaMensal: number | null,
  seqInsuficientes: boolean
): number {
  let score = 0;

  // Single point of failure (50%)
  if (seqAtivas <= 1 && demandaMensal && demandaMensal > 0) {
    score += 50;
  } else if (seqAtivas <= 2) {
    score += 25;
  }

  // Sequências insuficientes (50%)
  if (seqInsuficientes) {
    score += 50;
  }

  return Math.min(100, score);
}

function calcularDiasEOL(dataEOL: string | null): number | null {
  if (!dataEOL) return null;
  const eol = new Date(dataEOL + "T00:00:00");
  const hoje = new Date();
  const diffMs = eol.getTime() - hoje.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function calcularDesgaste(produzido: number, capTotal: number): number {
  if (capTotal <= 0) return 0;
  return Math.min(1, produzido / capTotal);
}

function calcularScore(
  row: DecisaoRow,
  simulador: SimuladorState,
  crescimento: number
): DecisaoScore {
  // Aplicar simulador
  const demandaAjustada = (row.demanda_media_mensal || 0) * (1 + simulador.demandaAumento / 100);
  const seqAtivasAjustadas = row.seq_ativas + simulador.sequenciasAdicionais;
  const capRestanteAjustado = simulador.resetarDesgaste ? row.cap_total : row.cap_restante;
  const desgasteAjustado = calcularDesgaste(row.cap_total - capRestanteAjustado, row.cap_total);

  // Recalcular cobertura com simulador
  let mesesCoberturaAjustada = row.meses_cobertura;
  if (demandaAjustada > 0 && capRestanteAjustado > 0) {
    mesesCoberturaAjustada = capRestanteAjustado / demandaAjustada;
  }

  // Calcular dias até EOL
  const diasEOL = calcularDiasEOL(row.data_eol);

  // Calcular scores por dimensão
  const scoreVida = calcularScoreVida(mesesCoberturaAjustada, desgasteAjustado, diasEOL);
  const scoreDemanda = calcularScoreDemanda(demandaAjustada, mesesCoberturaAjustada, crescimento);
  const scoreDesempenho = calcularScoreDesempenho(row.produtividade_score || 50, row.eficiencia_media || 50);

  // Sequências insuficientes: se demanda > 30.000 kg/mês por seq, é insuficiente
  const demandaPorSeq = seqAtivasAjustadas > 0 ? demandaAjustada / seqAtivasAjustadas : 0;
  const seqInsuficientes = demandaPorSeq > 30000;
  const scoreOperacional = calcularScoreOperacional(seqAtivasAjustadas, demandaAjustada, seqInsuficientes);

  // Score total (pesos: Vida 40%, Demanda 30%, Desempenho 20%, Operacional 10%)
  const scoreTotal = scoreVida * 0.4 + scoreDemanda * 0.3 + scoreDesempenho * 0.2 + scoreOperacional * 0.1;

  // Status
  let status: "confeccionar" | "planejar" | "ok" = "ok";
  if (scoreTotal >= 70) {
    status = "confeccionar";
  } else if (scoreTotal >= 40) {
    status = "planejar";
  }

  // Motivos
  const motivos: string[] = [];
  if (crescimento > 1.15) {
    motivos.push(`Demanda cresceu ${((crescimento - 1) * 100).toFixed(0)}% (6m vs 12m)`);
  }
  if (mesesCoberturaAjustada != null && mesesCoberturaAjustada <= 2) {
    motivos.push(`Cobertura estimada: ${mesesCoberturaAjustada.toFixed(1)} mês(es)`);
  }
  if (desgasteAjustado >= 0.8) {
    motivos.push(`Desgaste acumulado: ${(desgasteAjustado * 100).toFixed(0)}%`);
  }
  if (seqAtivasAjustadas <= 1 && demandaAjustada > 0) {
    motivos.push(`Apenas ${seqAtivasAjustadas} sequência(s) ativa(s) para atender demanda`);
  }
  if (seqInsuficientes) {
    motivos.push(`Sequências insuficientes para demanda (${demandaPorSeq.toFixed(0)} kg/mês por seq)`);
  }
  if (diasEOL != null && diasEOL <= 30) {
    motivos.push(`EOL próximo: ${diasEOL} dias`);
  }

  return {
    scoreVida,
    scoreDemanda,
    scoreDesempenho,
    scoreOperacional,
    scoreTotal: Math.min(100, scoreTotal),
    status,
    motivos: motivos.slice(0, 6),
  };
}

export function AnalysisDecisaoReposicaoView() {
  const [rows, setRows] = useState<DecisaoRow[]>([]);
  const [seqRows, setSeqRows] = useState<SequenciaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMatriz, setSearchMatriz] = useState("");
  const [selectedMatriz, setSelectedMatriz] = useState<string | null>(null);
  const [selectedSeq, setSelectedSeq] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "acompanhamento" | "planejar">("todos");
  const [matrizesComObservacoes, setMatrizesComObservacoes] = useState<Set<string>>(new Set());
  const [simulador, setSimulador] = useState<SimuladorState>({
    demandaAumento: 0,
    sequenciasAdicionais: 0,
    resetarDesgaste: false,
  });
  const [expandedMatriz, setExpandedMatriz] = useState<string | null>(null);

  // Estados para LLM
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmParecer, setLlmParecer] = useState<ParecerData | null>(null);
  const [llmRanking, setLlmRanking] = useState<RankingData | null>(null);
  const [llmProducao6m, setLlmProducao6m] = useState<{
    historico_mensal: Array<{ mes: string; avg_produtividade: number | null; avg_eficiencia: number | null; registros: number }>;
    observacoes_lote: string[];
    ligas_utilizadas: string[];
    ref_produtividade: { objetivo_alto: number; objetivo_baixo: number; media_geral: number | null; pct_acima_objetivo: number | null };
  } | null>(null);
  const [showLlmModal, setShowLlmModal] = useState<'parecer' | 'ranking' | 'config' | null>(null);
  const [llmFonte, setLlmFonte] = useState<'local' | LLMProvider>('local');

  // Configurações LLM (salvas no Supabase)
  const [llmConfig, setLlmConfig] = useState<{
    provider: LLMProvider;
    openrouterKey: string;
    googleKey: string;
    groqKey: string;
    openaiKey: string;
  }>({
    provider: 'openrouter',
    openrouterKey: '',
    googleKey: '',
    groqKey: '',
    openaiKey: '',
  });
  const [showKeys, setShowKeys] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // Carregar configurações do Supabase
  useEffect(() => {
    async function loadLlmConfig() {
      try {
        const session = getCurrentSession();
        if (!session?.user?.id) return;

        const { data, error } = await supabase
          .from('llm_config')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (data && !error) {
          setLlmConfig({
            provider: (data.provider as LLMProvider) || 'openrouter',
            openrouterKey: data.openrouter_key || '',
            googleKey: data.google_key || '',
            groqKey: data.groq_key || '',
            openaiKey: data.openai_key || '',
          });
        }
      } catch (err) {
        console.error('[LLM Config] Erro ao carregar:', err);
      }
    }
    loadLlmConfig();
  }, []);

  // Salvar configurações no Supabase
  const salvarConfigLLM = async () => {
    setConfigSaving(true);
    try {
      const session = getCurrentSession();
      if (!session?.user?.id) {
        alert('Você precisa estar logado para salvar configurações.');
        return;
      }

      const configData = {
        user_id: session.user.id,
        provider: llmConfig.provider,
        openrouter_key: llmConfig.openrouterKey || null,
        google_key: llmConfig.googleKey || null,
        groq_key: llmConfig.groqKey || null,
        openai_key: llmConfig.openaiKey || null,
      };

      const { error } = await supabase
        .from('llm_config')
        .upsert(configData, { onConflict: 'user_id' });

      if (error) throw error;
      setShowLlmModal(null);
    } catch (err) {
      console.error('[LLM Config] Erro ao salvar:', err);
      alert('Erro ao salvar configurações. Tente novamente.');
    } finally {
      setConfigSaving(false);
    }
  };

  // Carregar dados de Vida, Carteira e Produtividade
  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        // Carregar dados de Vida
        const { data: vidaData, error: vidaErr } = await supabase.rpc("matrix_lifespan_summary");
        if (vidaErr) throw vidaErr;
        if (!active) return;

        // Carregar dados de Carteira (crescimento)
        const { data: carteiraData, error: carteiraErr } = await supabase.rpc("analysis_carteira_flat_agg", {
          cliente_filter: null,
          ferramenta_filter: null,
          period_start: null,
          period_end: null,
        });
        if (carteiraErr) throw carteiraErr;
        if (!active) return;

        // Carregar dados de Produtividade
        const { data: prodData, error: prodErr } = await supabase.rpc("get_productivity_stats", {
          p_months_back: 12,
          p_matriz_filter: null,
          p_prensa_filter: null,
          p_seq_filter: null,
          p_liga_filter: null,
        });
        if (prodErr) throw prodErr;
        if (!active) return;

        // Mapear dados de carteira por matriz (crescimento 6m vs 12m)
        const carteiraMap: Record<string, { avg6m: number; avg12m: number }> = {};
        (carteiraData || []).forEach((row: any) => {
          const matriz = (row.ferramenta || "").toUpperCase().trim();
          carteiraMap[matriz] = {
            avg6m: row.avg6m || 0,
            avg12m: row.avg12m || 0,
          };
        });

        // Mapear dados de produtividade por matriz
        const prodMap: Record<string, { produtividade_score: number; eficiencia_media: number }> = {};
        (prodData || []).forEach((row: any) => {
          const matriz = (row.matriz || "").toUpperCase().trim();
          prodMap[matriz] = {
            produtividade_score: row.avg_produtividade || 50,
            eficiencia_media: row.avg_eficiencia || 50,
          };
        });

        // Mapear dados de vida com crescimento e produtividade
        const mapped: DecisaoRow[] = (vidaData || []).map((row: any) => {
          const matriz = (row.matriz || "").toUpperCase().trim();
          const carteira = carteiraMap[matriz];
          const prod = prodMap[matriz];

          return {
            matriz: row.matriz || "",
            seq_ativas: row.seq_ativas || 0,
            cap_total: row.cap_total || 0,
            cap_restante: row.cap_restante || 0,
            demanda_media_mensal: row.demanda_media_mensal,
            meses_cobertura: row.meses_cobertura,
            data_eol: row.data_eol,
            data_pedido: row.data_pedido,
            produtividade_score: prod?.produtividade_score || 50,
            eficiencia_media: prod?.eficiencia_media || 50,
          };
        });

        setRows(mapped);
      } catch (e: any) {
        if (!active) return;
        console.error("Erro ao carregar dados:", e);
        setError(e?.message ?? "Erro ao carregar dados");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, []);

  // Carregar dados de sequências quando matriz é selecionada
  useEffect(() => {
    if (!selectedMatriz) {
      setSeqRows([]);
      return;
    }

    let active = true;
    async function loadSeqData() {
      try {
        console.log("[Sequências] Carregando para matriz:", selectedMatriz);
        const { data, error: err } = await supabase.rpc("matrix_lifespan_by_sequence", {
          matriz_code: selectedMatriz,
          period_end: null,
          months: 12,
          lead_time_days: 20,
        });
        if (err) {
          console.error("[Sequências] Erro RPC:", err);
          throw err;
        }
        if (!active) return;

        console.log("[Sequências] Dados recebidos:", data);

        const mapped: SequenciaRow[] = (data || []).map((row: any) => ({
          matriz: row.matriz || "",
          seq: row.seq,
          ativa: row.ativa,
          cap_total_seq: row.cap_total_seq || 0,
          cap_restante_seq: row.cap_restante_seq || 0,
          demanda_mensal_seq: row.demanda_mensal_seq,
          meses_cobertura_seq: row.meses_cobertura_seq,
          data_eol_seq: row.data_eol_seq,
          produzido_seq: row.produzido_seq || 0,
        }));

        console.log("[Sequências] Mapeadas:", mapped);
        setSeqRows(mapped);
      } catch (e: any) {
        console.error("[Sequências] Erro ao carregar:", e);
        setSeqRows([]);
      }
    }
    loadSeqData();
    return () => {
      active = false;
    };
  }, [selectedMatriz]);

  // Carregar matrizes com observações na Produtividade
  useEffect(() => {
    async function loadMatrizesComObs() {
      try {
        const { data, error } = await supabase
          .from('analysis_producao')
          .select('matriz')
          .not('observacao_lote', 'is', null)
          .neq('observacao_lote', '');
        
        if (error) throw error;
        
        const matrizes = new Set<string>();
        (data || []).forEach((row: any) => {
          if (row.matriz) matrizes.add(row.matriz.toUpperCase().trim());
        });
        setMatrizesComObservacoes(matrizes);
        console.log('[Acompanhamento] Matrizes com observações:', matrizes.size);
      } catch (err) {
        console.error('[Acompanhamento] Erro ao buscar observações:', err);
      }
    }
    loadMatrizesComObs();
  }, []);

  // Calcular crescimento (6m vs 12m) - integrado com dados de carteira
  const crescimentoMap = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((row) => {
      // Crescimento será calculado quando os dados de carteira forem carregados
      // Por enquanto, usar 1.0 como padrão (sem crescimento)
      map[row.matriz] = 1.0;
    });
    return map;
  }, [rows]);

  // Filtrar e ordenar matrizes
  const matrizesProcessadas = useMemo(() => {
    return rows
      .map((row) => {
        const crescimento = crescimentoMap[row.matriz] || 1.0;
        const score = calcularScore(row, simulador, crescimento);
        return { ...row, score, crescimento };
      })
      .filter((item) => {
        const matchSearch = item.matriz.toLowerCase().includes(searchMatriz.toLowerCase());
        const matchStatus =
          filtroStatus === "todos" ||
          (filtroStatus === "acompanhamento" && matrizesComObservacoes.has(item.matriz)) ||
          (filtroStatus === "planejar" && item.score.status === "planejar");
        return matchSearch && matchStatus;
      })
      .sort((a, b) => b.score.scoreTotal - a.score.scoreTotal);
  }, [rows, searchMatriz, filtroStatus, simulador, crescimentoMap, matrizesComObservacoes]);

  // Dados da matriz selecionada
  const selectedMatrizData = useMemo(() => {
    if (!selectedMatriz) return null;
    const item = matrizesProcessadas.find((x) => x.matriz === selectedMatriz);
    return item || null;
  }, [selectedMatriz, matrizesProcessadas]);

  // Dados da sequência selecionada
  const selectedSeqData = useMemo(() => {
    if (!selectedSeq) return null;
    return seqRows.find((x) => x.seq === selectedSeq) || null;
  }, [selectedSeq, seqRows]);

  const getStatusColor = (status: string) => {
    if (status === "confeccionar") return "bg-red-100 border-red-300 text-red-900";
    if (status === "planejar") return "bg-yellow-100 border-yellow-300 text-yellow-900";
    return "bg-green-100 border-green-300 text-green-900";
  };

  const getStatusLabel = (status: string) => {
    if (status === "confeccionar") return "Confeccionar Imediatamente";
    if (status === "planejar") return "Planejar Reposição";
    return "Não Necessita Reposição";
  };

  const getStatusIcon = (status: string) => {
    if (status === "confeccionar") return <AlertTriangle className="w-5 h-5" />;
    if (status === "planejar") return <AlertCircle className="w-5 h-5" />;
    return <CheckCircle2 className="w-5 h-5" />;
  };

  // Buscar dados de produção dos últimos 6 meses
  const buscarDadosProducao6m = async (matrizCodigo: string) => {
    try {
      // Buscar dados de produtividade dos últimos 6 meses
      const { data: prodData } = await supabase.rpc("get_productivity_stats", {
        p_months_back: 6,
        p_matriz_filter: matrizCodigo,
        p_prensa_filter: null,
        p_seq_filter: null,
        p_liga_filter: null,
      });

      // Buscar observações de lote da tabela analysis_producao
      const { data: obsData } = await supabase
        .from("analysis_producao")
        .select("payload")
        .ilike("payload->>Matriz", `%${matrizCodigo}%`)
        .not("payload->>Observação Lote", "is", null)
        .order("produced_on", { ascending: false })
        .limit(20);

      const historicoMensal = (prodData || []).map((row: any) => ({
        mes: row.month,
        avg_produtividade: row.avg_produtividade,
        avg_eficiencia: row.avg_eficiencia,
        registros: row.total_records || 0,
      }));

      // Extrair observações únicas não vazias
      const observacoesLote = [...new Set(
        (obsData || [])
          .map((r: any) => r.payload?.["Observação Lote"] || r.payload?.["Observacao Lote"])
          .filter((obs: string | null) => obs && obs.trim().length > 0)
      )].slice(0, 10) as string[];

      // Extrair ligas e códigos de parada
      const ligasSet = new Set<string>();
      const paradasSet = new Set<string>();
      (prodData || []).forEach((row: any) => {
        if (row.liga_data) {
          Object.keys(row.liga_data).forEach(liga => ligasSet.add(liga));
        }
      });

      // Calcular média geral e % acima do objetivo
      const todasProdutividades = (prodData || [])
        .map((r: any) => r.avg_produtividade)
        .filter((v: number | null) => v !== null) as number[];
      
      const mediaGeral = todasProdutividades.length > 0
        ? todasProdutividades.reduce((a, b) => a + b, 0) / todasProdutividades.length
        : null;
      
      const pctAcimaObjetivo = todasProdutividades.length > 0
        ? (todasProdutividades.filter(v => v >= 1000).length / todasProdutividades.length) * 100
        : null;

      return {
        historico_mensal: historicoMensal,
        observacoes_lote: observacoesLote,
        ligas_utilizadas: Array.from(ligasSet),
        codigos_parada: Array.from(paradasSet),
        ref_produtividade: {
          objetivo_alto: 1300,
          objetivo_baixo: 1000,
          media_geral: mediaGeral,
          pct_acima_objetivo: pctAcimaObjetivo,
        },
      };
    } catch (err) {
      console.error("[LLM] Erro ao buscar dados de produção:", err);
      return {
        historico_mensal: [],
        observacoes_lote: [],
        ligas_utilizadas: [],
        codigos_parada: [],
        ref_produtividade: {
          objetivo_alto: 1300,
          objetivo_baixo: 1000,
          media_geral: null,
          pct_acima_objetivo: null,
        },
      };
    }
  };

  // Converter dados para contexto LLM
  const converterParaContextoLLM = (
    item: typeof matrizesProcessadas[0],
    producao6m?: Awaited<ReturnType<typeof buscarDadosProducao6m>>
  ): MatrizContexto => {
    const desgastePct = item.cap_total > 0 ? ((item.cap_total - item.cap_restante) / item.cap_total) * 100 : 0;
    
    // Calcular tendência baseada no histórico mensal
    let tendencia: 'subindo' | 'estavel' | 'caindo' | null = null;
    if (producao6m?.historico_mensal && producao6m.historico_mensal.length >= 3) {
      const prods = producao6m.historico_mensal
        .slice(0, 3)
        .map(h => h.avg_produtividade)
        .filter((v): v is number => v !== null);
      if (prods.length >= 2) {
        const diff = prods[0] - prods[prods.length - 1];
        if (diff > 50) tendencia = 'subindo';
        else if (diff < -50) tendencia = 'caindo';
        else tendencia = 'estavel';
      }
    }

    return {
      codigo: item.matriz,
      vida: {
        cap_total: item.cap_total,
        cap_restante: item.cap_restante,
        desgaste_pct: desgastePct,
        meses_cobertura: item.meses_cobertura || 0,
        eol_previsto: item.data_eol,
        seq_ativas: item.seq_ativas,
      },
      demanda: {
        total_kg: (item.demanda_media_mensal || 0) * 12,
        media_mensal_kg: item.demanda_media_mensal || 0,
        qtd_pedidos: 0,
        qtd_clientes: 0,
        crescimento_pct: item.crescimento,
      },
      abc: { classe: null, ranking_kg: null },
      produtividade: {
        // CORRIGIDO: usar média real de producao6m, não o score
        media_prod: producao6m?.ref_produtividade?.media_geral || null,
        media_efic: producao6m?.historico_mensal?.length
          ? producao6m.historico_mensal.reduce((acc, h) => acc + (h.avg_eficiencia || 0), 0) / producao6m.historico_mensal.length
          : (item.eficiencia_media || null),
        tendencia,
        min_prod: producao6m?.historico_mensal?.length 
          ? Math.min(...producao6m.historico_mensal.map(h => h.avg_produtividade || Infinity).filter(v => v !== Infinity))
          : null,
        max_prod: producao6m?.historico_mensal?.length
          ? Math.max(...producao6m.historico_mensal.map(h => h.avg_produtividade || -Infinity).filter(v => v !== -Infinity))
          : null,
        total_registros: producao6m?.historico_mensal?.reduce((acc, h) => acc + h.registros, 0) || 0,
      },
      producao_6m: producao6m || {
        historico_mensal: [],
        observacoes_lote: [],
        ligas_utilizadas: [],
        codigos_parada: [],
        ref_produtividade: {
          objetivo_alto: 1300,
          objetivo_baixo: 1000,
          media_geral: null,
          pct_acima_objetivo: null,
        },
      },
      score_atual: {
        total: item.score.scoreTotal,
        vida: item.score.scoreVida,
        demanda: item.score.scoreDemanda,
        desempenho: item.score.scoreDesempenho,
        operacional: item.score.scoreOperacional,
        status: item.score.status,
      },
      ultima_atividade: {
        ultima_producao: null,
        ultimo_pedido: null,
        dias_parada: null,
      },
    };
  };

  // Gerar parecer para matriz selecionada
  const handleGerarParecer = async () => {
    if (!selectedMatrizData) return;
    setLlmLoading(true);
    try {
      // Buscar dados de produção dos últimos 6 meses
      const producao6m = await buscarDadosProducao6m(selectedMatrizData.matriz);
      setLlmProducao6m(producao6m);
      const contexto = converterParaContextoLLM(selectedMatrizData, producao6m);

      // Verificar se há keys configuradas para tentar LLM externa
      const temKeys = llmConfig.openrouterKey || llmConfig.groqKey || llmConfig.googleKey || llmConfig.openaiKey;
      
      if (temKeys) {
        // Tentar LLM externa primeiro
        console.log('[LLM] Tentando análise via LLM externa...');
        const resultado = await chamarLLMExterna(contexto, {
          provider: llmConfig.provider,
          openrouterKey: llmConfig.openrouterKey || undefined,
          groqKey: llmConfig.groqKey || undefined,
          googleKey: llmConfig.googleKey || undefined,
          openaiKey: llmConfig.openaiKey || undefined,
        });

        if (resultado.ok) {
          setLlmParecer(resultado.data);
          setLlmFonte(resultado.provider);
          setShowLlmModal('parecer');
          return;
        } else {
          console.warn('[LLM] Falha na LLM externa, usando fallback local:', 'error' in resultado ? resultado.error : 'erro desconhecido');
        }
      }

      // Fallback: usar análise local
      console.log('[LLM] Usando análise local...');
      const parecer = gerarParecerLocal(contexto);
      setLlmParecer(parecer);
      setLlmFonte('local');
      setShowLlmModal('parecer');
    } catch (err) {
      console.error('[LLM] Erro ao gerar parecer:', err);
    } finally {
      setLlmLoading(false);
    }
  };

  // Gerar ranking diário
  const handleGerarRanking = async () => {
    setLlmLoading(true);
    try {
      const contextos = matrizesProcessadas.map(item => converterParaContextoLLM(item));
      const ranking = gerarRankingLocal(contextos);
      setLlmRanking(ranking);
      setShowLlmModal('ranking');
    } catch (err) {
      console.error('[LLM] Erro ao gerar ranking:', err);
    } finally {
      setLlmLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Filtros */}
      <div className="flex gap-3 items-center flex-wrap">
        <Input
          placeholder="Buscar matriz..."
          value={searchMatriz}
          onChange={(e) => setSearchMatriz(e.target.value)}
          className="w-48"
        />
        <div className="flex gap-2">
          <Button
            variant={filtroStatus === "todos" ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltroStatus("todos")}
          >
            Todas
          </Button>
          <Button
            variant={filtroStatus === "acompanhamento" ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltroStatus("acompanhamento")}
            className="bg-blue-600 hover:bg-blue-700"
          >
            📋 Acompanhamento
          </Button>
          <Button
            variant={filtroStatus === "planejar" ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltroStatus("planejar")}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            Planejar
          </Button>
        </div>

        {/* Botões LLM */}
        <div className="flex gap-2 ml-auto items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGerarRanking}
                  disabled={llmLoading || matrizesProcessadas.length === 0}
                  className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                >
                  {llmLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ListOrdered className="w-4 h-4 mr-1" />}
                  Ranking do Dia
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Gera um ranking das Top 50 matrizes que mais precisam de atenção hoje</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGerarParecer}
                  disabled={llmLoading || !selectedMatriz}
                  className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  {llmLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Gerar Parecer
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Gera um parecer técnico detalhado para a matriz selecionada</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLlmModal('config')}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Configurações do modelo LLM e API keys</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Layout: Lista + Detalhe */}
      <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
        {/* Lista de Matrizes - com altura máxima e scroll */}
        <div className="w-96 border rounded-lg flex flex-col flex-shrink-0">
          {/* Filtros e cabeçalho */}
          <div className="p-2 border-b bg-gray-50 flex-shrink-0">
            {/* Conteúdo de filtros já está acima */}
          </div>
          
          {/* Lista com scroll */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Carregando...</div>
            ) : error ? (
              <div className="p-4 text-center text-red-500">{error}</div>
            ) : matrizesProcessadas.length === 0 ? (
              <div className="p-4 text-center text-gray-500">Nenhuma matriz encontrada</div>
            ) : (
              <div className="space-y-2 p-2">
                {matrizesProcessadas.map((item) => (
                  <div
                    key={item.matriz}
                    className={`p-3 border rounded cursor-pointer transition ${
                      selectedMatriz === item.matriz
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => {
                      setSelectedMatriz(item.matriz);
                      setSelectedSeq(null);
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{item.matriz}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-help ${getStatusColor(item.score.status)}`}>
                              {getStatusIcon(item.score.status)}
                              {item.score.scoreTotal.toFixed(0)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>
                              <strong>Score de Risco: {item.score.scoreTotal.toFixed(0)}/100</strong><br/>
                              Quanto maior, mais urgente é a reposição.<br/>
                              <br/>
                              <strong>Composição:</strong><br/>
                              • Vida Útil: {item.score.scoreVida.toFixed(0)} (40%)<br/>
                              • Demanda: {item.score.scoreDemanda.toFixed(0)} (30%)<br/>
                              • Desempenho: {item.score.scoreDesempenho.toFixed(0)} (20%)<br/>
                              • Operacional: {item.score.scoreOperacional.toFixed(0)} (10%)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>Cobertura: {item.meses_cobertura?.toFixed(1) || "N/A"} mês(es)</div>
                      <div>Seq. ativas: {item.seq_ativas}</div>
                      <div>Crescimento: {((item.crescimento - 1) * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Painel de Detalhe */}
        <div className="flex-1 overflow-y-auto">
          {!selectedMatriz ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Selecione uma matriz para ver detalhes
            </div>
          ) : selectedMatrizData ? (
            <Tabs defaultValue="decisao" className="h-full flex flex-col">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="decisao">Decisão</TabsTrigger>
                <TabsTrigger value="sequencias">Sequências</TabsTrigger>
                <TabsTrigger value="simulador">Simulador</TabsTrigger>
              </TabsList>

              {/* Aba: Decisão */}
              <TabsContent value="decisao" className="flex-1 overflow-y-auto space-y-4">
                {/* Hero Card */}
                <Card className={`p-6 border-2 ${getStatusColor(selectedMatrizData.score.status)}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold">{selectedMatriz}</h2>
                      <p className="text-sm opacity-75 mt-1">🤖 Análise com IA</p>
                    </div>
                    <div className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              <div className="text-4xl font-bold">{selectedMatrizData.score.scoreTotal.toFixed(0)}</div>
                              <p className="text-xs opacity-75">Score (0–100)</p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>{TOOLTIPS.scoreUnico}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-lg font-semibold flex items-center gap-2">
                      {getStatusIcon(selectedMatrizData.score.status)}
                      {getStatusLabel(selectedMatrizData.score.status)}
                    </div>
                    <p className="text-sm bg-white/30 p-2 rounded">
                      {STATUS_EXPLICACAO[selectedMatrizData.score.status as keyof typeof STATUS_EXPLICACAO]}
                    </p>
                  </div>
                </Card>

                {/* Diagnóstico Visual */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="font-semibold">Diagnóstico por Dimensão</h3>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Cada barra mostra o risco em uma área diferente. Vermelho = alto risco, Amarelo = médio, Verde = baixo.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: "Vida Útil", score: selectedMatrizData.score.scoreVida, weight: 40, tooltip: TOOLTIPS.vidaUtil },
                      { label: "Pressão de Demanda", score: selectedMatrizData.score.scoreDemanda, weight: 30, tooltip: TOOLTIPS.pressaoDemanda },
                      { label: "Desempenho", score: selectedMatrizData.score.scoreDesempenho, weight: 20, tooltip: TOOLTIPS.desempenho },
                      { label: "Risco Operacional", score: selectedMatrizData.score.scoreOperacional, weight: 10, tooltip: TOOLTIPS.riscoOperacional },
                    ].map((dim) => (
                      <div key={dim.label}>
                        <div className="flex justify-between text-sm mb-1 items-center">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{dim.label}</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="w-3 h-3 text-gray-400 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>{dim.tooltip}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <span className="text-xs text-gray-600">
                            {dim.score.toFixed(0)} ({dim.weight}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              dim.score >= 70
                                ? "bg-red-500"
                                : dim.score >= 40
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(100, dim.score)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Por que o sistema recomenda? */}
                {selectedMatrizData.score.motivos.length > 0 && (
                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-600" />
                      <span className="text-blue-900">Por que o sistema recomenda isso?</span>
                    </h3>
                    <p className="text-xs text-blue-700 mb-3 bg-white p-2 rounded">
                      Estes são os motivos principais que levaram a essa recomendação. Cada um é baseado em dados reais.
                    </p>
                    <ul className="space-y-2">
                      {selectedMatrizData.score.motivos.map((motivo, idx) => (
                        <li key={idx} className="text-sm text-gray-700 flex gap-2 bg-white p-2 rounded">
                          <span className="text-blue-500 font-bold">✓</span>
                          <span>{motivo}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Timeline de Risco Evoluída */}
                <Card className="p-4 bg-purple-50 border-purple-200">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="font-semibold text-purple-900">Timeline de Risco</h3>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-purple-600 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Evolução do risco ao longo do tempo. Verde = baixo, Amarelo = moderado, Vermelho = alto.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {/* Insight LLM na Timeline */}
                  {llmParecer && (
                    <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-xs font-semibold text-blue-700 mb-1">💡 Insight da Análise</div>
                          <div className="text-xs text-gray-700">{llmParecer.resumo_executivo}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {/* Barra de evolução de risco */}
                    <div className="flex items-center gap-1 mb-3">
                      <div className="text-xs text-gray-500">Risco:</div>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden flex">
                        <div 
                          className="h-full bg-green-500" 
                          style={{ width: `${Math.max(0, 40 - selectedMatrizData.score.scoreTotal)}%` }}
                        />
                        <div 
                          className="h-full bg-yellow-500" 
                          style={{ width: `${Math.min(30, Math.max(0, selectedMatrizData.score.scoreTotal - 40 + 30))}%` }}
                        />
                        <div 
                          className="h-full bg-red-500" 
                          style={{ width: `${Math.max(0, selectedMatrizData.score.scoreTotal - 70 + 30)}%` }}
                        />
                      </div>
                      <div className={`text-xs font-bold ${
                        selectedMatrizData.score.scoreTotal >= 70 ? 'text-red-600' :
                        selectedMatrizData.score.scoreTotal >= 40 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {selectedMatrizData.score.scoreTotal.toFixed(0)}%
                      </div>
                    </div>

                    {/* Timeline com cores */}
                    {[
                      {
                        label: "Hoje",
                        data: new Date().toISOString().split("T")[0],
                        desc: `Score atual: ${selectedMatrizData.score.scoreTotal.toFixed(0)}/100`,
                        icon: "📍",
                        risco: selectedMatrizData.score.status,
                        tipo: 'atual',
                      },
                      ...(llmProducao6m?.observacoes_lote?.length ? [{
                        label: "Última Observação",
                        data: null,
                        desc: llmProducao6m.observacoes_lote[0]?.substring(0, 60) + (llmProducao6m.observacoes_lote[0]?.length > 60 ? '...' : ''),
                        icon: "🔧",
                        risco: 'evento',
                        tipo: 'evento',
                      }] : []),
                      {
                        label: "+30 dias",
                        data: addMonthsApprox(new Date().toISOString().split("T")[0], 1),
                        desc: selectedMatrizData.score.scoreTotal >= 50 ? "Risco pode aumentar" : "Monitorar situação",
                        icon: "📆",
                        risco: selectedMatrizData.score.scoreTotal >= 60 ? 'confeccionar' : selectedMatrizData.score.scoreTotal >= 40 ? 'planejar' : 'ok',
                        tipo: 'projecao',
                      },
                      {
                        label: "+60 dias",
                        data: addMonthsApprox(new Date().toISOString().split("T")[0], 2),
                        desc: selectedMatrizData.score.scoreTotal >= 40 ? "Atenção redobrada necessária" : "Situação estável esperada",
                        icon: "📆",
                        risco: selectedMatrizData.score.scoreTotal >= 50 ? 'confeccionar' : selectedMatrizData.score.scoreTotal >= 30 ? 'planejar' : 'ok',
                        tipo: 'projecao',
                      },
                      {
                        label: "EOL Previsto",
                        data: selectedMatrizData.data_eol,
                        desc: "Fim da vida útil - matriz não pode mais ser usada",
                        icon: "⛔",
                        risco: 'confeccionar',
                        tipo: 'critico',
                      },
                      {
                        label: "📦 Data Ideal de Pedido",
                        data: selectedMatrizData.data_pedido,
                        desc: "Iniciar confecção (lead time: 20 dias)",
                        icon: "✅",
                        risco: 'acao',
                        tipo: 'acao',
                      },
                    ].map((item, idx) => {
                      const borderColor = 
                        item.tipo === 'critico' ? 'border-red-500' :
                        item.tipo === 'acao' ? 'border-green-500' :
                        item.tipo === 'evento' ? 'border-blue-400' :
                        item.risco === 'confeccionar' ? 'border-red-400' :
                        item.risco === 'planejar' ? 'border-yellow-400' :
                        'border-green-400';
                      
                      const bgColor = 
                        item.tipo === 'critico' ? 'bg-red-50' :
                        item.tipo === 'acao' ? 'bg-green-50' :
                        item.tipo === 'evento' ? 'bg-blue-50' :
                        'bg-white';

                      return (
                        <div key={idx} className={`flex gap-3 text-sm ${bgColor} p-2 rounded border-l-4 ${borderColor}`}>
                          <div className="text-lg">{item.icon}</div>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900">{item.label}</div>
                            {item.data && <div className="font-medium text-gray-700">{formatDateBR(item.data)}</div>}
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          {item.tipo !== 'evento' && item.tipo !== 'acao' && (
                            <div className={`self-center px-2 py-0.5 rounded text-xs font-semibold ${
                              item.risco === 'confeccionar' ? 'bg-red-200 text-red-800' :
                              item.risco === 'planejar' ? 'bg-yellow-200 text-yellow-800' :
                              'bg-green-200 text-green-800'
                            }`}>
                              {item.risco === 'confeccionar' ? '🔴' : item.risco === 'planejar' ? '🟡' : '🟢'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Legenda */}
                  <div className="mt-3 pt-2 border-t border-purple-200 flex gap-4 text-xs text-gray-600">
                    <span>🟢 Baixo</span>
                    <span>🟡 Moderado</span>
                    <span>🔴 Alto</span>
                  </div>
                </Card>

                {/* Ações Recomendadas */}
                <Card className="p-4 bg-orange-50 border-orange-200">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="font-semibold text-orange-900">O que fazer agora?</h3>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-orange-600 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Siga estas ações na ordem para evitar problemas de produção.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="space-y-2">
                    {selectedMatrizData.score.status === "confeccionar" && (
                      <>
                        <div className="text-sm p-3 bg-red-100 border-l-4 border-red-500 rounded">
                          <div className="font-semibold text-red-900">🚨 AÇÃO 1: Confeccionar nova matriz AGORA</div>
                          <div className="text-xs text-red-800 mt-1">Não espere. A matriz atual pode falhar em breve. Inicie o processo de confecção hoje mesmo.</div>
                        </div>
                        <div className="text-sm p-3 bg-red-100 border-l-4 border-red-500 rounded">
                          <div className="font-semibold text-red-900">📅 AÇÃO 2: Marcar data de pedido</div>
                          <div className="text-xs text-red-800 mt-1">Data ideal: <strong>{formatDateBR(selectedMatrizData.data_pedido)}</strong> (20 dias antes do fim de vida)</div>
                        </div>
                        <div className="text-sm p-3 bg-red-100 border-l-4 border-red-500 rounded">
                          <div className="font-semibold text-red-900">🔄 AÇÃO 3: Considerar sequência backup</div>
                          <div className="text-xs text-red-800 mt-1">Você tem apenas {selectedMatrizData.seq_ativas} sequência(s). Adicionar uma cópia reduz risco de parada.</div>
                        </div>
                      </>
                    )}
                    {selectedMatrizData.score.status === "planejar" && (
                      <>
                        <div className="text-sm p-3 bg-yellow-100 border-l-4 border-yellow-600 rounded">
                          <div className="font-semibold text-yellow-900">📋 AÇÃO 1: Planejar reposição</div>
                          <div className="text-xs text-yellow-800 mt-1">Não é urgente, mas comece o processo nos próximos 30-60 dias. Não deixe para última hora.</div>
                        </div>
                        <div className="text-sm p-3 bg-yellow-100 border-l-4 border-yellow-600 rounded">
                          <div className="font-semibold text-yellow-900">📊 AÇÃO 2: Monitorar demanda</div>
                          <div className="text-xs text-yellow-800 mt-1">Acompanhe se a demanda está crescendo. Se crescer muito, avance para "Confeccionar".</div>
                        </div>
                        <div className="text-sm p-3 bg-yellow-100 border-l-4 border-yellow-600 rounded">
                          <div className="font-semibold text-yellow-900">🔧 AÇÃO 3: Preparar especificações</div>
                          <div className="text-xs text-yellow-800 mt-1">Reúna as informações técnicas (material, dimensões, etc.) para quando for hora de pedir.</div>
                        </div>
                      </>
                    )}
                    {selectedMatrizData.score.status === "ok" && (
                      <>
                        <div className="text-sm p-3 bg-green-100 border-l-4 border-green-600 rounded">
                          <div className="font-semibold text-green-900">✅ AÇÃO 1: Reavaliar em 30 dias</div>
                          <div className="text-xs text-green-800 mt-1">A matriz está saudável. Volte aqui em um mês para verificar se algo mudou.</div>
                        </div>
                        <div className="text-sm p-3 bg-green-100 border-l-4 border-green-600 rounded">
                          <div className="font-semibold text-green-900">👀 AÇÃO 2: Manter monitoramento</div>
                          <div className="text-xs text-green-800 mt-1">Continue acompanhando a cobertura. Se cair abaixo de 2 meses, mude para "Planejar".</div>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              </TabsContent>

              {/* Aba: Sequências */}
              <TabsContent value="sequencias" className="flex-1 overflow-y-auto">
                <Card className="p-4">
                  <h3 className="font-semibold mb-4">Análise por Sequência</h3>
                  {seqRows.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">Nenhuma sequência encontrada</div>
                  ) : (
                    <div className="space-y-3">
                      {seqRows.map((seq) => (
                        <div
                          key={seq.seq}
                          className={`p-3 border rounded cursor-pointer transition ${
                            selectedSeq === seq.seq
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                          onClick={() => setSelectedSeq(seq.seq)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">
                              Seq. {seq.seq} {seq.ativa === "sim" ? "✓" : "(inativa)"}
                            </span>
                            <span className="text-xs text-gray-600">
                              Desgaste: {((calcularDesgaste(seq.produzido_seq, seq.cap_total_seq)) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 space-y-1">
                            <div>Cobertura: {seq.meses_cobertura_seq?.toFixed(1) || "N/A"} mês(es)</div>
                            <div>Demanda: {formatNumberBR(seq.demanda_mensal_seq)} kg/mês</div>
                            <div>Cap. Restante: {formatNumberBR(seq.cap_restante_seq)} kg</div>
                            <div>EOL: {formatDateBR(seq.data_eol_seq)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </TabsContent>

              {/* Aba: Simulador */}
              <TabsContent value="simulador" className="flex-1 overflow-y-auto space-y-4">
                {/* Introdução ao Simulador */}
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-2">Como usar o Simulador?</h3>
                      <p className="text-sm text-blue-800 mb-2">
                        Teste diferentes cenários para ver como mudanças afetam o Score de Risco. Útil para planejar:
                      </p>
                      <ul className="text-xs text-blue-800 space-y-1 ml-4">
                        <li>• <strong>Aumentar Demanda:</strong> E se os clientes pedirem mais? Quanto tempo a matriz duraria?</li>
                        <li>• <strong>Adicionar Sequências:</strong> E se duplicarmos a matriz? Como muda o risco?</li>
                        <li>• <strong>Resetar Desgaste:</strong> E se confeccionarmos uma nova matriz agora? Qual seria o novo score?</li>
                      </ul>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Sliders className="w-4 h-4" />
                    Simulador "E se…"
                  </h3>

                  <div className="space-y-5">
                    {/* Aumentar Demanda */}
                    <div className="bg-gray-50 p-3 rounded border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-sm font-medium">
                          📈 Aumentar Demanda: {simulador.demandaAumento > 0 ? "+" : ""}{simulador.demandaAumento}%
                        </label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Simule um aumento ou redução na demanda mensal. Valores positivos significam mais pedidos, o que esgota a matriz mais rápido.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <input
                        type="range"
                        min="-20"
                        max="50"
                        step="5"
                        value={simulador.demandaAumento}
                        onChange={(e) =>
                          setSimulador({ ...simulador, demandaAumento: parseInt(e.target.value) })
                        }
                        className="w-full mt-2"
                      />
                      <div className="text-xs text-gray-600 mt-2 bg-white p-2 rounded">
                        <div><strong>Demanda atual:</strong> {formatNumberBR(selectedMatrizData.demanda_media_mensal || 0)} kg/mês</div>
                        <div><strong>Demanda simulada:</strong> {formatNumberBR(
                          (selectedMatrizData.demanda_media_mensal || 0) *
                            (1 + simulador.demandaAumento / 100)
                        )} kg/mês</div>
                        <div className="text-gray-500 mt-1">Impacto: Cobertura será {simulador.demandaAumento > 0 ? "reduzida" : "aumentada"}</div>
                      </div>
                    </div>

                    {/* Adicionar Sequências */}
                    <div className="bg-gray-50 p-3 rounded border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-sm font-medium">
                          🔄 Adicionar Sequências: +{simulador.sequenciasAdicionais}
                        </label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Simule a duplicação da matriz. Mais sequências = mais capacidade de produção e menos risco de parada.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="1"
                        value={simulador.sequenciasAdicionais}
                        onChange={(e) =>
                          setSimulador({ ...simulador, sequenciasAdicionais: parseInt(e.target.value) })
                        }
                        className="w-full mt-2"
                      />
                      <div className="text-xs text-gray-600 mt-2 bg-white p-2 rounded">
                        <div><strong>Sequências atuais:</strong> {selectedMatrizData.seq_ativas}</div>
                        <div><strong>Sequências simuladas:</strong> {selectedMatrizData.seq_ativas + simulador.sequenciasAdicionais}</div>
                        <div className="text-gray-500 mt-1">Impacto: Risco operacional será {simulador.sequenciasAdicionais > 0 ? "reduzido" : "igual"}</div>
                      </div>
                    </div>

                    {/* Resetar Desgaste */}
                    <div className="bg-gray-50 p-3 rounded border border-gray-200">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          id="resetDesgaste"
                          checked={simulador.resetarDesgaste}
                          onChange={(e) =>
                            setSimulador({ ...simulador, resetarDesgaste: e.target.checked })
                          }
                          className="w-4 h-4 mt-1"
                        />
                        <div className="flex-1">
                          <label htmlFor="resetDesgaste" className="text-sm font-medium flex items-center gap-1">
                            ✨ Simular com nova matriz (resetar desgaste)
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>Marque para simular como seria o score se confeccionássemos uma nova matriz AGORA. Útil para ver se vale a pena investir na reposição.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </label>
                          <p className="text-xs text-gray-600 mt-1">
                            {simulador.resetarDesgaste 
                              ? "✓ Simulando com matriz nova (desgaste = 0%)" 
                              : "Simulando com matriz atual (desgaste = " + ((selectedMatrizData.cap_total - selectedMatrizData.cap_restante) / selectedMatrizData.cap_total * 100).toFixed(0) + "%)"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resultado da Simulação */}
                  <div className="mt-6 pt-4 border-t">
                    <div className="flex items-center gap-2 mb-4">
                      <h4 className="font-semibold">📊 Resultado da Simulação</h4>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-4 h-4 text-gray-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Este é o novo Score de Risco com as mudanças que você simulou. Compare com o score original para ver o impacto.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {(() => {
                      const scoreSimulado = calcularScore(
                        selectedMatrizData,
                        simulador,
                        selectedMatrizData.crescimento
                      );
                      const scoreOriginal = selectedMatrizData.score.scoreTotal;
                      const diferenca = scoreSimulado.scoreTotal - scoreOriginal;
                      
                      return (
                        <div className={`p-4 rounded border-2 ${getStatusColor(scoreSimulado.status)}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="text-sm text-gray-600">Novo Status</div>
                              <div className="font-semibold flex items-center gap-2">
                                {getStatusIcon(scoreSimulado.status)}
                                {getStatusLabel(scoreSimulado.status)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold">{scoreSimulado.scoreTotal.toFixed(0)}</div>
                              <div className={`text-xs font-semibold ${diferenca < 0 ? "text-green-600" : "text-red-600"}`}>
                                {diferenca > 0 ? "+" : ""}{diferenca.toFixed(0)} vs original
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-white p-3 rounded space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-gray-600">Vida Útil</div>
                                <div className="font-semibold">{scoreSimulado.scoreVida.toFixed(0)}</div>
                              </div>
                              <div>
                                <div className="text-gray-600">Demanda</div>
                                <div className="font-semibold">{scoreSimulado.scoreDemanda.toFixed(0)}</div>
                              </div>
                              <div>
                                <div className="text-gray-600">Desempenho</div>
                                <div className="font-semibold">{scoreSimulado.scoreDesempenho.toFixed(0)}</div>
                              </div>
                              <div>
                                <div className="text-gray-600">Operacional</div>
                                <div className="font-semibold">{scoreSimulado.scoreOperacional.toFixed(0)}</div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Interpretação */}
                          <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-900">
                            <strong>Interpretação:</strong> {
                              scoreSimulado.status === "confeccionar" 
                                ? "Mesmo com as mudanças, a reposição é urgente."
                                : scoreSimulado.status === "planejar"
                                ? "Com as mudanças, você tem tempo para planejar a reposição."
                                : "Com as mudanças, a matriz estará saudável por mais tempo."
                            }
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </div>

      {/* Modal LLM - Parecer */}
      {showLlmModal === 'parecer' && llmParecer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b bg-blue-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-blue-900">Parecer Técnico - {selectedMatriz}</h2>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  llmFonte === 'local' 
                    ? 'bg-gray-200 text-gray-600' 
                    : 'bg-green-200 text-green-700'
                }`}>
                  {llmFonte === 'local' ? 'Análise Local' : `via ${llmFonte.charAt(0).toUpperCase() + llmFonte.slice(1)}`}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowLlmModal(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Recomendação */}
              <div className={`p-4 rounded-lg border-2 ${
                llmParecer.recomendacao === 'Confeccionar' ? 'bg-red-50 border-red-300' :
                llmParecer.recomendacao === 'Planejar' ? 'bg-yellow-50 border-yellow-300' :
                'bg-green-50 border-green-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-600">Recomendação</div>
                    <div className="text-xl font-bold">{llmParecer.recomendacao}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Confiança</div>
                    <div className="text-xl font-bold">{llmParecer.confianca_0a100}%</div>
                  </div>
                </div>
              </div>

              {/* Resumo */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">📋 Resumo Executivo</h3>
                <p className="text-sm text-gray-700">{llmParecer.resumo_executivo}</p>
              </div>

              {/* Dados de Produção (6 meses) */}
              {llmProducao6m && (llmProducao6m.historico_mensal.length > 0 || llmProducao6m.observacoes_lote.length > 0) && (() => {
                // Ligas especiais: séries 2xxx, 7xxx, ou ligas específicas como 6082, 6005A
                const LIGAS_ESPECIAIS = ['2011', '2014', '2017', '2024', '7003', '7020', '7075', '6082', '6005A', '6061'];
                const temLigaEspecial = llmProducao6m.ligas_utilizadas.some(liga => 
                  LIGAS_ESPECIAIS.includes(liga) || liga.startsWith('2') || liga.startsWith('7')
                );
                const objetivoMin = temLigaEspecial ? 900 : 1300;
                const tipoLiga = temLigaEspecial ? 'Ligas Especiais' : 'Ligas Normais';
                const mediaGeral = llmProducao6m.ref_produtividade.media_geral || 0;
                const acimObjetivo = mediaGeral >= objetivoMin;
                const pctAcima = llmProducao6m.historico_mensal.filter(h => (h.avg_produtividade || 0) >= objetivoMin).length / 
                  Math.max(1, llmProducao6m.historico_mensal.length) * 100;

                // Dados para o gráfico
                const historicoReversed = [...llmProducao6m.historico_mensal].reverse().slice(-6);
                const maxProd = Math.max(...historicoReversed.map(h => h.avg_produtividade || 0), objetivoMin + 200);

                return (
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <h3 className="font-semibold mb-3 text-purple-900">🏭 Análise de Produção (6 meses)</h3>
                  
                  {/* Referências de Produtividade - Objetivo Dinâmico */}
                  {llmProducao6m.ref_produtividade.media_geral !== null && (
                    <div className="mb-3 p-2 bg-white rounded border">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="text-gray-500">Média Geral</div>
                          <div className={`font-bold ${acimObjetivo ? 'text-green-600' : 'text-orange-600'}`}>
                            {mediaGeral.toFixed(0)} kg/h
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Objetivo ({tipoLiga})</div>
                          <div className="font-bold text-blue-600">
                            ≥ {objetivoMin} kg/h
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">% Acima Obj.</div>
                          <div className={`font-bold ${pctAcima >= 70 ? 'text-green-600' : 'text-orange-600'}`}>
                            {pctAcima.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Gráfico de Evolução de Produtividade */}
                  {historicoReversed.length > 1 && (
                    <div className="mb-3 p-3 bg-white rounded border">
                      <div className="text-xs font-medium text-purple-800 mb-2">📊 Evolução da Produtividade</div>
                      <div className="relative" style={{ height: '120px' }}>
                        {/* Linha do objetivo */}
                        <div 
                          className="absolute left-0 right-0 border-t-2 border-dashed border-blue-400 z-10"
                          style={{ bottom: `${(objetivoMin / maxProd) * 100}%` }}
                        >
                          <span className="absolute -top-3 right-0 text-[10px] text-blue-600 bg-white px-1">
                            Obj: {objetivoMin}
                          </span>
                        </div>
                        
                        {/* Barras do gráfico */}
                        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around" style={{ height: '100%' }}>
                          {historicoReversed.map((h, i) => {
                            const prod = h.avg_produtividade || 0;
                            const alturaPixels = Math.max((prod / maxProd) * 100, 8);
                            const acima = prod >= objetivoMin;
                            const tendencia = i > 0 && historicoReversed[i-1]?.avg_produtividade
                              ? prod - (historicoReversed[i-1].avg_produtividade || 0)
                              : 0;
                            
                            return (
                              <div key={i} className="flex flex-col items-center" style={{ width: '40px' }}>
                                <div className="relative flex flex-col items-center justify-end" style={{ height: '100px' }}>
                                  {/* Indicador de tendência */}
                                  {tendencia !== 0 && (
                                    <span className={`absolute -top-3 text-[10px] ${tendencia > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {tendencia > 0 ? '↑' : '↓'}
                                    </span>
                                  )}
                                  {/* Barra */}
                                  <div 
                                    className={`w-5 rounded-t ${acima ? 'bg-green-500' : 'bg-orange-500'}`}
                                    style={{ height: `${alturaPixels}px` }}
                                    title={`${h.mes}: ${prod.toFixed(0)} kg/h`}
                                  />
                                  {/* Valor acima da barra */}
                                  <span className="absolute text-[8px] text-gray-600 font-medium" style={{ bottom: `${alturaPixels + 2}px` }}>
                                    {prod.toFixed(0)}
                                  </span>
                                </div>
                                <div className="text-[9px] text-gray-500 mt-1 text-center">
                                  {h.mes.split('-')[1]}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex justify-center gap-4 mt-2 text-[10px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-2 bg-green-500 rounded" /> Acima objetivo
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-2 bg-orange-500 rounded" /> Abaixo objetivo
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Histórico Mensal (tabela) */}
                  {llmProducao6m.historico_mensal.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-medium text-purple-800 mb-1">Histórico Mensal:</div>
                      <div className="flex flex-wrap gap-1">
                        {llmProducao6m.historico_mensal.slice(0, 6).map((h, i) => (
                          <div key={i} className="px-2 py-1 bg-white rounded border text-xs">
                            <span className="text-gray-500">{h.mes}: </span>
                            <span className={`font-medium ${(h.avg_produtividade || 0) >= objetivoMin ? 'text-green-600' : 'text-orange-600'}`}>
                              {h.avg_produtividade?.toFixed(0) || '-'} kg/h
                            </span>
                            <span className="text-gray-400 ml-1">({h.avg_eficiencia?.toFixed(0) || '-'}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ligas Utilizadas */}
                  {llmProducao6m.ligas_utilizadas.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-medium text-purple-800 mb-1">
                        Ligas Utilizadas: <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${temLigaEspecial ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                          {tipoLiga}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {llmProducao6m.ligas_utilizadas.slice(0, 5).map((liga, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded border text-xs ${
                            LIGAS_ESPECIAIS.includes(liga) || liga.startsWith('2') || liga.startsWith('7')
                              ? 'bg-orange-50 border-orange-300 text-orange-700'
                              : 'bg-white'
                          }`}>{liga}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Observações de Lote */}
                  {llmProducao6m.observacoes_lote.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-purple-800 mb-1">Observações de Lote Recentes:</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {llmProducao6m.observacoes_lote.slice(0, 5).map((obs, i) => (
                          <div key={i} className="text-xs p-2 bg-white rounded border text-gray-700">
                            "{obs}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
              })()}

              {/* Motivos */}
              {llmParecer.motivos_com_numeros.length > 0 && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold mb-2 text-blue-900">📊 Motivos com Dados</h3>
                  <ul className="space-y-1">
                    {llmParecer.motivos_com_numeros.map((m, i) => (
                      <li key={i} className="text-sm text-blue-800 flex gap-2">
                        <span>•</span><span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Riscos */}
              {llmParecer.riscos.length > 0 && (
                <div className="p-4 bg-red-50 rounded-lg">
                  <h3 className="font-semibold mb-2 text-red-900">⚠️ Riscos Identificados</h3>
                  <ul className="space-y-1">
                    {llmParecer.riscos.map((r, i) => (
                      <li key={i} className="text-sm text-red-800 flex gap-2">
                        <span>•</span><span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ações */}
              {llmParecer.acoes_recomendadas.length > 0 && (
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold mb-2 text-green-900">✅ Ações Recomendadas</h3>
                  <ul className="space-y-1">
                    {llmParecer.acoes_recomendadas.map((a, i) => (
                      <li key={i} className="text-sm text-green-800 flex gap-2">
                        <span>{i + 1}.</span><span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* O que confirmar */}
              {llmParecer.o_que_confirmar.length > 0 && (
                <div className="p-4 bg-orange-50 rounded-lg">
                  <h3 className="font-semibold mb-2 text-orange-900">🔍 O que Confirmar</h3>
                  <ul className="space-y-1">
                    {llmParecer.o_que_confirmar.map((c, i) => (
                      <li key={i} className="text-sm text-orange-800 flex gap-2">
                        <span>•</span><span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Limitações */}
              {llmParecer.limitacoes_dos_dados.length > 0 && (
                <div className="p-4 bg-gray-100 rounded-lg">
                  <h3 className="font-semibold mb-2 text-gray-700">ℹ️ Limitações dos Dados</h3>
                  <ul className="space-y-1">
                    {llmParecer.limitacoes_dos_dados.map((l, i) => (
                      <li key={i} className="text-sm text-gray-600 flex gap-2">
                        <span>•</span><span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal LLM - Ranking */}
      {showLlmModal === 'ranking' && llmRanking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b bg-purple-50">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-semibold text-purple-900">
                  Ranking do Dia - Top {llmRanking.items.length} Matrizes
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-purple-700">
                  {llmRanking.criterios.total_matrizes_analisadas} matrizes analisadas
                </span>
                <Button variant="ghost" size="sm" onClick={() => setShowLlmModal(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {llmRanking.items.map((item) => (
                  <div
                    key={item.matriz}
                    className={`p-3 rounded-lg border-2 cursor-pointer hover:shadow-md transition ${
                      item.recomendacao === 'Confeccionar' ? 'bg-red-50 border-red-200' :
                      item.recomendacao === 'Planejar' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-green-50 border-green-200'
                    }`}
                    onClick={() => {
                      setSelectedMatriz(item.matriz);
                      setShowLlmModal(null);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold">
                        {item.posicao}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{item.matriz}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            item.recomendacao === 'Confeccionar' ? 'bg-red-200 text-red-800' :
                            item.recomendacao === 'Planejar' ? 'bg-yellow-200 text-yellow-800' :
                            'bg-green-200 text-green-800'
                          }`}>
                            {item.recomendacao}
                          </span>
                          <span className="text-sm text-gray-600">Score: {item.score.toFixed(0)}</span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">{item.resumo_curto}</div>
                        {item.motivos_principais.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.motivos_principais.slice(0, 2).map((m, i) => (
                              <span key={i} className="text-xs bg-white px-2 py-0.5 rounded border">
                                {m.length > 50 ? m.substring(0, 50) + '...' : m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal LLM - Configurações */}
      {showLlmModal === 'config' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">Configurações LLM</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowLlmModal(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {/* Provider preferido */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Modelo Preferido
                </label>
                <select
                  value={llmConfig.provider}
                  onChange={(e) => setLlmConfig({ ...llmConfig, provider: e.target.value as LLMProvider })}
                  className="w-full p-2 border rounded-md text-sm"
                >
                  <option value="openrouter">OpenRouter (Grátis - Mistral 7B)</option>
                  <option value="groq">Groq (Grátis - Llama 3.1 8B)</option>
                  <option value="google">Google AI (Grátis - Gemini 1.5 Flash)</option>
                  <option value="openai">OpenAI (Pago - GPT-4o Mini)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  O sistema tentará este provider primeiro. Se falhar, tentará os outros em ordem.
                </p>
              </div>

              {/* Toggle para mostrar/ocultar keys */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">API Keys</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKeys(!showKeys)}
                  className="text-gray-500"
                >
                  {showKeys ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                  {showKeys ? 'Ocultar' : 'Mostrar'}
                </Button>
              </div>

              {/* API Keys */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    OpenRouter API Key
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={llmConfig.openrouterKey}
                    onChange={(e) => setLlmConfig({ ...llmConfig, openrouterKey: e.target.value })}
                    placeholder="sk-or-..."
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Groq API Key
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={llmConfig.groqKey}
                    onChange={(e) => setLlmConfig({ ...llmConfig, groqKey: e.target.value })}
                    placeholder="gsk_..."
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Google AI API Key
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={llmConfig.googleKey}
                    onChange={(e) => setLlmConfig({ ...llmConfig, googleKey: e.target.value })}
                    placeholder="AIza..."
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    OpenAI API Key
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={llmConfig.openaiKey}
                    onChange={(e) => setLlmConfig({ ...llmConfig, openaiKey: e.target.value })}
                    placeholder="sk-..."
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
                <strong>💡 Dica:</strong> Sem API keys configuradas, o sistema usará análise local (sem LLM externo).
                As keys são salvas de forma segura no banco de dados, vinculadas à sua conta.
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
              <Button variant="outline" size="sm" onClick={() => setShowLlmModal(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={salvarConfigLLM} disabled={configSaving}>
                {configSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                {configSaving ? 'Salvando...' : 'Salvar Configurações'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
