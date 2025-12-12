// Utility functions for generating automatic productivity insights

import { MatrizStats, AnomalyDetail } from './productivityAnalysis';
import { ScoreBreakdown } from './productivityScore';

export interface InsightDetail {
  matriz: string;
  avgProdutividade: number;
  avgEficiencia: number;
  trend: 'up' | 'down' | 'stable';
  cvProdutividade: number;
  totalRecords: number;
  sparklineData: number[];
  score?: number;
  anomaliesCount?: number;
}

export interface Insight {
  id: string;
  type: 'positive' | 'negative' | 'warning' | 'info';
  icon: string;
  title: string;
  description: string;
  priority: number; // 1 = highest
  details?: InsightDetail[]; // Detailed data for drill-down
  metric?: string; // What metric this insight is about
  value?: number; // Main value for the insight
}

export interface InsightContext {
  stats: MatrizStats[];
  scores: Map<string, ScoreBreakdown>;
  anomaliesMap: Map<string, AnomalyDetail[]>;
  overallAvgProd: number;
  overallAvgEfic: number;
  period: number; // months
}

/**
 * Gera insights automáticos baseados nos dados de produtividade
 */
export function generateInsights(context: InsightContext): Insight[] {
  const insights: Insight[] = [];
  const { stats, scores, anomaliesMap, overallAvgProd, overallAvgEfic, period } = context;

  if (stats.length === 0) return insights;

  // Helper function to create InsightDetail from MatrizStats
  const createDetail = (s: MatrizStats): InsightDetail => ({
    matriz: s.matriz,
    avgProdutividade: s.avgProdutividade,
    avgEficiencia: s.avgEficiencia,
    trend: s.trend,
    cvProdutividade: s.cvProdutividade,
    totalRecords: s.totalRecords,
    sparklineData: s.sparklineData,
    score: scores.get(s.matriz)?.total,
    anomaliesCount: anomaliesMap.get(s.matriz)?.length || 0
  });

  // 1. Melhor matriz do período
  const bestMatrix = [...stats].sort((a, b) => b.avgProdutividade - a.avgProdutividade)[0];
  if (bestMatrix) {
    const percentAbove = ((bestMatrix.avgProdutividade - overallAvgProd) / overallAvgProd * 100);
    if (percentAbove > 10) {
      // Get top 10 most productive matrices for details
      const topMatrices = [...stats].sort((a, b) => b.avgProdutividade - a.avgProdutividade).slice(0, 10);
      insights.push({
        id: 'best-matrix',
        type: 'positive',
        icon: '🏆',
        title: `${bestMatrix.matriz} é a matriz mais produtiva`,
        description: `Produtividade ${percentAbove.toFixed(1)}% acima da média geral (${bestMatrix.avgProdutividade.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg/h)`,
        priority: 1,
        metric: 'produtividade',
        value: bestMatrix.avgProdutividade,
        details: topMatrices.map(createDetail)
      });
    }
  }

  // 2. Matrizes com tendência de alta
  const upTrendMatrices = stats.filter(s => s.trend === 'up');
  if (upTrendMatrices.length > 0) {
    const sortedUp = [...upTrendMatrices].sort((a, b) => b.avgProdutividade - a.avgProdutividade);
    if (upTrendMatrices.length === 1) {
      insights.push({
        id: 'single-up-trend',
        type: 'positive',
        icon: '📈',
        title: `${upTrendMatrices[0].matriz} em tendência de alta`,
        description: `Produtividade crescendo nos últimos ${period} meses`,
        priority: 2,
        metric: 'tendência',
        details: sortedUp.map(createDetail)
      });
    } else {
      insights.push({
        id: 'multiple-up-trend',
        type: 'positive',
        icon: '📈',
        title: `${upTrendMatrices.length} matrizes em tendência de alta`,
        description: `${upTrendMatrices.slice(0, 3).map(m => m.matriz).join(', ')}${upTrendMatrices.length > 3 ? '...' : ''}`,
        priority: 2,
        metric: 'tendência',
        details: sortedUp.map(createDetail)
      });
    }
  }

  // 3. Matrizes com tendência de queda
  const downTrendMatrices = stats.filter(s => s.trend === 'down');
  if (downTrendMatrices.length > 0) {
    const sortedDown = [...downTrendMatrices].sort((a, b) => a.avgProdutividade - b.avgProdutividade);
    if (downTrendMatrices.length === 1) {
      insights.push({
        id: 'single-down-trend',
        type: 'warning',
        icon: '📉',
        title: `${downTrendMatrices[0].matriz} em tendência de queda`,
        description: `Requer atenção - produtividade decrescendo`,
        priority: 3,
        metric: 'tendência',
        details: sortedDown.map(createDetail)
      });
    } else {
      insights.push({
        id: 'multiple-down-trend',
        type: 'warning',
        icon: '📉',
        title: `${downTrendMatrices.length} matrizes em tendência de queda`,
        description: `${downTrendMatrices.slice(0, 3).map(m => m.matriz).join(', ')}${downTrendMatrices.length > 3 ? '...' : ''} - requerem atenção`,
        priority: 3,
        metric: 'tendência',
        details: sortedDown.map(createDetail)
      });
    }
  }

  // 4. Matrizes críticas (score < 40)
  const criticalMatrices = stats.filter(s => {
    const score = scores.get(s.matriz);
    return score && score.total < 40;
  });
  if (criticalMatrices.length > 0) {
    const sortedCritical = [...criticalMatrices].sort((a, b) => {
      const scoreA = scores.get(a.matriz)?.total || 0;
      const scoreB = scores.get(b.matriz)?.total || 0;
      return scoreA - scoreB;
    });
    insights.push({
      id: 'critical-matrices',
      type: 'negative',
      icon: '🔥',
      title: `${criticalMatrices.length} matriz${criticalMatrices.length > 1 ? 'es' : ''} em estado crítico`,
      description: `${criticalMatrices.slice(0, 3).map(m => m.matriz).join(', ')} - ação imediata recomendada`,
      priority: 1,
      metric: 'score',
      details: sortedCritical.map(createDetail)
    });
  }

  // 5. Total de anomalias no período
  let totalAnomalies = 0;
  anomaliesMap.forEach(anomalies => {
    totalAnomalies += anomalies.length;
  });
  if (totalAnomalies > 0) {
    const matricesWithAnomalies = Array.from(anomaliesMap.entries())
      .filter(([_, anomalies]) => anomalies.length > 0);
    const sortedByAnomalies = matricesWithAnomalies
      .sort((a, b) => b[1].length - a[1].length)
      .map(([matriz]) => stats.find(s => s.matriz === matriz))
      .filter((s): s is MatrizStats => s !== undefined);
    
    insights.push({
      id: 'total-anomalies',
      type: 'warning',
      icon: '⚠️',
      title: `${totalAnomalies} anomalia${totalAnomalies > 1 ? 's' : ''} detectada${totalAnomalies > 1 ? 's' : ''}`,
      description: `Em ${matricesWithAnomalies.length} matriz${matricesWithAnomalies.length > 1 ? 'es' : ''} nos últimos ${period} meses`,
      priority: 4,
      metric: 'anomalias',
      value: totalAnomalies,
      details: sortedByAnomalies.map(createDetail)
    });
  }

  // 6. Matrizes com alta variabilidade (CV > 25%)
  const highVariabilityMatrices = stats.filter(s => s.cvProdutividade > 25);
  if (highVariabilityMatrices.length > 0) {
    const sortedByCV = [...highVariabilityMatrices].sort((a, b) => b.cvProdutividade - a.cvProdutividade);
    insights.push({
      id: 'high-variability',
      type: 'info',
      icon: '🎯',
      title: `${highVariabilityMatrices.length} matriz${highVariabilityMatrices.length > 1 ? 'es' : ''} com alta variabilidade`,
      description: `Produção inconsistente - verificar parâmetros de processo`,
      priority: 5,
      metric: 'variabilidade',
      details: sortedByCV.map(createDetail)
    });
  }

  // 7. Eficiência geral
  if (overallAvgEfic >= 85) {
    const highEffMatrices = [...stats].filter(s => s.avgEficiencia >= 85).sort((a, b) => b.avgEficiencia - a.avgEficiencia);
    insights.push({
      id: 'high-efficiency',
      type: 'positive',
      icon: '✨',
      title: 'Eficiência geral acima de 85%',
      description: `Média de ${overallAvgEfic.toFixed(1)}% - excelente aproveitamento`,
      priority: 6,
      metric: 'eficiência',
      value: overallAvgEfic,
      details: highEffMatrices.slice(0, 20).map(createDetail)
    });
  } else if (overallAvgEfic < 75) {
    const lowEffMatrices = [...stats].filter(s => s.avgEficiencia < 75).sort((a, b) => a.avgEficiencia - b.avgEficiencia);
    insights.push({
      id: 'low-efficiency',
      type: 'warning',
      icon: '⏱️',
      title: 'Eficiência geral abaixo de 75%',
      description: `Média de ${overallAvgEfic.toFixed(1)}% - oportunidade de melhoria`,
      priority: 4,
      metric: 'eficiência',
      value: overallAvgEfic,
      details: lowEffMatrices.slice(0, 20).map(createDetail)
    });
  }

  // 8. Matrizes excelentes (score >= 80)
  const excellentMatrices = stats.filter(s => {
    const score = scores.get(s.matriz);
    return score && score.total >= 80;
  });
  if (excellentMatrices.length > 0) {
    const sortedExcellent = [...excellentMatrices].sort((a, b) => {
      const scoreA = scores.get(a.matriz)?.total || 0;
      const scoreB = scores.get(b.matriz)?.total || 0;
      return scoreB - scoreA;
    });
    insights.push({
      id: 'excellent-matrices',
      type: 'positive',
      icon: '⭐',
      title: `${excellentMatrices.length} matriz${excellentMatrices.length > 1 ? 'es' : ''} com desempenho excelente`,
      description: `${excellentMatrices.slice(0, 3).map(m => m.matriz).join(', ')}${excellentMatrices.length > 3 ? '...' : ''}`,
      priority: 5,
      metric: 'score',
      details: sortedExcellent.map(createDetail)
    });
  }

  // Ordenar por prioridade
  return insights.sort((a, b) => a.priority - b.priority);
}

