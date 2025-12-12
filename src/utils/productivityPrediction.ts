/**
 * Utilitário para projeções preditivas de produtividade
 * Usa regressão linear e análise de tendência para prever valores futuros
 */

import { MatrizStats, MonthlyData } from './productivityAnalysis';

export interface PredictionPoint {
    month: string;
    predictedValue: number;
    confidenceLow: number;
    confidenceHigh: number;
    isPrediction: true;
}

export interface HistoricalPoint {
    month: string;
    actualValue: number;
    isPrediction: false;
}

export type TimeSeriesPoint = PredictionPoint | HistoricalPoint;

export interface PredictionResult {
    matriz: string;
    historicalData: HistoricalPoint[];
    predictions: PredictionPoint[];
    trend: 'up' | 'down' | 'stable';
    trendStrength: number; // 0-100
    predictedChange: number; // % mudança esperada em 3 meses
    reliability: 'high' | 'medium' | 'low';
    reliabilityReason: string;
}

export interface AlertDetail {
    matriz: string;
    avgProdutividade: number;
    avgEficiencia: number;
    trend: 'up' | 'down' | 'stable';
    predictedChange?: number;
    reliability?: 'high' | 'medium' | 'low';
    historicalData?: { month: string; value: number }[];
    predictions?: { month: string; value: number; low: number; high: number }[];
}

export interface Alert {
    id: string;
    type: 'critical' | 'warning' | 'info' | 'success';
    category: 'prediction' | 'anomaly' | 'trend' | 'threshold' | 'comparison';
    title: string;
    description: string;
    matriz?: string;
    metric?: string;
    value?: number;
    threshold?: number;
    timestamp: Date;
    actionable: boolean;
    suggestedAction?: string;
    details?: AlertDetail[]; // Detailed data for drill-down
    chartData?: { historical: { month: string; value: number }[]; predictions: { month: string; value: number; low: number; high: number }[] };
}

/**
 * Calcula regressão linear simples
 */
function linearRegression(data: number[]): { slope: number; intercept: number; r2: number } {
    const n = data.length;
    if (n < 2) return { slope: 0, intercept: data[0] || 0, r2: 0 };

    const xMean = (n - 1) / 2;
    const yMean = data.reduce((a, b) => a + b, 0) / n;

    let ssXY = 0;
    let ssXX = 0;
    let ssYY = 0;

    for (let i = 0; i < n; i++) {
        const xDiff = i - xMean;
        const yDiff = data[i] - yMean;
        ssXY += xDiff * yDiff;
        ssXX += xDiff * xDiff;
        ssYY += yDiff * yDiff;
    }

    const slope = ssXX !== 0 ? ssXY / ssXX : 0;
    const intercept = yMean - slope * xMean;
    const r2 = ssXX !== 0 && ssYY !== 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0;

    return { slope, intercept, r2 };
}

/**
 * Calcula o desvio padrão dos resíduos para intervalo de confiança
 */
function calculateResidualStdDev(data: number[], slope: number, intercept: number): number {
    if (data.length < 3) return 0;
    
    const residuals = data.map((y, x) => y - (slope * x + intercept));
    const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (residuals.length - 2);
    
    return Math.sqrt(variance);
}

/**
 * Gera nome do mês futuro baseado no último mês
 */
