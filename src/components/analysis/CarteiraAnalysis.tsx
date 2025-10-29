import { useEffect, useMemo, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnalysisExcelUpload, downloadAnalysisExcel } from "@/services/analysis";
import { cacheService, buildUploadCacheKey, buildUploadVersion } from "@/services/cache";

// Tamanho do chunk para processamento assíncrono
const CHUNK_SIZE = 500;

type PeriodKey = "6m" | "12m" | "24m" | "60m" | "all" | "custom";

interface CarteiraAnalysisProps {
  upload: AnalysisExcelUpload | null;
  ferramentasUpload: AnalysisExcelUpload | null;
  isUploadingMeta: boolean;
  onRequestUpload: () => void;
}

interface CarteiraEntry {
  ferramenta: string;
  cliente: string;
  dataImplant: Date;
  volumeKg: number;
}

interface AggregatedItem {
  nome: string;
  volumeKg: number;
  share: number;
  cumulativeShare: number;
  classe: "A" | "B" | "C";
  pedidos: number;
  ativos: number;
}

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string; months?: number }> = [
  { key: "6m", label: "Últimos 6 meses", months: 6 },
  { key: "12m", label: "Últimos 12 meses", months: 12 },
  { key: "24m", label: "Últimos 24 meses", months: 24 },
  { key: "60m", label: "Últimos 5 anos", months: 60 },
  { key: "all", label: "Todo histórico" },
  { key: "custom", label: "Intervalo personalizado" },
];

type CarteiraHeaderKey = "ferramenta" | "dataImplant" | "volumeKg" | "cliente";
type FerramentasHeaderKey = "ferramenta" | "status";

const CARTEIRA_HEADER_ALIASES: Record<CarteiraHeaderKey, string[]> = {
  ferramenta: ["ferramenta", "matriz", "codigo"],
  dataImplant: ["data implant", "data", "data pedido"],
  volumeKg: ["pedido kg", "kg", "pedido"],
  cliente: ["cliente", "nome do cliente"],
};

const FERRAMENTAS_HEADER_ALIASES: Record<FerramentasHeaderKey, string[]> = {
  ferramenta: ["ferramenta", "codigo", "cod", "matriz"],
  status: ["status", "situacao", "situaçao", "situacao atual", "situacao ferramenta", "condicao", "condição"],
};

const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseNumber = (value: unknown): number | null => {
  // Se já for número, retorna o valor
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  
  // Se for string, faz o parse adequado
  if (typeof value === "string") {
    // Remove todos os pontos de milhar e substitui vírgula por ponto
    const cleanValue = value.trim()
      .replace(/\./g, '')  // Remove pontos de milhar
      .replace(/,/g, '.');  // Substitui vírgula por ponto
    
    const parsed = Number.parseFloat(cleanValue);
    return Number.isNaN(parsed) ? null : parsed;
  }
  
  // Se for um objeto de célula do Excel (quando o tipo é 'n')
  if (value && typeof value === 'object' && 'v' in value) {
    return parseNumber(value.v);
  }
  
  return null;
};

const excelSerialToDate = (serial: number): Date | null => {
  if (Number.isNaN(serial)) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const parseDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    const d = new Date(value.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof value === "number") return excelSerialToDate(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const isoLike = trimmed.replace(/\//g, "-");
    const parts = isoLike.split("-");
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 2) {
        const day = Number.parseInt(a, 10);
        const month = Number.parseInt(b, 10) - 1;
        const year = Number.parseInt(c, 10);
        if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
          return new Date(Date.UTC(year, month, day));
        }
      }
      if (a.length === 4) {
        const year = Number.parseInt(a, 10);
        const month = Number.parseInt(b, 10) - 1;
        const day = Number.parseInt(c, 10);
        if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
          return new Date(Date.UTC(year, month, day));
        }
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    }
  }
  return null;
};

const findColumnIndex = (headers: unknown[], aliases: string[]): number => {
  const normalizedAliases = (aliases ?? []).map(normalizeHeader);
  const normalizedHeaders = headers.map(normalizeHeader);
  return normalizedHeaders.findIndex((header) => {
    if (!header) return false;
    if (normalizedAliases.includes(header)) return true;
    return normalizedAliases.some((alias) => alias && header.includes(alias));
  });
};

