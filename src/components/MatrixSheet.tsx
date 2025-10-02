import { useMemo, useState } from "react";
import { Matrix, MatrixEvent } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";

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
  | "approval";

interface MatrixSheetProps {
  matrices: Matrix[];
  onSetDate: (matrixId: string, milestone: SheetMilestone, date: string) => Promise<void> | void;
  onSelectMatrix?: (matrix: Matrix) => void;
}

export function MatrixSheet({ matrices, onSetDate, onSelectMatrix }: MatrixSheetProps) {
  const [filter, setFilter] = useState("");
  const sorted = useMemo(() => [...matrices].sort((a, b) => a.code.localeCompare(b.code, "pt-BR")), [matrices]);
  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((m) => m.code.toLowerCase().includes(term));
  }, [sorted, filter]);

  return (
    <Card className="h-full" onClick={(e) => e.stopPropagation()}>
      <CardHeader className="pb-2">
        <CardTitle className="mb-2">Planilha de Datas dos Eventos</CardTitle>
        <div className="max-w-sm">
          <Input
            placeholder="Filtrar por código (ex.: TP-8215/004)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8"
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-[1500px] w-max text-xs md:text-sm">
          <thead className="sticky top-0 bg-background border-b">
            <tr className="text-left [&>th]:py-2 [&>th]:px-2 [&>th]:whitespace-nowrap">
              <th>Ferramenta</th>
              <th>Data de recebimento</th>
              <th>1º teste</th>
              <th>Limpeza Saída</th>
              <th>Limpeza Entrada</th>
              <th>Correção Ext. Saída</th>
              <th>Correção Ext. Entrada</th>
              <th>2º teste</th>
              <th>Limpeza Saída</th>
              <th>Limpeza Entrada</th>
              <th>Correção Ext. Saída</th>
              <th>Correção Ext. Entrada</th>
              <th>3º teste</th>
              <th>Aprovação</th>
              <th>lead time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <Row key={m.id} matrix={m} onSetDate={onSetDate} onSelectMatrix={onSelectMatrix} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Row({ matrix, onSetDate, onSelectMatrix }: { matrix: Matrix; onSetDate: MatrixSheetProps["onSetDate"]; onSelectMatrix?: MatrixSheetProps["onSelectMatrix"]; }) {
  // helpers para extrair ocorrências por tipo
  const byType = (t: string) => matrix.events.filter((e) => e.type === t).sort((a, b) => a.date.localeCompare(b.date));
  const nthDate = (arr: MatrixEvent[], n: number) => arr[n]?.date || "";

  // Testes (múltiplos registros "Testes")
  const tests = byType("Testes");
  const test1 = tests[0]?.date || "";
  const test2 = tests[1]?.date || "";
  const test3 = tests[2]?.date || "";
  // Limpeza e Correção Externa por direção
  const cleanOut = byType("Limpeza Saída");
  const cleanIn = byType("Limpeza Entrada");
  const corrOut = byType("Correção Externa Saída");
  const corrIn = byType("Correção Externa Entrada");

  const lead = daysSinceLastEvent(matrix);
  const status = getStatusFromLastEvent(matrix);

  return (
    <tr className="border-b align-top [&>td]:py-2 [&>td]:px-2">
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
      <td className="whitespace-nowrap">{new Date(matrix.receivedDate).toLocaleDateString("pt-BR")}</td>
      {/* 1º teste */}
      <td><DateCell value={test1} onChange={(d) => onSetDate(matrix.id, "test1", d)} /></td>
      {/* ciclo 1 limpeza/correção */}
      <td><DateCell value={nthDate(cleanOut, 0)} onChange={(d) => onSetDate(matrix.id, "clean_send1", d)} /></td>
      <td><DateCell value={nthDate(cleanIn, 0)} onChange={(d) => onSetDate(matrix.id, "clean_return1", d)} /></td>
      <td><DateCell value={nthDate(corrOut, 0)} onChange={(d) => onSetDate(matrix.id, "corr_send1", d)} /></td>
      <td><DateCell value={nthDate(corrIn, 0)} onChange={(d) => onSetDate(matrix.id, "corr_return1", d)} /></td>
      {/* 2º teste */}
      <td><DateCell value={test2} onChange={(d) => onSetDate(matrix.id, "test2", d)} /></td>
      {/* ciclo 2 limpeza/correção */}
      <td><DateCell value={nthDate(cleanOut, 1)} onChange={(d) => onSetDate(matrix.id, "clean_send2", d)} /></td>
      <td><DateCell value={nthDate(cleanIn, 1)} onChange={(d) => onSetDate(matrix.id, "clean_return2", d)} /></td>
      <td><DateCell value={nthDate(corrOut, 1)} onChange={(d) => onSetDate(matrix.id, "corr_send2", d)} /></td>
      <td><DateCell value={nthDate(corrIn, 1)} onChange={(d) => onSetDate(matrix.id, "corr_return2", d)} /></td>
      {/* 3º teste */}
      <td><DateCell value={test3} onChange={(d) => onSetDate(matrix.id, "test3", d)} /></td>
      {/* aprovação */}
      <td><DateCell value={byType("Aprovado")[0]?.date || ""} onChange={(d) => onSetDate(matrix.id, "approval", d)} /></td>
      {/* lead & status */}
      <td className="text-center">{lead}</td>
      <td>{status}</td>
    </tr>
  );
}

function DateCell({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  return (
    <Input
      type="date"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-8"
    />
  );
}
