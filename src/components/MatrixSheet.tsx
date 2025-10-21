import { useMemo, useState } from "react";
import { Matrix, MatrixEvent } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";

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
}

export function MatrixSheet({ matrices, onSetDate, onSelectMatrix, onDeleteDate }: MatrixSheetProps) {
  const [filter, setFilter] = useState("");
  const [folder, setFolder] = useState<string>("__all__");
  const [showCycles, setShowCycles] = useState(false); // recolher/expandir colunas entre teste e correção ext. entrada
  const [testStage, setTestStage] = useState<string>("__all__");
  const [sortMode, setSortMode] = useState<"oldest" | "latest">("oldest");
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

  return (
    <Card className="h-full" onClick={(e) => e.stopPropagation()}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle>Planilha de Datas dos Eventos</CardTitle>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <div className="max-w-sm w-64 min-w-[220px]">
            <Input
              placeholder="Filtrar por código (ex.: TP-8215/004)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="w-60 min-w-[200px]">
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Pasta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as pastas</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-60 min-w-[200px]">
            <Select value={testStage} onValueChange={setTestStage}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Etapa de teste" /></SelectTrigger>
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
          <div className="w-56 min-w-[200px]">
            <Select value={sortMode} onValueChange={(value: "oldest" | "latest") => setSortMode(value)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Ordenação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oldest">Data de recebimento (mais antigas primeiro)</SelectItem>
                <SelectItem value="latest">Últimos lançamentos primeiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <button
            type="button"
            className={`h-8 px-3 rounded border text-sm ${showCycles ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
            onClick={() => setShowCycles((v) => !v)}
            title={showCycles ? "Recolher colunas de ciclos" : "Expandir colunas de ciclos"}
          >
            {showCycles ? "Esconder ciclos" : "Mostrar ciclos"}
          </button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-[1100px] w-max text-xs md:text-sm">
          <thead className="sticky top-0 bg-background border-b">
            <tr className="text-left [&>th]:py-1 [&>th]:px-1 [&>th]:whitespace-nowrap">
              <th>Ferramenta</th>
              <th>Data de recebimento</th>
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
              <Row key={m.id} matrix={m} onSetDate={onSetDate} onSelectMatrix={onSelectMatrix} onDeleteDate={onDeleteDate} showCycles={showCycles} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Row({ matrix, onSetDate, onSelectMatrix, onDeleteDate, showCycles = false }: { matrix: Matrix; onSetDate: MatrixSheetProps["onSetDate"]; onSelectMatrix?: MatrixSheetProps["onSelectMatrix"]; onDeleteDate?: MatrixSheetProps["onDeleteDate"]; showCycles?: boolean; }) {
  const [extraOpen, setExtraOpen] = useState(false);
  // helpers para extrair ocorrências por tipo
  const byType = (t: string) => matrix.events.filter((e) => e.type === t).sort((a, b) => a.date.localeCompare(b.date));
  const nthDate = (arr: MatrixEvent[], n: number) => arr[n]?.date || "";

  // Testes: considerar todos os eventos do tipo "Testes" ou tipos legados com "Teste"
  const tests = matrix.events
    .filter((e) => {
      // Novo fluxo: tipo "Testes" (todos, não apenas concluídos)
      if (e.type === "Testes") {
        return true;
      }
      // legado: quaisquer tipos com a palavra "Teste" continuam valendo
      return /Teste/i.test(e.type);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const test1 = tests[0]?.date || "";
  const test2 = tests[1]?.date || "";
  const test3 = tests[2]?.date || "";
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
        <div className="flex items-center gap-2">
          <DateCell value={test3} onChange={(d) => onSetDate(matrix.id, "test3", d)} />
          <button
            type="button"
            className="h-6 w-6 rounded-full border inline-flex items-center justify-center text-sm"
            title={extraOpen ? "Recolher testes extras" : "Adicionar testes"}
            onClick={() => setExtraOpen((v) => !v)}
          >
            {extraOpen ? "−" : "+"}
          </button>
        </div>
      </td>
      {/* aprovação */}
      <td><DateCell value={byType("Aprovado")[0]?.date || ""} onChange={(d) => onSetDate(matrix.id, "approval", d)} /></td>
      {/* status */}
      <td>{status}</td>
    </tr>
    {extraOpen && (
      <tr className={`bg-muted/30 align-top [&>td]:py-1 [&>td]:px-2 ${highlight ? "bg-red-100/80" : ""}`}>
        {/* Ferramenta (rótulo) */}
        <td className="text-xs text-muted-foreground whitespace-nowrap">Testes extras:</td>
        {/* Data de recebimento (vazio) */}
        <td />
        {/* 1º teste: 4º teste */}
        <td>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">4º</span>
            <DateCell value={tests[3]?.date || ""} onChange={(d) => onSetDate(matrix.id, "test4", d)} />
            <button
              type="button"
              className="h-6 w-6 rounded-full border inline-flex items-center justify-center text-xs"
              title="Excluir 4º teste"
              onClick={() => onDeleteDate?.(matrix.id, "test4")}
            >
              ×
            </button>
          </div>
        </td>
        {/* Ciclo 1: usar ciclo 3 (índice 2) */}
        {showCycles && (<>
          <td><DateCell value={nthDate(cleanOut, 2)} onChange={(d) => onSetDate(matrix.id, "clean_send3", d)} /></td>
          <td><DateCell value={nthDate(cleanIn, 2)} onChange={(d) => onSetDate(matrix.id, "clean_return3", d)} /></td>
          <td><DateCell value={nthDate(corrOut, 2)} onChange={(d) => onSetDate(matrix.id, "corr_send3", d)} /></td>
          <td><DateCell value={nthDate(corrIn, 2)} onChange={(d) => onSetDate(matrix.id, "corr_return3", d)} /></td>
        </>)}
        {/* 2º teste: 5º teste */}
        <td>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">5º</span>
            <DateCell value={tests[4]?.date || ""} onChange={(d) => onSetDate(matrix.id, "test5", d)} />
            <button
              type="button"
              className="h-6 w-6 rounded-full border inline-flex items-center justify-center text-xs"
              title="Excluir 5º teste"
              onClick={() => onDeleteDate?.(matrix.id, "test5")}
            >
              ×
            </button>
          </div>
        </td>
        {/* Ciclo 2 (vazio) */}
        {showCycles && (<>
          <td><DateCell value={nthDate(cleanOut, 3)} onChange={(d) => onSetDate(matrix.id, "clean_send4", d)} /></td>
          <td><DateCell value={nthDate(cleanIn, 3)} onChange={(d) => onSetDate(matrix.id, "clean_return4", d)} /></td>
          <td><DateCell value={nthDate(corrOut, 3)} onChange={(d) => onSetDate(matrix.id, "corr_send4", d)} /></td>
          <td><DateCell value={nthDate(corrIn, 3)} onChange={(d) => onSetDate(matrix.id, "corr_return4", d)} /></td>
        </>)}
        {/* 3º teste: 6º teste */}
        <td>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">6º</span>
            <DateCell value={tests[5]?.date || ""} onChange={(d) => onSetDate(matrix.id, "test6", d)} />
            <button
              type="button"
              className="h-6 w-6 rounded-full border inline-flex items-center justify-center text-xs"
              title="Excluir 6º teste"
              onClick={() => onDeleteDate?.(matrix.id, "test6")}
            >
              ×
            </button>
          </div>
        </td>
        {/* Aprovação, status (vazios) */}
        <td />
        <td />
      </tr>
    )}
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
