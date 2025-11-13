import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload } from "lucide-react";
import * as XLSX from "xlsx";

// Aliases para mapear colunas mesmo com pequenas diferenças de nomes
const ALIASES = {
  ferramenta: ["Ferramenta", "ferramenta", "Matriz", "matriz", "Codigo", "Código", "codigo", "código"],
  pedidoKg: ["Pedido Kg", "pedido kg", "Kg", "kg", "Pedido", "pedido", "Volume", "volume"],
  cliente: ["Cliente", "cliente", "Nome do Cliente", "nome do cliente"],
  liga: ["Liga", "liga"],
  tempera: ["Têmpera", "Tempera", "têmpera", "tempera"],
  data: [
    "Data", "Data Implant", "Data Implant Item", "Dt Implant", "Dt Implant Item",
    "Data Impl.", "Data Impl", "Dt Impl.", "Dt Impl",
    "Data Pedido", "Dt Pedido",
    "data", "data implant", "data implant item", "data pedido", "data impl.", "data impl"
  ],
};

type DbRow = Record<string, any>;

type Item = {
  ferramenta: string;
  pedidoKg: number;
  cliente?: string;
  dateISO?: string;
  avg6m?: number;
  avg12m?: number;
  pedidoCount?: number;
  clienteCount?: number;
};

