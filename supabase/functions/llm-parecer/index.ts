/**
 * Edge Function: llm-parecer
 * Gera parecer técnico para matrizes usando LLM com fallback entre provedores
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Tipos
type LLMProvider = 'openrouter' | 'google' | 'groq' | 'openai';
type Recomendacao = 'Confeccionar' | 'Planejar' | 'OK';

interface LLMRequest {
  mode: 'parecer' | 'ranking';
  matriz?: string;
  top_n?: number;
  months_back?: number;
  recent_days?: number;
  provider_preference?: LLMProvider[];
  use_cache?: boolean;
}

interface ParecerData {
  recomendacao: Recomendacao;
  resumo_executivo: string;
  motivos_com_numeros: string[];
  riscos: string[];
  acoes_recomendadas: string[];
  o_que_confirmar: string[];
  confianca_0a100: number;
  limitacoes_dos_dados: string[];
}

// Configuração dos provedores
const PROVIDERS_CONFIG: Record<LLMProvider, { url: string; model: string; envKey: string }> = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'mistralai/mistral-7b-instruct:free',
    envKey: 'OPENROUTER_API_KEY',
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    model: 'gemini-1.5-flash',
    envKey: 'GOOGLE_AI_API_KEY',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    envKey: 'GROQ_API_KEY',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
  },
};

const DEFAULT_PROVIDERS: LLMProvider[] = ['openrouter', 'groq', 'google', 'openai'];

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função principal
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const request: LLMRequest = await req.json();
    const { mode, matriz, top_n = 50, months_back = 12, recent_days = 90 } = request;
    const providers = request.provider_preference || DEFAULT_PROVIDERS;

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados do banco
    const contexto = await buscarContexto(supabase, mode, matriz, top_n, months_back, recent_days);
    
    if (!contexto) {
      return jsonResponse({ ok: false, error: 'Matriz não encontrada ou sem dados' }, 404);
    }

    // Montar prompt
    const prompt = montarPrompt(mode, contexto);

    // Tentar provedores em ordem
    for (const provider of providers) {
      const apiKey = Deno.env.get(PROVIDERS_CONFIG[provider].envKey);
      if (!apiKey) {
        console.log(`[LLM] Provider ${provider} sem API key configurada`);
        continue;
      }

      try {
        const result = await chamarLLM(provider, apiKey, prompt);
        if (result) {
          return jsonResponse({
            ok: true,
            provider,
            generated_at: new Date().toISOString(),
            data: result,
            from_cache: false,
          });
        }
      } catch (err) {
        console.error(`[LLM] Erro com provider ${provider}:`, err);
        continue;
      }
    }

    // Fallback: gerar localmente se nenhum provider funcionou
    console.log('[LLM] Todos os providers falharam, usando fallback local');
    const fallbackResult = gerarParecerLocal(contexto);
    
    return jsonResponse({
      ok: true,
      provider: 'local' as LLMProvider,
      generated_at: new Date().toISOString(),
      data: fallbackResult,
      from_cache: false,
    });

  } catch (err) {
    console.error('[LLM] Erro geral:', err);
    return jsonResponse({
      ok: false,
      error: 'Erro interno',
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Helpers

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function buscarContexto(
  supabase: ReturnType<typeof createClient>,
  mode: string,
  matriz: string | undefined,
  topN: number,
  monthsBack: number,
  recentDays: number
) {
  const periodEnd = new Date().toISOString().split('T')[0];
  const periodStart = new Date(Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (mode === 'parecer' && matriz) {
    // Buscar dados de uma matriz específica
    const [vidaRes, carteiraRes, prodRes, abcRes] = await Promise.all([
      supabase.rpc('matrix_lifespan_summary', {
        period_end: periodEnd,
        months: monthsBack,
        lead_time_days: 60,
        matriz_filter: matriz,
      }),
      supabase.rpc('analysis_carteira_flat_agg', {
        period_start: periodStart,
        period_end: periodEnd,
        ferramenta_filter: matriz,
        cliente_filter: null,
      }),
      supabase.rpc('get_productivity_stats', {
        p_months_back: monthsBack,
        p_matriz_filter: matriz,
      }),
      supabase.rpc('get_abc_classification', { p_months_back: monthsBack }),
    ]);

    const vida = vidaRes.data?.[0];
    if (!vida) return null;

    const carteira = carteiraRes.data?.[0];
    const prod = prodRes.data?.[0];
    const abc = abcRes.data?.find((a: { ferramenta: string }) => 
      a.ferramenta?.toUpperCase().includes(matriz.toUpperCase())
    );

    return {
      codigo: matriz,
      vida: {
        cap_total: vida.cap_total || 0,
        cap_restante: vida.cap_restante || 0,
        desgaste_pct: vida.cap_total > 0 ? ((vida.cap_total - vida.cap_restante) / vida.cap_total) * 100 : 0,
        meses_cobertura: vida.meses_cobertura || 0,
        eol_previsto: vida.eol_date || null,
        seq_ativas: vida.seq_ativas || 1,
      },
      demanda: {
        total_kg: carteira?.total_kg || 0,
        media_mensal_kg: carteira?.media_mensal || 0,
        qtd_pedidos: carteira?.qtd_pedidos || 0,
        qtd_clientes: carteira?.qtd_clientes || 0,
        crescimento_pct: null,
      },
      abc: {
        classe: abc?.classe || null,
        ranking_kg: abc?.ranking || null,
      },
      produtividade: {
        media_prod: prod?.avg_productivity || null,
        media_efic: prod?.avg_efficiency || null,
        tendencia: null,
      },
      score_atual: {
        total: 0,
        vida: 0,
        demanda: 0,
        desempenho: 0,
        operacional: 0,
        status: 'ok' as const,
      },
      ultima_atividade: {
        ultima_producao: null,
        ultimo_pedido: carteira?.last_implant || null,
        dias_parada: null,
      },
    };
  }

  // Para ranking, buscar todas as matrizes
  const vidaRes = await supabase.rpc('matrix_lifespan_summary', {
    period_end: periodEnd,
    months: monthsBack,
    lead_time_days: 60,
    matriz_filter: null,
  });

  return vidaRes.data?.slice(0, topN) || [];
}

function montarPrompt(mode: string, contexto: unknown): string {
  const systemPrompt = `Você é um especialista em gestão de matrizes industriais.
Sua tarefa é analisar dados técnicos e gerar pareceres objetivos sobre a necessidade de confecção de novas matrizes.

IMPORTANTE:
- Seja objetivo e baseie-se apenas nos dados fornecidos
- Use números específicos para justificar suas conclusões
- Identifique riscos e limitações dos dados
- Responda APENAS em JSON válido, sem markdown ou texto adicional

Formato de resposta obrigatório (JSON):
{
  "recomendacao": "Confeccionar" | "Planejar" | "OK",
  "resumo_executivo": "string com 2-3 frases",
  "motivos_com_numeros": ["motivo 1 com dados", "motivo 2"],
  "riscos": ["risco 1", "risco 2"],
  "acoes_recomendadas": ["acao 1", "acao 2"],
  "o_que_confirmar": ["item 1", "item 2"],
  "confianca_0a100": número,
  "limitacoes_dos_dados": ["limitacao 1"]
}`;

  const userPrompt = mode === 'parecer'
    ? `Analise a seguinte matriz e gere um parecer técnico:\n\n${JSON.stringify(contexto, null, 2)}`
    : `Analise as seguintes matrizes e gere um ranking de prioridade para confecção:\n\n${JSON.stringify(contexto, null, 2)}`;

  return JSON.stringify({ system: systemPrompt, user: userPrompt });
}

async function chamarLLM(provider: LLMProvider, apiKey: string, promptJson: string): Promise<ParecerData | null> {
  const config = PROVIDERS_CONFIG[provider];
  const { system, user } = JSON.parse(promptJson);

  let response: Response;
  let resultText: string;

  if (provider === 'google') {
    // Google tem API diferente
    const url = `${config.url}?key=${apiKey}`;
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      }),
    });

    if (!response.ok) throw new Error(`Google API error: ${response.status}`);
    const data = await response.json();
    resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    // OpenAI-compatible APIs (OpenRouter, Groq, OpenAI)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://ferramentas-teste.vercel.app';
      headers['X-Title'] = 'Ferramentas em Teste';
    }

    response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) throw new Error(`${provider} API error: ${response.status}`);
    const data = await response.json();
    resultText = data.choices?.[0]?.message?.content || '';
  }

  // Tentar parsear JSON da resposta
  try {
    // Limpar possíveis marcadores de código
    const cleanText = resultText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    return JSON.parse(cleanText) as ParecerData;
  } catch {
    console.error(`[LLM] Falha ao parsear resposta de ${provider}:`, resultText.substring(0, 200));
    return null;
  }
}

function gerarParecerLocal(contexto: { vida: { desgaste_pct: number; meses_cobertura: number; seq_ativas: number }; demanda: { total_kg: number }; codigo: string }): ParecerData {
  const motivos: string[] = [];
  const riscos: string[] = [];
  
  if (contexto.vida.desgaste_pct >= 80) {
    motivos.push(`Desgaste crítico: ${contexto.vida.desgaste_pct.toFixed(0)}%`);
  }
  if (contexto.vida.meses_cobertura <= 3) {
    motivos.push(`Cobertura baixa: ${contexto.vida.meses_cobertura.toFixed(1)} meses`);
    riscos.push('Risco de parada por falta de capacidade');
  }
  if (contexto.vida.seq_ativas <= 1) {
    riscos.push('Sequência única sem backup');
  }

  const score = contexto.vida.desgaste_pct * 0.4 + (contexto.demanda.total_kg > 100000 ? 30 : 15);
  const recomendacao: Recomendacao = score >= 70 ? 'Confeccionar' : score >= 40 ? 'Planejar' : 'OK';

  return {
    recomendacao,
    resumo_executivo: `Matriz ${contexto.codigo} com score ${score.toFixed(0)}/100. ${motivos[0] || 'Situação estável.'}`,
    motivos_com_numeros: motivos.length > 0 ? motivos : ['Análise automática sem detalhes completos'],
    riscos: riscos.length > 0 ? riscos : ['Nenhum risco crítico identificado'],
    acoes_recomendadas: recomendacao === 'Confeccionar' 
      ? ['Iniciar confecção imediatamente'] 
      : recomendacao === 'Planejar'
        ? ['Planejar confecção para próximo trimestre']
        : ['Manter monitoramento'],
    o_que_confirmar: ['Verificar dados de produção recente'],
    confianca_0a100: 50,
    limitacoes_dos_dados: ['Análise simplificada - LLM indisponível'],
  };
}
