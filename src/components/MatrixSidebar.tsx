import { Matrix } from "@/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, FileText, CheckCircle2, XCircle, Wrench, ChevronRight, ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { daysSinceLastEvent } from "@/utils/metrics";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const getStatusFromLastEvent = (matrix: Matrix): string => {
  if (!matrix.events || matrix.events.length === 0) return "Sem eventos";
  const last = matrix.events[matrix.events.length - 1];
  switch (last.type) {
    case "Teste Inicial":
    case "Teste Final":
    case "Testes":
      return "Em teste";
    case "Ajuste":
      return "Em ajuste";
    case "Aprovado":
      return "Aprovada";
    case "Reprovado":
      return "Reprovada";
    case "Correção Externa":
      return "Em correção externa";
    case "Limpeza":
      return "Em limpeza";
    case "Recebimento":
      return "Recebida";
    default:
      return last.type;
  }
};

const getIndicators = (matrix: Matrix) => {
  const tests = matrix.events.filter(e => e.type === "Teste Inicial" || e.type === "Teste Final" || e.type === "Testes").length;
  const rejects = matrix.events.filter(e => e.type === "Reprovado").length;
  const fixes = matrix.events.filter(e => e.type === "Ajuste" || e.type === "Correção Externa").length;
  return { tests, rejects, fixes };
};

const PriorityBadge = ({ level }: { level: Matrix["priority"] }) => {
  if (!level) return null;
  const map: Record<string, { label: string; className: string }> = {
    critical: { label: "Crítico", className: "bg-red-600 text-white" },
    medium: { label: "Médio", className: "bg-yellow-500 text-black" },
    normal: { label: "Normal", className: "bg-green-600 text-white" },
  };
  const cfg = map[level];
  return <Badge className={cn("ml-2", cfg.className)}>{cfg.label}</Badge>;
};

interface MatrixSidebarProps {
  matrices: Matrix[];
  selectedMatrix: Matrix | null;
  onSelectMatrix: (matrix: Matrix) => void;
  onNewMatrix: () => void;
  folders?: string[];
  selectedFolder?: string | null;
  onCreateFolder?: (name: string) => void;
  onSelectFolder?: (name: string | null) => void;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  statusFilter?: string | null;
  onStatusFilterChange?: (value: string | null) => void;
  staleOnly?: boolean;
  onToggleStaleOnly?: () => void;
  staleDaysThreshold?: number;
  onMoveMatrixFolder?: (matrixId: string, newFolder: string | null) => void;
  viewMode?: "flat" | "folders";
  onViewModeChange?: (mode: "flat" | "folders") => void;
  onDeleteMatrix?: (matrixId: string) => void;
  onCollapse?: () => void;
}

