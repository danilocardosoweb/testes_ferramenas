import { useState, useEffect } from "react";
import { Matrix, MatrixEvent } from "@/types";
import { loadMatrices, saveMatrices, loadFolders, saveFolders } from "@/utils/storage";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";
import { MatrixSidebar } from "@/components/MatrixSidebar";
import { FlowView } from "@/components/FlowView";
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
  const STALE_DAYS = 10;
  const [eventDetailDialog, setEventDetailDialog] = useState<{
    open: boolean;
    matrix: Matrix | null;
    event: MatrixEvent | null;
  }>({ open: false, matrix: null, event: null });
  const { toast } = useToast();

  useEffect(() => {
    const loaded = loadMatrices();
    setMatrices(loaded);
    const loadedFolders = loadFolders();
    setFolders(loadedFolders);
  }, []);

  useEffect(() => {
    saveMatrices(matrices);
  }, [matrices]);

  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  const handleNewMatrix = (matrix: Matrix) => {
    setMatrices((prev) => [...prev, matrix]);
    setSelectedMatrix(matrix);
    setShowNewMatrixForm(false);
    toast({
      title: "Matriz criada",
      description: `Matriz ${matrix.code} foi criada com sucesso.`,
    });
  };

  const handleCreateFolder = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setFolders((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };

  const handleSelectFolder = (name: string | null) => {
    setSelectedFolder(name);
    setSelectedMatrix(null);
  };

  const handleMoveMatrixFolder = (matrixId: string, newFolder: string | null) => {
    setMatrices((prev) =>
      prev.map((m) => (m.id === matrixId ? { ...m, folder: newFolder || undefined } : m)),
    );
    if (newFolder && !folders.includes(newFolder)) {
      setFolders((prev) => [...prev, newFolder]);
    }
  };

  const handleDeleteMatrix = (matrixId: string) => {
    const matrix = matrices.find((m) => m.id === matrixId);
    const code = matrix?.code || "";
    const ok = window.confirm(`Excluir a matriz ${code}? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    setMatrices((prev) => prev.filter((m) => m.id !== matrixId));
    if (selectedMatrix?.id === matrixId) setSelectedMatrix(null);
    // opcional: remover pasta vazia não é feito automaticamente
  };

  const handleAddEvent = (event: MatrixEvent) => {
    if (!selectedMatrix) return;

    setMatrices((prev) =>
      prev.map((m) =>
        m.id === selectedMatrix.id
          ? { ...m, events: [...m.events, event] }
          : m
      )
    );

    setSelectedMatrix((prev) =>
      prev ? { ...prev, events: [...prev.events, event] } : null
    );

    toast({
      title: "Evento adicionado",
      description: "O evento foi adicionado à matriz com sucesso.",
    });
  };

  const handleImport = (importedMatrices: Matrix[]) => {
    setMatrices(importedMatrices);
    setSelectedMatrix(null);
  };

  const handleEventClick = (matrixId: string, event: MatrixEvent) => {
    const matrix = matrices.find((m) => m.id === matrixId);
    if (matrix) {
      setEventDetailDialog({ open: true, matrix, event });
    }
  };

  const handleUpdateEvent = (
    matrixId: string,
    eventId: string,
    updates: Partial<MatrixEvent>
  ) => {
    setMatrices((prev) =>
      prev.map((m) =>
        m.id === matrixId
          ? {
              ...m,
              events: m.events.map((e) =>
                e.id === eventId ? { ...e, ...updates } : e
              ),
            }
          : m
      )
    );
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
      <div className="flex-1 flex overflow-hidden">
        {/* Flow View */}
        <div className="flex-1">
          <FlowView
            matrices={filteredMatrices}
            onEventClick={handleEventClick}
            onBlankClick={() => setSelectedMatrix(null)}
          />
        </div>

        {/* Right Panel - Forms (cards recolhíveis) */}
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
