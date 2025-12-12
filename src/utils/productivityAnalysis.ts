// Utility functions for productivity analysis

export interface MonthlyData {
  month: string; // YYYY-MM format
  produtividade: number[];
  eficiencia: number[];
}

export interface MatrizStats {
  matriz: string;
  seq: string;
  totalRecords: number;
  monthlyData: MonthlyData[];
  avgProdutividade: number;
  avgEficiencia: number;
  medianProdutividade: number;
  medianEficiencia: number;
  minProdutividade: number;
  maxProdutividade: number;
  minEficiencia: number;
  maxEficiencia: number;
  stdDevProdutividade: number;
  stdDevEficiencia: number;
  cvProdutividade: number; // Coefficient of Variation
  cvEficiencia: number;
  trend: "up" | "down" | "stable";
  trendValue: number; // slope of linear regression
  sparklineData: { month: string; value: number }[];
  rows: any[]; // Raw rows for detailed view
}

/**
 * Calculate average of an array of numbers
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate median of an array of numbers
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  const avgSquareDiff = average(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate coefficient of variation (CV%)
 */
export function coefficientOfVariation(values: number[]): number {
  const avg = average(values);
  if (avg === 0) return 0;
  const stdDev = standardDeviation(values);
  return (stdDev / avg) * 100;
}

/**
 * Calculate linear regression slope to determine trend
 * Returns positive for upward trend, negative for downward
 */
export function calculateTrendSlope(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const xValues = Array.from({ length: n }, (_, i) => i);

  const sumX = xValues.reduce((sum, x) => sum + x, 0);
  const sumY = values.reduce((sum, y) => sum + y, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  return slope;
}

/**
 * Determine trend direction based on slope
 */
export function getTrendDirection(slope: number, threshold = 0.5): "up" | "down" | "stable" {
  if (Math.abs(slope) < threshold) return "stable";
  return slope > 0 ? "up" : "down";
}

/**
 * Group data by matriz and month, calculating statistics
 */
/**
 * Group data by matriz and month, calculating statistics
 */
export function calculateMatrizStats(
  data: any[],
  monthsToAnalyze: number = 12,
  groupBySeq: boolean = false
): MatrizStats[] {
  // Group by matriz (and seq if enabled)
  const groupMap = new Map<string, any[]>();

  data.forEach((row) => {
    const matriz = row.Matriz || "";
    if (!matriz) return;

    let key = matriz;
    if (groupBySeq) {
      const seq = row.Seq || "N/A";
      key = `${matriz}|${seq}`;
    }

    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(row);
  });

  const results: MatrizStats[] = [];

  groupMap.forEach((rows, key) => {
    const matriz = rows[0]?.Matriz || "";
    let seq = rows[0]?.Seq || "";

    if (!groupBySeq) {
      // Check if multiple sequences exist
      const uniqueSeqs = new Set(rows.map((r) => r.Seq).filter(Boolean));
      if (uniqueSeqs.size > 1) {
        seq = Array.from(uniqueSeqs).sort().join(", ");
        if (seq.length > 20) seq = "Múltiplas";
      }
    }

    // Group by month
    const monthMap = new Map<string, { produtividade: number[]; eficiencia: number[] }>();

    rows.forEach((row) => {
      const dateStr = row["Data Produção"];
      if (!dateStr) return;

      // Parse DD/MM/YYYY to YYYY-MM
      let month = "";
      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          month = `${parts[2]}-${parts[1]}`;
        }
      } else if (dateStr.includes("-")) {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          month = `${parts[0]}-${parts[1]}`;
        }
      }

      if (!month) return;

      if (!monthMap.has(month)) {
        monthMap.set(month, { produtividade: [], eficiencia: [] });
      }

      const prod = parseFloat(String(row.Produtividade || 0).replace(",", "."));
      const efic = parseFloat(String(row["Eficiência"] || 0).replace(",", "."));

      if (!isNaN(prod) && isFinite(prod)) {
        monthMap.get(month)!.produtividade.push(prod);
      }
      if (!isNaN(efic) && isFinite(efic)) {
        monthMap.get(month)!.eficiencia.push(efic);
      }
    });

    // Sort months chronologically (data is already filtered by RPC)
    const sortedMonths = Array.from(monthMap.keys()).sort();

    const monthlyData: MonthlyData[] = sortedMonths.map((month) => ({
      month,
      produtividade: monthMap.get(month)!.produtividade,
      eficiencia: monthMap.get(month)!.eficiencia,
    }));

    // Calculate overall statistics using ALL data from the period
    const allProdutividade = monthlyData.flatMap((m) => m.produtividade);
    const allEficiencia = monthlyData.flatMap((m) => m.eficiencia);

    if (allProdutividade.length === 0) return;

    const avgProdutividade = average(allProdutividade);
    const avgEficiencia = average(allEficiencia);

    // Calculate monthly averages for sparkline and trend
    const monthlyAvgProd = monthlyData.map((m) => average(m.produtividade));
    const trendValue = calculateTrendSlope(monthlyAvgProd);
    const trend = getTrendDirection(trendValue);

    const sparklineData = monthlyData.map((m) => ({
      month: m.month,
      value: average(m.produtividade),
    }));

    results.push({
      matriz,
      seq,
      totalRecords: rows.length,
      monthlyData,
      avgProdutividade,
      avgEficiencia,
      medianProdutividade: median(allProdutividade),
      medianEficiencia: median(allEficiencia),
      minProdutividade: Math.min(...allProdutividade),
      maxProdutividade: Math.max(...allProdutividade),
      minEficiencia: Math.min(...allEficiencia),
      maxEficiencia: Math.max(...allEficiencia),
      stdDevProdutividade: standardDeviation(allProdutividade),
      stdDevEficiencia: standardDeviation(allEficiencia),
      cvProdutividade: coefficientOfVariation(allProdutividade),
      cvEficiencia: coefficientOfVariation(allEficiencia),
      trend,
      trendValue,
      sparklineData,
      rows,
    });
  });

  return results;
}