function getNextMonth(lastMonth: string, monthsAhead: number): string {
    const [year, month] = lastMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + monthsAhead, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Formata mês para exibição
 */
function formatMonthLabel(month: string): string {
    const [year, m] = month.split('-');
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${monthNames[parseInt(m) - 1]}/${year.slice(2)}`;
}

/**
 * Gera projeções para uma matriz específica
 */
export function generatePredictions(
    stat: MatrizStats,
    monthsToPredict: number = 3
): PredictionResult {
    const monthlyData = stat.monthlyData;
    
    // Extrair valores históricos (média mensal de produtividade)
    const historicalValues = monthlyData.map(m => 
        m.produtividade.length > 0 
            ? m.produtividade.reduce((a, b) => a + b, 0) / m.produtividade.length 
            : 0
    );
    
    // Criar pontos históricos
    const historicalData: HistoricalPoint[] = monthlyData.map((m, i) => ({
        month: m.month,
        actualValue: historicalValues[i],
        isPrediction: false as const
    }));

    // Calcular regressão linear
    const { slope, intercept, r2 } = linearRegression(historicalValues);
    const residualStdDev = calculateResidualStdDev(historicalValues, slope, intercept);

    // Determinar confiabilidade
    let reliability: 'high' | 'medium' | 'low';
    let reliabilityReason: string;

    if (monthlyData.length >= 6 && r2 >= 0.6) {
        reliability = 'high';
        reliabilityReason = 'Dados suficientes com padrão consistente';
    } else if (monthlyData.length >= 4 && r2 >= 0.3) {
        reliability = 'medium';
        reliabilityReason = 'Padrão moderado identificado';
    } else {
        reliability = 'low';
        reliabilityReason = monthlyData.length < 4 
            ? 'Poucos dados históricos disponíveis' 
            : 'Alta variabilidade nos dados';
    }

    // Gerar previsões
    const predictions: PredictionPoint[] = [];
    const lastMonth = monthlyData[monthlyData.length - 1]?.month || '2024-01';
    const n = historicalValues.length;

    for (let i = 1; i <= monthsToPredict; i++) {
        const futureX = n - 1 + i;
        const predictedValue = Math.max(0, slope * futureX + intercept);
        
        // Intervalo de confiança (95%) - aumenta com a distância
        const confidenceMultiplier = 1.96 * residualStdDev * Math.sqrt(1 + 1/n + Math.pow(futureX - (n-1)/2, 2) / (n * Math.pow((n-1)/2, 2)));
        
        predictions.push({
            month: getNextMonth(lastMonth, i),
            predictedValue: Math.round(predictedValue * 100) / 100,
            confidenceLow: Math.max(0, Math.round((predictedValue - confidenceMultiplier) * 100) / 100),
            confidenceHigh: Math.round((predictedValue + confidenceMultiplier) * 100) / 100,
            isPrediction: true
        });
    }

    // Calcular tendência
    let trend: 'up' | 'down' | 'stable';
    const trendThreshold = 0.5; // % por mês para considerar tendência
    const monthlyChangePercent = stat.avgProdutividade > 0 
        ? (slope / stat.avgProdutividade) * 100 
        : 0;

    if (monthlyChangePercent > trendThreshold) {
        trend = 'up';
    } else if (monthlyChangePercent < -trendThreshold) {
        trend = 'down';
    } else {
        trend = 'stable';
    }

    // Força da tendência (0-100)
    const trendStrength = Math.min(100, Math.abs(monthlyChangePercent) * 10);

    // Mudança prevista em 3 meses
    const currentValue = historicalValues[historicalValues.length - 1] || stat.avgProdutividade;
    const futureValue = predictions[predictions.length - 1]?.predictedValue || currentValue;
    const predictedChange = currentValue > 0 
        ? ((futureValue - currentValue) / currentValue) * 100 
        : 0;

    return {
        matriz: stat.matriz,
        historicalData,
        predictions,
        trend,
        trendStrength: Math.round(trendStrength),
        predictedChange: Math.round(predictedChange * 10) / 10,
        reliability,
        reliabilityReason
    };
}

/**
 * Gera alertas inteligentes baseados nos dados e projeções
 */
export function generateAlerts(
    stats: MatrizStats[],
    predictions: Map<string, PredictionResult>,
    overallAvgProd: number,
    overallAvgEfic: number
): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date();

    // Helper to create AlertDetail from stat and prediction
    const createAlertDetail = (stat: MatrizStats, pred?: PredictionResult): AlertDetail => ({
        matriz: stat.matriz,
        avgProdutividade: stat.avgProdutividade,
        avgEficiencia: stat.avgEficiencia,
        trend: stat.trend,
        predictedChange: pred?.predictedChange,
        reliability: pred?.reliability,
        historicalData: pred?.historicalData.map(h => ({ month: h.month, value: h.actualValue })),
        predictions: pred?.predictions.map(p => ({ 
            month: p.month, 
            value: p.predictedValue, 
            low: p.confidenceLow, 
            high: p.confidenceHigh 
        }))
    });

    // Collect all matrices with predicted drops
    const droppingMatrices = stats.filter(stat => {
        const prediction = predictions.get(stat.matriz);
        return prediction && prediction.predictedChange < -10 && prediction.reliability !== 'low';
    }).sort((a, b) => {
        const predA = predictions.get(a.matriz);
        const predB = predictions.get(b.matriz);
        return (predA?.predictedChange || 0) - (predB?.predictedChange || 0);
    });

    // 1. Alertas de projeção de queda (individual)
    droppingMatrices.forEach(stat => {
        const prediction = predictions.get(stat.matriz);
        if (prediction) {
            alerts.push({
                id: `pred-drop-${stat.matriz}`,
                type: prediction.predictedChange < -20 ? 'critical' : 'warning',
                category: 'prediction',
                title: `Queda prevista: ${stat.matriz}`,
                description: `Projeção indica queda de ${Math.abs(prediction.predictedChange).toFixed(1)}% nos próximos 3 meses`,
                matriz: stat.matriz,
                metric: 'produtividade',
                value: prediction.predictedChange,
                timestamp: now,
                actionable: true,
                suggestedAction: 'Investigar causas e planejar manutenção preventiva',
                details: [createAlertDetail(stat, prediction)],
                chartData: {
                    historical: prediction.historicalData.map(h => ({ month: h.month, value: h.actualValue })),
                    predictions: prediction.predictions.map(p => ({ 
                        month: p.month, 
                        value: p.predictedValue, 
                        low: p.confidenceLow, 
                        high: p.confidenceHigh 
                    }))
                }
            });
        }
    });

    // Collect all matrices with predicted growth
    const growingMatrices = stats.filter(stat => {
        const prediction = predictions.get(stat.matriz);
        return prediction && prediction.predictedChange > 15 && prediction.reliability !== 'low';
    }).sort((a, b) => {
        const predA = predictions.get(a.matriz);
        const predB = predictions.get(b.matriz);
        return (predB?.predictedChange || 0) - (predA?.predictedChange || 0);
    });

    // 2. Alertas de projeção de melhoria (individual)
    growingMatrices.forEach(stat => {
        const prediction = predictions.get(stat.matriz);
        if (prediction) {
            alerts.push({
                id: `pred-rise-${stat.matriz}`,
                type: 'success',
                category: 'prediction',
                title: `Crescimento previsto: ${stat.matriz}`,
                description: `Projeção indica crescimento de ${prediction.predictedChange.toFixed(1)}% nos próximos 3 meses`,
                matriz: stat.matriz,
                metric: 'produtividade',
                value: prediction.predictedChange,
                timestamp: now,
                actionable: false,
                details: [createAlertDetail(stat, prediction)],
                chartData: {
                    historical: prediction.historicalData.map(h => ({ month: h.month, value: h.actualValue })),
                    predictions: prediction.predictions.map(p => ({ 
                        month: p.month, 
                        value: p.predictedValue, 
                        low: p.confidenceLow, 
                        high: p.confidenceHigh 
                    }))
                }
            });
        }
    });

    // Collect low efficiency matrices
    const lowEfficiencyMatrices = stats.filter(s => s.avgEficiencia < 60)
        .sort((a, b) => a.avgEficiencia - b.avgEficiencia);

    // 3. Alertas de eficiência baixa (individual)
    lowEfficiencyMatrices.forEach(stat => {
        const prediction = predictions.get(stat.matriz);
        alerts.push({
            id: `low-eff-${stat.matriz}`,
            type: stat.avgEficiencia < 40 ? 'critical' : 'warning',
            category: 'threshold',
            title: `Eficiência baixa: ${stat.matriz}`,
            description: `Eficiência média de ${stat.avgEficiencia.toFixed(1)}% está abaixo do aceitável`,
            matriz: stat.matriz,
            metric: 'eficiência',
            value: stat.avgEficiencia,
            threshold: 60,
            timestamp: now,
            actionable: true,
            suggestedAction: 'Avaliar processos e identificar gargalos de produção',
            details: [createAlertDetail(stat, prediction)]
        });
    });

    // Collect high variability matrices
    const highVariabilityMatrices = stats.filter(s => s.cvProdutividade > 30)
        .sort((a, b) => b.cvProdutividade - a.cvProdutividade);

    // 4. Alertas de alta variabilidade (individual)
    highVariabilityMatrices.forEach(stat => {
        const prediction = predictions.get(stat.matriz);
        alerts.push({
            id: `high-cv-${stat.matriz}`,
            type: 'warning',
            category: 'anomaly',
            title: `Alta variabilidade: ${stat.matriz}`,
            description: `Coeficiente de variação de ${stat.cvProdutividade.toFixed(1)}% indica produção inconsistente`,
            matriz: stat.matriz,
            metric: 'variabilidade',
            value: stat.cvProdutividade,
            threshold: 30,
            timestamp: now,
            actionable: true,
            suggestedAction: 'Padronizar processos e verificar qualidade da matéria-prima',
            details: [createAlertDetail(stat, prediction)]
        });
    });

    // 5. Alerta de tendência geral negativa
    const downwardTrends = stats.filter(s => s.trend === 'down').length;
    const downwardPercent = (downwardTrends / stats.length) * 100;
    if (downwardPercent > 40) {
        alerts.push({
            id: 'general-downward-trend',
            type: 'warning',
            category: 'trend',
            title: 'Tendência geral de queda',
            description: `${downwardPercent.toFixed(0)}% das matrizes apresentam tendência de queda`,
            value: downwardPercent,
            timestamp: now,
            actionable: true,
            suggestedAction: 'Revisar processos gerais e capacitar equipe'
        });
    }

    // 6. Alerta de matrizes abaixo da média
    const belowAverage = stats.filter(s => s.avgProdutividade < overallAvgProd * 0.7).length;
    if (belowAverage > 3) {
        alerts.push({
            id: 'multiple-below-avg',
            type: 'info',
            category: 'comparison',
            title: 'Matrizes abaixo da média',
            description: `${belowAverage} matrizes estão 30% ou mais abaixo da média geral`,
            value: belowAverage,
            timestamp: now,
            actionable: true,
            suggestedAction: 'Priorizar análise das matrizes com pior desempenho'
        });
    }

    // 7. Alerta positivo - matrizes de destaque
    const topPerformers = stats.filter(s => 
        s.avgProdutividade > overallAvgProd * 1.2 && 
        s.avgEficiencia > 80 && 
        s.trend !== 'down'
    ).length;
    if (topPerformers >= 3) {
        alerts.push({
            id: 'top-performers',
            type: 'success',
            category: 'comparison',
            title: 'Matrizes de destaque',
            description: `${topPerformers} matrizes apresentam desempenho excepcional`,
            value: topPerformers,
            timestamp: now,
            actionable: false
        });
    }

    // Ordenar por tipo (crítico primeiro)
    const typeOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    alerts.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

    return alerts;
}

/**
 * Retorna cor do alerta baseado no tipo
 */
export function getAlertTypeColor(type: Alert['type']): string {
    switch (type) {
        case 'critical': return 'bg-red-100 border-red-300 text-red-800';
        case 'warning': return 'bg-amber-100 border-amber-300 text-amber-800';
        case 'info': return 'bg-blue-100 border-blue-300 text-blue-800';
        case 'success': return 'bg-green-100 border-green-300 text-green-800';
    }
}

/**
 * Retorna ícone do alerta baseado no tipo
 */
export function getAlertIcon(type: Alert['type']): string {
    switch (type) {
        case 'critical': return '🚨';
        case 'warning': return '⚠️';
        case 'info': return 'ℹ️';
        case 'success': return '✅';
    }
}

/**
 * Retorna cor da confiabilidade
 */
export function getReliabilityColor(reliability: PredictionResult['reliability']): string {
    switch (reliability) {
        case 'high': return 'text-green-600';
        case 'medium': return 'text-amber-600';
        case 'low': return 'text-red-600';
    }
}

/**
 * Retorna badge da confiabilidade
 */
export function getReliabilityBadge(reliability: PredictionResult['reliability']): string {
    switch (reliability) {
        case 'high': return 'bg-green-100 text-green-800';
        case 'medium': return 'bg-amber-100 text-amber-800';
        case 'low': return 'bg-red-100 text-red-800';
    }
}
