/**
 * Utilitário para Drilldown de Produtividade
 * Permite análise detalhada por Turno, Prensa e Liga
 */

export interface DrilldownData {
    key: string;
    label: string;
    count: number;
    avgProdutividade: number;
    avgEficiencia: number;
    minProdutividade: number;
    maxProdutividade: number;
    percentOfTotal: number;
    trend: 'up' | 'down' | 'stable';
    comparison: number; // % vs média geral
}

export interface DrilldownResult {
    type: 'turno' | 'prensa' | 'liga';
    label: string;
    data: DrilldownData[];
    totalRecords: number;
    overallAvg: number;
    bestPerformer: DrilldownData | null;
    worstPerformer: DrilldownData | null;
}

export interface RawProductionData {
    Turno?: string | null;
    Prensa?: string | number | null;
    "Liga Utilizada"?: string | null;
    Produtividade?: number | string | null;
    "Eficiência"?: number | string | null;
    "Data Produção"?: string | null;
}

/**
 * Calcula drilldown por uma dimensão específica
 */
export function calculateDrilldown(
    data: RawProductionData[],
    dimension: 'turno' | 'prensa' | 'liga',
    matrizFilter?: string
): DrilldownResult {
    // Filtrar por matriz se especificado
    let filtered = data;
    if (matrizFilter) {
        filtered = data.filter(d => 
            (d as any).Matriz?.toString().toLowerCase().includes(matrizFilter.toLowerCase())
        );
    }

    // Agrupar por dimensão
    const groups = new Map<string, RawProductionData[]>();
    
    filtered.forEach(row => {
        let key: string;
        switch (dimension) {
            case 'turno':
                key = (row.Turno || 'N/D').toString().trim();
                break;
            case 'prensa':
                key = (row.Prensa || 'N/D').toString().trim();
                break;
            case 'liga':
                key = (row["Liga Utilizada"] || 'N/D').toString().trim();
                break;
        }
        
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(row);
    });

    // Calcular estatísticas por grupo
    const drilldownData: DrilldownData[] = [];
    let totalRecords = 0;
    let totalProdSum = 0;
    let totalProdCount = 0;

    groups.forEach((rows, key) => {
        const prodValues = rows
            .map(r => parseFloat((r.Produtividade || 0).toString().replace(',', '.')))
            .filter(v => !isNaN(v) && v > 0);
        
        const eficValues = rows
            .map(r => parseFloat((r["Eficiência"] || 0).toString().replace(',', '.')))
            .filter(v => !isNaN(v) && v > 0);

        if (prodValues.length === 0) return;

        const avgProd = prodValues.reduce((a, b) => a + b, 0) / prodValues.length;
        const avgEfic = eficValues.length > 0 
            ? eficValues.reduce((a, b) => a + b, 0) / eficValues.length 
            : 0;

        totalRecords += prodValues.length;
        totalProdSum += prodValues.reduce((a, b) => a + b, 0);
        totalProdCount += prodValues.length;

        // Calcular tendência simplificada (últimos vs primeiros registros)
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (prodValues.length >= 4) {
            const firstHalf = prodValues.slice(0, Math.floor(prodValues.length / 2));
            const secondHalf = prodValues.slice(Math.floor(prodValues.length / 2));
            const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
            const change = ((secondAvg - firstAvg) / firstAvg) * 100;
            if (change > 5) trend = 'up';
            else if (change < -5) trend = 'down';
        }

        drilldownData.push({
            key,
            label: key,
            count: prodValues.length,
            avgProdutividade: avgProd,
            avgEficiencia: avgEfic,
            minProdutividade: Math.min(...prodValues),
            maxProdutividade: Math.max(...prodValues),
            percentOfTotal: 0, // Calculado depois
            trend,
            comparison: 0 // Calculado depois
        });
    });

    // Calcular percentuais e comparações
    const overallAvg = totalProdCount > 0 ? totalProdSum / totalProdCount : 0;
    
    drilldownData.forEach(d => {
        d.percentOfTotal = totalRecords > 0 ? (d.count / totalRecords) * 100 : 0;
        d.comparison = overallAvg > 0 ? ((d.avgProdutividade - overallAvg) / overallAvg) * 100 : 0;
    });

    // Ordenar por produtividade média (decrescente)
    drilldownData.sort((a, b) => b.avgProdutividade - a.avgProdutividade);

    // Identificar melhor e pior performer
    const bestPerformer = drilldownData.length > 0 ? drilldownData[0] : null;
    const worstPerformer = drilldownData.length > 0 ? drilldownData[drilldownData.length - 1] : null;

    const labels = {
        turno: 'Turno',
        prensa: 'Prensa',
        liga: 'Liga'
    };

    return {
        type: dimension,
        label: labels[dimension],
        data: drilldownData,
        totalRecords,
        overallAvg,
        bestPerformer,
        worstPerformer
    };
}