/**
 * Gera ações sugeridas baseadas nas anomalias e score
 */
export function generateSuggestedActions(
  stat: MatrizStats,
  anomalies: AnomalyDetail[],
  score: ScoreBreakdown
): string[] {
  const actions: string[] = [];

  // Baseado no score
  if (score.total < 40) {
    actions.push('🔴 Revisar urgentemente os parâmetros de extrusão');
    actions.push('🔴 Verificar estado físico da matriz (desgaste, alinhamento)');
  }

  if (score.produtividadeScore < 15) {
    actions.push('📊 Analisar histórico de produtividade e identificar período de queda');
  }

  if (score.eficienciaScore < 12.5) {
    actions.push('⏱️ Verificar tempos de setup e paradas não programadas');
  }

  if (score.estabilidadeScore < 10) {
    actions.push('📈 Investigar causas das anomalias recorrentes');
  }

  if (score.consistenciaScore < 5) {
    actions.push('🎯 Padronizar parâmetros de processo para reduzir variabilidade');
  }

  // Baseado em anomalias recentes
  if (anomalies.length > 0) {
    const lastAnomaly = anomalies[anomalies.length - 1];
    if (lastAnomaly.severity === 'critical') {
      actions.push('🚨 Anomalia crítica detectada - analisar causa raiz imediatamente');
    }

    // Causas específicas das anomalias
    anomalies.forEach(anomaly => {
      anomaly.recommendations.forEach(rec => {
        if (!actions.includes(`💡 ${rec}`)) {
          actions.push(`💡 ${rec}`);
        }
      });
    });
  }

  // Baseado na tendência
  if (stat.trend === 'down') {
    actions.push('📉 Investigar causa da tendência de queda');
    actions.push('🔧 Considerar manutenção preventiva da matriz');
  }

  // Limitar a 5 ações
  return actions.slice(0, 5);
}

/**
 * Retorna cor do tipo de insight
 */
export function getInsightTypeColor(type: Insight['type']): string {
  switch (type) {
    case 'positive': return 'text-green-700 bg-green-50 border-green-200';
    case 'negative': return 'text-red-700 bg-red-50 border-red-200';
    case 'warning': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    case 'info': return 'text-blue-700 bg-blue-50 border-blue-200';
  }
}
