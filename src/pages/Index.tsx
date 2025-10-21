import { useState, useEffect } from "react";
import { Matrix, MatrixEvent, AuthSession } from "@/types";
// Supabase services
import {
  listMatrices as sbListMatrices,
  listFolders as sbListFolders,
  createMatrix as sbCreateMatrix,
  updateMatrix as sbUpdateMatrix,
  deleteMatrix as sbDeleteMatrix,
  createEvent as sbCreateEvent,
  updateEvent as sbUpdateEvent,
  deleteEvent as sbDeleteEvent,
  getFolderIdByName,
  createFolder as sbCreateFolder,
  kanbanUpdateLatestAutoCardForMatrix,
} from "@/services/db";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";
import { MatrixSidebar } from "@/components/MatrixSidebar";
import { FlowView } from "@/components/FlowView";
import { MatrixDashboard } from "@/components/MatrixDashboard";
import { ApprovedToolsView } from "@/components/ApprovedToolsView";
import { MatrixSheet, SheetMilestone } from "@/components/MatrixSheet";
import { ChevronRight } from "lucide-react";
import { MatrixForm } from "@/components/MatrixForm";
import { EventForm } from "@/components/EventForm";
import { ImportExport } from "@/components/ImportExport";
import { EventDetailDialog } from "@/components/EventDetailDialog";
import { MatrixEditDialog } from "@/components/MatrixEditDialog";
import { MatrixSummary } from "@/components/MatrixSummary";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import KanbanBoard from "@/components/KanbanBoard";
import ActivityHistory from "@/components/ActivityHistory";
import { TestingView } from "@/components/TestingView";
import { SettingsView } from "@/components/SettingsView";
import { LoginDialog } from "@/components/LoginDialog";
import { ManufacturingView } from "@/components/ManufacturingView";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import NotificationsBell from "@/components/NotificationsBell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentSession, logout } from "@/services/auth";
import { LogIn, LogOut, Settings, RefreshCw } from "lucide-react";

