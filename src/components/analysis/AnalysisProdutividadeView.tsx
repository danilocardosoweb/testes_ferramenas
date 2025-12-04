import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Upload, TrendingUp, TrendingDown, Minus, BarChart3, AlertTriangle, HelpCircle, Info, Lightbulb, Download, FileSpreadsheet, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    calculateMatrizStats,
    detectAnomalies,
    formatMonth,
    type MatrizStats,
    type AnomalyDetail,
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

type RpcEvolutionData = {
    month: string;
    avg_produtividade: number;
    avg_eficiencia: number;
    total_records: number;
    is_anomaly: boolean;
    anomaly_drop: number;
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
    const [ligaFilter, setLigaFilter] = useState("");
    const [sortBy, setSortBy] = useState<"matriz" | "produtividade" | "eficiencia" | "trend">("produtividade");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [expandedMatriz, setExpandedMatriz] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [importMsg, setImportMsg] = useState("");
    const [importProgress, setImportProgress] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDataManagementOpen, setIsDataManagementOpen] = useState(false);
    const [expandedData, setExpandedData] = useState<Record<string, RpcEvolutionData[]>>({});
    const [expandedLoading, setExpandedLoading] = useState(false);
    const [groupBySeq, setGroupBySeq] = useState(false);
    const [expandedSeq, setExpandedSeq] = useState<string | null>(null);
    const [observations, setObservations] = useState<Record<string, string>>({});
    const [specificObservations, setSpecificObservations] = useState<Record<string, string>>({});
    const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);

    const updateSpecificObservation = async (matriz: string, month: string, text: string) => {
        const key = `${matriz}|${month}`;
        setSpecificObservations(prev => ({
            ...prev,
            [key]: text
        }));

        // Save to Supabase
        try {
            const { error } = await supabase
                .from('productivity_observations')
                .upsert({
                    matriz,
                    month,
                    observation: text,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
        } catch (err) {
            console.error('Error saving specific observation:', err);
        }
    };

    const updateObservation = async (matriz: string, text: string) => {
        setObservations(prev => ({
            ...prev,
            [matriz]: text
        }));

        // Save to Supabase
        try {
            const { error } = await supabase
                .from('productivity_observations')
                .upsert({
                    matriz,
                    month: 'GENERAL',
                    observation: text,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
        } catch (err) {
            console.error('Error saving observation:', err);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
            setImporting(true);
            setImportMsg("Lendo planilha...");
            const records = await parseWorkbook(file);
            setImportProgress(0);
            setImportMsg(`Encontradas ${records.length.toLocaleString("pt-BR")} linhas. Adicionando ao banco...`);

            // REMOVED: await deleteAllProducao(); // We now APPEND data

            setImportMsg("Inserindo registros em lotes...");
            const batch = 500;
            const totalBatches = Math.ceil(records.length / batch);

            for (let i = 0; i < totalBatches; i++) {
                const chunk = records.slice(i * batch, (i + 1) * batch);
                const { error } = await supabase.from("analysis_producao").insert(chunk);
                if (error) throw error;
                setImportProgress(Math.round(((i + 1) / totalBatches) * 100));
            }
            setImportMsg("Importação concluída com sucesso!");
            setReloadKey((k) => k + 1);
            setTimeout(() => setIsDataManagementOpen(false), 1500);
        } catch (err: any) {
            setImportMsg(`Erro na importação: ${err?.message ?? String(err)}`);
        } finally {
            setImporting(false);
            setTimeout(() => setImportMsg(""), 5000);
            setTimeout(() => setImportProgress(0), 5000);
        }
    };

    const handleDownloadTemplate = () => {
        const headers = [
            "Prensa", "Data Produção", "Turno", "Ferramenta", "Peso Bruto",
            "Eficiência", "Produtividade", "Cod Parada", "Liga Utilizada", "Observação Lote"
        ];
        const sampleRow = [
            "1.9", "01/01/2024", "TA", "TR-0000", 100,
            95.5, 800, "000 - SEM PARADA", "6063", "Exemplo de observação"
        ];

        const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Dados");
        XLSX.writeFile(wb, "Modelo_Importacao_Produtividade.xlsx");
    };

    const handleDownloadReport = () => {
        // Create a map of observations for fast lookup
        // Key: Matriz (General) or Matriz|Month (Specific)

        // We need to map the rows to export format and add observations
        const exportData = rows.map(row => {
            const matriz = row.Matriz || "";
            const dateStr = row["Data Produção"];
            let specificObs = "";

            if (matriz && dateStr) {
                const parts = dateStr.split("/");
                if (parts.length === 3) {
                    const month = `${parts[2]}-${parts[1]}`;
                    const key = `${matriz}|${month}`;
                    specificObs = specificObservations[key] || "";
                }
            }

            const generalObs = matriz ? (observations[matriz] || "") : "";

            return {
                ...row,
                "Observação Mensal": specificObs,
                "Observação Geral": generalObs
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Relatório Completo");
        XLSX.writeFile(wb, `Relatorio_Produtividade_${new Date().toISOString().split('T')[0]}.xlsx`);
    };
    useEffect(() => {
        let active = true;
        async function loadData() {
            console.log('🔄 Loading data with monthsToAnalyze:', monthsToAnalyze);
            setLoading(true);
            setError(null);
            try {
                // Calculate date range based on monthsToAnalyze
                const today = new Date();
                const fromDate = new Date(today);
                fromDate.setMonth(fromDate.getMonth() - monthsToAnalyze);
                const periodStart = dateToISO(fromDate);
                const periodEnd = dateToISO(today);

                console.log('📅 Date range:', { periodStart, periodEnd, monthsToAnalyze });

                let query = supabase
                    .from("analysis_producao")
                    .select("id,payload")
                    .order("produced_on", { ascending: false })
                    .gte("produced_on", periodStart)
                    .lte("produced_on", periodEnd)
                    .limit(50000); // Limit for performance

                const { data, error } = await query;
                if (error) throw error;
                console.log('📦 Fetched data count:', data?.length);
                if (!active) return;
                const mapped = (data as RawRow[] | null | undefined)?.map(mapRow) ?? [];
                console.log('🗺️ Mapped rows count:', mapped.length);
                console.log('✅ Loaded rows:', mapped.length);
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

    // Load detailed data for expanded matrix via RPC
    useEffect(() => {
        if (!expandedMatriz) return;

        async function loadExpanded() {
            setExpandedLoading(true);
            try {
                console.log('🔄 Loading expanded data for:', expandedMatriz, 'Seq:', expandedSeq);

                // Determine effective sequence filter
                // If grouped by seq, use the expanded sequence
                // Otherwise use the global filter
                const effectiveSeqFilter = groupBySeq && expandedSeq
                    ? expandedSeq
                    : (seqFilter === "Todas" ? null : seqFilter.trim());

                const { data, error } = await supabase.rpc('get_productivity_evolution', {
                    months_back: monthsToAnalyze,
                    matriz_filter: expandedMatriz,
                    prensa_filter: prensaFilter.trim() || null,
                    seq_filter: effectiveSeqFilter,
                    liga_filter: ligaFilter.trim() || null
                });

                if (error) throw error;
                console.log('✅ Expanded data loaded:', data?.length);

                const key = expandedSeq ? `${expandedMatriz}|${expandedSeq}` : expandedMatriz;
                setExpandedData(prev => ({ ...prev, [key]: data || [] }));

                // Load observations for this matrix
                const { data: obsData, error: obsError } = await supabase
                    .from('productivity_observations')
                    .select('month, observation')
                    .eq('matriz', expandedMatriz);

                if (obsError) {
                    console.error('Error loading observations:', obsError);
                } else if (obsData) {
                    const newGeneralObs: Record<string, string> = {};
                    const newSpecificObs: Record<string, string> = {};

                    obsData.forEach(obs => {
                        if (obs.month === 'GENERAL') {
                            newGeneralObs[expandedMatriz] = obs.observation;
                        } else {
                            newSpecificObs[`${expandedMatriz}|${obs.month}`] = obs.observation;
                        }
                    });

                    setObservations(prev => ({ ...prev, ...newGeneralObs }));
                    setSpecificObservations(prev => ({ ...prev, ...newSpecificObs }));
                }



            } catch (err) {
                console.error('Error loading expanded data:', err);
            } finally {
                setExpandedLoading(false);
            }
        }
        loadExpanded();
    }, [expandedMatriz, expandedSeq, monthsToAnalyze, prensaFilter, seqFilter, ligaFilter, reloadKey, groupBySeq]);

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
        if (ligaFilter.trim()) {
            filtered = filtered.filter((r) =>
                (r["Liga Utilizada"] ?? "").toString().toLowerCase().includes(ligaFilter.trim().toLowerCase())
            );
        }

        return calculateMatrizStats(filtered, monthsToAnalyze, groupBySeq);
    }, [rows, monthsToAnalyze, matrizFilter, prensaFilter, seqFilter, ligaFilter, groupBySeq]);

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

        // Apply anomalies filter
        if (showAnomaliesOnly) {
            filtered = filtered.filter((stat) => {
                const anomalies = detectAnomalies(stat.monthlyData);
                return anomalies.length > 0;
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
    }, [stats, sortBy, sortOrder, prodMinFilter, prodMaxFilter, showAnomaliesOnly]);

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

    const ligaOptions = useMemo(() => {
        const set = new Set<string>();
        for (const r of rows) {
            const v = (r["Liga Utilizada"] ?? "").toString().trim();
            if (v) set.add(v);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }, [rows]);

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

    // Calculate monthly aggregated data for annual chart (using filtered data)
    // Not needed anymore - using RPC data directly

    // Generate dynamic title for annual chart based on active filters
    const annualChartTitle = useMemo(() => {
        const filters = [];
        if (matrizFilter.trim()) filters.push(`Matriz: ${matrizFilter}`);
        if (prensaFilter.trim()) filters.push(`Prensa: ${prensaFilter}`);
        if (seqFilter !== "Todas") filters.push(`Seq: ${seqFilter}`);
        if (ligaFilter.trim()) filters.push(`Liga: ${ligaFilter}`);

        if (filters.length === 0) {
            return "Desempenho Anual - Produtividade Média Geral";
        }

        return `Desempenho Anual - ${filters.join(", ")}`;
    }, [matrizFilter, prensaFilter, seqFilter, ligaFilter]);

    const annualChartDescription = useMemo(() => {
        const filters = [];
        if (matrizFilter.trim()) filters.push(`matriz "${matrizFilter}"`);
        if (prensaFilter.trim()) filters.push(`prensa "${prensaFilter}"`);
        if (seqFilter !== "Todas") filters.push(`seq "${seqFilter}"`);
        if (ligaFilter.trim()) filters.push(`liga "${ligaFilter}"`);

        if (filters.length === 0) {
            return "Evolução da produtividade média de todos os itens nos últimos 12 meses com linha de tendência";
        }

        return `Evolução da produtividade média para ${filters.join(", ")} nos últimos 12 meses com linha de tendência`;
    }, [matrizFilter, prensaFilter, seqFilter, ligaFilter]);

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
                    <div className="flex flex-col">
                        <label className="text-xs text-muted-foreground">Liga</label>
                        <select
                            className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
                            value={ligaFilter}
                            onChange={(e) => setLigaFilter(e.target.value)}
                        >
                            <option value="">Todas</option>
                            {ligaOptions.map((liga) => (
                                <option key={liga} value={liga}>{liga}</option>
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
                    <Dialog open={isDataManagementOpen} onOpenChange={setIsDataManagementOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="ml-1 gap-2">
                                <Database className="h-4 w-4" />
                                Gerenciar Dados
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px]">
                            <DialogHeader>
                                <DialogTitle>Gerenciamento de Dados</DialogTitle>
                                <DialogDescription>
                                    Importe novos dados ou exporte relatórios e modelos.
                                </DialogDescription>
                            </DialogHeader>
                            <Tabs defaultValue="import" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="import">Importar</TabsTrigger>
                                    <TabsTrigger value="export">Exportar / Modelo</TabsTrigger>
                                </TabsList>

                                <TabsContent value="import" className="space-y-4 py-4">
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-sm text-yellow-800">
                                        <div className="flex items-center gap-2 font-medium mb-1">
                                            <AlertTriangle className="h-4 w-4" />
                                            Atenção: Modo de Adição
                                        </div>
                                        <p>
                                            A importação irá <strong>ADICIONAR</strong> os novos dados ao banco.
                                            Dados existentes <strong>NÃO</strong> serão apagados.
                                            Certifique-se de que a planilha contém apenas novos registros para evitar duplicidade.
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-4 items-center justify-center border-2 border-dashed rounded-lg p-8">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".xlsx,.xls,.csv"
                                            className="hidden"
                                            onChange={handleFileChange}
                                        />
                                        <Button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={importing}
                                            className="w-full max-w-xs"
                                        >
                                            {importing ? (
                                                "Importando..."
                                            ) : (
                                                <>
                                                    <Upload className="mr-2 h-4 w-4" />
                                                    Selecionar Arquivo
                                                </>
                                            )}
                                        </Button>
                                        {importMsg && (
                                            <div className="w-full space-y-2">
                                                <p className="text-xs text-center text-muted-foreground">{importMsg}</p>
                                                {(importing || importProgress > 0) && (
                                                    <div className="h-2 w-full rounded bg-muted overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary transition-all duration-300"
                                                            style={{ width: `${importProgress}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                <TabsContent value="export" className="space-y-4 py-4">
                                    <div className="grid grid-cols-1 gap-4">
                                        <Card>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    <FileSpreadsheet className="h-4 w-4" />
                                                    Relatório Completo
                                                </CardTitle>
                                                <CardDescription>
                                                    Baixe todos os dados atuais incluindo as observações salvas.
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <Button onClick={handleDownloadReport} variant="secondary" className="w-full">
                                                    <Download className="mr-2 h-4 w-4" />
                                                    Baixar Relatório
                                                </Button>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    <Info className="h-4 w-4" />
                                                    Modelo de Importação
                                                </CardTitle>
                                                <CardDescription>
                                                    Baixe a planilha modelo para preencher novos dados corretamente.
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <Button onClick={handleDownloadTemplate} variant="outline" className="w-full">
                                                    <Download className="mr-2 h-4 w-4" />
                                                    Baixar Modelo Padrão
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </DialogContent>
                    </Dialog>
                </div>
                <div className="flex flex-col justify-end pb-1">
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="group-by-seq"
                            checked={groupBySeq}
                            onCheckedChange={setGroupBySeq}
                        />
                        <Label htmlFor="group-by-seq" className="text-xs text-muted-foreground cursor-pointer">
                            Agrupar por Sequência
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="show-anomalies"
                            checked={showAnomaliesOnly}
                            onCheckedChange={setShowAnomaliesOnly}
                        />
                        <Label htmlFor="show-anomalies" className="text-xs text-muted-foreground cursor-pointer">
                            Apenas com Alertas
                        </Label>
                    </div>
                </div>
            </div>


            {
                importMsg && (
                    <div className="mb-2 text-xs text-muted-foreground flex items-center gap-3">
                        <span>{importMsg}</span>
                        {importing || importProgress > 0 ? (
                            <div className="h-2 w-40 rounded bg-muted">
                                <div className="h-2 rounded bg-primary" style={{ width: `${importProgress}%` }} />
                            </div>
                        ) : null}
                    </div>
                )
            }

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
            {
                !loading && !error && stats.length === 0 && (
                    <div className="text-sm text-muted-foreground">Nenhum dado encontrado para o período selecionado.</div>
                )
            }

            {/* Main Table */}
            {
                !loading && !error && stats.length > 0 && (
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
                                    const isExpanded = expandedMatriz === stat.matriz && (!groupBySeq || expandedSeq === stat.seq);
                                    const expandedKey = expandedSeq ? `${stat.matriz}|${expandedSeq}` : stat.matriz;

                                    return (
                                        <>
                                            <tr
                                                key={`${stat.matriz}-${stat.seq}`}
                                                className="border-b hover:bg-muted/40 cursor-pointer"
                                                onClick={() => {
                                                    if (isExpanded) {
                                                        setExpandedMatriz(null);
                                                        setExpandedSeq(null);
                                                    } else {
                                                        setExpandedMatriz(stat.matriz);
                                                        setExpandedSeq(stat.seq);
                                                    }
                                                }}
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
                                                <td className="px-3 py-2 text-left">
                                                    <Sparkline data={stat.sparklineData} />
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={7} className="p-0 border-b bg-muted/10">
                                                        <ExpandedDetailsWithAnnual
                                                            stat={stat}
                                                            anomalies={anomalies}
                                                            overallAvg={overallStats.avgProd}
                                                            observation={observations[stat.matriz] || ''}
                                                            onObservationChange={(text) => updateObservation(stat.matriz, text)}
                                                            rpcData={expandedData[expandedKey]}
                                                            isLoading={expandedLoading}
                                                            specificObservations={specificObservations}
                                                            onSpecificObservationChange={(month, text) => updateSpecificObservation(stat.matriz, month, text)}
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
                )
            }
        </div >
    );
}

// Sparkline component
// Sparkline component with smoothing
function Sparkline({ data }: { data: { month: string; value: number }[] }) {
    if (data.length === 0) return <div className="h-8" />;

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const width = 180;
    const height = 32;
    const padding = 2;

    // Calculate points
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1 || 1)) * (width - 2 * padding) + padding;
        const y = height - padding - ((d.value - min) / range) * (height - 2 * padding);
        return [x, y] as [number, number];
    });

    // Generate smooth path (Catmull-Rom spline converted to Bezier or simple Bezier)
    // Simple smoothing strategy: Control points based on previous and next points
    const getPath = (points: [number, number][]) => {
        if (points.length === 0) return "";
        if (points.length === 1) return `M ${points[0][0]} ${points[0][1]} L ${points[0][0] + 1} ${points[0][1]}`;

        let d = `M ${points[0][0]} ${points[0][1]}`;

        for (let i = 0; i < points.length - 1; i++) {
            const current = points[i];
            const next = points[i + 1];

            // Control points for simple smoothing
            const cp1x = current[0] + (next[0] - current[0]) * 0.5;
            const cp1y = current[1];
            const cp2x = current[0] + (next[0] - current[0]) * 0.5;
            const cp2y = next[1];

            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next[0]} ${next[1]}`;
        }
        return d;
    };

    const pathD = getPath(points);

    return (
        <svg width={width} height={height} className="inline-block">
            <path
                d={pathD}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
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
    observation,
    onObservationChange,
    rpcData,
    isLoading,
    specificObservations,
    onSpecificObservationChange,
}: {
    stat: MatrizStats;
    anomalies: AnomalyDetail[];
    overallAvg: number;
    observation: string;
    onObservationChange: (text: string) => void;
    rpcData?: RpcEvolutionData[];
    isLoading?: boolean;
    specificObservations: Record<string, string>;
    onSpecificObservationChange: (month: string, text: string) => void;
}) {
    const [selectedPoint, setSelectedPoint] = useState<{ month: string; value: number; isAnomaly: boolean } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [tempObservation, setTempObservation] = useState("");

    const handlePointClick = (point: { month: string; value: number; isAnomaly: boolean }) => {
        setSelectedPoint(point);
        const key = `${stat.matriz}|${point.month}`;
        setTempObservation(specificObservations[key] || "");
        setIsModalOpen(true);
    };

    const handleSaveObservation = () => {
        if (selectedPoint) {
            onSpecificObservationChange(selectedPoint.month, tempObservation);
        }
        setIsModalOpen(false);
    };

    const comparisonPercent = ((stat.avgProdutividade - overallAvg) / overallAvg) * 100;

    // Prepare chart data: prefer RPC data if available, otherwise fallback to client-side data
    const chartData = useMemo(() => {
        if (rpcData && rpcData.length > 0) {
            return rpcData.map(d => {
                // Fix date format from RPC (MM/YYYY -> YYYY-MM) to match formatMonth expectation
                let month = d.month;
                if (month.includes('/')) {
                    const [m, y] = month.split('/');
                    month = `${y}-${m}`;
                }
                return {
                    month: month,
                    produtividade: d.avg_produtividade,
                    isAnomaly: d.is_anomaly
                };
            });
        }
        // Fallback to client-side data (might be incomplete due to row limit)
        return stat.monthlyData.map(d => ({
            month: d.month,
            produtividade: d.produtividade.reduce((a, b) => a + b, 0) / (d.produtividade.length || 1),
            isAnomaly: false // Client-side anomaly detection is separate
        }));
    }, [rpcData, stat.monthlyData]);

    // Merge anomalies for display if using RPC data
    const displayAnomalies = useMemo(() => {
        if (rpcData) {
            return anomalies;
        }
        return anomalies;
    }, [anomalies, rpcData]);

    return (
        <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Statistics */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Estatísticas Detalhadas</CardTitle>
                        <CardDescription>Métricas e evolução da produtividade</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Evolution Chart */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Evolução da Produtividade</h4>
                                {isLoading && <span className="text-xs text-muted-foreground animate-pulse">Atualizando...</span>}
                            </div>
                            <EvolutionChart
                                monthlyData={chartData.map(d => ({ month: d.month, value: d.produtividade, isAnomaly: d.isAnomaly }))}
                                avgProdutividade={stat.avgProdutividade}
                                onPointClick={handlePointClick}
                            />
                        </div>

                        {/* Statistics */}
                        <div className="space-y-2 text-sm pt-2 border-t">
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
                        </div>
                    </CardContent>
                </Card>

                {/* Anomalies */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Alertas e Anomalias</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {anomalies.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhuma anomalia detectada no período.</p>
                        ) : (
                            <div className="space-y-4">
                                {anomalies.map((anomaly, i) => {
                                    const getSeverityColor = (severity: string) => {
                                        switch (severity) {
                                            case 'critical': return 'bg-red-100 text-red-800 border-red-300';
                                            case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
                                            case 'moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
                                            default: return 'bg-gray-100 text-gray-800 border-gray-300';
                                        }
                                    };

                                    const getSeverityLabel = (severity: string) => {
                                        switch (severity) {
                                            case 'critical': return 'Crítico';
                                            case 'high': return 'Alto';
                                            case 'moderate': return 'Moderado';
                                            default: return severity;
                                        }
                                    };

                                    return (
                                        <div key={i} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                                            {/* Header with month and severity */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />
                                                    <div>
                                                        <h4 className="font-semibold text-base">{formatMonth(anomaly.month)}</h4>
                                                        <p className="text-sm text-muted-foreground">
                                                            Queda de {anomaly.drop.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% na produtividade
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getSeverityColor(anomaly.severity)}`}>
                                                    {getSeverityLabel(anomaly.severity)}
                                                </span>
                                            </div>

                                            {/* Metrics comparison */}
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1 text-muted-foreground">
                                                        <Info className="h-3 w-3" />
                                                        <span className="text-xs font-medium">Produtividade (kg/h)</span>
                                                    </div>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-muted-foreground line-through">
                                                            {anomaly.prevProdutividade.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                        </span>
                                                        <span className="text-red-600 font-semibold">
                                                            → {anomaly.currProdutividade.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1 text-muted-foreground">
                                                        <Info className="h-3 w-3" />
                                                        <span className="text-xs font-medium">Eficiência (%)</span>
                                                    </div>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-muted-foreground line-through">
                                                            {anomaly.prevEficiencia.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                                        </span>
                                                        <span className={`font-semibold ${anomaly.currEficiencia < anomaly.prevEficiencia ? 'text-red-600' : 'text-green-600'}`}>
                                                            → {anomaly.currEficiencia.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1 text-muted-foreground">
                                                        <Info className="h-3 w-3" />
                                                        <span className="text-xs font-medium">Registros</span>
                                                    </div>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-muted-foreground">
                                                            {anomaly.prevRecordCount} → {anomaly.currRecordCount}
                                                        </span>
                                                        {anomaly.prevRecordCount !== anomaly.currRecordCount && (
                                                            <span className={`text-xs ${anomaly.currRecordCount < anomaly.prevRecordCount ? 'text-red-600' : 'text-green-600'}`}>
                                                                ({anomaly.currRecordCount > anomaly.prevRecordCount ? '+' : ''}
                                                                {((anomaly.currRecordCount - anomaly.prevRecordCount) / anomaly.prevRecordCount * 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Possible causes */}
                                            {anomaly.possibleCauses.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-1.5 text-sm font-medium">
                                                        <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                                                        <span>Possíveis Causas:</span>
                                                    </div>
                                                    <ul className="space-y-1 ml-5">
                                                        {anomaly.possibleCauses.map((cause, idx) => (
                                                            <li key={idx} className="text-sm text-muted-foreground list-disc">
                                                                {cause}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Recommendations */}
                                            {anomaly.recommendations.length > 0 && (
                                                <div className="space-y-1.5 pt-2 border-t">
                                                    <div className="flex items-center gap-1.5 text-sm font-medium text-blue-700">
                                                        <Lightbulb className="h-3.5 w-3.5" />
                                                        <span>Recomendação:</span>
                                                    </div>
                                                    <ul className="space-y-1 ml-5">
                                                        {anomaly.recommendations.map((rec, idx) => (
                                                            <li key={idx} className="text-sm text-muted-foreground list-disc">
                                                                {rec}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="pt-4 border-t">
                            <label className="text-sm font-medium mb-2 block">Observações</label>
                            <textarea
                                className="w-full min-h-[100px] p-3 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="Digite aqui suas considerações e correções já feitas na Matriz..."
                                value={observation}
                                onChange={(e) => onObservationChange(e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Dialog for specific observations */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Detalhes de {selectedPoint ? formatMonth(selectedPoint.month) : ''}</DialogTitle>
                        <DialogDescription>
                            Adicione observações específicas para este mês.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedPoint && (
                        <div className="space-y-4 py-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Produtividade:</span>
                                <span className="font-medium">{selectedPoint.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/h</span>
                            </div>

                            {selectedPoint.isAnomaly && (
                                <div className="flex items-center gap-2 text-orange-600 bg-orange-50 p-2 rounded text-sm">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="font-medium">Anomalia Detectada neste mês</span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="specific-obs">Observação do Mês</Label>
                                <Textarea
                                    id="specific-obs"
                                    placeholder="Digite o motivo da queda ou observação..."
                                    value={tempObservation}
                                    onChange={(e) => setTempObservation(e.target.value)}
                                    className="min-h-[100px]"
                                />
                            </div>

                            {/* Detailed Records Table */}
                            <div className="space-y-2 pt-4 border-t">
                                <h4 className="text-sm font-medium">Registros do Mês</h4>
                                <div className="max-h-[300px] overflow-auto border rounded-md">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted sticky top-0">
                                            <tr>
                                                <th className="p-2 text-left font-medium">Data</th>
                                                <th className="p-2 text-left font-medium">Turno</th>
                                                <th className="p-2 text-left font-medium">Prensa</th>
                                                <th className="p-2 text-right font-medium">Prod.</th>
                                                <th className="p-2 text-right font-medium">Efic.</th>
                                                <th className="p-2 text-right font-medium">Peso Bruto</th>
                                                <th className="p-2 text-left font-medium">Parada</th>
                                                <th className="p-2 text-left font-medium">Liga</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stat.rows
                                                .filter(r => {
                                                    const dateStr = r["Data Produção"];
                                                    if (!dateStr) return false;
                                                    const parts = dateStr.split("/");
                                                    if (parts.length !== 3) return false;
                                                    const month = `${parts[2]}-${parts[1]}`;
                                                    return month === selectedPoint.month;
                                                })
                                                .sort((a, b) => {
                                                    // Sort by date desc
                                                    const da = a["Data Produção"].split("/").reverse().join("-");
                                                    const db = b["Data Produção"].split("/").reverse().join("-");
                                                    return db.localeCompare(da);
                                                })
                                                .map((row, idx) => (
                                                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                                                        <td className="p-2">{row["Data Produção"]}</td>
                                                        <td className="p-2">{row["Turno"]}</td>
                                                        <td className="p-2">{row["Prensa"]}</td>
                                                        <td className="p-2 text-right">
                                                            {Number(row["Produtividade"]).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                        </td>
                                                        <td className="p-2 text-right">
                                                            {Number(row["Eficiência"]).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                                        </td>
                                                        <td className="p-2 text-right">
                                                            {Number(row["Peso Bruto"] || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                                        </td>
                                                        <td className="p-2 truncate max-w-[100px]" title={row["Cod Parada"]}>{row["Cod Parada"]}</td>
                                                        <td className="p-2">{row["Liga Utilizada"]}</td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveObservation}>Salvar Observação</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
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

// Evolution Chart with interactive points
function EvolutionChart({
    monthlyData,
    anomalies = [],
    avgProdutividade,
    onPointClick
}: {
    monthlyData: any[];
    anomalies?: AnomalyDetail[];
    avgProdutividade: number;
    onPointClick?: (point: { month: string; value: number; isAnomaly: boolean }) => void;
}) {
    const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

    if (monthlyData.length === 0) return <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sem dados disponíveis</div>;

    // Calculate monthly averages or use provided values
    const dataPoints = monthlyData.map(m => {
        let value = 0;
        if (typeof m.value === 'number') {
            value = m.value;
        } else if (Array.isArray(m.produtividade)) {
            value = m.produtividade.reduce((sum: number, v: number) => sum + v, 0) / (m.produtividade.length || 1);
        }
        return {
            month: m.month,
            value,
            isAnomaly: m.isAnomaly
        };
    });

    const values = dataPoints.map(d => d.value);
    const min = Math.min(...values, avgProdutividade) * 0.95;
    const max = Math.max(...values, avgProdutividade) * 1.05;
    const range = max - min || 1;

    const width = 500;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Create anomaly set for quick lookup
    const anomalyMonths = new Set(anomalies?.map(a => a.month) || []);

    // Calculate positions
    const points = dataPoints.map((d, i) => {
        const x = padding.left + (i / (dataPoints.length - 1 || 1)) * chartWidth;
        const y = padding.top + chartHeight - ((d.value - min) / range) * chartHeight;
        // Use either the explicit isAnomaly flag or check the anomalies list
        const isAnomaly = d.isAnomaly || anomalyMonths.has(d.month);
        return { x, y, ...d, isAnomaly };
    });

    // Average line Y position
    const avgY = padding.top + chartHeight - ((avgProdutividade - min) / range) * chartHeight;

    // Create path for line
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

    return (
        <div className="w-full">
            <svg width={width} height={height} className="w-full" style={{ maxWidth: '100%', height: 'auto' }}>
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const y = padding.top + chartHeight * (1 - ratio);
                    const value = min + range * ratio;
                    return (
                        <g key={i}>
                            <line
                                x1={padding.left}
                                y1={y}
                                x2={width - padding.right}
                                y2={y}
                                stroke="hsl(var(--border))"
                                strokeWidth="1"
                                opacity="0.3"
                            />
                            <text
                                x={padding.left - 8}
                                y={y + 4}
                                textAnchor="end"
                                fontSize="10"
                                fill="hsl(var(--muted-foreground))"
                            >
                                {value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                            </text>
                        </g>
                    );
                })}

                {/* Anomaly background highlights */}
                {points.map((p, i) => p.isAnomaly && (
                    <rect
                        key={`bg-${i}`}
                        x={p.x - 15}
                        y={padding.top}
                        width={30}
                        height={chartHeight}
                        fill="hsl(var(--destructive))"
                        opacity="0.08"
                    />
                ))}

                {/* Average line */}
                <line
                    x1={padding.left}
                    y1={avgY}
                    x2={width - padding.right}
                    y2={avgY}
                    stroke="hsl(var(--primary))"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.5"
                />

                {/* Main line */}
                <path
                    d={linePath}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {/* Data points */}
                {points.map((p, i) => (
                    <g key={i}>
                        <circle
                            cx={p.x}
                            cy={p.y}
                            r={p.isAnomaly ? "5" : "3"}
                            fill={p.isAnomaly ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                            stroke="hsl(var(--background))"
                            strokeWidth="2"
                            className={`transition-all ${onPointClick ? 'cursor-pointer' : ''}`}
                            onMouseEnter={() => setHoveredPoint(i)}
                            onMouseLeave={() => setHoveredPoint(null)}
                            onClick={() => onPointClick?.({ month: p.month, value: p.value, isAnomaly: p.isAnomaly })}
                            style={{
                                filter: hoveredPoint === i ? 'drop-shadow(0 0 4px rgba(0,0,0,0.3))' : 'none',
                                transform: hoveredPoint === i ? 'scale(1.3)' : 'scale(1)',
                                transformOrigin: `${p.x}px ${p.y}px`
                            }}
                        />
                        {/* Tooltip on hover */}
                        {hoveredPoint === i && (
                            <g>
                                <rect
                                    x={p.x - 40}
                                    y={p.y - 35}
                                    width="80"
                                    height="25"
                                    rx="4"
                                    fill="hsl(var(--popover))"
                                    stroke="hsl(var(--border))"
                                    strokeWidth="1"
                                />
                                <text
                                    x={p.x}
                                    y={p.y - 18}
                                    textAnchor="middle"
                                    fontSize="10"
                                    fill="hsl(var(--popover-foreground))"
                                    fontWeight="500"
                                >
                                    {p.value.toFixed(1)}
                                </text>
                            </g>
                        )}
                        {/* X-axis labels (every 2 months or if few points) */}
                        {(points.length <= 6 || i % 2 === 0) && (
                            <text
                                x={p.x}
                                y={height - padding.bottom + 15}
                                textAnchor="middle"
                                fontSize="10"
                                fill="hsl(var(--muted-foreground))"
                                transform={`rotate(-45, ${p.x}, ${height - padding.bottom + 15})`}
                            >
                                {formatMonth(p.month)}
                            </text>
                        )}
                    </g>
                ))}

                {/* Y-axis label */}
                <text
                    x={padding.left - 45}
                    y={padding.top + chartHeight / 2}
                    textAnchor="middle"
                    fontSize="11"
                    fill="hsl(var(--muted-foreground))"
                    transform={`rotate(-90, ${padding.left - 45}, ${padding.top + chartHeight / 2})`}
                    fontWeight="500"
                >
                    Produtividade (kg/h)
                </text>
            </svg>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span>Produtividade</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-8 h-0.5 bg-primary opacity-50" style={{ borderTop: '1.5px dashed' }} />
                    <span>Média</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-destructive" />
                    <span>Anomalia</span>
                </div>
            </div>
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
        const dataProducao = r["Data Produção"] ?? r["Data Producao"] ?? null;

        // Parse date for produced_on column
        let produced_on: string | null = null;
        if (typeof dataProducao === "number") {
            const dateStr = excelToDateStr(dataProducao);
            if (dateStr) {
                const parts = dateStr.split("/");
                if (parts.length === 3) produced_on = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        } else if (typeof dataProducao === "string") {
            if (dataProducao.includes("/")) {
                const parts = dataProducao.split("/");
                if (parts.length === 3) produced_on = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (dataProducao.includes("-")) {
                produced_on = dataProducao; // Assume already ISO
            }
        }

        return {
            produced_on,
            payload: {
                Prensa: r["Prensa"] ?? null,
                "Data Produção": dataProducao,
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
