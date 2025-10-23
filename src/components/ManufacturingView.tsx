import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createManufacturingRecord, listManufacturingRecords, ManufacturingRecord, approveManufacturingRequest, moveToSolicitation, approveMultipleRequests, updatePriority, addBusinessDays, getLeadTimeDisplay, updateManufacturingRecord } from "@/services/manufacturing";
import { Factory, X, Eye, Download, ChevronDown, ChevronUp, Trash2, CheckCircle2, Clock, AlertCircle, Mail, FileIcon, Upload, Search } from "lucide-react";
import * as XLSX from 'xlsx';

interface FormData {
  matrixCode: string;
  manufacturingType: "nova" | "reposicao" | "";
  profileType: "tubular" | "solido" | "";
  packageSize: string;
  holeCount: string;
  supplier: string;
  customSupplier: string;
  priority: "low" | "medium" | "high" | "critical";
  replacedMatrix: string; // Matriz sendo substituída (só para reposição)
  images: string[];
  volumeProduced: string;
  technicalNotes: string;
  justification: string;
}

interface ManufacturingViewProps {
  onSuccess?: () => void;
  isAdmin?: boolean;
}

const PACKAGE_OPTIONS: Record<"tubular" | "solido", string[]> = {
  tubular: ["250x170", "300x170", "350x170", "400x170", "350x209", "400x209"],
  solido: ["250x170", "300x170", "350x170", "400x170", "350x209", "400x209", "228x130"],
};

