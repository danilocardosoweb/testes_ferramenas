import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { Trash2, Check, AlertCircle, Download } from "lucide-react";

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
  nfSaida: string;
}

interface EditingCell {
  orderId: string;
  field: string;
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

export function CleaningOrdersView() {
  const [orders, setOrders] = useState<CleaningOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<CleaningOrder>>({});
  const [filters, setFilters] = useState<FilterState>({
    status: "em_limpeza",
    dataInicio: "",
    dataFim: "",
    ferramenta: "",
    nfSaida: "",
  });
  const { toast } = useToast();

  // Carregar dados
  useEffect(() => {
    loadOrders();
  }, [filters]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from("cleaning_orders").select("*");

      // Filtro de status
      if (filters.status === "em_limpeza") {
        query = query.is("data_retorno", null);
      } else if (filters.status === "retornadas") {
        query = query.not("data_retorno", "is", null);
      }

      // Filtro de período
      if (filters.dataInicio) {
        query = query.gte("data_saida", filters.dataInicio);
      }
      if (filters.dataFim) {
        query = query.lte("data_saida", filters.dataFim);
      }

      // Filtro de ferramenta
      if (filters.ferramenta.trim()) {
        query = query.ilike("ferramenta", `%${filters.ferramenta.trim()}%`);
      }

      // Filtro de NF Saída
      if (filters.nfSaida.trim()) {
        query = query.ilike("nf_saida", `%${filters.nfSaida.trim()}%`);
      }

      const { data, error: err } = await query.order("data_saida", { ascending: false });

      if (err) throw err;
      setOrders((data as CleaningOrder[]) || []);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (order: CleaningOrder) => {
    setEditingId(order.id);
    setEditData({ ...order });
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      const { error: err } = await supabase
        .from("cleaning_orders")
        .update({
          nf_saida: editData.nf_saida || null,
          data_retorno: editData.data_retorno || null,
          nf_retorno: editData.nf_retorno || null,
          nitretacao: editData.nitretacao ?? false,
          observacoes: editData.observacoes || null,
        })
        .eq("id", editingId);

      if (err) throw err;
      toast({ title: "Sucesso", description: "Registro atualizado" });
      setEditingId(null);
      loadOrders();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este registro?")) return;
    try {
      const { error: err } = await supabase.from("cleaning_orders").delete().eq("id", id);
      if (err) throw err;
      toast({ title: "Sucesso", description: "Registro deletado" });
      loadOrders();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  const filteredOrders = orders;

  const stats = {
    total: orders.length,
    emLimpeza: orders.filter((o) => !o.data_retorno).length,
    retornadas: orders.filter((o) => o.data_retorno).length,
    comNitretacao: orders.filter((o) => o.nitretacao).length,
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
                <option value="em_limpeza">Em Limpeza</option>
                <option value="retornadas">Retornadas</option>
                <option value="todas">Todas</option>
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
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                NF Saída
              </label>
              <Input
                type="text"
                placeholder="Ex: NF-12345"
                value={filters.nfSaida}
                onChange={(e) =>
                  setFilters({ ...filters, nfSaida: e.target.value })
                }
                className="h-10 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() =>
                  setFilters({
                    status: "em_limpeza",
                    dataInicio: "",
                    dataFim: "",
                    ferramenta: "",
                    nfSaida: "",
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

      {/* Listagem */}
      {loading && <div className="text-center py-8 text-muted-foreground">Carregando…</div>}
      {error && <div className="text-center py-8 text-red-600">Erro: {error}</div>}
      {!loading && filteredOrders.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">Nenhum registro encontrado.</div>
      )}

      {!loading && filteredOrders.length > 0 && (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className={`border-l-4 ${
                order.data_retorno
                  ? "border-l-green-500 bg-green-50/30"
                  : "border-l-blue-500 bg-blue-50/30"
              }`}
            >
              <CardContent className="p-4">
                {editingId === order.id ? (
                  // Modo edição
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-semibold block mb-1">
                          NF Saída
                        </label>
                        <Input
                          type="text"
                          placeholder="Ex: NF-12345"
                          value={editData.nf_saida || ""}
                          onChange={(e) =>
                            setEditData({
                              ...editData,
                              nf_saida: e.target.value || null,
                            })
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold block mb-1">
                          Data Retorno
                        </label>
                        <Input
                          type="date"
                          value={editData.data_retorno || ""}
                          onChange={(e) =>
                            setEditData({
                              ...editData,
                              data_retorno: e.target.value || null,
                            })
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold block mb-1">
                          NF Retorno
                        </label>
                        <Input
                          type="text"
                          placeholder="Ex: NF-12345"
                          value={editData.nf_retorno || ""}
                          onChange={(e) =>
                            setEditData({
                              ...editData,
                              nf_retorno: e.target.value || null,
                            })
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={editData.nitretacao ?? false}
                            onCheckedChange={(checked) =>
                              setEditData({
                                ...editData,
                                nitretacao: Boolean(checked),
                              })
                            }
                          />
                          <span className="text-sm font-semibold">Nitretação</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">
                        Observações
                      </label>
                      <textarea
                        value={editData.observacoes || ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            observacoes: e.target.value || null,
                          })
                        }
                        placeholder="Adicione observações..."
                        className="w-full h-20 rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        className="h-9"
                      >
                        Cancelar
                      </Button>
                      <Button onClick={handleSave} className="h-9">
                        <Check className="h-4 w-4 mr-1" />
                        Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Modo visualização
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-base">
                          {order.ferramenta}
                          {order.sequencia && ` / ${order.sequencia}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Saída: {fmtDateBR(order.data_saida)}
                          {order.data_retorno && ` | Retorno: ${fmtDateBR(order.data_retorno)}`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(order)}
                          className="h-8 w-8 p-0"
                          title="Editar"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(order.id)}
                          className="h-8 w-8 p-0 text-red-600"
                          title="Deletar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      {order.nf_saida && (
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded">
                          NF Saída: {order.nf_saida}
                        </span>
                      )}
                      {order.nf_retorno && (
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded">
                          NF Retorno: {order.nf_retorno}
                        </span>
                      )}
                      {order.nitretacao && (
                        <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Nitretação
                        </span>
                      )}
                      {!order.data_retorno && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          Em Limpeza
                        </span>
                      )}
                      {order.data_retorno && (
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                          Retornada
                        </span>
                      )}
                    </div>

                    {order.observacoes && (
                      <div className="bg-muted/50 rounded p-2 text-xs">
                        <p className="font-semibold mb-1">Observações:</p>
                        <p className="text-muted-foreground">{order.observacoes}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
