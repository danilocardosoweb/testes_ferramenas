import { useEffect } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Matrix, MatrixEvent } from "@/types";
import { Calendar, MapPin, Tag } from "lucide-react";

// Formata ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm) para DD/MM/AAAA sem impacto de fuso
const fmtISODate = (iso: string) => {
  const clean = (iso || '').split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
  }
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
};

interface FlowViewProps {
  matrices: Matrix[];
  onEventClick: (matrixId: string, event: MatrixEvent) => void;
  onBlankClick?: () => void;
  onMatrixClick?: (matrixId: string) => void; // novo: clique no cabeçalho da matriz
  isReadOnly?: boolean; // modo somente leitura (sem login)
}

const createNodesAndEdges = (matrices: Matrix[]) => {
  if (matrices.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  let yOffset = 50;
  
  matrices.forEach((matrix) => {
    if (matrix.events.length === 0) return;
    
    // Nó de cabeçalho da matriz
    nodes.push({
      id: `matrix-${matrix.id}`,
      type: "default",
      position: { x: 50, y: yOffset },
      data: {
        label: (
          <div className="px-4 py-2 font-bold text-primary-foreground">
            Matriz {matrix.code}
          </div>
        ),
      },
      style: {
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
      },
      draggable: false,
    });
    
    // Ordena eventos por data asc antes de renderizar
    const eventsSorted = [...matrix.events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Add event nodes
    eventsSorted.forEach((event, index) => {
      const colorMap: Record<string, { border: string; bg: string; text: string }> = {
        "Teste Inicial": { border: "#3b82f6", bg: "#eff6ff", text: "#0f172a" }, // azul
        "Teste Final": { border: "#3b82f6", bg: "#eff6ff", text: "#0f172a" },
        "Aprovado": { border: "#16a34a", bg: "#ecfdf5", text: "#064e3b" }, // verde
        "Reprovado": { border: "#dc2626", bg: "#fef2f2", text: "#7f1d1d" }, // vermelho
        "Correção Externa": { border: "#f97316", bg: "#fff7ed", text: "#7c2d12" }, // laranja
        "Limpeza": { border: "#6b7280", bg: "#f3f4f6", text: "#111827" }, // cinza
        "Ajuste": { border: "#a855f7", bg: "#faf5ff", text: "#3b0764" },
        "Recebimento": { border: "#22c55e", bg: "#ecfdf5", text: "#064e3b" },
        "Manutenção": { border: "#0ea5e9", bg: "#f0f9ff", text: "#0c4a6e" },
        "Outro": { border: "#64748b", bg: "#f8fafc", text: "#0f172a" },
      };
      const colors = colorMap[event.type] || colorMap["Outro"];
      nodes.push({
        id: event.id,
        type: "default",
        position: { x: 300 + index * 350, y: yOffset },
        data: {
          label: (
            <div className="p-4 min-w-[250px] max-w-[300px] cursor-pointer">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-semibold text-sm break-words">{event.type}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{fmtISODate(event.date)}</span>
              </div>
              {event.location && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="break-words">{event.location}</span>
                </div>
              )}
              <p className="text-xs mt-2 text-foreground/80 break-words whitespace-pre-wrap">
                {event.comment}
              </p>
            </div>
          ),
          matrixId: matrix.id,
          event: event,
        },
        style: {
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          color: colors.text,
          borderRadius: "12px",
          padding: 0,
          boxShadow: "var(--shadow-md)",
          width: "auto",
          height: "auto",
        },
      });
      
      // Add edges between events
      if (index > 0) {
        edges.push({
          id: `${eventsSorted[index - 1].id}-${event.id}`,
          source: eventsSorted[index - 1].id,
          target: event.id,
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "hsl(var(--primary))",
          },
        });
      }
    });
    
    yOffset += 250;
  });

  return { nodes, edges };
};

export const FlowView = ({ matrices, onEventClick, onBlankClick, onMatrixClick, isReadOnly = false }: FlowViewProps) => {
  const { nodes: initialNodes, edges: initialEdges } = createNodesAndEdges(matrices);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = createNodesAndEdges(matrices);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [matrices, setNodes, setEdges]);

  const handleNodeClick = (_event: unknown, node: Node) => {
    // Em modo somente leitura, não abre diálogo de evento
    if (isReadOnly) return;
    // Clique em evento
    const { matrixId, event } = (node.data || {}) as { matrixId?: string; event?: MatrixEvent };
    if (matrixId && event) {
      onEventClick(matrixId, event);
      return;
    }
    // Clique no cabeçalho: id do nó começa com "matrix-<id>"
    if (typeof node.id === 'string' && node.id.startsWith('matrix-')) {
      const id = node.id.replace('matrix-', '');
      onMatrixClick?.(id);
    }
  };

  if (matrices.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-lg text-muted-foreground">
            Crie uma matriz para começar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-background">
      <div className="p-4 border-b border-border bg-card">
        <h2 className="text-2xl font-bold text-foreground">
          Timeline de Matrizes
        </h2>
        <p className="text-sm text-muted-foreground">
          {matrices.length} matriz(es) • {matrices.reduce((acc, m) => acc + m.events.length, 0)} evento(s) total
        </p>
      </div>
      <div className="h-[calc(100%-80px)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={isReadOnly ? undefined : onNodesChange}
          onEdgesChange={isReadOnly ? undefined : onEdgesChange}
          onNodeClick={handleNodeClick}
          fitView
          minZoom={0.3}
          maxZoom={1.5}
          onPaneClick={() => onBlankClick?.()}
          nodesDraggable={!isReadOnly}
          nodesConnectable={!isReadOnly}
          elementsSelectable={!isReadOnly}
          // Permite mover a tela mesmo sem login
          panOnDrag
          panOnScroll
          panOnScrollSpeed={0.8}
          // Zoom sempre disponível para visualização
          zoomOnScroll
          zoomOnPinch
        >
          <Background />
          {isReadOnly ? <Controls showInteractive={false} /> : <Controls />}
          <MiniMap
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
};
