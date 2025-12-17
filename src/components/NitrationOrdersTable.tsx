import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { Trash2, Check, AlertCircle, ChevronDown, ChevronRight, MoreVertical, Edit } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NitrationOrder {
  id: string;
  ferramenta: string;
  sequencia: string;
  data_saida: string;
  data_entrada_nitretacao: string | null;
  data_saida_nitretacao: string | null;
  observacoes_nitretacao: string | null;
  created_at: string;
  updated_at: string;
}

interface FilterState {
  status: "em_nitretacao" | "concluidas" | "todas";
  dataInicio: string;
  dataFim: string;
  ferramenta: string;
}

const fmtDateBR = (iso?: string) => {
  if (!iso) return "-";
  const s = String(iso);
  const yyyy = s.slice(0, 4);
  const mm = s.slice(5, 7);
  const dd = s.slice(8, 10);
  if (!yyyy || !mm || !dd) return "-";
  return `${dd}/${mm}/${yyyy}`;
};

export function NitrationOrdersTable() {
  const [orders, setOrders] = useState<NitrationOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [bulkEntrada, setBulkEntrada] = useState<Record<string, string>>({});
  const [bulkSaida, setBulkSaida] = useState<Record<string, string>>({});
  const [bulkObs, setBulkObs] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<FilterState>({
    status: "todas",
    dataInicio: "",
    dataFim: "",
    ferramenta: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadOrders();
  }, [filters]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("cleaning_orders")
        .select("*")
        .eq("nitretacao", true);

      if (filters.status === "em_nitretacao") {
        query = query.is("data_saida_nitretacao", null);
      } else if (filters.status === "concluidas") {
        query = query.not("data_saida_nitretacao", "is", null);
      }

      if (filters.dataInicio) {
        query = query.gte("data_saida", filters.dataInicio);
      }
      if (filters.dataFim) {
        query = query.lte("data_saida", filters.dataFim);
      }

      if (filters.ferramenta.trim()) {
        query = query.ilike("ferramenta", `%${filters.ferramenta.trim()}%`);
      }

      const { data, error: err } = await query.order("data_saida", { ascending: false });

      if (err) throw err;
      setOrders(
        (data as any[])?.map((row) => ({
          id: row.id,
          ferramenta: row.ferramenta,
          sequencia: row.sequencia,
          data_saida: row.data_saida,
          data_entrada_nitretacao: row.data_entrada_nitretacao || null,
          data_saida_nitretacao: row.data_saida_nitretacao || null,
          observacoes_nitretacao: row.observacoes_nitretacao || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })) || []
      );
      setSelected(new Set());
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyBulkForDay = async (date: string, dayOrders: NitrationOrder[]) => {
    const daySelected = dayOrders.filter((o) => selected.has(o.id)).map((o) => o.id);
    const entrada = bulkEntrada[date]?.trim();
    const saida = bulkSaida[date]?.trim();
    const obs = bulkObs[date]?.trim();
    if (daySelected.length === 0) {
      toast({ title: "Seleção vazia", description: "Selecione ao menos uma ferramenta do dia para aplicar.", variant: "destructive" });
      return;
    }
    if (!entrada && !saida && !obs) {
      toast({ title: "Nada a aplicar", description: "Informe Entrada/Saída e/ou Observações.", variant: "destructive" });
      return;
    }
    const updateData: any = {};
    if (entrada) updateData.data_entrada_nitretacao = entrada;
    if (saida) updateData.data_saida_nitretacao = saida;
    if (obs) updateData.observacoes_nitretacao = obs;
    try {
      const { error } = await supabase.from("cleaning_orders").update(updateData).in("id", daySelected);
      if (error) throw error;
      toast({ title: "Aplicado", description: `Atualizado(s) ${daySelected.length} registro(s) do dia ${fmtDateBR(date)}.` });
      loadOrders();
    } catch (err: any) {
      toast({ title: "Erro ao aplicar", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  };

  const handleCellEdit = async (orderId: string, field: string, value: any) => {
    try {
      const updateData: any = {};
      if (field === "data_entrada_nitretacao") {
        updateData.data_entrada_nitretacao = value || null;
      } else if (field === "data_saida_nitretacao") {
        updateData.data_saida_nitretacao = value || null;
      } else if (field === "observacoes_nitretacao") {
        updateData.observacoes_nitretacao = value || null;
      }

      const { error: err } = await supabase
        .from("cleaning_orders")
        .update(updateData)
        .eq("id", orderId);

      if (err) throw err;
      setEditingId(null);
      setEditField(null);
      loadOrders();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  const handleBatchComplete = async () => {
    if (selected.size === 0) {
      toast({ title: "Aviso", description: "Selecione ao menos uma ferramenta" });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    try {
      const { error: err } = await supabase
        .from("cleaning_orders")
        .update({ data_saida_nitretacao: today })
        .in("id", Array.from(selected));

      if (err) throw err;
      toast({
        title: "Sucesso",
        description: `${selected.size} ferramenta(s) marcada(s) como concluída(s) em nitretação`,
      });
      setSelected(new Set());
      loadOrders();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) {
      toast({ title: "Aviso", description: "Selecione ao menos uma ferramenta" });
      return;
    }

    if (!confirm(`Deletar ${selected.size} registro(s)?`)) return;

    try {
      const { error: err } = await supabase
        .from("cleaning_orders")
        .delete()
        .in("id", Array.from(selected));

      if (err) throw err;
      toast({
        title: "Sucesso",
        description: `${selected.size} registro(s) deletado(s)`,
      });
      setSelected(new Set());
      loadOrders();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  const toggleDay = (date: string) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDays(newExpanded);
  };

  const isLoteComplete = (dayOrders: NitrationOrder[]): boolean => {
    return dayOrders.every((order) => order.data_saida_nitretacao !== null);
  };

  const handleFinalizeLote = async (date: string, dayOrders: NitrationOrder[]) => {
    if (!isLoteComplete(dayOrders)) {
      toast({
        title: "Lote Incompleto",
        description: "Todas as ferramentas devem ter data de saída da nitretação",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Sucesso",
        description: `Lote de ${date} finalizado com ${dayOrders.length} ferramenta(s)`,
      });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  const groupedByDate = orders.reduce(
    (acc, order) => {
      const date = order.data_saida;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(order);
      return acc;
    },
    {} as Record<string, NitrationOrder[]>
  );

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const stats = {
    total: orders.length,
    emNitretacao: orders.filter((o) => !o.data_saida_nitretacao).length,
    concluidas: orders.filter((o) => o.data_saida_nitretacao).length,
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-2 md:p-4 space-y-4">
      {/* Filtros */}
      <Card className="border-2 border-primary/20">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Status
              </label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value as any })
                }
              >
                <option value="todas">Todas</option>
                <option value="em_nitretacao">Em Nitretação</option>
                <option value="concluidas">Concluídas</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Data Início
              </label>
              <Input
                type="date"
                value={filters.dataInicio}
                onChange={(e) =>
                  setFilters({ ...filters, dataInicio: e.target.value })
                }
                className="h-10 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Data Fim
              </label>
              <Input
                type="date"
                value={filters.dataFim}
                onChange={(e) =>
                  setFilters({ ...filters, dataFim: e.target.value })
                }
                className="h-10 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Ferramenta
              </label>
              <Input
                type="text"
                placeholder="Ex: VZ-0006"
                value={filters.ferramenta}
                onChange={(e) =>
                  setFilters({ ...filters, ferramenta: e.target.value })
                }
                className="h-10 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() =>
                  setFilters({
                    status: "todas",
                    dataInicio: "",
                    dataFim: "",
                    ferramenta: "",
                  })
                }
                className="w-full h-10"
              >
                Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Em Nitretação</div>
            <div className="text-2xl font-bold text-orange-600">{stats.emNitretacao}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Concluídas</div>
            <div className="text-2xl font-bold text-green-600">{stats.concluidas}</div>
          </CardContent>
        </Card>
      </div>

      {/* Ações em Lote */}
      {selected.size > 0 && (
        <Card className="border-2 border-blue-500 bg-blue-50/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">
                {selected.size} ferramenta(s) selecionada(s)
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleBatchComplete}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Marcar Concluída
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBatchDelete}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Deletar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela Agrupada por Data */}
      {loading && <div className="text-center py-8 text-muted-foreground">Carregando…</div>}
      {error && <div className="text-center py-8 text-red-600">Erro: {error}</div>}
      {!loading && orders.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">Nenhum registro encontrado.</div>
      )}

      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {sortedDates.map((date) => {
            const dayOrders = groupedByDate[date];
            const isExpanded = expandedDays.has(date);
            const dayEmNitretacao = dayOrders.filter((o) => !o.data_saida_nitretacao).length;
            const dayConcluidas = dayOrders.filter((o) => o.data_saida_nitretacao).length;

            return (
              <div key={date} className="border rounded-lg overflow-hidden">
                {/* Header do Dia */}
                <div className="bg-gradient-to-r from-orange/10 to-orange/5 px-3 md:px-4 py-3 flex items-center justify-between gap-2 md:gap-3 border-b">
                  <button
                    onClick={() => toggleDay(date)}
                    className="flex items-center gap-2 md:gap-3 flex-1 hover:opacity-80 transition-opacity min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 md:h-5 md:w-5 text-orange-600 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="text-left min-w-0">
                      <p className="font-semibold text-xs md:text-sm">
                        {fmtDateBR(date)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {dayOrders.length} ferr. • {dayEmNitretacao} nitr. • {dayConcluidas} concl.
                      </p>
                    </div>
                  </button>
                  {/* Desktop: inputs inline */}
                  <div className="hidden md:flex items-center gap-2">
                    <input
                      type="date"
                      value={bulkEntrada[date] || ""}
                      onChange={(e) => setBulkEntrada((p) => ({ ...p, [date]: e.target.value }))}
                      className="h-8 text-xs px-2 py-1 border rounded"
                      title="Entrada Nitretação (aplicar aos selecionados)"
                    />
                    <input
                      type="date"
                      value={bulkSaida[date] || ""}
                      onChange={(e) => setBulkSaida((p) => ({ ...p, [date]: e.target.value }))}
                      className="h-8 text-xs px-2 py-1 border rounded"
                      title="Saída Nitretação (aplicar aos selecionados)"
                    />
                    <input
                      type="text"
                      placeholder="Observações..."
                      value={bulkObs[date] || ""}
                      onChange={(e) => setBulkObs((p) => ({ ...p, [date]: e.target.value }))}
                      className="h-8 text-xs px-2 py-1 border rounded"
                      title="Observações (aplicar aos selecionados)"
                    />
                    <Button size="sm" variant="outline" onClick={() => handleApplyBulkForDay(date, dayOrders)}>
                      Aplicar aos selecionados
                    </Button>
                  </div>
                  {/* Mobile: Sheet e dropdown */}
                  <div className="flex md:hidden items-center gap-1 shrink-0">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 px-2">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="bottom" className="h-[80vh]">
                        <SheetHeader>
                          <SheetTitle>Preenchimento em Lote - {fmtDateBR(date)}</SheetTitle>
                        </SheetHeader>
                        <div className="space-y-4 mt-4">
                          <div>
                            <label className="text-sm font-semibold mb-2 block">Data Entrada Nitretação</label>
                            <Input
                              type="date"
                              value={bulkEntrada[date] || ""}
                              onChange={(e) => setBulkEntrada((p) => ({ ...p, [date]: e.target.value }))}
                              className="h-11"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-semibold mb-2 block">Data Saída Nitretação</label>
                            <Input
                              type="date"
                              value={bulkSaida[date] || ""}
                              onChange={(e) => setBulkSaida((p) => ({ ...p, [date]: e.target.value }))}
                              className="h-11"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-semibold mb-2 block">Observações</label>
                            <Input
                              type="text"
                              placeholder="Observações..."
                              value={bulkObs[date] || ""}
                              onChange={(e) => setBulkObs((p) => ({ ...p, [date]: e.target.value }))}
                              className="h-11"
                            />
                          </div>
                          <Button
                            className="w-full h-11"
                            onClick={() => handleApplyBulkForDay(date, dayOrders)}
                          >
                            Aplicar aos Selecionados
                          </Button>
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                  <Button
                    onClick={() => handleFinalizeLote(date, dayOrders)}
                    disabled={!isLoteComplete(dayOrders)}
                    className={`ml-1 whitespace-nowrap ${
                      isLoteComplete(dayOrders)
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-gray-400 cursor-not-allowed"
                    }`}
                    size="sm"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Finalizar Lote
                  </Button>
                </div>

                {/* Tabela do Dia */}
                {isExpanded && (
                  <>
                    {/* Desktop: Tabela */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                      <thead className="bg-muted/30 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left">
                            <Checkbox
                              checked={
                                dayOrders.every((o) => selected.has(o.id)) &&
                                dayOrders.length > 0
                              }
                              onCheckedChange={() => {
                                const newSelected = new Set(selected);
                                const allSelected = dayOrders.every((o) =>
                                  selected.has(o.id)
                                );
                                dayOrders.forEach((o) => {
                                  if (allSelected) {
                                    newSelected.delete(o.id);
                                  } else {
                                    newSelected.add(o.id);
                                  }
                                });
                                setSelected(newSelected);
                              }}
                            />
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">Ferramenta</th>
                          <th className="px-4 py-3 text-left font-semibold">Entrada Nitretação</th>
                          <th className="px-4 py-3 text-left font-semibold">Saída Nitretação</th>
                          <th className="px-4 py-3 text-left font-semibold">Observações</th>
                          <th className="px-4 py-3 text-center font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayOrders.map((order) => (
                          <tr
                            key={order.id}
                            className={`border-b hover:bg-muted/30 transition-colors ${
                              order.data_saida_nitretacao ? "bg-green-50/20" : "bg-orange-50/10"
                            }`}
                          >
                            <td className="px-4 py-3">
                              <Checkbox
                                checked={selected.has(order.id)}
                                onCheckedChange={() => toggleSelect(order.id)}
                              />
                            </td>
                            <td className="px-4 py-3 font-semibold">
                              {order.ferramenta}
                              {order.sequencia && ` / ${order.sequencia}`}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {editingId === order.id && editField === "data_entrada_nitretacao" ? (
                                <input
                                  type="date"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => handleCellEdit(order.id, "data_entrada_nitretacao", editValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleCellEdit(order.id, "data_entrada_nitretacao", editValue);
                                    }
                                  }}
                                  className="w-full px-2 py-1 border rounded text-xs"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingId(order.id);
                                    setEditField("data_entrada_nitretacao");
                                    setEditValue(order.data_entrada_nitretacao || "");
                                  }}
                                  className="cursor-pointer hover:bg-muted px-2 py-1 rounded block"
                                >
                                  {fmtDateBR(order.data_entrada_nitretacao)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {editingId === order.id && editField === "data_saida_nitretacao" ? (
                                <input
                                  type="date"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => handleCellEdit(order.id, "data_saida_nitretacao", editValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleCellEdit(order.id, "data_saida_nitretacao", editValue);
                                    }
                                  }}
                                  className="w-full px-2 py-1 border rounded text-xs"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingId(order.id);
                                    setEditField("data_saida_nitretacao");
                                    setEditValue(order.data_saida_nitretacao || "");
                                  }}
                                  className="cursor-pointer hover:bg-muted px-2 py-1 rounded block"
                                >
                                  {fmtDateBR(order.data_saida_nitretacao)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs max-w-xs truncate">
                              {editingId === order.id && editField === "observacoes_nitretacao" ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => handleCellEdit(order.id, "observacoes_nitretacao", editValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleCellEdit(order.id, "observacoes_nitretacao", editValue);
                                    }
                                  }}
                                  placeholder="Observações..."
                                  className="w-full px-2 py-1 border rounded text-xs"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingId(order.id);
                                    setEditField("observacoes_nitretacao");
                                    setEditValue(order.observacoes_nitretacao || "");
                                  }}
                                  className="cursor-pointer hover:bg-muted px-2 py-1 rounded block"
                                  title={order.observacoes_nitretacao || ""}
                                >
                                  {order.observacoes_nitretacao || "-"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm("Deletar este registro?")) {
                                    supabase
                                      .from("cleaning_orders")
                                      .delete()
                                      .eq("id", order.id)
                                      .then(() => {
                                        toast({ title: "Sucesso", description: "Registro deletado" });
                                        loadOrders();
                                      });
                                  }
                                }}
                                className="h-8 w-8 p-0 text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile: Cards */}
                  <div className="md:hidden space-y-2 p-3">
                    {dayOrders.map((order) => (
                      <Card key={order.id} className={`border-l-4 ${
                        order.data_saida_nitretacao ? "border-l-green-500 bg-green-50/20" : "border-l-orange-500 bg-orange-50/10"
                      }`}>
                        <CardContent className="p-3 space-y-3">
                          {/* Header do Card */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              <Checkbox
                                checked={selected.has(order.id)}
                                onCheckedChange={() => toggleSelect(order.id)}
                                className="mt-0.5 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="font-bold text-sm">
                                  {order.ferramenta}
                                  {order.sequencia && ` / ${order.sequencia}`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Saída Limpeza: {fmtDateBR(order.data_saida)}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                if (!confirm("Deletar este registro?")) return;
                                try {
                                  const { error } = await supabase.from("cleaning_orders").delete().eq("id", order.id);
                                  if (error) throw error;
                                  toast({ title: "Sucesso", description: "Registro deletado" });
                                  loadOrders();
                                } catch (err: any) {
                                  toast({ title: "Erro", description: err?.message ?? String(err), variant: "destructive" });
                                }
                              }}
                              className="h-8 w-8 p-0 text-red-600 shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {/* Informações */}
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground text-xs">Entrada Nitretação:</span>
                              <span
                                onClick={() => {
                                  setEditingId(order.id);
                                  setEditField("data_entrada_nitretacao");
                                  setEditValue(order.data_entrada_nitretacao || "");
                                }}
                                className="font-medium text-xs cursor-pointer hover:bg-muted px-2 py-1 rounded"
                              >
                                {editingId === order.id && editField === "data_entrada_nitretacao" ? (
                                  <input
                                    type="date"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => handleCellEdit(order.id, "data_entrada_nitretacao", editValue)}
                                    className="w-full px-2 py-1 border rounded text-xs"
                                    autoFocus
                                  />
                                ) : (
                                  fmtDateBR(order.data_entrada_nitretacao)
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground text-xs">Saída Nitretação:</span>
                              <span
                                onClick={() => {
                                  setEditingId(order.id);
                                  setEditField("data_saida_nitretacao");
                                  setEditValue(order.data_saida_nitretacao || "");
                                }}
                                className="font-medium text-xs cursor-pointer hover:bg-muted px-2 py-1 rounded"
                              >
                                {editingId === order.id && editField === "data_saida_nitretacao" ? (
                                  <input
                                    type="date"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => handleCellEdit(order.id, "data_saida_nitretacao", editValue)}
                                    className="w-full px-2 py-1 border rounded text-xs"
                                    autoFocus
                                  />
                                ) : (
                                  fmtDateBR(order.data_saida_nitretacao)
                                )}
                              </span>
                            </div>
                            {order.observacoes_nitretacao && (
                              <div className="pt-2 border-t">
                                <p className="text-xs text-muted-foreground mb-1">Observações:</p>
                                <p
                                  onClick={() => {
                                    setEditingId(order.id);
                                    setEditField("observacoes_nitretacao");
                                    setEditValue(order.observacoes_nitretacao || "");
                                  }}
                                  className="text-xs cursor-pointer hover:bg-muted px-2 py-1 rounded"
                                >
                                  {editingId === order.id && editField === "observacoes_nitretacao" ? (
                                    <input
                                      type="text"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={() => handleCellEdit(order.id, "observacoes_nitretacao", editValue)}
                                      placeholder="Observações..."
                                      className="w-full px-2 py-1 border rounded text-xs"
                                      autoFocus
                                    />
                                  ) : (
                                    order.observacoes_nitretacao
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
