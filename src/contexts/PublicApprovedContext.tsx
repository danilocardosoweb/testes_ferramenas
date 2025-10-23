import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { listApprovedMatrices, getSuppliersList, ManufacturingRecord } from '@/services/manufacturing';
import { format, subMonths } from 'date-fns';

export interface Filters {
  searchTerm: string;
  startDate: string;
  endDate: string;
  supplier: string;
  priority: string;
}

interface PublicApprovedContextData {
  records: ManufacturingRecord[];
  suppliers: string[];
  filters: Filters;
  isLoading: boolean;
  isFilterOpen: boolean;
  setFilters: (filters: Partial<Filters>) => void;
  toggleFilter: () => void;
  applyFilters: () => Promise<void>;
  clearFilters: () => void;
  exportToExcel: () => void;
  getPriorityLabel: (priority: string) => string;
  getPriorityBadgeClass: (priority: string) => string;
  formatDate: (dateString: string) => string;
  formatFileSize: (bytes: number) => string;
}

const PublicApprovedContext = createContext<PublicApprovedContextData>({} as PublicApprovedContextData);

export const PublicApprovedProvider = ({ children }: { children: ReactNode }) => {
  const [records, setRecords] = useState<ManufacturingRecord[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const [filters, setFiltersState] = useState<Filters>({
    searchTerm: "",
    startDate: format(subMonths(new Date(), 1), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    supplier: "",
    priority: ""
  });

  // Carrega os dados iniciais
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [suppliersList] = await Promise.all([
          getSuppliersList(),
          loadApprovedMatrices()
        ]);
        setSuppliers(suppliersList);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Atualiza os filtros
  const setFilters = (newFilters: Partial<Filters>) => {
    setFiltersState(prev => ({
      ...prev,
      ...newFilters
    }));
  };

  // Carrega as matrizes aprovadas com base nos filtros
  const loadApprovedMatrices = async () => {
    try {
      setIsLoading(true);
      const filtersToApply: any = {};
      
      if (filters.searchTerm) filtersToApply.searchTerm = filters.searchTerm;
      if (filters.startDate) filtersToApply.startDate = filters.startDate;
      if (filters.endDate) filtersToApply.endDate = filters.endDate;
      if (filters.supplier) filtersToApply.supplier = filters.supplier;
      if (filters.priority) filtersToApply.priority = filters.priority;
      
      const approvedMatrices = await listApprovedMatrices(filtersToApply);
      setRecords(approvedMatrices);
    } catch (error) {
      console.error('Erro ao carregar matrizes aprovadas:', error);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Aplica os filtros
  const applyFilters = async () => {
    setIsFilterOpen(false);
    await loadApprovedMatrices();
  };

  // Limpa todos os filtros
  const clearFilters = () => {
    setFilters({
      searchTerm: "",
      startDate: format(subMonths(new Date(), 1), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      supplier: "",
      priority: ""
    });
  };

  // Alterna a visibilidade dos filtros
  const toggleFilter = () => {
    setIsFilterOpen(!isFilterOpen);
  };

  // Formata a data para exibição
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm");
    } catch (error) {
      return "Data inválida";
    }
  };

  // Formata o tamanho do arquivo
  const formatFileSize = (bytes: number) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Obtém o label da prioridade
  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'low': return 'Baixa';
      case 'medium': return 'Média';
      case 'high': return 'Alta';
      case 'critical': return 'Crítica';
      default: return priority;
    }
  };

  // Obtém as classes CSS para o badge de prioridade
  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Exporta para Excel
  const exportToExcel = () => {
    try {
      const dataToExport = records.map((record) => ({
        "Código": record.matrix_code,
        "Tipo de Confecção": record.manufacturing_type === 'nova' ? 'Nova' : 'Reposição',
        "Tipo de Perfil": record.profile_type === 'tubular' ? 'Tubular' : 'Sólido',
        "Tamanho do Pacote": record.package_size || "-",
        "Número de Furos": record.hole_count || "-",
        "Fornecedor": record.supplier || "-",
        "Fornecedor Personalizado": record.custom_supplier || "-",
        "Data de Aprovação": record.moved_to_approved_at ? formatDate(record.moved_to_approved_at) : "-",
        "Prioridade": getPriorityLabel(record.priority || ''),
        "Volume Produzido": record.volume_produced || "-",
        "Observações Técnicas": record.technical_notes || "-",
        "Justificativa": record.justification || "-",
        "Observações": record.observacoes || "-",
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Matrizes Aprovadas");
      
      // Ajusta a largura das colunas
      const colWidths = [
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
        { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 40 },
        { wch: 40 }
      ];
      ws['!cols'] = colWidths;
      
      XLSX.writeFile(wb, `matrizes_aprovadas_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`);
      
      toast.success("Exportação concluída com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar para Excel:", error);
      toast.error("Erro ao exportar para Excel");
    }
  };

  return (
    <PublicApprovedContext.Provider
      value={{
        records,
        suppliers,
        filters,
        isLoading,
        isFilterOpen,
        setFilters,
        toggleFilter,
        applyFilters,
        clearFilters,
        exportToExcel,
        getPriorityLabel,
        getPriorityBadgeClass,
        formatDate,
        formatFileSize
      }}
    >
      {children}
    </PublicApprovedContext.Provider>
  );
};

export const usePublicApproved = () => {
  const context = useContext(PublicApprovedContext);
  if (!context) {
    throw new Error('usePublicApproved deve ser usado dentro de um PublicApprovedProvider');
  }
  return context;
};
