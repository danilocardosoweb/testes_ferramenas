import { useMemo, useState } from "react";
import { Matrix, MatrixEvent } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Download, Edit2, Clock } from "lucide-react";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";
import { QuickEventEditModal } from "./QuickEventEditModal";
import * as XLSX from "xlsx";

// Helper para formatar data sem problema de fuso horário
function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function getLatestEventDate(matrix: Matrix): string {
  let latest = matrix.receivedDate || "0000-00-00";
  const events = matrix.events || [];
  for (const event of events) {
    if (event?.date && event.date > latest) {
      latest = event.date;
    }
  }
  return latest;
}

function getReceivedSortKey(matrix: Matrix, mode: "oldest" | "latest"): string {
  if (!matrix.receivedDate) {
    return mode === "latest" ? "0000-00-00" : "9999-12-31";
  }
  return matrix.receivedDate;
}

export type SheetMilestone =
  | "test1"
  | "clean_send1"
  | "clean_return1"
  | "corr_send1"
  | "corr_return1"
  | "test2"
  | "clean_send2"
  | "clean_return2"
  | "corr_send2"
  | "corr_return2"
  | "test3"
  | "test4"
  | "test5"
  | "test6"
  | "clean_send3"
  | "clean_return3"
  | "corr_send3"
  | "corr_return3"
  | "clean_send4"
  | "clean_return4"
  | "corr_send4"
  | "corr_return4"
  | "approval";

interface MatrixSheetProps {
  matrices: Matrix[];
  onSetDate: (matrixId: string, milestone: SheetMilestone, date: string) => Promise<void> | void;
  onSelectMatrix?: (matrix: Matrix) => void;
  onDeleteDate?: (matrixId: string, milestone: SheetMilestone) => Promise<void> | void;
  onUpdateEvent?: (matrixId: string, eventId: string, updates: Partial<MatrixEvent>) => Promise<void> | void;
}