const getCellValue = (sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number): unknown => {
  const dense = (sheet as any)["!data"] as XLSX.CellObject[][] | undefined;
  if (dense && dense[rowIndex]?.[colIndex]) {
    const denseCell = dense[rowIndex][colIndex];
    if (denseCell?.v !== undefined) return denseCell.v;
    if (denseCell?.w !== undefined) return denseCell.w;
  }

  const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
  if (!cell) return null;
  if (cell.v !== undefined) return cell.v;
  if (cell.w !== undefined) return cell.w;
  return null;
};

const extractRowValues = (sheet: XLSX.WorkSheet, rowIndex: number, range: XLSX.Range): unknown[] => {
  const values: unknown[] = [];
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    values.push(getCellValue(sheet, rowIndex, col));
  }
  return values;
};

const detectColumns = <T extends string>(
  sheet: XLSX.WorkSheet,
  range: XLSX.Range,
  aliasMap: Record<T, string[]>,
  preferredHeaderRow?: number,
): { headerIndex: number; columns: Record<T, number> } | null => {
  const maxAttempts = Math.min(range.e.r, range.s.r + 30);

  const candidates: number[] = [];
  if (typeof preferredHeaderRow === "number") {
    const preferredIndex = Math.max(preferredHeaderRow - 1, range.s.r);
    candidates.push(preferredIndex);
  }
  for (let row = range.s.r; row <= maxAttempts; row += 1) {
    if (!candidates.includes(row)) candidates.push(row);
  }

  for (const rowIndex of candidates) {
    const headersRow = extractRowValues(sheet, rowIndex, range);
    if (!headersRow.some((value) => String(value ?? "").trim())) continue;

    const columns = {} as Record<T, number>;
    for (const [columnKey, aliases] of Object.entries(aliasMap) as Array<[T, string[]]>) {
      columns[columnKey] = findColumnIndex(headersRow, aliases);
    }

    if (Object.values(columns).every((col) => col !== -1)) {
      return { headerIndex: rowIndex, columns };
    }
  }

  return null;
};

const getPeriodRange = (period: PeriodKey, custom: { start?: string; end?: string }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === "custom") {
    const start = custom.start ? new Date(custom.start) : undefined;
    const end = custom.end ? new Date(custom.end) : today;
    start?.setHours(0, 0, 0, 0);
    end?.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (period === "all") return { end: today };
  const option = PERIOD_OPTIONS.find((opt) => opt.key === period);
  if (!option?.months) return { end: today };
  const start = new Date(today);
  start.setMonth(start.getMonth() - option.months);
  start.setHours(0, 0, 0, 0);
  return { start, end: today };
};

const computeAggregatedFerramenta = (entries: CarteiraEntry[]): AggregatedItem[] => {
  const map = new Map<string, { volume: number; pedidos: number }>();
  entries.forEach(({ ferramenta, volumeKg }) => {
    const current = map.get(ferramenta) ?? { volume: 0, pedidos: 0 };
    current.volume += volumeKg;
    current.pedidos += 1;
    map.set(ferramenta, current);
  });

  const total = Array.from(map.values()).reduce((acc, item) => acc + item.volume, 0);
  if (!total) return [];

  let acumulado = 0;
  return Array.from(map.entries())
    .map(([nome, data]) => ({ nome, volumeKg: data.volume, pedidos: data.pedidos }))
    .sort((a, b) => b.volumeKg - a.volumeKg)
    .map((item) => {
      acumulado += item.volumeKg;
      const share = (item.volumeKg / total) * 100;
      const cumulativeShare = (acumulado / total) * 100;
      const classe = cumulativeShare <= 80 ? "A" : cumulativeShare <= 95 ? "B" : "C";
      return { ...item, share, cumulativeShare, classe, ativos: 0 };
    });
};

const ACTIVE_STATUS_KEYWORDS = ["ativa", "ativo", "em uso", "disponivel", "disponível", "operacional", "em operacao", "em operação", "em atividade", "em serviço", "funcionando"];

