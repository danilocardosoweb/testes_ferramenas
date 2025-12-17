import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { AlertTriangle, Check, Clock, Flame, RefreshCcw, Thermometer, Wrench } from "lucide-react";

type Order = {
  id: string;
  ferramenta: string;
  sequencia: string | null;
  data_saida: string;
  data_retorno: string | null;
  nitretacao: boolean;
  data_entrada_nitretacao: string | null;
  data_saida_nitretacao: string | null;
};

function diffDays(fromISO?: string | null, toISO?: string | null) {
  if (!fromISO) return 0;
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date((toISO ?? new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

const fmt = (iso?: string | null) => {
  if (!iso) return "-";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
};

export function CleaningTrackingDashboard() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selLimpeza, setSelLimpeza] = useState<Set<string>>(new Set());
  const [selNitre, setSelNitre] = useState<Set<string>>(new Set());
  const [slaLimpeza, setSlaLimpeza] = useState<number>(3);
  const [slaNitre, setSlaNitre] = useState<number>(7);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("cleaning_orders")
          .select("id,ferramenta,sequencia,data_saida,data_retorno,nitretacao,data_entrada_nitretacao,data_saida_nitretacao")
          .order("data_saida", { ascending: false });
        if (error) throw error;
        setOrders((data as any[]) as Order[]);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kpis = useMemo(() => {
    const emLimpeza = orders.filter((o) => !o.data_retorno && !o.nitretacao).length;
    const emNitre = orders.filter((o) => o.nitretacao && !o.data_saida_nitretacao).length;
    const atrasadasLimpeza = orders.filter((o) => !o.data_retorno && !o.nitretacao && diffDays(o.data_saida) > slaLimpeza).length;
    const atrasadasNitre = orders.filter((o) => o.nitretacao && o.data_entrada_nitretacao && !o.data_saida_nitretacao && diffDays(o.data_entrada_nitretacao) > slaNitre).length;
    return { total: orders.length, emLimpeza, emNitre, atrasadasLimpeza, atrasadasNitre };
  }, [orders, slaLimpeza, slaNitre]);

  const atencaoLimpeza = useMemo(() => {
    return orders
      .filter((o) => !o.data_retorno && !o.nitretacao)
      .map((o) => ({ ...o, dias: diffDays(o.data_saida) }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 20);
  }, [orders]);

  const atencaoNitre = useMemo(() => {
    return orders
      .filter((o) => o.nitretacao && !o.data_saida_nitretacao)
      .map((o) => ({ ...o, dias: diffDays(o.data_entrada_nitretacao ?? o.data_saida) }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 20);
  }, [orders]);

  async function marcarRetornoHoje(ids: string[]) {
    if (!ids.length) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { error } = await supabase.from("cleaning_orders").update({ data_retorno: today }).in("id", ids);
      if (error) throw error;
      toast({ title: "Baixa aplicada", description: `${ids.length} ferramenta(s) baixada(s) hoje.` });
      const { data } = await supabase
        .from("cleaning_orders")
        .select("id,ferramenta,sequencia,data_saida,data_retorno,nitretacao,data_entrada_nitretacao,data_saida_nitretacao")
        .order("data_saida", { ascending: false });
      setOrders((data as any[]) as Order[]);
      setSelLimpeza(new Set());
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  async function marcarSaidaNitreHoje(ids: string[]) {
    if (!ids.length) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { error } = await supabase.from("cleaning_orders").update({ data_saida_nitretacao: today }).in("id", ids);
      if (error) throw error;
      toast({ title: "Concluídas", description: `${ids.length} ferramenta(s) concluída(s) na nitretação.` });
      const { data } = await supabase
        .from("cleaning_orders")
        .select("id,ferramenta,sequencia,data_saida,data_retorno,nitretacao,data_entrada_nitretacao,data_saida_nitretacao")
        .order("data_saida", { ascending: false });
      setOrders((data as any[]) as Order[]);
      setSelNitre(new Set());
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-2 md:p-4 space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs text-muted-foreground">SLA Limpeza (dias)</label>
            <Input type="number" min={1} value={slaLimpeza} onChange={(e) => setSlaLimpeza(Number(e.target.value) || 1)} className="h-9 w-28" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">SLA Nitretação (dias)</label>
            <Input type="number" min={1} value={slaNitre} onChange={(e) => setSlaNitre(Number(e.target.value) || 1)} className="h-9 w-28" />
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCcw className="h-4 w-4" /> KPIs se ajustam automaticamente
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold">{kpis.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><Wrench className="h-4 w-4" />Em Limpeza</div><div className="text-2xl font-bold text-blue-600">{kpis.emLimpeza}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><Thermometer className="h-4 w-4" />Em Nitretação</div><div className="text-2xl font-bold text-orange-600">{kpis.emNitre}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-4 w-4" />Atraso Limpeza</div><div className="text-2xl font-bold text-red-600">{kpis.atrasadasLimpeza}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-4 w-4" />Atraso Nitretação</div><div className="text-2xl font-bold text-red-600">{kpis.atrasadasNitre}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-2 border-blue-200">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">Atenção: Em Limpeza sem retorno (top 20)</div>
              <div className="flex items-center gap-2 text-xs">
                <Button size="sm" variant="outline" disabled={selLimpeza.size === 0} onClick={() => marcarRetornoHoje(Array.from(selLimpeza))}>
                  <Check className="h-4 w-4 mr-1" /> Baixar hoje
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Carregando…</div>
            ) : error ? (
              <div className="text-sm text-red-600">Erro: {error}</div>
            ) : atencaoLimpeza.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum item pendente.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-2 py-2"><Checkbox checked={atencaoLimpeza.every(i => selLimpeza.has(i.id)) && atencaoLimpeza.length>0} onCheckedChange={() => {
                      const all = atencaoLimpeza.every(i => selLimpeza.has(i.id));
                      const next = new Set(selLimpeza);
                      atencaoLimpeza.forEach(i => all ? next.delete(i.id) : next.add(i.id));
                      setSelLimpeza(next);
                    }} /></th>
                    <th className="px-2 py-2 text-left">Ferramenta</th>
                    <th className="px-2 py-2 text-left">Saída</th>
                    <th className="px-2 py-2 text-right">Dias</th>
                  </tr>
                </thead>
                <tbody>
                  {atencaoLimpeza.map((o) => (
                    <tr key={o.id} className="border-b hover:bg-muted/30">
                      <td className="px-2 py-2"><Checkbox checked={selLimpeza.has(o.id)} onCheckedChange={() => {
                        const next = new Set(selLimpeza); next.has(o.id) ? next.delete(o.id) : next.add(o.id); setSelLimpeza(next);
                      }}/></td>
                      <td className="px-2 py-2">{o.ferramenta}{o.sequencia ? ` / ${o.sequencia}` : ""}</td>
                      <td className="px-2 py-2">{fmt(o.data_saida)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-red-700">{o.dias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-orange-200">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">Atenção: Em Nitretação sem saída (top 20)</div>
              <div className="flex items-center gap-2 text-xs">
                <Button size="sm" variant="outline" disabled={selNitre.size === 0} onClick={() => marcarSaidaNitreHoje(Array.from(selNitre))}>
                  <Check className="h-4 w-4 mr-1" /> Concluir hoje
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Carregando…</div>
            ) : error ? (
              <div className="text-sm text-red-600">Erro: {error}</div>
            ) : atencaoNitre.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum item pendente.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-2 py-2"><Checkbox checked={atencaoNitre.every(i => selNitre.has(i.id)) && atencaoNitre.length>0} onCheckedChange={() => {
                      const all = atencaoNitre.every(i => selNitre.has(i.id));
                      const next = new Set(selNitre);
                      atencaoNitre.forEach(i => all ? next.delete(i.id) : next.add(i.id));
                      setSelNitre(next);
                    }} /></th>
                    <th className="px-2 py-2 text-left">Ferramenta</th>
                    <th className="px-2 py-2 text-left">Entrada</th>
                    <th className="px-2 py-2 text-right">Dias</th>
                  </tr>
                </thead>
                <tbody>
                  {atencaoNitre.map((o) => (
                    <tr key={o.id} className="border-b hover:bg-muted/30">
                      <td className="px-2 py-2"><Checkbox checked={selNitre.has(o.id)} onCheckedChange={() => {
                        const next = new Set(selNitre); next.has(o.id) ? next.delete(o.id) : next.add(o.id); setSelNitre(next);
                      }}/></td>
                      <td className="px-2 py-2">{o.ferramenta}{o.sequencia ? ` / ${o.sequencia}` : ""}</td>
                      <td className="px-2 py-2">{fmt(o.data_entrada_nitretacao ?? o.data_saida)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-red-700">{o.dias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Flame className="h-3.5 w-3.5" /> Dica: ajuste o SLA para enxergar rapidamente o que virou crítico.
      </div>
    </div>
  );
}
