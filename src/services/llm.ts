/**
 * Serviço para integração com LLM via Edge Function ou chamada direta
 */

import { supabase } from '@/lib/supabaseClient';
import type {
  LLMRequest,
  LLMParecerResponse,
  LLMRankingResponse,
  MatrizContexto,
  ParecerData,
  RankingData,
  RankingItem,
  LLMProvider,
} from '@/types/llm';

const EDGE_FUNCTION_NAME = 'llm-parecer';

// Configuração dos providers LLM
const LLM_PROVIDERS: Record<LLMProvider, {
  url: string;
  model: string;
  buildHeaders: (key: string) => Record<string, string>;
}> = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'mistralai/mistral-7b-instruct:free',
    buildHeaders: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
    }),
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    buildHeaders: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    }),
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    model: 'gemini-1.5-flash',
    buildHeaders: (key) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    }),
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    buildHeaders: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    }),
  },
};

/**
 * Chama LLM externa diretamente do frontend
 */
export async function chamarLLMExterna(
  contexto: MatrizContexto,
  config: {
    provider: LLMProvider;
    openrouterKey?: string;
    googleKey?: string;
    groqKey?: string;
    openaiKey?: string;
  }
): Promise<{ ok: true; data: ParecerData; provider: LLMProvider } | { ok: false; error: string }> {
  // Ordem de prioridade: provider configurado primeiro, depois os outros
  const ordem: LLMProvider[] = [config.provider, 'openrouter', 'groq', 'google', 'openai']
    .filter((v, i, a) => a.indexOf(v) === i) as LLMProvider[];

  const keys: Record<LLMProvider, string | undefined> = {
    openrouter: config.openrouterKey,
    groq: config.groqKey,
    google: config.googleKey,
    openai: config.openaiKey,
  };

  const prompt = buildPromptFromContext(contexto);

  console.log(`[LLM] Provider preferido: ${config.provider}`);
  console.log(`[LLM] Ordem de tentativa: ${ordem.join(' -> ')}`);
  console.log(`[LLM] Keys disponíveis:`, {
    openrouter: !!config.openrouterKey,
    groq: !!config.groqKey,
    google: !!config.googleKey,
    openai: !!config.openaiKey,
  });

  for (const provider of ordem) {
    const key = keys[provider];
    if (!key) {
      console.log(`[LLM] Pulando ${provider}: sem key configurada`);
      continue;
    }

    try {
      console.log(`[LLM] Tentando provider: ${provider}...`);
      const result = await callProvider(provider, key, prompt);
      if (result.ok) {
        console.log(`[LLM] ✅ Sucesso com provider: ${provider}`);
        return { ok: true, data: result.data, provider };
      } else {
        console.warn(`[LLM] ❌ Falha com ${provider}:`, 'error' in result ? result.error : 'erro desconhecido');
      }
    } catch (err) {
      console.warn(`[LLM] ❌ Erro com ${provider}:`, err);
    }
  }

  return { ok: false, error: 'Nenhum provider LLM disponível ou todos falharam' };
}

