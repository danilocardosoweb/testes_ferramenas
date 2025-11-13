import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { Upload, BarChart3 } from "lucide-react";
import { FerramentaAnalysisDialog } from "./FerramentaAnalysisDialog";

// Tabela: analysis_producao
// Estrutura suposta: id uuid, payload jsonb, possivelmente metadados (__file_name, __uploaded_at)
// Colunas desejadas (imagem):
// Prensa, Data Produção, Turno, Ferramenta, Peso Bruto, Eficiência, Produtividade,
// Cod Parada, Liga Utilizada, Fornecedor, Observação Lote

type RawRow = {
  id: string;
  payload: Record<string, any> | null;
};

type ViewRow = {
  Prensa: string | number | null;
  "Data Produção": string | null; // DD/MM/AAAA
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

interface AnalysisProducaoProps {
  onSelectMatriz?: (matriz: string) => void;
  presetMatriz?: string;
}

function dateToISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateBRLocal(iso?: string) {
  if (!iso) return "-";
  const s = String(iso);
  const yyyy = s.slice(0, 4);
  const mm = s.slice(5, 7);
  const dd = s.slice(8, 10);
  if (!yyyy || !mm || !dd) return "-";
  return `${dd}/${mm}/${yyyy}`;
}

function isoDateKey(iso: string | null | undefined): number {
  if (!iso) return 0;
  const s = String(iso);
  // esperado YYYY-MM-DD
  const yyyy = parseInt(s.slice(0, 4), 10);
  const mm = parseInt(s.slice(5, 7), 10);
  const dd = parseInt(s.slice(8, 10), 10);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return 0;
  return yyyy * 10000 + (mm || 0) * 100 + (dd || 0);
}

function dateKey(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const s = String(dateStr);
  // esperado DD/MM/AAAA
  const dd = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(3, 5), 10);
  const yyyy = parseInt(s.slice(6, 10), 10);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return 0;
  return yyyy * 10000 + (mm || 0) * 100 + (dd || 0);
}