export interface AnomalyDetail {
  month: string;
  drop: number;
  prevProdutividade: number;
  currProdutividade: number;
  prevEficiencia: number;
  currEficiencia: number;
  prevRecordCount: number;
  currRecordCount: number;
  severity: 'critical' | 'high' | 'moderate';
  possibleCauses: string[];
  recommendations: string[];
}

/**
 * Detect anomalies (drops > threshold%) with detailed context
 */
export function detectAnomalies(
  monthlyData: MonthlyData[],
  threshold: number = 20
): AnomalyDetail[] {
  const anomalies: AnomalyDetail[] = [];

  for (let i = 1; i < monthlyData.length; i++) {
    const prevAvg = average(monthlyData[i - 1].produtividade);
    const currAvg = average(monthlyData[i].produtividade);
    const prevEfic = average(monthlyData[i - 1].eficiencia);
    const currEfic = average(monthlyData[i].eficiencia);

    if (prevAvg === 0) continue;

    const dropPercent = ((prevAvg - currAvg) / prevAvg) * 100;

    if (dropPercent > threshold) {
      // Determine severity
      let severity: 'critical' | 'high' | 'moderate';
      if (dropPercent >= 40) severity = 'critical';
      else if (dropPercent >= 30) severity = 'high';
      else severity = 'moderate';

      // Analyze possible causes
      const possibleCauses: string[] = [];
      const recommendations: string[] = [];

      const eficDrop = prevEfic > 0 ? ((prevEfic - currEfic) / prevEfic) * 100 : 0;
      const recordDrop = monthlyData[i - 1].produtividade.length > 0
        ? ((monthlyData[i - 1].produtividade.length - monthlyData[i].produtividade.length) / monthlyData[i - 1].produtividade.length) * 100
        : 0;

      // Analyze patterns
      if (eficDrop > 10) {
        possibleCauses.push('Queda significativa na eficiência operacional');
        recommendations.push('Verificar paradas não programadas e tempo de setup');
      }

      if (recordDrop > 30) {
        possibleCauses.push('Redução no volume de produção');
        recommendations.push('Analisar disponibilidade da matriz e programação de produção');
      }

      if (currAvg < prevAvg * 0.7) {
        possibleCauses.push('Queda acentuada na produtividade média');
        recommendations.push('Inspecionar condições da matriz e qualidade da matéria-prima');
      }

      if (eficDrop < 5 && dropPercent > 25) {
        possibleCauses.push('Produtividade baixa mesmo com eficiência mantida');
        recommendations.push('Verificar velocidade de extrusão e parâmetros do processo');
      }

      // Default recommendations
      if (recommendations.length === 0) {
        recommendations.push('Revisar parâmetros de processo do período');
        recommendations.push('Comparar com períodos de alta performance');
      }

      anomalies.push({
        month: monthlyData[i].month,
        drop: dropPercent,
        prevProdutividade: prevAvg,
        currProdutividade: currAvg,
        prevEficiencia: prevEfic,
        currEficiencia: currEfic,
        prevRecordCount: monthlyData[i - 1].produtividade.length,
        currRecordCount: monthlyData[i].produtividade.length,
        severity,
        possibleCauses,
        recommendations,
      });
    }
  }

  return anomalies;
}

/**
 * Format month string (YYYY-MM) to readable format (MMM/YYYY)
 */
export function formatMonth(month: string): string {
  const [year, monthNum] = month.split("-");
  const monthNames = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
  ];
  const monthIndex = parseInt(monthNum, 10) - 1;
  return `${monthNames[monthIndex]}/${year}`;
}