const processFerramentasWorkbook = (workbook: XLSX.WorkBook, headerRow: number): Map<string, number> => {
  const result = new Map<string, number>();
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return result;

  const ref = sheet["!ref"] ?? "A1";
  const range = XLSX.utils.decode_range(ref);
  const headerInfo = detectColumns(sheet, range, FERRAMENTAS_HEADER_ALIASES, headerRow);
  if (!headerInfo) return result;

  const { headerIndex, columns } = headerInfo;

  for (let row = headerIndex + 1; row <= range.e.r; row += 1) {
    const ferramentaRaw = getCellValue(sheet, row, columns.ferramenta);
    const statusRaw = getCellValue(sheet, row, columns.status);

    const ferramenta = String(ferramentaRaw ?? "").trim();
    if (!ferramenta) continue;

    const normalizedKey = normalizeHeader(ferramenta);
    const status = String(statusRaw ?? "").trim().toLowerCase();
    if (!status) continue;

    const isActive = ACTIVE_STATUS_KEYWORDS.some((keyword) => status.includes(keyword));
    if (isActive) {
      const current = result.get(normalizedKey) ?? 0;
      result.set(normalizedKey, current + 1);
    }
  }

  return result;
};

const formatDecimal = (value: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatInteger = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

const formatVolume = (value: number) => formatDecimal(value);

const formatPercentage = (value: number) => `${formatDecimal(value)}%`;

const formatDateBR = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);

