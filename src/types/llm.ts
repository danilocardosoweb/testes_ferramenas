/**
 * Tipos para integração LLM - Parecer de Matrizes
 */

// ============ REQUEST ============

export type LLMProvider = 'openrouter' | 'google' | 'groq' | 'openai';

export interface LLMRequest {
  /** Modo: parecer para 1 matriz ou ranking diário */
  mode: 'parecer' | 'ranking';
  /** Código da matriz (obrigatório para mode=parecer) */
  matriz?: string;
  /** Quantidade de matrizes no ranking (default: 50) */
  top_n?: number;
  /** Meses de histórico para análise (default: 12) */
  months_back?: number;
  /** Dias sem atividade para considerar parada (default: 90) */
  recent_days?: number;
  /** Ordem de preferência dos provedores LLM */
  provider_preference?: LLMProvider[];
  /** Usar cache se disponível (default: true) */
  use_cache?: boolean;
}

// ============ RESPONSE ============

export type Recomendacao = 'Confeccionar' | 'Planejar' | 'OK';

export interface ParecerData {
  /** Recomendação final */
  recomendacao: Recomendacao;
  /** Resumo executivo do parecer */
  resumo_executivo: string;
  /** Motivos com números/dados que suportam a recomendação */
  motivos_com_numeros: string[];
  /** Riscos identificados */
  riscos: string[];
  /** Ações recomendadas */
  acoes_recomendadas: string[];
  /** O que confirmar antes de agir */
  o_que_confirmar: string[];
  /** Nível de confiança da análise (0-100) */
  confianca_0a100: number;
  /** Limitações dos dados usados */
  limitacoes_dos_dados: string[];
}

export interface RankingItem {
  /** Posição no ranking */
  posicao: number;
  /** Código da matriz */
  matriz: string;
  /** Score calculado (0-100) */
  score: number;
  /** Recomendação */
  recomendacao: Recomendacao;
  /** Resumo curto do motivo */
  resumo_curto: string;
  /** Principais motivos */
  motivos_principais: string[];
}

export interface RankingData {
  /** Lista de matrizes rankeadas */
  items: RankingItem[];
  /** Data de referência do ranking */
  data_referencia: string;
  /** Critérios usados */
  criterios: {
    periodo_meses: number;
    dias_inatividade: number;
    total_matrizes_analisadas: number;
  };
}

export interface LLMResponseSuccess<T> {
  ok: true;
  /** Provedor LLM utilizado */
  provider: LLMProvider;
  /** Data/hora da geração */
  generated_at: string;
  /** Dados do parecer ou ranking */
  data: T;
  /** Se veio do cache */
  from_cache?: boolean;
}

export interface LLMResponseError {
  ok: false;
  error: string;
  details?: string;
}

export type LLMParecerResponse = LLMResponseSuccess<ParecerData> | LLMResponseError;
export type LLMRankingResponse = LLMResponseSuccess<RankingData> | LLMResponseError;
export type LLMResponse = LLMParecerResponse | LLMRankingResponse;

// ============ CONTEXTO INTERNO (para montar prompt) ============

export interface MatrizContexto {
  codigo: string;
  /** Dados de vida útil */
  vida: {
    cap_total: number;
    cap_restante: number;
    desgaste_pct: number;
    meses_cobertura: number;
    eol_previsto: string | null;
    seq_ativas: number;
  };
  /** Dados de demanda (carteira 12m) */
  demanda: {
    total_kg: number;
    media_mensal_kg: number;
    qtd_pedidos: number;
    qtd_clientes: number;
    crescimento_pct: number | null;
  };
  /** Classificação ABC */
  abc: {
    classe: 'A' | 'B' | 'C' | null;
    ranking_kg: number | null;
  };
  /** Dados de produtividade */
  produtividade: {
    media_prod: number | null;
    media_efic: number | null;
    tendencia: 'subindo' | 'estavel' | 'caindo' | null;
    min_prod: number | null;
    max_prod: number | null;
    total_registros: number;
  };
  /** Dados de produção dos últimos 6 meses */
  producao_6m: {
    /** Histórico mensal de produtividade/eficiência */
    historico_mensal: Array<{
      mes: string;
      avg_produtividade: number | null;
      avg_eficiencia: number | null;
      registros: number;
    }>;
    /** Observações de lote relevantes (últimas 10) */
    observacoes_lote: string[];
    /** Ligas utilizadas */
    ligas_utilizadas: string[];
    /** Códigos de parada frequentes */
    codigos_parada: string[];
    /** Referências de produtividade */
    ref_produtividade: {
      objetivo_alto: number; // 1.300 kg/h
      objetivo_baixo: number; // 1.000 kg/h
      media_geral: number | null;
      pct_acima_objetivo: number | null;
    };
  };
  /** Score atual calculado no frontend */
  score_atual: {
    total: number;
    vida: number;
    demanda: number;
    desempenho: number;
    operacional: number;
    status: 'confeccionar' | 'planejar' | 'ok';
  };
  /** Última atividade */
  ultima_atividade: {
    ultima_producao: string | null;
    ultimo_pedido: string | null;
    dias_parada: number | null;
  };
}

export interface RankingContexto {
  data_referencia: string;
  periodo_meses: number;
  dias_inatividade: number;
  matrizes: MatrizContexto[];
}
