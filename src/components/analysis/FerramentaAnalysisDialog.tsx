import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Settings } from "lucide-react";
import { KeywordsManagerDialog } from "./KeywordsManagerDialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts";

interface KeywordData {
  id: string;
  keyword: string;
  category: string;
  is_active: boolean;
}

const EXCLUDED_COD_PARADA = new Set(["401", "402", "400", "306", "313", "315", "121"]);

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

const normalizeMatriz = (code: string | number | null | undefined) =>
  (code ?? "")
    .toString()
    .trim()
    .toUpperCase();

interface FerramentaAnalysisDialogProps {
  data: ViewRow[];
  matrizFilter: string;
  onBack?: () => void;
}

interface ProdutivityAnalysis {
  ultimoMes: number;
  ultimos6Meses: number;
  ultimos12Meses: number;
  maiorProdutividade: number;
  menorProdutividade: number;
  volumeMaiorProd: number;
  volumeMenorProd: number;
}

interface CausaAnalysis {
  palavra: string;
  ocorrencias: number;
  porcentagem: number;
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  // Formato DD/MM/AAAA
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

function isWithinDays(date: Date, days: number): boolean {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days;
}

function getProdutividade(value: any): number | null {
  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value);
  return isFinite(num) ? num : null;
}

function getPeso(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace('.', '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isFinite(num) ? num : null;
}

function isLigaEspecial(value: any): boolean {
  if (!value) return false;
  const s = String(value).toUpperCase();
  // Heurística simples: considera especial se contiver "ESPECIAL" ou abreviações
  return s.includes("ESPECIAL") || s.includes("ESP.") || s.includes("ESP ");
}

export function FerramentaAnalysisDialog({ 
  data, 
  matrizFilter,
  onBack,
}: FerramentaAnalysisDialogProps) {
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [keywordsManagerOpen, setKeywordsManagerOpen] = useState(false);
  const [carteiraRows, setCarteiraRows] = useState<Array<{ data_implant: string | null; pedido_kg: any; ferramenta: string | null }>>([]);
  const [carteiraLoading, setCarteiraLoading] = useState(false);
  const [selectedMatriz, setSelectedMatriz] = useState(() => normalizeMatriz(matrizFilter));

  
  // Carregar palavras-chave do banco
  const loadKeywords = async () => {
    try {
      const { data: keywordsData, error } = await supabase
        .from('analysis_keywords')
        .select('*')
        .order('keyword');
      
      if (error) throw error;
      setKeywords((keywordsData || []).map(k => ({
        ...k,
        keyword: (k.keyword || '').toString().toUpperCase(),
      })) as any);
    } catch (error) {
      console.error('Erro ao carregar palavras-chave:', error);
      // Fallback para palavras-chave padrão se houver erro
      setKeywords([]);
    }
  };
  
  useEffect(() => {
    // Carrega palavras-chave uma vez ao montar o painel
    loadKeywords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Filtrar dados pela matriz selecionada
  const filteredData = useMemo(() => {
    const target = normalizeMatriz(selectedMatriz);
    if (!target) return data;
    return data.filter(row => normalizeMatriz(row.Matriz) === target);
  }, [data, selectedMatriz]);

  const matrizOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach(row => {
      const code = normalizeMatriz(row.Matriz);
      if (code) set.add(code);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data]);

  useEffect(() => {
    const target = normalizeMatriz(selectedMatriz);
    if (!target) {
      setCarteiraRows([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        setCarteiraLoading(true);
        const now = new Date();
        const from = new Date(now);
        from.setFullYear(from.getFullYear() - 1);
        const periodStart = from.toISOString().slice(0, 10);
        const periodEnd = now.toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from('analysis_carteira_flat')
          .select('data_implant,pedido_kg,ferramenta')
          .gte('data_implant', periodStart)
          .lte('data_implant', periodEnd)
          .ilike('ferramenta', `${target}%`);
        if (error) throw error;
        if (!active) return;
        const cleaned = (data ?? []).filter((row: any) => {
          const raw = (row.ferramenta ?? '').toString().trim().toUpperCase();
          if (!raw || raw.startsWith('SF')) return false;
          const base = raw.split('/')[0].trim();
          return base === target;
        });
        setCarteiraRows(cleaned);
      } catch {
        if (!active) return;
        setCarteiraRows([]);
      } finally {
        if (active) setCarteiraLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedMatriz]);

  const validRows = useMemo(() => {
    return filteredData.filter(row => {
      const date = parseDate(row["Data Produção"]);
      const prod = getProdutividade(row.Produtividade);
      const peso = getPeso(row["Peso Bruto"]);
      return date && prod !== null && prod > 0 && prod <= 2400 && peso !== null && peso >= 200;
    });
  }, [filteredData]);

  // Análise de produtividade
  const productivityAnalysis = useMemo((): ProdutivityAnalysis => {
    const now = new Date();
    const ultimo30 = validRows.filter(row => {
      const date = parseDate(row["Data Produção"]);
      return date && isWithinDays(date, 30);
    });

    const ultimo180 = validRows.filter(row => {
      const date = parseDate(row["Data Produção"]);
      return date && isWithinDays(date, 180);
    });

    const ultimo365 = validRows.filter(row => {
      const date = parseDate(row["Data Produção"]);
      return date && isWithinDays(date, 365);
    });

    const calcMedia = (rows: ViewRow[]) => {
      if (rows.length === 0) return 0;
      const sum = rows.reduce((acc, row) => {
        const prod = getProdutividade(row.Produtividade);
        return acc + (prod || 0);
      }, 0);
      return sum / rows.length;
    };

    const allProds = validRows
      .map(row => getProdutividade(row.Produtividade))
      .filter((p): p is number => p !== null && p > 0);
    
    // Encontrar os registros com maior e menor produtividade para pegar os volumes
    let maiorProd = 0;
    let menorProd = 0;
    let volumeMaior = 0;
    let volumeMenor = 0;
    
    if (allProds.length > 0) {
      maiorProd = Math.max(...allProds);
      menorProd = Math.min(...allProds);
      
      // Encontrar o registro com maior produtividade
      const rowMaior = validRows.find(row => getProdutividade(row.Produtividade) === maiorProd);
      if (rowMaior) {
        const peso = getPeso(rowMaior["Peso Bruto"]);
        volumeMaior = peso ?? 0;
      }
      
      // Encontrar o registro com menor produtividade
      const rowMenor = validRows.find(row => getProdutividade(row.Produtividade) === menorProd);
      if (rowMenor) {
        const peso = getPeso(rowMenor["Peso Bruto"]);
        volumeMenor = peso ?? 0;
      }
    }
    
    return {
      ultimoMes: calcMedia(ultimo30),
      ultimos6Meses: calcMedia(ultimo180),
      ultimos12Meses: calcMedia(ultimo365),
      maiorProdutividade: maiorProd,
      menorProdutividade: menorProd,
      volumeMaiorProd: volumeMaior,
      volumeMenorProd: volumeMenor,
    };
  }, [filteredData]);

  const productivityRangeStats = useMemo(() => {
    const rows365 = validRows.filter(row => {
      const date = parseDate(row["Data Produção"]);
      return date && isWithinDays(date, 365);
    });

    let above1300 = 0;
    let between1000_1300 = 0;
    let below1000 = 0;

    rows365.forEach(row => {
      const prod = getProdutividade(row.Produtividade);
      if (prod == null) return;
      if (prod > 1300) {
        above1300 += 1;
      } else if (prod >= 1000) {
        between1000_1300 += 1;
      } else {
        below1000 += 1;
      }
    });

    const total = above1300 + between1000_1300 + below1000;
    const pct = (x: number) => (total > 0 ? (x / total) * 100 : 0);

    return {
      total,
      above1300,
      between1000_1300,
      below1000,
      pAbove1300: pct(above1300),
      pBetween1000_1300: pct(between1000_1300),
      pBelow1000: pct(below1000),
    };
  }, [validRows]);

  // Análise de causas
  const causasAnalysis = useMemo((): CausaAnalysis[] => {
    const totalObservacoes = filteredData.filter(row => row["Observação Lote"]).length;
    
    if (totalObservacoes === 0) {
      // Retorna todas as palavras-chave com 0 ocorrências
      return keywords.map(keyword => ({
        palavra: keyword.keyword,
        ocorrencias: 0,
        porcentagem: 0
      }));
    }

    const contadores = new Map<string, number>();
    
    // Inicializar todas as palavras-chave com 0
    keywords.forEach(keyword => {
      contadores.set((keyword.keyword || '').toString().toUpperCase(), 0);
    });
    
    filteredData.forEach(row => {
      const obs = (row["Observação Lote"] || '').toString().toUpperCase();
      if (!obs.trim()) return;
      
      keywords.forEach(keyword => {
        const kw = (keyword.keyword || '').toString().toUpperCase();
        if (kw && obs.includes(kw)) {
          contadores.set(kw, (contadores.get(kw) || 0) + 1);
        }
      });
    });

    const result: CausaAnalysis[] = [];
    contadores.forEach((ocorrencias, palavra) => {
      result.push({
        palavra,
        ocorrencias,
        porcentagem: (ocorrencias / totalObservacoes) * 100
      });
    });

    return result.sort((a, b) => b.porcentagem - a.porcentagem);
  }, [filteredData, keywords]);
  
  const totalPorcentagem = useMemo(() => {
    return causasAnalysis.reduce((acc, causa) => acc + causa.porcentagem, 0);
  }, [causasAnalysis]);

  const causasComPercentual = useMemo(() => {
    return causasAnalysis.filter(causa => causa.porcentagem > 0);
  }, [causasAnalysis]);

  const formatNumber = (num: number) => {
    return num.toLocaleString('pt-BR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const codParadaStats = useMemo(() => {
    let atendido = 0;
    let outros = 0;
    filteredData.forEach(row => {
      const raw = (row["Cod Parada"] || "").toString();
      if (!raw) return;
      const upper = raw.toUpperCase();
      const code = upper.split("-")[0].trim();
      if (EXCLUDED_COD_PARADA.has(code)) return;
      if (upper.includes("001") && upper.includes("PEDIDO ATENDIDO")) {
        atendido += 1;
      } else {
        outros += 1;
      }
    });
    const total = atendido + outros;
    const pAtendido = total > 0 ? (atendido / total) * 100 : 0;
    const pOutros = total > 0 ? (outros / total) * 100 : 0;
    return { atendido, outros, total, pAtendido, pOutros };
  }, [filteredData]);

  const productivityTrend = useMemo(() => {
    const now = new Date();
    const buckets: Array<{ key: string; label: string; fullLabel: string; month: number; year: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const shortLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');
      const fullLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
      buckets.push({ key, label: shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1), fullLabel, month: date.getMonth(), year: date.getFullYear() });
    }

    const statsMap = new Map<string, { sum: number; count: number }>();
    const bestSeqMap = new Map<string, { seq: string | null; prod: number }>();

    validRows.forEach(row => {
      const date = parseDate(row["Data Produção"]);
      if (!date) return;
      const monthsDiff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
      if (monthsDiff < 0 || monthsDiff > 11) return;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const prod = getProdutividade(row.Produtividade);
      if (prod == null) return;
      const current = statsMap.get(key) || { sum: 0, count: 0 };
      current.sum += prod;
      current.count += 1;
      statsMap.set(key, current);

      const seq = row.Seq != null ? String(row.Seq) : null;
      const existing = bestSeqMap.get(key);
      if (!existing || prod > existing.prod) {
        bestSeqMap.set(key, { seq, prod });
      }
    });

    return buckets.map(bucket => {
      const stats = statsMap.get(`${bucket.year}-${bucket.month}`);
      const avg = stats && stats.count > 0 ? Number((stats.sum / stats.count).toFixed(2)) : null;
      const bestSeq = bestSeqMap.get(`${bucket.year}-${bucket.month}`)?.seq ?? null;
      return {
        label: bucket.label,
        fullLabel: bucket.fullLabel,
        produtividade: avg,
        objetivoComum: 1300,
        objetivoEspecial: 1000,
        seq: bestSeq,
      } as any;
    });
  }, [validRows]);

  const hasTrendData = productivityTrend.some(point => point.produtividade !== null);

  const productivityChartConfig = {
    produtividade: {
      label: "Produtividade",
      color: "#2563eb",
    },
    objetivoComum: {
      label: "Objetivo Liga Comum (1.300 kg/h)",
      color: "#f97316",
    },
    objetivoEspecial: {
      label: "Objetivo Liga Especial (1.000 kg/h)",
      color: "#16a34a",
    },
  } as const;

  const carteiraTrend = useMemo(() => {
    const now = new Date();
    const buckets: Array<{ key: string; label: string; fullLabel: string; month: number; year: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const shortLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');
      const fullLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
      buckets.push({ key, label: shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1), fullLabel, month: date.getMonth(), year: date.getFullYear() });
    }

    const statsMap = new Map<string, number>();
    carteiraRows.forEach((row: any) => {
      const iso = row.data_implant as string | null;
      if (!iso) return;
      const date = new Date(iso);
      if (!Number.isFinite(date.getTime())) return;
      const monthsDiff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
      if (monthsDiff < 0 || monthsDiff > 11) return;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const kg = getPeso(row.pedido_kg);
      if (kg == null || kg <= 0) return;
      const current = statsMap.get(key) || 0;
      statsMap.set(key, current + kg);
    });

    const base = buckets.map((bucket) => {
      const totalKg = statsMap.get(`${bucket.year}-${bucket.month}`) || 0;
      return {
        label: bucket.label,
        fullLabel: bucket.fullLabel,
        volume: totalKg > 0 ? Number(totalKg.toFixed(2)) : null,
      } as any;
    });

    const points = base
      .map((p, idx) => ({ x: idx, y: p.volume as number | null }))
      .filter((p) => p.y != null) as { x: number; y: number }[];

    let slope = 0;
    let intercept = 0;
    if (points.length >= 2) {
      const n = points.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      for (const pt of points) {
        const x = pt.x;
        const y = pt.y;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
      }
      const denom = n * sumXX - sumX * sumX;
      if (denom !== 0) {
        slope = (n * sumXY - sumX * sumY) / denom;
        intercept = (sumY - slope * sumX) / n;
      } else {
        slope = 0;
        intercept = n > 0 ? sumY / n : 0;
      }
    }

    const hasTrend = points.length >= 2;

    return base.map((p, idx) => {
      const t = hasTrend ? intercept + slope * idx : null;
      return {
        ...p,
        trend: t != null ? Number(t.toFixed(2)) : null,
      } as any;
    });
  }, [carteiraRows]);

  const hasCarteiraTrendData = carteiraTrend.some(point => point.volume !== null);

  const carteiraChartConfig = {
    volume: {
      label: "Entradas de Pedido (kg)",
      color: "#22c55e",
    },
    trend: {
      label: "Tendência",
      color: "#0ea5e9",
    },
  } as const;

  return (
    <div className="max-w-5xl w-full mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-8 px-3 rounded-md border text-xs hover:bg-muted"
            >
              Voltar para Produção
            </button>
          )}
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              Análise de Ferramenta {selectedMatriz && `- ${selectedMatriz}`}
            </h2>
            <div className="flex items-center gap-1">
              <input
                type="text"
                className="h-8 w-32 rounded-md border bg-background px-2 text-xs"
                list="matriz-options"
                placeholder="Digite a matriz…"
                value={selectedMatriz || ""}
                onChange={(e) => setSelectedMatriz(e.target.value)}
              />
              {matrizOptions.length > 0 && (
                <datalist id="matriz-options">
                  {matrizOptions.map((code) => (
                    <option key={code} value={code} />
                  ))}
                </datalist>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setKeywordsManagerOpen(true)}
          className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
          title="Gerenciar palavras-chave"
        >
          <Settings className="h-4 w-4" />
          Gerenciar Palavras-Chave
        </button>
      </div>

      <div className="space-y-6">
          {hasTrendData && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">
                  Evolução da Produtividade (12 meses)
                  {selectedMatriz && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Matriz: {selectedMatriz}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Média mensal considerando apenas produções ≥ 200 kg
                </p>
              </div>
              <ChartContainer config={productivityChartConfig} className="h-64 w-full rounded-lg border bg-card">
                <LineChart data={productivityTrend} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={60}
                    tickFormatter={(value) => formatNumber(Number(value))}
                    domain={[0, "dataMax + 200"]}
                  />
                  <ChartTooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={<ChartTooltipContent labelKey="fullLabel" />}
                    formatter={(value, _name, item: any, _index, payload: any) => {
                      const dataKey = item?.dataKey || item?.name;
                      const seq = payload?.seq;
                      const showSeq = dataKey === "produtividade" && seq;
                      return (
                        <div className="flex flex-col">
                          <span>{`${formatNumber(value as number)} kg/h`}</span>
                          {showSeq && (
                            <span className="text-[10px] text-muted-foreground">
                              Seq: {String(seq)}
                            </span>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="produtividade"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 4.5 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="objetivoComum"
                    stroke="#f97316"
                    strokeWidth={1.8}
                    dot={false}
                    strokeDasharray="4 4"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="objetivoEspecial"
                    stroke="#16a34a"
                    strokeWidth={1.8}
                    dot={false}
                    strokeDasharray="4 4"
                    connectNulls
                  />
                </LineChart>
              </ChartContainer>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="rounded-md border bg-emerald-50 px-3 py-2">
                  <div className="font-medium text-emerald-700">Acima de 1.300 kg/h</div>
                  <div className="mt-1 text-sm">
                    {formatNumber(productivityRangeStats.pAbove1300)}%
                    {productivityRangeStats.total > 0 && (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ({productivityRangeStats.above1300} de {productivityRangeStats.total} lotes)
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-md border bg-amber-50 px-3 py-2">
                  <div className="font-medium text-amber-700">Entre 1.300 e 1.000 kg/h</div>
                  <div className="mt-1 text-sm">
                    {formatNumber(productivityRangeStats.pBetween1000_1300)}%
                    {productivityRangeStats.total > 0 && (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ({productivityRangeStats.between1000_1300} de {productivityRangeStats.total} lotes)
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-md border bg-red-50 px-3 py-2">
                  <div className="font-medium text-red-700">Abaixo de 1.000 kg/h</div>
                  <div className="mt-1 text-sm">
                    {formatNumber(productivityRangeStats.pBelow1000)}%
                    {productivityRangeStats.total > 0 && (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ({productivityRangeStats.below1000} de {productivityRangeStats.total} lotes)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasCarteiraTrendData && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">
                  Entradas de Pedido na Carteira (12 meses)
                  {selectedMatriz && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Matriz: {selectedMatriz}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Soma mensal de Pedido Kg na Carteira para a matriz selecionada
                </p>
              </div>
              <ChartContainer config={carteiraChartConfig} className="h-64 w-full rounded-lg border bg-card">
                <LineChart data={carteiraTrend} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={70}
                    tickFormatter={(value) => formatNumber(Number(value))}
                    domain={[0, "dataMax + 500"]}
                  />
                  <ChartTooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={<ChartTooltipContent labelKey="fullLabel" />}
                    formatter={(value) => `${formatNumber(value as number)} kg`}
                  />
                  <Line
                    type="monotone"
                    dataKey="volume"
                    stroke="#22c55e"
                    strokeWidth={2.3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 4.5 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    stroke="#0ea5e9"
                    strokeWidth={1.8}
                    dot={false}
                    strokeDasharray="4 4"
                    connectNulls
                  />
                </LineChart>
              </ChartContainer>
            </div>
          )}

          {/* Análise de Produtividade */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Média de Produtividade</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600 font-medium">Último Mês</div>
                <div className="text-xl font-bold text-blue-800">
                  {formatNumber(productivityAnalysis.ultimoMes)} kg/h
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600 font-medium">Últimos 6 Meses</div>
                <div className="text-xl font-bold text-green-800">
                  {formatNumber(productivityAnalysis.ultimos6Meses)} kg/h
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-purple-600 font-medium">Últimos 12 Meses</div>
                <div className="text-xl font-bold text-purple-800">
                  {formatNumber(productivityAnalysis.ultimos12Meses)} kg/h
                </div>
              </div>
            </div>
          </div>

          {/* Análise de Extremos */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Análise de Extremos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-red-600 font-medium">Maior Produtividade</div>
                <div className="text-xl font-bold text-red-800">
                  {formatNumber(productivityAnalysis.volumeMaiorProd)} kg - {formatNumber(productivityAnalysis.maiorProdutividade)} kg/h
                </div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm text-orange-600 font-medium">Menor Produtividade</div>
                <div className="text-xl font-bold text-orange-800">
                  {formatNumber(productivityAnalysis.volumeMenorProd)} kg - {formatNumber(productivityAnalysis.menorProdutividade)} kg/h
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Indicador por Cod Parada</h3>
            {codParadaStats.total === 0 ? (
              <div className="text-sm text-muted-foreground">Sem ocorrências consideradas.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-sky-50 p-4 rounded-lg">
                  <div className="text-sm text-sky-600 font-medium">001 - PEDIDO ATENDIDO</div>
                  <div className="text-xl font-bold text-sky-800">
                    {codParadaStats.atendido} • {formatNumber(codParadaStats.pAtendido)}%
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 font-medium">Demais ocorrências (excluídos códigos 400, 401, 402, 306, 313, 315, 121)</div>
                  <div className="text-xl font-bold text-gray-800">
                    {codParadaStats.outros} • {formatNumber(codParadaStats.pOutros)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Análise de Causas */}
          <div>
            <h3 className="text-lg font-semibold mb-3">
              Análise de Causas ({causasAnalysis.filter(c => c.ocorrencias > 0).length} com ocorrências)
            </h3>
            {causasAnalysis.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nenhuma observação encontrada nos dados.
              </div>
            ) : (
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Causa</th>
                      <th className="text-right p-2">Ocorrências</th>
                      <th className="text-right p-2">Porcentagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {causasComPercentual.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-3 text-center text-muted-foreground">
                          Nenhuma ocorrência com percentual registrado.
                        </td>
                      </tr>
                    )}
                    {causasComPercentual.map((causa) => (
                      <tr key={causa.palavra} className="border-b">
                        <td className="p-2 font-medium">{causa.palavra}</td>
                        <td className="p-2 text-right">{causa.ocorrencias}</td>
                        <td className="p-2 text-right">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            causa.porcentagem >= 10 ? 'bg-red-100 text-red-800' :
                            causa.porcentagem >= 5 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {formatNumber(causa.porcentagem)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 bg-muted/50 font-semibold">
                      <td className="p-2">TOTAL</td>
                      <td className="p-2 text-right">
                        {causasAnalysis.reduce((acc, causa) => acc + causa.ocorrencias, 0)}
                      </td>
                      <td className="p-2 text-right">
                        <span className="px-2 py-1 rounded text-xs font-bold bg-primary text-primary-foreground">
                          {formatNumber(totalPorcentagem)}%
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Informações adicionais */}
          <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
            <div>• Dados filtrados: {filteredData.length} registros</div>
            <div>• Produtividade analisada: produções ≥ 200 kg com produtividade até 2.400 kg/h</div>
            <div>• Análise baseada em {keywords.length} palavras-chave cadastradas</div>
          </div>
        </div>

      <KeywordsManagerDialog
        open={keywordsManagerOpen}
        onOpenChange={setKeywordsManagerOpen}
        onKeywordsUpdated={loadKeywords}
      />
    </div>
  );
}
