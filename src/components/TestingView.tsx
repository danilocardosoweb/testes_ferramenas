import { useMemo, useState, useEffect } from "react";
import { Matrix, MatrixEvent } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Clock, CheckCircle, AlertTriangle, ArrowLeftRight, Calendar, Play, Trash2, ListTodo } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { updateEvent as sbUpdateEvent } from "@/services/db";
import { supabase } from "@/lib/supabaseClient";
import {
  addToTestingQueue,
  listTestingQueue,
  startTestFromQueue,
  removeFromTestingQueue,
  getAvailableMatricesForTesting,
  getTestingQueueStats,
  updateTestingQueueDetails,
  type TestingQueueItem
} from "@/services/testingQueue";

interface TestingViewProps {
  matrices: Matrix[];
  onTestCompleted: (matrixId: string, event: MatrixEvent) => void;
  onUpdateEvent?: (matrixId: string, eventId: string, updates: Partial<MatrixEvent>) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

// Calcula horas decorridas desde o início do teste (usa createdAt quando disponível)
const getElapsedHoursFromEvent = (event: MatrixEvent): number => {
  const now = new Date();
  const basis = event.createdAt ? new Date(event.createdAt) : new Date(event.date);
  const diffMs = now.getTime() - basis.getTime();
  return diffMs / (1000 * 60 * 60);
};

// Formata tempo decorrido em formato legível
const formatElapsedTime = (hours: number): string => {
  if (hours < 1) {
    const minutes = Math.floor(hours * 60);
    return `${minutes} min`;
  }
  if (hours < 24) {
    return `${Math.floor(hours)}h ${Math.floor((hours % 1) * 60)}min`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = Math.floor(hours % 24);
  return `${days}d ${remainingHours}h`;
};

// Determina a cor do card baseado no tempo
const getCardStyle = (hours: number): { border: string; bg: string; animate: boolean } => {
  if (hours >= 48) {
    return { border: "border-red-500 border-2", bg: "bg-red-50", animate: true };
  }
  if (hours >= 24) {
    return { border: "border-green-500 border-2", bg: "bg-green-50", animate: false };
  }
  return { border: "border-border", bg: "bg-card", animate: false };
};

export function TestingView({ matrices, onTestCompleted, onUpdateEvent, onRefresh }: TestingViewProps) {
  const [showPlanning, setShowPlanning] = useState(false);
  const [testingQueue, setTestingQueue] = useState<TestingQueueItem[]>([]);
  const [availableMatrices, setAvailableMatrices] = useState<Matrix[]>([]);
  const [loading, setLoading] = useState(false);
  // Oculta localmente cards que já foram finalizados/removidos (força sumir mesmo com cache desatualizado)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editMatrix, setEditMatrix] = useState<Matrix | null>(null);
  const [editEvent, setEditEvent] = useState<MatrixEvent | null>(null);
  const [editComment, setEditComment] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editPreviewSrc, setEditPreviewSrc] = useState<string | null>(null);
  
  // Estados para edição de item da fila
  const [queueEditOpen, setQueueEditOpen] = useState(false);
  const [queueEditItem, setQueueEditItem] = useState<TestingQueueItem | null>(null);
  const [queueEditNote, setQueueEditNote] = useState("");
  const [queueEditImages, setQueueEditImages] = useState<string[]>([]);
  const [queueEditPreviewSrc, setQueueEditPreviewSrc] = useState<string | null>(null);

  // Helpers
  const isTestEvent = (e: MatrixEvent) => e.type === "Testes";

  // Matrizes em teste (último evento "Testes" sem conclusão e sem eventos posteriores)
  const testingMatrices = useMemo(() => {
    return matrices
      .map((matrix) => {
        const testEvents = matrix.events.filter(isTestEvent);
        if (testEvents.length === 0) return null;

        const latestTest = testEvents[testEvents.length - 1];
        
        // Se o último teste tem comentário de conclusão, não está ativo
        if (latestTest.comment && /concluído/i.test(latestTest.comment)) return null;

        // Verifica se há eventos posteriores ao último teste
        const latestTestTime = latestTest.createdAt || latestTest.date + 'T00:00:00Z';
        const hasEventsAfterLastTest = matrix.events.some(e => {
          const eventTime = e.createdAt || e.date + 'T00:00:00Z';
          return eventTime > latestTestTime;
        });

        // Se há eventos posteriores, o teste foi concluído implicitamente
        if (hasEventsAfterLastTest) return null;

        return {
          matrix,
          testEvent: latestTest,
          elapsedHours: getElapsedHoursFromEvent(latestTest),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [matrices]);

  // Carrega dados da fila de planejamento
  useEffect(() => {
    loadTestingQueue();
  }, []);

  const loadTestingQueue = async () => {
    try {
      setLoading(true);
      const [queueData, availableData] = await Promise.all([
        listTestingQueue(),
        getAvailableMatricesForTesting()
      ]);
      setTestingQueue(queueData);
      setAvailableMatrices(availableData);
    } catch (err: any) {
      console.error('Erro ao carregar fila:', err);
      toast({ title: "Erro ao carregar fila", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableMatrices = async () => {
    try {
      const availableData = await getAvailableMatricesForTesting();
      setAvailableMatrices(availableData);
    } catch (err: any) {
      console.error('Erro ao carregar matrizes disponíveis:', err);
    }
  };

  // Separa por máquina
  const p18Matrices = useMemo(() => {
    return testingMatrices
      .filter((item) => item.testEvent.machine === "P18" && !hiddenIds.has(item.matrix.id))
      .sort((a, b) => b.elapsedHours - a.elapsedHours);
  }, [testingMatrices, hiddenIds]);

  const p19Matrices = useMemo(() => {
    return testingMatrices
      .filter((item) => item.testEvent.machine === "P19" && !hiddenIds.has(item.matrix.id))
      .sort((a, b) => b.elapsedHours - a.elapsedHours);
  }, [testingMatrices, hiddenIds]);

  // Contadores (Total = apenas o que é exibido nas colunas)
  const stats = useMemo(() => {
    return {
      total: p18Matrices.length + p19Matrices.length,
      p18: p18Matrices.length,
      p19: p19Matrices.length,
      available: availableMatrices.length,
      queueTotal: testingQueue.length,
      queueP18: testingQueue.filter(item => item.press === 'P18').length,
      queueP19: testingQueue.filter(item => item.press === 'P19').length,
    };
  }, [p18Matrices, p19Matrices, availableMatrices, testingQueue]);

  // Número do teste atual para um evento de Testes
  const getTestNumber = (matrix: Matrix) => {
    return (matrix.events || []).filter(isTestEvent).length;
  };

  const handleTestCompleted = (matrixId: string) => {
    // Finaliza o teste: cria evento "Testes" de conclusão (para Timeline/Planilha)
    const item = testingMatrices.find((x) => x.matrix.id === matrixId);
    const machine = item?.testEvent.machine;
    // Número do teste = quantidade existente + 1 (este será o evento de conclusão)
    const matrixFull = matrices.find(m => m.id === matrixId);
    const testsCount = (matrixFull?.events || []).filter(isTestEvent).length;
    const nth = testsCount + 1;
    const newEvent: MatrixEvent = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split("T")[0],
      type: "Testes",
      comment: `${nth}º teste concluído`,
      createdAt: new Date().toISOString(),
      machine,
    };
    onTestCompleted(matrixId, newEvent);
    setHiddenIds(prev => new Set(prev).add(matrixId));
    toast({ title: "Teste concluído", description: "Teste finalizado com sucesso." });
  };

  const handleChangeMachine = async (matrixId: string, eventId: string, newMachine: "P18" | "P19") => {
    try {
      if (onUpdateEvent) {
        await onUpdateEvent(matrixId, eventId, { machine: newMachine });
      } else {
        await sbUpdateEvent(eventId, { machine: newMachine });
      }
      toast({ title: "Prensa alterada", description: `Teste movido para ${newMachine}` });
    } catch (err: any) {
      toast({ title: "Erro ao trocar prensa", description: String(err?.message || err), variant: "destructive" });
    }
  };

  // Força encerrar o teste criando um evento de outro tipo e removendo o card da tela
  const handleForceRemove = (matrixId: string) => {
    const item = testingMatrices.find((x) => x.matrix.id === matrixId);
    const machine = item?.testEvent.machine;
    const newEvent: MatrixEvent = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split("T")[0],
      type: "Outro",
      comment: "Encerrado manualmente",
      createdAt: new Date().toISOString(),
      machine,
    };
    onTestCompleted(matrixId, newEvent);
    setHiddenIds((prev) => new Set(prev).add(matrixId));
    toast({ title: "Removido do painel", description: "Teste encerrado manualmente." });
  };

  const handlePlanTest = async (matrixId: string, machine: "P18" | "P19") => {
    try {
      setLoading(true);
      await addToTestingQueue(matrixId, machine, 'Planejado via interface');
      await loadTestingQueue();
      await loadAvailableMatrices();
      toast({ title: "Teste planejado", description: `Matriz adicionada à fila da ${machine}` });
      setShowPlanning(false);
    } catch (err: any) {
      console.error('Erro ao planejar teste:', err);
      toast({ title: "Erro ao planejar teste", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStartTestFromQueue = async (queueItem: TestingQueueItem) => {
    try {
      setLoading(true);
      await startTestFromQueue(queueItem.id);
      await loadTestingQueue();
      await loadAvailableMatrices();
      // Força reload das matrizes para mostrar o teste iniciado
      if (onRefresh) {
        await onRefresh();
      }
      toast({ title: "Teste iniciado", description: `Teste da matriz ${queueItem.matrix_code} iniciado na ${queueItem.press}` });
    } catch (err: any) {
      console.error('Erro ao iniciar teste:', err);
      toast({ title: "Erro ao iniciar teste", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromQueue = async (queueItem: TestingQueueItem) => {
    const confirm = window.confirm(`Remover ${queueItem.matrix_code} da fila?`);
    if (!confirm) return;
    
    try {
      setLoading(true);
      await removeFromTestingQueue(queueItem.id);
      await loadTestingQueue();
      await loadAvailableMatrices();
      toast({ title: "Removido da fila", description: `${queueItem.matrix_code} removido da fila` });
    } catch (err: any) {
      console.error('Erro ao remover da fila:', err);
      toast({ title: "Erro ao remover da fila", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenQueueEdit = (queueItem: TestingQueueItem) => {
    setQueueEditItem(queueItem);
    setQueueEditNote(queueItem.note || "");
    setQueueEditImages(queueItem.images || []);
    setQueueEditOpen(true);
  };

  const handleSaveQueueEdit = async () => {
    if (!queueEditItem) return;
    try {
      setLoading(true);
      await updateTestingQueueDetails(queueEditItem.id, queueEditNote, queueEditImages);
      await loadTestingQueue();
      setQueueEditOpen(false);
      toast({ title: "Atualizado", description: "Observação e imagens salvas" });
    } catch (err: any) {
      console.error('Erro ao atualizar item da fila:', err);
      toast({ title: "Erro ao atualizar", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleQueueImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setQueueEditImages((prev) => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveQueueImage = (index: number) => {
    setQueueEditImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeQueuePress = async (queueId: string, newPress: 'P18' | 'P19') => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('testing_queue')
        .update({ press: newPress })
        .eq('id', queueId);
      
      if (error) throw error;
      
      await loadTestingQueue();
      toast({ title: "Prensa alterada", description: `Item movido para ${newPress}` });
    } catch (err: any) {
      console.error('Erro ao trocar prensa:', err);
      toast({ title: "Erro ao trocar prensa", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const renderCard = (matrix: Matrix, testEvent: MatrixEvent, elapsedHours: number, currentMachine: "P18" | "P19") => {
    const style = getCardStyle(elapsedHours);
    const targetMachine = currentMachine === "P18" ? "P19" : "P18";

    const openEdit = () => {
      setEditMatrix(matrix);
      setEditEvent(testEvent);
      setEditComment(testEvent.comment || "");
      setEditImages(Array.isArray(testEvent.images) ? testEvent.images : []);
      setEditOpen(true);
    };

    return (
      <Card
        key={matrix.id}
        className={`${style.border} ${style.bg} ${style.animate ? "animate-pulse" : ""} transition-all duration-200 shadow-sm`}
        onClick={openEdit}
      >
        <CardHeader className="py-2 px-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-sm font-bold tracking-tight truncate">{matrix.code}</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-2 shrink-0">Teste {getTestNumber(matrix)}</Badge>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 p-0 shrink-0"
              onClick={(e) => { e.stopPropagation(); handleChangeMachine(matrix.id, testEvent.id, targetMachine); }}
              title={`Mover para ${targetMachine}`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
          {/* Linha compacta: início • decorrido */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="truncate">
              {new Date(testEvent.date).toLocaleDateString("pt-BR")}
              {testEvent.createdAt && (
                <span className="ml-1">{new Date(testEvent.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              )}
            </div>
            <div className="flex items-center gap-1 text-foreground">
              <Clock className="h-3 w-3 opacity-70" />
              <span className="font-semibold text-[11px]">{formatElapsedTime(elapsedHours)}</span>
              {elapsedHours >= 48 && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
            </div>
          </div>

          {/* Linha compacta: responsável */}
          {testEvent.responsible && (
            <div className="text-[11px] text-muted-foreground truncate">
              Resp.: <span className="text-foreground">{testEvent.responsible}</span>
            </div>
          )}

          {/* Observação (uma linha) */}
          {testEvent.comment && (
            <div className="text-[11px] italic text-foreground/80 truncate">{testEvent.comment}</div>
          )}

          <div className="flex gap-1 mt-1.5">
            <Button
              onClick={(e) => { e.stopPropagation(); handleTestCompleted(matrix.id); }}
              className="flex-1 h-7 text-[11px]"
              variant={elapsedHours >= 48 ? "destructive" : "default"}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Teste Realizado
            </Button>
            <Button
              variant="outline"
              className="h-7 text-[11px] px-2"
              onClick={(e) => { e.stopPropagation(); handleForceRemove(matrix.id); }}
              title="Encerrar e remover do painel"
            >
              Remover
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="h-full flex flex-col p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Matrizes Em Teste</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">Total: {stats.total}</Badge>
            <Badge variant="outline" className="border-blue-500 text-blue-700">P18: {stats.p18}</Badge>
            <Badge variant="outline" className="border-purple-500 text-purple-700">P19: {stats.p19}</Badge>
          </div>
        </div>
        <Dialog open={showPlanning} onOpenChange={setShowPlanning}>
          <DialogTrigger asChild>
            <Button>
              <Calendar className="h-4 w-4 mr-2" />
              Planejar Teste
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Planejar Novo Teste</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {stats.available} matriz(es) disponível(is) para teste
                </p>
                {availableMatrices.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma matriz disponível</p>
                ) : (
                  availableMatrices.map((matrix) => (
                    <Card key={matrix.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{matrix.code}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-blue-500 text-blue-700 hover:bg-blue-50"
                            onClick={() => handlePlanTest(matrix.id, "P18")}
                          >
                            Testar em P18
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-purple-500 text-purple-700 hover:bg-purple-50"
                            onClick={() => handlePlanTest(matrix.id, "P19")}
                          >
                            Testar em P19
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      {/* Layout em 2 colunas */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden min-h-0">
        {/* Coluna P18 */}
        <div className="flex flex-col h-full min-h-0">
          <div className="bg-blue-100 border-2 border-blue-500 rounded-t-lg p-3 flex-shrink-0">
            <h3 className="text-lg font-bold text-blue-900 flex items-center justify-between">
              <span>PRENSA P18</span>
              <div className="flex gap-1">
                <Badge className="bg-blue-600">{stats.p18}</Badge>
                {stats.queueP18 > 0 && (
                  <Badge variant="outline" className="border-blue-500 text-blue-700">
                    <ListTodo className="h-3 w-3 mr-1" />
                    {stats.queueP18}
                  </Badge>
                )}
              </div>
            </h3>
          </div>
          <ScrollArea className="flex-1 border-2 border-t-0 border-blue-500 rounded-b-lg bg-blue-50/30 min-h-0">
            <div className="p-3 space-y-3">
              {/* Fila de planejamento P18 */}
              {testingQueue.filter(item => item.press === 'P18').map((queueItem) => (
                <Card 
                  key={`queue-${queueItem.id}`} 
                  className="border-dashed border-blue-300 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => handleOpenQueueEdit(queueItem)}
                >
                  <CardHeader className="py-2 px-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-sm font-bold text-blue-800 truncate">
                          {queueItem.matrix_code}
                        </CardTitle>
                        <Badge variant="outline" className="h-5 text-[11px] px-1.5 border-blue-400 text-blue-700">
                          Na fila
                        </Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleChangeQueuePress(queueItem.id, 'P19'); }}
                        title="Mover para P19"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
                    <div className="text-[11px] text-blue-800 flex items-center justify-between">
                      <span>Plan.: {new Date(queueItem.available_at).toLocaleDateString('pt-BR')}</span>
                      {queueItem.note && <span className="italic truncate max-w-[60%]">{queueItem.note}</span>}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-[11px] bg-blue-600 hover:bg-blue-700"
                        onClick={(e) => { e.stopPropagation(); handleStartTestFromQueue(queueItem); }}
                        disabled={loading}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Iniciar
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 p-0 border-red-300 text-red-600 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); handleRemoveFromQueue(queueItem); }}
                        disabled={loading}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {/* Separador se houver fila e testes ativos */}
              {testingQueue.filter(item => item.press === 'P18').length > 0 && p18Matrices.length > 0 && (
                <Separator className="my-3" />
              )}
              
              {/* Testes em andamento P18 */}
              {p18Matrices.length === 0 && testingQueue.filter(item => item.press === 'P18').length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum teste em andamento</p>
                </div>
              ) : (
                p18Matrices.map(({ matrix, testEvent, elapsedHours }) =>
                  renderCard(matrix, testEvent, elapsedHours, "P18")
                )
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Coluna P19 */}
        <div className="flex flex-col h-full min-h-0">
          <div className="bg-purple-100 border-2 border-purple-500 rounded-t-lg p-3 flex-shrink-0">
            <h3 className="text-lg font-bold text-purple-900 flex items-center justify-between">
              <span>PRENSA P19</span>
              <div className="flex gap-1">
                <Badge className="bg-purple-600">{stats.p19}</Badge>
                {stats.queueP19 > 0 && (
                  <Badge variant="outline" className="border-purple-500 text-purple-700">
                    <ListTodo className="h-3 w-3 mr-1" />
                    {stats.queueP19}
                  </Badge>
                )}
              </div>
            </h3>
          </div>
          <ScrollArea className="flex-1 border-2 border-t-0 border-purple-500 rounded-b-lg bg-purple-50/30 min-h-0">
            <div className="p-3 space-y-3">
              {/* Fila de planejamento P19 */}
              {testingQueue.filter(item => item.press === 'P19').map((queueItem) => (
                <Card 
                  key={`queue-${queueItem.id}`} 
                  className="border-dashed border-purple-300 bg-purple-50 cursor-pointer hover:bg-purple-100 transition-colors"
                  onClick={() => handleOpenQueueEdit(queueItem)}
                >
                  <CardHeader className="py-2 px-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-sm font-bold text-purple-800 truncate">
                          {queueItem.matrix_code}
                        </CardTitle>
                        <Badge variant="outline" className="h-5 text-[11px] px-1.5 border-purple-400 text-purple-700">
                          Na fila
                        </Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleChangeQueuePress(queueItem.id, 'P18'); }}
                        title="Mover para P18"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
                    <div className="text-[11px] text-purple-800 flex items-center justify-between">
                      <span>Plan.: {new Date(queueItem.available_at).toLocaleDateString('pt-BR')}</span>
                      {queueItem.note && <span className="italic truncate max-w-[60%]">{queueItem.note}</span>}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-[11px] bg-purple-600 hover:bg-purple-700"
                        onClick={(e) => { e.stopPropagation(); handleStartTestFromQueue(queueItem); }}
                        disabled={loading}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Iniciar
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 p-0 border-red-300 text-red-600 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); handleRemoveFromQueue(queueItem); }}
                        disabled={loading}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {/* Separador se houver fila e testes ativos */}
              {testingQueue.filter(item => item.press === 'P19').length > 0 && p19Matrices.length > 0 && (
                <Separator className="my-3" />
              )}
              
              {/* Testes em andamento P19 */}
              {p19Matrices.length === 0 && testingQueue.filter(item => item.press === 'P19').length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum teste em andamento</p>
                </div>
              ) : (
                p19Matrices.map(({ matrix, testEvent, elapsedHours }) =>
                  renderCard(matrix, testEvent, elapsedHours, "P19")
                )
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Dialogo de edição rápida (comentário + imagens em memória) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Observação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{editMatrix?.code}</div>
            <div>
              <label className="text-sm">Observação</label>
              <Textarea className="mt-1" value={editComment} onChange={(e)=>setEditComment(e.target.value)} placeholder="Descreva a observação do teste..." />
            </div>
            <div>
              <label className="text-sm">Imagem (opcional)</label>
              <Input type="file" accept="image/*" onChange={(e)=>{
                const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>setEditImages([...(editImages||[]), r.result as string]); r.readAsDataURL(f);
              }} />
              {editImages?.length ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {editImages.map((src,i)=> (
                    <img
                      key={i}
                      src={src}
                      className="w-full h-24 object-cover rounded border cursor-zoom-in"
                      onClick={()=>setEditPreviewSrc(src)}
                      title="Clique para ampliar"
                    />
                  ))}
                </div>
              ): null}
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={async ()=>{
                if(!editMatrix || !editEvent) return;
                try {
                  await (onUpdateEvent?.(editMatrix.id, editEvent.id, { comment: editComment, images: editImages }) ?? Promise.resolve());
                  toast({ title: "Observação atualizada" });
                  setEditOpen(false);
                } catch(err:any){
                  toast({ title: "Erro ao salvar", description: String(err?.message||err), variant: "destructive" });
                }
              }}>Salvar</Button>
              <Button variant="outline" className="flex-1" onClick={()=>setEditOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Lightbox de imagem */}
      <Dialog open={!!editPreviewSrc} onOpenChange={(o)=>!o && setEditPreviewSrc(null)}>
        <DialogContent className="max-w-4xl">
          <div className="w-full h-full flex items-center justify-center">
            {editPreviewSrc && (
              <img src={editPreviewSrc} className="max-h-[80vh] w-auto object-contain rounded" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de edição de item da fila */}
      <Dialog open={queueEditOpen} onOpenChange={setQueueEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Planejamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {queueEditItem?.matrix_code} - {queueEditItem?.press}
            </div>
            <div>
              <label className="text-sm font-medium">Observação</label>
              <Textarea 
                className="mt-1" 
                value={queueEditNote} 
                onChange={(e) => setQueueEditNote(e.target.value)} 
                placeholder="Adicione observações sobre o planejamento..." 
              />
            </div>
            <div>
              <label className="text-sm font-medium">Imagens (opcional)</label>
              <Input 
                type="file" 
                accept="image/*" 
                multiple
                onChange={handleQueueImageUpload}
                className="mt-1"
              />
              {queueEditImages.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {queueEditImages.map((src, i) => (
                    <div key={i} className="relative">
                      <img
                        src={src}
                        className="w-full h-24 object-cover rounded border cursor-zoom-in"
                        onClick={() => setQueueEditPreviewSrc(src)}
                        title="Clique para ampliar"
                      />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 p-0"
                        onClick={() => handleRemoveQueueImage(i)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSaveQueueEdit} disabled={loading}>
                Salvar
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setQueueEditOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox de imagem da fila */}
      <Dialog open={!!queueEditPreviewSrc} onOpenChange={(o) => !o && setQueueEditPreviewSrc(null)}>
        <DialogContent className="max-w-4xl">
          <div className="w-full h-full flex items-center justify-center">
            {queueEditPreviewSrc && (
              <img src={queueEditPreviewSrc} className="max-h-[80vh] w-auto object-contain rounded" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