export function MatrixSheet({ matrices, onSetDate, onSelectMatrix, onDeleteDate, onUpdateEvent }: MatrixSheetProps) {
  const [filter, setFilter] = useState("");
  const [folder, setFolder] = useState<string>("__all__");
  const [showCycles, setShowCycles] = useState(false); // recolher/expandir colunas entre teste e correção ext. entrada
  const [testStage, setTestStage] = useState<string>("__all__");
  const [sortMode, setSortMode] = useState<"oldest" | "latest">("oldest");
  const [quickEditModal, setQuickEditModal] = useState<{ open: boolean; matrix: Matrix | null; event: MatrixEvent | null }>({ open: false, matrix: null, event: null });
  const sorted = useMemo(() => {
    return [...matrices].sort((a, b) => {
      if (sortMode === "latest") {
        const lastEventDateA = getLatestEventDate(a);
        const lastEventDateB = getLatestEventDate(b);
        if (lastEventDateA !== lastEventDateB) {
          return lastEventDateB.localeCompare(lastEventDateA);
        }
      }

      const keyA = getReceivedSortKey(a, sortMode);
      const keyB = getReceivedSortKey(b, sortMode);
      const compareReceived = sortMode === "latest"
        ? keyB.localeCompare(keyA)
        : keyA.localeCompare(keyB);
      if (compareReceived !== 0) {
        return compareReceived;
      }

      return a.code.localeCompare(b.code, "pt-BR");
    });
  }, [matrices, sortMode]);
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const m of matrices) set.add(m.folder || "(Sem pasta)");
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [matrices]);
  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return sorted.filter((m) => {
      const codeOk = term ? m.code.toLowerCase().includes(term) : true;
      const fName = m.folder || "(Sem pasta)";
      const folderOk = folder === "__all__" ? true : fName === folder;
      if (!codeOk || !folderOk) return false;

      if (testStage === "__all__") return true;

      const tests = m.events
        .filter((e) => e.type === "Testes" || /Teste/i.test(e.type))
        .sort((a, b) => a.date.localeCompare(b.date));
      const testsCount = tests.length;
      const hasAdditionalTests = testsCount > 3;

      switch (testStage) {
        case "none":
          return testsCount === 0;
        case "test1":
          return testsCount >= 1 && testsCount < 2;
        case "test2":
          return testsCount >= 2 && testsCount < 3;
        case "test3":
          return testsCount >= 3 && !hasAdditionalTests;
        case "extra":
          return hasAdditionalTests;
        default:
          return true;
      }
    });
  }, [sorted, filter, folder, testStage]);

  const exportToExcel = () => {
    // Função para calcular dias corridos desde a data de recebimento
    const calculateDaysSinceReceived = (receivedDate: string | undefined): number => {
      if (!receivedDate) return 0;
      const received = new Date(receivedDate);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - received.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    // Preparar os dados para exportação
    const data = filtered.map(matrix => {
      const eventsByType: Record<string, string> = {};
      
      // Agrupar eventos por tipo
      (matrix.events || []).forEach(event => {
        eventsByType[event.type] = formatDateBR(event.date);
      });
      
      // Calcular dias em andamento (desde o recebimento)
      const diasEmAndamento = calculateDaysSinceReceived(matrix.receivedDate);
      
      return {
        'Código': matrix.code,
        'Pasta': matrix.folder || '(Sem pasta)',
        'Data de Recebimento': formatDateBR(matrix.receivedDate || ''),
        'Dias em Andamento': diasEmAndamento,
        '1º Teste': eventsByType['1º Teste'] || '',
        '2º Teste': eventsByType['2º Teste'] || '',
        '3º Teste': eventsByType['3º Teste'] || '',
        'Aprovação': eventsByType['Aprovação'] || '',
        'Dias sem Evento': daysSinceLastEvent(matrix), // Mantendo a informação de dias sem evento
        'Status': getStatusFromLastEvent(matrix)
      };
    });

    // Criar uma planilha
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Ajustar largura das colunas
    const wscols = [
      { wch: 15 }, // Código
      { wch: 20 }, // Pasta
      { wch: 20 }, // Data de Recebimento
      { wch: 15 }, // Dias em Andamento
      { wch: 15 }, // 1º Teste
      { wch: 15 }, // 2º Teste
      { wch: 15 }, // 3º Teste
      { wch: 15 }, // Aprovação
      { wch: 15 }, // Dias sem Evento
      { wch: 20 }  // Status
    ];
    ws['!cols'] = wscols;

    // Criar um novo workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha de Eventos');

    // Gerar o arquivo Excel
    const fileName = `Planilha_Eventos_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <Card className="h-full" onClick={(e) => e.stopPropagation()}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle>Planilha de Datas dos Eventos</CardTitle>
          <Button 
            onClick={exportToExcel} 
            variant="outline" 
            size="sm"
            className="h-8 gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar para Excel
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
          <div className="col-span-1">
            <Input
              placeholder="Filtrar por código (ex.: TP-8215/004)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 w-full"
            />
          </div>
          <div className="col-span-1">
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Pasta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as pastas</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1">
            <Select value={testStage} onValueChange={setTestStage}>
              <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Etapa de teste" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as etapas</SelectItem>
                <SelectItem value="none">Sem testes</SelectItem>
                <SelectItem value="test1">Em 1º teste</SelectItem>
                <SelectItem value="test2">Em 2º teste</SelectItem>
                <SelectItem value="test3">Em 3º teste</SelectItem>
                <SelectItem value="extra">Testes extras (4º+)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1">
            <Select value={sortMode} onValueChange={(value: "oldest" | "latest") => setSortMode(value)}>
              <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Ordenação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oldest">Data de recebimento (mais antigas primeiro)</SelectItem>
                <SelectItem value="latest">Últimos lançamentos primeiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 flex justify-end md:justify-start">
            <button
              type="button"
              className={`h-8 px-3 rounded border text-sm ${showCycles ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
              onClick={() => setShowCycles((v) => !v)}
              title={showCycles ? "Recolher colunas de ciclos" : "Expandir colunas de ciclos"}
            >
              {showCycles ? "Esconder ciclos" : "Mostrar ciclos"}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto w-full">
        <table className="w-full text-xs md:text-sm border-collapse">
          <thead className="sticky top-0 bg-background border-b">
            <tr className="text-left [&>th]:py-1 [&>th]:px-1 [&>th]:whitespace-nowrap">
              <th>Ferramenta</th>
              <th>Data de recebimento</th>
              <th className="w-8"></th>
          <th>Dias em andamento</th>
              <th>1º teste</th>
              {showCycles && (
                <>
                  <th>Limpeza Saída</th>
                  <th>Limpeza Entrada</th>
                  <th>Correção Ext. Saída</th>
                  <th>Correção Ext. Entrada</th>
                </>
              )}
              <th>2º teste</th>
              {showCycles && (
                <>
                  <th>Limpeza Saída</th>
                  <th>Limpeza Entrada</th>
                  <th>Correção Ext. Saída</th>
                  <th>Correção Ext. Entrada</th>
                </>
              )}
              <th>3º teste</th>
              <th>Aprovação</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <Row key={m.id} matrix={m} onSetDate={onSetDate} onSelectMatrix={onSelectMatrix} onDeleteDate={onDeleteDate} showCycles={showCycles} onQuickEdit={(matrix, event) => setQuickEditModal({ open: true, matrix, event })} />
            ))}
          </tbody>
        </table>
      </CardContent>

      {/* Modal de edição rápida */}
      <QuickEventEditModal
        open={quickEditModal.open}
        onOpenChange={(open) => setQuickEditModal({ open, matrix: null, event: null })}
        matrix={quickEditModal.matrix}
        event={quickEditModal.event}
        onUpdateEvent={onUpdateEvent || (async () => {})}
      />
    </Card>
  );
}

