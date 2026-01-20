import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { Upload, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";

type RawRow = {
  id: string;
  ferramenta_code?: string | null;
  ferramenta_seq?: string | null;
  payload: Record<string, any> | null;
};

type ViewRow = {
  Matriz: string;
  Seq: number | string | null;
  "Qte.Prod.": number | string | null;
  "Status da Ferram.": string | null;
  Ativa: string | null;
  "Dt.Entrega": string | null; // já formatada DD/MM/AAAA
  "Data Uso": string | null; // já formatada DD/MM/AAAA
};

interface AnalysisFerramentasProps {
  presetMatriz?: string;
  onSelectMatriz?: (matriz: string) => void;
}

async function parseFerramentasWorkbook(file: File) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
  return rows.map((r) => ({
    payload: {
      "Matriz": r["Matriz"] ?? r["Ferramenta"] ?? null,
      "Seq": r["Seq"] ?? null,
      "Qte.Prod.": r["Qte.Prod."] ?? r["Qte Prod"] ?? r["Qte_Prod"] ?? null,
      "Status da Ferram.": r["Status da Ferram."] ?? r["Status"] ?? null,
      "Ativa": r["Ativa"] ?? null,
      "Dt.Entrega": r["Dt.Entrega"] ?? r["Data Entrega"] ?? null,
      "Data Uso": r["Data Uso"] ?? null,
      // Inclui localização de estoque (Box) com vários aliases comuns
      "Box": r["Box"] ?? r["BOX"] ?? r["Box Atual"] ?? r["BoxAtual"] ?? r["Local"] ?? r["Localizacao"] ?? r["Localização"] ?? r["Posição"] ?? r["Posicao"] ?? null,
      // Vida/Necessidade de Nitretação para acompanhamento
      "Vd Nitret": r["Vd Nitret"] ?? r["Vd Nitretação"] ?? r["Vida Nitretação"] ?? r["Vida Nitret"] ?? r["Vd.Nitret"] ?? r["Vd_Nitret"] ?? null,
      "Diametro": r["Diametro"] ?? r["Diâmetro"] ?? r["Diametro (mm)"] ?? r["Diâmetro (mm)"] ?? r["Diametro mm"] ?? r["Diâmetro mm"] ?? null,
      // Campos para preenchimento automático em Confecção
      "Corretor": r["Corretor"] ?? r["Fornecedor"] ?? r["Fabricante"] ?? null,
      "Medida Pacote": r["Medida Pacote"] ?? r["MedidaPacote"] ?? r["Pacote"] ?? r["Medida"] ?? null,
      "Furos": r["Furos"] ?? r["QTD Furos"] ?? r["Qtd Furos"] ?? r["Qte.Furos"] ?? r["Nº Furos"] ?? r["N Furos"] ?? null,
    },
  }));
}

async function deleteAllFerramentas() {
  const { error: rpcErr } = await supabase.rpc("analysis_ferramentas_truncate");
  if (!rpcErr) return;
  const { error: delErr } = await supabase
    .from("analysis_ferramentas")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw delErr;
}