function buildPromptFromContext(ctx: MatrizContexto): string {
  // Ligas especiais: séries 2xxx, 7xxx, ou ligas específicas
  const LIGAS_ESPECIAIS = ['2011', '2014', '2017', '2024', '7003', '7020', '7075', '6082', '6005A', '6061'];
  const ligasUsadas = ctx.producao_6m?.ligas_utilizadas || [];
  const temLigaEspecial = ligasUsadas.some(liga => 
    LIGAS_ESPECIAIS.includes(liga) || liga.startsWith('2') || liga.startsWith('7')
  );
  
  // Objetivo dinâmico: Ligas Normais >= 1300, Ligas Especiais >= 900
  const objetivoMin = temLigaEspecial ? 900 : 1300;
  const tipoLiga = temLigaEspecial ? 'Ligas Especiais' : 'Ligas Normais';

  // Determinar status da produtividade baseado no objetivo correto
  const prodReal = ctx.produtividade.media_prod;
  let statusProd = 'sem dados';
  if (prodReal !== null) {
    if (prodReal >= objetivoMin * 1.1) statusProd = `EXCELENTE (${((prodReal / objetivoMin - 1) * 100).toFixed(0)}% acima do objetivo)`;
    else if (prodReal >= objetivoMin) statusProd = 'BOA (atingindo objetivo)';
    else if (prodReal >= objetivoMin * 0.8) statusProd = `ATENÇÃO (${((1 - prodReal / objetivoMin) * 100).toFixed(0)}% abaixo do objetivo)`;
    else statusProd = `CRÍTICA (${((1 - prodReal / objetivoMin) * 100).toFixed(0)}% abaixo do objetivo)`;
  }

  // Histórico mensal formatado
  const historicoMensal = ctx.producao_6m?.historico_mensal?.slice(0, 6)
    .map(h => `  - ${h.mes}: ${h.avg_produtividade?.toFixed(0) || 'N/D'} kg/h, efic: ${h.avg_eficiencia?.toFixed(0) || 'N/D'}%`)
    .join('\n') || '  Sem dados de produção recente';

  return `Você é um especialista em gestão de matrizes de extrusão de alumínio.
Analise os dados consolidados abaixo e forneça um parecer técnico estruturado.

# DADOS DA MATRIZ ${ctx.codigo}

## 1. VIDA ÚTIL (Fonte: sistema de vida útil)
- Capacidade total: ${ctx.vida.cap_total.toLocaleString('pt-BR')} kg
- Capacidade restante: ${ctx.vida.cap_restante.toLocaleString('pt-BR')} kg
- Desgaste acumulado: ${ctx.vida.desgaste_pct.toFixed(0)}%
- Cobertura estimada: ${ctx.vida.meses_cobertura.toFixed(1)} meses até EOL
- Data EOL prevista: ${ctx.vida.eol_previsto || 'Não calculada'}
- Sequências ativas: ${ctx.vida.seq_ativas}

## 2. DEMANDA (Fonte: carteira de pedidos - últimos 12 meses)
- Volume total no período: ${ctx.demanda.total_kg.toLocaleString('pt-BR')} kg
- Média mensal: ${ctx.demanda.media_mensal_kg.toLocaleString('pt-BR')} kg/mês
- Tendência de crescimento: ${ctx.demanda.crescimento_pct !== null ? ctx.demanda.crescimento_pct.toFixed(0) + '%' : 'Não calculada'}

## 3. PRODUTIVIDADE (Fonte: análise de produção - últimos 6 meses)
- Tipo de Liga: ${tipoLiga} (${ligasUsadas.join(', ') || 'N/D'})
- Média geral: ${prodReal !== null ? prodReal.toFixed(0) + ' kg/h' : 'Sem dados'}
- Objetivo para ${tipoLiga}: ≥ ${objetivoMin} kg/h
- Status: ${statusProd}
- Eficiência média: ${ctx.produtividade.media_efic !== null ? ctx.produtividade.media_efic.toFixed(0) + '%' : 'N/D'}
- Tendência: ${ctx.produtividade.tendencia || 'Não calculada'}
${ctx.produtividade.min_prod !== null ? `- Mínima no período: ${ctx.produtividade.min_prod.toFixed(0)} kg/h` : ''}
${ctx.produtividade.max_prod !== null ? `- Máxima no período: ${ctx.produtividade.max_prod.toFixed(0)} kg/h` : ''}

### Histórico Mensal de Produção:
${historicoMensal}

## 4. SCORE DE RISCO CALCULADO (Fonte: algoritmo interno)
- Score total: ${ctx.score_atual.total.toFixed(0)}/100 (quanto maior, mais urgente)
- Componentes: Vida ${ctx.score_atual.vida.toFixed(0)}, Demanda ${ctx.score_atual.demanda.toFixed(0)}, Desempenho ${ctx.score_atual.desempenho.toFixed(0)}, Operacional ${ctx.score_atual.operacional.toFixed(0)}
- Classificação: ${ctx.score_atual.status}

${ctx.producao_6m?.observacoes_lote?.length ? `## 5. OBSERVAÇÕES DE LOTE RECENTES
${ctx.producao_6m.observacoes_lote.slice(0, 5).map(o => `- "${o}"`).join('\n')}` : ''}

# REGRAS DE DECISÃO
- Score >= 70: Confeccionar imediatamente (risco alto)
- Score 40-69: Planejar reposição (risco moderado)
- Score < 40: OK, monitorar (risco baixo)

# INSTRUÇÕES IMPORTANTES
1. Use APENAS os dados fornecidos acima para sua análise
2. Cite números específicos nos motivos (ex: "desgaste de 100%", "produtividade de 1361 kg/h")
3. Se a produtividade está acima de 1000 kg/h, ela está BOA ou EXCELENTE
4. O score já considera múltiplos fatores - foque nos mais críticos

# FORMATO DE RESPOSTA (JSON estrito)
{
  "recomendacao": "Confeccionar" | "Planejar" | "OK",
  "resumo_executivo": "2-3 frases resumindo situação com números",
  "motivos_com_numeros": ["motivo 1 com dados específicos", "motivo 2"],
  "riscos": ["risco 1", "risco 2"],
  "acoes_recomendadas": ["ação 1", "ação 2"],
  "o_que_confirmar": ["verificação 1"],
  "confianca_0a100": 80,
  "limitacoes_dos_dados": ["limitação 1"]
}

Responda APENAS com o JSON, sem texto adicional.`;
}

