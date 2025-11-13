import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

  useEffect(() => {
    if (presetMatriz && presetMatriz !== matrizFilter) {
      setMatrizFilter(presetMatriz);
    }
  }, [presetMatriz]);

  useEffect(() => {
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
  }, [ativaFilter, matrizFilter, batchSize]);

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
        {stats && (
          <div className="mb-1 text-xs text-muted-foreground">
            <span className="mr-3">
              <strong>Maior Qte.Prod.:</strong> {formatNumberPtBR(stats.max)}
            </span>
            <span className="mr-3">
              <strong>Menor Qte.Prod.:</strong> {formatNumberPtBR(stats.min)}
            </span>
            <span>
              <strong>Mediana Qte.Prod.:</strong> {formatNumberPtBR(stats.median)}
            </span>
          </div>
        )}
      </div>
      <div className="overflow-auto">
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
