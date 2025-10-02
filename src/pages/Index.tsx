import { useState, useEffect } from "react";
import { Matrix, MatrixEvent } from "@/types";
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
} from "@/services/db";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";
import { MatrixSidebar } from "@/components/MatrixSidebar";
import { FlowView } from "@/components/FlowView";
import { MatrixSheet, SheetMilestone } from "@/components/MatrixSheet";
import { MatrixForm } from "@/components/MatrixForm";
import { EventForm } from "@/components/EventForm";
import { ImportExport } from "@/components/ImportExport";
import { EventDetailDialog } from "@/components/EventDetailDialog";
import { MatrixSummary } from "@/components/MatrixSummary";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [selectedMatrix, setSelectedMatrix] = useState<Matrix | null>(null);
  const [showNewMatrixForm, setShowNewMatrixForm] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = todas
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [staleOnly, setStaleOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"flat" | "folders">("flat");
  const [mainView, setMainView] = useState<"timeline" | "sheet">("timeline");
  const STALE_DAYS = 10;
  const [eventDetailDialog, setEventDetailDialog] = useState<{
    open: boolean;
    matrix: Matrix | null;
    event: MatrixEvent | null;
  }>({ open: false, matrix: null, event: null });
  const { toast } = useToast();

  useEffect(() => {
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
      await sbCreateEvent(selectedMatrix.id, event);
      setMatrices((prev) => prev.map((m) => (m.id === selectedMatrix.id ? { ...m, events: [...m.events, event] } : m)));
      setSelectedMatrix((prev) => (prev ? { ...prev, events: [...prev.events, event] } : null));
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
        const res = await sbImportMatrices(importedMatrices);
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
      setEventDetailDialog({ open: true, matrix, event });
    }
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

  let filteredMatrices = selectedFolder ? matrices.filter((m) => m.folder === selectedFolder) : matrices;
  if (searchTerm.trim()) {
    const term = searchTerm.trim().toLowerCase();
    filteredMatrices = filteredMatrices.filter((m) => m.code.toLowerCase().includes(term));
  }
  if (statusFilter) {
    filteredMatrices = filteredMatrices.filter((m) => getStatusFromLastEvent(m) === statusFilter);
  }
  if (staleOnly) {
    filteredMatrices = filteredMatrices.filter((m) => daysSinceLastEvent(m) > STALE_DAYS);
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0">
        <MatrixSidebar
          matrices={filteredMatrices}
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
        />
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex ${mainView === "sheet" ? "overflow-x-auto" : "overflow-hidden"}`}>
        {/* Left: main view */}
        <div className="flex-1 flex flex-col">
          <div className="p-3 border-b flex items-center gap-2">
            <button
              className={`px-3 py-1 rounded ${mainView === "timeline" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setMainView("timeline")}
            >Timeline</button>
            <button
              className={`px-3 py-1 rounded ${mainView === "sheet" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setMainView("sheet")}
            >Planilha</button>
            <div className="ml-auto text-sm text-muted-foreground">{filteredMatrices.length} matriz(es)</div>
          </div>
          <div className={`flex-1 ${mainView === "sheet" ? "overflow-x-auto" : "overflow-hidden"}`}>
            {mainView === "timeline" ? (
              <FlowView
                matrices={filteredMatrices}
                onEventClick={handleEventClick}
                onBlankClick={() => setSelectedMatrix(null)}
              />
            ) : (
              <div className="h-full p-3 overflow-auto" onClick={() => setSelectedMatrix(null)}>
                <MatrixSheet
                  matrices={filteredMatrices}
                  onSelectMatrix={(m) => setSelectedMatrix(m)}
                  onSetDate={async (matrixId: string, milestone: SheetMilestone, date: string) => {
                    try {
                      const eventType = (() => {
                        switch (milestone) {
                          case "test1": return "1º teste";
                          case "test2": return "2º teste";
                          case "test3": return "3º teste";
                          case "clean_send1":
                          case "clean_return1":
                          case "clean_send2":
                          case "clean_return2":
                            return "Limpeza";
                          case "corr_send1":
                          case "corr_return1":
                          case "corr_send2":
                          case "corr_return2":
                            return "Correção Externa";
                          case "approval":
                            return "Aprovado";
                          default:
                            return "Outro";
                        }
                      })();
                      const comment = (() => {
                        switch (milestone) {
                          case "clean_send1": return "Enviada para limpeza (ciclo 1)";
                          case "clean_return1": return "Retornou da limpeza (ciclo 1)";
                          case "corr_send1": return "Enviada para correção (ciclo 1)";
                          case "corr_return1": return "Retornou da correção (ciclo 1)";
                          case "clean_send2": return "Enviada para limpeza (ciclo 2)";
                          case "clean_return2": return "Retornou da limpeza (ciclo 2)";
                          case "corr_send2": return "Enviada para correção (ciclo 2)";
                          case "corr_return2": return "Retornou da correção (ciclo 2)";
                          case "test1": return "1º teste";
                          case "test2": return "2º teste";
                          case "test3": return "3º teste";
                          case "approval": return "Aprovação";
                          default: return "";
                        }
                      })();
                      const newEvent: MatrixEvent = { id: crypto.randomUUID(), date, type: eventType, comment };
                      await sbCreateEvent(matrixId, newEvent);
                      setMatrices((prev) => prev.map((m) => (m.id === matrixId ? { ...m, events: [...m.events, newEvent] } : m)));
                      if (selectedMatrix?.id === matrixId) {
                        setSelectedMatrix((prev) => (prev ? { ...prev, events: [...prev.events, newEvent] } : prev));
                      }
                      toast({ title: "Data registrada", description: `${eventType} em ${new Date(date).toLocaleDateString("pt-BR")}` });
                    } catch (err: any) {
                      console.error(err);
                      toast({ title: "Erro ao registrar data", description: String(err?.message || err), variant: "destructive" });
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
        {/* Right Panel - Forms */}
        {selectedMatrix && (
          <div className="w-96 border-l border-border bg-background flex-shrink-0">
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
    </div>
  );
};

export default Index;