export function AnalysisProducaoView({ onSelectMatriz, presetMatriz }: AnalysisProducaoProps) {
  const [rows, setRows] = useState<ViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchSize] = useState(200);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [periodStart, setPeriodStart] = useState<string>(() => {
    const today = new Date();
    const from = new Date(today);
    from.setFullYear(from.getFullYear() - 1);
    return dateToISO(from);
  });
  const [periodEnd, setPeriodEnd] = useState<string>(() => dateToISO(new Date()));
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [matrizFilter, setMatrizFilter] = useState<string>("");
  const [prensaFilter, setPrensaFilter] = useState<string>("");
  const [seqFilter, setSeqFilter] = useState<string>("Todas");
  const [prodMin, setProdMin] = useState<string>("");
  const [prodMax, setProdMax] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [dbMinDate, setDbMinDate] = useState<string | undefined>(undefined);
  const [dbMaxDate, setDbMaxDate] = useState<string | undefined>(undefined);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reimportar o mesmo arquivo
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
      try {
        const minQ = await supabase
          .from("analysis_producao")
          .select("produced_on")
          .not("produced_on", "is", null)
          .order("produced_on", { ascending: true })
          .limit(1);
        const maxQ = await supabase
          .from("analysis_producao")
          .select("produced_on")
          .not("produced_on", "is", null)
          .order("produced_on", { ascending: false })
          .limit(1);
        setDbMinDate((minQ.data?.[0] as any)?.produced_on?.slice(0, 10));
        setDbMaxDate((maxQ.data?.[0] as any)?.produced_on?.slice(0, 10));
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
    let active = true;
    async function loadDbPeriod() {
      try {
        const minQ = await supabase
          .from("analysis_producao")
          .select("produced_on")
          .not("produced_on", "is", null)
          .order("produced_on", { ascending: true })
          .limit(1);
        const maxQ = await supabase
          .from("analysis_producao")
          .select("produced_on")
          .not("produced_on", "is", null)
          .order("produced_on", { ascending: false })
          .limit(1);
        if (!active) return;
        setDbMinDate((minQ.data?.[0] as any)?.produced_on?.slice(0, 10));
        setDbMaxDate((maxQ.data?.[0] as any)?.produced_on?.slice(0, 10));
      } catch {}
    }
    loadDbPeriod();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (presetMatriz && presetMatriz !== matrizFilter) {
      setMatrizFilter(presetMatriz);
    }
  }, [presetMatriz]);

  useEffect(() => {
    let active = true;
    async function loadFirst() {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("analysis_producao")
          .select("id,payload", { count: "planned" as any })
          .order("produced_on", { ascending: false })
          .range(0, batchSize - 1);
        if (matrizFilter.trim()) query = query.ilike("payload->>Ferramenta", `%${matrizFilter.trim()}%`);
        if (prensaFilter.trim()) query = query.ilike("payload->>Prensa", `%${prensaFilter.trim()}%`);
        if (seqFilter !== "Todas" && seqFilter.trim()) query = query.ilike("payload->>Ferramenta", `%/${seqFilter.trim()}`);
        if (periodStart) query = query.gte("produced_on", periodStart);
        if (periodEnd) query = query.lte("produced_on", periodEnd);
        const { data, error, count } = await query;
        if (error) throw error;
        if (!active) return;
        const mapped = (data as RawRow[] | null | undefined)?.map(mapRow) ?? [];
        setRows(mapped);
        setTotal(typeof count === "number" ? count : null);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? String(e));
        setRows([]);
        setTotal(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadFirst();
    return () => {
      active = false;
    };
  }, [batchSize, matrizFilter, prensaFilter, seqFilter, periodStart, periodEnd, reloadKey]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const from = rows.length;
      const to = from + batchSize - 1;
      let query = supabase
        .from("analysis_producao")
        .select("id,payload")
        .order("produced_on", { ascending: false })
        .range(from, to);
      if (matrizFilter.trim()) query = query.ilike("payload->>Ferramenta", `%${matrizFilter.trim()}%`);
      if (prensaFilter.trim()) query = query.ilike("payload->>Prensa", `%${prensaFilter.trim()}%`);
      if (seqFilter !== "Todas" && seqFilter.trim()) query = query.ilike("payload->>Ferramenta", `%/${seqFilter.trim()}`);
      if (periodStart) query = query.gte("produced_on", periodStart);
      if (periodEnd) query = query.lte("produced_on", periodEnd);
      const { data, error } = await query;
      if (error) throw error;
      const mapped = (data as RawRow[] | null | undefined)?.map(mapRow) ?? [];
      setRows((prev) => [...prev, ...mapped]);
    } catch (e) {
      // silencioso
    } finally {
      setLoadingMore(false);
    }
  }

  const columns = useMemo(
    () => [
      "Prensa",
      "Data Produção",
      "Turno",
      "Matriz",
      "Seq",
      "Peso Bruto",
      "Eficiência",
      "Produtividade",
      "Cod Parada",
      "Liga Utilizada",
      "Observação Lote",
    ] as (keyof ViewRow)[],
    [],
  );

  const filtered = useMemo(() => {
    const m = monthFilter.trim();
    const mf = matrizFilter.trim().toLowerCase();
    const pf = prensaFilter.trim().toLowerCase();
    const min = prodMin.trim() ? Number(prodMin.replace(",",".")) : NaN;
    const max = prodMax.trim() ? Number(prodMax.replace(",",".")) : NaN;
    const ps = periodStart.trim();
    const pe = periodEnd.trim();
    const ks = ps ? isoDateKey(ps) : 0;
    const ke = pe ? isoDateKey(pe) : Number.POSITIVE_INFINITY;

    const subset = rows.filter((r) => {
      // Data Produção no formato DD/MM/AAAA
      const dk = dateKey(r["Data Produção"]);
      if (ps && dk < ks) return false;
      if (pe && dk > ke) return false;
      if (m) {
        const mm = (r["Data Produção"] || "").toString().slice(3, 5);
        if (mm !== m.padStart(2, "0")) return false;
      }
      if (mf && !(r.Matriz || "").toString().toLowerCase().includes(mf)) return false;
      if (pf && !(r.Prensa ?? "").toString().toLowerCase().includes(pf)) return false;
      if (seqFilter !== "Todas") {
        if ((r.Seq ?? "").toString().trim() !== seqFilter.trim()) return false;
      }
      if (!Number.isNaN(min) || !Number.isNaN(max)) {
        const val = Number(r["Produtividade"]);
        if (!Number.isFinite(val)) return false;
        if (!Number.isNaN(min) && val < min) return false;
        if (!Number.isNaN(max) && val > max) return false;
      }
      return true;
    });
    return subset
      .slice()
      .sort((a, b) => dateKey(b["Data Produção"]) - dateKey(a["Data Produção"]));
  }, [rows, periodStart, periodEnd, monthFilter, matrizFilter, prensaFilter, seqFilter, prodMin, prodMax]);

  const seqOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = (r.Seq ?? "").toString().trim();
      if (v) set.add(v);
    }
    return ["Todas", ...Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [rows]);

  const prensaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = (r.Prensa ?? "").toString().trim();
      if (v) set.add(v);
    }
    return ["", ...Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [rows]);

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-end gap-2 justify-between">
        <div className="flex flex-wrap items-end gap-2 flex-1 min-w-0">
          <div className="flex items-end gap-2 pr-3 border-r border-border/40">
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Dados no banco</label>
              <div className="h-9 flex items-center text-sm text-muted-foreground">
                {dbMinDate ? formatDateBRLocal(dbMinDate) : '-'}
                <span className="mx-1">—</span>
                {dbMaxDate ? formatDateBRLocal(dbMaxDate) : '-'}
              </div>
            </div>
          </div>
          <div className="flex items-end gap-1.5">
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Período (De)</label>
              <input
                type="date"
                className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Até</label>
              <input
                type="date"
                className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground">Mês</label>
            <select
              className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="01">Janeiro</option>
              <option value="02">Fevereiro</option>
              <option value="03">Março</option>
              <option value="04">Abril</option>
              <option value="05">Maio</option>
              <option value="06">Junho</option>
              <option value="07">Julho</option>
              <option value="08">Agosto</option>
              <option value="09">Setembro</option>
              <option value="10">Outubro</option>
              <option value="11">Novembro</option>
              <option value="12">Dezembro</option>
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
              {prensaOptions.map((p) => (
                p !== "" ? <option key={p} value={p}>{p}</option> : null
              ))}
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
              <label className="text-xs text-muted-foreground">Produtividade mín.</label>
              <input
                className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
                placeholder="Ex.: 500"
                value={prodMin}
                onChange={(e) => setProdMin(e.target.value)}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">máx.</label>
              <input
                className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
                placeholder="Ex.: 1500"
                value={prodMax}
                onChange={(e) => setProdMax(e.target.value)}
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
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            onClick={() => setAnalysisOpen(true)}
            disabled={filtered.length === 0}
          >
            <BarChart3 className="h-4 w-4" />
            Analisar Ferramenta
          </button>
        </div>
      </div>
      <div className="overflow-auto">
        {importMsg && (
          <div className="mb-2 text-xs text-muted-foreground flex items-center gap-3">
            <span>{importMsg}</span>
            {importing || importProgress > 0 ? (
              <div className="h-2 w-40 rounded bg-muted">
                <div
                  className="h-2 rounded bg-primary"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            ) : null}
          </div>
        )}
        {loading && <div className="mt-2 text-sm text-muted-foreground">Carregando…</div>}
        {error && <div className="mt-2 text-sm text-red-600">Erro: {error}</div>}
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
                {columns.map((c) => (
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
            className="h-8 rounded-md border px-3 text-sm disabled:opacity-50"
            onClick={loadMore}
            disabled={loadingMore || total == null || rows.length >= total}
          >
            {loadingMore ? "Carregando..." : rows.length >= (total ?? 0) ? "Tudo carregado" : "Carregar mais"}
          </button>
        </div>
      </div>
      
      <FerramentaAnalysisDialog
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        data={filtered}
        matrizFilter={matrizFilter}
      />
    </div>
  );
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
        "Prensa": r["Prensa"] ?? null,
        "Data Produção": r["Data Produção"] ?? r["Data Producao"] ?? null,
        "Turno": r["Turno"] ?? null,
        "Ferramenta": ferramenta ?? null,
        "Peso Bruto": r["Peso Bruto"] ?? null,
        "Eficiência": r["Eficiência"] ?? r["Eficiencia"] ?? null,
        "Produtividade": r["Produtividade"] ?? null,
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

async function insertBatches(records: any[], batch = 1000) {
  for (let i = 0; i < records.length; i += batch) {
    const chunk = records.slice(i, i + batch);
    const { error } = await supabase.from("analysis_producao").insert(chunk);
    if (error) throw error;
  }
}


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

function headerClass(col: keyof ViewRow): string {
  switch (col) {
    case "Prensa":
      return "w-20 text-left";
    case "Data Produção":
      return "w-28 text-right";
    case "Turno":
      return "w-20 text-left";
    case "Matriz":
      return "w-28 text-left";
    case "Seq":
      return "w-16 text-center";
    case "Peso Bruto":
    case "Eficiência":
    case "Produtividade":
      return "w-24 text-right";
    case "Cod Parada":
      return "w-32 text-left";
    case "Liga Utilizada":
      return "w-28 text-left";
    case "Observação Lote":
      return "w-[28rem] text-left";
    default:
      return "text-left";
  }
}

function cellClass(col: keyof ViewRow): string {
  switch (col) {
    case "Data Produção":
      return "text-right";
    case "Seq":
      return "text-center";
    case "Peso Bruto":
    case "Eficiência":
    case "Produtividade":
      return "text-right tabular-nums";
    default:
      return "text-left";
  }
}

function formatCell(row: ViewRow, col: keyof ViewRow) {
  const v: any = row[col];
  if (v == null || v === "") return "";
  if (col === "Peso Bruto" || col === "Eficiência" || col === "Produtividade") {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    const frac = col === "Eficiência" ? 2 : 2;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: frac, maximumFractionDigits: frac });
  }
  return String(v);
}

// Excel serial date -> DD/MM/AAAA (quando vier numérico)
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
