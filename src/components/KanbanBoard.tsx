import React, { useEffect, useMemo, useState } from "react";
import { Matrix } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Edit3, Save, X, Calendar, AlertTriangle, FlagTriangleRight, CheckSquare, Square, Upload, Download, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  kanbanListColumns,
  kanbanGetWip,
  kanbanSetWip,
  kanbanListCards,
  kanbanCreateCard,
  kanbanUpdateCard,
  kanbanMoveCard,
  kanbanDeleteCard,
  kanbanAddChecklist,
  kanbanToggleChecklist,
  // kanbanListChecklist (poderemos usar sob demanda)
} from "@/services/db";

// Tipos de dados locais do Kanban
export type KanbanColumnId = "backlog" | "em_andamento" | "concluido";

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  createdAt: string; // ISO
  matrixId?: string;
  matrixCode?: string;
  source?: "auto" | "manual"; // auto = gerado por evento "Correção Externa Saída"
  blocked?: boolean;
  checklist?: { id: string; text: string; done: boolean }[];
}

interface KanbanState {
  columns: Record<KanbanColumnId, string[]>; // ids dos cards por coluna
  cards: Record<string, KanbanCard>;
  movedAt: Record<string, { column: KanbanColumnId; movedAt: string }>; // controle de aging
  wip: Record<KanbanColumnId, number>; // limites por coluna
  compact: boolean; // densidade visual
  columnIdBySlug: Partial<Record<KanbanColumnId, string>>; // ids reais no banco
}

interface Props {
  matrices: Matrix[];
}

const STORAGE_KEY = "kanban_state_v2";

function loadState(): KanbanState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KanbanState) : null;
  } catch {
    return null;
  }
}

