import { useState, useEffect, useRef, useMemo } from "react";
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
import { formatToBR } from "@/utils/dateUtils";
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
import { AnalysisView } from "@/components/AnalysisView";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import NotificationsBell from "@/components/NotificationsBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentSession, logout } from "@/services/auth";
import { LogIn, LogOut, Settings, RefreshCw, Mail } from "lucide-react";

const Index = () => {
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [selectedMatrix, setSelectedMatrix] = useState<Matrix | null>(null);
  const [showNewMatrixForm, setShowNewMatrixForm] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = todas
  const [searchTerm, setSearchTerm] = useState("");
  const formatDate = (iso: string) => {
    return formatToBR(iso);
  };
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [staleOnly, setStaleOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"flat" | "folders">("flat");
  const [mainView, setMainView] = useState<"analysis" | "timeline" | "sheet" | "dashboard" | "approved" | "activity" | "kanban" | "testing" | "manufacturing" | "settings">("timeline");
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
  const [timelineSearchOpen, setTimelineSearchOpen] = useState(false);
  const [timelineSearch, setTimelineSearch] = useState("");
  const timelineSearchInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const isAdmin = authSession?.user?.role === 'admin';
  const [dailyAlertOpen, setDailyAlertOpen] = useState(false);
  const [delayedManufacturing, setDelayedManufacturing] = useState<Array<{ code: string; supplier: string; deliveryDate: string; daysLate: number }>>([]);
  const [stalledTests, setStalledTests] = useState<Array<{ code: string; receivedDate: string; daysInProgress: number; status: string }>>([]);

  const buildDailyAlertEmail = () => {
    const now = new Date();
    const todayBR = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
    const timeBR = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now);
    const subject = `Acompanhamento de Matrizes – Status Atual (${todayBR})`;

    const atrasoCritico = delayedManufacturing.filter((x) => x.daysLate > 5);
    const testeCritico = stalledTests.filter((x) => x.daysInProgress > 20);

    const lines: string[] = [];
    lines.push('Prezados,');
    lines.push('');
    lines.push('Segue acompanhamento das matrizes/ferramentas identificadas como críticas no dia de hoje, com base nas informações exibidas no modal "Alertas do dia" no sistema.');
    lines.push('');
    lines.push('Resumo:');
    lines.push(`- Matrizes com atraso de entrega: ${delayedManufacturing.length} (críticas: ${atrasoCritico.length})`);
    lines.push(`- Ferramentas em teste paradas: ${stalledTests.length} (críticas: ${testeCritico.length})`);
    lines.push('');

    lines.push('1) Matrizes com atraso de entrega');
    lines.push('CÓDIGO | FORNECEDOR | ENTREGA ATUAL | ATRASO | STATUS');
    if (delayedManufacturing.length === 0) {
      lines.push('-');
    } else {
      delayedManufacturing.forEach((item) => {
        const status = item.daysLate > 5 ? 'CRÍTICO' : 'ATENÇÃO';
        const deliveryBR = item.deliveryDate.split('-').reverse().join('/');
        lines.push(`${item.code} | ${item.supplier} | ${deliveryBR} | ${item.daysLate} dia(s) | ${status}`);
      });
    }
    lines.push('');

    lines.push('2) Ferramentas em teste paradas');
    lines.push('CÓDIGO | STATUS | RECEBIDA EM | DIAS EM ANDAMENTO | STATUS');
    if (stalledTests.length === 0) {
      lines.push('-');
    } else {
      stalledTests.forEach((item) => {
        const status = item.daysInProgress > 20 ? 'CRÍTICO' : 'ATENÇÃO';
        const receivedBR = item.receivedDate ? item.receivedDate.split('-').reverse().join('/') : '-';
        lines.push(`${item.code} | ${item.status} | ${receivedBR} | ${item.daysInProgress} dia(s) | ${status}`);
      });
    }
    lines.push('');

    lines.push('Atenção: itens marcados como CRÍTICO demandam ação prioritária (alto risco de ruptura).');
    lines.push('');
    lines.push(`Atenciosamente,`);
    lines.push('Ferramentaria / PCP');
    lines.push(`Enviado em: ${todayBR} ${timeBR}`);

    const body = lines.join('\n');

    const to = (import.meta as any).env?.VITE_NOTIFY_GROUP_EMAILS as string | undefined;
    return { to: to || '', subject, body };
  };

  const downloadDailyAlertEml = (args: { to: string; subject: string; body: string }) => {
    const { to, subject, body } = args;

    // Formato EML simples (RFC 822) — abre como rascunho no Outlook.
    const content = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `X-Unsent: 1`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      '',
      body,
      '',
    ].join('\r\n');

    const blob = new Blob([content], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `acompanhamento_matrizes_${new Date().toISOString().slice(0, 10)}.eml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const sendDailyAlertEmail = async () => {
    try {
      const { to, subject, body } = buildDailyAlertEmail();
      const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      // Se o corpo for muito grande, gerar arquivo .eml
      if (mailtoUrl.length > 2000) {
        downloadDailyAlertEml({ to, subject, body });
        toast({
          title: 'Rascunho gerado',
          description: 'Um arquivo .eml foi baixado. Abra-o para enviar o e-mail pelo Outlook.',
          variant: 'default'
        });
        return;
      }

      // Abre no cliente de e-mail padrão (Outlook, Gmail, etc)
      window.location.href = mailtoUrl;
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Erro ao gerar e-mail', description: String(err?.message || err), variant: 'destructive' });
    }
  };

  const DAILY_ALERT_KEY = 'extrudeflow_daily_alert_last_seen';

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

  const calculateDaysBetween = (fromISO: string | undefined | null, to: Date): number | null => {
    if (!fromISO) return null;
    const base = new Date(fromISO);
    base.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    const diffMs = end.getTime() - base.getTime();
    if (Number.isNaN(diffMs)) return null;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  const hasApproval = (m: Matrix) => m.events?.some((e) => e.type.toLowerCase().includes("aprov")) ?? false;

  useEffect(() => {
    const runDailyAlert = async () => {
      if (typeof window === 'undefined') return;
      const todayISO = new Date().toISOString().split('T')[0];
      const lastSeen = window.localStorage.getItem(DAILY_ALERT_KEY);
      if (lastSeen === todayISO) return;

      try {
        const today = new Date();
        const { data: manuf, error } = await supabase
          .from('manufacturing_records')
          .select('matrix_code,supplier,custom_supplier,estimated_delivery_date,follow_up_dates,processed_at,status')
          .eq('status', 'approved')
          .is('processed_at', null);

        if (error) throw error;

        const getCurrentDeliveryDate = (record: any): string | null => {
          const history = record.follow_up_dates as Array<{ date: string; new_date: string }> | null;
          if (history && history.length > 0) {
            const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const last = sorted[sorted.length - 1];
            return last?.new_date || null;
          }
          return record.estimated_delivery_date || null;
        };

        const delayed: Array<{ code: string; supplier: string; deliveryDate: string; daysLate: number }> = [];
        (manuf || []).forEach((r: any) => {
          const delivery = getCurrentDeliveryDate(r);
          if (!delivery) return;
          const daysDiff = calculateDaysBetween(delivery, today);
          if (daysDiff !== null && daysDiff > 0) {
            delayed.push({
              code: r.matrix_code,
              supplier: r.supplier === 'Outro' ? r.custom_supplier || 'Outro' : r.supplier,
              deliveryDate: delivery,
              daysLate: daysDiff,
            });
          }
        });

        const stalled: Array<{ code: string; receivedDate: string; daysInProgress: number; status: string }> = [];
        matrices.forEach((m) => {
          if (hasApproval(m)) return;
          const status = getStatusFromLastEvent(m);
          if (!status || !/teste/i.test(status)) return;
          const days = calculateDaysBetween(m.receivedDate, today);
          if (days !== null && days > 15) {
            stalled.push({
              code: m.code,
              receivedDate: m.receivedDate || '',
              daysInProgress: days,
              status,
            });
          }
        });

        if (delayed.length === 0 && stalled.length === 0) {
          return;
        }

        setDelayedManufacturing(delayed.sort((a, b) => b.daysLate - a.daysLate));
        setStalledTests(stalled.sort((a, b) => b.daysInProgress - a.daysInProgress));
        setDailyAlertOpen(true);
        window.localStorage.setItem(DAILY_ALERT_KEY, todayISO);
      } catch (err) {
        console.error('Erro ao carregar alertas diários:', err);
      }
    };

    if (matrices.length > 0) {
      runDailyAlert();
    }
  }, [matrices]);

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

  const handleDeleteEvent = async (matrixId: string, eventId: string) => {
    if (!isAdmin) return;
    try {
      await sbDeleteEvent(eventId);
      setMatrices((prev) =>
        prev.map((m) =>
          m.id === matrixId
            ? { ...m, events: m.events.filter((e) => e.id !== eventId) }
            : m
        )
      );
      if (selectedMatrix?.id === matrixId) {
        setSelectedMatrix((prev) =>
          prev ? { ...prev, events: prev.events.filter((e) => e.id !== eventId) } : null
        );
      }
      toast({ title: "Evento excluído", description: "O evento foi removido com sucesso." });
    } catch (err: any) {
      console.error('Erro ao excluir evento:', err);
      toast({
        title: "Erro ao excluir evento",
        description: String(err?.message || err),
        variant: "destructive",
      });
      throw err;
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && (event.key === "l" || event.key === "L")) {
        event.preventDefault();
        setMainView("timeline");
        setTimelineSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);

  useEffect(() => {
    if (timelineSearchOpen) {
      window.setTimeout(() => {
        timelineSearchInputRef.current?.focus();
      }, 0);
    }
  }, [timelineSearchOpen]);

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
    if (!isAdmin) return;
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

  // Sidebar: sempre sem aprovadas (menu)
  const sidebarMatrices = baseFiltered.filter((m) => !hasApproval(m));
  // Main: sem aprovadas apenas para timeline/planilha; dashboard e approved mostram todas conforme a aba
  const hideApprovedInMain = mainView === "timeline" || mainView === "sheet";
  let mainMatrices = hideApprovedInMain ? baseFiltered.filter((m) => !hasApproval(m)) : baseFiltered;
  if (mainView === "timeline" && timelineSearch.trim()) {
    const term = timelineSearch.trim().toLowerCase();
    mainMatrices = mainMatrices.filter((m) => m.code.toLowerCase().includes(term));
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-background">
      {/* Pop-up diário de alertas críticos */}
      <Dialog open={dailyAlertOpen} onOpenChange={setDailyAlertOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-10">
              <div className="min-w-0">
                <DialogTitle>Alertas do dia</DialogTitle>
                <DialogDescription>
                  Itens críticos identificados na Confecção e nos Testes. Revise estas matrizes e ferramentas com prioridade.
                </DialogDescription>
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                onClick={async () => {
                  await sendDailyAlertEmail();
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Enviar E-mail
              </Button>
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4">
              {/* Matrizes com atraso de entrega */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">1️⃣ Matrizes com atraso de entrega</h3>
                </div>
                {delayedManufacturing.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma matriz em atraso hoje.</p>
                ) : (
                  <div className="border rounded-md divide-y">
                    {delayedManufacturing.map((item) => (
                      <div
                        key={`${item.code}-${item.deliveryDate}`}
                        className={`flex items-center justify-between px-3 py-2 text-xs ${
                          item.daysLate > 5 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold">
                            {item.code}
                            <span className="ml-2 text-[11px] font-normal">Fornecedor: {item.supplier}</span>
                          </div>
                          <div className="text-[11px]">
                            Entrega atual: {item.deliveryDate.split("-").reverse().join("/")} •
                            <span className="ml-1 font-semibold">{item.daysLate} dia(s) de atraso</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ferramentas em teste paradas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">2️⃣ Ferramentas em teste paradas</h3>
                </div>
                {stalledTests.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma ferramenta em teste parada acima de 15 dias.</p>
                ) : (
                  <div className="border rounded-md divide-y">
                    {stalledTests.map((item) => (
                      <div
                        key={`${item.code}-${item.receivedDate}`}
                        className={`flex items-center justify-between px-3 py-2 text-xs ${
                          item.daysInProgress > 20
                            ? "bg-red-100 text-red-900"
                            : "bg-amber-50 text-amber-900"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold">
                            {item.code}
                            <span className="ml-2 text-[11px] font-normal">Status: {item.status}</span>
                          </div>
                          <div className="text-[11px]">
                            Recebida em: {item.receivedDate ? item.receivedDate.split("-").reverse().join("/") : "-"} •
                            <span className="ml-1 font-semibold">{item.daysInProgress} dia(s) em andamento</span>
                            {item.daysInProgress > 20 && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">
                                CRÍTICO &gt; 20 dias
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={timelineSearchOpen} onOpenChange={setTimelineSearchOpen}>
        <DialogContent className="sm:max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>Buscar na timeline</DialogTitle>
            <DialogDescription>
              Digite o código da matriz que deseja visualizar. A filtragem é aplicada enquanto você digita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              ref={timelineSearchInputRef}
              value={timelineSearch}
              onChange={(e) => setTimelineSearch(e.target.value)}
              placeholder="Ex.: DIN-1027/01"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  setTimelineSearchOpen(false);
                }
              }}
            />
            <div className="flex items-center gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTimelineSearch("");
                  timelineSearchInputRef.current?.focus();
                }}
              >Limpar</Button>
              <Button
                type="button"
                onClick={() => setTimelineSearchOpen(false)}
              >Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sidebar - apenas para usuários logados (coluna fixa em telas médias+, empilhada em mobile) */}
      {!sidebarCollapsed && authSession ? (
        <div className="w-full md:w-80 md:flex-shrink-0 border-b md:border-b-0 md:border-r bg-background">
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
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "analysis" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => {
                if (!authSession) {
                  setShowLoginDialog(true);
                  toast({ title: "Login necessário", description: "Faça login para acessar esta área", variant: "destructive" });
                } else {
                  setMainView("analysis");
                }
              }}
            >Análise</button>
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
              className={`px-2 md:px-3 py-1 text-sm md:text-base rounded shrink-0 ${mainView === "timeline" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setMainView("timeline")}
            >Timeline</button>
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
              {mainView === "timeline" && timelineSearch.trim() && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTimelineSearch("")}
                  title="Limpar filtro da timeline"
                  aria-label="Limpar filtro da timeline"
                >Limpar filtro</Button>
              )}
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
            {mainView === "analysis" ? (
              authSession ? (
                <div className="h-full p-6 overflow-auto" onClick={() => setSelectedMatrix(null)}>
                  <AnalysisView authSession={authSession} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-muted-foreground">Faça login para acessar a área de análise.</p>
                </div>
              )
            ) : mainView === "timeline" ? (
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
                    try {
                      const mapped = mapNewType(milestone);
                      
                      // Verifica se já existe um evento com o mesmo tipo e comentário para esta matriz
                      const matrix = matrices.find(m => m.id === matrixId);
                      const existingEvent = matrix?.events.find(e => 
                        e.type === mapped.type && e.comment === mapped.comment
                      );

                      if (existingEvent) {
                        // Atualiza o evento existente
                        await sbUpdateEvent(existingEvent.id, { date });
                        setMatrices(prev => prev.map(m => 
                          m.id === matrixId 
                            ? { 
                                ...m, 
                                events: m.events.map(e => 
                                  e.id === existingEvent.id 
                                    ? { ...e, date } 
                                    : e
                                ) 
                              } 
                            : m
                        ));
                      } else {
                        // Cria um novo evento
                        const newEvent: MatrixEvent = { 
                          id: crypto.randomUUID(), 
                          date, 
                          type: mapped.type, 
                          comment: mapped.comment 
                        };
                        await sbCreateEvent(matrixId, newEvent);
                        setMatrices(prev => prev.map(m => 
                          m.id === matrixId 
                            ? { ...m, events: [...m.events, newEvent] } 
                            : m
                        ));
                      }

                      // Atualiza a matriz selecionada se for o caso
                      if (selectedMatrix?.id === matrixId) {
                        const updatedMatrix = matrices.find(m => m.id === matrixId);
                        if (updatedMatrix) {
                          setSelectedMatrix(updatedMatrix);
                        }
                      }
                    } catch (err) {
                      console.error("Erro ao adicionar evento:", err);
                      toast({
                        title: "Erro",
                        description: "Não foi possível adicionar o evento. Tente novamente.",
                        variant: "destructive"
                      });
                    }
                  }}
                  onDeleteDate={async (matrixId: string, milestone: SheetMilestone) => {
                    try {
                      // Mapeia o milestone para o tipo e comentário correspondentes
                      const mapMilestoneToEvent = (m: SheetMilestone): { type: string; comment: string } => {
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
                          default: return { type: "", comment: "" };
                        }
                      };

                      const { type, comment } = mapMilestoneToEvent(milestone);
                      if (!type || !comment) return;

                      // Encontra a matriz e o evento a ser excluído
                      const matrix = matrices.find(m => m.id === matrixId);
                      if (!matrix) return;

                      const eventToDelete = matrix.events.find(e => 
                        e.type === type && e.comment === comment
                      );

                      if (!eventToDelete) return;

                      // Remove o evento do banco de dados
                      await sbDeleteEvent(eventToDelete.id);

                      // Atualiza o estado local
                      const updateState = (prev: Matrix[]) => 
                        prev.map(m => 
                          m.id === matrixId 
                            ? { 
                                ...m, 
                                events: m.events.filter(e => e.id !== eventToDelete.id) 
                              } 
                            : m
                        );

                      setMatrices(updateState);
                      
                      if (selectedMatrix?.id === matrixId) {
                        setSelectedMatrix(prev => 
                          prev ? { ...prev, events: prev.events.filter(e => e.id !== eventToDelete.id) } : null
                        );
                      }

                      // Mensagem de sucesso específica para o tipo de evento
                      let eventName = "";
                      if (type === "Testes") {
                        eventName = `Teste ${comment.split(' ')[0]}`;
                      } else if (type.includes("Limpeza")) {
                        eventName = `Evento de ${type.split(' ')[0].toLowerCase()}`;
                      } else if (type.includes("Correção")) {
                        eventName = `Evento de correção`;
                      } else {
                        eventName = "Evento";
                      }

                      toast({ 
                        title: 'Evento removido', 
                        description: `${eventName} removido com sucesso.` 
                      });
                    } catch (err: any) {
                      console.error('Erro ao remover evento:', err);
                      toast({ 
                        title: 'Erro ao remover evento', 
                        description: String(err?.message || err), 
                        variant: 'destructive' 
                      });
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
        onDeleteEvent={isAdmin ? handleDeleteEvent : undefined}
        canDelete={isAdmin}
        canEditDate={isAdmin}
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
