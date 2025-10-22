import { Button } from "./ui/button";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { Matrix } from "@/types";
import { useToast } from "@/hooks/use-toast";

interface ExportReportButtonProps {
  matrices: Matrix[];
  className?: string;
}

export function ExportReportButton({ matrices, className = "" }: ExportReportButtonProps) {
  const { toast } = useToast();

  const exportToExcel = () => {
    try {
      // Filtra apenas as matrizes aprovadas
      const approvedMatrices = matrices.filter(matrix => 
        matrix.events.some(event => event.type === "Aprovado" && event.testStatus === "Aprovado")
      );

      if (approvedMatrices.length === 0) {
        toast({
          title: "Nenhuma ferramenta aprovada",
          description: "Não há ferramentas aprovadas para gerar o relatório.",
          variant: "destructive",
        });
        return;
      }

      // Prepara os dados para a planilha
      const data = approvedMatrices.map(matrix => {
        const approvalEvent = matrix.events.find(e => e.type === "Aprovado");
        const receptionEvent = matrix.events.find(e => e.type === "Recebimento");
        const testEvent = matrix.events.find(e => e.type === "Testes");

        return {
          "Código": matrix.code,
          "Data de Recebimento": receptionEvent?.date || "Não informado",
          "Data de Aprovação": approvalEvent?.date || "Não informado",
          "Responsável": approvalEvent?.responsible || matrix.responsible || "Não informado",
          "Status": approvalEvent?.testStatus || "Não informado",
          "Máquina": approvalEvent?.machine || "Não informado",
          "Pasta": matrix.folder || "Não informado",
          "Observações": approvalEvent?.observations || "Nenhuma observação",
          "Data do Teste": testEvent?.date || "Não testado",
          "Responsável pelo Teste": testEvent?.responsible || "Não informado"
        };
      });

      // Cria a planilha
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ferramentas Aprovadas");

      // Formatação automática das colunas
      const wscols = [
        { wch: 15 }, // Código
        { wch: 18 }, // Data de Recebimento
        { wch: 18 }, // Data de Aprovação
        { wch: 20 }, // Responsável
        { wch: 15 }, // Status
        { wch: 15 }, // Máquina
        { wch: 20 }, // Pasta
        { wch: 30 }, // Observações
        { wch: 15 }, // Data do Teste
        { wch: 25 }, // Responsável pelo Teste
      ];
      ws['!cols'] = wscols;

      // Gera o arquivo
      const date = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `relatorio_ferramentas_aprovadas_${date}.xlsx`);

      toast({
        title: "Relatório gerado",
        description: `O arquivo com ${approvedMatrices.length} ferramentas aprovadas foi baixado com sucesso.`,
      });
    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao gerar o relatório. Por favor, tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button 
      onClick={exportToExcel} 
      className={`flex items-center gap-2 ${className}`}
      variant="outline"
    >
      <Download className="w-4 h-4" />
      Exportar Relatório
    </Button>
  );
}
