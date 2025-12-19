import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Filter, MapPin, RefreshCcw, Search, SplitSquareHorizontal } from "lucide-react";

type Row = {
  key: string; // ferramenta|seq
  ferramenta: string;
  sequencia: string;
  boxSistema: string | null;
  boxInformado: string | null;
  informadoEm?: string | null;
  ativa?: string | null;
};

type Filters = {
  term: string;
  box: string;
  status: "Todos" | "Divergentes" | "Iguais";
  ativa: "Todas" | "Sim" | "Não";
};

export function StockInventoryView() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ term: "", box: "", status: "Todos", ativa: "Sim" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Carrega TODOS os registros em lotes com ordenação estável (mesma estratégia do Romaneio)
        const pageSize = 2000;
        let from = 0;
        const sys: any[] = [];
        while (true) {
          const to = from + pageSize - 1;
          const { data: page, error: e1 } = await supabase
            .from("analysis_ferramentas")
            .select("id,ferramenta_code,ferramenta_seq,payload")
            .order("id", { ascending: true })
            .range(from, to);
          if (e1) throw e1;
          if (!page || page.length === 0) break;
          sys.push(...page);
          if (page.length < pageSize) break;
          from += page.length;
        }

        const { data: inf, error: e2 } = await supabase
          .from("v_tool_locations_last_informed")
          .select("ferramenta_key,sequencia_key,box_informado,informado_em")
          .limit(100000);
        if (e2) throw e2;

        const { data: man, error: e3 } = await supabase
          .from("tool_locations")
          .select("ferramenta,sequencia,box,observed_at")
          .eq("origem", "manual")
          .order("observed_at", { ascending: false })
          .limit(100000);
        if (e3) throw e3;

        const mapInf = new Map<string, { box: string | null; em: string | null }>();
        for (const r of inf || []) {
          const k = `${(r as any).ferramenta_key}|${(r as any).sequencia_key}`;
          mapInf.set(k, { box: (r as any).box_informado, em: (r as any).informado_em });
        }
        const mapMan = new Map<string, { box: string | null; em: string | null }>();
        for (const r of man || []) {
          const k = `${String((r as any).ferramenta).toUpperCase().trim()}|${(r as any).sequencia ?? ""}`;
          if (!mapMan.has(k)) mapMan.set(k, { box: (r as any).box, em: (r as any).observed_at });
        }

        function pickPayload(p: any, candidates: string[]): string | null {
          if (!p || typeof p !== "object") return null;
          for (const k of candidates) {
            if (p[k] != null && String(p[k]).trim() !== "") return String(p[k]);
          }
          // busca case-insensitive
          const lower = Object.keys(p).reduce((acc: any, key) => { acc[key.toLowerCase()] = p[key]; return acc; }, {} as any);
          for (const k of candidates) {
            const lk = k.toLowerCase();
            if (lower[lk] != null && String(lower[lk]).trim() !== "") return String(lower[lk]);
          }
          return null;
        }

        const out: Row[] = [];
        for (const r of sys || []) {
          const payload = (r as any).payload || {};
          const codeRaw = (r as any).ferramenta_code ?? payload?.Matriz ?? payload?.Ferramenta ?? payload?.Ferramenta_Code ?? null;
          const seqRaw = (r as any).ferramenta_seq ?? payload?.Seq ?? payload?.Sequencia ?? payload?.Sequência ?? "";
          const f = String(codeRaw || "").toUpperCase().trim();
          const s = String(seqRaw || "");
          if (!f) continue; // ignorar registros sem código
          const key = `${f}|${s}`;
          const sysBox = pickPayload(payload, [
            "Box",
            "BOX",
            "Box Atual",
            "BoxAtual",
            "Local",
            "Localizacao",
            "Localização",
            "Posição",
            "Posicao",
          ]);
          const ativa = pickPayload(payload, ["Ativa"]) ?? null;
          const manEntry = mapMan.get(key);
          const infEntry = mapInf.get(key);
          const chosen = manEntry?.box ?? infEntry?.box ?? null;
          const chosenEm = manEntry?.em ?? infEntry?.em ?? null;
          out.push({ key, ferramenta: f, sequencia: s, boxSistema: sysBox, boxInformado: chosen, informadoEm: chosenEm, ativa });
        }
        setRows(out);
      } catch (e: any) {
        toast({ title: "Erro ao carregar estoque", description: e?.message ?? String(e), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    // Filtra Ativa por padrão (Sim)
    if (filters.ativa !== "Todas") {
      const want = (filters.ativa || "Sim").toString().trim().toLowerCase();
      list = list.filter((r) => (r.ativa || "").toString().trim().toLowerCase() === want);
    }
    if (filters.term.trim()) {
      const t = filters.term.trim().toUpperCase();
      list = list.filter((r) => r.ferramenta.includes(t));
    }
    if (filters.box.trim()) {
      const b = filters.box.trim().toUpperCase();
      list = list.filter((r) => (r.boxSistema || "").toUpperCase().includes(b) || (r.boxInformado || "").toUpperCase().includes(b));
    }
    if (filters.status === "Divergentes") list = list.filter((r) => (r.boxSistema || "") !== (r.boxInformado || ""));
    if (filters.status === "Iguais") list = list.filter((r) => (r.boxSistema || "") === (r.boxInformado || ""));
    // Ordenação crescente por ferramenta e sequência (numérica quando possível)
    const num = (s: string) => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : null;
    };
    return [...list].sort((a, b) => {
      const fcmp = a.ferramenta.localeCompare(b.ferramenta, "pt-BR", { numeric: true, sensitivity: "base" });
      if (fcmp !== 0) return fcmp;
      const na = num(a.sequencia);
      const nb = num(b.sequencia);
      if (na != null && nb != null) return na - nb;
      if (na != null) return -1;
      if (nb != null) return 1;
      return a.sequencia.localeCompare(b.sequencia, "pt-BR", { numeric: true, sensitivity: "base" });
    });
  }, [rows, filters]);

  const stats = useMemo(() => {
    const total = rows.length;
    const diverg = rows.filter((r) => (r.boxSistema || "") !== (r.boxInformado || "")).length;
    const iguais = total - diverg;
    return { total, diverg, iguais };
  }, [rows]);

  async function assumirSistema(keys: string[]) {
    if (!keys.length) return;
    try {
      const payload = keys.map((k) => {
        const r = rows.find((x) => x.key === k)!;
        return {
          ferramenta: r.ferramenta,
          sequencia: r.sequencia,
          box: r.boxSistema,
          origem: "manual",
          notes: "assumir_sistema",
        };
      });
      const { error } = await supabase.from("tool_locations").insert(payload);
      if (error) throw error;
      toast({ title: "Atualizado", description: `${keys.length} registro(s) assumiram o Box do sistema como informado.` });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  async function assumirInformado(keys: string[], novoBox?: string) {
    if (!keys.length) return;
    try {
      const payload = keys.map((k) => {
        const r = rows.find((x) => x.key === k)!;
        return {
          ferramenta: r.ferramenta,
          sequencia: r.sequencia,
          box: novoBox ?? r.boxInformado,
          origem: "manual",
          notes: "assumir_informado",
        };
      });
      const { error } = await supabase.from("tool_locations").insert(payload);
      if (error) throw error;
      toast({ title: "Atualizado", description: `${keys.length} registro(s) assumiram o Box informado.` });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-2 md:p-4 space-y-4">
      <Card>
        <CardContent className="p-3 md:p-4 space-y-3 md:space-y-0 md:grid md:grid-cols-5 md:gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={filters.term} onChange={(e) => setFilters({ ...filters, term: e.target.value })} placeholder="Ex: TSU-041" className="h-10 pl-8" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Box</label>
            <div className="relative">
              <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={filters.box} onChange={(e) => setFilters({ ...filters, box: e.target.value })} placeholder="Ex: A1, B2" className="h-10 pl-8" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Status</label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}>
              <option>Todos</option>
              <option>Divergentes</option>
              <option>Iguais</option>
            </select>
          </div>
          <div className="md:flex md:items-end">
            <Button variant="outline" className="w-full h-10" onClick={() => setFilters({ term: "", box: "", status: "Todos", ativa: "Sim" })}>
              <RefreshCcw className="h-4 w-4 mr-1" /> Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Card><CardContent className="p-2 md:p-3"><div className="text-xs text-muted-foreground">Total</div><div className="text-xl md:text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="p-2 md:p-3"><div className="text-xs text-muted-foreground">Divergentes</div><div className="text-xl md:text-2xl font-bold text-amber-600">{stats.diverg}</div></CardContent></Card>
        <Card><CardContent className="p-2 md:p-3"><div className="text-xs text-muted-foreground">Iguais</div><div className="text-xl md:text-2xl font-bold text-emerald-600">{stats.iguais}</div></CardContent></Card>
      </div>

      <Card className="border-2 border-slate-200">
        <CardContent className="p-3">
          <div className="mb-3 space-y-2">
            <div className="font-semibold text-sm">Localização Atual</div>
            {selected.size > 0 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => assumirSistema(Array.from(selected))}>
                  <SplitSquareHorizontal className="h-4 w-4 mr-1" /> Assumir Sistema ({selected.size})
                </Button>
                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => assumirInformado(Array.from(selected))}>
                  <Check className="h-4 w-4 mr-1" /> Assumir Informado ({selected.size})
                </Button>
              </div>
            )}
          </div>
          {/* Desktop: Tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-2 py-2"><Checkbox checked={filtered.length>0 && filtered.every((r) => selected.has(r.key))} onCheckedChange={() => {
                    const all = filtered.every((r) => selected.has(r.key));
                    const next = new Set(selected);
                    filtered.forEach((r) => all ? next.delete(r.key) : next.add(r.key));
                    setSelected(next);
                  }} /></th>
                  <th className="px-2 py-2 text-left">Ferramenta</th>
                  <th className="px-2 py-2 text-left">Box (Sistema)</th>
                  <th className="px-2 py-2 text-left">Box (Informado)</th>
                  <th className="px-2 py-2 text-left">Atualizado em</th>
                  <th className="px-2 py-2 text-left">Conciliação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Carregando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Nenhum registro</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.key} className="border-b hover:bg-muted/30">
                      <td className="px-2 py-2"><Checkbox checked={selected.has(r.key)} onCheckedChange={() => {
                        const next = new Set(selected); next.has(r.key) ? next.delete(r.key) : next.add(r.key); setSelected(next);
                      }}/></td>
                      <td className="px-2 py-2">{r.ferramenta}{r.sequencia ? ` / ${r.sequencia}` : ""}</td>
                      <td className="px-2 py-2">{r.boxSistema || "-"}</td>
                      <td className="px-2 py-2">{r.boxInformado || "-"}</td>
                      <td className="px-2 py-2">{r.informadoEm ? r.informadoEm.slice(0,10).split("-").reverse().join("/") : "-"}</td>
                      <td className="px-2 py-2">
                        {(r.boxSistema || "") === (r.boxInformado || "") ? (
                          <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">OK</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">Divergente</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile: Cards */}
          <div className="md:hidden space-y-2">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhum registro</div>
            ) : (
              filtered.map((r) => {
                const isDivergente = (r.boxSistema || "") !== (r.boxInformado || "");
                return (
                  <Card key={r.key} className={`border-l-4 ${
                    isDivergente ? "border-l-amber-500 bg-amber-50/10" : "border-l-emerald-500 bg-emerald-50/10"
                  }`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <Checkbox
                            checked={selected.has(r.key)}
                            onCheckedChange={() => {
                              const next = new Set(selected);
                              next.has(r.key) ? next.delete(r.key) : next.add(r.key);
                              setSelected(next);
                            }}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-sm">
                              {r.ferramenta}{r.sequencia ? ` / ${r.sequencia}` : ""}
                            </p>
                            {r.informadoEm && (
                              <p className="text-xs text-muted-foreground">
                                Atualizado: {r.informadoEm.slice(0,10).split("-").reverse().join("/")}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded shrink-0 ${
                          isDivergente ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {isDivergente ? "Divergente" : "OK"}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground text-xs">Box (Sistema):</span>
                          <span className="font-medium text-xs">{r.boxSistema || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground text-xs">Box (Informado):</span>
                          <span className="font-medium text-xs">{r.boxInformado || "-"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
