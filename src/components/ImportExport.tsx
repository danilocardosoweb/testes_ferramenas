import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { Matrix } from "@/types";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { getStatusFromLastEvent, daysSinceLastEvent, getCounts, computeDurations } from "@/utils/metrics";
import { v4 as uuidv4 } from "uuid";

interface ImportExportProps {
  matrices: Matrix[];
  onImport: (matrices: Matrix[]) => void;
}

export const ImportExport = ({ matrices, onImport }: ImportExportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleExportExcel = () => {
    // Sheet: Matrizes
    const sheetMatrices = matrices.map((m) => ({
      id: m.id,
      codigo: m.code,
      prioridade: m.priority ?? "",
      responsavel: m.responsible ?? "",
      pasta: m.folder ?? "",
      data_recebimento: new Date(m.receivedDate).toLocaleDateString("pt-BR"),
      status_atual: getStatusFromLastEvent(m),
      dias_sem_evento: daysSinceLastEvent(m),
    }));

    // Sheet: Eventos
    const rowsEventos = matrices.flatMap((m) =>
      m.events.map((e) => ({
        id_evento: e.id,
        id_matriz: m.id,
        codigo_matriz: m.code,
        data: new Date(e.date).toLocaleDateString("pt-BR"),
        tipo: e.type,
        responsavel: e.responsible ?? "",
        local: e.location ?? "",
        comentario: e.comment,
      })),
    );

    // Sheet: KPIs
    const sheetKPIs = matrices.map((m) => {
      const c = getCounts(m);
      // total dias em correção externa (somando trechos cujo 'from.type' é Correção Externa)
      const durations = computeDurations(m);
      const diasCorrecaoExterna = durations
        .filter((d) => d.from.type === "Correção Externa")
        .reduce((acc, d) => acc + d.days, 0);
      return {
        id: m.id,
        codigo: m.code,
        testes: c.tests,
        reprovacoes: c.rejects,
        correcoes: c.fixes,
        aprovacoes: c.approvals,
        dias_correcao_externa: diasCorrecaoExterna,
      };
    });

    const wb = XLSX.utils.book_new();
    const wsMatrices = XLSX.utils.json_to_sheet(sheetMatrices);
    const wsEventos = XLSX.utils.json_to_sheet(rowsEventos);
    const wsKPIs = XLSX.utils.json_to_sheet(sheetKPIs);

    XLSX.utils.book_append_sheet(wb, wsMatrices, "Matrizes");
    XLSX.utils.book_append_sheet(wb, wsEventos, "Eventos");
    XLSX.utils.book_append_sheet(wb, wsKPIs, "KPIs");

    XLSX.writeFile(wb, `relatorio_matrizes_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({
      title: "Exportação Excel concluída",
      description: "Arquivo .xlsx gerado com sucesso.",
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });

      // Preferir sheet "Eventos" se existir; caso contrário, usar a primeira
      const sheetName = wb.SheetNames.includes("Eventos") ? "Eventos" : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      // Função para normalizar datas (aceita DD/MM/AAAA ou AAAA-MM-DD)
      const toISO = (s: string): string => {
        const t = String(s).trim();
        // já é Date? (quando o Excel traz como número será convertido em data pela lib se formatado)
        if (t === "") return new Date().toISOString().split("T")[0];
        // dd/mm/aaaa
        const dm = t.match(/^([0-3]?\d)\/(0?\d|1[0-2])\/(\d{4})$/);
        if (dm) {
          const [_, d, m, y] = dm;
          const iso = new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toISOString().split("T")[0];
          return iso;
        }
        // aaaa-mm-dd
        const ym = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ym) return t;
        // fallback: tentar Date.parse
        const d2 = new Date(t);
        if (!isNaN(d2.getTime())) return d2.toISOString().split("T")[0];
        return new Date().toISOString().split("T")[0];
      };

      // Aceita colunas: codigo_matriz, data, tipo, responsavel, local, comentario
      // Agrupar por código
      const byCode = new Map<string, Matrix>();
      for (const r of rows) {
        const code = (r["codigo_matriz"] || r["codigo"] || r["matriz"] || "").toString().trim();
        if (!code) continue;
        const dateISO = toISO(r["data"] || r["data_evento"] || r["date"] || "");
        const type = (r["tipo"] || r["type"] || "Outro").toString().trim() || "Outro";
        const responsible = (r["responsavel"] || r["responsável"] || r["responsible"] || "").toString().trim() || undefined;
        const location = (r["local"] || r["location"] || "").toString().trim() || undefined;
        const comment = (r["comentario"] || r["comentário"] || r["comment"] || "").toString();

        if (!byCode.has(code)) {
          byCode.set(code, {
            id: uuidv4(),
            code,
            receivedDate: dateISO,
            events: [],
          });
        }
        const matrix = byCode.get(code)!;
        matrix.events.push({
          id: uuidv4(),
          date: dateISO,
          type,
          comment,
          responsible,
          location,
        });
        // ajustar receivedDate para a menor data
        if (new Date(dateISO) < new Date(matrix.receivedDate)) {
          matrix.receivedDate = dateISO;
        }
      }

      const importedData = Array.from(byCode.values()).map((m) => ({
        ...m,
        events: m.events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      }));

      onImport(importedData);
      toast({
        title: "Importação Excel concluída",
        description: `${importedData.length} matriz(es) importada(s) com sucesso.`,
      });
    } catch (error) {
      toast({
        title: "Erro na importação",
        description: "Não foi possível importar o arquivo Excel.",
        variant: "destructive",
      });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Importar / Exportar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={handleExportExcel}
          className="w-full"
          disabled={matrices.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar Excel (.xlsx)
        </Button>

        <Button
          onClick={handleImportClick}
          variant="outline"
          className="w-full"
        >
          <Upload className="mr-2 h-4 w-4" />
          Importar Excel (.xlsx)
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        <p className="text-xs text-muted-foreground mt-2">
          Exporte para Excel ou importe uma planilha no padrão exportado. Datas no Excel ficam no formato PT-BR (DD/MM/AAAA).
        </p>
      </CardContent>
    </Card>
  );
};
