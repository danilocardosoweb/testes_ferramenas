import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Upload, TrendingUp, TrendingDown, Minus, BarChart3, AlertTriangle, HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    calculateMatrizStats,
    detectAnomalies,
    formatMonth,
    type MatrizStats,
} from "@/utils/productivityAnalysis";
import * as XLSX from "xlsx";

type RawRow = {
    id: string;
    payload: Record<string, any> | null;
};

type ViewRow = {
    Prensa: string | number | null;
    "Data Produção": string | null;
    Turno: string | null;
    Matriz: string | null;
    Seq: string | number | null;
    "Peso Bruto": number | string | null;
    "Eficiência": number | string | null;
    Produtividade: number | string | null;
    "Cod Parada": string | null;
    "Liga Utilizada": string | null;
    "Observação Lote": string | null;
};

interface AnalysisProdutividadeViewProps { }

function dateToISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export function AnalysisProdutividadeView(_: AnalysisProdutividadeViewProps) {
    const [rows, setRows] = useState<ViewRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [monthsToAnalyze, setMonthsToAnalyze] = useState(12);
    const [matrizFilter, setMatrizFilter] = useState("");
    const [prensaFilter, setPrensaFilter] = useState("");
    const [seqFilter, setSeqFilter] = useState("Todas");
    const [prodMinFilter, setProdMinFilter] = useState("");
    const [prodMaxFilter, setProdMaxFilter] = useState("");
    const [sortBy, setSortBy] = useState<"matriz" | "produtividade" | "eficiencia" | "trend">("produtividade");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [expandedMatriz, setExpandedMatriz] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [importMsg, setImportMsg] = useState<string>("");
    const [importProgress, setImportProgress] = useState<number>(0);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
            setImporting(true);
            setImportMsg("Lendo planilha...");
            const records = await parseWorkbook(file);
            setImportProgress(0);
            setImportMsg(`Encontradas ${records.length.toLocaleString("pt-BR")} linhas. Limpando tabela...`);
            await deleteAllProducao();
            setImportMsg("Inserindo registros em lotes...");
            const batch = 500;
            const totalBatches = Math.ceil(records.length / batch) || 1;
            for (let i = 0; i < totalBatches; i++) {
                const start = i * batch;
                const chunk = records.slice(start, start + batch);
                const { error } = await supabase.from("analysis_producao").insert(chunk);
                if (error) throw error;
                setImportProgress(Math.round(((i + 1) / totalBatches) * 100));
            }
            setImportMsg("Importação concluída.");
            setReloadKey((k) => k + 1);
        } catch (err: any) {
            setImportMsg(`Erro na importação: ${err?.message ?? String(err)}`);
        } finally {
            setImporting(false);
            setTimeout(() => setImportMsg(""), 5000);
            setTimeout(() => setImportProgress(0), 5000);
        }
    };

    useEffect(() => {
        let active = true;
        async function loadData() {
            setLoading(true);
            setError(null);
            try {
                // Calculate date range based on monthsToAnalyze
                const today = new Date();
                const fromDate = new Date(today);
                fromDate.setMonth(fromDate.getMonth() - monthsToAnalyze);
                const periodStart = dateToISO(fromDate);
                const periodEnd = dateToISO(today);

                let query = supabase
                    .from("analysis_producao")
                    .select("id,payload")
                    .order("produced_on", { ascending: false })
                    .gte("produced_on", periodStart)
                    .lte("produced_on", periodEnd);

                const { data, error } = await query;
                if (error) throw error;
                if (!active) return;
                const mapped = (data as RawRow[] | null | undefined)?.map(mapRow) ?? [];
                setRows(mapped);
            } catch (e: any) {
                if (!active) return;
                setError(e?.message ?? String(e));
                setRows([]);
            } finally {
                if (active) setLoading(false);
            }
        }
        loadData();
        return () => {
            active = false;
        };
    }, [monthsToAnalyze, reloadKey]);

    const stats = useMemo(() => {
        let filtered = rows;

        if (matrizFilter.trim()) {
            filtered = filtered.filter((r) =>
                (r.Matriz || "").toString().toLowerCase().includes(matrizFilter.trim().toLowerCase())
            );
        }
        if (prensaFilter.trim()) {
            filtered = filtered.filter((r) =>
                (r.Prensa ?? "").toString().toLowerCase().includes(prensaFilter.trim().toLowerCase())
            );
        }
        if (seqFilter !== "Todas") {
            filtered = filtered.filter((r) => (r.Seq ?? "").toString().trim() === seqFilter.trim());
        }

        return calculateMatrizStats(filtered, monthsToAnalyze);
    }, [rows, monthsToAnalyze, matrizFilter, prensaFilter, seqFilter]);

    const sortedStats = useMemo(() => {
        let filtered = [...stats];

        // Apply productivity range filter
        const minProd = prodMinFilter.trim() ? Number(prodMinFilter.replace(",", ".")) : NaN;
        const maxProd = prodMaxFilter.trim() ? Number(prodMaxFilter.replace(",", ".")) : NaN;

        if (!Number.isNaN(minProd) || !Number.isNaN(maxProd)) {
            filtered = filtered.filter((stat) => {
                const prod = stat.avgProdutividade;
                if (!Number.isNaN(minProd) && prod < minProd) return false;
                if (!Number.isNaN(maxProd) && prod > maxProd) return false;
                return true;
            });
        }

        // Sort
        filtered.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case "matriz":
                    comparison = a.matriz.localeCompare(b.matriz, "pt-BR");
                    break;
                case "produtividade":
                    comparison = a.avgProdutividade - b.avgProdutividade;
                    break;
                case "eficiencia":
                    comparison = a.avgEficiencia - b.avgEficiencia;
                    break;
                case "trend":
                    comparison = a.trendValue - b.trendValue;
                    break;
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });
        return filtered;
    }, [stats, sortBy, sortOrder, prodMinFilter, prodMaxFilter]);

    const seqOptions = useMemo(() => {
        const set = new Set<string>();
        // Filter rows based on current matriz filter to show only active seqs
        let filteredRows = rows;
        if (matrizFilter.trim()) {
            filteredRows = rows.filter((r) =>
                (r.Matriz || "").toString().toLowerCase().includes(matrizFilter.trim().toLowerCase())
            );
        }
        for (const r of filteredRows) {
            const v = (r.Seq ?? "").toString().trim();
            if (v) set.add(v);
        }
        return ["Todas", ...Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))];
    }, [rows, matrizFilter]);

    const prensaOptions = useMemo(() => {
        const set = new Set<string>();
        for (const r of rows) {
            const v = (r.Prensa ?? "").toString().trim();
            if (v) set.add(v);
        }
        return ["", ...Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))];
    }, [rows]);

    const overallStats = useMemo(() => {
        if (stats.length === 0) return { avgProd: 0, avgEfic: 0, totalMatrizes: 0 };
        const totalProd = stats.reduce((sum, s) => sum + s.avgProdutividade, 0);
        const totalEfic = stats.reduce((sum, s) => sum + s.avgEficiencia, 0);
        return {
            avgProd: totalProd / stats.length,
            avgEfic: totalEfic / stats.length,
            totalMatrizes: stats.length,
        };
    }, [stats]);

    // Calculate monthly aggregated data for annual chart
    const monthlyAggregatedData = useMemo(() => {
        if (stats.length === 0) return [];

        // Collect all unique months from all matrizes
        const monthMap = new Map<string, number[]>();

        stats.forEach(stat => {
            stat.monthlyData.forEach(monthData => {
                if (!monthMap.has(monthData.month)) {
                    monthMap.set(monthData.month, []);
                }
                // Add all productivity values from this month
                monthMap.get(monthData.month)!.push(...monthData.produtividade);
            });
        });

        // Calculate average for each month
        const result = Array.from(monthMap.entries())
            .map(([month, values]) => ({
                month,
                avgProdutividade: values.reduce((sum, v) => sum + v, 0) / values.length,
            }))
            .sort((a, b) => a.month.localeCompare(b.month));

        return result;
    }, [stats]);

    const getTrendIcon = (trend: "up" | "down" | "stable") => {
        switch (trend) {
            case "up":
                return <TrendingUp className="h-4 w-4 text-green-600" />;
            case "down":
                return <TrendingDown className="h-4 w-4 text-red-600" />;
            case "stable":
                return <Minus className="h-4 w-4 text-yellow-600" />;
        }
    };

    const getTrendColor = (trend: "up" | "down" | "stable") => {
        switch (trend) {
            case "up":
                return "text-green-600";
            case "down":
                return "text-red-600";
            case "stable":
                return "text-yellow-600";
        }
    };

    // Help Tooltip Component
    const HelpTooltip = ({ text }: { text: string }) => (
        <span className="inline-flex items-center ml-1 cursor-help" title={text}>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
        </span>
    );

    return (
        <div className="space-y-6">
            {/* Header with filters */}
            <div className="flex flex-wrap items-end gap-2 justify-between">
                <div className="flex flex-wrap items-end gap-2 flex-1 min-w-0">
                    <div className="flex flex-col">
                        <label className="text-xs text-muted-foreground">Período (meses)</label>
                        <select
                            className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
                            value={monthsToAnalyze}
                            onChange={(e) => setMonthsToAnalyze(Number(e.target.value))}
                        >
                            <option value={3}>3 meses</option>
                            <option value={6}>6 meses</option>
                            <option value={12}>12 meses</option>
                            <option value={24}>24 meses</option>
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-muted-foreground">Matriz</label>
                        <input
                            className="h-9 w-36 rounded-md border bg-background px-2 text-sm"
                            placeholder="Ex.: TUB-092"
                            value={matrizFilter}
                            onChange={(e) => setMatrizFilter(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-muted-foreground">Prensa</label>
                        <select
                            className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
                            value={prensaFilter}
                            onChange={(e) => setPrensaFilter(e.target.value)}
                        >
                            <option value="">Todas</option>
                            {prensaOptions.map((p) => (p !== "" ? <option key={p} value={p}>{p}</option> : null))}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-muted-foreground">Seq</label>
                        <select
                            className="h-9 w-20 rounded-md border bg-background px-2 text-sm"
                            value={seqFilter}
                            onChange={(e) => setSeqFilter(e.target.value)}
                        >
                            {seqOptions.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end gap-1.5">
                        <div className="flex flex-col">
                            <label className="text-xs text-muted-foreground">Produtividade (kg/h)</label>
                            <input
                                className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
                                placeholder="Mín. 500"
                                value={prodMinFilter}
                                onChange={(e) => setProdMinFilter(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-muted-foreground">até</label>
                            <input
                                className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
                                placeholder="Máx. 800"
                                value={prodMaxFilter}
                                onChange={(e) => setProdMaxFilter(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-muted-foreground">Ordenar por</label>
                        <select
                            className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                        >
                            <option value="produtividade">Produtividade</option>
                            <option value="eficiencia">Eficiência</option>
                            <option value="trend">Tendência</option>
                            <option value="matriz">Matriz</option>
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-muted-foreground">Ordem</label>
                        <select
                            className="h-9 w-28 rounded-md border bg-background px-2 text-sm"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as any)}
                        >
                            <option value="desc">Maior → Menor</option>
                            <option value="asc">Menor → Maior</option>
                        </select>
                    </div>
                    <div className="flex items-end">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <button
                            type="button"
                            className="ml-1 h-9 w-9 flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50"
                            title={importing ? "Importando..." : "Carregar planilha"}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={importing}
                        >
                            <Upload className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {importMsg && (
                <div className="mb-2 text-xs text-muted-foreground flex items-center gap-3">
                    <span>{importMsg}</span>
                    {importing || importProgress > 0 ? (
                        <div className="h-2 w-40 rounded bg-muted">
                            <div className="h-2 rounded bg-primary" style={{ width: `${importProgress}%` }} />
                        </div>
                    ) : null}
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center">
                            Total de Matrizes
                            <HelpTooltip text="Número total de matrizes (ferramentas) distintas encontradas nos dados filtrados. Cada matriz pode ter múltiplas sequências." />
                        </CardDescription>
                        <CardTitle className="text-3xl">{overallStats.totalMatrizes}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center">
                            Produtividade Média Geral
                            <HelpTooltip text="Média de produtividade (kg/h) de todas as matrizes no período. Quanto maior, melhor o desempenho geral do sistema." />
                        </CardDescription>
                        <CardTitle className="text-3xl">
                            {overallStats.avgProd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center">
                            Eficiência Média Geral
                            <HelpTooltip text="Percentual médio de eficiência de todas as matrizes. Indica o aproveitamento do tempo de produção. Valores acima de 80% são considerados bons." />
                        </CardDescription>
                        <CardTitle className="text-3xl">
                            {overallStats.avgEfic.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {loading && <div className="text-sm text-muted-foreground">Carregando dados...</div>}
            {error && <div className="text-sm text-red-600">Erro: {error}</div>}
            {!loading && !error && stats.length === 0 && (
                <div className="text-sm text-muted-foreground">Nenhum dado encontrado para o período selecionado.</div>
            )}

            {/* Main Table */}
            {!loading && !error && stats.length > 0 && (
                <div className="overflow-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b">
                                <th className="sticky top-0 bg-muted px-3 py-2 text-left font-medium text-muted-foreground">Matriz</th>
                                <th className="sticky top-0 bg-muted px-3 py-2 text-center font-medium text-muted-foreground">Seq</th>
                                <th className="sticky top-0 bg-muted px-3 py-2 text-right font-medium text-muted-foreground">
                                    <span className="inline-flex items-center">
                                        Produtividade Média
                                        <HelpTooltip text="Média de kg produzidos por hora. Quanto maior, melhor o desempenho da matriz." />
                                    </span>
                                </th>
                                <th className="sticky top-0 bg-muted px-3 py-2 text-right font-medium text-muted-foreground">
                                    <span className="inline-flex items-center">
                                        Eficiência Média
                                        <HelpTooltip text="Percentual de aproveitamento do tempo. Valores acima de 80% são bons." />
                                    </span>
                                </th>
                                <th className="sticky top-0 bg-muted px-3 py-2 text-center font-medium text-muted-foreground">
                                    <span className="inline-flex items-center">
                                        Tendência
                                        <HelpTooltip text="Direção da performance: ↑ Melhorando | ↓ Piorando | → Estável" />
                                    </span>
                                </th>
                                <th className="sticky top-0 bg-muted px-3 py-2 text-right font-medium text-muted-foreground">
                                    <span className="inline-flex items-center">
                                        Variação (CV%)
                                        <HelpTooltip text="Coeficiente de Variação: mede a estabilidade. Valores baixos (<15%) indicam produção consistente." />
                                    </span>
                                </th>
                                <th className="sticky top-0 bg-muted px-3 py-2 text-left font-medium text-muted-foreground w-48">
                                    <span className="inline-flex items-center">
                                        Sparkline ({monthsToAnalyze} meses)
                                        <HelpTooltip text="Mini-gráfico mostrando a evolução da produtividade ao longo dos meses." />
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedStats.map((stat) => {
                                const anomalies = detectAnomalies(stat.monthlyData);
                                const hasAnomalies = anomalies.length > 0;
                                const isExpanded = expandedMatriz === stat.matriz;

                                return (
                                    <>
                                        <tr
                                            key={stat.matriz}
                                            className="border-b hover:bg-muted/40 cursor-pointer"
                                            onClick={() => setExpandedMatriz(isExpanded ? null : stat.matriz)}
                                        >
                                            <td className="px-3 py-2 text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{stat.matriz}</span>
                                                    {hasAnomalies && (
                                                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-center">{stat.seq}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {stat.avgProdutividade.toLocaleString("pt-BR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {stat.avgEficiencia.toLocaleString("pt-BR", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                                %
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    {getTrendIcon(stat.trend)}
                                                    <span className={`text-xs ${getTrendColor(stat.trend)}`}>
                                                        {stat.trend === "up" ? "↑" : stat.trend === "down" ? "↓" : "→"}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {stat.cvProdutividade.toLocaleString("pt-BR", {
                                                    minimumFractionDigits: 1,
                                                    maximumFractionDigits: 1,
                                                })}
                                                %
                                            </td>
                                            <td className="px-3 py-2">
                                                <Sparkline data={stat.sparklineData} />
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="border-b bg-muted/20">
                                                <td colSpan={7} className="px-3 py-4">
                                                    <ExpandedDetailsWithAnnual
                                                        stat={stat}
                                                        anomalies={anomalies}
                                                        overallAvg={overallStats.avgProd}
                                                        annualData={monthlyAggregatedData}
                                                    />
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// Sparkline component
function Sparkline({ data }: { data: { month: string; value: number }[] }) {
    if (data.length === 0) return <div className="h-8" />;

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const width = 180;
    const height = 32;
    const padding = 2;

    const points = data
        .map((d, i) => {
            const x = (i / (data.length - 1 || 1)) * (width - 2 * padding) + padding;
            const y = height - padding - ((d.value - min) / range) * (height - 2 * padding);
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <svg width={width} height={height} className="inline-block">
            <polyline
                points={points}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}

// Expanded details component
function ExpandedDetails({
    stat,
    anomalies,
    overallAvg,
}: {
    stat: MatrizStats;
    anomalies: { month: string; drop: number }[];
    overallAvg: number;
}) {
    const comparisonPercent = ((stat.avgProdutividade - overallAvg) / overallAvg) * 100;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Statistics */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Estatísticas Detalhadas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total de Registros:</span>
                            <span className="font-medium">{stat.totalRecords}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Produtividade Mínima:</span>
                            <span className="font-medium">
                                {stat.minProdutividade.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Produtividade Máxima:</span>
                            <span className="font-medium">
                                {stat.maxProdutividade.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Mediana Produtividade:</span>
                            <span className="font-medium">
                                {stat.medianProdutividade.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Desvio Padrão:</span>
                            <span className="font-medium">
                                {stat.stdDevProdutividade.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Comparação com Média Geral:</span>
                            <span className={`font-medium ${comparisonPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {comparisonPercent >= 0 ? "+" : ""}
                                {comparisonPercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Anomalies */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Alertas e Anomalias</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {anomalies.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhuma anomalia detectada no período.</p>
                        ) : (
                            <div className="space-y-2">
                                {anomalies.map((anomaly, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm">
                                        <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                                        <div>
                                            <span className="font-medium">{formatMonth(anomaly.month)}</span>
                                            <span className="text-muted-foreground">
                                                {" "}
                                                - Queda de{" "}
                                                {anomaly.drop.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Monthly chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Produtividade Mensal - {stat.matriz}</CardTitle>
                    <CardDescription>Evolução mensal específica desta matriz</CardDescription>
                </CardHeader>
                <CardContent>
                    <MonthlyChart data={stat.monthlyData} />
                </CardContent>
            </Card>
        </div>
    );
}

// Expanded details component with annual chart
function ExpandedDetailsWithAnnual({
    stat,
    anomalies,
    overallAvg,
    annualData,
}: {
    stat: MatrizStats;
    anomalies: { month: string; drop: number }[];
    overallAvg: number;
    annualData: { month: string; avgProdutividade: number }[];
}) {
    const comparisonPercent = ((stat.avgProdutividade - overallAvg) / overallAvg) * 100;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Statistics */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Estatísticas Detalhadas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total de Registros:</span>
                            <span className="font-medium">{stat.totalRecords}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Produtividade Mínima:</span>
                            <span className="font-medium">
                                {stat.minProdutividade.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Produtividade Máxima:</span>
                            <span className="font-medium">
                                {stat.maxProdutividade.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Mediana Produtividade:</span>
                            <span className="font-medium">
                                {stat.medianProdutividade.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Desvio Padrão:</span>
                            <span className="font-medium">
                                {stat.stdDevProdutividade.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Comparação com Média Geral:</span>
                            <span className={`font-medium ${comparisonPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {comparisonPercent >= 0 ? "+" : ""}
                                {comparisonPercent.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Anomalies */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Alertas e Anomalias</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {anomalies.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhuma anomalia detectada no período.</p>
                        ) : (
                            <div className="space-y-2">
                                {anomalies.map((anomaly, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm">
                                        <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                                        <div>
                                            <span className="font-medium">{formatMonth(anomaly.month)}</span>
                                            <span className="text-muted-foreground">
                                                {" "}
                                                - Queda de{" "}
                                                {anomaly.drop.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Charts side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Monthly chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Produtividade Mensal - {stat.matriz}</CardTitle>
                        <CardDescription>Evolução mensal específica desta matriz</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <MonthlyChart data={stat.monthlyData} />
                    </CardContent>
                </Card>

                {/* Annual Performance Chart */}
                {annualData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Desempenho Anual - Produtividade Média Geral</CardTitle>
                            <CardDescription>
                                Evolução da produtividade média de todas as matrizes com linha de tendência
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AnnualPerformanceChart data={annualData} />
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}


// Monthly chart component
function MonthlyChart({ data }: { data: { month: string; produtividade: number[] }[] }) {
    const monthlyAvg = data.map((m) => ({
        month: m.month,
        avg: m.produtividade.reduce((sum, val) => sum + val, 0) / m.produtividade.length || 0,
    }));

    const values = monthlyAvg.map((d) => d.avg);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const width = 600;
    const height = 200;
    const padding = 40;

    const points = monthlyAvg
        .map((d, i) => {
            const x = (i / (monthlyAvg.length - 1 || 1)) * (width - 2 * padding) + padding;
            const y = height - padding - ((d.avg - min) / range) * (height - 2 * padding);
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <div className="overflow-x-auto">
            <svg width={width} height={height} className="mx-auto">
                {/* Grid lines */}
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="hsl(var(--border))" strokeWidth="1" />
                <line
                    x1={padding}
                    y1={height - padding}
                    x2={width - padding}
                    y2={height - padding}
                    stroke="hsl(var(--border))"
                    strokeWidth="1"
                />

                {/* Line */}
                <polyline
                    points={points}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {/* Points */}
                {monthlyAvg.map((d, i) => {
                    const x = (i / (monthlyAvg.length - 1 || 1)) * (width - 2 * padding) + padding;
                    const y = height - padding - ((d.avg - min) / range) * (height - 2 * padding);
                    return (
                        <g key={i}>
                            <circle cx={x} cy={y} r="4" fill="hsl(var(--primary))" />
                            <text
                                x={x}
                                y={height - padding + 20}
                                textAnchor="middle"
                                fontSize="10"
                                fill="hsl(var(--muted-foreground))"
                            >
                                {formatMonth(d.month)}
                            </text>
                        </g>
                    );
                })}

                {/* Y-axis labels */}
                <text x={padding - 10} y={padding} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">
                    {max.toFixed(0)}
                </text>
                <text
                    x={padding - 10}
                    y={height - padding}
                    textAnchor="end"
                    fontSize="10"
                    fill="hsl(var(--muted-foreground))"
                >
                    {min.toFixed(0)}
                </text>
            </svg>
        </div>
    );
}

// Annual Performance Chart component with trend line
function AnnualPerformanceChart({ data }: { data: { month: string; avgProdutividade: number }[] }) {
    if (data.length === 0) return <div className="h-64 flex items-center justify-center text-muted-foreground">Sem dados disponíveis</div>;

    const values = data.map((d) => d.avgProdutividade);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const width = 900;
    const height = 300;
    const padding = 60;

    // Calculate trend line using linear regression
    const n = data.length;
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, d) => sum + d.avgProdutividade, 0);
    const sumXY = data.reduce((sum, d, i) => sum + i * d.avgProdutividade, 0);
    const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const trendLine = data.map((_, i) => slope * i + intercept);

    // Data points
    const points = data
        .map((d, i) => {
            const x = (i / (data.length - 1 || 1)) * (width - 2 * padding) + padding;
            const y = height - padding - ((d.avgProdutividade - min) / range) * (height - 2 * padding);
            return `${x},${y}`;
        })
        .join(" ");

    // Trend line points
    const trendPoints = trendLine
        .map((value, i) => {
            const x = (i / (data.length - 1 || 1)) * (width - 2 * padding) + padding;
            const y = height - padding - ((value - min) / range) * (height - 2 * padding);
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <div className="overflow-x-auto">
            <svg width={width} height={height} className="mx-auto">
                {/* Grid lines */}
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="hsl(var(--border))" strokeWidth="2" />
                <line
                    x1={padding}
                    y1={height - padding}
                    x2={width - padding}
                    y2={height - padding}
                    stroke="hsl(var(--border))"
                    strokeWidth="2"
                />

                {/* Horizontal grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = height - padding - ratio * (height - 2 * padding);
                    const value = min + ratio * range;
                    return (
                        <g key={ratio}>
                            <line
                                x1={padding}
                                y1={y}
                                x2={width - padding}
                                y2={y}
                                stroke="hsl(var(--border))"
                                strokeWidth="0.5"
                                strokeDasharray="4 4"
                                opacity="0.3"
                            />
                            <text
                                x={padding - 10}
                                y={y + 4}
                                textAnchor="end"
                                fontSize="11"
                                fill="hsl(var(--muted-foreground))"
                            >
                                {value.toFixed(0)}
                            </text>
                        </g>
                    );
                })}

                {/* Trend line (dashed) */}
                <polyline
                    points={trendPoints}
                    fill="none"
                    stroke="hsl(var(--destructive))"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    opacity="0.6"
                />

                {/* Data line */}
                <polyline
                    points={points}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {/* Points and labels */}
                {data.map((d, i) => {
                    const x = (i / (data.length - 1 || 1)) * (width - 2 * padding) + padding;
                    const y = height - padding - ((d.avgProdutividade - min) / range) * (height - 2 * padding);
                    const showLabel = i % Math.ceil(data.length / 12) === 0 || i === data.length - 1;

                    return (
                        <g key={i}>
                            <circle cx={x} cy={y} r="5" fill="hsl(var(--primary))" stroke="white" strokeWidth="2" />
                            {showLabel && (
                                <>
                                    <text
                                        x={x}
                                        y={height - padding + 20}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fill="hsl(var(--muted-foreground))"
                                        fontWeight="500"
                                    >
                                        {formatMonth(d.month)}
                                    </text>
                                    <text
                                        x={x}
                                        y={y - 12}
                                        textAnchor="middle"
                                        fontSize="10"
                                        fill="hsl(var(--primary))"
                                        fontWeight="600"
                                    >
                                        {d.avgProdutividade.toFixed(0)}
                                    </text>
                                </>
                            )}
                        </g>
                    );
                })}

                {/* Legend */}
                <g transform={`translate(${width - padding - 150}, ${padding})`}>
                    <line x1="0" y1="0" x2="30" y2="0" stroke="hsl(var(--primary))" strokeWidth="3" />
                    <text x="35" y="4" fontSize="12" fill="hsl(var(--foreground))">Produtividade Real</text>

                    <line x1="0" y1="20" x2="30" y2="20" stroke="hsl(var(--destructive))" strokeWidth="2" strokeDasharray="6 4" opacity="0.6" />
                    <text x="35" y="24" fontSize="12" fill="hsl(var(--foreground))">Linha de Tendência</text>
                </g>

                {/* Y-axis label */}
                <text
                    x={padding - 45}
                    y={height / 2}
                    textAnchor="middle"
                    fontSize="12"
                    fill="hsl(var(--muted-foreground))"
                    transform={`rotate(-90, ${padding - 45}, ${height / 2})`}
                    fontWeight="600"
                >
                    Produtividade (kg/h)
                </text>
            </svg>
        </div>
    );
}

// Helper functions
function mapRow(r: RawRow): ViewRow {
    const p = r.payload || {};
    const ferramenta: string = p["Ferramenta"] ?? "";
    let matriz: string | null = null;
    let seq: string | number | null = null;
    if (typeof ferramenta === "string" && ferramenta.includes("/")) {
        const [m, s] = ferramenta.split("/");
        matriz = (m || "").trim() || null;
        seq = (s || "").trim() || null;
    } else if (typeof ferramenta === "string") {
        matriz = ferramenta.trim() || null;
    }
    return {
        Prensa: p["Prensa"] ?? null,
        "Data Produção": excelToDateStr(p["Data Produção"]) ?? (p["Data Produção"] ?? null),
        Turno: p["Turno"] ?? null,
        Matriz: matriz,
        Seq: seq,
        "Peso Bruto": p["Peso Bruto"] ?? null,
        "Eficiência": p["Eficiência"] ?? null,
        Produtividade: p["Produtividade"] ?? null,
        "Cod Parada": p["Cod Parada"] ?? null,
        "Liga Utilizada": p["Liga Utilizada"] ?? null,
        "Observação Lote": p["Observação Lote"] ?? null,
    };
}

function excelToDateStr(value: any): string | null {
    const num = typeof value === "string" ? Number(value) : value;
    if (typeof num !== "number" || !isFinite(num)) return null;
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = num * 24 * 60 * 60 * 1000;
    const d = new Date(epoch.getTime() + ms);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

async function parseWorkbook(file: File) {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
    return rows.map((r) => {
        const ferramenta = r["Ferramenta"] ?? r["ferramenta"] ?? "";
        return {
            payload: {
                Prensa: r["Prensa"] ?? null,
                "Data Produção": r["Data Produção"] ?? r["Data Producao"] ?? null,
                Turno: r["Turno"] ?? null,
                Ferramenta: ferramenta ?? null,
                "Peso Bruto": r["Peso Bruto"] ?? null,
                "Eficiência": r["Eficiência"] ?? r["Eficiencia"] ?? null,
                Produtividade: r["Produtividade"] ?? null,
                "Cod Parada": r["Cod Parada"] ?? null,
                "Liga Utilizada": r["Liga Utilizada"] ?? null,
                "Observação Lote": r["Observação Lote"] ?? r["Observacao Lote"] ?? null,
            },
        };
    });
}

async function deleteAllProducao() {
    const { error } = await supabase.rpc("analysis_producao_truncate");
    if (error) throw error;
}
