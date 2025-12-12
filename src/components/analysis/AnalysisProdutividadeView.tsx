import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Upload, TrendingUp, TrendingDown, Minus, BarChart3, AlertTriangle, HelpCircle, Info, Lightbulb, Download, FileSpreadsheet, Database, ChevronDown, ChevronUp, Calendar, Search, Settings, Layers, ArrowUpDown } from "lucide-react";
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
import {
    calculateMatrixScore,
    getScoreColor,
    getScoreBgColor,
    getScoreEmoji,
    type ScoreBreakdown,
} from "@/utils/productivityScore";
import {
    generateInsights,
    generateSuggestedActions,
    getInsightTypeColor,
    type Insight,
    type InsightDetail,
} from "@/utils/productivityInsights";
import {
    generatePredictions,
    generateAlerts,
    getAlertTypeColor,
    getAlertIcon,
    getReliabilityBadge,
    type PredictionResult,
    type Alert,
    type AlertDetail,
} from "@/utils/productivityPrediction";
import {
    calculateDrilldown,
    generateDrilldownInsights,
    getComparisonColor,
    getComparisonBgColor,
    getTrendIcon as getDrilldownTrendIcon,
    type DrilldownResult,
    type RawProductionData,
} from "@/utils/productivityDrilldown";
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

// Help Tooltip Component - Simple version for headers
const HelpTooltip = ({ text }: { text: string }) => (
    <span className="inline-flex items-center ml-1 cursor-help" title={text}>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
    </span>
);

// Enhanced Tooltip Component - For detailed explanations in cards
const InfoTooltip = ({ 
    label, 
    value, 
    explanation, 
    calculation,
    className = ""
}: { 
    label: string; 
    value: string; 
    explanation: string;
    calculation?: string;
    className?: string;
}) => (
    <div className={`group relative flex justify-between cursor-help ${className}`}>
        <span className="flex items-center gap-1">
            {label}
            <Info className="h-3 w-3 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
        </span>
        <span className="font-medium">{value}</span>
        <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
            <div className="font-medium mb-1">{label}</div>
            <p className="text-gray-300 mb-2">{explanation}</p>
            {calculation && (
                <div className="pt-2 border-t border-gray-700">
                    <span className="text-gray-400">Cálculo: </span>
                    <span className="text-blue-300">{calculation}</span>
                </div>
            )}
            <div className="absolute left-4 bottom-0 transform translate-y-full border-8 border-transparent border-t-gray-900" />
        </div>
    </div>
);