export function CarteiraAnalysis({ upload, ferramentasUpload, isUploadingMeta, onRequestUpload }: CarteiraAnalysisProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<CarteiraEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [abcFilter, setAbcFilter] = useState<"all" | "A" | "B" | "C">("all");
  const [period, setPeriod] = useState<PeriodKey>("12m");
  const [customRange, setCustomRange] = useState<{ start?: string; end?: string }>({});
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);
  const [ativosMap, setAtivosMap] = useState<Map<string, number>>(() => new Map());

  // Processa a planilha em chunks para não travar a UI
  const processWorkbook = useCallback(async (workbook: XLSX.WorkBook, headerRow: number): Promise<CarteiraEntry[]> => {
    console.log("Iniciando processamento da planilha...");
    
    // Configuração para otimizar o processamento
    const options = {
      raw: true,          // Usar valores brutos (sem formatação)
      defval: "",         // Valor padrão para células vazias
      blankrows: false,   // Ignorar linhas vazias
      skipHidden: true,   // Pular linhas ocultas
      dateNF: 'dd/mm/yyyy' // Formato de data esperado
    };

    try {
      // Converte a planilha para JSON com as opções otimizadas
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], options);
      console.log(`Planilha convertida para JSON: ${jsonData.length} linhas`);
      
      // Encontra os cabeçalhos corretos
      const firstRow = jsonData[0] || {};
      const headers = Object.keys(firstRow);
      
      // Mapeia os cabeçalhos para as colunas corretas
      const normalizedHeaders = headers.map((header) => ({
        original: header,
        normalized: normalizeHeader(header),
      }));

      const findColumn = (aliases: string[]): string | null => {
        const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));

        // Prioriza correspondência exata do cabeçalho
        for (const alias of normalizedAliases) {
          const exact = normalizedHeaders.find((header) => header.normalized === alias);
          if (exact) return exact.original;
        }

        // Se não houver correspondência exata, aceita cabeçalhos que contenham o alias
        for (const alias of normalizedAliases) {
          const partial = normalizedHeaders.find(
            (header) => alias && header.normalized.includes(alias),
          );
          if (partial) return partial.original;
        }

        return null;
      };

      const ferramentaCol = findColumn(["ferramenta", "matriz", "codigo"]);
      const dataCol = findColumn(["data implant", "data", "data pedido"]);
      const volumeCol = findColumn(["pedido kg", "kg", "pedido", "volume"]);
      const clienteCol = findColumn(["cliente", "fornecedor", "nome"]);

      if (!ferramentaCol || !dataCol || !volumeCol) {
        throw new Error(
          "Não foi possível localizar os cabeçalhos necessários. Verifique se a planilha contém colunas para Ferramenta, Data Implant e Pedido Kg."
        );
      }

      console.log("Colunas identificadas:", { ferramentaCol, dataCol, volumeCol, clienteCol });

      const entries: CarteiraEntry[] = [];
      let totalVolume = 0;
      let totalPedidos = 0;
      let linhasProcessadas = 0;
      const totalLinhas = jsonData.length;

      // Processa os dados em lotes para não travar a UI
      const batchSize = 1000;
      
      for (let i = 0; i < totalLinhas; i += batchSize) {
        const batch = jsonData.slice(i, i + batchSize);
        
        for (const row of batch) {
          linhasProcessadas++;
          
          const ferramenta = String(row[ferramentaCol] ?? "").trim();
          const dataImplant = parseDate(row[dataCol]);
          const volume = parseNumber(row[volumeCol]);
          const cliente = clienteCol ? String(row[clienteCol] ?? "Cliente não informado").trim() : "Cliente não informado";

          if (ferramenta && dataImplant && volume != null) {
            entries.push({ ferramenta, cliente, dataImplant, volumeKg: volume });
            totalVolume += volume;
            totalPedidos++;
          }
        }

        // Libera a thread da UI a cada lote
        if (i + batchSize < totalLinhas) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        console.log(`Processado: ${Math.min(i + batchSize, totalLinhas)}/${totalLinhas} linhas (${entries.length} entradas válidas)`);
      }

      console.log(`Processamento concluído: ${totalPedidos} pedidos, volume total: ${totalVolume.toLocaleString('pt-BR')} kg`);
      return entries;
      
    } catch (error) {
      console.error("Erro ao processar planilha:", error);
      throw new Error(`Falha ao processar a planilha: ${error.message}`);
    }
  }, []);

  // Carrega os dados do cache ou processa o arquivo
  const loadData = useCallback(async () => {
    if (!upload) {
      setEntries([]);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const cacheKey = buildUploadCacheKey(upload.id, "carteira");
      const version = buildUploadVersion({ checksum: upload.checksum, updatedAt: upload.updated_at, fileSize: upload.file_size });

      const cachedEntry = await cacheService.getEntry<CarteiraEntry[]>(cacheKey);
      if (cachedEntry && cachedEntry.fileHash === version) {
        setEntries(cachedEntry.data);
        return;
      }

      const buffer = await downloadAnalysisExcel(upload);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });

      const parsed = await processWorkbook(workbook, upload.header_row ?? 1);

      await cacheService.setEntry(cacheKey, parsed, version);
      setEntries(parsed);

    } catch (err) {
      console.error("Erro ao carregar planilha:", err);
      setError("Falha ao processar o arquivo. Verifique o formato e tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [upload, processWorkbook]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadFerramentas = useCallback(async () => {
    if (!ferramentasUpload) {
      setAtivosMap(new Map());
      return;
    }

    try {
      const cacheKey = buildUploadCacheKey(ferramentasUpload.id, "ferramentas");
      const version = buildUploadVersion({ checksum: ferramentasUpload.checksum, updatedAt: ferramentasUpload.updated_at, fileSize: ferramentasUpload.file_size });

      const cachedEntry = await cacheService.getEntry<Record<string, number>>(cacheKey);
      if (cachedEntry && cachedEntry.fileHash === version) {
        const mapFromCache = new Map<string, number>();
        for (const [key, value] of Object.entries(cachedEntry.data ?? {})) {
          mapFromCache.set(key, Number(value) || 0);
        }
        setAtivosMap(mapFromCache);
        return;
      }

      const buffer = await downloadAnalysisExcel(ferramentasUpload);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });

      const ativos = processFerramentasWorkbook(workbook, ferramentasUpload.header_row ?? 1);
      const serialized = Object.fromEntries(Array.from(ativos.entries()));
      await cacheService.setEntry(cacheKey, serialized, version);
      setAtivosMap(new Map(ativos));
    } catch (err) {
      console.error("Erro ao processar planilha de Ferramentas:", err);
      toast({
        title: "Falha ao processar Ferramentas",
        description: "Não foi possível ler a planilha de Ferramentas para contar itens ativos.",
        variant: "destructive",
      });
      setAtivosMap(new Map());
    }
  }, [ferramentasUpload, toast]);

  useEffect(() => {
    loadFerramentas();
  }, [loadFerramentas]);

  const periodRange = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);

  const periodEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (periodRange.start && entry.dataImplant < periodRange.start) return false;
      if (periodRange.end && entry.dataImplant > periodRange.end!) return false;
      return true;
    });
  }, [entries, periodRange]);

  const filteredEntries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return periodEntries.filter((entry) =>
      term ? entry.ferramenta.toLowerCase().includes(term) : true,
    );
  }, [periodEntries, searchTerm]);

  const aggregatedFerramentas = useMemo(() => computeAggregatedFerramenta(filteredEntries), [filteredEntries]);
  const aggregatedFerramentasWithAtivos = useMemo(() =>
    aggregatedFerramentas.map((item) => {
      const normalized = normalizeHeader(item.nome);
      const ativos = ativosMap.get(normalized) ?? 0;
      return { ...item, ativos };
    }),
  [aggregatedFerramentas, ativosMap]);

  const aggregatedFerramentasFiltered = useMemo(() =>
    abcFilter === "all"
      ? aggregatedFerramentasWithAtivos
      : aggregatedFerramentasWithAtivos.filter((item) => item.classe === abcFilter),
  [aggregatedFerramentasWithAtivos, abcFilter]);

  const totalVolume = filteredEntries.reduce((acc, item) => acc + item.volumeKg, 0);
  const totalPedidos = filteredEntries.length;
  const totalFerramentas = new Set(filteredEntries.map((item) => item.ferramenta)).size;
  const totalClientes = new Set(filteredEntries.map((item) => item.cliente)).size;

  if (isUploadingMeta) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">Carregando metadados...</div>;
  }

  if (!upload) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Carteira de Encomendas</CardTitle>
          <CardDescription>Envie a planilha de Carteira para habilitar as análises.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Garanta que os cabeçalhos contenham: Ferramenta, Data Implant, Pedido Kg e Cliente.
          </p>
          <Button onClick={onRequestUpload}>Enviar planilha da Carteira</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-4">
        <Card className="h-full border border-border/60">
          <CardHeader className="px-3 pt-2 pb-1 space-y-1">
            <CardDescription className="text-[11px] font-medium text-muted-foreground">Volume filtrado</CardDescription>
            <CardTitle className="text-base font-semibold leading-tight">{formatVolume(totalVolume)} kg</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 text-[11px] text-muted-foreground">
            {formatInteger(totalPedidos)} pedidos somados
          </CardContent>
        </Card>
        <Card className="h-full border border-border/60">
          <CardHeader className="px-3 pt-2 pb-1 space-y-1">
            <CardDescription className="text-[11px] font-medium text-muted-foreground">Ferramentas distintas</CardDescription>
            <CardTitle className="text-base font-semibold leading-tight">{formatInteger(totalFerramentas)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 text-[11px] text-muted-foreground">No recorte selecionado</CardContent>
        </Card>
        <Card className="h-full border border-border/60">
          <CardHeader className="px-3 pt-2 pb-1 space-y-1">
            <CardDescription className="text-[11px] font-medium text-muted-foreground">Clientes atendidos</CardDescription>
            <CardTitle className="text-base font-semibold leading-tight">{formatInteger(totalClientes)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 text-[11px] text-muted-foreground">Considerando filtros atuais</CardContent>
        </Card>
        <Card className="h-full border border-border/60">
          <CardHeader className="px-3 pt-2 pb-1 space-y-1">
            <CardDescription className="text-[11px] font-medium text-muted-foreground">Atualização</CardDescription>
            <CardTitle className="text-base font-semibold leading-tight">{formatDateBR(new Date(upload.updated_at))}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 text-[11px] text-muted-foreground truncate" title={upload.file_name}>
            {upload.file_name}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader
          className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg"
          onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[140px]">
              <CardTitle className="text-base">Filtros & Insights</CardTitle>
              <CardDescription className="text-xs">Clique para {isFiltersExpanded ? "recolher" : "expandir"}</CardDescription>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
              <div
                className="w-full max-w-xs sm:max-w-sm md:max-w-xs lg:max-w-sm"
                onClick={(event) => event.stopPropagation()}
              >
                <label className="sr-only" htmlFor="carteira-search-input">
                  Busca por ferramenta
                </label>
                <Input
                  id="carteira-search-input"
                  placeholder="Ex.: TP-8215/004"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <button
                type="button"
                className={`flex h-8 w-8 items-center justify-center rounded-full border border-input bg-card text-muted-foreground shadow-sm transition-transform ${isFiltersExpanded ? "rotate-180" : ""}`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </CardHeader>
        {isFiltersExpanded && (
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={period === "6m" ? "default" : "outline"} onClick={() => setPeriod("6m")}>6 meses</Button>
              <Button size="sm" variant={period === "12m" ? "default" : "outline"} onClick={() => setPeriod("12m")}>12 meses</Button>
              <Button size="sm" variant={period === "24m" ? "default" : "outline"} onClick={() => setPeriod("24m")}>24 meses</Button>
              <Button size="sm" variant={period === "60m" ? "default" : "outline"} onClick={() => setPeriod("60m")}>5 anos</Button>
              <Button size="sm" variant={period === "all" ? "default" : "outline"} onClick={() => setPeriod("all")}>Histórico completo</Button>
              <Button size="sm" variant={period === "custom" ? "default" : "outline"} onClick={() => setPeriod("custom")}>Personalizado</Button>
            </div>

            {period === "custom" && (
              <div className="grid grid-cols-2 gap-2 max-w-md">
                <Input type="date" value={customRange.start ?? ""} onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))} />
                <Input type="date" value={customRange.end ?? ""} onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))} />
              </div>
            )}

            <Separator />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Curva ABC</label>
                <Select value={abcFilter} onValueChange={(value: "all" | "A" | "B" | "C") => setAbcFilter(value)}>
                  <SelectTrigger><SelectValue placeholder="Classe" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="A">Classe A (até 80%)</SelectItem>
                    <SelectItem value="B">Classe B</SelectItem>
                    <SelectItem value="C">Classe C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <label className="text-sm font-semibold">Resumo rápido</label>
                <p>
                  Classe A concentra {formatDecimal(
                    aggregatedFerramentas
                      .filter((item) => item.classe === "A")
                      .reduce((acc, item) => acc + item.share, 0),
                  )}% do volume.
                </p>
                <p>
                  Total de ferramentas classe C: {formatInteger(
                    aggregatedFerramentas.filter((item) => item.classe === "C").length,
                  )}.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Curva ABC por Ferramenta</CardTitle>
          <CardDescription className="text-xs">Distribuição do volume de pedidos com classificação A/B/C.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground gap-2 p-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando planilha...
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/70 bg-destructive/10 p-4 text-destructive text-sm">
              {error}
            </div>
          ) : (
            <ScrollArea className="h-full">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="py-2 px-3">Ferramenta</TableHead>
                    <TableHead className="w-[100px] py-2 px-3">Volume (kg)</TableHead>
                    <TableHead className="w-[80px] py-2 px-3">Part. %</TableHead>
                    <TableHead className="w-[80px] py-2 px-3">Acum. %</TableHead>
                    <TableHead className="w-[80px] py-2 px-3">Classe</TableHead>
                    <TableHead className="w-[90px] py-2 px-3">Qtd. ativa</TableHead>
                    <TableHead className="w-[80px] py-2 px-3">Pedidos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedFerramentasFiltered.map((item) => (
                    <TableRow key={item.nome} className="hover:bg-muted/50">
                      <TableCell className="py-2 px-3 font-medium text-sm">{item.nome}</TableCell>
                      <TableCell className="py-2 px-3 text-sm">{formatVolume(item.volumeKg)}</TableCell>
                      <TableCell className="py-2 px-3 text-sm">{formatPercentage(item.share)}</TableCell>
                      <TableCell className="py-2 px-3 text-sm">{formatPercentage(item.cumulativeShare)}</TableCell>
                      <TableCell className="py-2 px-3">
                        <Badge 
                          variant={item.classe === "A" ? "default" : item.classe === "B" ? "secondary" : "outline"}
                          className="text-xs"
                        >
                          {item.classe}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 px-3 text-sm">{formatInteger(item.ativos)}</TableCell>
                      <TableCell className="py-2 px-3 text-sm">{formatInteger(item.pedidos)}</TableCell>
                    </TableRow>
                  ))}
                  {!aggregatedFerramentasFiltered.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-4 text-center text-sm text-muted-foreground">
                        Nenhuma ferramenta encontrada para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