export function AnalysisFerramentasView({ presetMatriz, onSelectMatriz }: AnalysisFerramentasProps) {
  const [rows, setRows] = useState<ViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ativaFilter, setAtivaFilter] = useState<"Todas" | "Sim" | "Não">("Sim");
  const [matrizFilter, setMatrizFilter] = useState("");
  const [batchSize] = useState(200);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("Todas");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string>("");
  const [importProgress, setImportProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [lastUpdatedISO, setLastUpdatedISO] = useState<string | undefined>(undefined);

  function formatDateBRLocal(iso?: string) {
    if (!iso) return "-";
    const s = String(iso);
    const yyyy = s.slice(0, 4);
    const mm = s.slice(5, 7);
    const dd = s.slice(8, 10);
    if (!yyyy || !mm || !dd) return "-";
    return `${dd}/${mm}/${yyyy}`;
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImporting(true);
      setImportMsg("Lendo planilha...");
      const records = await parseFerramentasWorkbook(file);
      setImportProgress(0);
      setImportMsg(`Encontradas ${records.length.toLocaleString("pt-BR")} linhas. Limpando tabela...`);
      await deleteAllFerramentas();
      setImportMsg("Inserindo registros em lotes...");
      const batch = 500;
      const totalBatches = Math.ceil(records.length / batch) || 1;
      for (let i = 0; i < totalBatches; i++) {
        const start = i * batch;
        const chunk = records.slice(start, start + batch);
        const { error } = await supabase.from("analysis_ferramentas").insert(chunk);
        if (error) throw error;
        setImportProgress(Math.round(((i + 1) / totalBatches) * 100));
      }
      setImportMsg("Importação concluída.");
      setReloadKey((k) => k + 1);
      try {
        const { data: maxUp } = await supabase
          .from("analysis_ferramentas")
          .select("__uploaded_at")
          .not("__uploaded_at", "is", null)
          .order("__uploaded_at", { ascending: false })
          .limit(1);
        setLastUpdatedISO((maxUp?.[0] as any)?.__uploaded_at?.slice(0, 10));
      } catch {}
    } catch (err: any) {
      setImportMsg(`Erro na importação: ${err?.message ?? String(err)}`);
    } finally {
      setImporting(false);
      setTimeout(() => setImportMsg(""), 5000);
      setTimeout(() => setImportProgress(0), 5000);
    }
  };

  useEffect(() => {
    if (presetMatriz && presetMatriz !== matrizFilter) {
      setMatrizFilter(presetMatriz);
    }
  }, [presetMatriz]);

  useEffect(() => {
    // Busca a última atualização armazenada no banco
    (async () => {
      try {
        const { data: maxUp } = await supabase
          .from("analysis_ferramentas")
          .select("__uploaded_at")
          .not("__uploaded_at", "is", null)
          .order("__uploaded_at", { ascending: false })
          .limit(1);
        setLastUpdatedISO((maxUp?.[0] as any)?.__uploaded_at?.slice(0, 10));
      } catch {}
    })();

    let active = true;
    async function loadFirstPage() {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("analysis_ferramentas")
          .select("id,ferramenta_code,ferramenta_seq,payload", { count: "exact" })
          .range(0, batchSize - 1);
        if (ativaFilter !== "Todas") query = query.eq("payload->>Ativa", ativaFilter);
        if (matrizFilter.trim()) query = query.ilike("payload->>Matriz", `%${matrizFilter.trim()}%`);
        const { data, error, count } = await query;
        if (!active) return;
        if (error) throw error;
        const mapped = (data as RawRow[] | null | undefined)?.map((r) => mapRow(r)) ?? [];
        setRows(mapped);
        setTotal(typeof count === "number" ? count : null);
      } catch (e: any) {
        setError(e?.message ?? String(e));
        setRows([]);
        setTotal(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadFirstPage();
    return () => {
      active = false;
    };
  }, [ativaFilter, matrizFilter, batchSize, reloadKey]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const from = rows.length;
      const to = from + batchSize - 1;
      let query = supabase
        .from("analysis_ferramentas")
        .select("id,ferramenta_code,ferramenta_seq,payload")
        .range(from, to);
      if (ativaFilter !== "Todas") query = query.eq("payload->>Ativa", ativaFilter);
      if (matrizFilter.trim()) query = query.ilike("payload->>Matriz", `%${matrizFilter.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      const mapped = (data as RawRow[] | null | undefined)?.map((r) => mapRow(r)) ?? [];
      setRows((prev) => [...prev, ...mapped]);
    } catch (e) {
      // manter erro silencioso no loadMore para não quebrar UI
    } finally {
      setLoadingMore(false);
    }
  }

  const columns = useMemo(
    () => [
      "Matriz",
      "Seq",
      "Qte.Prod.",
      "Status da Ferram.",
      "Ativa",
      "Dt.Entrega",
      "Data Uso",
    ] as (keyof ViewRow)[],
    [],
  );

  const filtered = useMemo(() => {
    if (statusFilter === "Todas") return rows;
    const target = normalizeStatus(statusFilter);
    return rows.filter((r) => normalizeStatus(r["Status da Ferram."] || "") === target);
  }, [rows, statusFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const raw = r["Status da Ferram."]?.toString();
      const norm = normalizeStatus(raw || "");
      if (norm) set.add(norm);
    }
    return ["Todas", ...Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [rows]);

  const stats = useMemo(() => {
    const values = filtered
      .map((r) => Number(r["Qte.Prod."]))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (values.length === 0) return null;
    const min = values[0];
    const max = values[values.length - 1];
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    return { min, max, median };
  }, [filtered]);

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-2 pr-3 border-r border-border/40">
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Última atualização</label>
            <div className="h-9 flex items-center text-sm text-muted-foreground">
              {formatDateBRLocal(lastUpdatedISO)}
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Ativa</label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={ativaFilter}
            onChange={(e) => setAtivaFilter(e.target.value as any)}
          >
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
            <option value="Todas">Todas</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Status da Ferram.</label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Matriz</label>
          <input
            type="text"
            placeholder="Ex.: 19-0065"
            className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
            value={matrizFilter}
            onChange={(e) => setMatrizFilter(e.target.value)}
          />
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
        {stats && (
          <div className="mb-1 ml-auto flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <div className="inline-flex items-center rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-700 mr-1" />
              <span className="font-semibold mr-1.5 text-emerald-800">Maior Qte.Prod.:</span>
              <span className="tabular-nums text-emerald-800">{formatNumberPtBR(stats.max)}</span>
            </div>
            <div className="inline-flex items-center rounded-full border border-slate-400/40 bg-slate-500/10 px-2.5 py-1">
              <ArrowDownRight className="h-3.5 w-3.5 text-slate-700 mr-1" />
              <span className="font-semibold mr-1.5 text-slate-800">Menor Qte.Prod.:</span>
              <span className="tabular-nums text-slate-800">{formatNumberPtBR(stats.min)}</span>
            </div>
            <div className="inline-flex items-center rounded-full border border-blue-600/30 bg-blue-500/10 px-2.5 py-1">
              <Activity className="h-3.5 w-3.5 text-blue-700 mr-1" />
              <span className="font-semibold mr-1.5 text-blue-800">Mediana Qte.Prod.:</span>
              <span className="tabular-nums text-blue-800">{formatNumberPtBR(stats.median)}</span>
            </div>
          </div>
        )}
        {importMsg && (
          <div className="mb-2 text-xs text-muted-foreground flex items-center gap-3">
            <span>{importMsg}</span>
            {(importing || importProgress > 0) ? (
              <div className="h-2 w-40 rounded bg-muted">
                <div className="h-2 rounded bg-primary" style={{ width: `${importProgress}%` }} />
              </div>
            ) : null}
          </div>
        )}
        {loading && (
          <div className="mt-2 text-sm text-muted-foreground">Carregando…</div>
        )}
        {error && (
          <div className="mt-2 text-sm text-red-600">Erro: {error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="mt-2 text-sm text-muted-foreground">Nenhum dado encontrado.</div>
        )}
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  className={
                    "sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground border-b " +
                    headerClass(c)
                  }
                >
                  {c}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => (
            <tr key={i} className="hover:bg-muted/40">
              {columns.map((c: keyof ViewRow) => (
                <td key={c} className={"px-2 py-1.5 border-b align-top " + cellClass(c)}>
                  {c === "Matriz" && r.Matriz ? (
                    <button
                      type="button"
                      className="block w-full truncate text-left text-primary hover:underline"
                      title={String(r.Matriz)}
                      onClick={() => onSelectMatriz && onSelectMatriz(String(r.Matriz))}
                    >
                      {String(r.Matriz)}
                    </button>
                  ) : (
                    <span className="block truncate" title={String(formatCell(r, c))}>
                      {formatCell(r, c)}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Exibindo {filtered.length} de {total ?? "?"} registros.</span>
        <button
          className="ml-4 h-8 rounded-md border px-3 text-sm disabled:opacity-50"
          onClick={loadMore}
          disabled={loadingMore || total == null || filtered.length >= total}
        >
          {loadingMore ? "Carregando..." : filtered.length >= (total ?? 0) ? "Tudo carregado" : "Carregar mais"}
        </button>
      </div>
      </div>
    </div>
  );
}

function headerClass(col: keyof ViewRow): string {
  switch (col) {
    case "Matriz":
      return "w-28 text-left";
    case "Seq":
      return "w-14 text-center";
    case "Qte.Prod.":
      return "w-24 text-right";
    case "Status da Ferram.":
      return "w-56 text-left";
    case "Ativa":
      return "w-14 text-center";
    case "Dt.Entrega":
      return "w-24 text-right";
    case "Data Uso":
      return "w-24 text-right";
    default:
      return "text-left";
  }
}

function cellClass(col: keyof ViewRow): string {
  switch (col) {
    case "Matriz":
      return "text-left";
    case "Seq":
      return "text-center";
    case "Qte.Prod.":
      return "text-right tabular-nums";
    case "Status da Ferram.":
      return "text-left";
    case "Ativa":
      return "text-center";
    case "Dt.Entrega":
    case "Data Uso":
      return "text-right";
    default:
      return "text-left";
  }
}

function normalizeStatus(s: string): string {
  return s
    ? s
        .toString()
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase()
    : "";
}

function mapRow(r: RawRow): ViewRow {
  const p = r.payload || {};
  const matriz = p["Matriz"] ?? "";
  const seq = p["Seq"] ?? r.ferramenta_seq ?? null;
  const qte = p["Qte.Prod."] ?? null;
  const status = p["Status da Ferram."] ?? null;
  const ativa = p["Ativa"] ?? null;
  const dtEntrega = excelToDateStr(p["Dt.Entrega"]);
  const dataUso = excelToDateStr(p["Data Uso"]);
  return {
    Matriz: matriz,
    Seq: seq,
    "Qte.Prod.": qte,
    "Status da Ferram.": status,
    Ativa: ativa,
    "Dt.Entrega": dtEntrega,
    "Data Uso": dataUso,
  };
}

function formatCell(row: ViewRow, col: keyof ViewRow) {
  const v = row[col];
  if (v == null || v === "") return "";
  if (col === "Qte.Prod.") return formatNumberPtBR(Number(v));
  return String(v);
}

function formatNumberPtBR(n: number) {
  if (!isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Excel serial date (dias desde 1899-12-30 no Windows). Aceita número ou string numérica.
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