// Projection Tooltip Component
const ProjectionTooltip = ({ 
    title, 
    mainValue, 
    subValue,
    explanation,
    colorClass = "text-purple-700"
}: { 
    title: string;
    mainValue: React.ReactNode;
    subValue?: string;
    explanation: string;
    colorClass?: string;
}) => (
    <div className="group relative text-center p-3 bg-white/50 rounded-lg cursor-help">
        <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
            {title}
            <Info className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className={`text-2xl font-bold ${colorClass}`}>{mainValue}</div>
        {subValue && <div className="text-xs text-muted-foreground mt-1">{subValue}</div>}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
            <div className="font-medium mb-1">{title}</div>
            <p className="text-gray-300">{explanation}</p>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 transform translate-y-full border-8 border-transparent border-t-gray-900" />
        </div>
    </div>
);

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
    const [sortBy, setSortBy] = useState<"matriz" | "produtividade" | "eficiencia" | "trend" | "score">("produtividade");
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
    const [insightsExpanded, setInsightsExpanded] = useState(false);
    const [alertsExpanded, setAlertsExpanded] = useState(false);
    const [showOnlyActive, setShowOnlyActive] = useState(false);
    const [activeMatrices, setActiveMatrices] = useState<Set<string>>(new Set());
    const [filterOptions, setFilterOptions] = useState<{ prensas: string[]; seqs: string[]; ligas: string[] }>({
        prensas: [],
        seqs: [],
        ligas: []
    });
    const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
    const [isInsightModalOpen, setIsInsightModalOpen] = useState(false);
    const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [isAllAlertsModalOpen, setIsAllAlertsModalOpen] = useState(false);
    const [abcMode, setAbcMode] = useState(false); // ABC classification by total production
    const [showOnlyWithObs, setShowOnlyWithObs] = useState(false); // Filter matrices with observations
    const [abcData, setAbcData] = useState<{
        ferramenta_base: string;
        matrizes: string[];
        qtd_matrizes: number;
        total_peso_bruto: number;
        avg_produtividade: number;
        avg_eficiencia: number;
        total_records: number;
        abc_class: string;
        cumulative_percent: number;
    }[]>([]);
    const [abcLoading, setAbcLoading] = useState(false);

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

    // Import observations from filled template
    const [importingObs, setImportingObs] = useState(false);
    const [importObsMsg, setImportObsMsg] = useState("");
    const obsFileInputRef = useRef<HTMLInputElement>(null);

    const handleImportObservations = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        try {
            setImportingObs(true);
            setImportObsMsg("Lendo planilha de observações...");

            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet) as any[];

            let updated = 0;
            let skipped = 0;

            for (const row of rows) {
                const matriz = row["Matriz"]?.toString().trim();
                const newObs = row["Nova Observação"]?.toString().trim();

                if (!matriz) {
                    skipped++;
                    continue;
                }

                // Only update if there's a new observation
                if (newObs && newObs.length > 0) {
                    await updateObservation(matriz, newObs);
                    updated++;
                } else {
                    skipped++;
                }
            }

            setImportObsMsg(`✅ Importação concluída! ${updated} observações atualizadas, ${skipped} ignoradas.`);
            setTimeout(() => setImportObsMsg(""), 5000);
        } catch (err: any) {
            setImportObsMsg(`❌ Erro: ${err?.message || String(err)}`);
        } finally {
            setImportingObs(false);
        }
    };

    const handleDownloadReport = () => {
        // Legacy: Export raw data with observations
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
        XLSX.utils.book_append_sheet(wb, ws, "Dados Brutos");
        XLSX.writeFile(wb, `Dados_Produtividade_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Load filter options and active matrices on mount and when period changes
    useEffect(() => {
        async function loadFilterOptions() {
            try {
                // Load filter options
                const { data: optionsData } = await supabase.rpc('get_productivity_filter_options', {
                    p_months_back: monthsToAnalyze
                });
                
                if (optionsData && optionsData.length > 0) {
                    const opts = optionsData[0];
                    setFilterOptions({
                        prensas: opts.prensas || [],
                        seqs: opts.seqs || [],
                        ligas: opts.ligas || []
                    });
                }

                // Load active matrices
                const { data: activeData } = await supabase.rpc('get_active_matrices');
                if (activeData) {
                    setActiveMatrices(new Set(activeData.map((r: any) => r.matriz?.toUpperCase())));
                }
            } catch (e) {
                console.error('Error loading filter options:', e);
            }
        }
        loadFilterOptions();
    }, [monthsToAnalyze]);

    useEffect(() => {
        let active = true;
        async function loadData() {
            console.log('🔄 Loading data with monthsToAnalyze:', monthsToAnalyze);
            setLoading(true);
            setError(null);
            try {
                // Use optimized RPC that aggregates data server-side
                console.log('📅 Calling get_productivity_stats RPC with months:', monthsToAnalyze);

                const { data, error } = await supabase.rpc('get_productivity_stats', {
                    p_months_back: monthsToAnalyze,
                    p_matriz_filter: matrizFilter.trim() || null,
                    p_prensa_filter: prensaFilter || null,
                    p_seq_filter: seqFilter === "Todas" ? null : seqFilter,
                    p_liga_filter: ligaFilter || null
                });

                if (error) throw error;
                console.log('📦 RPC returned aggregated data:', data?.length, 'rows');
                if (!active) return;

                // Transform RPC data to ViewRow format for compatibility
                const mapped: ViewRow[] = (data || []).map((row: any) => ({
                    Prensa: row.prensa_data ? Object.keys(row.prensa_data).join(', ') : null,
                    "Data Produção": row.month ? `01/${row.month.split('-')[1]}/${row.month.split('-')[0]}` : null,
                    Turno: row.turno_data ? Object.keys(row.turno_data).join(', ') : null,
                    Matriz: row.matriz,
                    Seq: row.seq,
                    "Peso Bruto": null,
                    "Eficiência": row.avg_eficiencia,
                    Produtividade: row.avg_produtividade,
                    "Cod Parada": null,
                    "Liga Utilizada": row.liga_data ? Object.keys(row.liga_data).join(', ') : null,
                    "Observação Lote": null,
                    // Extra fields for stats calculation
                    _month: row.month,
                    _min_prod: row.min_produtividade,
                    _max_prod: row.max_produtividade,
                    _total_records: row.total_records
                } as ViewRow & { _month: string; _min_prod: number; _max_prod: number; _total_records: number }));

                console.log('✅ Loaded aggregated rows:', mapped.length);
                setRows(mapped);
            } catch (e: any) {
                if (!active) return;
                console.error('❌ Error loading data:', e);
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
    }, [monthsToAnalyze, reloadKey, matrizFilter, prensaFilter, seqFilter, ligaFilter]);

    // Load ABC classification data
    useEffect(() => {
        if (!abcMode) {
            setAbcData([]);
            return;
        }

        let active = true;
        async function loadAbcData() {
            setAbcLoading(true);
            try {
                console.log('📊 Loading ABC classification data...');
                const { data, error } = await supabase.rpc('get_abc_classification', {
                    p_months_back: monthsToAnalyze
                });

                if (error) throw error;
                if (!active) return;

                console.log('✅ ABC data loaded:', data?.length, 'ferramentas');
                setAbcData(data || []);
            } catch (e: any) {
                console.error('❌ Error loading ABC data:', e);
                if (active) setAbcData([]);
            } finally {
                if (active) setAbcLoading(false);
            }
        }
        loadAbcData();
        return () => { active = false; };
    }, [abcMode, monthsToAnalyze]);

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

        // Apply active matrices filter (cross-reference with Ferramentas data)
        if (showOnlyActive && activeMatrices.size > 0) {
            filtered = filtered.filter((r) => {
                const matriz = (r.Matriz || "").toString().toUpperCase().trim();
                // Extract base code (e.g., "TR-0100" from "TR-0100/001")
                const baseCode = matriz.split('/')[0];
                return activeMatrices.has(matriz) || activeMatrices.has(baseCode);
            });
        }

        return calculateMatrizStats(filtered, monthsToAnalyze, groupBySeq);
    }, [rows, monthsToAnalyze, groupBySeq, showOnlyActive, activeMatrices]);

    // Use server-side filter options instead of calculating from aggregated data
    const seqOptions = useMemo(() => {
        return ["Todas", ...filterOptions.seqs];
    }, [filterOptions.seqs]);

    const ligaOptions = useMemo(() => {
        return filterOptions.ligas;
    }, [filterOptions.ligas]);

    const prensaOptions = useMemo(() => {
        return ["", ...filterOptions.prensas];
    }, [filterOptions.prensas]);

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

    // Calculate scores and anomalies for all matrices
    const scoresAndAnomalies = useMemo(() => {
        const scoresMap = new Map<string, ScoreBreakdown>();
        const anomaliesMap = new Map<string, AnomalyDetail[]>();
        
        stats.forEach(stat => {
            const anomalies = detectAnomalies(stat.monthlyData);
            const score = calculateMatrixScore(stat, overallStats.avgProd, anomalies);
            scoresMap.set(stat.matriz, score);
            anomaliesMap.set(stat.matriz, anomalies);
        });
        
        return { scoresMap, anomaliesMap };
    }, [stats, overallStats.avgProd]);

    // Generate automatic insights
    const insights = useMemo(() => {
        if (stats.length === 0) return [];
        
        return generateInsights({
            stats,
            scores: scoresAndAnomalies.scoresMap,
            anomaliesMap: scoresAndAnomalies.anomaliesMap,
            overallAvgProd: overallStats.avgProd,
            overallAvgEfic: overallStats.avgEfic,
            period: monthsToAnalyze
        });
    }, [stats, scoresAndAnomalies, overallStats, monthsToAnalyze]);

    // Sorted and filtered stats (after scoresAndAnomalies is available)
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
                const anomalies = scoresAndAnomalies.anomaliesMap.get(stat.matriz) || [];
                return anomalies.length > 0;
            });
        }

        // Apply observations filter
        if (showOnlyWithObs) {
            filtered = filtered.filter((stat) => {
                const obs = observations[stat.matriz];
                return obs && obs.trim().length > 0;
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
                case "score":
                    const scoreA = scoresAndAnomalies.scoresMap.get(a.matriz)?.total || 0;
                    const scoreB = scoresAndAnomalies.scoresMap.get(b.matriz)?.total || 0;
                    comparison = scoreA - scoreB;
                    break;
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });
        return filtered;
    }, [stats, sortBy, sortOrder, prodMinFilter, prodMaxFilter, showAnomaliesOnly, showOnlyWithObs, observations, scoresAndAnomalies]);

    // Generate predictions for all matrices
    const predictionsMap = useMemo(() => {
        const map = new Map<string, PredictionResult>();
        stats.forEach(stat => {
            if (stat.monthlyData.length >= 3) {
                const prediction = generatePredictions(stat, 3);
                map.set(stat.matriz, prediction);
            }
        });
        return map;
    }, [stats]);

    // Generate intelligent alerts
    const alerts = useMemo(() => {
        if (stats.length === 0) return [];
        return generateAlerts(stats, predictionsMap, overallStats.avgProd, overallStats.avgEfic);
    }, [stats, predictionsMap, overallStats]);

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

    // Export analysis report with matrices, metrics, insights and observations
    const handleDownloadAnalysisReport = () => {
        try {
            console.log('📊 Gerando relatório de análise...');
            console.log('Stats:', sortedStats.length, 'matrizes');
            console.log('Insights:', insights.length);
            console.log('Alerts:', alerts.length);

            if (sortedStats.length === 0) {
                alert('Nenhuma matriz para exportar. Aguarde o carregamento dos dados.');
                return;
            }

            // Sheet 1: Summary of matrices with metrics and observations
            const analysisData = sortedStats.map((stat, idx) => {
                const score = scoresAndAnomalies.scoresMap.get(stat.matriz);
                const prediction = predictionsMap.get(stat.matriz);
                const matrizAnomalies = scoresAndAnomalies.anomaliesMap.get(stat.matriz) || [];
                
                return {
                    "#": idx + 1,
                    "Matriz": stat.matriz,
                    "Score": score?.total?.toFixed(0) || "-",
                    "Produtividade Media": stat.avgProdutividade?.toFixed(2) || "0",
                    "Eficiencia Media": stat.avgEficiencia?.toFixed(2) || "0",
                    "Tendencia": stat.trend === 'up' ? 'Subindo' : stat.trend === 'down' ? 'Caindo' : 'Estavel',
                    "Variacao Tendencia (%)": stat.trendValue?.toFixed(2) || "0",
                    "Coef Variacao": stat.cvProdutividade?.toFixed(2) || "-",
                    "Min Prod": stat.minProdutividade?.toFixed(0) || "0",
                    "Max Prod": stat.maxProdutividade?.toFixed(0) || "0",
                    "Total Registros": stat.totalRecords || 0,
                    "Qtd Anomalias": matrizAnomalies.length,
                    "Previsao Prox Mes": prediction?.predictions?.[0]?.predictedValue?.toFixed(0) || "-",
                    "Confiabilidade Previsao": prediction?.reliability || "-",
                    "Observacao Geral": observations[stat.matriz] || "",
                    "Acao Sugerida": ""
                };
            });

            // Sheet 2: Insights generated
            const insightsData = insights.length > 0 ? insights.map((insight, idx) => ({
                "#": idx + 1,
                "Tipo": insight.type === 'positive' ? 'Positivo' : insight.type === 'warning' ? 'Atencao' : 'Informativo',
                "Titulo": insight.title || "",
                "Descricao": insight.description || "",
                "Metrica": insight.metric || "-",
                "Valor": insight.value?.toFixed(2) || "-"
            })) : [{ "#": 1, "Tipo": "-", "Titulo": "Nenhum insight gerado", "Descricao": "-", "Metrica": "-", "Valor": "-" }];

            // Sheet 3: Alerts
            const alertsData = alerts.length > 0 ? alerts.map((alert, idx) => ({
                "#": idx + 1,
                "Tipo": alert.type === 'critical' ? 'Critico' : alert.type === 'warning' ? 'Aviso' : alert.type === 'success' ? 'Sucesso' : 'Info',
                "Categoria": alert.category || "-",
                "Matriz": alert.matriz || "-",
                "Titulo": alert.title || "",
                "Descricao": alert.description || "",
                "Acao Sugerida": alert.suggestedAction || ""
            })) : [{ "#": 1, "Tipo": "-", "Categoria": "-", "Matriz": "-", "Titulo": "Nenhum alerta gerado", "Descricao": "-", "Acao Sugerida": "-" }];

            console.log('Dados preparados:', analysisData.length, 'linhas');

            const wb = XLSX.utils.book_new();
            
            const ws1 = XLSX.utils.json_to_sheet(analysisData);
            XLSX.utils.book_append_sheet(wb, ws1, "Analise Matrizes");
            
            const ws2 = XLSX.utils.json_to_sheet(insightsData);
            XLSX.utils.book_append_sheet(wb, ws2, "Insights");
            
            const ws3 = XLSX.utils.json_to_sheet(alertsData);
            XLSX.utils.book_append_sheet(wb, ws3, "Alertas");
            
            const fileName = `Analise_Produtividade_${new Date().toISOString().split('T')[0]}.xlsx`;
            console.log('Salvando arquivo:', fileName);
            XLSX.writeFile(wb, fileName);
            console.log('✅ Relatório gerado com sucesso!');
        } catch (error) {
            console.error('❌ Erro ao gerar relatório:', error);
            alert(`Erro ao gerar relatório: ${error}`);
        }
    };

    // Export template for filling observations
    const handleDownloadObservationsTemplate = () => {
        try {
            console.log('📋 Gerando modelo de observações...');
            
            if (sortedStats.length === 0) {
                alert('Nenhuma matriz para exportar. Aguarde o carregamento dos dados.');
                return;
            }

            // Create template with current matrices and empty observation columns
            const templateData = sortedStats.map((stat) => ({
                "Matriz": stat.matriz,
                "Produtividade Media": stat.avgProdutividade?.toFixed(2) || "0",
                "Eficiencia Media": stat.avgEficiencia?.toFixed(2) || "0",
                "Tendencia": stat.trend === 'up' ? 'Subindo' : stat.trend === 'down' ? 'Caindo' : 'Estavel',
            "Observação Atual": observations[stat.matriz] || "",
            "Nova Observação": "",
            "Ação Recomendada": "",
            "Prioridade": ""
        }));

        const ws = XLSX.utils.json_to_sheet(templateData);
        
        // Set column widths
        ws['!cols'] = [
            { wch: 15 }, // Matriz
            { wch: 12 }, // Prod
            { wch: 12 }, // Efic
            { wch: 12 }, // Tendência
            { wch: 30 }, // Obs Atual
            { wch: 40 }, // Nova Obs
            { wch: 30 }, // Ação
            { wch: 12 }  // Prioridade
        ];
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Observações");
        
        // Add instructions sheet
        const instructionsData = [
            ["INSTRUÇÕES PARA PREENCHIMENTO"],
            [""],
            ["1. Preencha a coluna 'Nova Observação' com suas análises"],
            ["2. Use a coluna 'Ação Recomendada' para definir próximos passos"],
            ["3. Prioridade pode ser: ALTA, MÉDIA, BAIXA ou deixar vazio"],
            ["4. Após preencher, importe o arquivo na aba 'Observações'"],
            [""],
            ["IMPORTANTE:"],
            ["- NÃO altere a coluna 'Matriz' (é usada para identificar)"],
            ["- A coluna 'Observação Atual' mostra o que já está salvo"],
            ["- 'Nova Observação' vai SUBSTITUIR a observação atual"],
            ["- Deixe 'Nova Observação' vazia para manter a atual"]
        ];
        const wsInst = XLSX.utils.aoa_to_sheet(instructionsData);
        XLSX.utils.book_append_sheet(wb, wsInst, "Instruções");
        
            const fileName = `Modelo_Observacoes_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            console.log('✅ Modelo de observações gerado:', fileName);
        } catch (error) {
            console.error('❌ Erro ao gerar modelo:', error);
            alert(`Erro ao gerar modelo: ${error}`);
        }
    };

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

    return (
        <div className="space-y-6">
            {/* Header with filters - Line 1 */}
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Period */}
                    <div className="flex items-center h-9 rounded-md border bg-background px-3 gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <select
                            className="bg-transparent text-sm focus:outline-none cursor-pointer"
                            value={monthsToAnalyze}
                            onChange={(e) => setMonthsToAnalyze(Number(e.target.value))}
                        >
                            <option value={3}>3 meses</option>
                            <option value={6}>6 meses</option>
                            <option value={12}>12 meses</option>
                            <option value={24}>24 meses</option>
                        </select>
                    </div>

                    {/* Search Matrix */}
                    <div className="flex items-center h-9 rounded-md border bg-background px-3 gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <input
                            className="bg-transparent text-sm focus:outline-none w-28"
                            placeholder="Buscar matriz..."
                            value={matrizFilter}
                            onChange={(e) => setMatrizFilter(e.target.value)}
                        />
                    </div>

                    {/* Prensa */}
                    <div className="flex items-center h-9 rounded-md border bg-background px-3 gap-2">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Prensa:</span>
                        <select
                            className="bg-transparent text-sm focus:outline-none cursor-pointer"
                            value={prensaFilter}
                            onChange={(e) => setPrensaFilter(e.target.value)}
                        >
                            <option value="">Todas</option>
                            {prensaOptions.map((p) => (p !== "" ? <option key={p} value={p}>{p}</option> : null))}
                        </select>
                    </div>

                    {/* Liga */}
                    <div className="flex items-center h-9 rounded-md border bg-background px-3 gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Liga:</span>
                        <select
                            className="bg-transparent text-sm focus:outline-none cursor-pointer"
                            value={ligaFilter}
                            onChange={(e) => setLigaFilter(e.target.value)}
                        >
                            <option value="">Todas</option>
                            {ligaOptions.map((liga) => (
                                <option key={liga} value={liga}>{liga}</option>
                            ))}
                        </select>
                    </div>

                    {/* Produtividade Range */}
                    <div className="flex items-center h-9 rounded-md border bg-background px-3 gap-2">
                        <span className="text-sm text-muted-foreground">Prod:</span>
                        <input
                            className="bg-transparent text-sm focus:outline-none w-14 text-center"
                            placeholder="Min"
                            value={prodMinFilter}
                            onChange={(e) => setProdMinFilter(e.target.value)}
                        />
                        <span className="text-muted-foreground">-</span>
                        <input
                            className="bg-transparent text-sm focus:outline-none w-14 text-center"
                            placeholder="Max"
                            value={prodMaxFilter}
                            onChange={(e) => setProdMaxFilter(e.target.value)}
                        />
                    </div>

                    {/* Sort By */}
                    <div className="flex items-center h-9 rounded-md border bg-background px-3 gap-2">
                        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                        <select
                            className="bg-transparent text-sm focus:outline-none cursor-pointer"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                        >
                            <option value="score">Score</option>
                            <option value="produtividade">Produtividade</option>
                            <option value="eficiencia">Eficiência</option>
                            <option value="trend">Tendência</option>
                            <option value="matriz">Matriz</option>
                        </select>
                    </div>

                    {/* Sort Order Toggle */}
                    <button
                        className="flex items-center justify-center h-9 w-9 rounded-md border bg-background hover:bg-muted/50 transition-colors"
                        onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                        title={sortOrder === 'desc' ? 'Maior → Menor' : 'Menor → Maior'}
                    >
                        {sortOrder === 'desc' ? (
                            <TrendingDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        )}
                    </button>
                </div>

                {/* Line 2 - Toggles and Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Switch
                                id="group-by-seq"
                                checked={groupBySeq}
                                onCheckedChange={setGroupBySeq}
                            />
                            <Label htmlFor="group-by-seq" className="text-xs text-muted-foreground cursor-pointer">
                                Agrupar por Sequência
                            </Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="show-anomalies"
                                checked={showAnomaliesOnly}
                                onCheckedChange={setShowAnomaliesOnly}
                            />
                            <Label htmlFor="show-anomalies" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Apenas com Alertas
                            </Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="show-only-active"
                                checked={showOnlyActive}
                                onCheckedChange={setShowOnlyActive}
                            />
                            <Label htmlFor="show-only-active" className="text-xs text-muted-foreground cursor-pointer">
                                Apenas Ativas
                            </Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="show-only-with-obs"
                                checked={showOnlyWithObs}
                                onCheckedChange={setShowOnlyWithObs}
                            />
                            <Label htmlFor="show-only-with-obs" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                                <FileSpreadsheet className="h-3 w-3" />
                                Com Observações
                            </Label>
                        </div>
                        <div className="flex items-center gap-2 ml-2 pl-2 border-l">
                            <Switch
                                id="abc-mode"
                                checked={abcMode}
                                onCheckedChange={setAbcMode}
                            />
                            <Label htmlFor="abc-mode" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                                <BarChart3 className="h-3 w-3" />
                                ABC (Produção Total)
                            </Label>
                        </div>
                    </div>

                    <Dialog open={isDataManagementOpen} onOpenChange={setIsDataManagementOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="ml-1 gap-2">
                                <Database className="h-4 w-4" />
                                Gerenciar Dados
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Database className="h-5 w-5" />
                                    Gerenciamento de Dados e Observações
                                </DialogTitle>
                                <DialogDescription>
                                    Exporte relatórios de análise, importe observações ou gerencie dados de produção.
                                </DialogDescription>
                            </DialogHeader>
                            <Tabs defaultValue="export" className="w-full flex-1 overflow-hidden flex flex-col">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="export">Exportar</TabsTrigger>
                                    <TabsTrigger value="import-obs">Observações</TabsTrigger>
                                    <TabsTrigger value="import-data">Dados Produção</TabsTrigger>
                                </TabsList>

                                {/* Tab 1: Export Reports and Templates */}
                                <TabsContent value="export" className="space-y-3 py-3 flex-1 overflow-auto">
                                    <div className="grid grid-cols-1 gap-3">
                                        {/* Analysis Report */}
                                        <Card className="border-green-200 bg-green-50/30">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <BarChart3 className="h-4 w-4 text-green-600" />
                                                    Relatório de Análise Completo
                                                </CardTitle>
                                                <CardDescription className="text-xs">
                                                    Excel com 3 abas: Análise das Matrizes, Insights e Alertas. Ideal para apresentações.
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="pt-0">
                                                <Button onClick={handleDownloadAnalysisReport} variant="default" className="w-full" size="sm">
                                                    <Download className="mr-2 h-4 w-4" />
                                                    Baixar Relatório de Análise
                                                </Button>
                                            </CardContent>
                                        </Card>

                                        {/* Observations Template */}
                                        <Card className="border-blue-200 bg-blue-50/30">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                                                    Modelo para Observações
                                                </CardTitle>
                                                <CardDescription className="text-xs">
                                                    Planilha com todas as matrizes para você preencher observações offline e importar depois.
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="pt-0">
                                                <Button onClick={handleDownloadObservationsTemplate} variant="secondary" className="w-full" size="sm">
                                                    <Download className="mr-2 h-4 w-4" />
                                                    Baixar Modelo de Observações
                                                </Button>
                                            </CardContent>
                                        </Card>

                                        {/* Raw Data Export */}
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Database className="h-4 w-4 text-gray-600" />
                                                    Dados Brutos
                                                </CardTitle>
                                                <CardDescription className="text-xs">
                                                    Exporta todos os registros de produção com observações salvas.
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="pt-0">
                                                <Button onClick={handleDownloadReport} variant="outline" className="w-full" size="sm">
                                                    <Download className="mr-2 h-4 w-4" />
                                                    Baixar Dados Brutos
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </TabsContent>

                                {/* Tab 2: Import Observations */}
                                <TabsContent value="import-obs" className="space-y-4 py-3">
                                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                                        <div className="flex items-center gap-2 font-medium mb-1">
                                            <Info className="h-4 w-4" />
                                            Como funciona
                                        </div>
                                        <ol className="list-decimal list-inside space-y-1 text-xs">
                                            <li>Baixe o <strong>Modelo de Observações</strong> na aba "Exportar"</li>
                                            <li>Preencha a coluna <strong>"Nova Observação"</strong> no Excel</li>
                                            <li>Importe o arquivo preenchido aqui</li>
                                            <li>As observações serão atualizadas automaticamente</li>
                                        </ol>
                                    </div>

                                    <div className="flex flex-col gap-4 items-center justify-center border-2 border-dashed border-blue-300 rounded-lg p-6 bg-blue-50/30">
                                        <input
                                            ref={obsFileInputRef}
                                            type="file"
                                            accept=".xlsx,.xls"
                                            className="hidden"
                                            onChange={handleImportObservations}
                                        />
                                        <div className="text-center">
                                            <FileSpreadsheet className="h-10 w-10 text-blue-400 mx-auto mb-2" />
                                            <p className="text-sm text-muted-foreground">Selecione o arquivo de observações preenchido</p>
                                        </div>
                                        <Button
                                            onClick={() => obsFileInputRef.current?.click()}
                                            disabled={importingObs}
                                            variant="default"
                                            className="w-full max-w-xs"
                                        >
                                            {importingObs ? (
                                                "Importando observações..."
                                            ) : (
                                                <>
                                                    <Upload className="mr-2 h-4 w-4" />
                                                    Importar Observações
                                                </>
                                            )}
                                        </Button>
                                        {importObsMsg && (
                                            <p className={`text-xs text-center ${importObsMsg.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
                                                {importObsMsg}
                                            </p>
                                        )}
                                    </div>
                                </TabsContent>

                                {/* Tab 3: Import Production Data */}
                                <TabsContent value="import-data" className="space-y-4 py-3">
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                                        <div className="flex items-center gap-2 font-medium mb-1">
                                            <AlertTriangle className="h-4 w-4" />
                                            Atenção: Importação de Dados de Produção
                                        </div>
                                        <p className="text-xs">
                                            Esta opção <strong>ADICIONA</strong> novos registros de produção ao banco.
                                            Use apenas para carregar dados novos do sistema de produção.
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-4 items-center justify-center border-2 border-dashed rounded-lg p-6">
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
                                            variant="outline"
                                            className="w-full max-w-xs"
                                        >
                                            {importing ? (
                                                "Importando..."
                                            ) : (
                                                <>
                                                    <Upload className="mr-2 h-4 w-4" />
                                                    Selecionar Arquivo de Produção
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

                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <Info className="h-4 w-4" />
                                                Modelo de Importação de Produção
                                            </CardTitle>
                                            <CardDescription className="text-xs">
                                                Baixe o modelo se precisar do formato correto das colunas.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            <Button onClick={handleDownloadTemplate} variant="ghost" className="w-full" size="sm">
                                                <Download className="mr-2 h-4 w-4" />
                                                Baixar Modelo Padrão
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            </Tabs>
                        </DialogContent>
                    </Dialog>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center text-blue-700">
                            Score Médio
                            <HelpTooltip text="Índice de saúde médio das matrizes (0-100). Considera produtividade, eficiência, estabilidade, tendência e consistência." />
                        </CardDescription>
                        <CardTitle className="text-3xl flex items-center gap-2">
                            {(() => {
                                if (stats.length === 0) return '—';
                                const avgScore = Array.from(scoresAndAnomalies.scoresMap.values())
                                    .reduce((sum, s) => sum + s.total, 0) / scoresAndAnomalies.scoresMap.size;
                                return (
                                    <>
                                        <span className={getScoreColor(avgScore)}>{avgScore.toFixed(0)}</span>
                                        <span className="text-lg">{getScoreEmoji(avgScore)}</span>
                                    </>
                                );
                            })()}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Insights Panel */}
            {!loading && !error && insights.length > 0 && (
                <Card className="bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border-amber-200">
                    <CardHeader 
                        className="pb-2 cursor-pointer select-none hover:bg-amber-100/50 transition-colors rounded-t-lg"
                        onClick={() => setInsightsExpanded(!insightsExpanded)}
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                                <Lightbulb className="h-5 w-5" />
                                🧠 Insights do Período
                                <span className="text-xs font-normal text-amber-600 ml-2">
                                    ({insights.length} {insights.length === 1 ? 'insight' : 'insights'})
                                </span>
                            </CardTitle>
                            {insightsExpanded ? (
                                <ChevronUp className="h-5 w-5 text-amber-600" />
                            ) : (
                                <ChevronDown className="h-5 w-5 text-amber-600" />
                            )}
                        </div>
                        <CardDescription className="text-amber-700">
                            Análise automática dos últimos {monthsToAnalyze} meses
                        </CardDescription>
                    </CardHeader>
                    {insightsExpanded && (
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {insights.slice(0, 6).map((insight) => (
                                    <div
                                        key={insight.id}
                                        className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${getInsightTypeColor(insight.type)}`}
                                        onClick={() => {
                                            setSelectedInsight(insight);
                                            setIsInsightModalOpen(true);
                                        }}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-xl">{insight.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-sm leading-tight">{insight.title}</h4>
                                                <p className="text-xs mt-1 opacity-80">{insight.description}</p>
                                                {insight.details && insight.details.length > 0 && (
                                                    <p className="text-[10px] mt-2 opacity-60">Clique para ver detalhes →</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}

            {/* Alerts and Predictions Panel */}
            {!loading && !error && alerts.length > 0 && (
                <Card className="border-slate-300">
                    <CardHeader 
                        className="pb-2 cursor-pointer select-none hover:bg-slate-50 transition-colors rounded-t-lg"
                        onClick={() => setAlertsExpanded(!alertsExpanded)}
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                                🔔 Alertas Inteligentes e Projeções
                                <span className="text-xs font-normal text-muted-foreground ml-2">
                                    ({alerts.length} {alerts.length === 1 ? 'alerta' : 'alertas'})
                                </span>
                            </CardTitle>
                            {alertsExpanded ? (
                                <ChevronUp className="h-5 w-5 text-slate-500" />
                            ) : (
                                <ChevronDown className="h-5 w-5 text-slate-500" />
                            )}
                        </div>
                        <CardDescription>
                            Alertas baseados em tendências, projeções e limiares críticos
                        </CardDescription>
                    </CardHeader>
                    {alertsExpanded && (
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {alerts.slice(0, 6).map((alert) => (
                                    <div
                                        key={alert.id}
                                        className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${getAlertTypeColor(alert.type)}`}
                                        onClick={() => {
                                            setSelectedAlert(alert);
                                            setIsAlertModalOpen(true);
                                        }}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-xl flex-shrink-0">{getAlertIcon(alert.type)}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-sm leading-tight">{alert.title}</h4>
                                                    {alert.category === 'prediction' && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                                                            Projeção
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs mt-1 opacity-80">{alert.description}</p>
                                                {alert.suggestedAction && (
                                                    <p className="text-xs mt-2 font-medium opacity-90">
                                                        💡 {alert.suggestedAction}
                                                    </p>
                                                )}
                                                <p className="text-[10px] mt-2 opacity-60">Clique para ver detalhes e gráfico →</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {alerts.length > 6 && (
                                <button 
                                    className="w-full text-xs text-primary hover:text-primary/80 mt-3 text-center py-2 hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
                                    onClick={() => setIsAllAlertsModalOpen(true)}
                                >
                                    📋 Ver todos os {alerts.length} alertas (+{alerts.length - 6} adicionais)
                                </button>
                            )}
                        </CardContent>
                    )}
                </Card>
            )}

            {loading && <div className="text-sm text-muted-foreground">Carregando dados...</div>}
            {error && <div className="text-sm text-red-600">Erro: {error}</div>}
            {
                !loading && !error && stats.length === 0 && !abcMode && (
                    <div className="text-sm text-muted-foreground">Nenhum dado encontrado para o período selecionado.</div>
                )
            }

            {/* ABC Classification Table */}
            {abcMode && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <BarChart3 className="h-5 w-5" />
                            Classificação ABC por Ferramenta
                        </CardTitle>
                        <CardDescription>
                            Ferramentas agrupadas por código base, ordenadas por produção total (Peso Bruto)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {abcLoading ? (
                            <div className="text-sm text-muted-foreground">Carregando classificação ABC...</div>
                        ) : abcData.length === 0 ? (
                            <div className="text-sm text-muted-foreground">Nenhum dado ABC disponível.</div>
                        ) : (
                            <>
                                {/* ABC Summary */}
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold text-green-700">
                                            {abcData.filter(d => d.abc_class === 'A').length}
                                        </div>
                                        <div className="text-xs text-green-600">Classe A (80% produção)</div>
                                        <div className="text-[10px] text-green-500 mt-1">
                                            {(abcData.filter(d => d.abc_class === 'A').reduce((s, d) => s + d.total_peso_bruto, 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ton
                                        </div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold text-amber-700">
                                            {abcData.filter(d => d.abc_class === 'B').length}
                                        </div>
                                        <div className="text-xs text-amber-600">Classe B (15% produção)</div>
                                        <div className="text-[10px] text-amber-500 mt-1">
                                            {(abcData.filter(d => d.abc_class === 'B').reduce((s, d) => s + d.total_peso_bruto, 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ton
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold text-gray-700">
                                            {abcData.filter(d => d.abc_class === 'C').length}
                                        </div>
                                        <div className="text-xs text-gray-600">Classe C (5% produção)</div>
                                        <div className="text-[10px] text-gray-500 mt-1">
                                            {(abcData.filter(d => d.abc_class === 'C').reduce((s, d) => s + d.total_peso_bruto, 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ton
                                        </div>
                                    </div>
                                </div>

                                {/* ABC Table */}
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted sticky top-0">
                                            <tr>
                                                <th className="px-3 py-2 text-center font-medium w-16">Classe</th>
                                                <th className="px-3 py-2 text-left font-medium">Ferramenta</th>
                                                <th className="px-3 py-2 text-center font-medium">Matrizes</th>
                                                <th className="px-3 py-2 text-right font-medium">Peso Total (kg)</th>
                                                <th className="px-3 py-2 text-right font-medium">Prod. Média</th>
                                                <th className="px-3 py-2 text-right font-medium">Efic. Média</th>
                                                <th className="px-3 py-2 text-right font-medium">% Acumulado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {abcData.map((item, idx) => (
                                                <tr 
                                                    key={item.ferramenta_base} 
                                                    className={`border-t hover:bg-muted/30 ${
                                                        item.abc_class === 'A' ? 'bg-green-50/50' :
                                                        item.abc_class === 'B' ? 'bg-amber-50/50' :
                                                        'bg-gray-50/30'
                                                    }`}
                                                >
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-sm ${
                                                            item.abc_class === 'A' ? 'bg-green-500 text-white' :
                                                            item.abc_class === 'B' ? 'bg-amber-500 text-white' :
                                                            'bg-gray-400 text-white'
                                                        }`}>
                                                            {item.abc_class}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium">{item.ferramenta_base}</div>
                                                        <div className="text-[10px] text-muted-foreground truncate max-w-xs" title={item.matrizes.join(', ')}>
                                                            {item.matrizes.slice(0, 3).join(', ')}{item.matrizes.length > 3 ? ` +${item.matrizes.length - 3}` : ''}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-center font-medium">
                                                        {item.qtd_matrizes}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                                                        {item.total_peso_bruto.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {item.avg_produtividade?.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) || '-'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {item.avg_eficiencia?.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) || '-'}%
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full ${
                                                                        item.abc_class === 'A' ? 'bg-green-500' :
                                                                        item.abc_class === 'B' ? 'bg-amber-500' :
                                                                        'bg-gray-400'
                                                                    }`}
                                                                    style={{ width: `${Math.min(100, item.cumulative_percent)}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs tabular-nums w-12 text-right">
                                                                {item.cumulative_percent.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Main Table */}
            {
                !loading && !error && stats.length > 0 && !abcMode && (
                    <div className="overflow-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="sticky top-0 bg-muted px-3 py-2 text-center font-medium text-muted-foreground w-20">
                                        <span className="inline-flex items-center">
                                            Score
                                            <HelpTooltip text="Índice de saúde da matriz (0-100). Considera produtividade, eficiência, estabilidade, tendência e consistência." />
                                        </span>
                                    </th>
                                    <th className="sticky top-0 bg-muted px-3 py-2 text-left font-medium text-muted-foreground">Matriz</th>
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
                                    const anomalies = scoresAndAnomalies.anomaliesMap.get(stat.matriz) || [];
                                    const score = scoresAndAnomalies.scoresMap.get(stat.matriz);
                                    const hasAnomalies = anomalies.length > 0;
                                    const isExpanded = expandedMatriz === stat.matriz && (!groupBySeq || expandedSeq === stat.seq);
                                    const expandedKey = expandedSeq ? `${stat.matriz}|${expandedSeq}` : stat.matriz;

                                    return (
                                        <>
                                            <tr
                                                key={`${stat.matriz}-${stat.seq}`}
                                                className={`border-b hover:bg-muted/40 cursor-pointer ${
                                                    score && score.total < 40 ? 'bg-red-50/50' : 
                                                    score && score.total >= 80 ? 'bg-green-50/30' : ''
                                                }`}
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
                                                <td className="px-3 py-2 text-center">
                                                    {score && (
                                                        <div className="flex flex-col items-center gap-0.5">
                                                            <div className="flex items-center gap-1">
                                                                <span className={`font-bold text-sm ${getScoreColor(score.total)}`}>
                                                                    {score.total}
                                                                </span>
                                                                <span className="text-xs">{getScoreEmoji(score.total)}</span>
                                                            </div>
                                                            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full ${getScoreBgColor(score.total)}`}
                                                                    style={{ width: `${score.total}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-left">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{stat.matriz}</span>
                                                        {hasAnomalies && (
                                                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                                                        )}
                                                    </div>
                                                </td>
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
                                                            score={score}
                                                            prediction={predictionsMap.get(stat.matriz)}
                                                            rawData={rows as RawProductionData[]}
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

            {/* Insight Details Modal */}
            <Dialog open={isInsightModalOpen} onOpenChange={setIsInsightModalOpen}>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <span className="text-2xl">{selectedInsight?.icon}</span>
                            {selectedInsight?.title}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedInsight?.description}
                        </DialogDescription>
                    </DialogHeader>
                    
                    {selectedInsight?.details && selectedInsight.details.length > 0 && (
                        <div className="flex-1 overflow-auto">
                            <div className="space-y-4">
                                {/* Summary Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold text-primary">
                                            {selectedInsight.details.length}
                                        </div>
                                        <div className="text-xs text-muted-foreground">Matrizes</div>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold text-blue-600">
                                            {(selectedInsight.details.reduce((sum, d) => sum + d.avgProdutividade, 0) / selectedInsight.details.length).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                        </div>
                                        <div className="text-xs text-muted-foreground">Prod. Média (kg/h)</div>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold text-green-600">
                                            {(selectedInsight.details.reduce((sum, d) => sum + d.avgEficiencia, 0) / selectedInsight.details.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                        </div>
                                        <div className="text-xs text-muted-foreground">Efic. Média</div>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold text-amber-600">
                                            {selectedInsight.details.reduce((sum, d) => sum + d.totalRecords, 0).toLocaleString('pt-BR')}
                                        </div>
                                        <div className="text-xs text-muted-foreground">Registros</div>
                                    </div>
                                </div>

                                {/* Detailed Table */}
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium">Matriz</th>
                                                <th className="px-3 py-2 text-right font-medium">Produtividade</th>
                                                <th className="px-3 py-2 text-right font-medium">Eficiência</th>
                                                <th className="px-3 py-2 text-center font-medium">Tendência</th>
                                                <th className="px-3 py-2 text-right font-medium">CV%</th>
                                                <th className="px-3 py-2 text-center font-medium">Score</th>
                                                <th className="px-3 py-2 text-center font-medium">Anomalias</th>
                                                <th className="px-3 py-2 text-left font-medium">Evolução</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedInsight.details.map((detail, idx) => (
                                                <tr key={detail.matriz} className={idx % 2 === 0 ? 'bg-white' : 'bg-muted/30'}>
                                                    <td className="px-3 py-2 font-medium">{detail.matriz}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {detail.avgProdutividade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {detail.avgEficiencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                                                            detail.trend === 'up' ? 'bg-green-100 text-green-700' :
                                                            detail.trend === 'down' ? 'bg-red-100 text-red-700' :
                                                            'bg-gray-100 text-gray-700'
                                                        }`}>
                                                            {detail.trend === 'up' ? '↗️ Alta' : detail.trend === 'down' ? '↘️ Queda' : '→ Estável'}
                                                        </span>
                                                    </td>
                                                    <td className={`px-3 py-2 text-right tabular-nums ${detail.cvProdutividade > 25 ? 'text-red-600 font-medium' : ''}`}>
                                                        {detail.cvProdutividade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {detail.score !== undefined && (
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                detail.score >= 80 ? 'bg-green-100 text-green-700' :
                                                                detail.score >= 60 ? 'bg-blue-100 text-blue-700' :
                                                                detail.score >= 40 ? 'bg-amber-100 text-amber-700' :
                                                                'bg-red-100 text-red-700'
                                                            }`}>
                                                                {detail.score.toFixed(0)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {detail.anomaliesCount !== undefined && detail.anomaliesCount > 0 && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                                                                ⚠️ {detail.anomaliesCount}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <InsightSparkline data={detail.sparklineData} trend={detail.trend} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsInsightModalOpen(false)}>
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Alert Details Modal */}
            <Dialog open={isAlertModalOpen} onOpenChange={setIsAlertModalOpen}>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <span className="text-2xl">{selectedAlert && getAlertIcon(selectedAlert.type)}</span>
                            {selectedAlert?.title}
                            {selectedAlert?.category === 'prediction' && (
                                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                                    Projeção
                                </span>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedAlert?.description}
                        </DialogDescription>
                    </DialogHeader>
                    
                    {selectedAlert && (
                        <div className="flex-1 overflow-auto">
                            <div className="space-y-4">
                                {/* Key Metrics */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold text-primary">
                                            {selectedAlert.matriz || '-'}
                                        </div>
                                        <div className="text-xs text-muted-foreground">Matriz</div>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className={`text-2xl font-bold ${
                                            selectedAlert.type === 'critical' ? 'text-red-600' :
                                            selectedAlert.type === 'warning' ? 'text-amber-600' :
                                            selectedAlert.type === 'success' ? 'text-green-600' :
                                            'text-blue-600'
                                        }`}>
                                            {selectedAlert.value !== undefined ? 
                                                `${selectedAlert.value > 0 ? '+' : ''}${selectedAlert.value.toFixed(1)}%` : 
                                                '-'
                                            }
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {selectedAlert.metric === 'produtividade' ? 'Variação Prevista' :
                                             selectedAlert.metric === 'eficiência' ? 'Eficiência Atual' :
                                             selectedAlert.metric === 'variabilidade' ? 'Coef. Variação' : 'Valor'}
                                        </div>
                                    </div>
                                    {selectedAlert.details?.[0] && (
                                        <>
                                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                                                <div className="text-2xl font-bold text-blue-600">
                                                    {selectedAlert.details[0].avgProdutividade.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                                </div>
                                                <div className="text-xs text-muted-foreground">Prod. Média (kg/h)</div>
                                            </div>
                                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                                                <div className="text-2xl font-bold text-green-600">
                                                    {selectedAlert.details[0].avgEficiencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                                </div>
                                                <div className="text-xs text-muted-foreground">Eficiência Média</div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Prediction Chart */}
                                {selectedAlert.chartData && (
                                    <div className="border rounded-lg p-4 bg-white">
                                        <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                                            📊 Evolução e Projeção de Produtividade
                                            {selectedAlert.details?.[0]?.reliability && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                    selectedAlert.details[0].reliability === 'high' ? 'bg-green-100 text-green-700' :
                                                    selectedAlert.details[0].reliability === 'medium' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    Confiança: {selectedAlert.details[0].reliability === 'high' ? 'Alta' : 
                                                               selectedAlert.details[0].reliability === 'medium' ? 'Média' : 'Baixa'}
                                                </span>
                                            )}
                                        </h4>
                                        <AlertPredictionChart 
                                            historical={selectedAlert.chartData.historical}
                                            predictions={selectedAlert.chartData.predictions}
                                            alertType={selectedAlert.type}
                                        />
                                    </div>
                                )}

                                {/* Suggested Action */}
                                {selectedAlert.suggestedAction && (
                                    <div className={`p-4 rounded-lg border-l-4 ${
                                        selectedAlert.type === 'critical' ? 'bg-red-50 border-red-500' :
                                        selectedAlert.type === 'warning' ? 'bg-amber-50 border-amber-500' :
                                        selectedAlert.type === 'success' ? 'bg-green-50 border-green-500' :
                                        'bg-blue-50 border-blue-500'
                                    }`}>
                                        <h4 className="font-medium text-sm mb-1">💡 Ação Sugerida</h4>
                                        <p className="text-sm opacity-80">{selectedAlert.suggestedAction}</p>
                                    </div>
                                )}

                                {/* Additional Info */}
                                {selectedAlert.details?.[0] && (
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div className="space-y-2">
                                            <h4 className="font-medium">📈 Tendência Atual</h4>
                                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                                                selectedAlert.details[0].trend === 'up' ? 'bg-green-100 text-green-700' :
                                                selectedAlert.details[0].trend === 'down' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
                                                {selectedAlert.details[0].trend === 'up' ? '↗️ Em Alta' : 
                                                 selectedAlert.details[0].trend === 'down' ? '↘️ Em Queda' : 
                                                 '→ Estável'}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="font-medium">🎯 Categoria</h4>
                                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-muted">
                                                {selectedAlert.category === 'prediction' ? '🔮 Projeção' :
                                                 selectedAlert.category === 'anomaly' ? '⚠️ Anomalia' :
                                                 selectedAlert.category === 'threshold' ? '📊 Limite' :
                                                 selectedAlert.category === 'trend' ? '📈 Tendência' :
                                                 '📋 Comparação'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAlertModalOpen(false)}>
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* All Alerts Modal */}
            <Dialog open={isAllAlertsModalOpen} onOpenChange={setIsAllAlertsModalOpen}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                            Todos os Alertas ({alerts.length})
                        </DialogTitle>
                        <DialogDescription>
                            Lista completa de alertas baseados em tendências, projeções e limiares críticos
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-auto">
                        {/* Summary by Category */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-red-600">
                                    {alerts.filter(a => a.type === 'critical').length}
                                </div>
                                <div className="text-xs text-red-700">Críticos</div>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-amber-600">
                                    {alerts.filter(a => a.type === 'warning').length}
                                </div>
                                <div className="text-xs text-amber-700">Avisos</div>
                            </div>
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-green-600">
                                    {alerts.filter(a => a.type === 'success').length}
                                </div>
                                <div className="text-xs text-green-700">Positivos</div>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-blue-600">
                                    {alerts.filter(a => a.type === 'info').length}
                                </div>
                                <div className="text-xs text-blue-700">Informativos</div>
                            </div>
                        </div>

                        {/* Alerts Table */}
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium w-10">Tipo</th>
                                        <th className="px-3 py-2 text-left font-medium">Matriz</th>
                                        <th className="px-3 py-2 text-left font-medium">Alerta</th>
                                        <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Categoria</th>
                                        <th className="px-3 py-2 text-center font-medium">Valor</th>
                                        <th className="px-3 py-2 text-center font-medium w-20">Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {alerts.map((alert, idx) => (
                                        <tr 
                                            key={alert.id} 
                                            className={`border-t hover:bg-muted/30 cursor-pointer ${
                                                idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'
                                            }`}
                                            onClick={() => {
                                                setSelectedAlert(alert);
                                                setIsAlertModalOpen(true);
                                            }}
                                        >
                                            <td className="px-3 py-2 text-center">
                                                <span className="text-lg">{getAlertIcon(alert.type)}</span>
                                            </td>
                                            <td className="px-3 py-2 font-medium">
                                                {alert.matriz || '-'}
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-xs">{alert.title}</div>
                                                <div className="text-[10px] text-muted-foreground truncate max-w-xs">
                                                    {alert.description}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 hidden md:table-cell">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                    alert.category === 'prediction' ? 'bg-purple-100 text-purple-700' :
                                                    alert.category === 'anomaly' ? 'bg-orange-100 text-orange-700' :
                                                    alert.category === 'threshold' ? 'bg-blue-100 text-blue-700' :
                                                    alert.category === 'trend' ? 'bg-green-100 text-green-700' :
                                                    'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {alert.category === 'prediction' ? 'Projeção' :
                                                     alert.category === 'anomaly' ? 'Anomalia' :
                                                     alert.category === 'threshold' ? 'Limite' :
                                                     alert.category === 'trend' ? 'Tendência' :
                                                     'Comparação'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {alert.value !== undefined && (
                                                    <span className={`font-medium ${
                                                        alert.type === 'critical' ? 'text-red-600' :
                                                        alert.type === 'warning' ? 'text-amber-600' :
                                                        alert.type === 'success' ? 'text-green-600' :
                                                        'text-blue-600'
                                                    }`}>
                                                        {alert.value > 0 ? '+' : ''}{alert.value.toFixed(1)}%
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedAlert(alert);
                                                        setIsAlertModalOpen(true);
                                                    }}
                                                >
                                                    Ver →
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAllAlertsModalOpen(false)}>
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}

// Alert Prediction Chart Component
function AlertPredictionChart({ 
    historical, 
    predictions,
    alertType
}: { 
    historical: { month: string; value: number }[];
    predictions: { month: string; value: number; low: number; high: number }[];
    alertType: 'critical' | 'warning' | 'info' | 'success';
}) {
    if (historical.length === 0) return <div className="h-48 flex items-center justify-center text-muted-foreground">Sem dados</div>;

    const allValues = [
        ...historical.map(h => h.value),
        ...predictions.map(p => p.value),
        ...predictions.map(p => p.high),
        ...predictions.map(p => p.low)
    ];
    const min = Math.min(...allValues) * 0.9;
    const max = Math.max(...allValues) * 1.1;
    const range = max - min || 1;

    const width = 600;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const totalPoints = historical.length + predictions.length;
    const getX = (i: number) => padding.left + (i / (totalPoints - 1)) * chartWidth;
    const getY = (v: number) => padding.top + chartHeight - ((v - min) / range) * chartHeight;

    // Historical line
    const historicalPath = historical.map((h, i) => 
        `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(h.value)}`
    ).join(' ');

    // Prediction line
    const predictionPath = predictions.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${getX(historical.length + i)} ${getY(p.value)}`
    ).join(' ');

    // Confidence area
    const confidenceArea = predictions.length > 0 ? `
        M ${getX(historical.length)} ${getY(predictions[0].high)}
        ${predictions.map((p, i) => `L ${getX(historical.length + i)} ${getY(p.high)}`).join(' ')}
        ${predictions.slice().reverse().map((p, i) => `L ${getX(historical.length + predictions.length - 1 - i)} ${getY(p.low)}`).join(' ')}
        Z
    ` : '';

    // Connect historical to prediction
    const connectionPath = historical.length > 0 && predictions.length > 0
        ? `M ${getX(historical.length - 1)} ${getY(historical[historical.length - 1].value)} L ${getX(historical.length)} ${getY(predictions[0].value)}`
        : '';

    const predictionColor = alertType === 'success' ? '#22c55e' : 
                           alertType === 'critical' ? '#ef4444' : 
                           alertType === 'warning' ? '#f59e0b' : '#3b82f6';

    const formatMonth = (month: string) => {
        const [year, m] = month.split('-');
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return `${months[parseInt(m) - 1]}/${year.slice(2)}`;
    };

    return (
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            {/* Y-axis grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                <g key={i}>
                    <line
                        x1={padding.left}
                        y1={padding.top + chartHeight * ratio}
                        x2={width - padding.right}
                        y2={padding.top + chartHeight * ratio}
                        stroke="#e5e7eb"
                        strokeDasharray="4,4"
                    />
                    <text
                        x={padding.left - 8}
                        y={padding.top + chartHeight * ratio + 4}
                        textAnchor="end"
                        className="text-[10px] fill-muted-foreground"
                    >
                        {Math.round(max - ratio * range)}
                    </text>
                </g>
            ))}

            {/* Prediction zone background */}
            {predictions.length > 0 && (
                <rect
                    x={getX(historical.length)}
                    y={padding.top}
                    width={chartWidth - getX(historical.length) + padding.left}
                    height={chartHeight}
                    fill={predictionColor}
                    fillOpacity={0.05}
                />
            )}

            {/* Confidence interval */}
            {predictions.length > 0 && (
                <path
                    d={confidenceArea}
                    fill={predictionColor}
                    fillOpacity={0.15}
                />
            )}

            {/* Historical line */}
            <path
                d={historicalPath}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.5"
            />

            {/* Connection line */}
            {connectionPath && (
                <path
                    d={connectionPath}
                    fill="none"
                    stroke={predictionColor}
                    strokeWidth="2"
                    strokeDasharray="4,4"
                />
            )}

            {/* Prediction line */}
            {predictions.length > 0 && (
                <path
                    d={predictionPath}
                    fill="none"
                    stroke={predictionColor}
                    strokeWidth="2.5"
                    strokeDasharray="6,3"
                />
            )}

            {/* Historical points */}
            {historical.map((h, i) => (
                <circle
                    key={`h-${i}`}
                    cx={getX(i)}
                    cy={getY(h.value)}
                    r="4"
                    fill="#3b82f6"
                />
            ))}

            {/* Prediction points */}
            {predictions.map((p, i) => (
                <circle
                    key={`p-${i}`}
                    cx={getX(historical.length + i)}
                    cy={getY(p.value)}
                    r="4"
                    fill={predictionColor}
                    stroke="white"
                    strokeWidth="2"
                />
            ))}

            {/* X-axis labels */}
            {[...historical, ...predictions].map((p, i) => (
                i % Math.ceil(totalPoints / 6) === 0 && (
                    <text
                        key={`label-${i}`}
                        x={getX(i)}
                        y={height - 10}
                        textAnchor="middle"
                        className="text-[10px] fill-muted-foreground"
                    >
                        {formatMonth('month' in p ? p.month : '')}
                    </text>
                )
            ))}

            {/* Vertical divider for prediction zone */}
            {predictions.length > 0 && (
                <line
                    x1={getX(historical.length)}
                    y1={padding.top}
                    x2={getX(historical.length)}
                    y2={padding.top + chartHeight}
                    stroke={predictionColor}
                    strokeWidth="1"
                    strokeDasharray="4,2"
                />
            )}

            {/* Legend */}
            <g transform={`translate(${padding.left + 10}, ${padding.top + 10})`}>
                <rect x="0" y="0" width="12" height="3" fill="#3b82f6" rx="1" />
                <text x="16" y="3" className="text-[9px] fill-muted-foreground">Histórico</text>
                <rect x="70" y="0" width="12" height="3" fill={predictionColor} rx="1" />
                <text x="86" y="3" className="text-[9px] fill-muted-foreground">Projeção</text>
            </g>
        </svg>
    );
}

// Mini Sparkline for Insight Modal
function InsightSparkline({ data, trend }: { data: number[]; trend: 'up' | 'down' | 'stable' }) {
    if (!data || data.length === 0) return <div className="h-6 w-24" />;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const width = 96;
    const height = 24;
    const padding = 2;

    const points = data.map((value, i) => {
        const x = (i / (data.length - 1 || 1)) * (width - 2 * padding) + padding;
        const y = height - padding - ((value - min) / range) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(' ');

    const color = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#6b7280';

    return (
        <svg width={width} height={height} className="inline-block">
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                points={points}
            />
        </svg>
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
    score,
    prediction,
    rawData,
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
    score?: ScoreBreakdown;
    prediction?: PredictionResult;
    rawData?: RawProductionData[];
}) {
    // Generate suggested actions based on score and anomalies
    const suggestedActions = useMemo(() => {
        if (!score) return [];
        return generateSuggestedActions(stat, anomalies, score);
    }, [stat, anomalies, score]);

    // State for drilldown tab
    const [drilldownTab, setDrilldownTab] = useState<'turno' | 'prensa' | 'liga'>('turno');

    // Calculate drilldowns
    const drilldowns = useMemo(() => {
        if (!rawData || rawData.length === 0) return null;
        return {
            turno: calculateDrilldown(rawData, 'turno', stat.matriz),
            prensa: calculateDrilldown(rawData, 'prensa', stat.matriz),
            liga: calculateDrilldown(rawData, 'liga', stat.matriz),
        };
    }, [rawData, stat.matriz]);

    const currentDrilldown = drilldowns?.[drilldownTab];
    const drilldownInsights = currentDrilldown ? generateDrilldownInsights(currentDrilldown) : [];

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
            {/* Score and Actions Row */}
            {score && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Score Card */}
                    <Card className={`${score.statusBgColor} border-2`}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                {getScoreEmoji(score.total)} Saúde da Matriz
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <div className="text-center group relative cursor-help">
                                    <div className={`text-4xl font-bold ${score.statusColor}`}>{score.total}</div>
                                    <div className={`text-sm font-medium ${score.statusColor}`}>{score.statusLabel}</div>
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                                        <div className="font-medium mb-1">Score de Saúde (0-100)</div>
                                        <p className="text-gray-300">Índice geral que combina 5 métricas para avaliar a performance da matriz. Quanto maior, melhor a saúde.</p>
                                        <div className="mt-2 pt-2 border-t border-gray-700 text-gray-400">
                                            <div>🟢 90-100: Excelente</div>
                                            <div>🟢 70-89: Bom</div>
                                            <div>🟡 50-69: Regular</div>
                                            <div>🔴 0-49: Crítico</div>
                                        </div>
                                        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 transform translate-y-full border-8 border-transparent border-t-gray-900" />
                                    </div>
                                </div>
                                <div className="flex-1 space-y-1 text-xs">
                                    <InfoTooltip 
                                        label="Produtividade" 
                                        value={`${score.produtividadeScore.toFixed(1)}/30`}
                                        explanation="Mede a quantidade produzida por hora. Compara com a média geral do período."
                                        calculation="(Produtividade Média ÷ Meta) × 30 pontos"
                                    />
                                    <InfoTooltip 
                                        label="Eficiência" 
                                        value={`${score.eficienciaScore.toFixed(1)}/25`}
                                        explanation="Mede o aproveitamento do tempo de máquina. Eficiência alta = menos paradas e desperdícios."
                                        calculation="(Eficiência% ÷ 100) × 25 pontos"
                                    />
                                    <InfoTooltip 
                                        label="Estabilidade" 
                                        value={`${score.estabilidadeScore.toFixed(1)}/20`}
                                        explanation="Mede a consistência da produção ao longo do tempo. Baixa variação = mais estável e previsível."
                                        calculation="Baseado no Coeficiente de Variação (CV). Menor CV = mais pontos"
                                    />
                                    <InfoTooltip 
                                        label="Tendência" 
                                        value={`${score.tendenciaScore}/15`}
                                        explanation="Indica se a produção está melhorando, piorando ou estável. Subindo = bom, Caindo = atenção."
                                        calculation="Subindo: 15pts | Estável: 10pts | Caindo: 5pts"
                                    />
                                    <InfoTooltip 
                                        label="Consistência" 
                                        value={`${score.consistenciaScore.toFixed(1)}/10`}
                                        explanation="Avalia se há picos ou quedas bruscas na produção. Menos variações extremas = melhor."
                                        calculation="Baseado na diferença entre máximo e mínimo do período"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Suggested Actions Card */}
                    <Card className="md:col-span-2 border-blue-200 bg-blue-50/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                                🧰 Ações Recomendadas
                            </CardTitle>
                            <CardDescription className="text-blue-600">
                                Sugestões baseadas na análise automática
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {suggestedActions.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    ✅ Nenhuma ação necessária - matriz com bom desempenho
                                </p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {suggestedActions.map((action, i) => (
                                        <li key={i} className="text-sm flex items-start gap-2">
                                            <span>{action}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Prediction Card */}
            {prediction && (
                <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-purple-800">
                            📈 Projeção para os Próximos 3 Meses
                            <span className={`text-xs px-2 py-0.5 rounded ${getReliabilityBadge(prediction.reliability)}`}>
                                Confiabilidade: {prediction.reliability === 'high' ? 'Alta' : prediction.reliability === 'medium' ? 'Média' : 'Baixa'}
                            </span>
                        </CardTitle>
                        <CardDescription className="text-purple-600">
                            {prediction.reliabilityReason}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <ProjectionTooltip
                                title="Tendência"
                                mainValue={
                                    <span className={
                                        prediction.trend === 'up' ? 'text-green-600' : 
                                        prediction.trend === 'down' ? 'text-red-600' : 'text-amber-600'
                                    }>
                                        {prediction.trend === 'up' ? '↗️ Subindo' : 
                                         prediction.trend === 'down' ? '↘️ Caindo' : '→ Estável'}
                                    </span>
                                }
                                subValue={`Força: ${prediction.trendStrength}%`}
                                explanation="Direção da produtividade baseada nos últimos meses. A força indica quão consistente é essa direção (0-100%). Força alta = tendência mais confiável."
                                colorClass=""
                            />
                            <ProjectionTooltip
                                title="Variação Prevista"
                                mainValue={
                                    <span className={
                                        prediction.predictedChange > 0 ? 'text-green-600' : 
                                        prediction.predictedChange < 0 ? 'text-red-600' : 'text-gray-600'
                                    }>
                                        {prediction.predictedChange > 0 ? '+' : ''}{prediction.predictedChange.toFixed(1)}%
                                    </span>
                                }
                                subValue="em 3 meses"
                                explanation="Quanto a produtividade deve mudar nos próximos 3 meses, comparando a média atual com a projeção futura. Valor positivo = melhoria esperada."
                                colorClass=""
                            />
                            {prediction.predictions.slice(0, 2).map((pred, i) => (
                                <ProjectionTooltip
                                    key={i}
                                    title={pred.month.split('-').reverse().join('/')}
                                    mainValue={pred.predictedValue.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                                    subValue={`${pred.confidenceLow.toFixed(0)} - ${pred.confidenceHigh.toFixed(0)}`}
                                    explanation={`Produtividade projetada para ${pred.month.split('-').reverse().join('/')}. O intervalo abaixo mostra a faixa de confiança (valores mínimo e máximo esperados).`}
                                    colorClass="text-purple-700"
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

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

            {/* Drilldown Analysis */}
            {drilldowns && currentDrilldown && currentDrilldown.data.length > 0 && (
                <Card className="border-indigo-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-indigo-800">
                            🔍 Análise Detalhada (Drilldown)
                        </CardTitle>
                        <CardDescription>
                            Desempenho da matriz "{stat.matriz}" por dimensão
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Tabs */}
                        <div className="flex gap-2 mb-4">
                            {(['turno', 'prensa', 'liga'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setDrilldownTab(tab)}
                                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                                        drilldownTab === tab 
                                            ? 'bg-indigo-600 text-white' 
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                >
                                    Por {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Insights */}
                        {drilldownInsights.length > 0 && (
                            <div className="mb-4 p-3 bg-indigo-50 rounded-lg">
                                <div className="space-y-1">
                                    {drilldownInsights.map((insight, i) => (
                                        <p key={i} className="text-sm text-indigo-800">{insight}</p>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Table */}
                        <div className="overflow-auto max-h-64">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">{currentDrilldown.label}</th>
                                        <th className="px-3 py-2 text-center font-medium">Registros</th>
                                        <th className="px-3 py-2 text-right font-medium">Prod. Média</th>
                                        <th className="px-3 py-2 text-right font-medium">Efic. Média</th>
                                        <th className="px-3 py-2 text-center font-medium">vs Média</th>
                                        <th className="px-3 py-2 text-center font-medium">Tendência</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentDrilldown.data.map((item, i) => (
                                        <tr 
                                            key={item.key} 
                                            className={`border-b ${getComparisonBgColor(item.comparison)} ${
                                                i === 0 ? 'ring-2 ring-green-300 ring-inset' : 
                                                i === currentDrilldown.data.length - 1 ? 'ring-2 ring-red-300 ring-inset' : ''
                                            }`}
                                        >
                                            <td className="px-3 py-2 font-medium">
                                                {item.label}
                                                {i === 0 && <span className="ml-2 text-xs">🏆</span>}
                                            </td>
                                            <td className="px-3 py-2 text-center text-muted-foreground">
                                                {item.count} ({item.percentOfTotal.toFixed(0)}%)
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {item.avgProdutividade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {item.avgEficiencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                            </td>
                                            <td className={`px-3 py-2 text-center font-medium ${getComparisonColor(item.comparison)}`}>
                                                {item.comparison > 0 ? '+' : ''}{item.comparison.toFixed(1)}%
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {getDrilldownTrendIcon(item.trend)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Summary */}
                        <div className="mt-3 pt-3 border-t flex justify-between text-xs text-muted-foreground">
                            <span>Total: {currentDrilldown.totalRecords} registros</span>
                            <span>Média geral: {currentDrilldown.overallAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg/h</span>
                        </div>
                    </CardContent>
                </Card>
            )}

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