async function callProvider(
  provider: LLMProvider,
  key: string,
  prompt: string
): Promise<{ ok: true; data: ParecerData } | { ok: false; error: string }> {
  const config = LLM_PROVIDERS[provider];
  
  let body: any;
  let url = config.url;

  if (provider === 'google') {
    // Google usa formato diferente
    url = `${config.url}?key=${key}`;
    body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3 },
    };
  } else {
    // OpenAI-compatible (OpenRouter, Groq, OpenAI)
    body = {
      model: config.model,
      messages: [
        { role: 'system', content: 'Você é um especialista em análise de matrizes de extrusão. Responda sempre em JSON válido.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: provider === 'google' ? { 'Content-Type': 'application/json' } : config.buildHeaders(key),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LLM ${provider}] HTTP ${response.status}:`, errorText);
    return { ok: false, error: `HTTP ${response.status}` };
  }

  const data = await response.json();
  
  // Extrair texto da resposta
  let text: string;
  if (provider === 'google') {
    text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    text = data.choices?.[0]?.message?.content || '';
  }

  // Parsear JSON da resposta
  try {
    // Remover markdown code blocks se houver
    const jsonMatch = text.match(/```json?\s*([\s\S]*?)\s*```/) || [null, text];
    const jsonStr = jsonMatch[1] || text;
    const parsed = JSON.parse(jsonStr.trim()) as ParecerData;
    return { ok: true, data: parsed };
  } catch (parseErr) {
    console.error(`[LLM ${provider}] Erro ao parsear JSON:`, text);
    return { ok: false, error: 'Resposta não é JSON válido' };
  }
}

/**
 * Chama a Edge Function para gerar parecer ou ranking
 */
export async function callLLM(request: LLMRequest): Promise<LLMParecerResponse | LLMRankingResponse> {
  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
      body: request,
    });

    if (error) {
      console.error('[LLM] Edge Function error:', error);
      return {
        ok: false,
        error: 'Erro ao chamar serviço de análise',
        details: error.message,
      };
    }

    return data as LLMParecerResponse | LLMRankingResponse;
  } catch (err) {
    console.error('[LLM] Unexpected error:', err);
    return {
      ok: false,
      error: 'Erro inesperado',
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Gera parecer para uma matriz específica
 */
export async function gerarParecer(matrizCodigo: string): Promise<LLMParecerResponse> {
  return callLLM({
    mode: 'parecer',
    matriz: matrizCodigo,
    months_back: 12,
    recent_days: 90,
    use_cache: true,
  }) as Promise<LLMParecerResponse>;
}

/**
 * Gera ranking diário das matrizes
 */
export async function gerarRankingDiario(topN: number = 50): Promise<LLMRankingResponse> {
  return callLLM({
    mode: 'ranking',
    top_n: topN,
    months_back: 12,
    recent_days: 90,
    use_cache: true,
  }) as Promise<LLMRankingResponse>;
}

// ============ FALLBACK LOCAL (quando Edge Function não está disponível) ============

/**
 * Gera parecer localmente usando os dados já carregados
 * Útil como fallback ou para testes
 */
export function gerarParecerLocal(contexto: MatrizContexto): ParecerData {
  const { codigo, vida, demanda, abc, produtividade, producao_6m, score_atual, ultima_atividade } = contexto;
  
  const motivos: string[] = [];
  const riscos: string[] = [];
  const acoes: string[] = [];
  const confirmar: string[] = [];
  const limitacoes: string[] = [];

  // Análise de vida útil
  if (vida.desgaste_pct >= 80) {
    motivos.push(`Desgaste crítico: ${vida.desgaste_pct.toFixed(0)}% da capacidade consumida`);
    riscos.push('Risco de parada por fim de vida útil iminente');
  } else if (vida.desgaste_pct >= 60) {
    motivos.push(`Desgaste elevado: ${vida.desgaste_pct.toFixed(0)}% da capacidade consumida`);
  }

  if (vida.meses_cobertura <= 3) {
    motivos.push(`Cobertura crítica: apenas ${vida.meses_cobertura.toFixed(1)} meses restantes`);
    acoes.push('Iniciar processo de confecção imediatamente');
  } else if (vida.meses_cobertura <= 6) {
    motivos.push(`Cobertura baixa: ${vida.meses_cobertura.toFixed(1)} meses restantes`);
    acoes.push('Planejar confecção para os próximos 2 meses');
  }

  if (vida.seq_ativas <= 1) {
    riscos.push('Sequência única: sem backup em caso de falha');
    acoes.push('Considerar confecção de sequência adicional');
  }

  // Análise de demanda
  if (demanda.total_kg > 0) {
    motivos.push(`Volume de demanda 12m: ${demanda.total_kg.toLocaleString('pt-BR')} kg`);
    
    if (demanda.crescimento_pct && demanda.crescimento_pct > 20) {
      motivos.push(`Demanda em crescimento: +${demanda.crescimento_pct.toFixed(0)}%`);
      riscos.push('Crescimento acelerado pode antecipar EOL');
    }
  }

  if (abc.classe === 'A') {
    motivos.push('Classificação ABC: Classe A (alta importância)');
    riscos.push('Parada afeta fortemente o faturamento');
  }

  // Análise de produtividade (6 meses)
  if (produtividade.media_prod !== null) {
    const refAlto = producao_6m?.ref_produtividade?.objetivo_alto || 1300;
    const refBaixo = producao_6m?.ref_produtividade?.objetivo_baixo || 1000;
    
    if (produtividade.media_prod < refBaixo) {
      motivos.push(`Produtividade baixa: ${produtividade.media_prod.toFixed(0)} kg/h (ref: ${refBaixo} kg/h)`);
      riscos.push('Baixa produtividade pode indicar desgaste da matriz');
      confirmar.push('Verificar condições da matriz e processo de extrusão');
    } else if (produtividade.media_prod >= refAlto) {
      motivos.push(`Produtividade excelente: ${produtividade.media_prod.toFixed(0)} kg/h (acima de ${refAlto} kg/h)`);
    } else {
      motivos.push(`Produtividade adequada: ${produtividade.media_prod.toFixed(0)} kg/h`);
    }
  }

  if (produtividade.media_efic !== null) {
    if (produtividade.media_efic < 70) {
      motivos.push(`Eficiência baixa: ${produtividade.media_efic.toFixed(0)}%`);
      riscos.push('Baixa eficiência pode indicar problemas operacionais');
    } else if (produtividade.media_efic >= 90) {
      motivos.push(`Eficiência excelente: ${produtividade.media_efic.toFixed(0)}%`);
    }
  }

  if (produtividade.tendencia === 'caindo') {
    motivos.push('Tendência de produtividade em queda nos últimos 6 meses');
    confirmar.push('Verificar se há problemas mecânicos ou de processo');
  }

  // Análise de observações de lote
  if (producao_6m?.observacoes_lote && producao_6m.observacoes_lote.length > 0) {
    const obsRelevantes = producao_6m.observacoes_lote.filter(obs => 
      obs && (
        obs.toLowerCase().includes('problema') ||
        obs.toLowerCase().includes('defeito') ||
        obs.toLowerCase().includes('parada') ||
        obs.toLowerCase().includes('trinca') ||
        obs.toLowerCase().includes('desgaste') ||
        obs.toLowerCase().includes('risco') ||
        obs.toLowerCase().includes('atenção') ||
        obs.toLowerCase().includes('urgente')
      )
    );
    
    if (obsRelevantes.length > 0) {
      motivos.push(`${obsRelevantes.length} observações de lote relevantes encontradas`);
      riscos.push(`Observações recentes: "${obsRelevantes[0].substring(0, 80)}${obsRelevantes[0].length > 80 ? '...' : ''}"`);
      confirmar.push('Revisar observações de lote detalhadamente');
    }
  }

  // Análise de códigos de parada
  if (producao_6m?.codigos_parada && producao_6m.codigos_parada.length > 0) {
    motivos.push(`Códigos de parada registrados: ${producao_6m.codigos_parada.slice(0, 3).join(', ')}`);
  }

  // Análise de atividade
  if (ultima_atividade.dias_parada && ultima_atividade.dias_parada > 90) {
    limitacoes.push(`Matriz sem atividade há ${ultima_atividade.dias_parada} dias`);
    confirmar.push('Confirmar se matriz ainda está em uso');
  }

  // Determinar recomendação
  let recomendacao: 'Confeccionar' | 'Planejar' | 'OK';
  let resumo: string;

  if (score_atual.status === 'confeccionar' || score_atual.total >= 70) {
    recomendacao = 'Confeccionar';
    resumo = `A matriz ${codigo} apresenta risco crítico (score ${score_atual.total.toFixed(0)}/100) e requer confecção imediata. `;
  } else if (score_atual.status === 'planejar' || score_atual.total >= 40) {
    recomendacao = 'Planejar';
    resumo = `A matriz ${codigo} apresenta risco moderado (score ${score_atual.total.toFixed(0)}/100) e deve ter reposição planejada. `;
  } else {
    recomendacao = 'OK';
    resumo = `A matriz ${codigo} está saudável (score ${score_atual.total.toFixed(0)}/100) e não requer ação imediata. `;
  }

  // Complementar resumo
  if (motivos.length > 0) {
    resumo += `Principais fatores: ${motivos.slice(0, 2).join('; ')}.`;
  }

  // Adicionar limitações padrão
  limitacoes.push('Análise baseada em dados históricos - confirmar situação atual');
  if (!produtividade.media_prod) {
    limitacoes.push('Dados de produtividade não disponíveis');
  }

  // Calcular confiança
  let confianca = 70;
  if (!produtividade.media_prod) confianca -= 15;
  if (!abc.classe) confianca -= 10;
  if (ultima_atividade.dias_parada && ultima_atividade.dias_parada > 90) confianca -= 20;
  confianca = Math.max(30, Math.min(95, confianca));

  return {
    recomendacao,
    resumo_executivo: resumo,
    motivos_com_numeros: motivos,
    riscos,
    acoes_recomendadas: acoes.length > 0 ? acoes : ['Manter monitoramento regular'],
    o_que_confirmar: confirmar.length > 0 ? confirmar : ['Nenhuma verificação adicional necessária'],
    confianca_0a100: confianca,
    limitacoes_dos_dados: limitacoes,
  };
}

/**
 * Gera ranking localmente usando os dados já carregados
 */
export function gerarRankingLocal(matrizes: MatrizContexto[]): RankingData {
  // Ordenar por score (maior = mais urgente)
  const sorted = [...matrizes].sort((a, b) => b.score_atual.total - a.score_atual.total);
  
  const items: RankingItem[] = sorted.slice(0, 50).map((m, idx) => {
    const parecer = gerarParecerLocal(m);
    return {
      posicao: idx + 1,
      matriz: m.codigo,
      score: m.score_atual.total,
      recomendacao: parecer.recomendacao,
      resumo_curto: parecer.resumo_executivo.substring(0, 150) + '...',
      motivos_principais: parecer.motivos_com_numeros.slice(0, 3),
    };
  });

  return {
    items,
    data_referencia: new Date().toISOString().split('T')[0],
    criterios: {
      periodo_meses: 12,
      dias_inatividade: 90,
      total_matrizes_analisadas: matrizes.length,
    },
  };
}
