// Utility functions for calculating matrix health score (0-100)

import { MatrizStats, AnomalyDetail } from './productivityAnalysis';

export interface ScoreBreakdown {
  produtividadeScore: number;      // 0-30 pts
  eficienciaScore: number;         // 0-25 pts
  estabilidadeScore: number;       // 0-20 pts (baseado em anomalias)
  tendenciaScore: number;          // 0-15 pts
  consistenciaScore: number;       // 0-10 pts (baseado em CV)
  total: number;                   // 0-100
  status: 'excellent' | 'good' | 'attention' | 'critical';
  statusLabel: string;
  statusColor: string;
  statusBgColor: string;
}

/**
 * Calcula o score de saúde da matriz (0-100)
 * 
 * Pesos:
 * - Produtividade: 30 pts (comparado com média geral)
 * - Eficiência: 25 pts
 * - Estabilidade: 20 pts (baseado em anomalias)
 * - Tendência: 15 pts
 * - Consistência: 10 pts (baseado em CV)
 */
export function calculateMatrixScore(
  stat: MatrizStats,
  overallAvgProd: number,
  anomalies: AnomalyDetail[]
): ScoreBreakdown {
  // 1. Produtividade Score (0-30)
  // Se produtividade >= média geral = 30 pts
  // Se produtividade = 50% da média = 15 pts
  // Escala linear
  const prodRatio = overallAvgProd > 0 ? stat.avgProdutividade / overallAvgProd : 1;
  const produtividadeScore = Math.min(30, Math.max(0, prodRatio * 30));

  // 2. Eficiência Score (0-25)
  // Eficiência >= 90% = 25 pts
  // Eficiência 80% = 20 pts
  // Eficiência 70% = 15 pts
  // Escala linear
  const eficienciaScore = Math.min(25, Math.max(0, (stat.avgEficiencia / 100) * 25));

  // 3. Estabilidade Score (0-20)
  // 0 anomalias = 20 pts
  // 1 anomalia = 16 pts
  // 2 anomalias = 12 pts
  // 3+ anomalias = proporcional
  const maxAnomalies = 6;
  const anomalyPenalty = Math.min(anomalies.length, maxAnomalies) / maxAnomalies;
  const estabilidadeScore = Math.max(0, 20 * (1 - anomalyPenalty));

  // 4. Tendência Score (0-15)
  // up = 15 pts
  // stable = 10 pts
  // down = 5 pts
  let tendenciaScore = 10;
  if (stat.trend === 'up') tendenciaScore = 15;
  else if (stat.trend === 'down') tendenciaScore = 5;

  // 5. Consistência Score (0-10)
  // CV <= 10% = 10 pts
  // CV 20% = 7.5 pts
  // CV 30% = 5 pts
  // CV >= 50% = 0 pts
  const cvNormalized = Math.min(stat.cvProdutividade, 50) / 50;
  const consistenciaScore = Math.max(0, 10 * (1 - cvNormalized));

  // Total
  const total = Math.round(
    produtividadeScore + 
    eficienciaScore + 
    estabilidadeScore + 
    tendenciaScore + 
    consistenciaScore
  );

  // Status classification
  let status: 'excellent' | 'good' | 'attention' | 'critical';
  let statusLabel: string;
  let statusColor: string;
  let statusBgColor: string;

  if (total >= 80) {
    status = 'excellent';
    statusLabel = 'Excelente';
    statusColor = 'text-green-700';
    statusBgColor = 'bg-green-100';
  } else if (total >= 60) {
    status = 'good';
    statusLabel = 'Bom';
    statusColor = 'text-blue-700';
    statusBgColor = 'bg-blue-100';
  } else if (total >= 40) {
    status = 'attention';
    statusLabel = 'Atenção';
    statusColor = 'text-yellow-700';
    statusBgColor = 'bg-yellow-100';
  } else {
    status = 'critical';
    statusLabel = 'Crítico';
    statusColor = 'text-red-700';
    statusBgColor = 'bg-red-100';
  }

  return {
    produtividadeScore: Math.round(produtividadeScore * 10) / 10,
    eficienciaScore: Math.round(eficienciaScore * 10) / 10,
    estabilidadeScore: Math.round(estabilidadeScore * 10) / 10,
    tendenciaScore,
    consistenciaScore: Math.round(consistenciaScore * 10) / 10,
    total,
    status,
    statusLabel,
    statusColor,
    statusBgColor
  };
}

/**
 * Retorna a cor do score baseada no valor
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Retorna a cor de fundo do score baseada no valor
 */
export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Retorna a cor de fundo suave do score
 */
export function getScoreBgColorLight(score: number): string {
  if (score >= 80) return 'bg-green-100';
  if (score >= 60) return 'bg-blue-100';
  if (score >= 40) return 'bg-yellow-100';
  return 'bg-red-100';
}

/**
 * Retorna o ícone emoji baseado no score
 */
export function getScoreEmoji(score: number): string {
  if (score >= 80) return '⭐';
  if (score >= 60) return '✅';
  if (score >= 40) return '⚠️';
  return '🔥';
}