function Row({ matrix, onSetDate, onSelectMatrix, onDeleteDate, showCycles = false, onQuickEdit }: { matrix: Matrix; onSetDate: MatrixSheetProps["onSetDate"]; onSelectMatrix?: MatrixSheetProps["onSelectMatrix"]; onDeleteDate?: MatrixSheetProps["onDeleteDate"]; showCycles?: boolean; onQuickEdit?: (matrix: Matrix, event: MatrixEvent) => void; }) {
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  // helpers para extrair ocorrências por tipo
  const byType = (t: string) => matrix.events.filter((e) => e.type === t).sort((a, b) => a.date.localeCompare(b.date));
  const nthDate = (arr: MatrixEvent[], n: number) => arr[n]?.date || "";

  // Testes: considerar todos os eventos do tipo "Testes" ou tipos legados com "Teste"
  const tests = matrix.events
    .filter((e) => {
      if (e.type === "Testes") {
        if (!e.comment) return true;
        return /^\d+º teste\b/i.test(e.comment.trim());
      }
      return /Teste/i.test(e.type);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  
  // Mapear testes por ordem numérica do comentário (1º, 2º, 3º, etc.)
  const orderedTests = tests.sort((a, b) => {
    const getTestNumber = (comment: string) => {
      const match = comment.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    return getTestNumber(a.comment || '') - getTestNumber(b.comment || '');
  });

  const test1 = orderedTests[0]?.date || "";
  const test2 = orderedTests[1]?.date || "";
  const test3 = orderedTests[2]?.date || "";
  
  // Limpeza e Correção Externa por direção (suporta tipos novos e antigos)
  const cleanOutNew = byType("Limpeza Saída");
  const cleanInNew = byType("Limpeza Entrada");
  const corrOutNew = byType("Correção Externa Saída");
  const corrInNew = byType("Correção Externa Entrada");

  // Antigos: tipo "Limpeza" com comentário indicando ida/volta; idem "Correção Externa"
  const oldCleans = byType("Limpeza");
  const oldCorr = byType("Correção Externa");
  const cleanOutOld = oldCleans.filter((e) => /Enviad[ao]|Sa[ií]da/i.test(e.comment || ""));
  const cleanInOld = oldCleans.filter((e) => /Retorn|Entrad/i.test(e.comment || ""));
  const corrOutOld = oldCorr.filter((e) => /Enviad[ao]|Sa[ií]da/i.test(e.comment || ""));
  const corrInOld = oldCorr.filter((e) => /Retorn|Entrad/i.test(e.comment || ""));

  // Juntar eventos novos e antigos, ordenando por data
  const cleanOut = [...cleanOutNew, ...cleanOutOld].sort((a, b) => a.date.localeCompare(b.date));
  const cleanIn = [...cleanInNew, ...cleanInOld].sort((a, b) => a.date.localeCompare(b.date));
  const corrOut = [...corrOutNew, ...corrOutOld].sort((a, b) => a.date.localeCompare(b.date));
  const corrIn = [...corrInNew, ...corrInOld].sort((a, b) => a.date.localeCompare(b.date));

  const lead = daysSinceLastEvent(matrix);
  const status = getStatusFromLastEvent(matrix);

  const daysSinceReceived = matrix.receivedDate
    ? Math.max(0, Math.floor((Date.now() - new Date(matrix.receivedDate).getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  const highlight = typeof daysSinceReceived === "number" && daysSinceReceived > 30;

  // Obter o primeiro evento de teste para edição rápida
  const firstTestEvent = tests[0];

  return (
    <>
    <tr className={`border-b align-top [&>td]:py-1 [&>td]:px-1 ${highlight ? "bg-red-100/80" : ""}`}>
      <td className="font-medium whitespace-nowrap">
        {onSelectMatrix ? (
          <button
            type="button"
            className="underline underline-offset-2 hover:text-primary"
            onClick={() => onSelectMatrix(matrix)}
            title="Abrir painel da matriz"
          >
            {matrix.code}
          </button>
        ) : (
          matrix.code
        )}
      </td>
      <td className="whitespace-nowrap">{formatDateBR(matrix.receivedDate)}</td>
      <td className="text-center">
        {firstTestEvent && onQuickEdit && (
          <button
            type="button"
            className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={() => onQuickEdit(matrix, firstTestEvent)}
            title="Editar Status e Observações"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        )}
      </td>
      <td className="text-center font-semibold">{daysSinceReceived ?? "-"}</td>
      {/* 1º teste */}
      <td><DateCell value={test1} onChange={(d) => onSetDate(matrix.id, "test1", d)} /></td>
      {/* ciclo 1 limpeza/correção */}
      {showCycles && (
        <>
          <td><DateCell value={nthDate(cleanOut, 0)} onChange={(d) => onSetDate(matrix.id, "clean_send1", d)} /></td>
          <td><DateCell value={nthDate(cleanIn, 0)} onChange={(d) => onSetDate(matrix.id, "clean_return1", d)} /></td>
          <td><DateCell value={nthDate(corrOut, 0)} onChange={(d) => onSetDate(matrix.id, "corr_send1", d)} /></td>
          <td><DateCell value={nthDate(corrIn, 0)} onChange={(d) => onSetDate(matrix.id, "corr_return1", d)} /></td>
        </>
      )}
      {/* 2º teste */}
      <td><DateCell value={test2} onChange={(d) => onSetDate(matrix.id, "test2", d)} /></td>
      {/* ciclo 2 limpeza/correção */}
      {showCycles && (
        <>
          <td><DateCell value={nthDate(cleanOut, 1)} onChange={(d) => onSetDate(matrix.id, "clean_send2", d)} /></td>
          <td><DateCell value={nthDate(cleanIn, 1)} onChange={(d) => onSetDate(matrix.id, "clean_return2", d)} /></td>
          <td><DateCell value={nthDate(corrOut, 1)} onChange={(d) => onSetDate(matrix.id, "corr_send2", d)} /></td>
          <td><DateCell value={nthDate(corrIn, 1)} onChange={(d) => onSetDate(matrix.id, "corr_return2", d)} /></td>
        </>
      )}
      {/* 3º teste + botão inline para abrir extras por linha */}
      <td>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <DateCell value={test3} onChange={(d) => onSetDate(matrix.id, "test3", d)} />
          <button
            type="button"
            className="h-6 px-2 rounded border inline-flex items-center justify-center text-xs shrink-0"
            title="Gerenciar testes extras"
            onClick={() => setExtrasOpen(true)}
          >
            Testes +
          </button>
          <button
            type="button"
            className="h-6 w-6 rounded border inline-flex items-center justify-center shrink-0"
            title="Ver linha do tempo"
            onClick={() => setTimelineOpen(true)}
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
          {/* Indicador do teste atual (chip curto, sem quebra) */}
          {(() => {
            const currentTestNumber = orderedTests.length;
            if (currentTestNumber <= 0) return null;
            const high = currentTestNumber >= 4;
            return (
              <Badge
                variant={high ? undefined : "secondary"}
                className={`ml-1 h-5 px-1.5 text-[10px] leading-none rounded-full whitespace-nowrap font-medium ${high ? "bg-amber-100 text-amber-900 border border-amber-300" : ""}`}
                title={`Teste atual: ${currentTestNumber}º`}
                aria-label={`Teste atual: ${currentTestNumber}º`}
              >
                <span className="font-mono">T{currentTestNumber}</span>
              </Badge>
            );
          })()}
        </div>
      </td>
      {/* aprovação */}
      <td><DateCell value={byType("Aprovado")[0]?.date || ""} onChange={(d) => onSetDate(matrix.id, "approval", d)} /></td>
      {/* status */}
      <td>{status}</td>
    </tr>
    <Dialog open={extrasOpen} onOpenChange={setExtrasOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Testes extras</DialogTitle>
          <DialogDescription>
            Gerencie as datas do 4º, 5º e 6º testes. As alterações salvam automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-10 text-xs text-muted-foreground">4º</span>
            <DateCell value={orderedTests[3]?.date || ""} onChange={(d) => onSetDate(matrix.id, "test4", d)} />
            {onDeleteDate && (
              <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => onDeleteDate(matrix.id, "test4")}>
                Excluir
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="w-10 text-xs text-muted-foreground">5º</span>
            <DateCell value={orderedTests[4]?.date || ""} onChange={(d) => onSetDate(matrix.id, "test5", d)} />
            {onDeleteDate && (
              <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => onDeleteDate(matrix.id, "test5")}>
                Excluir
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="w-10 text-xs text-muted-foreground">6º</span>
            <DateCell value={orderedTests[5]?.date || ""} onChange={(d) => onSetDate(matrix.id, "test6", d)} />
            {onDeleteDate && (
              <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => onDeleteDate(matrix.id, "test6")}>
                Excluir
              </Button>
            )}
          </div>
          {showCycles && (
            <div className="mt-2 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Ciclos de Limpeza/Correção (3 e 4)</div>
              {/* Ciclo 3 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">Limpeza Saída (3)</span>
                  <DateCell value={nthDate(cleanOut, 2)} onChange={(d) => onSetDate(matrix.id, "clean_send3", d)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">Limpeza Entrada (3)</span>
                  <DateCell value={nthDate(cleanIn, 2)} onChange={(d) => onSetDate(matrix.id, "clean_return3", d)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">Corr. Ext. Saída (3)</span>
                  <DateCell value={nthDate(corrOut, 2)} onChange={(d) => onSetDate(matrix.id, "corr_send3", d)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">Corr. Ext. Entrada (3)</span>
                  <DateCell value={nthDate(corrIn, 2)} onChange={(d) => onSetDate(matrix.id, "corr_return3", d)} />
                </div>
              </div>
              {/* Ciclo 4 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">Limpeza Saída (4)</span>
                  <DateCell value={nthDate(cleanOut, 3)} onChange={(d) => onSetDate(matrix.id, "clean_send4", d)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">Limpeza Entrada (4)</span>
                  <DateCell value={nthDate(cleanIn, 3)} onChange={(d) => onSetDate(matrix.id, "clean_return4", d)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">Corr. Ext. Saída (4)</span>
                  <DateCell value={nthDate(corrOut, 3)} onChange={(d) => onSetDate(matrix.id, "corr_send4", d)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">Corr. Ext. Entrada (4)</span>
                  <DateCell value={nthDate(corrIn, 3)} onChange={(d) => onSetDate(matrix.id, "corr_return4", d)} />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={() => setExtrasOpen(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Linha do Tempo – {matrix.code}</DialogTitle>
          <DialogDescription>Eventos em ordem cronológica com intervalo entre marcos.</DialogDescription>
        </DialogHeader>
        {(() => {
          type TItem = { date: string; label: string; kind: "receb"|"test"|"clean_out"|"clean_in"|"corr_out"|"corr_in"|"approval" };
          const items: Array<TItem> = [];
          if (matrix.receivedDate) items.push({ date: matrix.receivedDate, label: "Recebimento", kind: "receb" });
          orderedTests.forEach((t, i) => { if (t?.date) items.push({ date: t.date, label: `${i + 1}º teste`, kind: "test" }); });
          cleanOut.forEach((e, i) => { if (e?.date) items.push({ date: e.date, label: `Limpeza Saída (${i + 1})`, kind: "clean_out" }); });
          cleanIn.forEach((e, i) => { if (e?.date) items.push({ date: e.date, label: `Limpeza Entrada (${i + 1})`, kind: "clean_in" }); });
          corrOut.forEach((e, i) => { if (e?.date) items.push({ date: e.date, label: `Correção Ext. Saída (${i + 1})`, kind: "corr_out" }); });
          corrIn.forEach((e, i) => { if (e?.date) items.push({ date: e.date, label: `Correção Ext. Entrada (${i + 1})`, kind: "corr_in" }); });
          const approval = byType("Aprovado")[0];
          if (approval?.date) items.push({ date: approval.date, label: "Aprovação", kind: "approval" });

          const sorted = items.filter(it => it.date).sort((a, b) => a.date.localeCompare(b.date));
          const daysBetween = (a: string, b: string) => {
            try {
              const da = new Date(a);
              const db = new Date(b);
              da.setHours(0,0,0,0); db.setHours(0,0,0,0);
              const ms = db.getTime() - da.getTime();
              return Math.max(0, Math.round(ms / (1000*60*60*24)));
            } catch { return null; }
          };

          const currentTestNumber = orderedTests.length;
          const last = sorted[sorted.length - 1];
          const daysInProgress = matrix.receivedDate ? daysBetween(matrix.receivedDate, new Date().toISOString().slice(0,10)) : null;

          const kindStyles: Record<TItem["kind"], string> = {
            receb: "bg-muted text-muted-foreground",
            test: "bg-blue-50 text-blue-900 border-blue-300",
            clean_out: "bg-sky-50 text-sky-900 border-sky-300",
            clean_in: "bg-sky-50 text-sky-900 border-sky-300",
            corr_out: "bg-amber-50 text-amber-900 border-amber-300",
            corr_in: "bg-amber-50 text-amber-900 border-amber-300",
            approval: "bg-green-50 text-green-900 border-green-300",
          };

          const bulletColor: Record<TItem["kind"], string> = {
            receb: "bg-muted-foreground/60",
            test: "bg-blue-500",
            clean_out: "bg-sky-500",
            clean_in: "bg-sky-500",
            corr_out: "bg-amber-500",
            corr_in: "bg-amber-500",
            approval: "bg-green-600",
          };

          const counts = {
            testes: sorted.filter(i => i.kind === 'test').length,
            limpezas: sorted.filter(i => i.kind === 'clean_out' || i.kind === 'clean_in').length,
            correcoes: sorted.filter(i => i.kind === 'corr_out' || i.kind === 'corr_in').length,
          };

          const copyText = sorted.map((it) => {
            const dateBR = formatDateBR(it.date);
            return `${dateBR} | ${it.label}`;
          }).join('\n');

          return (
            <div className="space-y-3">
              {/* Resumo */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center h-6 rounded-full border px-2 bg-muted text-muted-foreground">Teste atual: {currentTestNumber > 0 ? `${currentTestNumber}º` : "–"}</span>
                {last && (
                  <span className="inline-flex items-center h-6 rounded-full border px-2 bg-muted text-muted-foreground">Último evento: {last.label} • {formatDateBR(last.date)}</span>
                )}
                {typeof daysInProgress === 'number' && (
                  <span className="inline-flex items-center h-6 rounded-full border px-2 bg-muted text-muted-foreground">Dias em andamento: {daysInProgress}</span>
                )}
                <span className="inline-flex items-center h-6 rounded-full border px-2 bg-muted text-muted-foreground">Testes: {counts.testes}</span>
                <span className="inline-flex items-center h-6 rounded-full border px-2 bg-muted text-muted-foreground">Limpezas: {counts.limpezas}</span>
                <span className="inline-flex items-center h-6 rounded-full border px-2 bg-muted text-muted-foreground">Correções: {counts.correcoes}</span>
                <div className="ml-auto">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => navigator.clipboard?.writeText(copyText)}
                    title="Copiar a linha do tempo como texto">
                    Copiar
                  </Button>
                </div>
              </div>

              {/* Lista cronológica */}
              <div className="relative pl-6 md:pl-7 max-h-[60vh] overflow-y-auto pr-2">
                <div className="absolute left-2 top-0 bottom-0 border-l" />
                <div className="space-y-2">
                  {sorted.map((it, idx) => {
                    const prev = idx > 0 ? sorted[idx-1] : null;
                    const delta = prev ? daysBetween(prev.date, it.date) : null;
                    const highlight = it.kind === 'test' && it.label.startsWith(`${currentTestNumber}º`);
                    return (
                      <div key={`${it.date}-${it.label}-${idx}`} className={`relative grid grid-cols-[112px_1fr] items-center gap-4 ${highlight ? 'bg-blue-50/60 rounded px-1' : ''}`}>
                        <div className={`absolute left-2 -translate-x-1/2 w-2 h-2 rounded-full ${bulletColor[it.kind]}`} />
                        <div className="text-xs text-muted-foreground pl-2">{formatDateBR(it.date)}</div>
                        <div className={`text-sm inline-flex items-center gap-2 ${highlight ? 'font-semibold' : ''}`}>
                          <span>{it.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}

function DateCell({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  return (
    <Input
      type="date"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-28 md:w-32"
    />
  );
}
