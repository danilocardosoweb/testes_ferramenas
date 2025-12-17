import React from "react";
import { Matrix, MatrixEvent } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Eye, Download, Calendar as CalendarIcon, X, Filter as FilterIcon, Paperclip } from "lucide-react";
import { FinalReportDialog } from "./FinalReportDialog";
import * as XLSX from "xlsx";
import { useToast } from "@/components/ui/use-toast";
import { listAttachments } from "@/services/files";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from 'date-fns/locale';
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type Props = {
  matrices: Matrix[];
  onUpdateMatrix?: (matrix: Matrix) => void;
  onRefresh?: () => void;
  isAdmin?: boolean;
  onRestoreToApproval?: (matrixId: string) => Promise<void>;
};

// Extrai o primeiro evento de aprovação (mais antigo) com data do evento e de apontamento
function getApprovalInfo(events: MatrixEvent[]): { date: string; createdAt?: string } | null {
  const approval = [...events]
    .filter((e) => e.type.toLowerCase().includes("aprov"))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return approval ? { date: approval.date, createdAt: approval.createdAt } : null;
}

// Agrupa por Ano > Mês (com base na data de aprovação)
function groupByYearMonth(matrices: Matrix[]) {
  const groups: Record<string, Record<string, Matrix[]>> = {};
  matrices.forEach((m) => {
    const info = getApprovalInfo(m.events);
    const approvalDate = info?.date;
    if (!approvalDate) return;
    const d = new Date(approvalDate);
    const year = String(d.getFullYear());
    const month = String(d.getMonth() + 1).padStart(2, "0");
    if (!groups[year]) groups[year] = {};
    if (!groups[year][month]) groups[year][month] = [];
    groups[year][month].push(m);
  });
  return groups;
}

// Interface para os filtros
type ReportFilters = {
  startDate: Date | undefined;
  endDate: Date | undefined;
  matrixCode: string;
  filterType: 'period' | 'matrix' | 'all';
};