const Index = () => {
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [selectedMatrix, setSelectedMatrix] = useState<Matrix | null>(null);
  const [showNewMatrixForm, setShowNewMatrixForm] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = todas
  const [searchTerm, setSearchTerm] = useState("");
  const formatDatePtBR = (iso: string) => {
    const clean = (iso || "").split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }
    try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return iso; }
  };
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [staleOnly, setStaleOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"flat" | "folders">("flat");
  const [mainView, setMainView] = useState<"timeline" | "sheet" | "dashboard" | "approved" | "activity" | "kanban" | "testing" | "manufacturing" | "settings">("timeline");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const STALE_DAYS = 10;
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [eventDetailDialog, setEventDetailDialog] = useState<{
    open: boolean;
    matrix: Matrix | null;
    event: MatrixEvent | null;
  }>({ open: false, matrix: null, event: null });
  const [matrixEditDialog, setMatrixEditDialog] = useState<{
    open: boolean;
    matrix: Matrix | null;
  }>({ open: false, matrix: null });
  const [manufacturingViewKey, setManufacturingViewKey] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    // Verificar sessão ao carregar
    const session = getCurrentSession();
    setAuthSession(session);

    const bootstrap = async () => {
      try {
        const [mats, flds] = await Promise.all([sbListMatrices(), sbListFolders()]);
        setMatrices(mats);
        setFolders(flds);
      } catch (err: any) {
        console.error(err);
        toast({ title: "Erro ao carregar dados", description: String(err?.message || err), variant: "destructive" });
      }
    };
    bootstrap();
  }, []);

  // Botão de recarregar manualmente
  const reloadAll = async () => {
    try {
      const [mats, flds] = await Promise.all([sbListMatrices(), sbListFolders()]);
      setMatrices(mats);
      setFolders(flds);
      if (selectedMatrix) {
        const refreshed = mats.find((m) => m.id === selectedMatrix.id) || null;
        setSelectedMatrix(refreshed);
      }
      toast({ title: "Dados atualizados" });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao atualizar", description: String(err?.message || err), variant: "destructive" });
    }
  };

  // Realtime Supabase: observa mudanças e refaz o fetch (com debounce)
  useEffect(() => {
    let timer: number | undefined;
    const debouncedReload = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        reloadAll();
      }, 400);
    };

    const channel = supabase
      .channel('realtime-matrices-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matrices' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folders' }, debouncedReload)
      .subscribe((status) => {
        // opcional: poderia logar status
      });

    return () => {
      try { supabase.removeChannel(channel); } catch {}
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const handleNewMatrix = async (matrix: Matrix) => {
    try {
      const folderId = matrix.folder ? await getFolderIdByName(matrix.folder) : null;
      const newId = await sbCreateMatrix({
        code: matrix.code,
        receivedDate: matrix.receivedDate,
        folderId,
        priority: matrix.priority ?? null,
        responsible: matrix.responsible ?? null,
      });
      const created: Matrix = { ...matrix, id: newId };
      setMatrices((prev) => [...prev, created]);
      setSelectedMatrix(created);
      setShowNewMatrixForm(false);
      toast({ title: "Matriz criada", description: `Matriz ${matrix.code} foi criada com sucesso.` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao criar matriz", description: String(err?.message || err), variant: "destructive" });
    }
  };

  const handleCreateFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await sbCreateFolder(trimmed);
      setFolders((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao criar pasta", description: String(err?.message || err), variant: "destructive" });
    }
  };

  const handleSelectFolder = (name: string | null) => {
    setSelectedFolder(name);
    setSelectedMatrix(null);
  };

  const handleMoveMatrixFolder = async (matrixId: string, newFolder: string | null) => {
    try {
      const folderId = newFolder ? await getFolderIdByName(newFolder) : null;
      await sbUpdateMatrix(matrixId, { folderId });
      setMatrices((prev) => prev.map((m) => (m.id === matrixId ? { ...m, folder: newFolder || undefined } : m)));
      if (newFolder && !folders.includes(newFolder)) {
        setFolders((prev) => [...prev, newFolder]);
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao mover pasta", description: String(err?.message || err), variant: "destructive" });
    }
  };

  const handleDeleteMatrix = async (matrixId: string) => {
    const matrix = matrices.find((m) => m.id === matrixId);
    const code = matrix?.code || "";
    const ok = window.confirm(`Excluir a matriz ${code}? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    try {
      await sbDeleteMatrix(matrixId);
      setMatrices((prev) => prev.filter((m) => m.id !== matrixId));
      if (selectedMatrix?.id === matrixId) setSelectedMatrix(null);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao excluir matriz", description: String(err?.message || err), variant: "destructive" });
    }
    // opcional: remover pasta vazia não é feito automaticamente
  };

  const handleAddEvent = async (event: MatrixEvent) => {
    if (!selectedMatrix) return;
    try {
      const eventWithCreated = event.createdAt ? event : { ...event, createdAt: new Date().toISOString() };
      await sbCreateEvent(selectedMatrix.id, eventWithCreated);
      setMatrices((prev) => prev.map((m) => (m.id === selectedMatrix.id ? { ...m, events: [...m.events, eventWithCreated] } : m)));
      setSelectedMatrix((prev) => (prev ? { ...prev, events: [...prev.events, eventWithCreated] } : null));
      toast({ title: "Evento adicionado", description: "O evento foi adicionado à matriz com sucesso." });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao adicionar evento", description: String(err?.message || err), variant: "destructive" });
    }
  };

  const handleImport = (importedMatrices: Matrix[]) => {
    (async () => {
      try {
        const { importMatrices: sbImportMatrices } = await import("@/services/db");
        const normalized = importedMatrices.map((m) => ({
          ...m,
          events: (m.events || []).map((e) => ({ ...e, createdAt: e.createdAt || new Date().toISOString() })),
        }));
        const res = await sbImportMatrices(normalized);
        const [mats, flds] = await Promise.all([sbListMatrices(), sbListFolders()]);
        setMatrices(mats);
        setFolders(flds);
        setSelectedMatrix(null);
        toast({
          title: "Importação concluída",
          description: `${res.matrices} matriz(es) e ${res.events} evento(s) enviados ao banco.`,
        });
      } catch (err: any) {
        console.error(err);
        toast({ title: "Erro ao importar para o banco", description: String(err?.message || err), variant: "destructive" });
      }
    })();
  };

  const handleEventClick = (matrixId: string, event: MatrixEvent) => {
    const matrix = matrices.find((m) => m.id === matrixId);
    if (matrix) {
      // Seleciona a matriz para abrir o painel direito
      setSelectedMatrix(matrix);
      // Abre o diálogo de detalhes do evento
      setEventDetailDialog({ open: true, matrix, event });
    }
  };

  const handleMatrixClick = (matrixId: string) => {
    // Apenas admin pode editar
    if (authSession?.user?.role !== 'admin') return;
    const matrix = matrices.find(m => m.id === matrixId);
    if (matrix) {
      setMatrixEditDialog({ open: true, matrix });
    }
  };

  const handleUpdateMatrix = async (matrixId: string, updates: { responsible?: string; receivedDate?: string }) => {
    await sbUpdateMatrix(matrixId, updates);
    reloadAll();
  };

  const handleUpdateEvent = async (
    matrixId: string,
    eventId: string,
    updates: Partial<MatrixEvent>
  ) => {
    try {
      await sbUpdateEvent(eventId, updates);
      setMatrices((prev) =>
        prev.map((m) =>
          m.id === matrixId
            ? {
                ...m,
                events: m.events.map((e) => (e.id === eventId ? { ...e, ...updates } : e)),
              }
            : m
        )
      );
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao atualizar evento", description: String(err?.message || err), variant: "destructive" });
    }
  };

  // Lista base conforme filtros globais (pasta, busca, status, estagnação)
  let baseFiltered = selectedFolder ? matrices.filter((m) => m.folder === selectedFolder) : matrices;
  if (searchTerm.trim()) {
    const term = searchTerm.trim().toLowerCase();
    baseFiltered = baseFiltered.filter((m) => m.code.toLowerCase().includes(term));
  }
  if (statusFilter) {
    baseFiltered = baseFiltered.filter((m) => getStatusFromLastEvent(m) === statusFilter);
  }
  if (staleOnly) {
    baseFiltered = baseFiltered.filter((m) => daysSinceLastEvent(m) > STALE_DAYS);
  }

  const hasApproval = (m: Matrix) => m.events?.some((e) => e.type.toLowerCase().includes("aprov")) ?? false;
  // Sidebar: sempre sem aprovadas (menu)
  const sidebarMatrices = baseFiltered.filter((m) => !hasApproval(m));
  // Main: sem aprovadas apenas para timeline/planilha; dashboard e approved mostram todas conforme a aba
  const hideApprovedInMain = mainView === "timeline" || mainView === "sheet";
  const mainMatrices = hideApprovedInMain ? baseFiltered.filter((m) => !hasApproval(m)) : baseFiltered;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar - apenas para usuários logados */}
      {!sidebarCollapsed && authSession ? (
        <div className="w-80 flex-shrink-0">
          <MatrixSidebar
          matrices={sidebarMatrices}
          selectedMatrix={selectedMatrix}
          onSelectMatrix={setSelectedMatrix}
          onNewMatrix={() => setShowNewMatrixForm(true)}
          folders={folders}
          selectedFolder={selectedFolder}
          onCreateFolder={handleCreateFolder}
          onSelectFolder={handleSelectFolder}
          onMoveMatrixFolder={handleMoveMatrixFolder}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onDeleteMatrix={handleDeleteMatrix}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          staleOnly={staleOnly}
          onToggleStaleOnly={() => setStaleOnly((v) => !v)}
          staleDaysThreshold={STALE_DAYS}
          onCollapse={() => setSidebarCollapsed(true)}
          />
        </div>
      ) : authSession ? (
        <button
          type="button"
          className="fixed left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-background/90 border shadow hover:bg-background"
          onClick={() => setSidebarCollapsed(false)}
          title="Expandir menu"
          aria-label="Expandir menu"
        >
          <ChevronRight className="mx-auto" />
        </button>
      ) : null}

      {/* Main Content */}
      <div className="flex-1 flex overflow-x-auto pr-3 md:pr-4">
        {/* Left: main view */}
        <div className="flex-1 flex flex-col">
          <div className="p-3 border-b flex items-center gap-1.5 md:gap-2 overflow-x-auto">
            <button
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "timeline" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setMainView("timeline")}
            >Timeline</button>
            <button
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "manufacturing" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => {
                if (!authSession) {
                  setShowLoginDialog(true);
                  toast({ title: "Login necessário", description: "Faça login para registrar confecções", variant: "destructive" });
                } else {
                  setMainView("manufacturing");
                }
              }}
            >Confecção</button>
            <button
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "sheet" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => {
                if (!authSession) {
                  setShowLoginDialog(true);
                  toast({ title: "Login necessário", description: "Faça login para acessar esta funcionalidade", variant: "destructive" });
                } else {
                  setMainView("sheet");
                }
              }}
            >Planilha</button>
            <button
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "dashboard" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => {
                if (!authSession) {
                  setShowLoginDialog(true);
                  toast({ title: "Login necessário", description: "Faça login para acessar esta funcionalidade", variant: "destructive" });
                } else {
                  setMainView("dashboard");
                }
              }}
            >Dashboard</button>
            <button
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "approved" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => {
                if (!authSession) {
                  setShowLoginDialog(true);
                  toast({ title: "Login necessário", description: "Faça login para acessar esta funcionalidade", variant: "destructive" });
                } else {
                  setMainView("approved");
                }
              }}
            >Ferramentas Aprovadas</button>
            <button
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "kanban" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => {
                if (!authSession) {
                  setShowLoginDialog(true);
                  toast({ title: "Login necessário", description: "Faça login para acessar esta funcionalidade", variant: "destructive" });
                } else {
                  setMainView("kanban");
                }
              }}
            >Kanban</button>
            <button
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "activity" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => {
                if (!authSession) {
                  setShowLoginDialog(true);
                  toast({ title: "Login necessário", description: "Faça login para acessar esta funcionalidade", variant: "destructive" });
                } else {
                  setMainView("activity");
                }
              }}
            >Histórico</button>
            {authSession && (
              <>
                <button
                  className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "testing" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  onClick={() => setMainView("testing")}
                >Em Teste</button>
                {authSession.user.role === 'admin' && (
                  <button
                    className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "settings" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    onClick={() => setMainView("settings")}
                    title="Configurações"
                    aria-label="Configurações"
                  >
                    <Settings className="h-4 w-4 inline" />
                  </button>
                )}
              </>
            )}
            <div className="ml-2 md:ml-auto flex items-center gap-2 shrink-0">
              <NotificationsBell matrices={matrices} staleDaysThreshold={STALE_DAYS} readOnly={!authSession} />
              <Button size="sm" variant="outline" onClick={reloadAll} title="Atualizar" aria-label="Atualizar">
                <RefreshCw className="h-4 w-4" />
              </Button>
              {authSession ? (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={async () => {
                    await logout();
                    setAuthSession(null);
                    setMainView("timeline");
                    toast({ title: "Logout realizado", description: "Até logo!" });
                  }}
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  Sair ({authSession.user.name})
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setShowLoginDialog(true)}>
                  <LogIn className="h-4 w-4 mr-1" />
                  Login
                </Button>
              )}
              {/* Removido contador de matrizes para economizar espaço */}
            </div>
          </div>
          <div className={`flex-1 ${mainView === "sheet" ? "overflow-x-auto" : "overflow-hidden"}`}>
            {mainView === "timeline" ? (
              <FlowView
                matrices={mainMatrices}
                onEventClick={handleEventClick}
                onBlankClick={() => setSelectedMatrix(null)}
                isReadOnly={!authSession}
                onMatrixClick={(id) => {
                  handleMatrixClick(id);
                }}
              />
            ) : mainView === "sheet" ? (
              <div className="h-full p-3 overflow-auto" onClick={() => setSelectedMatrix(null)}>
                <MatrixSheet
                  matrices={mainMatrices}
                  onSelectMatrix={(m) => setSelectedMatrix(m)}
                  onSetDate={async (matrixId: string, milestone: SheetMilestone, date: string) => {
                    try {
                      // Tipos padronizados (novos)
                      const mapNewType = (m: SheetMilestone): { type: string; comment: string } => {
                        switch (m) {
                          case "test1": return { type: "Testes", comment: "1º teste" };
                          case "test2": return { type: "Testes", comment: "2º teste" };
                          case "test3": return { type: "Testes", comment: "3º teste" };
                          case "test4": return { type: "Testes", comment: "4º teste" };
                          case "test5": return { type: "Testes", comment: "5º teste" };
                          case "test6": return { type: "Testes", comment: "6º teste" };
                          case "clean_send1": return { type: "Limpeza Saída", comment: "Enviada para limpeza (ciclo 1)" };
                          case "clean_return1": return { type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 1)" };
                          case "clean_send2": return { type: "Limpeza Saída", comment: "Enviada para limpeza (ciclo 2)" };
                          case "clean_return2": return { type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 2)" };
                          case "clean_send3": return { type: "Limpeza Saída", comment: "Enviada para limpeza (ciclo 3)" };
                          case "clean_return3": return { type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 3)" };
                          case "clean_send4": return { type: "Limpeza Saída", comment: "Enviada para limpeza (ciclo 4)" };
                          case "clean_return4": return { type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 4)" };
                          case "corr_send1": return { type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 1)" };
                          case "corr_return1": return { type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 1)" };
                          case "corr_send2": return { type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 2)" };
                          case "corr_return2": return { type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 2)" };
                          case "corr_send3": return { type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 3)" };
                          case "corr_return3": return { type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 3)" };
                          case "corr_send4": return { type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 4)" };
                          case "corr_return4": return { type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 4)" };
                          case "approval": return { type: "Aprovado", comment: "Aprovação" };
                          default: return { type: "Outro", comment: "" };
                        }
                      };
                      const mapped = mapNewType(milestone);
                      const newEvent: MatrixEvent = { id: crypto.randomUUID(), date, type: mapped.type, comment: mapped.comment };
                      await sbCreateEvent(matrixId, newEvent);
                      setMatrices((prev) => prev.map((m) => (m.id === matrixId ? { ...m, events: [...m.events, newEvent] } : m)));
                      if (selectedMatrix?.id === matrixId) {
                        setSelectedMatrix((prev) => (prev ? { ...prev, events: [...prev.events, newEvent] } : prev));
                      }
                      // Regra Kanban: se for retorno de Correção Externa, atualizar o cartão automático para "Entrada"
                      if (["corr_return1","corr_return2","corr_return3","corr_return4"].includes(milestone)) {
                        const mat = matrices.find((m) => m.id === matrixId);
                        const code = mat?.code || "";
                        const title = code ? `${code} - Correção Externa (Entrada)` : "Correção Externa (Entrada)";
                        const description = code
                          ? `Matriz ${code} retornou da correção externa em ${formatDatePtBR(date)}`
                          : `Retornou da correção externa em ${formatDatePtBR(date)}`;
                        try { await kanbanUpdateLatestAutoCardForMatrix(matrixId, title, description); } catch (_) {}
                      }
                      toast({ title: "Data registrada", description: `${mapped.comment || mapped.type} em ${formatDatePtBR(date)}` });
                    } catch (err: any) {
                      console.error(err);
                      toast({ title: "Erro ao registrar data", description: String(err?.message || err), variant: "destructive" });
                    }
                  }}
                  onDeleteDate={async (matrixId: string, milestone: SheetMilestone) => {
                    try {
                      const index = milestone === 'test4' ? 3 : milestone === 'test5' ? 4 : milestone === 'test6' ? 5 : -1;
                      if (index < 0) return;
                      const matrix = matrices.find((m) => m.id === matrixId);
                      if (!matrix) return;
                      const tests = [...matrix.events]
                        .filter((e) => e.type === 'Testes' || /Teste/i.test(e.type))
                        .sort((a, b) => a.date.localeCompare(b.date));
                      const toDelete = tests[index];
                      if (!toDelete) return;
                      await sbDeleteEvent(toDelete.id);
                      setMatrices((prev) => prev.map((m) => (m.id === matrixId ? { ...m, events: m.events.filter((e) => e.id !== toDelete.id) } : m)));
                      if (selectedMatrix?.id === matrixId) {
                        setSelectedMatrix((prev) => (prev ? { ...prev, events: prev.events.filter((e) => e.id !== toDelete.id) } : prev));
                      }
                      toast({ title: 'Teste removido', description: `Teste ${index + 1} apagado` });
                    } catch (err: any) {
                      console.error(err);
                      toast({ title: 'Erro ao remover teste', description: String(err?.message || err), variant: 'destructive' });
                    }
                  }}
                />
              </div>
            ) : mainView === "dashboard" ? (
              <div className="h-full p-3 overflow-auto" onClick={() => setSelectedMatrix(null)}>
                <MatrixDashboard matrices={mainMatrices} staleDaysThreshold={STALE_DAYS} />
              </div>
            ) : mainView === "activity" ? (
              <div className="h-full p-3 overflow-auto" onClick={() => setSelectedMatrix(null)}>
                <ActivityHistory matrices={mainMatrices} staleDaysThreshold={STALE_DAYS} />
              </div>
            ) : mainView === "kanban" ? (
              <div className="h-full p-3 overflow-auto" onClick={() => setSelectedMatrix(null)}>
                <KanbanBoard matrices={mainMatrices} />
              </div>
            ) : mainView === "testing" ? (
              <div className="h-full overflow-auto">
                <TestingView
                  matrices={mainMatrices}
                  onTestCompleted={async (matrixId, event) => {
                    try {
                      await sbCreateEvent(matrixId, event);
                      setMatrices((prev) => prev.map((m) => (m.id === matrixId ? { ...m, events: [...m.events, event] } : m)));
                      if (selectedMatrix?.id === matrixId) {
                        setSelectedMatrix((prev) => (prev ? { ...prev, events: [...prev.events, event] } : null));
                      }
                    } catch (err: any) {
                      console.error(err);
                      toast({ title: "Erro ao concluir teste", description: String(err?.message || err), variant: "destructive" });
                    }
                  }}
                  onUpdateEvent={handleUpdateEvent}
                  onRefresh={reloadAll}
                />
              </div>
            ) : mainView === "manufacturing" ? (
              authSession ? (
                <ManufacturingView key={manufacturingViewKey} onSuccess={reloadAll} isAdmin={authSession?.user?.role === 'admin'} />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-muted-foreground">Faça login para registrar confecções</p>
                </div>
              )
            ) : mainView === "settings" ? (
              authSession ? (
                <SettingsView currentUser={authSession.user} />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-muted-foreground">Faça login para acessar as configurações</p>
                </div>
              )
            ) : (
              <div className="h-full p-3 overflow-auto" onClick={() => setSelectedMatrix(null)}>
                <ApprovedToolsView 
                  matrices={mainMatrices} 
                  onUpdateMatrix={(matrix) => {
                    setMatrices(prev => prev.map(m => m.id === matrix.id ? matrix : m));
                  }}
                  onRefresh={reloadAll}
                />
              </div>
            )}
          </div>
        </div>
        {/* Right Panel - Forms - apenas para usuários logados */}
        {selectedMatrix && authSession && (
          <div
            className="min-w-[16rem] w-[18rem] md:w-[20rem] lg:w-[22rem] mr-3 md:mr-4 border-l border-border bg-background flex-shrink-0 overflow-y-auto"
            onDoubleClick={() => setSelectedMatrix(null)}
            title="Duplo clique para fechar"
          >
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                <CollapsibleCard title="Resumo da Matriz" defaultOpen={false}>
                  <MatrixSummary matrix={selectedMatrix} />
                </CollapsibleCard>

                <CollapsibleCard title="Adicionar Evento" defaultOpen={false}>
                  <EventForm
                    onSubmit={handleAddEvent}
                    defaultDate={selectedMatrix?.events[selectedMatrix.events.length-1]?.date || selectedMatrix?.receivedDate}
                    minDate={selectedMatrix?.events[selectedMatrix.events.length-1]?.date || selectedMatrix?.receivedDate}
                  />
                </CollapsibleCard>

                <CollapsibleCard title="Importar / Exportar" defaultOpen={false}>
                  <ImportExport matrices={matrices} onImport={handleImport} />
                </CollapsibleCard>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* New Matrix Dialog */}
      <Dialog open={showNewMatrixForm} onOpenChange={setShowNewMatrixForm}>
        <DialogContent className="sm:max-w-md">
          <MatrixForm
            onSubmit={handleNewMatrix}
            onCancel={() => setShowNewMatrixForm(false)}
            folders={folders}
            defaultFolder={selectedFolder}
            onMatrixFromManufacturing={async (matrixId) => {
              try {
                // Recarregar lista de matrizes
                const [mats] = await Promise.all([sbListMatrices()]);
                setMatrices(mats);
                
                // Forçar reload do ManufacturingView
                setManufacturingViewKey(prev => prev + 1);
                
                // Selecionar a matriz que veio da confecção
                const matrix = mats.find(m => m.id === matrixId);
                if (matrix) {
                  setSelectedMatrix(matrix);
                }
                
                toast({ 
                  title: "Matriz de confecção recebida", 
                  description: "A matriz foi movida para o sistema principal" 
                });
              } catch (err: any) {
                console.error("Erro ao processar matriz de confecção:", err);
                toast({ 
                  title: "Erro", 
                  description: "Não foi possível processar a matriz", 
                  variant: "destructive" 
                });
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <EventDetailDialog
        open={eventDetailDialog.open}
        onOpenChange={(open) =>
          setEventDetailDialog({ open, matrix: null, event: null })
        }
        matrix={eventDetailDialog.matrix}
        event={eventDetailDialog.event}
        onUpdateEvent={handleUpdateEvent}
      />

      {/* Matrix Edit Dialog (apenas admin) */}
      <MatrixEditDialog
        open={matrixEditDialog.open}
        onOpenChange={(open) =>
          setMatrixEditDialog({ open, matrix: null })
        }
        matrix={matrixEditDialog.matrix}
        onUpdateMatrix={handleUpdateMatrix}
        isAdmin={authSession?.user?.role === 'admin'}
      />

      {/* Login Dialog */}
      <LoginDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        onLoginSuccess={(session) => {
          setAuthSession(session);
          toast({ title: "Login realizado", description: `Bem-vindo, ${session.user.name}!` });
        }}
      />
    </div>
  );
};

export default Index;