function saveState(state: KanbanState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function newEmptyState(): KanbanState {
  return {
    columns: {
      backlog: [],
      em_andamento: [],
      concluido: [],
    },
    cards: {},
    movedAt: {},
    wip: { backlog: 999, em_andamento: 5, concluido: 999 },
    compact: false,
    columnIdBySlug: {},
  };
}

export default function KanbanBoard({ matrices }: Props) {
  const [state, setState] = useState<KanbanState>(() => loadState() ?? newEmptyState());
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<"all" | "auto" | "manual">("all");
  const [filterFolder, setFilterFolder] = useState<string | "all">("all");
  const [filterResponsible, setFilterResponsible] = useState<string | "all">("all");

  // Carregar dados do Kanban do Supabase
  const reloadFromDb = async () => {
    try {
      const [cols, wip, cards] = await Promise.all([
        kanbanListColumns(),
        kanbanGetWip(),
        kanbanListCards(),
      ]);
      const idBySlug: Partial<Record<KanbanColumnId, string>> = {};
      const slugById: Record<string, KanbanColumnId> = {} as any;
      for (const c of cols) {
        idBySlug[c.slug] = c.id;
        slugById[c.id] = c.slug;
      }
      const wipMap: Record<KanbanColumnId, number> = { backlog: 999, em_andamento: 5, concluido: 999 };
      for (const w of wip) {
        const slug = slugById[w.column_id];
        if (slug) wipMap[slug] = w.limit_value;
      }
      const newState = newEmptyState();
      newState.wip = wipMap;
      newState.columnIdBySlug = idBySlug;
      for (const row of cards) {
        const slug = slugById[row.column_id] || 'backlog';
        newState.cards[row.id] = {
          id: row.id,
          title: row.title,
          description: row.description ?? undefined,
          createdAt: row.created_at,
          matrixId: row.matrix_id ?? undefined,
          matrixCode: row.matrix_code ?? undefined,
          source: row.source,
          blocked: row.blocked,
          checklist: [],
        };
        newState.columns[slug] = [...newState.columns[slug], row.id];
        newState.movedAt[row.id] = { column: slug, movedAt: row.moved_at ?? row.created_at };
      }
      setState(newState);
      toast({ title: "Kanban atualizado", description: `Carregado do banco (${cards.length} cards).` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Falha ao carregar Kanban", description: String(err?.message || err), variant: "destructive" });
    }
  };

  useEffect(() => { reloadFromDb(); }, []);
  // Atualiza cards quando eventos/matrizes mudarem (ex.: triggers criam/movem cards)
  useEffect(() => { reloadFromDb(); }, [matrices]);

  const persist = (updater: (s: KanbanState) => KanbanState) => {
    setState((prev) => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  };

  // Criar card manual
  const createManualCard = () => {
    if (!newTitle.trim()) return;
    const title = newTitle.trim();
    (async () => {
      try {
        const backlogId = state.columnIdBySlug.backlog!;
        const id = await kanbanCreateCard({ title, description: newDesc.trim() || null, column_id: backlogId, source: 'manual' });
        // otimista
        const card: KanbanCard = { id, title, description: newDesc.trim() || undefined, createdAt: new Date().toISOString(), source: 'manual' };
        persist((s) => ({ ...s, cards: { ...s.cards, [id]: card }, columns: { ...s.columns, backlog: [id, ...s.columns.backlog] }, movedAt: { ...s.movedAt, [id]: { column: 'backlog', movedAt: new Date().toISOString() } } }));
      } catch (err: any) {
        console.error(err);
        toast({ title: "Falha ao criar card", description: String(err?.message || err), variant: "destructive" });
      }
    })();
    setNewTitle("");
    setNewDesc("");
    setCreating(false);
  };

  // Alternar bloqueio do card
  const toggleBlocked = (cardId: string) => {
    const nextVal = !state.cards[cardId]?.blocked;
    (async () => {
      try { await kanbanUpdateCard(cardId, { blocked: nextVal }); }
      catch (err: any) { console.error(err); toast({ title: "Falha ao bloquear/desbloquear", description: String(err?.message || err), variant: "destructive" }); return; }
      persist((s) => ({ ...s, cards: { ...s.cards, [cardId]: { ...s.cards[cardId], blocked: nextVal } } }));
    })();
  };

  // Checklist: alterna item
  const toggleChecklist = (cardId: string, itemId: string) => {
    const current = state.cards[cardId]?.checklist?.find((i) => i.id === itemId)?.done ?? false;
    (async () => {
      try { await kanbanToggleChecklist(itemId, !current); }
      catch (err: any) { console.error(err); toast({ title: "Falha ao alternar checklist", description: String(err?.message || err), variant: "destructive" }); return; }
      persist((s) => {
        const card = s.cards[cardId];
        const list = card.checklist ?? [];
        const next = list.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it));
        return { ...s, cards: { ...s.cards, [cardId]: { ...card, checklist: next } } };
      });
    })();
  };

  // Checklist: adicionar item com Enter
  const addChecklistOnEnter = (e: React.KeyboardEvent<HTMLInputElement>, cardId: string) => {
    if (e.key !== "Enter") return;
    const input = e.currentTarget as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    (async () => {
      try {
        const id = await kanbanAddChecklist(cardId, text);
        persist((s) => {
          const card = s.cards[cardId];
          const list = card.checklist ?? [];
          const item = { id, text, done: false };
          return { ...s, cards: { ...s.cards, [cardId]: { ...card, checklist: [...list, item] } } };
        });
      } catch (err: any) {
        console.error(err);
        toast({ title: "Falha ao adicionar item", description: String(err?.message || err), variant: "destructive" });
      }
    })();
    input.value = "";
  };

  // Exportar/Importar estado
  const exportState = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kanban_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importState = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as KanbanState;
      // validação simples
      if (!parsed.columns || !parsed.cards) throw new Error("Arquivo inválido");
      setState(parsed);
      saveState(parsed);
      toast({ title: "Kanban importado", description: "Os cards e colunas foram carregados do arquivo." });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Falha ao importar", description: String(err?.message || err), variant: "destructive" });
    } finally {
      e.target.value = ""; // permite reimportar o mesmo arquivo
    }
  };

  // Excluir card
  const deleteCard = (cardId: string) => {
    (async () => {
      try { await kanbanDeleteCard(cardId); }
      catch (err: any) { console.error(err); toast({ title: "Falha ao excluir card", description: String(err?.message || err), variant: "destructive" }); return; }
      persist((s) => {
        const { [cardId]: _, ...restCards } = s.cards;
        const columns: KanbanState["columns"] = {
          backlog: s.columns.backlog.filter((id) => id !== cardId),
          em_andamento: s.columns.em_andamento.filter((id) => id !== cardId),
          concluido: s.columns.concluido.filter((id) => id !== cardId),
        };
        return { ...s, cards: restCards, columns };
      });
    })();
  };

  // Editar card
  const startEdit = (cardId: string) => {
    const c = state.cards[cardId];
    if (!c) return;
    setEditingId(cardId);
    setEditTitle(c.title);
    setEditDesc(c.description || "");
  };
  const saveEdit = () => {
    if (!editingId) return;
    const title = editTitle.trim();
    const description = editDesc.trim();
    (async () => {
      try {
        await kanbanUpdateCard(editingId, { title, description });
        persist((s) => ({
          ...s,
          cards: {
            ...s.cards,
            [editingId]: { ...s.cards[editingId], title: title || s.cards[editingId].title, description: description || undefined },
          },
        }));
      } catch (err: any) {
        console.error(err);
        toast({ title: "Falha ao editar card", description: String(err?.message || err), variant: "destructive" });
      }
    })();
    setEditingId(null);
  };

  // Drag and Drop simples (HTML5)
  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };
  const onDrop = (e: React.DragEvent, col: KanbanColumnId) => {
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    persist((s) => {
      // remove de todas
      const removeFrom = (arr: string[]) => arr.filter((x) => x !== id);
      const columns: KanbanState["columns"] = {
        backlog: removeFrom(s.columns.backlog),
        em_andamento: removeFrom(s.columns.em_andamento),
        concluido: removeFrom(s.columns.concluido),
      };
      // Checar WIP
      const futureCount = columns[col].length + 1;
      if (futureCount > s.wip[col]) {
        toast({ title: "Limite WIP excedido", description: `A coluna selecionada permite no máximo ${s.wip[col]} cards.`, variant: "destructive" });
        return s;
      }
      // adiciona na coluna alvo (no topo)
      columns[col] = [id, ...columns[col]];
      const movedAt = { ...s.movedAt, [id]: { column: col, movedAt: new Date().toISOString() } };
      // requisicao assíncrona (não bloqueia UI)
      (async () => {
        try {
          const colId = state.columnIdBySlug[col]!;
          await kanbanMoveCard(id, colId);
        } catch (err: any) {
          console.error(err);
          toast({ title: "Falha ao mover card", description: String(err?.message || err), variant: "destructive" });
          reloadFromDb(); // recuperar estado do banco
        }
      })();
      return { ...s, columns, movedAt };
    });
  };

  // Helpers
  const matrixById = useMemo(() => Object.fromEntries(matrices.map((m) => [m.id, m])), [matrices]);
  const distinctFolders = useMemo(() => Array.from(new Set(matrices.map((m) => m.folder).filter(Boolean))) as string[], [matrices]);
  const distinctResponsibles = useMemo(() => Array.from(new Set(matrices.map((m) => m.responsible).filter(Boolean))) as string[], [matrices]);

  const matchesFilters = (card: KanbanCard) => {
    if (filterSource !== "all" && card.source !== filterSource) return false;
    if (search.trim()) {
      const t = search.toLowerCase();
      const text = `${card.title} ${card.description ?? ""} ${card.matrixCode ?? ""}`.toLowerCase();
      if (!text.includes(t)) return false;
    }
    if (filterFolder !== "all" && card.matrixId) {
      const m = matrixById[card.matrixId];
      if (!m || m.folder !== filterFolder) return false;
    }
    if (filterResponsible !== "all" && card.matrixId) {
      const m = matrixById[card.matrixId];
      if (!m || m.responsible !== filterResponsible) return false;
    }
    return true;
  };

  const daysInColumn = (cardId: string) => {
    const meta = state.movedAt[cardId];
    const start = meta?.movedAt ? new Date(meta.movedAt).getTime() : new Date(state.cards[cardId]?.createdAt ?? Date.now()).getTime();
    const diff = Date.now() - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const Column: React.FC<{ id: KanbanColumnId; title: string; hint?: string }> = ({ id, title, hint }) => (
    <div
      className="flex-1 min-w-[320px] bg-muted/40 rounded-lg border p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, id)}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="space-y-3">
        {state.columns[id].map((cid) => {
          const c = state.cards[cid];
          if (!c) return null;
          const isEditing = editingId === cid;
          return (
            <Card
              key={cid}
              className="shadow-sm cursor-move"
              draggable
              onDragStart={(e) => onDragStart(e, cid)}
            >
              <CardContent className="p-3">
                {!isEditing ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      {c.matrixCode ? (
                        <Badge variant="default" className="bg-blue-600 text-white">{c.matrixCode}</Badge>
                      ) : null}
                      {c.source === "auto" ? (
                        <Badge variant="outline" className="border-yellow-400 text-yellow-700">Correção Externa</Badge>
                      ) : (
                        <Badge variant="outline">Manual</Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(c.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                    <div className="font-semibold mb-1">{c.title}</div>
                    {c.description && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{c.description}</div>}
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(cid)}>
                        <Edit3 className="w-4 h-4 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => deleteCard(cid)}>
                        <Trash2 className="w-4 h-4 mr-1" /> Excluir
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit}><Save className="w-4 h-4 mr-1" />Salvar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="w-4 h-4 mr-1" />Cancelar</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {state.columns[id].length === 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Sem cards</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Controles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">Kanban</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Linha 1: filtros principais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <Input placeholder="Buscar por código, título ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterSource} onValueChange={(v: any) => setFilterSource(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Origens</SelectItem>
                <SelectItem value="auto">Automáticos</SelectItem>
                <SelectItem value="manual">Manuais</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={state.compact ? "default" : "outline"} onClick={() => persist((s) => ({ ...s, compact: !s.compact }))}>Modo {state.compact ? "Detalhado" : "Compacto"}</Button>
          </div>

          {/* Linha 2: filtros por pasta/responsável e WIP */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select value={filterFolder} onValueChange={(v: any) => setFilterFolder(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Pasta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Pastas</SelectItem>
                {distinctFolders.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterResponsible} onValueChange={(v: any) => setFilterResponsible(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Responsáveis</SelectItem>
                {distinctResponsibles.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">WIP Em Andamento</span>
              <Input type="number" value={state.wip.em_andamento}
                onChange={(e) => {
                  const val = Math.max(1, Number(e.target.value) || 1);
                  persist((s) => ({ ...s, wip: { ...s.wip, em_andamento: val } }));
                  const colId = state.columnIdBySlug.em_andamento; if (colId) kanbanSetWip(colId, val);
                }}
                className="w-24" />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={exportState}><Download className="w-4 h-4 mr-1" />Exportar</Button>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                <Upload className="w-4 h-4" />
                <input type="file" accept="application/json" className="hidden" onChange={importState} />
                Importar
              </label>
              <Button size="sm" onClick={reloadFromDb}><RefreshCw className="w-4 h-4 mr-1" />Recarregar</Button>
            </div>
          </div>

          {/* Criar novo card */}
          {!creating ? (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Crie cards livremente. Os cards de <strong>Correção Externa (Saída)</strong> são gerados automaticamente quando a matriz sai para correção.</div>
              <Button onClick={() => setCreating(true)} size="sm"><Plus className="w-4 h-4 mr-1" />Novo Card</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Título</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex.: Reunião com fornecedor" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Descrição</label>
                <Textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Detalhes adicionais..." />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <Button size="sm" onClick={createManualCard}><Save className="w-4 h-4 mr-1" />Salvar</Button>
                <Button size="sm" variant="outline" onClick={() => { setCreating(false); setNewTitle(""); setNewDesc(""); }}><X className="w-4 h-4 mr-1" />Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Board */}
      <ScrollArea className={`flex-1 ${state.compact ? "[&_.card-content]:p-2" : ""}`}>
        <div className="flex gap-3 min-w-[960px]">
          <Column id="backlog" title="Backlog" hint="Ideias e entradas" />
          <Column id="em_andamento" title="Em Andamento" hint="Em execução" />
          <Column id="concluido" title="Concluído" hint="Finalizado" />
        </div>
      </ScrollArea>
    </div>
  );
}

// Ações auxiliares
function uuid() { return crypto.randomUUID(); }