export function ManufacturingView({ onSuccess, isAdmin = false }: ManufacturingViewProps) {
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [records, setRecords] = useState<ManufacturingRecord[]>([]);
  const [viewRecord, setViewRecord] = useState<ManufacturingRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<ManufacturingRecord | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ManufacturingRecord>>({});
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    matrixCode: "",
    manufacturingType: "",
    profileType: "",
    packageSize: "",
    holeCount: "",
    supplier: "",
    customSupplier: "",
    priority: "medium",
    replacedMatrix: "",
    images: [],
    volumeProduced: "",
    technicalNotes: "",
    justification: "",
  });

  // Estados de filtro
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"need" | "pending" | "approved">("need");
  
  // Seleção múltipla
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [selectedNeedRecords, setSelectedNeedRecords] = useState<string[]>([]);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [estimatedDate, setEstimatedDate] = useState("");
  const [searchMatrix, setSearchMatrix] = useState('');
  const [matrixStatus, setMatrixStatus] = useState<{
    status: 'need' | 'pending' | 'approved' | 'not_found' | '';
    message: string;
  }>({ status: '', message: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<ManufacturingRecord | null>(null);

  // refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Função para fazer upload de um arquivo para o Supabase Storage
  const uploadFile = async (file: File, recordId: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `manufacturing/${recordId}/${fileName}`;
    
    const { error: uploadError, data } = await supabase.storage
      .from('attachments')
      .upload(filePath, file);
    
    if (uploadError) {
      throw uploadError;
    }
    
    // Obter URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);
    
    return {
      id: uuidv4(),
      url: publicUrl,
      nome_arquivo: file.name,
      tipo_mime: file.type,
      tamanho: file.size,
      caminho: filePath
    };
  };

  // Manipular upload de arquivos
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !currentRecord) {
      return;
    }
    
    try {
      setIsUploading(true);
      const files = Array.from(event.target.files);
      const newAttachments = [];
      
      // Fazer upload de cada arquivo
      for (const file of files) {
        const attachment = await uploadFile(file, currentRecord.id);
        newAttachments.push(attachment);
      }
      
      // Atualizar o registro com os novos anexos
      const updatedAttachments = [...(currentRecord.anexos || []), ...newAttachments];
      
      const { error } = await supabase
        .from('manufacturing_records')
        .update({ anexos: updatedAttachments })
        .eq('id', currentRecord.id);
      
      if (error) throw error;
      
      // Atualizar o registro atual e a lista de registros
      const updatedRecord = { ...currentRecord, anexos: updatedAttachments };
      setCurrentRecord(updatedRecord);
      
      setRecords(prevRecords => 
        prevRecords.map(record => 
          record.id === updatedRecord.id ? updatedRecord : record
        )
      );
      
      toast.success('Anexos adicionados com sucesso!');
      
    } catch (error) {
      console.error('Erro ao fazer upload do arquivo:', error);
      toast.error('Erro ao adicionar anexos. Tente novamente.');
    } finally {
      setIsUploading(false);
      // Limpar o input de arquivo
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  // Excluir um anexo
  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!currentRecord) return;
    
    try {
      setIsUploading(true);
      const attachmentToDelete = currentRecord.anexos?.find(a => a.id === attachmentId);
      
      if (!attachmentToDelete) return;
      
      // Remover do storage
      const { error: deleteError } = await supabase.storage
        .from('attachments')
        .remove([attachmentToDelete.caminho]);
      
      if (deleteError) throw deleteError;
      
      // Atualizar o registro removendo o anexo
      const updatedAttachments = currentRecord.anexos?.filter(a => a.id !== attachmentId) || [];
      
      const { error } = await supabase
        .from('manufacturing_records')
        .update({ anexos: updatedAttachments })
        .eq('id', currentRecord.id);
      
      if (error) throw error;
      
      // Atualizar o registro atual e a lista de registros
      const updatedRecord = { ...currentRecord, anexos: updatedAttachments };
      setCurrentRecord(updatedRecord);
      
      setRecords(prevRecords => 
        prevRecords.map(record => 
          record.id === updatedRecord.id ? updatedRecord : record
        )
      );
      
      toast.success('Anexo removido com sucesso!');
      
    } catch (error) {
      console.error('Erro ao remover anexo:', error);
      toast.error('Erro ao remover anexo. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  // Buscar registros
  const loadRecords = useCallback(async () => {
    try {
      const data = await listManufacturingRecords();
      setRecords(data);
    } catch (err: any) {
      console.error("Erro ao carregar registros:", err);
    }
  }, []);

  // Carregar registros ao montar o componente
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const suppliers = ["FEP", "EXXO", "FELJ", "Outro"];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
  const months = [
    { value: "01", label: "Jan" }, { value: "02", label: "Fev" }, { value: "03", label: "Mar" },
    { value: "04", label: "Abr" }, { value: "05", label: "Mai" }, { value: "06", label: "Jun" },
    { value: "07", label: "Jul" }, { value: "08", label: "Ago" }, { value: "09", label: "Set" },
    { value: "10", label: "Out" }, { value: "11", label: "Nov" }, { value: "12", label: "Dez" },
  ];

  const availablePackages = useMemo(() => {
    if (formData.profileType === "tubular" || formData.profileType === "solido") {
      return PACKAGE_OPTIONS[formData.profileType];
    }
    return [];
  }, [formData.profileType]);

  useEffect(() => {
    loadRecords();
  }, []);

  // Verificar status da matriz
  const checkMatrixStatus = useCallback((matrixCode: string) => {
    if (!matrixCode) {
      setMatrixStatus({ status: '', message: '' });
      return;
    }

    const normalizedSearch = matrixCode.trim().toUpperCase();
    
    // Verificar em cada status
    const inNeed = records.some(r => 
      r.status === 'need' && r.matrix_code.toUpperCase().includes(normalizedSearch)
    );
    const inPending = records.some(r => 
      r.status === 'pending' && r.matrix_code.toUpperCase().includes(normalizedSearch)
    );
    const inApproved = records.some(r => 
      r.status === 'approved' && r.matrix_code.toUpperCase().includes(normalizedSearch)
    );

    if (inNeed) {
      setMatrixStatus({ 
        status: 'need', 
        message: 'Esta matriz está em NECESSIDADE' 
      });
    } else if (inPending) {
      setMatrixStatus({ 
        status: 'pending', 
        message: 'Esta matriz está em SOLICITAÇÃO' 
      });
    } else if (inApproved) {
      setMatrixStatus({ 
        status: 'approved', 
        message: 'Esta matriz está EM FABRICAÇÃO' 
      });
    } else {
      setMatrixStatus({ 
        status: 'not_found', 
        message: 'Matriz não encontrada em nenhum processo' 
      });
    }
  }, [records]);


  const handleExportToExcel = async () => {
    setLoading(true);
    try {
      const filtered = records.filter((record) => {
        const createdAt = new Date(record.created_at);
        const year = createdAt.getFullYear();
        const month = String(createdAt.getMonth() + 1).padStart(2, "0");
        const matchYear = !filterYear || filterYear === " " || filterYear === "" || String(year) === filterYear;
        const matchMonth = !filterMonth || filterMonth === " " || filterMonth === "" || month === filterMonth;
        const matchSupplier = !filterSupplier || filterSupplier === " " || filterSupplier === "" || record.supplier === filterSupplier || (record.supplier === "Outro" && record.custom_supplier === filterSupplier);
        const matchPriority = !filterPriority || filterPriority === " " || filterPriority === "" || record.priority === filterPriority;
        return matchYear && matchMonth && matchSupplier && matchPriority;
      });

      const headers = [
        "Código",
        "Tipo",
        "Perfil",
        "Pacote",
        "QTD Furos",
        "Prioridade",
        "Lead Time",
        "Fornecedor",
        "Registrado",
        "Entrega",
      ];

      const mapRecord = (record: ManufacturingRecord) => ({
        "Código": record.matrix_code,
        "Tipo": record.manufacturing_type === "nova" ? "Nova" : "Reposição",
        "Perfil": record.profile_type === "tubular" ? "Tubular" : "Sólido",
        "Pacote": record.package_size || "-",
        "QTD Furos": record.hole_count ?? "-",
        "Prioridade": record.priority === "critical" ? "Crítica" : record.priority === "high" ? "Alta" : record.priority === "medium" ? "Média" : "Baixa",
        "Lead Time": getLeadTimeDisplay(record),
        "Fornecedor": record.supplier === "Outro" ? record.custom_supplier : record.supplier,
        "Registrado": new Date(record.created_at).toLocaleDateString("pt-BR"),
        "Entrega": record.estimated_delivery_date ? new Date(record.estimated_delivery_date).toLocaleDateString("pt-BR") : "-",
      });

      const statusSections = [
        { key: "need" as const, label: "Necessidade" },
        { key: "pending" as const, label: "Solicitação" },
        { key: "approved" as const, label: "Em Fabricação" },
      ];

      const workbook = XLSX.utils.book_new();

      statusSections.forEach(({ key, label }) => {
        const rows = filtered.filter((record) => record.status === key).map(mapRecord);
        const worksheet = XLSX.utils.aoa_to_sheet([headers]);
        if (rows.length) {
          XLSX.utils.sheet_add_json(worksheet, rows, { origin: "A2", skipHeader: true });
        }
        XLSX.utils.book_append_sheet(workbook, worksheet, label);
      });

      XLSX.writeFile(workbook, `matrizes_confecao_${new Date().toISOString().split("T")[0]}.xlsx`);

      toast.success(`Exportado com sucesso: ${filtered.length} registro(s) exportado(s)`);
    } catch (err: any) {
      console.error("Erro ao exportar:", err);
      toast.error(`Erro ao exportar: ${String(err?.message || err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async (recordId: string, matrixCode: string) => {
    if (!confirm(`Tem certeza que deseja deletar o registro da matriz ${matrixCode}?`)) {
      return;
    }

    try {
      const { permanentlyDeleteManufacturingRecord } = await import("@/services/manufacturing");
      await permanentlyDeleteManufacturingRecord(recordId);
      await loadRecords();
      toast.success(`Registro deletado: O registro da matriz ${matrixCode} foi removido permanentemente`);
    } catch (err: any) {
      console.error("Erro ao deletar registro:", err);
      toast.error(`Erro ao deletar: ${String(err?.message || err)}`);
    }
  };

  const handleMoveToSolicitation = async (recordId: string, matrixCode: string) => {
    try {
      await moveToSolicitation(recordId);
      await loadRecords();
      toast.success(`Movido para Solicitação! A matriz ${matrixCode} entrou no processo interno`);
    } catch (err: any) {
      console.error("Erro ao mover:", err);
      toast.error(`Erro ao mover: ${String(err?.message || err)}`);
    }
  };

  const handleOpenApprovalDialog = (recordIds: string[]) => {
    setSelectedRecords(recordIds);
    // Calcular data padrão: 20 dias úteis a partir de hoje
    const defaultDate = addBusinessDays(new Date(), 20);
    setEstimatedDate(defaultDate.toISOString().split('T')[0]);
    setApprovalDialogOpen(true);
  };

  const handleConfirmApproval = async () => {
    try {
      if (selectedRecords.length === 0) return;
      
      if (selectedRecords.length === 1) {
        await approveManufacturingRequest(selectedRecords[0], estimatedDate);
      } else {
        await approveMultipleRequests(selectedRecords, estimatedDate);
      }
      
      await loadRecords();
      toast.success(`${selectedRecords.length} matriz(es) aprovada(s) para fabricação`);
      setApprovalDialogOpen(false);
      setSelectedRecords([]);
    } catch (err: any) {
      console.error("Erro ao aprovar:", err);
      toast.error(`Erro ao aprovar: ${String(err?.message || err)}`);
    }
  };

  const handleSendApprovalEmail = () => {
    if (selectedNeedRecords.length === 0) {
      toast.error("Selecione pelo menos uma matriz para enviar o e-mail");
      return;
    }

    const selectedMatrices = records.filter(r => selectedNeedRecords.includes(r.id));
    
    // Agrupar por fornecedor
    const groupedBySupplier = selectedMatrices.reduce((acc, matrix) => {
      const supplier = matrix.supplier === "Outro" ? matrix.custom_supplier : matrix.supplier;
      if (!acc[supplier]) acc[supplier] = [];
      acc[supplier].push(matrix);
      return acc;
    }, {} as Record<string, ManufacturingRecord[]>);

    // Gerar conteúdo do e-mail
    let emailBody = "Solicitação de Aprovação para Confecção de Matrizes\n\n";
    emailBody += "Prezados,\n\n";
    emailBody += "Solicitamos a aprovação para confecção das seguintes matrizes:\n\n";

    Object.entries(groupedBySupplier).forEach(([supplier, matrices]) => {
      emailBody += `FORNECEDOR: ${supplier}\n`;
      emailBody += "=".repeat(50) + "\n";
      
      matrices.forEach((matrix, index) => {
        const priorityText = matrix.priority === 'critical' ? 'Crítica' : 
                           matrix.priority === 'high' ? 'Alta' : 
                           matrix.priority === 'medium' ? 'Média' : 'Baixa';
        
        emailBody += `${index + 1}. ${matrix.matrix_code} | ${matrix.manufacturing_type === 'nova' ? 'Nova' : 'Reposição'} | ${matrix.profile_type === 'tubular' ? 'Tubular' : 'Sólido'} | ${matrix.package_size || 'N/A'} | ${matrix.hole_count || 'N/A'} furos | ${priorityText} | ${matrix.justification}`;
        
        if (matrix.technical_notes) {
          emailBody += ` | Obs: ${matrix.technical_notes}`;
        }
        
        emailBody += "\n";
      });
      emailBody += "\n";
    });

    emailBody += "Aguardamos sua aprovação para prosseguir com a confecção.\n\n";
    emailBody += "Atenciosamente,\n";
    emailBody += "Ferramentaria";

    // Criar link mailto
    const subject = `Solicitação de Aprovação - ${selectedMatrices.length} Matriz(es)`;
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    
    // Abrir cliente de e-mail
    window.open(mailtoLink);
    
    toast.success(`E-mail gerado para ${selectedMatrices.length} matriz(es) selecionada(s)`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`Arquivo muito grande: ${file.name} excede 5MB`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setFormData((prev) => ({
          ...prev,
          images: [...prev.images, base64],
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.matrixCode || !formData.manufacturingType || !formData.profileType ||
        !formData.packageSize || !formData.holeCount || !formData.supplier || !formData.justification) {
      toast.error("Formulário incompleto: Preencha todos os campos obrigatórios");
      return;
    }

    if (formData.supplier === "Outro" && !formData.customSupplier) {
      toast.error("Fornecedor não especificado: Informe o nome do fornecedor");
      return;
    }

    try {
      setLoading(true);
      await createManufacturingRecord({
        matrix_code: formData.matrixCode,
        manufacturing_type: formData.manufacturingType as "nova" | "reposicao",
        profile_type: formData.profileType as "tubular" | "solido",
        package_size: formData.packageSize || null,
        hole_count: formData.holeCount ? Number(formData.holeCount) : null,
        supplier: formData.supplier,
        custom_supplier: formData.customSupplier,
        priority: formData.priority,
        matrix_images: formData.images,
        problem_images: [],
        volume_produced: formData.volumeProduced ? Number(formData.volumeProduced) : null,
        technical_notes: formData.technicalNotes,
        justification: formData.justification,
      });
      
      setFormData({
        matrixCode: "",
        manufacturingType: "",
        profileType: "",
        packageSize: "",
        holeCount: "",
        supplier: "",
        customSupplier: "",
        priority: "medium",
        replacedMatrix: "",
        images: [],
        volumeProduced: "",
        technicalNotes: "",
        justification: "",
      });
      
      await loadRecords();
      toast.success("Confecção registrada! O pedido de confecção foi registrado. A matriz será criada quando recebida.");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Erro ao registrar confecção:", err);
      toast.error(`Erro ao registrar: ${String(err?.message || err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 overflow-y-auto p-3 bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Header Compacto */}
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded shadow">
            <Factory className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Registro de Confecção</h1>
          <div className="ml-auto" />
        </div>

        {/* Formulário em Grid Compacto */}
        <Card className="mb-3 border border-slate-200 shadow-sm">
        <CardHeader className="py-2 px-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setIsFormExpanded(!isFormExpanded)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-800">Novo Registro</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setIsFormExpanded(!isFormExpanded);
              }}
            >
              {isFormExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {isFormExpanded && <CardContent className="p-3">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Linha 1: identificação básica */}
            <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs font-semibold">Código <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="TMP-001/25"
                  value={formData.matrixCode}
                  onChange={(e) => setFormData({ ...formData, matrixCode: e.target.value.toUpperCase() })}
                  className="h-7 text-xs"
                  required
                />
              </div>
              {formData.manufacturingType === "reposicao" && (
                <div>
                  <Label className="text-xs font-semibold">Matriz Substituída <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Ex: TMP-001/24"
                    value={formData.replacedMatrix}
                    onChange={(e) => setFormData({ ...formData, replacedMatrix: e.target.value.toUpperCase() })}
                    className="h-7 text-xs"
                    required
                  />
                </div>
              )}
              <div>
                <Label className="text-xs font-semibold">Tipo <span className="text-red-500">*</span></Label>
                <Select value={formData.manufacturingType} onValueChange={(value) => setFormData({ ...formData, manufacturingType: value as "nova" | "reposicao" })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nova">Nova</SelectItem>
                    <SelectItem value="reposicao">Reposição</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Perfil <span className="text-red-500">*</span></Label>
                <Select value={formData.profileType} onValueChange={(value) => setFormData({
                  ...formData,
                  profileType: value as "tubular" | "solido",
                  packageSize: "",
                })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tubular">Tubular</SelectItem>
                    <SelectItem value="solido">Sólido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Pacote <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.packageSize}
                  onValueChange={(value) => setFormData({ ...formData, packageSize: value })}
                  disabled={!formData.profileType}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder={formData.profileType ? "Selecione" : "Escolha um perfil"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePackages.map((pkg) => (
                      <SelectItem key={pkg} value={pkg}>{pkg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 2: demais campos */}
            <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
              <div className={formData.manufacturingType === "reposicao" ? "lg:col-span-2" : ""}>
                <Label className="text-xs font-semibold">Fornecedor <span className="text-red-500">*</span></Label>
                <Select value={formData.supplier} onValueChange={(value) => setFormData({ ...formData, supplier: value, customSupplier: value !== "Outro" ? "" : formData.customSupplier })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Prioridade <span className="text-red-500">*</span></Label>
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value as "low" | "medium" | "high" | "critical" })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Volume Produzido</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={formData.volumeProduced}
                  onChange={(e) => setFormData({ ...formData, volumeProduced: e.target.value.replace(/[^0-9]/g, "") })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">QTD Furos <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={formData.holeCount}
                  onChange={(e) => setFormData({ ...formData, holeCount: e.target.value.replace(/[^0-9]/g, "") })}
                  className="h-7 text-xs"
                  required
                />
              </div>
              {formData.manufacturingType !== "reposicao" && <div />}
              {formData.manufacturingType !== "reposicao" && <div />}
            </div>

            {/* Segunda linha: Campos condicionais */}
            {formData.supplier === "Outro" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Nome do Fornecedor <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Nome do fornecedor"
                    value={formData.customSupplier}
                  onChange={(e) => setFormData({ ...formData, customSupplier: e.target.value.toUpperCase() })}
                    className="h-7 text-xs"
                    required
                  />
                </div>
              </div>
            )}

            {/* Linha 3: Observações e Justificativa */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">Observações Técnicas</Label>
                <Textarea
                  placeholder="Detalhes técnicos..."
                  value={formData.technicalNotes}
                  onChange={(e) => setFormData({ ...formData, technicalNotes: e.target.value.toUpperCase() })}
                  className="h-12 text-xs resize-none"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Justificativa <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Motivo da confecção..."
                  value={formData.justification}
                  onChange={(e) => setFormData({ ...formData, justification: e.target.value.toUpperCase() })}
                  className="h-12 text-xs resize-none"
                  required
                />
              </div>
            </div>

            {/* Linha 4: Upload de Imagens e Botões - Alinhados */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold whitespace-nowrap">Fotos:</Label>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => fileInputRef.current?.click()}>
                  Adicionar
                </Button>
                {formData.images.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{formData.images.length} arquivo(s)</Badge>
                )}
                {formData.images.length > 0 && (
                  <div className="flex gap-1">
                    {formData.images.slice(0, 3).map((img, i) => (
                      <div key={i} className="relative">
                        <img src={img} alt={`${i + 1}`} className="w-6 h-6 object-cover rounded border cursor-pointer" onClick={() => setPreviewImage(img)} />
                        <Button type="button" size="icon" variant="destructive" className="absolute -top-1 -right-1 h-3 w-3 p-0" onClick={() => removeImage(i)}>
                          <X className="h-1.5 w-1.5" />
                        </Button>
                      </div>
                    ))}
                    {formData.images.length > 3 && (
                      <div className="w-6 h-6 rounded border bg-slate-100 flex items-center justify-center text-[8px] font-bold cursor-pointer" onClick={() => setPreviewImage(formData.images[3])}>
                        +{formData.images.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Botões alinhados à direita */}
              <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (window.confirm("Limpar todos os campos?")) {
                    setFormData({
                      matrixCode: "",
                      manufacturingType: "",
                      profileType: "",
                      packageSize: "",
                      holeCount: "",
                      supplier: "",
                      customSupplier: "",
                      priority: "medium",
                      replacedMatrix: "",
                      images: [],
                      volumeProduced: "",
                      technicalNotes: "",
                      justification: "",
                    });
                  }
                }}
                disabled={loading}
              >
                Limpar
              </Button>
              <Button type="submit" size="sm" disabled={loading} className="min-w-[100px]">
                {loading ? "Registrando..." : "Registrar"}
              </Button>
              </div>
            </div>
          </form>
        </CardContent>}
      </Card>

      {/* Sistema de Abas - Solicitação e Em Fabricação */}
      <Card className="flex-1 border border-slate-200 shadow-sm">
        <CardHeader className="py-2 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-slate-800 whitespace-nowrap">Localizar Matriz</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Buscar matriz por código..."
                    className="pl-8 w-[200px]"
                    value={searchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchTerm(value);
                      checkMatrixStatus(value);
                    }}
                  />
                </div>
                {searchTerm && matrixStatus.message && (
                  <div className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-medium ${
                    matrixStatus.status === 'need' ? 'bg-amber-100 text-amber-800' :
                    matrixStatus.status === 'pending' ? 'bg-blue-100 text-blue-800' :
                    matrixStatus.status === 'approved' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {matrixStatus.message}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleExportToExcel} disabled={records.length === 0}>
                <Download className="h-3 w-3 mr-1" />
                Excel
              </Button>
              {/* Ano */}
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="h-6 text-xs w-24">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Todos</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Mês */}
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="h-6 text-xs w-24">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Todos</SelectItem>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="h-6 text-xs w-28">
                  <SelectValue placeholder="Fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Todos</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Prioridade */}
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-6 text-xs w-24">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Todas</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
              {(filterYear || filterMonth || filterSupplier || filterPriority) && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setFilterYear(""); setFilterMonth(""); setFilterSupplier(""); setFilterPriority(""); }}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "need" | "pending" | "approved")} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-2">
              <TabsTrigger value="need" className="text-xs flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Necessidade ({records.filter(r => r.status === 'need').length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Solicitação ({records.filter(r => r.status === 'pending').length})
              </TabsTrigger>
              <TabsTrigger value="approved" className="text-xs flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Em Fabricação ({records.filter(r => r.status === 'approved').length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="need" className="mt-0">
              <div className="space-y-2">
                {selectedNeedRecords.length > 0 && (
                  <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-md">
                    <span className="text-xs font-medium">{selectedNeedRecords.length} selecionada(s)</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setSelectedNeedRecords([])}
                      >
                        Limpar Seleção
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={handleSendApprovalEmail}
                      >
                        <Mail className="h-3 w-3 mr-1" />
                        Enviar E-mail de Aprovação
                      </Button>
                    </div>
                  </div>
                )}
                <div className="max-h-[400px] overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs bg-red-50">
                        <TableHead className="h-8 px-2 w-10">
                          <input
                            type="checkbox"
                            checked={selectedNeedRecords.length > 0 && selectedNeedRecords.length === records.filter(r => r.status === 'need').length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedNeedRecords(records.filter(r => r.status === 'need').map(r => r.id));
                              } else {
                                setSelectedNeedRecords([]);
                              }
                            }}
                            className="cursor-pointer"
                          />
                        </TableHead>
                        <TableHead className="h-8 px-2">Código</TableHead>
                        <TableHead className="h-8 px-2">Tipo</TableHead>
                        <TableHead className="h-8 px-2">Perfil</TableHead>
                        <TableHead className="h-8 px-2">Pacote</TableHead>
                        <TableHead className="h-8 px-2">QTD Furos</TableHead>
                        <TableHead className="h-8 px-2">Prioridade</TableHead>
                        <TableHead className="h-8 px-2">Lead Time</TableHead>
                        <TableHead className="h-8 px-2">Fornecedor</TableHead>
                        <TableHead className="h-8 px-2">Registrado</TableHead>
                        <TableHead className="h-8 px-2">Entrega</TableHead>
                        <TableHead className="h-8 px-2">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {records.filter(r => {
                      const y = new Date(r.created_at).getFullYear().toString();
                      const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
                      const matchYear = !filterYear || filterYear === " " || y === filterYear;
                      const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
                      const matchSupplier = !filterSupplier || filterSupplier === " " || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                      const matchPriority = !filterPriority || filterPriority === " " || r.priority === filterPriority;
                      const matchSearch = !searchTerm || 
                        r.matrix_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (r.replaced_matrix && r.replaced_matrix.toLowerCase().includes(searchTerm.toLowerCase()));
                      return r.status === 'need' && matchYear && matchMonth && matchSupplier && matchPriority && matchSearch;
                    }).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-6">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>Nenhuma necessidade identificada</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.filter(r => {
                        const y = new Date(r.created_at).getFullYear().toString();
                        const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
                        const matchYear = !filterYear || filterYear === " " || y === filterYear;
                        const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
                        const matchSupplier = !filterSupplier || filterSupplier === " " || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                        const matchPriority = !filterPriority || filterPriority === " " || r.priority === filterPriority;
                        const matchSearch = !searchTerm || 
                          r.matrix_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (r.replaced_matrix && r.replaced_matrix.toLowerCase().includes(searchTerm.toLowerCase()));
                        return r.status === 'need' && matchYear && matchMonth && matchSupplier && matchPriority && matchSearch;
                      }).map((record) => (
                        <TableRow key={record.id} className="text-xs hover:bg-red-50/50">
                          <TableCell className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={selectedNeedRecords.includes(record.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedNeedRecords([...selectedNeedRecords, record.id]);
                                } else {
                                  setSelectedNeedRecords(selectedNeedRecords.filter(id => id !== record.id));
                                }
                              }}
                              className="cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 font-mono">{record.matrix_code}</TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge variant={record.manufacturing_type === "nova" ? "default" : "secondary"} className="text-xs">
                              {record.manufacturing_type === "nova" ? "Nova" : "Reposição"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge variant="outline" className="text-xs">
                              {record.profile_type === "tubular" ? "Tubular" : "Sólido"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs">
                            {record.package_size || "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs text-center">
                            {record.hole_count ?? "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                record.priority === 'critical' ? 'bg-red-100 text-red-700 border-red-300' :
                                record.priority === 'high' ? 'bg-orange-100 text-orange-700 border-orange-300' :
                                record.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                                'bg-gray-100 text-gray-700 border-gray-300'
                              }`}
                            >
                              {record.priority === 'critical' ? 'Crítica' :
                               record.priority === 'high' ? 'Alta' :
                               record.priority === 'medium' ? 'Média' : 'Baixa'}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs">
                            {record.package_size || "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs text-center">
                            {record.hole_count ?? "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-center font-mono text-xs">
                            {getLeadTimeDisplay(record)}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {record.supplier === "Outro" ? record.custom_supplier : record.supplier}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {new Date(record.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {record.estimated_delivery_date ? new Date(record.estimated_delivery_date).toLocaleDateString('pt-BR') : '-'}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
onClick={() => {
                                  setViewRecord(record);
                                  setCurrentRecord(record);
                                }}
                                title="Visualizar detalhes"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            {isAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => {
                                  setEditingRecord(record);
                                  setEditDraft({ ...record });
                                }}
                                title="Editar registro"
                              >
                                <span className="font-bold text-xs">✎</span>
                              </Button>
                            )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => handleMoveToSolicitation(record.id, record.matrix_code)}
                                title="Mover para Solicitação"
                              >
                                <Clock className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteRecord(record.id, record.matrix_code)}
                                title="Deletar necessidade"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              </div>
            </TabsContent>

            <TabsContent value="pending" className="mt-0">
              <div className="space-y-2">
                {selectedRecords.length > 0 && (
                  <div className="flex items-center justify-between p-2 bg-amber-50 border border-amber-200 rounded-md">
                    <span className="text-xs font-medium">{selectedRecords.length} selecionada(s)</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setSelectedRecords([])}
                      >
                        Limpar Seleção
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => handleOpenApprovalDialog(selectedRecords)}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Aprovar Selecionadas
                      </Button>
                    </div>
                  </div>
                )}
                <div className="max-h-[400px] overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs bg-amber-50">
                        <TableHead className="h-8 px-2 w-10">
                          <input
                            type="checkbox"
                            checked={selectedRecords.length > 0 && selectedRecords.length === records.filter(r => r.status === 'pending').length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRecords(records.filter(r => r.status === 'pending').map(r => r.id));
                              } else {
                                setSelectedRecords([]);
                              }
                            }}
                            className="cursor-pointer"
                          />
                        </TableHead>
                        <TableHead className="h-8 px-2">Código</TableHead>
                        <TableHead className="h-8 px-2">Tipo</TableHead>
                        <TableHead className="h-8 px-2">Perfil</TableHead>
                        <TableHead className="h-8 px-2">Prioridade</TableHead>
                        <TableHead className="h-8 px-2">Pacote</TableHead>
                        <TableHead className="h-8 px-2">QTD Furos</TableHead>
                        <TableHead className="h-8 px-2">Lead Time</TableHead>
                        <TableHead className="h-8 px-2">Fornecedor</TableHead>
                        <TableHead className="h-8 px-2">Solicitado</TableHead>
                        <TableHead className="h-8 px-2">Entrega</TableHead>
                        <TableHead className="h-8 px-2">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {records.filter(r => {
                      const y = new Date(r.created_at).getFullYear().toString();
                      const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
                      const matchYear = !filterYear || filterYear === " " || y === filterYear;
                      const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
                      const matchSupplier = !filterSupplier || filterSupplier === " " || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                      const matchPriority = !filterPriority || filterPriority === " " || r.priority === filterPriority;
                      const matchSearch = !searchTerm || 
                        r.matrix_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (r.replaced_matrix && r.replaced_matrix.toLowerCase().includes(searchTerm.toLowerCase()));
                      return r.status === 'pending' && matchYear && matchMonth && matchSupplier && matchPriority && matchSearch;
                    }).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-6">
                          <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>Nenhuma solicitação pendente</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.filter(r => {
                        const y = new Date(r.created_at).getFullYear().toString();
                        const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
                        const matchYear = !filterYear || filterYear === " " || y === filterYear;
                        const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
                        const matchSupplier = !filterSupplier || filterSupplier === " " || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                        const matchPriority = !filterPriority || filterPriority === " " || r.priority === filterPriority;
                        const matchSearch = !searchTerm || 
                          r.matrix_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (r.replaced_matrix && r.replaced_matrix.toLowerCase().includes(searchTerm.toLowerCase()));
                        return r.status === 'pending' && matchYear && matchMonth && matchSupplier && matchPriority && matchSearch;
                      }).map((record) => (
                        <TableRow key={record.id} className="text-xs hover:bg-amber-50/50">
                          <TableCell className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={selectedRecords.includes(record.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRecords([...selectedRecords, record.id]);
                                } else {
                                  setSelectedRecords(selectedRecords.filter(id => id !== record.id));
                                }
                              }}
                              className="cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 font-mono">{record.matrix_code}</TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge variant={record.manufacturing_type === "nova" ? "default" : "secondary"} className="text-xs">
                              {record.manufacturing_type === "nova" ? "Nova" : "Reposição"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge variant="outline" className="text-xs">
                              {record.profile_type === "tubular" ? "Tubular" : "Sólido"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                record.priority === 'critical' ? 'bg-red-100 text-red-700 border-red-300' :
                                record.priority === 'high' ? 'bg-orange-100 text-orange-700 border-orange-300' :
                                record.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                                'bg-gray-100 text-gray-700 border-gray-300'
                              }`}
                            >
                              {record.priority === 'critical' ? 'Crítica' :
                               record.priority === 'high' ? 'Alta' :
                               record.priority === 'medium' ? 'Média' : 'Baixa'}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs">
                            {record.package_size || "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs text-center">
                            {record.hole_count ?? "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-center font-mono text-xs">
                            {getLeadTimeDisplay(record)}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {record.supplier === "Outro" ? record.custom_supplier : record.supplier}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {new Date(record.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {record.estimated_delivery_date ? new Date(record.estimated_delivery_date).toLocaleDateString('pt-BR') : '-'}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
onClick={() => {
                                  setViewRecord(record);
                                  setCurrentRecord(record);
                                }}
                                title="Visualizar detalhes"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            {isAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => { setEditingRecord(record); setEditDraft({ ...record }); }}
                                title="Editar solicitação"
                              >
                                <span className="font-bold text-xs">✎</span>
                              </Button>
                            )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteRecord(record.id, record.matrix_code)}
                                title="Deletar solicitação"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              </div>
            </TabsContent>

            <TabsContent value="approved" className="mt-0">
              <div className="max-h-[400px] overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs bg-green-50">
                      <TableHead className="h-8 px-2">Código</TableHead>
                      <TableHead className="h-8 px-2">Tipo</TableHead>
                        <TableHead className="h-8 px-2">Perfil</TableHead>
                        <TableHead className="h-8 px-2">Pacote</TableHead>
                        <TableHead className="h-8 px-2">QTD Furos</TableHead>
                        <TableHead className="h-8 px-2">Lead Time</TableHead>
                        <TableHead className="h-8 px-2">Fornecedor</TableHead>
                      <TableHead className="h-8 px-2">Aprovado</TableHead>
                      <TableHead className="h-8 px-2">Entrega</TableHead>
                      <TableHead className="h-8 px-2">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.filter(r => {
                      const y = new Date(r.created_at).getFullYear().toString();
                      const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
                      const matchYear = !filterYear || filterYear === " " || y === filterYear;
                      const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
                      const matchSupplier = !filterSupplier || filterSupplier === " " || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                      const matchSearch = !searchTerm || 
                        r.matrix_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (r.replaced_matrix && r.replaced_matrix.toLowerCase().includes(searchTerm.toLowerCase()));
                      return r.status === 'approved' && matchYear && matchMonth && matchSupplier && matchSearch;
                    }).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-6">
                          <Factory className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>Nenhuma matriz em fabricação</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.filter(r => {
                        const y = new Date(r.created_at).getFullYear().toString();
                        const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
                        const matchYear = !filterYear || filterYear === " " || y === filterYear;
                        const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
                        const matchSupplier = !filterSupplier || filterSupplier === " " || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                        const matchSearch = !searchTerm || 
                          r.matrix_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (r.replaced_matrix && r.replaced_matrix.toLowerCase().includes(searchTerm.toLowerCase()));
                        return r.status === 'approved' && matchYear && matchMonth && matchSupplier && matchSearch;
                      }).map((record) => (
                        <TableRow key={record.id} className="text-xs hover:bg-green-50/50">
                          <TableCell className="px-2 py-1 font-mono">{record.matrix_code}</TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge variant={record.manufacturing_type === "nova" ? "default" : "secondary"} className="text-xs">
                              {record.manufacturing_type === "nova" ? "Nova" : "Reposição"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge variant="outline" className="text-xs">
                              {record.profile_type === "tubular" ? "Tubular" : "Sólido"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs">
                            {record.package_size || "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs text-center">
                            {record.hole_count ?? "-"}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-center font-mono text-xs">
                            {getLeadTimeDisplay(record)}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {record.supplier === "Outro" ? record.custom_supplier : record.supplier}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {new Date(record.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {record.estimated_delivery_date ? new Date(record.estimated_delivery_date).toLocaleDateString('pt-BR') : '-'}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
onClick={() => {
                                  setViewRecord(record);
                                  setCurrentRecord(record);
                                }}
                                title="Visualizar detalhes"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            {isAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => { setEditingRecord(record); setEditDraft({ ...record }); }}
                                title="Editar fabricação"
                              >
                                <span className="font-bold text-xs">✎</span>
                              </Button>
                            )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteRecord(record.id, record.matrix_code)}
                                title="Deletar registro"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Diálogo de Visualização/Edição */}
      <Dialog open={!!viewRecord} onOpenChange={(o) => !o && setViewRecord(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Confecção - {viewRecord?.matrix_code}</DialogTitle>
          </DialogHeader>
          {viewRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="font-semibold">Status:</Label>
                  <div className="mt-1">
                    {viewRecord.status === 'need' ? (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Necessidade
                      </Badge>
                    ) : viewRecord.status === 'pending' ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                        <Clock className="h-3 w-3 mr-1" />
                        Em Solicitação
                      </Badge>
                    ) : viewRecord.status === 'approved' ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Em Fabricação
                      </Badge>
                    ) : (
                      <Badge variant="outline">Recebida</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="font-semibold">Prioridade:</Label>
                  <div className="mt-1">
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        viewRecord.priority === 'critical' ? 'bg-red-100 text-red-700 border-red-300' :
                        viewRecord.priority === 'high' ? 'bg-orange-100 text-orange-700 border-orange-300' :
                        viewRecord.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                        'bg-gray-100 text-gray-700 border-gray-300'
                      }`}
                    >
                      {viewRecord.priority === 'critical' ? 'Crítica' :
                       viewRecord.priority === 'high' ? 'Alta' :
                       viewRecord.priority === 'medium' ? 'Média' : 'Baixa'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="font-semibold">Tipo:</Label>
                  <p>{viewRecord.manufacturing_type === 'nova' ? 'Matriz Nova' : 'Reposição'}</p>
                </div>
                <div>
                  <Label className="font-semibold">Perfil:</Label>
                  <p>{viewRecord.profile_type === 'tubular' ? 'Tubular' : 'Sólido'}</p>
                </div>
                <div>
                  <Label className="font-semibold">Fornecedor:</Label>
                  <p>{viewRecord.supplier === 'Outro' ? viewRecord.custom_supplier : viewRecord.supplier}</p>
                </div>
                <div>
                  <Label className="font-semibold">Data Prevista de Entrega:</Label>
                  <p>{viewRecord.estimated_delivery_date ? new Date(viewRecord.estimated_delivery_date).toLocaleDateString('pt-BR') : 'Não definida'}</p>
                </div>
                {viewRecord.volume_produced && (
                  <div>
                    <Label className="font-semibold">Volume Produzido:</Label>
                    <p>{viewRecord.volume_produced.toLocaleString('pt-BR')} unidades</p>
                  </div>
                )}
                <div>
                  <Label className="font-semibold">Criado em:</Label>
                  <p>{new Date(viewRecord.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              
              {viewRecord.technical_notes && (
                <div>
                  <Label className="font-semibold">Observações Técnicas:</Label>
                  <p className="text-sm bg-slate-50 p-2 rounded border">{viewRecord.technical_notes}</p>
                </div>
              )}
              
              <div>
                <Label className="font-semibold">Justificativa:</Label>
                <p className="text-sm bg-slate-50 p-2 rounded border">{viewRecord.justification}</p>
              </div>

              {viewRecord.matrix_images && viewRecord.matrix_images.length > 0 && (
                <div>
                  <Label className="font-semibold">Imagens da Matriz ({viewRecord.matrix_images.length}):</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {viewRecord.matrix_images.map((img, i) => (
                      <img
                        key={`matrix-${i}`}
                        src={img}
                        alt={`Imagem da matriz ${i + 1}`}
                        className="w-full h-20 object-cover rounded border cursor-pointer hover:opacity-80"
                        onClick={() => setPreviewImage(img)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Seção de Anexos */}
              <div className="border-t pt-4 mt-4">
                <Label className="font-semibold text-base">Anexos</Label>
                <p className="text-sm text-muted-foreground mb-3">Adicione documentos ou imagens adicionais</p>
                
                {/* Lista de anexos existentes */}
                {viewRecord.anexos && viewRecord.anexos.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {viewRecord.anexos.map((anexo: any, i: number) => (
                      <div key={`anexo-${i}`} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center space-x-2">
                          <FileIcon className="h-5 w-5 text-gray-500" />
                          <span className="text-sm truncate max-w-xs">{anexo.nome_arquivo}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(anexo.tamanho / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <div className="flex space-x-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => window.open(anexo.url, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => handleDeleteAttachment(anexo.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 border-2 border-dashed rounded-lg mb-4">
                    <p className="text-sm text-muted-foreground">Nenhum anexo adicionado</p>
                  </div>
                )}
                
                {/* Botão para adicionar anexos */}
                <div className="flex justify-end">
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    multiple
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    type="button"
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Adicionar Anexos
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl">
          <div className="w-full h-full flex items-center justify-center">
            {previewImage && <img src={previewImage} className="max-h-[80vh] w-auto object-contain rounded" alt="Preview" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Aprovação com Data */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar para Fabricação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Você está aprovando <strong>{selectedRecords.length}</strong> matriz(es) para fabricação no fornecedor.
            </p>
            <div>
              <Label htmlFor="estimated-date" className="font-semibold">Data Prevista de Entrega</Label>
              <Input
                id="estimated-date"
                type="date"
                value={estimatedDate}
                onChange={(e) => setEstimatedDate(e.target.value)}
                className="mt-2"
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Data padrão: 20 dias úteis a partir de hoje
              </p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setApprovalDialogOpen(false);
                  setSelectedRecords([]);
                }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleConfirmApproval}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar Aprovação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Edição (apenas admin) */}
      {isAdmin && (
        <Dialog open={!!editingRecord} onOpenChange={(o) => !o && setEditingRecord(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Registro - {editingRecord?.matrix_code}</DialogTitle>
            </DialogHeader>
            {editingRecord && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
                  <div>
                    <Label className="font-semibold">Código</Label>
                    <Input value={(editDraft.matrix_code as string) || editingRecord.matrix_code}
                      onChange={(e) => setEditDraft({ ...editDraft, matrix_code: e.target.value.toUpperCase() })} className="h-7" />
                  </div>
                  <div>
                    <Label className="font-semibold">Tipo</Label>
                    <Select value={(editDraft.manufacturing_type as any) || editingRecord.manufacturing_type}
                      onValueChange={(v) => setEditDraft({ ...editDraft, manufacturing_type: v as any })}>
                      <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nova">Nova</SelectItem>
                        <SelectItem value="reposicao">Reposição</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="font-semibold">Perfil</Label>
                    <Select value={(editDraft.profile_type as any) || editingRecord.profile_type}
                      onValueChange={(v) => setEditDraft({ ...editDraft, profile_type: v as any })}>
                      <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tubular">Tubular</SelectItem>
                        <SelectItem value="solido">Sólido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="font-semibold">Pacote</Label>
                    <Input value={(editDraft.package_size as string) ?? editingRecord.package_size ?? ''}
                      onChange={(e) => setEditDraft({ ...editDraft, package_size: e.target.value })} className="h-7" />
                  </div>
                  <div>
                    <Label className="font-semibold">QTD Furos</Label>
                    <Input type="number" min={0} value={(editDraft.hole_count as number) ?? (editingRecord.hole_count ?? 0)}
                      onChange={(e) => setEditDraft({ ...editDraft, hole_count: Number(e.target.value || 0) })} className="h-7" />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
                  <div>
                    <Label className="font-semibold">Fornecedor</Label>
                    <Select value={(editDraft.supplier as any) || editingRecord.supplier}
                      onValueChange={(v) => setEditDraft({ ...editDraft, supplier: v as any })}>
                      <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="font-semibold">Fornecedor (Outro)</Label>
                    <Input value={(editDraft.custom_supplier as string) ?? (editingRecord.custom_supplier || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, custom_supplier: e.target.value.toUpperCase() })} className="h-7" />
                  </div>
                  <div>
                    <Label className="font-semibold">Prioridade</Label>
                    <Select value={(editDraft.priority as any) || (editingRecord.priority || 'medium')}
                      onValueChange={(v) => setEditDraft({ ...editDraft, priority: v as any })}>
                      <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="critical">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="font-semibold">Entrega Prevista</Label>
                    <Input type="date" value={(editDraft.estimated_delivery_date as string) ?? (editingRecord.estimated_delivery_date || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, estimated_delivery_date: e.target.value })} className="h-7" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="font-semibold">Observações Técnicas</Label>
                    <Textarea className="h-16" value={(editDraft.technical_notes as string) ?? (editingRecord.technical_notes || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, technical_notes: e.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <Label className="font-semibold">Justificativa</Label>
                    <Textarea className="h-16" value={(editDraft.justification as string) ?? (editingRecord.justification || '')}
                      onChange={(e) => setEditDraft({ ...editDraft, justification: e.target.value.toUpperCase() })} />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditingRecord(null)}>Cancelar</Button>
                  <Button className="bg-blue-600 hover:bg-blue-700" onClick={async () => {
                    try {
                      await updateManufacturingRecord(editingRecord.id, editDraft as any);
                      setEditingRecord(null);
                      setEditDraft({});
                      await loadRecords();
                      toast.success('Registro atualizado: Os dados foram corrigidos com sucesso.');
                    } catch (err: any) {
                      console.error(err);
                      toast.error(`Erro ao atualizar: ${String(err?.message || err)}`);
                    }
                  }}>Salvar</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
      </div>
    </div>
  );
}