function norm(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumberBR(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = String(v).trim();
  const t = s.replace(/\s/g, "");
  if (/^[-+]?\d+$/.test(t)) return Number.parseFloat(t);
  if (t.includes(',') && t.includes('.')) {
    const lc = t.lastIndexOf(',');
    const ld = t.lastIndexOf('.');
    if (lc > ld) {
      const clean = t.replace(/\./g, '').replace(',', '.');
      const n = Number.parseFloat(clean);
      return Number.isNaN(n) ? null : n;
    } else {
      const clean = t.replace(/,/g, '');
      const n = Number.parseFloat(clean);
      return Number.isNaN(n) ? null : n;
    }
  }
  if (t.includes(',')) {
    const n = Number.parseFloat(t.replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }
  if (t.includes('.')) {
    const n = Number.parseFloat(t);
    return Number.isNaN(n) ? null : n;
  }
  const n = Number.parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

function pickValue(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (k in obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function mapRow(r: DbRow): Item | null {
  // Leitura direta da tabela plana
  const ferramenta = (r as any)?.ferramenta ?? pickValue(r, ALIASES.ferramenta);
  const cliente = (r as any)?.cliente ?? pickValue(r, ALIASES.cliente);
  const pedidoRaw = (r as any)?.pedido_kg ?? pickValue(r, ALIASES.pedidoKg);
  const dataImpl = (r as any)?.data_implant as string | null | undefined;
  if (!ferramenta) return null;
  const n = typeof pedidoRaw === 'number' ? (Number.isFinite(pedidoRaw) ? pedidoRaw : null) : parseNumberBR(pedidoRaw);
  if (n == null) return null;
  let dateISO: string | undefined;
  if (dataImpl) {
    const s = String(dataImpl);
    dateISO = s.length >= 10 ? s.slice(0,10) : undefined;
  }
  return {
    ferramenta: String(ferramenta).trim(),
    pedidoKg: n,
    cliente: cliente ? String(cliente).trim() : undefined,
    dateISO,
  };
}

function formatDecimal(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPerc(n: number) {
  return `${formatDecimal(n)}%`;
}

function formatDateBRLocal(iso?: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map((v) => Number(v));
  if (!y || !m || !d) return "-";
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
}

export function AnalysisCarteiraView() {
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importProgress, setImportProgress] = useState<number>(0);
  const fileInputId = "carteira-file-upload";

  // Filtros
  const [fCliente, setFCliente] = useState("");
  const [fFerramenta, setFFerramenta] = useState("");
  const [abcFilter, setAbcFilter] = useState<"all" | "A" | "B" | "C">("all");
  // Período (com data_implant)
  const [periodStart, setPeriodStart] = useState<string>(() => "2024-01-01");
  const [periodEnd, setPeriodEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  // Período disponível no banco (data mais antiga e mais recente)
  const [dbMinDate, setDbMinDate] = useState<string | undefined>(undefined);
  const [dbMaxDate, setDbMaxDate] = useState<string | undefined>(undefined);

  // Carrega a menor e a maior data armazenadas no banco para Carteira (tabela plana)
  useEffect(() => {
    let active = true;
    async function loadDbPeriod() {
      try {
        // Menor data
        const minQ = await supabase
          .from('analysis_carteira_flat')
          .select('data_implant')
          .not('data_implant', 'is', null)
          .order('data_implant', { ascending: true })
          .limit(1);
        // Maior data
        const maxQ = await supabase
          .from('analysis_carteira_flat')
          .select('data_implant')
          .not('data_implant', 'is', null)
          .order('data_implant', { ascending: false })
          .limit(1);
        if (!active) return;
        const minIso = minQ.data?.[0]?.data_implant as string | undefined;
        const maxIso = maxQ.data?.[0]?.data_implant as string | undefined;
        setDbMinDate(minIso?.slice(0, 10));
        setDbMaxDate(maxIso?.slice(0, 10));
      } catch (e) {
        // Silencia erro para não atrapalhar a UX
      }
    }
    loadDbPeriod();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      console.log(`[Carteira] Iniciando carregamento (AGG no banco) Período: ${periodStart} até ${periodEnd}`);
      setLoading(true);
      setError(null);
      try {
        // Usar RPC para agregar no servidor evitando limites de paginação
        const { data, error } = await supabase.rpc('analysis_carteira_flat_agg', {
          period_start: periodStart || null,
          period_end: periodEnd || null,
          ferramenta_filter: fFerramenta.trim() || null,
          cliente_filter: fCliente.trim() || null,
        });
        if (error) throw error;

        // Converter resultados agregados em linhas
        let mapped: Item[] = (data ?? []).map((r: any) => ({
          ferramenta: String(r.ferramenta).trim(),
          pedidoKg: typeof r.pedido_kg_sum === 'number' ? r.pedido_kg_sum : parseNumberBR(r.pedido_kg_sum),
          avg6m: typeof r.avg6m === 'number' ? r.avg6m : parseNumberBR(r.avg6m),
          avg12m: typeof r.avg12m === 'number' ? r.avg12m : parseNumberBR(r.avg12m),
          pedidoCount: typeof r.pedido_count === 'number' ? r.pedido_count : (r.pedido_count != null ? Number(r.pedido_count) : undefined),
          clienteCount: typeof r.cliente_count === 'number' ? r.cliente_count : (r.cliente_count != null ? Number(r.cliente_count) : undefined),
        })).filter((x: any) => x && x.ferramenta && x.pedidoKg != null);
        // Logs de verificação
        const tr0100 = mapped.filter(r => r.ferramenta.toUpperCase().includes('TR-0100'));
        if (tr0100.length > 0) {
          const total = tr0100.reduce((sum, r) => sum + r.pedidoKg, 0);
          console.log(`[Carteira] TR-0100 (AGG banco): ${tr0100.length} registros, total: ${total} kg`);
        }
        console.log(`[Carteira] Total final (AGG banco): ${mapped.length} ferramentas agregadas`);
        if (!active) return;
        setRows(mapped);
      } catch (e: any) {
        if (!active) return;
        const msg = e?.message ?? String(e);
        if (false) {
          try {
            const { data: fallback2, error: err2 } = await supabase
              .from("analysis_carteira")
              .select("id,payload,implanted_on")
              .limit(20000);
            if (err2) throw err2;
            const mapped = (fallback2 ?? []).map(mapRow).filter(Boolean) as Item[];
            setImportMsg("Sem coluna computed_on na VIEW. Exibindo sem filtro de período.");
            setRows(mapped);
            setError(null);
          } catch (e2: any) {
            setError(e2?.message ?? String(e2));
            setRows([]);
          }
        } else {
          setError(msg);
          setRows([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [fFerramenta, fCliente, periodStart, periodEnd]);

  async function handleUploadFile(file: File) {
    try {
      setImporting(true);
      setImportMsg("Lendo planilha...");
      setImportProgress(0);
      const fileBuffer = await file.arrayBuffer();
      const wb = XLSX.read(fileBuffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: null });
      if (!Array.isArray(json) || json.length === 0) throw new Error("Arquivo vazio");

      // Mapear cabeçalhos (varre várias linhas para garantir chaves)
      const headersSet = new Set<string>();
      for (const r of json as Array<Record<string, any>>) {
        for (const k of Object.keys(r)) headersSet.add(k);
        if (headersSet.size > 200) break;
      }
      const headers = Array.from(headersSet);
      const findHeader = (cands: string[]): string | null => {
        const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const hnorm = headers.map(h => ({ h, n: norm(h) }));
        for (const c of cands) {
          const exact = hnorm.find(x => x.n === norm(c));
          if (exact) return exact.h;
        }
        for (const c of cands) {
          const part = hnorm.find(x => x.n.includes(norm(c)));
          if (part) return part.h;
        }
        return null;
      };
      const hCli  = findHeader(["Cliente","Nome do Cliente","Fornecedor","Nome"]);
      const hFerr = findHeader(["Ferramenta","Matriz","Codigo","Código"]);
      const hPed  = findHeader(["Pedido Kg","Kg","Pedido","Volume"]);
      const hData = findHeader(["Data Implant","Data","Data Impl.","Dt Implant","Dt Impl.","Data Pedido","Dt Pedido"]);

      if (!hFerr || !hPed || !hCli) throw new Error("Cabeçalhos obrigatórios não encontrados (Cliente, Ferramenta, Pedido Kg)");

      // Função local para parsear Data Implant
      const toISO = (v: any): string | undefined => {
        if (v == null) return undefined;
        if (typeof v === 'number' && isFinite(v)) {
          const base = new Date(Date.UTC(1899, 11, 30));
          const d = new Date(base.getTime() + Math.trunc(v) * 86400000);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
        }
        const s = String(v).trim();
        if (!s) return undefined;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const norm = s.replace(/\//g,'-');
        const parts = norm.split('-');
        if (parts.length===3) {
          let y=0,m=0,d=0;
          if (parts[0].length===4) { y=+parts[0]; m=+parts[1]; d=+parts[2]; }
          else { d=+parts[0]; m=+parts[1]; y=+parts[2]; }
          if (Number.isFinite(y)&&Number.isFinite(m)&&Number.isFinite(d)) {
            return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          }
        }
        return undefined;
      };

      // Construir registros planos
      const items: Array<{ cliente: string; ferramenta: string; pedido_kg: number; data_implant?: string } > = [];
      for (const row of json as Array<Record<string, any>>) {
        const cliente = row[hCli];
        const ferramenta = row[hFerr];
        const pedido = parseNumberBR(row[hPed]);
        const iso = hData ? toISO(row[hData]) : undefined;
        if (!ferramenta || pedido == null || !cliente) continue;
        items.push({ cliente: String(cliente).trim(), ferramenta: String(ferramenta).trim(), pedido_kg: pedido, data_implant: iso });
      }
      if (!items.length) throw new Error("Nenhum registro válido encontrado");

      console.log(`[Carteira Upload] Total: ${items.length} registros (tabela plana)`);

      setImportMsg(`Importando ${items.length} registros...`);
      // Truncar tabela plana
      await supabase.rpc('analysis_carteira_flat_truncate');

      // Inserir em lotes menores para melhor performance
      const batch = 500;
      for (let i = 0; i < items.length; i += batch) {
        const chunk = items.slice(i, i + batch);
        setImportMsg(`Inserindo lote ${Math.floor(i/batch) + 1}/${Math.ceil(items.length/batch)}...`);
        const { error } = await supabase.from('analysis_carteira_flat').insert(chunk);
        if (error) {
          console.error('Erro no lote:', error);
          throw new Error(`Erro na inserção: ${error.message}`);
        }
        
        const progress = Math.round(((i + chunk.length) / items.length) * 100);
        setImportProgress(progress);
        
        // Pausa menor para não travar a UI
        if (i + batch < items.length) {
          await new Promise(r => setTimeout(r, 10));
        }
      }

      setImportMsg("Importação concluída.");
      // Recarregar listagem da tabela plana
      const sel = await supabase.from('analysis_carteira_flat').select('id,cliente,ferramenta,pedido_kg,data_implant').limit(100000);
      if (sel.error) throw sel.error;
      const mapped = (sel.data ?? []).map(mapRow).filter(Boolean) as Item[];
      setRows(mapped);
      // Atualizar período do banco após a importação
      try {
        const minQ = await supabase
          .from('analysis_carteira_flat')
          .select('data_implant')
          .not('data_implant', 'is', null)
          .order('data_implant', { ascending: true })
          .limit(1);
        const maxQ = await supabase
          .from('analysis_carteira_flat')
          .select('data_implant')
          .not('data_implant', 'is', null)
          .order('data_implant', { ascending: false })
          .limit(1);
        setDbMinDate((minQ.data?.[0]?.data_implant as string | undefined)?.slice(0, 10));
        setDbMaxDate((maxQ.data?.[0]?.data_implant as string | undefined)?.slice(0, 10));
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setImporting(false);
      setTimeout(() => setImportMsg(""), 4000);
      setTimeout(() => setImportProgress(0), 4000);
    }
  }

  // Opções distintas para selects (cliente, liga, têmpera)
  const options = useMemo(() => {
    const norm = (s?: string) => (s ?? "").toString().toLowerCase();
    const base = rows;
    const baseForClients = fFerramenta.trim()
      ? base.filter((r) => norm(r.ferramenta).includes(norm(fFerramenta)))
      : base;
    const clientesSet = new Set<string>();
    baseForClients.forEach((r) => { if (r.cliente) clientesSet.add(r.cliente); });
    return {
      clientes: Array.from(clientesSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
      ligas: [],
      temperas: [],
    };
  }, [rows, fFerramenta, fCliente]);

  // Aplicar filtros
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const fname = r.ferramenta?.toString().trim().toUpperCase() || "";
      // Excluir ferramentas que começam com "SF"
      if (fname.startsWith("SF")) return false;
      if (fFerramenta.trim() && !r.ferramenta.toLowerCase().includes(fFerramenta.toLowerCase().trim())) return false;
      return true;
    });
  }, [rows, fFerramenta]);

  // Agregar por Ferramenta e calcular ABC + Médias móveis (12m e 3m)
  const aggregated = useMemo(() => {
    // Debug: verificar quantos registros de TR-0100 existem ANTES da agregação
    const tr0100Records = filtered.filter(r => r.ferramenta.toUpperCase().includes('TR-0100'));
    if (tr0100Records.length > 0) {
      const totalTR0100 = tr0100Records.reduce((sum, r) => sum + r.pedidoKg, 0);
      console.log(`[Carteira] TR-0100 ANTES da agregação:`, {
        totalRegistros: tr0100Records.length,
        volumeTotal: totalTR0100,
        primeiroRegistro: tr0100Records[0],
        valores: tr0100Records.map(r => ({ ferramenta: r.ferramenta, kg: r.pedidoKg, data: r.dateISO })).slice(0, 10)
      });
    }
    
    const map = new Map<string, { vol: number; last?: string; count: number; originalName: string; avg12m?: number; avg6m?: number; pedidoCount?: number; clienteCount?: number }>();
    filtered.forEach((r) => {
      // Normalizar nome da ferramenta para maiúsculas para agrupar variações
      const ferramentaKey = r.ferramenta.toUpperCase();
      const cur = map.get(ferramentaKey) ?? { vol: 0, last: undefined, count: 0, originalName: r.ferramenta, avg12m: undefined, avg6m: undefined, pedidoCount: undefined, clienteCount: undefined };
      cur.vol += r.pedidoKg;
      cur.count += 1;
      if (r.dateISO && (!cur.last || r.dateISO > cur.last)) cur.last = r.dateISO;
      // Manter o nome original mais recente (ou primeiro encontrado)
      if (!cur.originalName) cur.originalName = r.ferramenta;
      // Atribuir médias vindas da RPC (um registro por ferramenta)
      if (r.avg12m != null) cur.avg12m = r.avg12m;
      if (r.avg6m != null) cur.avg6m = r.avg6m;
      if (r.pedidoCount != null) cur.pedidoCount = (cur.pedidoCount ?? 0) + r.pedidoCount;
      if (r.clienteCount != null) cur.clienteCount = (cur.clienteCount ?? 0) + r.clienteCount;
      map.set(ferramentaKey, cur);
    });
    
    // Log detalhado da agregação para debug
    const tr0100Data = map.get('TR-0100') || map.get('tr-0100');
    if (tr0100Data) {
      console.log(`[Carteira] TR-0100 agregado:`, {
        volume: tr0100Data.vol,
        registros: tr0100Data.count,
        ultimaData: tr0100Data.last
      });
    }
    
    const total = Array.from(map.values()).reduce((a, b) => a + b.vol, 0);
    let acum = 0;
    const items = Array.from(map.entries())
      .map(([f, v]) => ({ 
        ferramenta: v.originalName || f,
        pedidoKg: v.vol,
        lastDateISO: v.last,
        avg12m: v.avg12m ?? 0,
        avg6m: v.avg6m ?? 0,
        pedidoCount: v.pedidoCount ?? 0,
        clienteCount: v.clienteCount ?? 0,
      }))
      .sort((a, b) => b.pedidoKg - a.pedidoKg)
      .map((it) => {
        acum += it.pedidoKg;
        const share = total > 0 ? (it.pedidoKg / total) * 100 : 0;
        const cumulative = total > 0 ? (acum / total) * 100 : 0;
        const classe = cumulative <= 80 ? "A" : cumulative <= 95 ? "B" : "C";
        return { ...it, share, cumulative, classe };
      });
    return { items, total };
  }, [filtered]);

  const finalItems = useMemo(() =>
    abcFilter === "all" ? aggregated.items : aggregated.items.filter((i) => i.classe === abcFilter),
  [aggregated.items, abcFilter]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Barra de filtros (sem card) */}
      <div className="space-y-3">
          <div className="mb-1 overflow-x-auto pb-2">
          <div className="min-w-max inline-flex items-end gap-3 pr-2">
            {/* Período armazenado no banco (automático) */}
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
            {/* Período */}
            <div className="flex items-end gap-2 pr-3 border-r border-border/40">
              <div className="flex flex-col">
                <label className="text-xs text-muted-foreground">Período (De)</label>
                <Input type="date" className="h-9 w-36 shrink-0" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-muted-foreground">Até</label>
                <Input type="date" className="h-9 w-36 shrink-0" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            {/* Filtros de Características */}
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Ferramenta</label>
              <Input className="h-9 w-48 shrink-0" placeholder="Buscar…" value={fFerramenta} onChange={(e) => setFFerramenta(e.target.value)} />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Cliente (digite para buscar)</label>
              <input
                className="h-9 w-60 rounded-md border bg-background px-3 text-sm"
                list="clientes-list"
                placeholder="Ex.: ALUITA"
                value={fCliente}
                onChange={(e) => setFCliente(e.target.value)}
              />
              <datalist id="clientes-list">
                {options.clientes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            {/* Removidos filtros de Liga, Têmpera e Tipo para a tabela plana */}
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Classe ABC</label>
              <Select value={abcFilter} onValueChange={(v: any) => setAbcFilter(v)}>
                <SelectTrigger className="h-9 w-36 shrink-0"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="A">A (≤80%)</SelectItem>
                  <SelectItem value="B">B (80-95%)</SelectItem>
                  <SelectItem value="C">C (&gt;95%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Upload */}
            <div className="flex items-end">
              <input
                id={fileInputId}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (f) handleUploadFile(f);
                }}
              />
              <button
                type="button"
                className="ml-1 h-9 w-9 flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50"
                title={importing ? "Importando..." : "Carregar planilha"}
                onClick={() => document.getElementById(fileInputId)?.click()}
                disabled={importing}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Sem cards de resumo: layout idêntico ao da Produção, apenas campos */}
      </div>

      {/* Tabela sem Card wrapper - igual Produção */}
      <div className="overflow-auto">
        {importMsg && (
          <div className="mb-2 text-xs text-muted-foreground flex items-center gap-3">
            <span>{importMsg}</span>
            {(importing || importProgress > 0) && (
              <div className="h-2 w-40 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${importProgress}%` }} /></div>
            )}
          </div>
        )}
        {loading && <div className="mt-2 text-sm text-muted-foreground">Carregando…</div>}
        {error && <div className="mt-2 text-sm text-red-600">Erro: {error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="mt-2 text-sm text-muted-foreground">Nenhum dado encontrado.</div>
        )}
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-left w-[260px]">Ferramenta</th>
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[120px]">Pedido Kg</th>
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[120px]">Média/12 meses</th>
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[110px]">Média/6 meses</th>
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[110px]">Qtd Pedidos</th>
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[120px]">Qtd Clientes</th>
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[90px]">Part. %</th>
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-right w-[90px]">Acum. %</th>
              <th className="sticky top-0 bg-muted px-2 py-2 font-medium text-muted-foreground text-center w-[80px]">Classe</th>
            </tr>
          </thead>
          <tbody>
            {finalItems.map((it) => (
              <tr key={it.ferramenta} className="hover:bg-muted/40 border-b">
                <td className="px-2 py-1.5 align-top text-left font-medium w-[260px] max-w-[260px] truncate" title={it.ferramenta}>{it.ferramenta}</td>
                <td className="px-2 py-1.5 align-top text-right tabular-nums">{formatDecimal(it.pedidoKg)}</td>
                <td className="px-2 py-1.5 align-top text-right tabular-nums">{formatDecimal(it.avg12m ?? 0)}</td>
                <td className="px-2 py-1.5 align-top text-right tabular-nums">{formatDecimal(it.avg6m ?? 0)}</td>
                <td className="px-2 py-1.5 align-top text-right tabular-nums">{(it.pedidoCount ?? 0).toLocaleString('pt-BR')}</td>
                <td className="px-2 py-1.5 align-top text-right tabular-nums">{(it.clienteCount ?? 0).toLocaleString('pt-BR')}</td>
                <td className="px-2 py-1.5 align-top text-right tabular-nums">{formatPerc(it.share)}</td>
                <td className="px-2 py-1.5 align-top text-right tabular-nums">{formatPerc(it.cumulative)}</td>
                <td className="px-2 py-1.5 align-top text-center">
                  <Badge variant={it.classe === "A" ? "default" : it.classe === "B" ? "secondary" : "outline"} className="text-xs">
                    {it.classe}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Exibindo {finalItems.length} de {aggregated.items.length} ferramentas. 
            Volume total: {formatDecimal(aggregated.total)} kg ({formatDecimal(aggregated.total / 1000)} ton)
          </span>
          <span className="flex items-center gap-4">
            <span>Total registros: {filtered.length}</span>
            <span className="text-primary">|</span>
            <span>A: {aggregated.items.filter(i => i.classe === "A").length}</span>
            <span>B: {aggregated.items.filter(i => i.classe === "B").length}</span>
            <span>C: {aggregated.items.filter(i => i.classe === "C").length}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