export const MatrixSidebar = ({
  matrices,
  selectedMatrix,
  onSelectMatrix,
  onNewMatrix,
  folders = [],
  selectedFolder = null,
  onCreateFolder,
  onSelectFolder,
  searchTerm = "",
  onSearchTermChange,
  statusFilter = null,
  onStatusFilterChange,
  staleOnly = false,
  onToggleStaleOnly,
  staleDaysThreshold = 10,
  onMoveMatrixFolder,
  viewMode = "flat",
  onViewModeChange,
  onDeleteMatrix,
  onCollapse,
}: MatrixSidebarProps) => {
  // controle de expansão por card (default recolhido)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  // recolher controles (filtros + ações), mantendo a lista
  const [controlsCollapsed, setControlsCollapsed] = useState(true);

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-sidebar-foreground">
            Controle de Matrizes
          </h1>
          {onCollapse && (
            <button
              type="button"
              className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-sidebar-accent/40 text-sidebar-foreground"
              title="Recolher menu"
              aria-label="Recolher menu"
              onClick={onCollapse}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mb-2">
          <Button
            onClick={onNewMatrix}
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-3"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova Matriz
          </Button>
          <button
            type="button"
            className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-sidebar-accent/40 text-sidebar-foreground"
            title={controlsCollapsed ? "Expandir controles" : "Recolher controles"}
            aria-label={controlsCollapsed ? "Expandir controles" : "Recolher controles"}
            onClick={() => setControlsCollapsed((v) => !v)}
          >
            {controlsCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {/* Visualização e Pastas */}
        {!controlsCollapsed && (
        <div className="mt-2 space-y-2">
          {/* Modo de visualização */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={viewMode === "flat" ? "default" : "outline"}
              className="h-8 px-3"
              onClick={() => onViewModeChange?.("flat")}
            >
              Lista
            </Button>
            <Button
              type="button"
              variant={viewMode === "folders" ? "default" : "outline"}
              className="h-8 px-3"
              onClick={() => onViewModeChange?.("folders")}
            >
              Pastas
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedFolder ?? "__all__"} onValueChange={(v) => onSelectFolder?.(v === "__all__" ? null : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecionar pasta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as pastas</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const name = prompt("Nome da nova pasta:")?.trim();
                if (name) onCreateFolder?.(name);
              }}
            >
              + Pasta
            </Button>
          </div>
          {/* Busca e filtros */}
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Buscar por código"
              value={searchTerm}
              onChange={(e) => onSearchTermChange?.(e.target.value)}
              className="bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/60"
            />
            <div className="flex items-center gap-2">
              <Select value={statusFilter ?? "__all__"} onValueChange={(v) => onStatusFilterChange?.(v === "__all__" ? null : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os status</SelectItem>
                  <SelectItem value="Em teste">Em teste</SelectItem>
                  <SelectItem value="Em ajuste">Em ajuste</SelectItem>
                  <SelectItem value="Aprovada">Aprovadas</SelectItem>
                  <SelectItem value="Reprovada">Reprovadas</SelectItem>
                  <SelectItem value="Em correção externa">Em correção externa</SelectItem>
                  <SelectItem value="Em limpeza">Em limpeza</SelectItem>
                  <SelectItem value="Recebida">Recebidas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-sidebar-foreground/70">Paradas há +{staleDaysThreshold} dias</span>
              <Switch checked={staleOnly} onCheckedChange={() => onToggleStaleOnly?.()} />
            </div>
          </div>
        </div>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {(() => {
            if (matrices.length === 0) {
              return (
                <p className="text-sm text-sidebar-foreground/60 text-center py-8">
                  Nenhuma matriz cadastrada
                </p>
              );
            }
            // Agrupamento por pasta
            const byFolder = new Map<string | null, Matrix[]>();
            for (const m of matrices) {
              const key = m.folder ?? null;
              byFolder.set(key, [...(byFolder.get(key) || []), m]);
            }

            const folderKeys = Array.from(new Set([...(folders || []), ...Array.from(byFolder.keys()).filter((k): k is string => k !== null)])).sort();

            if (viewMode === "folders") {
              // Visualização somente pastas (colapsáveis)
              const [expandedFolders, setExpandedFolders] = [expanded, setExpanded] as unknown as [Record<string, boolean>, React.Dispatch<React.SetStateAction<Record<string, boolean>>>];
              return (
                <div className="space-y-3">
                  {folderKeys.map((f) => {
                    const items = byFolder.get(f) || [];
                    if (items.length === 0) return null;
                    const isOpen = !!expandedFolders[`folder:${f}`];
                    return (
                      <div key={`folder-${f}`} className="border border-sidebar-border rounded-md">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/40"
                          onClick={() => setExpandedFolders((prev) => ({ ...prev, [`folder:${f}`]: !prev[`folder:${f}`] }))}
                        >
                          <span className="font-semibold break-words">{f}</span>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        {isOpen && (
                          <div className="p-2 space-y-2">
                            {items.map((matrix) => (
                              <Card
                                key={matrix.id}
                                className={cn(
                                  "p-3 cursor-pointer transition-all hover:shadow-md",
                                  selectedMatrix?.id === matrix.id ? "bg-sidebar-accent border-primary shadow-md" : "bg-sidebar-accent/50 hover:bg-sidebar-accent"
                                )}
                                onClick={() => onSelectMatrix(matrix)}
                              >
                                <div className="flex items-start gap-2">
                                  <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="font-semibold text-sidebar-accent-foreground break-words">
                                          {matrix.code}
                                          <PriorityBadge level={matrix.priority} />
                                        </div>
                                        <div className="text-xs text-sidebar-foreground/70 break-words">
                                          Receb.: {new Date(matrix.receivedDate).toLocaleDateString("pt-BR")} • Último: {matrix.events.length > 0 ? new Date(matrix.events[matrix.events.length - 1].date).toLocaleDateString("pt-BR") : "-"}
                                        </div>
                                      </div>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                                            ⋮
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDeleteMatrix?.(matrix.id); }}>Excluir</DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            // Visualização atual (lista agrupada)
            const groups: { title: string; key: string | null; items: Matrix[] }[] = [];
            for (const k of folderKeys) {
              const items = byFolder.get(k) || [];
              if (items.length > 0) groups.push({ title: k, key: k, items });
            }
            const without = byFolder.get(null) || [];
            if (without.length > 0) groups.push({ title: "Sem pasta", key: null, items: without });

            return groups.map((group) => (
              <div key={group.key ?? "__no_folder__"} className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-sidebar-foreground/70 px-1">
                  <span className="break-words">{group.title}</span>
                  <span>{group.items.length}</span>
                </div>
                {group.items.map((matrix) => (
                  <Card
                    key={matrix.id}
                    className={cn(
                      "p-3 cursor-pointer transition-all hover:shadow-md",
                      selectedMatrix?.id === matrix.id
                        ? "bg-sidebar-accent border-primary shadow-md"
                        : "bg-sidebar-accent/50 hover:bg-sidebar-accent"
                    )}
                    onClick={() => onSelectMatrix(matrix)}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {/* Cabeçalho compacto */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sidebar-accent-foreground break-words">
                              {matrix.code}
                              <PriorityBadge level={matrix.priority} />
                            </div>
                            <div className="text-xs text-sidebar-foreground/70 break-words">
                              Receb.: {new Date(matrix.receivedDate).toLocaleDateString("pt-BR")} • Último: {matrix.events.length > 0 ? new Date(matrix.events[matrix.events.length - 1].date).toLocaleDateString("pt-BR") : "-"}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                                  ⋮
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDeleteMatrix?.(matrix.id); }}>Excluir</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(matrix.id); }}
                            className="text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            aria-label={expanded[matrix.id] ? "Recolher" : "Expandir"}
                            title={expanded[matrix.id] ? "Recolher" : "Expandir"}
                          >
                            {expanded[matrix.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          </div>
                        </div>

                        {/* indicador de estagnação */}
                        {daysSinceLastEvent(matrix) > staleDaysThreshold && (
                          <span
                            title={`Sem eventos há ${daysSinceLastEvent(matrix)} dias`}
                            className="mt-1 inline-block h-2 w-2 rounded-full bg-red-500 float-right"
                          />
                        )}

                        {/* Detalhes somente quando expandido */}
                        {expanded[matrix.id] && (
                          <div className="mt-2 space-y-2">
                            <p className="text-xs text-sidebar-foreground/70 break-words">
                              {getStatusFromLastEvent(matrix)}
                            </p>
                            {/* mover de pasta */}
                            <div>
                              <Select
                                value={matrix.folder ?? "__none__"}
                                onValueChange={(v) => onMoveMatrixFolder?.(matrix.id, v === "__none__" ? null : v)}
                              >
                                <SelectTrigger className="h-8 text-xs w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Sem pasta</SelectItem>
                                  {folders.map((f) => (
                                    <SelectItem key={f} value={f}>{f}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="text-xs text-sidebar-foreground/70 mt-1 flex items-center gap-3 flex-wrap">
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                                {getIndicators(matrix).tests} teste(s)
                              </span>
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <XCircle className="h-3 w-3 text-red-600" />
                                {getIndicators(matrix).rejects} reprovação(ões)
                              </span>
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Wrench className="h-3 w-3 text-orange-500" />
                                {getIndicators(matrix).fixes} correção(ões)
                              </span>
                            </div>
                            {matrix.responsible && (
                              <p className="text-xs text-sidebar-foreground/60 mt-1 break-words">
                                Resp.: {matrix.responsible}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ));
          })()}
        </div>
      </ScrollArea>
    </div>
  );
};
