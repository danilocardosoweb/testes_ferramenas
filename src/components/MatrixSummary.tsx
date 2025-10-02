import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Matrix } from "@/types";
import { computeDurations, daysSinceLastEvent, getCounts } from "@/utils/metrics";

interface MatrixSummaryProps {
  matrix: Matrix;
}

export const MatrixSummary = ({ matrix }: MatrixSummaryProps) => {
  const counts = getCounts(matrix);
  const durations = computeDurations(matrix);
  const diasCorrecaoExterna = durations
    .filter((d) => d.from.type === "Correção Externa")
    .reduce((acc, d) => acc + d.days, 0);
  const diasEntreEventos = durations.filter((d) => !!d.to).map((d) => d.days);
  const mediaDias = diasEntreEventos.length
    ? Math.round(diasEntreEventos.reduce((a, b) => a + b, 0) / diasEntreEventos.length)
    : 0;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Resumo da Matriz</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">Código</p>
            <p className="font-medium">{matrix.code}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Dias sem evento</p>
            <p className="font-medium">{daysSinceLastEvent(matrix)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Testes</p>
            <p className="font-medium">{counts.tests}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Reprovações</p>
            <p className="font-medium">{counts.rejects}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Correções</p>
            <p className="font-medium">{counts.fixes}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Aprovações</p>
            <p className="font-medium">{counts.approvals}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Dias em correção externa</p>
            <p className="font-medium">{diasCorrecaoExterna}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Média dias entre eventos</p>
            <p className="font-medium">{mediaDias}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