export const ApprovedToolsView: React.FC<Props> = ({ matrices, onUpdateMatrix, onRefresh, isAdmin = false, onRestoreToApproval }) => {
  // Garantindo que o componente retorne um elemento React
  if (!matrices) return <div>Carregando...</div>;
  
  const { toast } = useToast();
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<ReportFilters>({
    startDate: undefined,
    endDate: undefined,
    matrixCode: '',
    filterType: 'all'
  });
  
  // Filtra somente matrizes que possuem alguma aprovação
  const approved = React.useMemo(() => matrices.filter((m) => getApprovalInfo(m.events)), [matrices]);
  
  // Filtra as matrizes de acordo com os filtros selecionados
  const filteredMatrices = React.useMemo(() => {
    return approved.filter(matrix => {
      // Se o filtro for por código de matriz
      if (filters.filterType === 'matrix' && filters.matrixCode) {
        return matrix.code.toLowerCase().includes(filters.matrixCode.toLowerCase());
      }
      
      // Se o filtro for por período
      if (filters.filterType === 'period' && (filters.startDate || filters.endDate)) {
        const approvalInfo = getApprovalInfo(matrix.events);
        if (!approvalInfo) return false;
        
        const approvalDate = new Date(approvalInfo.date);
        
        if (filters.startDate && filters.endDate) {
          return approvalDate >= filters.startDate && approvalDate <= filters.endDate;
        } else if (filters.startDate) {
          return approvalDate >= filters.startDate;
        } else if (filters.endDate) {
          return approvalDate <= filters.endDate;
        }
      }
      
      // Se não houver filtro específico, retorna todas as aprovadas
      return true;
    });
  }, [approved, filters]);
  
  // Limpa os filtros
  const clearFilters = () => {
    setFilters({
      startDate: undefined,
      endDate: undefined,
      matrixCode: '',
      filterType: 'all'
    });
  };

  // Função para exportar para Excel com histórico completo
  const exportToExcel = () => {
    // Se não houver filtros aplicados, pede confirmação
    if (filters.filterType === 'all' && approved.length > 10) {
      if (!confirm(`Você está prestes a exportar ${approved.length} ferramentas. Deseja continuar?`)) {
        return;
      }
    }
    
    // Se não houver itens para exportar
    if (filteredMatrices.length === 0) {
      toast({
        title: "Nenhum dado para exportar",
        description: "Não há ferramentas que correspondam aos filtros selecionados.",
        variant: "destructive"
      });
      return;
    }
    
    // Fecha o modal de filtro
    setIsFilterOpen(false);
    
    // Chama a função de exportação com as matrizes filtradas
    generateExcelReport(filteredMatrices);
  };
  
  // Função para formatar a data corretamente, ajustando o fuso horário
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Ajusta para o fuso horário local
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - timezoneOffset);
    return localDate.toISOString().split('T')[0].split('-').reverse().join('/');
  };

  // Função que gera o relatório em Excel
  const generateExcelReport = (matricesToExport: Matrix[]) => {
    try {
      if (matricesToExport.length === 0) {
        toast({
          title: "Nenhuma ferramenta encontrada",
          description: "Não há ferramentas que correspondam aos critérios de filtro.",
          variant: "destructive"
        });
        return;
      }

      // Cria um novo workbook
      const wb = XLSX.utils.book_new();

      // Para cada ferramenta, cria uma aba com seu histórico completo
      matricesToExport.forEach((matrix, index) => {
        
        // Encontra a data de criação (primeiro evento)
        const creationDate = matrix.events.length > 0 
          ? formatDate(matrix.events[0].date)
          : "Data não disponível";
          
        // Cria os dados da aba principal (resumo)
        const summaryData = [
          ["Código da Ferramenta", matrix.code],
          ["Pasta", matrix.folder || "Não informado"],
          ["Responsável", matrix.responsible || "Não informado"],
          ["Data do Primeiro Evento", creationDate],
          ["", ""], // Linha em branco para separação
          ["Histórico de Eventos", ""]
        ];

        // Adiciona os eventos em ordem cronológica
        const sortedEvents = [...matrix.events].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Cabeçalhos da tabela de eventos
        summaryData.push([
          "Data", 
          "Tipo de Evento", 
          "Responsável", 
          "Máquina", 
          "Status", 
          "Observações"
        ]);

        // Adiciona cada evento como uma linha na tabela
        sortedEvents.forEach(event => {
          const eventDate = new Date(event.date);
          // Ajusta para o fuso horário local
          const timezoneOffset = eventDate.getTimezoneOffset() * 60000;
          const localDate = new Date(eventDate.getTime() - timezoneOffset);
          
          summaryData.push([
            localDate.toISOString().slice(0, 19).replace('T', ' '), // Formato: YYYY-MM-DD HH:MM:SS
            event.type,
            event.responsible || "-",
            event.machine || "-",
            event.testStatus || "-",
            event.observations || event.comment || "-"
          ]);
        });

        // Cria a planilha para esta ferramenta
        const ws = XLSX.utils.aoa_to_sheet(summaryData);
        
        // Ajusta a largura das colunas
        const wscols = [
          { wch: 20 }, // Data
          { wch: 25 }, // Tipo de Evento
          { wch: 25 }, // Responsável
          { wch: 15 }, // Máquina
          { wch: 15 }, // Status
          { wch: 50 }  // Observações
        ];
        ws['!cols'] = wscols;

        // Adiciona a planilha ao workbook
        XLSX.utils.book_append_sheet(wb, ws, `Ferramenta ${index + 1}`.substring(0, 31)); // Excel limita para 31 caracteres
      });

      // Cria uma planilha de resumo com todas as ferramentas
      const summarySheet = [
        ["Código", "Pasta", "Responsável", "Último Evento", "Data do Último Evento", "Status"]
      ];

      matricesToExport.forEach(matrix => {
        const lastEvent = [...matrix.events].sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];

        summarySheet.push([
          matrix.code,
          matrix.folder || "-",
          matrix.responsible || "-",
          lastEvent?.type || "-",
          lastEvent?.date ? formatDate(lastEvent.date) : "-",
          lastEvent?.testStatus || "-"
        ]);
      });

      const wsSummary = XLSX.utils.aoa_to_sheet(summarySheet);
      wsSummary['!cols'] = [
        { wch: 20 }, // Código
        { wch: 20 }, // Pasta
        { wch: 25 }, // Responsável
        { wch: 25 }, // Último Evento
        { wch: 20 }, // Data do Último Evento
        { wch: 15 }  // Status
      ];
      
      // Adiciona a planilha de resumo como primeira aba
      XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

      // Gera o arquivo
      const date = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `relatorio_ferramentas_aprovadas_${date}.xlsx`);
      
      toast({
        title: "Relatório gerado com sucesso",
        description: `O arquivo com ${matricesToExport.length} ferramentas foi baixado.`,
      });
    } catch (error) {
      console.error("Erro ao exportar para Excel:", error);
      toast({
        title: "Erro ao exportar",
        description: "Ocorreu um erro ao gerar o relatório. Por favor, tente novamente.",
        variant: "destructive"
      });
    }
  };

  // Estado dos filtros da visualização
  const [yearFilter, setYearFilter] = React.useState<string>("all");
  const [monthFilter, setMonthFilter] = React.useState<string>("all"); // "01".."12" ou "all"
  const [toolFilter, setToolFilter] = React.useState<string>("");
  const [expandedYears, setExpandedYears] = React.useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = React.useState<Record<string, boolean>>({});
  const [selectedTool, setSelectedTool] = React.useState<Matrix | null>(null);
  const [matrixAttachments, setMatrixAttachments] = React.useState<Record<string, boolean>>({});

  // Carregar informações de anexos para cada matriz
  React.useEffect(() => {
    const loadAttachments = async () => {
      const attachmentMap: Record<string, boolean> = {};
      for (const matrix of approved) {
        try {
          const attachments = await listAttachments(matrix.id);
          attachmentMap[matrix.id] = (attachments?.docsProjetos?.length ?? 0) > 0 || (attachments?.rip?.length ?? 0) > 0;
        } catch (err) {
          console.error(`Erro ao carregar anexos para ${matrix.id}:`, err);
          attachmentMap[matrix.id] = false;
        }
      }
      setMatrixAttachments(attachmentMap);
    };
    
    if (approved.length > 0) {
      loadAttachments();
    }
  }, [approved]);
  
  // Códigos únicos de matrizes para o dropdown
  const matrixCodes = React.useMemo(() => {
    const codes = new Set<string>();
    approved.forEach(m => codes.add(m.code));
    return Array.from(codes).sort();
  }, [approved]);
  
  // Usando o ícone de filtro importado

  const toggleYear = (year: string) => {
    setExpandedYears((prev) => ({ ...prev, [year]: !(prev[year] ?? true) }));
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  // Opções de ano e mês derivadas dos aprovados
  const yearOptions = React.useMemo(() => {
    const set = new Set<string>();
    approved.forEach((m) => {
      const d = getApprovalInfo(m.events)?.date;
      if (!d) return;
      set.add(String(new Date(d).getFullYear()));
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [approved]);

  const monthOptions = React.useMemo(() => {
    const set = new Set<string>();
    approved.forEach((m) => {
      const d = getApprovalInfo(m.events)?.date;
      if (!d) return;
      const dt = new Date(d);
      const y = String(dt.getFullYear());
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      if (yearFilter === "all" || yearFilter === y) set.add(mm);
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [approved, yearFilter]);

  // Aplicar filtros
  const filtered = React.useMemo(() => {
    const term = toolFilter.trim().toLowerCase();
    return approved.filter((m) => {
      const d = getApprovalInfo(m.events)?.date;
      if (!d) return false;
      const dt = new Date(d);
      const y = String(dt.getFullYear());
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const matchYear = yearFilter === "all" ? true : y === yearFilter;
      const matchMonth = monthFilter === "all" ? true : mm === monthFilter;
      const matchTool = term ? m.code.toLowerCase().includes(term) : true;
      return matchYear && matchMonth && matchTool;
    });
  }, [approved, yearFilter, monthFilter, toolFilter]);

  const grouped = React.useMemo(() => groupByYearMonth(filtered), [filtered]);
  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  if (approved.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Nenhuma ferramenta aprovada encontrada.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho e botão de exportação */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Ferramentas Aprovadas</h2>
        <div className="flex items-center gap-2">
          <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <FilterIcon className="w-4 h-4" />
                Filtrar
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Filtrar Relatório</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Filtrar por:</Label>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="filterAll"
                        name="filterType"
                        checked={filters.filterType === 'all'}
                        onChange={() => setFilters({...filters, filterType: 'all'})}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="filterAll">Todas</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="filterPeriod"
                        name="filterType"
                        checked={filters.filterType === 'period'}
                        onChange={() => setFilters({...filters, filterType: 'period'})}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="filterPeriod">Período</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="filterMatrix"
                        name="filterType"
                        checked={filters.filterType === 'matrix'}
                        onChange={() => setFilters({...filters, filterType: 'matrix'})}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="filterMatrix">Matriz</Label>
                    </div>
                  </div>
                </div>

                {filters.filterType === 'period' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Data Inicial</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !filters.startDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {filters.startDate ? (
                                format(filters.startDate, "PPP", { locale: ptBR })
                              ) : (
                                <span>Selecione uma data</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={filters.startDate}
                              onSelect={(date) => setFilters({...filters, startDate: date || undefined})}
                              initialFocus
                              locale={ptBR}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endDate">Data Final</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !filters.endDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {filters.endDate ? (
                                format(filters.endDate, "PPP", { locale: ptBR })
                              ) : (
                                <span>Selecione uma data</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={filters.endDate}
                              onSelect={(date) => setFilters({...filters, endDate: date || undefined})}
                              initialFocus
                              locale={ptBR}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                )}

                {filters.filterType === 'matrix' && (
                  <div className="space-y-2">
                    <Label htmlFor="matrixCode">Código da Matriz</Label>
                    <Select
                      value={filters.matrixCode}
                      onValueChange={(value) => setFilters({...filters, matrixCode: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma matriz" />
                      </SelectTrigger>
                      <SelectContent>
                        {matrixCodes.map(code => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      clearFilters();
                      setIsFilterOpen(false);
                    }}
                  >
                    Limpar Filtros
                  </Button>
                  <Button onClick={exportToExcel}>
                    <Download className="w-4 h-4 mr-2" />
                    Gerar Relatório
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              // Exporta tudo sem filtros
              setFilters({
                startDate: undefined,
                endDate: undefined,
                matrixCode: '',
                filterType: 'all'
              });
              exportToExcel();
            }}
            className="flex items-center gap-1"
            title="Exportar todas as ferramentas"
          >
            <Download className="w-4 h-4" />
            Exportar Tudo
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="p-3 border rounded-lg bg-background space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="min-w-40">
            <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setMonthFilter("all"); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {monthOptions.map((mm) => {
                  const name = new Date(2000, Number(mm) - 1, 1).toLocaleString("pt-BR", { month: "long" });
                  return (
                    <SelectItem key={mm} value={mm}>{mm} - {name}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-56">
            <Input
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              placeholder="Filtrar por código da ferramenta"
            />
          </div>
        </div>
      </div>

      {years.map((year) => {
        const months = Object.keys(grouped[year]).sort((a, b) => Number(b) - Number(a));
        const isYearExpanded = expandedYears[year] ?? false;
        return (
          <div key={year} className="border rounded-lg">
            <button
              type="button"
              onClick={() => toggleYear(year)}
              className="w-full px-4 py-2 border-b bg-muted/50 font-semibold flex items-center gap-2 text-left"
            >
              {isYearExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Ano: {year}
            </button>
            {isYearExpanded && (
              <div className="p-3 space-y-4">
                {months.map((month) => {
                  const items = grouped[year][month]
                    .slice()
                    .sort((a, b) => {
                      const da = getApprovalInfo(a.events)!.date;
                      const db = getApprovalInfo(b.events)!.date;
                      return da.localeCompare(db);
                    });
                  const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString("pt-BR", { month: "long" });
                  const monthKey = `${year}-${month}`;
                  const isMonthExpanded = expandedMonths[monthKey] ?? false;
                  return (
                    <div key={monthKey} className="border rounded-md">
                      <button
                        type="button"
                        onClick={() => toggleMonth(monthKey)}
                        className="w-full px-3 py-2 border-b font-medium capitalize flex items-center justify-between"
                      >
                        <span>Mês: {month.padStart(2, "0")} - {monthName}</span>
                        {isMonthExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {isMonthExpanded && (
                        <ul className="divide-y">
                          {items.map((m) => {
                            const info = getApprovalInfo(m.events)!;
                            const formatted = new Date(info.date).toLocaleDateString("pt-BR");
                            const apontado = info.createdAt ? new Date(info.createdAt).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
                            return (
                              <li key={m.id} className="px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer group" onClick={() => setSelectedTool(m)}>
                                <div className="flex items-center gap-2">
                                  <span>{m.code}</span>
                                  <span className="text-muted-foreground text-sm">{formatted}</span>
                                  {apontado && <span className="text-muted-foreground text-xs">({apontado})</span>}
                                  {matrixAttachments[m.id] && (
                                    <div title="Tem anexos">
                                      <Paperclip className="h-4 w-4 text-blue-600" />
                                    </div>
                                  )}
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTool(m);
                                  }}
                                  title="Ver histórico"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Relatório Final com histórico e anexos */}
      <FinalReportDialog 
        open={!!selectedTool}
        onOpenChange={(open) => {
          if (!open) setSelectedTool(null);
        }}
        matrix={selectedTool}
        onRefresh={onRefresh}
        isAdmin={isAdmin}
        onRestoreToApproval={onRestoreToApproval}
      />
    </div>
  );
};