/**
 * Gera insights específicos do drilldown
 */
export function generateDrilldownInsights(drilldown: DrilldownResult): string[] {
    const insights: string[] = [];

    if (drilldown.data.length === 0) {
        return ['Sem dados suficientes para análise'];
    }

    // Insight sobre melhor performer
    if (drilldown.bestPerformer && drilldown.bestPerformer.comparison > 10) {
        insights.push(
            `🏆 ${drilldown.label} "${drilldown.bestPerformer.label}" é o melhor, ` +
            `${drilldown.bestPerformer.comparison.toFixed(1)}% acima da média`
        );
    }

    // Insight sobre pior performer
    if (drilldown.worstPerformer && drilldown.worstPerformer.comparison < -10) {
        insights.push(
            `⚠️ ${drilldown.label} "${drilldown.worstPerformer.label}" precisa de atenção, ` +
            `${Math.abs(drilldown.worstPerformer.comparison).toFixed(1)}% abaixo da média`
        );
    }

    // Insight sobre variabilidade
    const range = drilldown.data.length > 1
        ? drilldown.data[0].avgProdutividade - drilldown.data[drilldown.data.length - 1].avgProdutividade
        : 0;
    const rangePercent = drilldown.overallAvg > 0 ? (range / drilldown.overallAvg) * 100 : 0;
    
    if (rangePercent > 30) {
        insights.push(
            `📊 Grande variação entre ${drilldown.label.toLowerCase()}s: ` +
            `${rangePercent.toFixed(0)}% de diferença entre melhor e pior`
        );
    } else if (rangePercent < 10 && drilldown.data.length > 1) {
        insights.push(
            `✅ ${drilldown.label}s apresentam desempenho uniforme (variação de ${rangePercent.toFixed(0)}%)`
        );
    }

    // Insight sobre tendências
    const upTrends = drilldown.data.filter(d => d.trend === 'up').length;
    const downTrends = drilldown.data.filter(d => d.trend === 'down').length;
    
    if (upTrends > downTrends && upTrends >= 2) {
        insights.push(`📈 Maioria dos ${drilldown.label.toLowerCase()}s em tendência de alta`);
    } else if (downTrends > upTrends && downTrends >= 2) {
        insights.push(`📉 Atenção: maioria dos ${drilldown.label.toLowerCase()}s em tendência de queda`);
    }

    return insights;
}

/**
 * Retorna cor baseada na comparação com média
 */
export function getComparisonColor(comparison: number): string {
    if (comparison >= 10) return 'text-green-600';
    if (comparison >= 0) return 'text-green-500';
    if (comparison >= -10) return 'text-amber-600';
    return 'text-red-600';
}

/**
 * Retorna cor de fundo baseada na comparação
 */
export function getComparisonBgColor(comparison: number): string {
    if (comparison >= 10) return 'bg-green-100';
    if (comparison >= 0) return 'bg-green-50';
    if (comparison >= -10) return 'bg-amber-50';
    return 'bg-red-50';
}

/**
 * Retorna ícone de tendência
 */
export function getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
        case 'up': return '↗️';
        case 'down': return '↘️';
        case 'stable': return '→';
    }
}
