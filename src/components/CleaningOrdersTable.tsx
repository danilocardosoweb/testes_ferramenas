import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { Trash2, Check, AlertCircle, Download, ChevronDown, ChevronRight, Mail, MoreVertical, Edit } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CleaningOrder {
  id: string;
  ferramenta: string;
  sequencia: string;
  data_saida: string;
  data_retorno: string | null;
  nf_saida: string | null;
  nf_retorno: string | null;
  nitretacao: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

interface FilterState {
  status: "em_limpeza" | "retornadas" | "todas";
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

export function CleaningOrdersTable() {
  const [orders, setOrders] = useState<CleaningOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [bulkReturnDate, setBulkReturnDate] = useState<Record<string, string>>({});
  const [bulkNF, setBulkNF] = useState<Record<string, string>>({});
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
      let query = supabase.from("cleaning_orders").select("*");

      if (filters.status === "em_limpeza") {
        query = query.is("data_retorno", null);
      } else if (filters.status === "retornadas") {
        query = query.not("data_retorno", "is", null);
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
      setOrders((data as CleaningOrder[]) || []);
      setSelected(new Set());
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyBulkForDay = async (date: string, dayOrders: CleaningOrder[]) => {
    const daySelected = dayOrders.filter((o) => selected.has(o.id)).map((o) => o.id);
    const retDate = bulkReturnDate[date]?.trim();
    const nf = bulkNF[date]?.trim();
    if (daySelected.length === 0) {
      toast({ title: "Seleção vazia", description: "Selecione ao menos uma ferramenta do dia para aplicar.", variant: "destructive" });
      return;
    }
    if (!retDate && !nf) {
      toast({ title: "Nada a aplicar", description: "Informe Data de Retorno e/ou NF Retorno.", variant: "destructive" });
      return;
    }
    const updateData: any = {};
    if (retDate) updateData.data_retorno = retDate;
    if (nf) updateData.nf_retorno = nf;
    try {
      const { error } = await supabase.from("cleaning_orders").update(updateData).in("id", daySelected);
      if (error) throw error;
      toast({ title: "Aplicado", description: `Atualizado(s) ${daySelected.length} registro(s) do dia ${fmtDateBR(date)}.` });
      // Limpa somente os inputs (opcional manter)
      setBulkReturnDate((prev) => ({ ...prev, [date]: retDate || "" }));
      setBulkNF((prev) => ({ ...prev, [date]: nf || "" }));
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
      if (field === "data_retorno") {
        updateData.data_retorno = value || null;
      } else if (field === "nf_retorno") {
        updateData.nf_retorno = value || null;
      } else if (field === "nitretacao") {
        updateData.nitretacao = Boolean(value);
      } else if (field === "observacoes") {
        updateData.observacoes = value || null;
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

  const handleBatchReturn = async () => {
    if (selected.size === 0) {
      toast({ title: "Aviso", description: "Selecione ao menos uma ferramenta" });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    try {
      const { error: err } = await supabase
        .from("cleaning_orders")
        .update({ data_retorno: today })
        .in("id", Array.from(selected));

      if (err) throw err;
      toast({
        title: "Sucesso",
        description: `${selected.size} ferramenta(s) marcada(s) como retornada(s)`,
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

  const isLoteComplete = (dayOrders: CleaningOrder[]): boolean => {
    return dayOrders.every(
      (order) => order.data_retorno !== null || order.nitretacao === true
    );
  };

  const handleFinalizeLote = async (date: string, dayOrders: CleaningOrder[]) => {
    if (!isLoteComplete(dayOrders)) {
      toast({
        title: "Lote Incompleto",
        description: "Todas as ferramentas devem estar retornadas ou marcadas para nitretação",
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
    {} as Record<string, CleaningOrder[]>
  );

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const stats = {
    total: orders.length,
    emLimpeza: orders.filter((o) => !o.data_retorno).length,
    retornadas: orders.filter((o) => o.data_retorno).length,
    comNitretacao: orders.filter((o) => o.nitretacao).length,
  };

  const buildMailtoForDay = (dateISO: string, dayOrders: CleaningOrder[], selectedIds: Set<string>) => {
    const dateBR = fmtDateBR(dateISO);
    const chosen = dayOrders.filter((o) => selectedIds.size > 0 ? selectedIds.has(o.id) : true);
    const lines: string[] = [];
    lines.push(`Prezados,`);
    lines.push("");
    lines.push(`Solicito a emissão da Nota Fiscal de Saída referente ao Romaneio de Limpeza do dia ${dateBR}.`);
    lines.push("");
    lines.push(`Relação de ferramentas:`);
    lines.push(`Ferramenta/Seq | Data Saída | Nitretação | Observações`);
    lines.push(`-------------------------------------------------------`);
    for (const o of chosen) {
      const nitre = o.nitretacao ? "Sim" : "Não";
      const obs = o.observacoes ? String(o.observacoes) : "-";
      lines.push(`${o.ferramenta}${o.sequencia ? ` / ${o.sequencia}` : ""} | ${fmtDateBR(o.data_saida)} | ${nitre} | ${obs}`);
    }
    lines.push("");
    lines.push(`Caso necessitem de informação adicional, fico à disposição.`);
    lines.push("");
    lines.push(`Atenciosamente,`);
    lines.push(``);
    const body = encodeURIComponent(lines.join("\n"));
    const subject = encodeURIComponent(`Solicitação de NF de Saída – Romaneio ${dateBR}`);
    return `mailto:?subject=${subject}&body=${body}`;
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
                <option value="em_limpeza">Em Limpeza</option>
                <option value="retornadas">Retornadas</option>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Em Limpeza</div>
            <div className="text-2xl font-bold text-blue-600">{stats.emLimpeza}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Retornadas</div>
            <div className="text-2xl font-bold text-green-600">{stats.retornadas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Com Nitretação</div>
            <div className="text-2xl font-bold text-orange-600">{stats.comNitretacao}</div>
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
                  onClick={handleBatchReturn}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Baixar Retorno
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
            const dayEmLimpeza = dayOrders.filter((o) => !o.data_retorno).length;
            const dayRetornadas = dayOrders.filter((o) => o.data_retorno).length;

            return (
              <div key={date} className="border rounded-lg overflow-hidden">
                {/* Header do Dia */}
                <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-3 md:px-4 py-3 flex items-center justify-between gap-2 md:gap-3 border-b">
                  <button
                    onClick={() => toggleDay(date)}
                    className="flex items-center gap-2 md:gap-3 flex-1 hover:opacity-80 transition-opacity min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 md:h-5 md:w-5 text-primary shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="text-left min-w-0">
                      <p className="font-semibold text-xs md:text-sm">
                        {fmtDateBR(date)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {dayOrders.length} ferr. • {dayEmLimpeza} limp. • {dayRetornadas} ret.
                      </p>
                    </div>
                  </button>
                  {/* Desktop: inputs inline */}
                  <div className="hidden md:flex items-center gap-2">
                    <input
                      type="date"
                      value={bulkReturnDate[date] || ""}
                      onChange={(e) => setBulkReturnDate((p) => ({ ...p, [date]: e.target.value }))}
                      className="h-8 text-xs px-2 py-1 border rounded"
                      title="Data de Retorno (aplicar aos selecionados)"
                    />
                    <input
                      type="text"
                      placeholder="NF..."
                      value={bulkNF[date] || ""}
                      onChange={(e) => setBulkNF((p) => ({ ...p, [date]: e.target.value }))}
                      className="h-8 text-xs px-2 py-1 border rounded"
                      title="NF Retorno (aplicar aos selecionados)"
                    />
                    <Button size="sm" variant="outline" onClick={() => handleApplyBulkForDay(date, dayOrders)}>
                      Aplicar aos selecionados
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = buildMailtoForDay(date, dayOrders, selected);
                        window.location.href = url;
                      }}
                      title="Gerar e-mail de solicitação de NF de Saída"
                    >
                      <Mail className="h-4 w-4 mr-1" /> Enviar E-mail
                    </Button>
                  </div>
                  {/* Mobile: menu dropdown */}
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
                            <label className="text-sm font-semibold mb-2 block">Data de Retorno</label>
                            <Input
                              type="date"
                              value={bulkReturnDate[date] || ""}
                              onChange={(e) => setBulkReturnDate((p) => ({ ...p, [date]: e.target.value }))}
                              className="h-11"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-semibold mb-2 block">NF Retorno</label>
                            <Input
                              type="text"
                              placeholder="Ex: 123456"
                              value={bulkNF[date] || ""}
                              onChange={(e) => setBulkNF((p) => ({ ...p, [date]: e.target.value }))}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 px-2">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            const url = buildMailtoForDay(date, dayOrders, selected);
                            window.location.href = url;
                          }}
                        >
                          <Mail className="h-4 w-4 mr-2" /> Enviar E-mail
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                          <th className="px-4 py-3 text-left font-semibold">Retorno</th>
                          <th className="px-4 py-3 text-left font-semibold">NF Retorno</th>
                          <th className="px-4 py-3 text-center font-semibold">Nitretação</th>
                          <th className="px-4 py-3 text-left font-semibold">Observações</th>
                          <th className="px-4 py-3 text-center font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayOrders.map((order) => (
                          <tr
                            key={order.id}
                            className={`border-b hover:bg-muted/30 transition-colors ${
                              order.data_retorno ? "bg-green-50/20" : "bg-blue-50/10"
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
                              {editingId === order.id && editField === "data_retorno" ? (
                                <input
                                  type="date"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => handleCellEdit(order.id, "data_retorno", editValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleCellEdit(order.id, "data_retorno", editValue);
                                    }
                                  }}
                                  className="w-full px-2 py-1 border rounded text-xs"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingId(order.id);
                                    setEditField("data_retorno");
                                    setEditValue(order.data_retorno || "");
                                  }}
                                  className="cursor-pointer hover:bg-muted px-2 py-1 rounded block"
                                >
                                  {fmtDateBR(order.data_retorno)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {editingId === order.id && editField === "nf_retorno" ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => handleCellEdit(order.id, "nf_retorno", editValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleCellEdit(order.id, "nf_retorno", editValue);
                                    }
                                  }}
                                  placeholder="NF-..."
                                  className="w-full px-2 py-1 border rounded text-xs"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingId(order.id);
                                    setEditField("nf_retorno");
                                    setEditValue(order.nf_retorno || "");
                                  }}
                                  className="cursor-pointer hover:bg-muted px-2 py-1 rounded block"
                                >
                                  {order.nf_retorno || "-"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Checkbox
                                checked={order.nitretacao}
                                onCheckedChange={(checked) => {
                                  handleCellEdit(order.id, "nitretacao", checked);
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 text-xs max-w-xs truncate">
                              {editingId === order.id && editField === "observacoes" ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => handleCellEdit(order.id, "observacoes", editValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleCellEdit(order.id, "observacoes", editValue);
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
                                    setEditField("observacoes");
                                    setEditValue(order.observacoes || "");
                                  }}
                                  className="cursor-pointer hover:bg-muted px-2 py-1 rounded block"
                                  title={order.observacoes || ""}
                                >
                                  {order.observacoes || "-"}
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
                        order.data_retorno ? "border-l-green-500 bg-green-50/20" : "border-l-blue-500 bg-blue-50/10"
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
                                  Saída: {fmtDateBR(order.data_saida)}
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
                              <span className="text-muted-foreground text-xs">Retorno:</span>
                              <span
                                onClick={() => {
                                  setEditingId(order.id);
                                  setEditField("data_retorno");
                                  setEditValue(order.data_retorno || "");
                                }}
                                className="font-medium text-xs cursor-pointer hover:bg-muted px-2 py-1 rounded"
                              >
                                {editingId === order.id && editField === "data_retorno" ? (
                                  <input
                                    type="date"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => handleCellEdit(order.id, "data_retorno", editValue)}
                                    className="w-full px-2 py-1 border rounded text-xs"
                                    autoFocus
                                  />
                                ) : (
                                  fmtDateBR(order.data_retorno)
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground text-xs">NF Retorno:</span>
                              <span
                                onClick={() => {
                                  setEditingId(order.id);
                                  setEditField("nf_retorno");
                                  setEditValue(order.nf_retorno || "");
                                }}
                                className="font-medium text-xs cursor-pointer hover:bg-muted px-2 py-1 rounded"
                              >
                                {editingId === order.id && editField === "nf_retorno" ? (
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => handleCellEdit(order.id, "nf_retorno", editValue)}
                                    placeholder="NF-..."
                                    className="w-full px-2 py-1 border rounded text-xs"
                                    autoFocus
                                  />
                                ) : (
                                  order.nf_retorno || "-"
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground text-xs">Nitretação:</span>
                              <Checkbox
                                checked={order.nitretacao}
                                onCheckedChange={(checked) => {
                                  handleCellEdit(order.id, "nitretacao", checked);
                                }}
                              />
                            </div>
                            {order.observacoes && (
                              <div className="pt-2 border-t">
                                <p className="text-xs text-muted-foreground mb-1">Observações:</p>
                                <p
                                  onClick={() => {
                                    setEditingId(order.id);
                                    setEditField("observacoes");
                                    setEditValue(order.observacoes || "");
                                  }}
                                  className="text-xs cursor-pointer hover:bg-muted px-2 py-1 rounded"
                                >
                                  {editingId === order.id && editField === "observacoes" ? (
                                    <input
                                      type="text"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={() => handleCellEdit(order.id, "observacoes", editValue)}
                                      placeholder="Observações..."
                                      className="w-full px-2 py-1 border rounded text-xs"
                                      autoFocus
                                    />
                                  ) : (
                                    order.observacoes
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
