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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createManufacturingRecord, listManufacturingRecords, ManufacturingRecord, approveManufacturingRequest, moveToSolicitation, approveMultipleRequests, updatePriority, addBusinessDays, getLeadTimeDisplay, updateManufacturingRecord, updateDeliveryDate, getDeliveryDateHistory, returnPendingToNeed } from "@/services/manufacturing";
import { Factory, X, Eye, Download, ChevronDown, ChevronUp, Trash2, CheckCircle2, Clock, AlertCircle, Mail, FileIcon, Upload, Search, Pencil, TriangleAlert, Calendar, History, RotateCcw } from "lucide-react";
// eslint-disable-next-line import/no-extraneous-dependencies
import * as XLSX from 'xlsx';

interface FormData {
  itemCategory: "matriz" | "acessorio" | "";
  matrixCode: string;
  accessoryCode: string;
  accessoryType: string;
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

interface FollowUpEntry {
  date: string;
  previous_date: string | null;
  new_date: string;
  changed_by: string;
  reason?: string | null;
}

interface SequenceInfo {
  seq: string;
  isActive: boolean;
  qteProd: number;
}

interface ToolSuggestion {
  code: string;
  sequences: SequenceInfo[];
  isActive: boolean;       // Se qualquer sequência está ativa
  status?: string;
  supplier?: string;       // Corretor/Fornecedor
  packageSize?: string;    // Medida Pacote (ex.: 250x170 ou 228x130)
  volumeProduced?: number; // Qte.Prod.
  holeCount?: number;      // Furos (quando disponível)
  diameter?: string;       // Diâmetro (texto)
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
    itemCategory: "",
    matrixCode: "",
    accessoryCode: "",
    accessoryType: "",
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
  const [showOnlyLateApproved, setShowOnlyLateApproved] = useState(false);
  
  // Seleção múltipla
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [selectedNeedRecords, setSelectedNeedRecords] = useState<string[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [isMovingToSolicitation, setIsMovingToSolicitation] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [estimatedDate, setEstimatedDate] = useState("");
  const [searchMatrix, setSearchMatrix] = useState('');
  const [matrixStatus, setMatrixStatus] = useState<{
    status: 'need' | 'pending' | 'approved' | 'not_found' | '';
    message: string;
  }>({ status: '', message: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<ManufacturingRecord | null>(null);
  const [renamingAttachmentId, setRenamingAttachmentId] = useState<string | null>(null);

  // Estados para autocomplete de ferramentas
  const [allTools, setAllTools] = useState<ToolSuggestion[]>([]);
  const [toolSuggestions, setToolSuggestions] = useState<ToolSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  // Controle de exibição de sequências inativas por código
  const [openInactive, setOpenInactive] = useState<Record<string, boolean>>({});

  const suppliers = useMemo(() => ["FEP", "EXXO", "FELJ", "Outro"], []);
  const months = useMemo(() => ([
    { value: "01", label: "Jan" },
    { value: "02", label: "Fev" },
    { value: "03", label: "Mar" },
    { value: "04", label: "Abr" },
    { value: "05", label: "Mai" },
    { value: "06", label: "Jun" },
    { value: "07", label: "Jul" },
    { value: "08", label: "Ago" },
    { value: "09", label: "Set" },
    { value: "10", label: "Out" },
    { value: "11", label: "Nov" },
    { value: "12", label: "Dez" }
  ]), []);
  const availablePackages = useMemo(() => {
    if (formData.profileType === "tubular" || formData.profileType === "solido") {
      return PACKAGE_OPTIONS[formData.profileType];
    }
    return [];
  }, [formData.profileType]);
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearSet = new Set<number>();
    records.forEach(record => {
      yearSet.add(new Date(record.created_at).getFullYear());
    });
    return Array.from(yearSet.size ? yearSet : new Set([currentYear])).sort((a, b) => b - a);
  }, [records]);
  const filteredNeedRecords = useMemo(() => {
    return records.filter((r) => {
      const y = new Date(r.created_at).getFullYear().toString();
      const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, "0");
      const matchYear = !filterYear || filterYear === " " || y === filterYear;
      const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
      const matchSupplier =
        !filterSupplier ||
        filterSupplier === " " ||
        r.supplier === filterSupplier ||
        (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
      const matchPriority = !filterPriority || filterPriority === " " || r.priority === filterPriority;
      const matchSearch =
        !searchTerm ||
        r.matrix_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.replaced_matrix && r.replaced_matrix.toLowerCase().includes(searchTerm.toLowerCase()));
      return r.status === "need" && matchYear && matchMonth && matchSupplier && matchPriority && matchSearch;
    });
  }, [records, filterYear, filterMonth, filterSupplier, filterPriority, searchTerm]);
  
  // Estados para o diálogo de atualização de data
  const [updateDateDialogOpen, setUpdateDateDialogOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [newDeliveryDate, setNewDeliveryDate] = useState<string>('');
  const [updateReason, setUpdateReason] = useState<string>('');
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<FollowUpEntry[]>([]);
  const [historyRecord, setHistoryRecord] = useState<ManufacturingRecord | null>(null);

  // refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Função para abrir o diálogo de atualização de data
  const handleOpenUpdateDateDialog = (record: ManufacturingRecord) => {
    setSelectedRecordId(record.id);
    setNewDeliveryDate(record.estimated_delivery_date || '');
    setUpdateReason('');
    setUpdateDateDialogOpen(true);
  };

  // Função para fechar o diálogo de atualização de data
  const handleCloseUpdateDateDialog = () => {
    setUpdateDateDialogOpen(false);
    setSelectedRecordId(null);
    setNewDeliveryDate('');
    setUpdateReason('');
  };

  const handleOpenHistoryDialog = useCallback(async (record: ManufacturingRecord) => {
    setHistoryRecord(record);
    setHistoryEntries([]);
    setHistoryDialogOpen(true);
    setHistoryLoading(true);
    try {
      const data = await getDeliveryDateHistory(record.id);
      const sorted = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistoryEntries(sorted);
    } catch (error) {
      console.error('Erro ao carregar histórico de follow-ups:', error);
      toast.error('Não foi possível carregar o histórico. Tente novamente.');
      setHistoryDialogOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    try {
      const data = await listManufacturingRecords();
      setRecords(data);
    } catch (error) {
      console.error("Erro ao carregar registros de confecção:", error);
      toast.error("Erro ao carregar registros. Tente novamente.");
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Carregar ferramentas para autocomplete
  const loadAllTools = useCallback(async () => {
    setLoadingTools(true);
    try {
      const pageSize = 1000;
      let from = 0;
      const allRows: any[] = [];
      
      while (true) {
        const to = from + pageSize - 1;
        const { data: page, error: pageErr } = await supabase
          .from("analysis_ferramentas")
          .select("ferramenta_code, ferramenta_seq, payload")
          .order("ferramenta_code", { ascending: true })
          .range(from, to);
        
        if (pageErr) {
          console.error("Erro ao carregar ferramentas:", pageErr);
          break;
        }
        if (!page || page.length === 0) break;
        allRows.push(...page);
        if (page.length < pageSize) break;
        from += page.length;
      }

      // Mapear para lista única de códigos com dados agregados
      const toolsMap = new Map<string, {
        code: string;
        sequences: Map<string, { isActive: boolean; qteProd: number }>; // seq -> {isActive, qteProd}
        isActive: boolean;
        status: string;
        supplier: string;
        packageSize: string;
        volumeProduced: number;
        holeCount?: number;
      }>();

      allRows.forEach((row: any) => {
        const code = (row.ferramenta_code ?? row.payload?.Matriz ?? row.payload?.Ferramenta ?? "").toString().trim().toUpperCase();
        if (!code) return;
        
        const seq = (row.ferramenta_seq ?? row.payload?.Seq ?? "").toString().trim();
        const isActive = (row.payload?.Ativa ?? "").toString().trim().toLowerCase() === "sim";
        const status = row.payload?.["Status da Ferram."] ?? row.payload?.Status ?? "";
        const supplier = row.payload?.Corretor ?? row.payload?.Fornecedor ?? row.payload?.Fabricante ?? "";
        const diametro = row.payload?.Diametro ?? row.payload?.["Diâmetro"] ?? "";
        const medidaPacote = row.payload?.["Medida Pacote"] ?? row.payload?.MedidaPacote ?? row.payload?.Pacote ?? "";
        const packageSize = diametro && medidaPacote ? `${diametro}x${medidaPacote}` : (medidaPacote || diametro || "");
        const qteProd = parseFloat(row.payload?.["Qte.Prod."] ?? row.payload?.["Qte Prod"] ?? "0") || 0;
        const holesRaw = row.payload?.Furos ?? row.payload?.["QTD Furos"] ?? row.payload?.["Qtd Furos"] ?? row.payload?.["Qte.Furos"] ?? null;
        const holes = holesRaw != null ? Number(String(holesRaw).replace(/[^0-9]/g, '')) : undefined;
        
        // Debug: logar primeiro registro para verificar campos
        if (code === "TSU-001" || code === "VZ-0006") {
          console.log(`[DEBUG] ${code} payload:`, {
            Corretor: row.payload?.Corretor,
            Fornecedor: row.payload?.Fornecedor,
            "Medida Pacote": row.payload?.["Medida Pacote"],
            Pacote: row.payload?.Pacote,
            Furos: row.payload?.Furos,
            Diametro: row.payload?.Diametro,
            allKeys: Object.keys(row.payload || {}),
          });
        }
        
        if (!toolsMap.has(code)) {
          const seqMap = new Map<string, { isActive: boolean; qteProd: number }>();
          if (seq) seqMap.set(seq, { isActive, qteProd });
          toolsMap.set(code, {
            code,
            sequences: seqMap,
            isActive,
            status,
            supplier,
            packageSize,
            volumeProduced: qteProd,
            holeCount: holes,
          });
        } else {
          const existing = toolsMap.get(code)!;
          // Armazenar sequência com seu status e produção
          if (seq) {
            const current = existing.sequences.get(seq);
            if (current) {
              // Se já existe, manter true se qualquer registro for ativo e somar produção
              existing.sequences.set(seq, {
                isActive: current.isActive || isActive,
                qteProd: current.qteProd + qteProd,
              });
            } else {
              existing.sequences.set(seq, { isActive, qteProd });
            }
          }
          // Priorizar dados de ferramentas ativas
          if (isActive && !existing.isActive) {
            existing.isActive = true;
            existing.status = status;
            existing.supplier = supplier || existing.supplier;
            existing.packageSize = packageSize || existing.packageSize;
          }
          // Somar volume produzido total
          existing.volumeProduced += qteProd;
          // Preencher dados vazios
          if (!existing.supplier && supplier) existing.supplier = supplier;
          if (!existing.packageSize && packageSize) existing.packageSize = packageSize;
          if (existing.holeCount == null && holes != null && Number.isFinite(holes)) existing.holeCount = holes;
        }
      });

      const tools: ToolSuggestion[] = Array.from(toolsMap.values())
        .map(t => {
          // Converter Map de sequências para array de SequenceInfo
          const seqArray: SequenceInfo[] = Array.from(t.sequences.entries())
            .map(([seq, data]) => ({ seq, isActive: data.isActive, qteProd: data.qteProd }))
            .sort((a, b) => {
              const numA = parseInt(a.seq, 10);
              const numB = parseInt(b.seq, 10);
              return isNaN(numA) || isNaN(numB) ? a.seq.localeCompare(b.seq) : numA - numB;
            });
          
          return {
            code: t.code,
            sequences: seqArray,
            isActive: t.isActive,
            status: t.status,
            supplier: t.supplier,
            packageSize: t.packageSize,
            volumeProduced: t.volumeProduced,
            holeCount: t.holeCount,
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code));

      setAllTools(tools);
      console.log(`Carregadas ${tools.length} ferramentas únicas para autocomplete`);
    } catch (err) {
      console.error("Erro ao carregar ferramentas para autocomplete:", err);
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    loadAllTools();
  }, [loadAllTools]);

  // Formatar código padrão: F-<BASE>/<SEQ3>
  const formatMatrixCode = useCallback((baseCode: string, seq: string | number | undefined) => {
    const base = String(baseCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const s = seq !== undefined && seq !== null && String(seq).trim() !== ''
      ? String(seq).padStart(3, '0')
      : '001';
    return `F-${base}/${s}`;
  }, []);

  // Filtrar sugestões conforme usuário digita
  const filterSuggestions = useCallback((searchText: string) => {
    if (!searchText || searchText.length < 2) {
      setToolSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const upper = searchText.toUpperCase();
    const filtered = allTools
      .filter(t => t.code.includes(upper))
      .slice(0, 10); // Limitar a 10 sugestões

    setToolSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  }, [allTools]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        codeInputRef.current &&
        !codeInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Função para atualizar a data de entrega
  const handleUpdateDeliveryDate = async () => {
    if (!selectedRecordId || !newDeliveryDate) return;
    
    setIsUpdatingDate(true);
    try {
      // Obter o ID do usuário atual (você pode precisar ajustar isso com sua lógica de autenticação)
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'sistema';
      
      // Atualizar a data de entrega
      await updateDeliveryDate(selectedRecordId, newDeliveryDate, userId, updateReason);

      await loadRecords();
      
      // Fechar o diálogo e exibir mensagem de sucesso
      setUpdateDateDialogOpen(false);
      toast.success('Data de entrega atualizada com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar data de entrega:', error);
      toast.error('Erro ao atualizar data de entrega. Tente novamente.');
    } finally {
      setIsUpdatingDate(false);
    }
  };

  const getCurrentDeliveryDate = useCallback((record: ManufacturingRecord): string | null => {
    const history = (record as any).follow_up_dates as FollowUpEntry[] | undefined;
    if (history && history.length > 0) {
      const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const last = sorted[sorted.length - 1];
      return last?.new_date || null;
    }
    return record.estimated_delivery_date || null;
  }, []);

  const formatDate = useCallback((dateString: string | null | undefined) => {
    if (!dateString) return '-';
    const [datePart] = dateString.split('T');
    const [year, month, day] = datePart.split('-');
    if (!year || !month || !day) return '-';
    return `${day}/${month}/${year}`;
  }, []);

  const getDeliveryDateClass = useCallback((deliveryDate: string | null | undefined) => {
    if (!deliveryDate) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const referenceDate = new Date(deliveryDate);
    referenceDate.setHours(0, 0, 0, 0);

    const diffTime = referenceDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'text-red-600 font-bold';
    if (diffDays <= 3) return 'text-amber-600 font-medium';
    return '';
  }, []);

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
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0 || !currentRecord) {
      return;
    }
    
    try {
      setIsUploading(true);
      const files = Array.from(input.files);
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
      input.value = '';
    }
  };

  const handleRenameAttachment = async (attachmentId: string, currentName: string) => {
    if (!currentRecord) return;
    const newName = window.prompt("Novo nome para o anexo", currentName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Nome inválido");
      return;
    }

    try {
      setRenamingAttachmentId(attachmentId);
      const updatedAttachments = (currentRecord.anexos || []).map((anexo: any) =>
        anexo.id === attachmentId ? { ...anexo, nome_arquivo: trimmed } : anexo
      );

      const { error } = await supabase
        .from('manufacturing_records')
        .update({ anexos: updatedAttachments })
        .eq('id', currentRecord.id);

      if (error) throw error;

      const updatedRecord = { ...currentRecord, anexos: updatedAttachments };
      setCurrentRecord(updatedRecord);
      setRecords(prevRecords =>
        prevRecords.map(record => (record.id === updatedRecord.id ? updatedRecord : record))
      );

      toast.success('Anexo renomeado com sucesso!');
    } catch (error) {
      console.error('Erro ao renomear anexo:', error);
      toast.error('Erro ao renomear anexo. Tente novamente.');
    } finally {
      setRenamingAttachmentId(null);
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
        "Justificativa",
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
        "Justificativa": record.justification || "-",
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

      // ========== NOVA ABA: Histórico de Produção (somente ferramentas em Necessidade) ==========
      const needRecords = filtered.filter((r) => r.status === "need");
      if (needRecords.length > 0) {
        const needCodes = needRecords.map((r) => r.matrix_code.toUpperCase().split("/")[0].trim());
        const uniqueCodes = [...new Set(needCodes)];

        // Buscar dados de produção dos últimos 24 meses
        const today = new Date();
        const date24mAgo = new Date(today);
        date24mAgo.setMonth(date24mAgo.getMonth() - 24);
        const date12mAgo = new Date(today);
        date12mAgo.setMonth(date12mAgo.getMonth() - 12);
        const date6mAgo = new Date(today);
        date6mAgo.setMonth(date6mAgo.getMonth() - 6);

        const toISO = (d: Date) => d.toISOString().split("T")[0];

        const fetchAll = async <T,>(
          queryFactory: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
          pageSize = 1000
        ): Promise<{ data: T[]; error: any }>
        => {
          const all: T[] = [];
          let from = 0;

          while (true) {
            const to = from + pageSize - 1;
            const { data, error } = await queryFactory(from, to);
            if (error) return { data: all, error };
            const chunk = data || [];
            all.push(...chunk);
            if (chunk.length < pageSize) break;
            from += pageSize;
          }

          return { data: all, error: null };
        };

        // Buscar dados de produção
        const { data: producaoData, error: prodError } = await fetchAll<any>((from, to) =>
          supabase
            .from("analysis_producao")
            .select("payload, produced_on")
            .gte("produced_on", toISO(date24mAgo))
            .range(from, to)
        );

        // Buscar dados de carteira (pedidos/clientes)
        const { data: carteiraData, error: cartError } = await fetchAll<any>((from, to) =>
          supabase
            .from("analysis_carteira_flat")
            .select("ferramenta, cliente, pedido_kg, data_implant")
            .range(from, to)
        );

        // Buscar dados de ferramentas (sequências e capacidade)
        const { data: ferramentasData, error: ferrError } = await fetchAll<any>((from, to) =>
          supabase
            .from("analysis_ferramentas")
            .select("payload")
            .range(from, to)
        );

        // Debug logs
        console.log("[EXPORT] Dados de Produção:", {
          count: producaoData?.length || 0,
          error: prodError?.message,
          sample: producaoData?.[0]
        });
        console.log("[EXPORT] Dados de Carteira:", {
          count: carteiraData?.length || 0,
          error: cartError?.message,
          sample: carteiraData?.[0]
        });
        console.log("[EXPORT] Dados de Ferramentas:", {
          count: ferramentasData?.length || 0,
          error: ferrError?.message,
          sample: ferramentasData?.[0]
        });
        console.log("[EXPORT] Códigos buscados (needRecords):", uniqueCodes);

        // Função para normalizar código para padrão da base (ex: "VZ-0006", "TEF-007")
        const normalizeCodeForIndex = (code: string): string => {
          let c = String(code || "").toUpperCase().trim();
          // Remove prefixo "F-" se existir
          if (c.startsWith("F-")) {
            c = c.substring(2);
          }
          // Remove sequência após a barra
          c = c.split("/")[0].trim();
          // Se não tem hífen entre letras e números, insere (ex: "TEF007" -> "TEF-007")
          if (c && !/[A-Z]+-\d/.test(c)) {
            c = c.replace(/^([A-Z]+)(\d+)$/, "$1-$2");
          }
          return c;
        };

        // Função para buscar código em um dicionário com múltiplas variações
        // Importante: NÃO usar match parcial por prefixo (ex: "TP") porque isso pode casar a ferramenta errada.
        const findCodeInDict = (searchCode: string, dict: Record<string, any>): any => {
          const normalized = normalizeCodeForIndex(searchCode);

          // Tenta 1: Código normalizado exato (padrão MRP, ex: "TP-0157")
          if (dict[normalized]) return dict[normalized];

          // Tenta 2: Sem hífen (compatibilidade, ex: "TP0157")
          const noHyphen = normalized.replace("-", "");
          if (noHyphen) {
            for (const key of Object.keys(dict)) {
              if (key.replace("-", "") === noHyphen) {
                return dict[key];
              }
            }
          }

          return null;
        };

        // Log de códigos brutos extraídos dos dados
        const codigosBrutosProducao = (producaoData || []).slice(0, 5).map((row: any) => ({
          raw: row.payload?.Matriz || row.payload?.Ferramenta || row.payload?.ferramenta,
          normalized: normalizeCodeForIndex(row.payload?.Matriz || row.payload?.Ferramenta || row.payload?.ferramenta || "")
        }));
        const codigosBrutosCarteira = (carteiraData || []).slice(0, 5).map((row: any) => ({
          raw: row.ferramenta,
          normalized: normalizeCodeForIndex(row.ferramenta || "")
        }));
        const codigosBrutosFerramentas = (ferramentasData || []).slice(0, 5).map((row: any) => ({
          raw: row.payload?.Matriz || row.payload?.matriz,
          normalized: normalizeCodeForIndex(row.payload?.Matriz || row.payload?.matriz || "")
        }));
        
        console.log("[EXPORT] Códigos brutos vs normalizados:", {
          producao: codigosBrutosProducao,
          carteira: codigosBrutosCarteira,
          ferramentas: codigosBrutosFerramentas
        });

        // Log de normalização
        console.log("[EXPORT] Códigos normalizados:", uniqueCodes.map(code => ({
          original: code,
          normalized: normalizeCodeForIndex(code)
        })));

        // Processar dados de produção por ferramenta
        type ProdByTool = {
          total24m: number;
          total12m: number;
          total6m: number;
          monthlyProd: Record<string, number>; // YYYY-MM -> kg
        };
        const prodByTool: Record<string, ProdByTool> = {};

        (producaoData || []).forEach((row: any) => {
          const payload = row.payload || {};
          const matrizRaw = payload.Matriz || payload.Ferramenta || payload.ferramenta || "";
          const matriz = normalizeCodeForIndex(matrizRaw);
          
          if (!matriz) return;

          const pesoRaw = payload["Peso Bruto"] || payload["Peso"] || payload["Produção"] || 0;
          const peso = typeof pesoRaw === "number" ? pesoRaw : parseFloat(String(pesoRaw).replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
          
          const prodDate = row.produced_on ? new Date(row.produced_on) : null;
          if (!prodDate || isNaN(prodDate.getTime())) return;

          if (!prodByTool[matriz]) {
            prodByTool[matriz] = { total24m: 0, total12m: 0, total6m: 0, monthlyProd: {} };
          }

          const monthKey = `${prodDate.getFullYear()}-${String(prodDate.getMonth() + 1).padStart(2, "0")}`;
          prodByTool[matriz].monthlyProd[monthKey] = (prodByTool[matriz].monthlyProd[monthKey] || 0) + peso;

          if (prodDate >= date24mAgo) prodByTool[matriz].total24m += peso;
          if (prodDate >= date12mAgo) prodByTool[matriz].total12m += peso;
          if (prodDate >= date6mAgo) prodByTool[matriz].total6m += peso;
        });

        console.log("[EXPORT] Produção agregada por ferramenta:", Object.keys(prodByTool).slice(0, 10));
        console.log("[EXPORT] Amostra de dados de produção:", {
          total: Object.keys(prodByTool).length,
          sample: Object.entries(prodByTool).slice(0, 3).map(([k, v]) => ({
            codigo: k,
            total12m: v.total12m,
            total6m: v.total6m
          }))
        });
        
        // Processar dados de carteira por ferramenta
        type CarteiraByTool = {
          totalPedido: number;
          lastOrderDate: string | null;
          clienteVolumes: Record<string, number>; // cliente -> kg total
          clienteDates: Record<string, string | null>; // cliente -> última data de implantação
          clienteLast: Record<string, { date: string | null; volume: number }>; // pedido mais recente do cliente
          seenKeys: Record<string, boolean>; // dedupe por (cliente,ferramenta,data_implant,pedido_kg)
        };
        const carteiraByTool: Record<string, CarteiraByTool> = {};

        (carteiraData || []).forEach((row: any) => {
          const ferrRaw = row.ferramenta || "";
          const ferr = normalizeCodeForIndex(ferrRaw);
          
          if (!ferr) return;

          const pedidoKg = typeof row.pedido_kg === "number" ? row.pedido_kg : parseFloat(String(row.pedido_kg || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
          const cliente = String(row.cliente || "").trim() || "N/D";
          const dataImpl = row.data_implant ? String(row.data_implant).slice(0, 10) : null;

          if (!carteiraByTool[ferr]) {
            carteiraByTool[ferr] = { totalPedido: 0, lastOrderDate: null, clienteVolumes: {}, clienteDates: {}, clienteLast: {}, seenKeys: {} };
          }

          // Deduplicação de linhas idênticas
          const dedupeKey = `${cliente}|${ferr}|${dataImpl || "NULL"}|${pedidoKg.toFixed(2)}`;
          if (!carteiraByTool[ferr].seenKeys[dedupeKey]) {
            carteiraByTool[ferr].seenKeys[dedupeKey] = true;
            carteiraByTool[ferr].totalPedido += pedidoKg;
            carteiraByTool[ferr].clienteVolumes[cliente] = (carteiraByTool[ferr].clienteVolumes[cliente] || 0) + pedidoKg;
          }

          if (dataImpl) {
            const currentDate = carteiraByTool[ferr].clienteDates[cliente];
            if (!currentDate || dataImpl > currentDate) {
              carteiraByTool[ferr].clienteDates[cliente] = dataImpl;
              carteiraByTool[ferr].clienteLast[cliente] = { date: dataImpl, volume: pedidoKg };
            }
            if (!carteiraByTool[ferr].lastOrderDate || dataImpl > carteiraByTool[ferr].lastOrderDate) {
              carteiraByTool[ferr].lastOrderDate = dataImpl;
            }
          }
        });

        console.log("[EXPORT] Carteira agregada por ferramenta:", Object.keys(carteiraByTool).slice(0, 10));
        console.log("[EXPORT] Amostra de dados de carteira:", {
          total: Object.keys(carteiraByTool).length,
          sample: Object.entries(carteiraByTool).slice(0, 3).map(([k, v]) => ({
            codigo: k,
            totalPedido: v.totalPedido,
            lastOrderDate: v.lastOrderDate,
            clientesUnicos: Object.keys(v.clienteVolumes).length
          }))
        });

        if (carteiraByTool["TLG-048"]) {
          console.log("[EXPORT] TLG-048 carteira:", carteiraByTool["TLG-048"]);
        }

        // Processar dados de ferramentas (sequências ativas e capacidade)
        type FerrByTool = {
          seqAtivas: number;
          seqTotal: number;
          produzidoTotal: number;
          capacidadeTotal: number;
        };
        const ferrByTool: Record<string, FerrByTool> = {};
        const CAP_POR_SEQ = 30000; // Capacidade padrão por sequência (kg)

        (ferramentasData || []).forEach((row: any) => {
          const payload = row.payload || {};
          const matrizRaw = payload.Matriz || payload.matriz || "";
          const matriz = normalizeCodeForIndex(matrizRaw);
          if (!matriz) return;

          const ativa = String(payload.Ativa || payload.ativa || "").toUpperCase();
          const isAtiva = ativa === "SIM" || ativa === "S" || ativa === "1" || ativa === "TRUE";
          const qteProd = parseFloat(String(payload["Qte.Prod."] || payload["Qte Prod"] || payload["QteProd"] || 0).replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

          if (!ferrByTool[matriz]) {
            ferrByTool[matriz] = { seqAtivas: 0, seqTotal: 0, produzidoTotal: 0, capacidadeTotal: 0 };
          }

          ferrByTool[matriz].seqTotal += 1;
          ferrByTool[matriz].produzidoTotal += qteProd;
          if (isAtiva) {
            ferrByTool[matriz].seqAtivas += 1;
          }

          // Capacidade total do relatório deve refletir o padrão do MRP por sequência cadastrada,
          // independente de estar marcada como ativa.
          ferrByTool[matriz].capacidadeTotal = ferrByTool[matriz].seqTotal * CAP_POR_SEQ;
        });

        console.log("[EXPORT] Ferramentas agregadas por ferramenta:", Object.keys(ferrByTool).slice(0, 10));
        console.log("[EXPORT] Amostra de dados de ferramentas:", {
          total: Object.keys(ferrByTool).length,
          sample: Object.entries(ferrByTool).slice(0, 3).map(([k, v]) => ({
            codigo: k,
            seqAtivas: v.seqAtivas,
            seqTotal: v.seqTotal,
            capacidadeTotal: v.capacidadeTotal
          }))
        });

        // Verificar match entre códigos buscados e dados encontrados
        const normalizedSearchCodes = uniqueCodes.map(normalizeCodeForIndex);
        const foundInProd = normalizedSearchCodes.filter(code => prodByTool[code]);
        const foundInCart = normalizedSearchCodes.filter(code => carteiraByTool[code]);
        const foundInFerr = normalizedSearchCodes.filter(code => ferrByTool[code]);
        
        console.log("[EXPORT] Match de códigos:", {
          buscados: normalizedSearchCodes,
          encontradosEmProd: foundInProd,
          encontradosEmCart: foundInCart,
          encontradosEmFerr: foundInFerr
        });


        // Montar dados da aba Histórico de Produção
        const histHeaders = [
          "Código",
          "Tipo",
          "Perfil",
          "Fornecedor",
          "Prioridade",
          "Seq. Ativas",
          "Seq. Total",
          "Produzido Total (kg)",
          "Capacidade Total (kg)",
          "Capacidade Restante (kg)",
          "% Desgaste",
          "Vol. Produzido 12m (kg)",
          "Média Mensal 6m (kg)",
          "Média Mensal 12m (kg)",
          "Média Mensal 24m (kg)",
          "Tendência",
          "Meses Cobertura",
          "Data EOL Estimada",
          "Total Pedidos Carteira (kg)",
          "Data Último Pedido",
          "Último Cliente 1",
          "Vol. Últ. 1 (kg)",
          "Data Últ. 1",
          "Último Cliente 2",
          "Vol. Últ. 2 (kg)",
          "Data Últ. 2",
          "Último Cliente 3",
          "Vol. Últ. 3 (kg)",
          "Data Últ. 3",
          "Principal Comprador",
          "Vol. Principal (kg)",
          "2º Comprador",
          "Vol. 2º (kg)",
          "3º Comprador",
          "Vol. 3º (kg)",
          "Justificativa",
        ];

        const histCategories = [
          "Identificação",
          "Identificação",
          "Identificação",
          "Identificação",
          "Prioridade",
          "Capacidade",
          "Capacidade",
          "Capacidade",
          "Capacidade",
          "Capacidade",
          "Desgaste",
          "Produção",
          "Produção",
          "Produção",
          "Produção",
          "Demanda",
          "Demanda",
          "Demanda",
          "Carteira",
          "Carteira",
          "Últimos Clientes",
          "Últimos Clientes",
          "Últimos Clientes",
          "Últimos Clientes",
          "Últimos Clientes",
          "Últimos Clientes",
          "Últimos Clientes",
          "Últimos Clientes",
          "Últimos Clientes",
          "Maiores Compradores",
          "Maiores Compradores",
          "Maiores Compradores",
          "Maiores Compradores",
          "Maiores Compradores",
          "Maiores Compradores",
          "Justificativa",
        ];

        // Função para converter código do formato do app (ex: "F-TP0157/016") para o padrão MRP do relatório (ex: "TP-0157")
        const formatCodeForExcel = (appCode: string): string => {
          return normalizeCodeForIndex(appCode);
        };

        const histRows = needRecords.map((record, idx) => {
          const codeBase = normalizeCodeForIndex(record.matrix_code);
          const codeExcel = formatCodeForExcel(record.matrix_code);
          
          // Buscar dados com fallback para múltiplas variações de código
          const prod = findCodeInDict(record.matrix_code, prodByTool) || { total24m: 0, total12m: 0, total6m: 0, monthlyProd: {} };
          const cart = findCodeInDict(record.matrix_code, carteiraByTool) || { totalPedido: 0, lastOrderDate: null, clienteVolumes: {} };
          const ferr = findCodeInDict(record.matrix_code, ferrByTool) || { seqAtivas: 0, seqTotal: 0, produzidoTotal: 0, capacidadeTotal: 0 };

          // Log para as primeiras 3 linhas
          if (idx < 3) {
            console.log(`[EXPORT] Linha ${idx + 1} - ${record.matrix_code}:`, {
              codeBase,
              prodFound: !!findCodeInDict(record.matrix_code, prodByTool),
              cartFound: !!findCodeInDict(record.matrix_code, carteiraByTool),
              ferrFound: !!findCodeInDict(record.matrix_code, ferrByTool),
              prod: prod.total12m,
              cart: cart.totalPedido,
              ferr: ferr.seqTotal
            });
          }

          // Calcular médias mensais
          const avg6m = prod.total6m / 6;
          const avg12m = prod.total12m / 12;
          const avg24m = prod.total24m / 24;

          // Calcular capacidade e desgaste
          const capRestante = Math.max(0, ferr.capacidadeTotal - ferr.produzidoTotal);
          const desgastePerc = ferr.capacidadeTotal > 0
            ? Math.min(100, (ferr.produzidoTotal / ferr.capacidadeTotal) * 100)
            : 0;

          // Calcular tendência (média 6m vs média 12m)
          let tendencia = "-";
          if (avg12m > 0 && avg6m > 0) {
            const ratio = avg6m / avg12m;
            if (ratio >= 1.15) tendencia = "↑ Crescendo";
            else if (ratio <= 0.85) tendencia = "↓ Caindo";
            else tendencia = "→ Estável";
          }

          // Calcular meses de cobertura e data EOL
          const demandaMensal = avg12m > 0 ? avg12m : avg6m;
          const mesesCobertura = demandaMensal > 0 ? capRestante / demandaMensal : null;
          let dataEOL = "-";
          if (mesesCobertura !== null && mesesCobertura > 0 && mesesCobertura < 120) {
            const eolDate = new Date();
            eolDate.setMonth(eolDate.getMonth() + Math.floor(mesesCobertura));
            dataEOL = `${String(eolDate.getDate()).padStart(2, "0")}/${String(eolDate.getMonth() + 1).padStart(2, "0")}/${eolDate.getFullYear()}`;
          }

          // Top 3 por volume (maiores)
          const topVolume = Object.entries(cart.clienteVolumes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          const top1 = topVolume[0] || ["-", 0];
          const top2 = topVolume[1] || ["-", 0];
          const top3 = topVolume[2] || ["-", 0];

          // Últimos 3 por data de implantação
          const lastEntries = Object.entries(cart.clienteLast || {}) as Array<[
            string,
            { date?: string | null; volume?: number }
          ]>;
          const lastClientes = lastEntries
            .map(([cliente, info]) => ({
              cliente,
              volume: info?.volume ?? 0,
              lastDate: info?.date || ""
            }))
            .filter(c => c.lastDate)
            .sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || ""))
            .slice(0, 3);
          const last1 = lastClientes[0] || { cliente: "-", volume: 0, lastDate: "" };
          const last2 = lastClientes[1] || { cliente: "-", volume: 0, lastDate: "" };
          const last3 = lastClientes[2] || { cliente: "-", volume: 0, lastDate: "" };

          const formatNum = (n: number) => Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
          const formatPerc = (n: number) => Number.isFinite(n) ? `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "-";
          const formatInt = (n: number) => n > 0 ? n.toString() : "-";
          const formatDate = (d: string | null) => {
            if (!d) return "-";
            const [y, m, day] = d.split("-");
            return `${day}/${m}/${y}`;
          };

          return {
            "Código": codeExcel,
            "Tipo": record.manufacturing_type === "nova" ? "Nova" : "Reposição",
            "Perfil": record.profile_type === "tubular" ? "Tubular" : "Sólido",
            "Fornecedor": record.supplier === "Outro" ? record.custom_supplier : record.supplier,
            "Prioridade": record.priority === "critical" ? "Crítica" : record.priority === "high" ? "Alta" : record.priority === "medium" ? "Média" : "Baixa",
            "Seq. Ativas": formatInt(ferr.seqAtivas),
            "Seq. Total": formatInt(ferr.seqTotal),
            "Produzido Total (kg)": formatNum(ferr.produzidoTotal),
            "Capacidade Total (kg)": formatNum(ferr.capacidadeTotal),
            "Capacidade Restante (kg)": formatNum(capRestante),
            "% Desgaste": formatPerc(desgastePerc),
            "Vol. Produzido 12m (kg)": formatNum(prod.total12m),
            "Média Mensal 6m (kg)": formatNum(avg6m),
            "Média Mensal 12m (kg)": formatNum(avg12m),
            "Média Mensal 24m (kg)": formatNum(avg24m),
            "Tendência": tendencia,
            "Meses Cobertura": mesesCobertura !== null && mesesCobertura > 0 ? formatNum(mesesCobertura) : "-",
            "Data EOL Estimada": dataEOL,
            "Total Pedidos Carteira (kg)": formatNum(cart.totalPedido),
            "Data Último Pedido": formatDate(cart.lastOrderDate),
            "Último Cliente 1": last1.cliente,
            "Vol. Últ. 1 (kg)": formatNum(last1.volume),
            "Data Últ. 1": formatDate(last1.lastDate || null),
            "Último Cliente 2": last2.cliente,
            "Vol. Últ. 2 (kg)": formatNum(last2.volume),
            "Data Últ. 2": formatDate(last2.lastDate || null),
            "Último Cliente 3": last3.cliente,
            "Vol. Últ. 3 (kg)": formatNum(last3.volume),
            "Data Últ. 3": formatDate(last3.lastDate || null),
            "Principal Comprador": top1[0],
            "Vol. Principal (kg)": formatNum(top1[1] as number),
            "2º Comprador": top2[0],
            "Vol. 2º (kg)": formatNum(top2[1] as number),
            "3º Comprador": top3[0],
            "Vol. 3º (kg)": formatNum(top3[1] as number),
            "Justificativa": record.justification || "-",
          };
        });

        const histWorksheet = XLSX.utils.aoa_to_sheet([histCategories, histHeaders]);
        if (histRows.length) {
          XLSX.utils.sheet_add_json(histWorksheet, histRows, { origin: "A3", skipHeader: true });
        }

        // Ajustar largura das colunas com destaque por seção
        const colWidths = [
          12, 10, 10, 14, 11, // identificação/prioridade
          10, 10, 16, 16, 18, 12, // capacidade
          18, 18, 18, 18, // produção
          12, 16, 16, // demanda
          18, 14, // carteira
          18, 14, 14, 18, 14, 14, 18, 14, 14, // últimos clientes
          18, 14, 18, 14, 18, 14, // maiores
          24 // justificativa
        ];
        histWorksheet["!cols"] = colWidths.map(w => ({ wch: w }));

        XLSX.utils.book_append_sheet(workbook, histWorksheet, "Histórico Produção");

        // ========== NOVA ABA: Resumo Executivo ==========
        const resumoData: any[][] = [
          ["RESUMO EXECUTIVO - FERRAMENTAS EM NECESSIDADE"],
          [""],
          ["Data do Relatório:", new Date().toLocaleDateString("pt-BR")],
          ["Total de Ferramentas:", needRecords.length],
          [""],
          ["DISTRIBUIÇÃO POR TIPO"],
          ["Novas:", needRecords.filter(r => r.manufacturing_type === "nova").length],
          ["Reposição:", needRecords.filter(r => r.manufacturing_type === "reposicao").length],
          [""],
          ["DISTRIBUIÇÃO POR PRIORIDADE"],
          ["Crítica:", needRecords.filter(r => r.priority === "critical").length],
          ["Alta:", needRecords.filter(r => r.priority === "high").length],
          ["Média:", needRecords.filter(r => r.priority === "medium").length],
          ["Baixa:", needRecords.filter(r => r.priority === "low").length],
          [""],
          ["DISTRIBUIÇÃO POR PERFIL"],
          ["Tubular:", needRecords.filter(r => r.profile_type === "tubular").length],
          ["Sólido:", needRecords.filter(r => r.profile_type === "solido").length],
          [""],
          ["DISTRIBUIÇÃO POR FORNECEDOR"],
        ];

        // Contar por fornecedor
        const fornecedorCount: Record<string, number> = {};
        needRecords.forEach(r => {
          const forn = r.supplier === "Outro" ? (r.custom_supplier || "Outro") : r.supplier;
          fornecedorCount[forn] = (fornecedorCount[forn] || 0) + 1;
        });
        Object.entries(fornecedorCount).sort((a, b) => b[1] - a[1]).forEach(([forn, count]) => {
          resumoData.push([`${forn}:`, count]);
        });

        resumoData.push([""], ["INDICADORES DE PRODUÇÃO"]);

        // Calcular totais de produção
        let totalProd12m = 0, totalProd6m = 0, totalCapRestante = 0;
        histRows.forEach((row: any) => {
          const p12 = parseFloat(String(row["Vol. Produzido 12m (kg)"] || "0").replace(/\./g, "").replace(",", ".")) || 0;
          const p6 = parseFloat(String(row["Média Mensal 6m (kg)"] || "0").replace(/\./g, "").replace(",", ".")) || 0;
          const cap = parseFloat(String(row["Capacidade Restante (kg)"] || "0").replace(/\./g, "").replace(",", ".")) || 0;
          totalProd12m += p12;
          totalProd6m += p6;
          totalCapRestante += cap;
        });

        resumoData.push(
          ["Volume Total Produzido 12m (kg):", totalProd12m.toLocaleString("pt-BR", { minimumFractionDigits: 2 })],
          ["Média Mensal Total 6m (kg):", totalProd6m.toLocaleString("pt-BR", { minimumFractionDigits: 2 })],
          ["Capacidade Restante Total (kg):", totalCapRestante.toLocaleString("pt-BR", { minimumFractionDigits: 2 })],
          [""],
          ["FERRAMENTAS COM MAIOR URGÊNCIA (Top 5 por desgaste)"],
        );

        // Top 5 por desgaste
        const topDesgaste = histRows
          .map((row: any) => ({
            codigo: row["Código"],
            desgaste: parseFloat(String(row["% Desgaste"] || "0").replace("%", "").replace(",", ".")) || 0,
          }))
          .filter(r => r.desgaste > 0)
          .sort((a, b) => b.desgaste - a.desgaste)
          .slice(0, 5);

        topDesgaste.forEach((item, i) => {
          resumoData.push([`${i + 1}. ${item.codigo}`, `${item.desgaste.toFixed(1)}%`]);
        });

        resumoData.push([""], ["FERRAMENTAS COM DEMANDA CRESCENTE"]);
        
        // Ferramentas com tendência crescente
        const crescentes = histRows.filter((row: any) => String(row["Tendência"] || "").includes("Crescendo"));
        if (crescentes.length > 0) {
          crescentes.slice(0, 5).forEach((row: any) => {
            resumoData.push([row["Código"], row["Média Mensal 6m (kg)"]]);
          });
        } else {
          resumoData.push(["Nenhuma ferramenta com demanda crescente identificada"]);
        }

        const resumoWorksheet = XLSX.utils.aoa_to_sheet(resumoData);
        resumoWorksheet["!cols"] = [{ wch: 45 }, { wch: 25 }];

        // Inserir aba de Resumo como primeira aba
        XLSX.utils.book_append_sheet(workbook, resumoWorksheet, "Resumo Executivo");

        // Reordenar abas para colocar Resumo primeiro
        const sheetNames = workbook.SheetNames;
        const resumoIdx = sheetNames.indexOf("Resumo Executivo");
        if (resumoIdx > 0) {
          sheetNames.splice(resumoIdx, 1);
          sheetNames.unshift("Resumo Executivo");
          workbook.SheetNames = sheetNames;
        }
      }

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

  const handleMoveSelectedToSolicitation = () => {
    if (selectedNeedRecords.length === 0) {
      toast.error("Selecione pelo menos uma matriz para enviar para Solicitação");
      return;
    }
    setMoveDialogOpen(true);
  };

  const handleConfirmMoveToSolicitation = async () => {
    if (selectedNeedRecords.length === 0) return;
    setIsMovingToSolicitation(true);
    try {
      await Promise.all(selectedNeedRecords.map(recordId => moveToSolicitation(recordId)));
      await loadRecords();
      toast.success(`${selectedNeedRecords.length} matriz(es) enviada(s) para Solicitação`);
      setSelectedNeedRecords([]);
      setMoveDialogOpen(false);
    } catch (err: any) {
      console.error("Erro ao mover para Solicitação:", err);
      toast.error(`Erro ao mover: ${String(err?.message || err)}`);
    } finally {
      setIsMovingToSolicitation(false);
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
      
      // Fechar o diálogo e exibir mensagem de sucesso
      setApprovalDialogOpen(false);
      toast.success(`${selectedRecords.length} matriz(es) aprovada(s) para fabricação`);
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

    const headerDate = new Date().toLocaleDateString('pt-BR');
    // Gerar conteúdo do e-mail
    let emailBody = "============================================\n";
    emailBody += "SOLICITAÇÃO DE APROVAÇÃO PARA CONFECÇÃO DE MATRIZES\n";
    emailBody += `Data: ${headerDate}\n`;
    emailBody += `Total de matrizes selecionadas: ${selectedMatrices.length}\n`;
    emailBody += "============================================\n\n";
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

  const checkMatrixStatus = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setMatrixStatus({ status: '', message: '' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('manufacturing_records')
        .select('status, matrix_code')
        .ilike('matrix_code', `${trimmed}%`) // busca prefixo para permitir códigos parciais
        .limit(1);

      if (error) throw error;

      if (!data || data.length === 0) {
        setMatrixStatus({ status: 'not_found', message: 'Matriz não encontrada na base' });
        return;
      }

      const record = data[0];
      const statusMessages: Record<string, string> = {
        need: 'Essa matriz já está registrada em "Necessidade".',
        pending: 'Essa matriz já está em "Solicitação".',
        approved: 'Essa matriz está "Em Fabricação".',
        received: 'Essa matriz já foi recebida.',
      };

      setMatrixStatus({
        status: (record.status as any) || '',
        message: statusMessages[record.status as keyof typeof statusMessages] || '',
      });
    } catch (error) {
      console.error('Erro ao verificar status da matriz:', error);
      setMatrixStatus({ status: '', message: '' });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isAccessory = formData.itemCategory === "acessorio";

    if (
      !formData.itemCategory ||
      !formData.matrixCode ||
      !formData.manufacturingType ||
      !formData.supplier ||
      !formData.justification ||
      (!isAccessory && (!formData.profileType || !formData.packageSize || !formData.holeCount))
    ) {
      toast.error("Formulário incompleto: Preencha todos os campos obrigatórios");
      return;
    }

    if (formData.itemCategory === "acessorio") {
      if (!formData.accessoryCode) {
        toast.error("Selecione o código do acessório (BO, BAT, PORTA BAT, CARCAÇA ou ESPINA)");
        return;
      }
      if (!formData.accessoryType) {
        toast.error("O tipo do acessório não foi definido. Escolha um código válido.");
        return;
      }
    }

    if (formData.supplier === "Outro" && !formData.customSupplier) {
      toast.error("Fornecedor não especificado: Informe o nome do fornecedor");
      return;
    }

    try {
      setLoading(true);

      // Validação de duplicidade de matriz (nova ou reposição) em processo ativo
      if (!isAccessory) {
        const matrixCode = formData.matrixCode.trim().toUpperCase();
        if (!matrixCode) {
          toast.error("Código da matriz não informado");
          setLoading(false);
          return;
        }

        const { data: existing, error: existingError } = await supabase
          .from('manufacturing_records')
          .select('status, matrix_code')
          .eq('matrix_code', matrixCode)
          .is('processed_at', null)
          .in('status', ['need', 'pending', 'approved']);

        if (existingError) {
          console.error('Erro ao verificar duplicidade de matriz:', existingError);
          toast.error('Não foi possível validar se a matriz já está no processo. Tente novamente.');
          setLoading(false);
          return;
        }

        if (existing && existing.length > 0) {
          const status = existing[0].status as 'need' | 'pending' | 'approved';
          const statusMessages: Record<'need' | 'pending' | 'approved', string> = {
            need: 'Necessidade',
            pending: 'Solicitação',
            approved: 'Em Fabricação',
          };

          toast.error(
            `Matriz já cadastrada: o código ${matrixCode} já está em "${statusMessages[status]}". Não é permitido criar outra necessidade para o mesmo código.`
          );
          setLoading(false);
          return;
        }
      }

      const profileTypeToSave = isAccessory ? "tubular" : (formData.profileType as "tubular" | "solido");
      const packageSizeToSave = isAccessory ? null : (formData.packageSize || null);
      const holeCountToSave = isAccessory ? null : (formData.holeCount ? Number(formData.holeCount) : null);
      const volumeToSave = isAccessory ? null : (formData.volumeProduced ? Number(formData.volumeProduced) : null);
      await createManufacturingRecord({
        matrix_code: formData.matrixCode,
        manufacturing_type: formData.manufacturingType as "nova" | "reposicao",
        profile_type: profileTypeToSave,
        package_size: packageSizeToSave,
        hole_count: holeCountToSave,
        item_category: formData.itemCategory as any,
        accessory_code: formData.itemCategory === "acessorio" ? formData.accessoryCode : null,
        accessory_type: formData.itemCategory === "acessorio" ? formData.accessoryType : null,
        supplier: formData.supplier,
        custom_supplier: formData.customSupplier,
        priority: formData.priority,
        matrix_images: formData.images,
        problem_images: [],
        volume_produced: volumeToSave,
        technical_notes: formData.technicalNotes,
        justification: formData.justification,
      });
      
      setFormData({
        itemCategory: "",
        matrixCode: "",
        accessoryCode: "",
        accessoryType: "",
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

  const handleReturnToNeed = async (recordId: string, matrixCode: string) => {
    const confirmed = window.confirm(`Deseja realmente devolver a matriz ${matrixCode} para Necessidade?`);
    if (!confirmed) return;

    try {
      await returnPendingToNeed(recordId);
      setSelectedRecords(prev => prev.filter(id => id !== recordId));
      await loadRecords();
      toast.success(`Matriz ${matrixCode} devolvida para Necessidade`);
    } catch (err: any) {
      console.error("Erro ao devolver para Necessidade:", err);
      toast.error(`Erro ao devolver: ${String(err?.message || err)}`);
    }
  };

  return (
    <>
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
                <Label className="text-xs font-semibold">Tipo de Item <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.itemCategory}
                  onValueChange={(value) => {
                    const itemCategory = value as "matriz" | "acessorio";
                    setFormData((prev) => ({
                      ...prev,
                      itemCategory,
                      accessoryCode: itemCategory === "acessorio" ? prev.accessoryCode : "",
                      accessoryType: itemCategory === "acessorio" ? prev.accessoryType : "",
                      profileType: itemCategory === "acessorio" ? "" : prev.profileType,
                      packageSize: itemCategory === "acessorio" ? "" : prev.packageSize,
                      holeCount: itemCategory === "acessorio" ? "" : prev.holeCount,
                      volumeProduced: itemCategory === "acessorio" ? "" : prev.volumeProduced,
                    }));
                  }}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="matriz">Matriz</SelectItem>
                    <SelectItem value="acessorio">Acessórios</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Código <span className="text-red-500">*</span></Label>
                {formData.itemCategory === "acessorio" ? (
                  <Select
                    value={formData.matrixCode}
                    onValueChange={(value) => {
                      const upper = value.toUpperCase();
                      const accessoryType = upper === "ESPINA" ? "Ferramenta Tubular" : "Acessórios para Extrusão";
                      setFormData((prev) => ({
                        ...prev,
                        matrixCode: upper,
                        accessoryCode: upper,
                        accessoryType,
                      }));
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BO">BO</SelectItem>
                      <SelectItem value="BAT">BAT</SelectItem>
                      <SelectItem value="PORTA BAT">PORTA BAT</SelectItem>
                      <SelectItem value="CARCAÇA">CARCAÇA</SelectItem>
                      <SelectItem value="ESPINA">ESPINA</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="relative">
                    <Input
                      ref={codeInputRef}
                      placeholder="Digite o código (ex: TR-0100)"
                      value={formData.matrixCode}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setFormData({
                          ...formData,
                          matrixCode: value,
                          accessoryCode: "",
                          accessoryType: "",
                        });
                        filterSuggestions(value);
                      }}
                      onFocus={() => {
                        if (formData.matrixCode.length >= 2) {
                          filterSuggestions(formData.matrixCode);
                        }
                      }}
                      className="h-7 text-xs"
                      required
                      autoComplete="off"
                    />
                    {showSuggestions && toolSuggestions.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        className="absolute z-50 w-80 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-y-auto"
                      >
                        {toolSuggestions.map((tool) => {
                          // Mapear fornecedor para opção do select
                          const mapSupplierToOption = (supplier: string | undefined | null): string => {
                            if (!supplier || typeof supplier !== "string") return "";
                            const upper = supplier.toUpperCase().trim();
                            if (upper === "FEP" || upper.includes("FEP")) return "FEP";
                            if (upper === "EXXO" || upper.includes("EXXO")) return "EXXO";
                            if (upper === "FELJ" || upper.includes("FELJ")) return "FELJ";
                            return "Outro";
                          };

                          // Mapear pacote para opção válida
                          const mapPackageToOption = (pkg: string | number | undefined): string => {
                            if (pkg === null || pkg === undefined || pkg === "") return "";
                            const pkgStr = String(pkg).trim();
                            if (!pkgStr) return "";
                            const allOptions = [...PACKAGE_OPTIONS.tubular, ...PACKAGE_OPTIONS.solido];
                            const normalized = pkgStr.replace(/\s/g, "").toLowerCase();
                            const found = allOptions.find(opt => opt.replace(/\s/g, "").toLowerCase() === normalized);
                            return found || "";
                          };

                          const mappedSupplier = mapSupplierToOption(tool.supplier);
                          const mappedPackage = mapPackageToOption(tool.packageSize);

                          return (
                            <div
                              key={tool.code}
                              className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer text-xs border-b border-gray-100 last:border-b-0"
                              onClick={() => {
                                // Se for MATRIZ, aplicar máscara F-<BASE>/<SEQ> usando a 1ª ativa
                                const firstActive = tool.sequences.find(s => s.isActive)?.seq;
                                const masked = formData.itemCategory === 'matriz'
                                  ? formatMatrixCode(tool.code, firstActive)
                                  : tool.code;
                                const activeCount = tool.sequences.filter(s => s.isActive).length;
                                setFormData({
                                  ...formData,
                                  matrixCode: masked,
                                  accessoryCode: "",
                                  accessoryType: "",
                                  supplier: mappedSupplier,
                                  customSupplier: mappedSupplier === "Outro" ? (tool.supplier || "") : "",
                                  packageSize: mappedPackage,
                                  volumeProduced: tool.volumeProduced ? Math.round(tool.volumeProduced).toString() : "",
                                  holeCount: tool.holeCount != null ? String(tool.holeCount) : formData.holeCount,
                                  technicalNotes: activeCount > 0 ? `Sequências ativas: ${activeCount}` : formData.technicalNotes,
                                });
                                setShowSuggestions(false);
                              }}
                            >
                              {/* Linha 1: Código + Badge */}
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-sm text-gray-800">{tool.code}</span>
                                <Badge
                                  variant={tool.isActive ? "default" : "secondary"}
                                  className={`text-[10px] px-2 py-0.5 ${tool.isActive ? "bg-green-500 hover:bg-green-600" : "bg-gray-400"}`}
                                >
                                  {tool.isActive ? "Ativa" : "Inativa"}
                                </Badge>
                              </div>
                              
                              {/* Linha 2: Sequências ATIVAS com produção */}
                              {(() => {
                                const activeSeqs = tool.sequences.filter(s => s.isActive);
                                const inactiveSeqs = tool.sequences.filter(s => !s.isActive);
                                const inactiveCount = inactiveSeqs.length;
                                
                                return activeSeqs.length > 0 ? (
                                  <div className="mb-2">
                                    <span className="text-[11px] font-medium text-gray-700">
                                      Sequências Ativas ({activeSeqs.length}):
                                    </span>
                                    <div className="flex flex-col gap-1 mt-1">
                                      {activeSeqs.slice(0, 6).map((seqInfo) => (
                                        <div
                                          key={seqInfo.seq}
                                          className="flex items-center justify-between bg-green-50 rounded px-2 py-1 border border-green-200 hover:bg-green-100 cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const masked = formData.itemCategory === 'matriz'
                                              ? formatMatrixCode(tool.code, seqInfo.seq)
                                              : tool.code;
                                            const activeCount = tool.sequences.filter(s => s.isActive).length;
                                            setFormData({
                                              ...formData,
                                              matrixCode: masked,
                                              accessoryCode: "",
                                              accessoryType: "",
                                              supplier: mappedSupplier,
                                              customSupplier: mappedSupplier === 'Outro' ? (tool.supplier || '') : '',
                                              packageSize: mappedPackage,
                                              volumeProduced: tool.volumeProduced ? Math.round(tool.volumeProduced).toString() : '',
                                              holeCount: tool.holeCount != null ? String(tool.holeCount) : formData.holeCount,
                                              technicalNotes: activeCount > 0 ? `Sequências ativas: ${activeCount}` : formData.technicalNotes,
                                            });
                                            setShowSuggestions(false);
                                          }}
                                        >
                                          <span className="text-[11px] font-semibold text-green-700">
                                            Seq {seqInfo.seq}
                                          </span>
                                          <span className="text-[10px] text-green-600">
                                            {seqInfo.qteProd > 0 
                                              ? `${seqInfo.qteProd.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`
                                              : "-"
                                            }
                                          </span>
                                        </div>
                                      ))}
                                      {activeSeqs.length > 6 && (
                                        <span className="text-[10px] text-green-600 pl-2">
                                          +{activeSeqs.length - 6} mais sequências ativas
                                        </span>
                                      )}
                                    </div>
                                    {inactiveCount > 0 && (
                                      <div className="mt-1">
                                        <button
                                          type="button"
                                          className="text-[10px] text-blue-600 hover:underline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenInactive((prev) => ({ ...prev, [tool.code]: !prev[tool.code] }));
                                          }}
                                        >
                                          {openInactive[tool.code] ? "Ocultar" : "Mostrar"} {inactiveCount} inativa{inactiveCount > 1 ? "s" : ""}
                                        </button>
                                        {openInactive[tool.code] && (
                                          <div className="flex flex-col gap-1 mt-1">
                                            {(() => {
                                              // Ordena numericamente e mantém apenas as 5 maiores sequências
                                              const sorted = [...inactiveSeqs].sort((a, b) => {
                                                const na = parseInt(a.seq, 10);
                                                const nb = parseInt(b.seq, 10);
                                                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                                                return a.seq.localeCompare(b.seq);
                                              });
                                              const start = Math.max(0, sorted.length - 5);
                                              const last5 = sorted.slice(start);
                                              return last5.map((seqInfo) => (
                                              <div
                                                key={`ina-${seqInfo.seq}`}
                                                className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 border border-gray-200 hover:bg-gray-100 cursor-pointer"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const masked = formData.itemCategory === 'matriz'
                                                    ? formatMatrixCode(tool.code, seqInfo.seq)
                                                    : tool.code;
                                                  const activeCount = tool.sequences.filter(s => s.isActive).length;
                                                  setFormData({
                                                    ...formData,
                                                    matrixCode: masked,
                                                    accessoryCode: "",
                                                    accessoryType: "",
                                                    supplier: mappedSupplier,
                                                    customSupplier: mappedSupplier === 'Outro' ? (tool.supplier || '') : '',
                                                    packageSize: mappedPackage,
                                                    volumeProduced: tool.volumeProduced ? Math.round(tool.volumeProduced).toString() : '',
                                                    holeCount: tool.holeCount != null ? String(tool.holeCount) : formData.holeCount,
                                                    technicalNotes: activeCount > 0 ? `Sequências ativas: ${activeCount}` : formData.technicalNotes,
                                                  });
                                                  setShowSuggestions(false);
                                                }}
                                              >
                                                <span className="text-[11px] font-semibold text-gray-700">Seq {seqInfo.seq}</span>
                                                <span className="text-[10px] text-gray-600">
                                                  {seqInfo.qteProd > 0 ? `${seqInfo.qteProd.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg` : '-'}
                                                </span>
                                              </div>
                                              ));
                                            })()}
                                            {inactiveSeqs.length > 5 && (
                                              <span className="text-[10px] text-gray-600 pl-2">+{inactiveSeqs.length - 5} mais sequências inativas</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : tool.sequences.length > 0 ? (
                                  <div className="mb-2">
                                    <span className="text-[11px] text-gray-500">
                                      {tool.sequences.length} sequência{tool.sequences.length > 1 ? "s" : ""} (todas inativas)
                                    </span>
                                  </div>
                                ) : null;
                              })()}
                              
                              {/* Linha 3: Dados que serão preenchidos */}
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mt-1 pt-1 border-t border-gray-100">
                                <div>
                                  <span className="text-gray-500">Fornecedor:</span>{" "}
                                  <span className="font-medium text-gray-700">{tool.supplier || "-"}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Pacote:</span>{" "}
                                  <span className="font-medium text-gray-700">{tool.packageSize || "-"}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {loadingTools && formData.matrixCode.length >= 2 && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                )}
              </div>
              {formData.itemCategory === "acessorio" && (
                <div>
                  <Label className="text-xs font-semibold">Tipo <span className="text-red-500">*</span></Label>
                  <Input
                    value={formData.accessoryType}
                    readOnly
                    placeholder="Definido pelo código"
                    className="h-7 text-xs bg-slate-50"
                  />
                </div>
              )}
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
                <Label className="text-xs font-semibold">Tipo Confecção <span className="text-red-500">*</span></Label>
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
                <Label className="text-xs font-semibold">
                  Perfil
                  {formData.itemCategory !== "acessorio" && (
                    <span className="text-red-500"> *</span>
                  )}
                </Label>
                <Select value={formData.profileType} onValueChange={(value) => setFormData({
                  ...formData,
                  profileType: value as "tubular" | "solido",
                  packageSize: "",
                })} disabled={formData.itemCategory === "acessorio"}>
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
                <Label className="text-xs font-semibold">
                  Pacote
                  {formData.itemCategory !== "acessorio" && (
                    <span className="text-red-500"> *</span>
                  )}
                </Label>
                <Select
                  value={formData.packageSize}
                  onValueChange={(value) => setFormData({ ...formData, packageSize: value })}
                  disabled={!formData.profileType || formData.itemCategory === "acessorio"}
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
                  disabled={formData.itemCategory === "acessorio"}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">
                  QTD Furos
                  {formData.itemCategory !== "acessorio" && (
                    <span className="text-red-500"> *</span>
                  )}
                </Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={formData.holeCount}
                  onChange={(e) => setFormData({ ...formData, holeCount: e.target.value.replace(/[^0-9]/g, "") })}
                  className="h-7 text-xs"
                  required={formData.itemCategory !== "acessorio"}
                  disabled={formData.itemCategory === "acessorio"}
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
                      itemCategory: "",
                      matrixCode: "",
                      accessoryCode: "",
                      accessoryType: "",
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
              <Button
                size="sm"
                variant={showOnlyLateApproved ? "destructive" : "outline"}
                className="h-6 px-2 text-xs flex items-center gap-1"
                onClick={() => setShowOnlyLateApproved((prev) => !prev)}
             >
                <TriangleAlert className="h-3 w-3" />
                {showOnlyLateApproved ? "Atrasados" : "Todos"}
              </Button>
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
                        onClick={handleMoveSelectedToSolicitation}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        Enviar para Solicitação
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
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
                            checked={selectedNeedRecords.length > 0 && selectedNeedRecords.length === filteredNeedRecords.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedNeedRecords(filteredNeedRecords.map(r => r.id));
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
                        <TableHead className="h-8 px-2 text-center">Registrado</TableHead>
                        <TableHead className="h-8 px-2 text-center">Entrega Prevista</TableHead>
                        <TableHead className="h-8 px-2">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {records.filter(r => {
                      const y = new Date(r.created_at).getFullYear().toString();
                      const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
                      const matchYear = !filterYear || filterYear === " " || y === filterYear;
                      const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
                      const matchSupplier =
                        !filterSupplier ||
                        filterSupplier === " " ||
                        r.supplier === filterSupplier ||
                        (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                      const matchPriority = !filterPriority || filterPriority === " " || r.priority === filterPriority;
                      const matchSearch =
                        !searchTerm ||
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
                        const matchSupplier =
                          !filterSupplier ||
                          filterSupplier === " " ||
                          r.supplier === filterSupplier ||
                          (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                        const matchPriority = !filterPriority || filterPriority === " " || r.priority === filterPriority;
                        const matchSearch =
                          !searchTerm ||
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
                          <TableCell className="px-2 py-1 text-center font-mono text-xs">
                            {getLeadTimeDisplay(record)}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            {record.supplier === "Outro" ? record.custom_supplier : record.supplier}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-center">
                            {formatDate(record.created_at)}
                          </TableCell>
                          <TableCell className={`px-2 py-1 text-center whitespace-nowrap ${getDeliveryDateClass(record.estimated_delivery_date)}`}>
                            {record.estimated_delivery_date ? formatDate(record.estimated_delivery_date) : '-'}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-center">
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
                        <TableHead className="h-8 px-2 text-center">Solicitado</TableHead>
                        <TableHead className="h-8 px-2 text-center">Entrega Prevista</TableHead>
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
                          <TableCell className="px-2 py-1 text-center">
                            {formatDate(record.created_at)}
                          </TableCell>
                          <TableCell className={`px-2 py-1 text-center whitespace-nowrap ${getDeliveryDateClass(record.estimated_delivery_date)}`}>
                            {record.estimated_delivery_date ? formatDate(record.estimated_delivery_date) : '-'}
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
                                className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => handleReturnToNeed(record.id, record.matrix_code)}
                                title="Devolver para Necessidade"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
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
                      <TableHead className="h-8 px-2 text-center">QTD Furos</TableHead>
                      <TableHead className="h-8 px-2 text-center">Lead Time</TableHead>
                      <TableHead className="h-8 px-2">Fornecedor</TableHead>
                      <TableHead className="h-8 px-2 text-center">Aprovado</TableHead>
                      <TableHead className="h-8 px-2 text-center">Original</TableHead>
                      <TableHead className="h-8 px-2 text-center">Entrega Atual</TableHead>
                      <TableHead className="h-8 px-2 text-center">Follow-ups</TableHead>
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

                      const baseMatch = r.status === 'approved' && matchYear && matchMonth && matchSupplier && matchSearch;
                      if (!baseMatch) return false;

                      if (!showOnlyLateApproved) return true;

                      const currentDelivery = getCurrentDeliveryDate(r);
                      if (!currentDelivery) return false;
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const deliveryDate = new Date(currentDelivery);
                      deliveryDate.setHours(0, 0, 0, 0);
                      return deliveryDate.getTime() < today.getTime();
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

                        const baseMatch = r.status === 'approved' && matchYear && matchMonth && matchSupplier && matchSearch;
                        if (!baseMatch) return false;

                        if (!showOnlyLateApproved) return true;

                        const currentDelivery = getCurrentDeliveryDate(r);
                        if (!currentDelivery) return false;
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const deliveryDate = new Date(currentDelivery);
                        deliveryDate.setHours(0, 0, 0, 0);
                        return deliveryDate.getTime() < today.getTime();
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
                          <TableCell className="px-2 py-1 text-center">
                            {formatDate(record.moved_to_approved_at || record.created_at)}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-center">
                            {formatDate(record.original_delivery_date)}
                          </TableCell>
                          <TableCell className={`px-2 py-1 text-center whitespace-nowrap ${getDeliveryDateClass(getCurrentDeliveryDate(record))}`}>
                            {formatDate(getCurrentDeliveryDate(record))}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-center">
                            <div className="inline-flex items-center gap-1">
                              <Badge variant="secondary" className="text-[11px] px-2 py-1">
                                {record.follow_up_count ?? 0}
                              </Badge>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                                onClick={() => handleOpenHistoryDialog(record)}
                                title="Ver histórico de follow-ups"
                              >
                                <History className="h-3 w-3" />
                              </Button>
                            </div>
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
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => {
                                  setSelectedRecordId(record.id);
                                  setNewDeliveryDate(record.estimated_delivery_date || '');
                                  setUpdateReason('');
                                  setUpdateDateDialogOpen(true);
                                }}
                                title="Atualizar data de entrega"
                              >
                                <Calendar className="h-3 w-3" />
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

      {/* Diálogo de Histórico de Follow-ups */}
      <Dialog open={historyDialogOpen} onOpenChange={(open) => {
        setHistoryDialogOpen(open);
        if (!open) {
          setHistoryEntries([]);
          setHistoryRecord(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de Follow-ups</DialogTitle>
            <DialogDescription>
              {historyRecord ? `Código ${historyRecord.matrix_code} • ${historyRecord.manufacturing_type === 'nova' ? 'Matriz Nova' : 'Reposição'}` : 'Selecione um registro para visualizar o histórico.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {historyLoading ? (
              <p className="text-center text-sm text-muted-foreground">Carregando histórico...</p>
            ) : historyEntries.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                <History className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
                Nenhuma alteração registrada até o momento.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto pr-1">
                <ul className="space-y-2">
                  {historyEntries.map((entry, index) => (
                    <li key={`${entry.date}-${index}`} className="border rounded-md p-3 bg-slate-50">
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>{new Date(entry.date).toLocaleString('pt-BR')}</span>
                        <span>ID usuário: {entry.changed_by}</span>
                      </div>
                      <div className="mt-1 text-sm">
                        <p><strong>Data anterior:</strong> {entry.previous_date ? new Date(entry.previous_date).toLocaleDateString('pt-BR') : '—'}</p>
                        <p><strong>Nova data:</strong> {entry.new_date ? new Date(entry.new_date).toLocaleDateString('pt-BR') : '—'}</p>
                        {entry.reason && (
                          <p className="mt-1"><strong>Motivo:</strong> {entry.reason}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                            disabled={renamingAttachmentId === anexo.id || isUploading}
                            onClick={() => window.open(anexo.url, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={renamingAttachmentId === anexo.id || isUploading}
                            onClick={() => handleRenameAttachment(anexo.id, anexo.nome_arquivo)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            disabled={renamingAttachmentId === anexo.id || isUploading}
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

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar para Solicitação</DialogTitle>
            <DialogDescription>
              Confirma o envio de {selectedNeedRecords.length} matriz(es) selecionada(s) para a etapa de Solicitação?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)} disabled={isMovingToSolicitation}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmMoveToSolicitation} disabled={isMovingToSolicitation}>
              {isMovingToSolicitation ? "Enviando..." : "Confirmar"}
            </Button>
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
          <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-hidden rounded-2xl p-0 shadow-xl flex flex-col">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle className="text-lg font-semibold text-slate-800">
                Editar Registro{editingRecord?.matrix_code ? ` • ${editingRecord.matrix_code}` : ""}
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                Ajuste os dados principais da confecção mantendo o padrão de cadastro original.
              </DialogDescription>
            </DialogHeader>

            {editingRecord && (
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">Código</Label>
                        <Input
                          className="mt-1 h-10"
                          value={(editDraft.matrix_code as string) || editingRecord.matrix_code}
                          onChange={(e) => setEditDraft({ ...editDraft, matrix_code: e.target.value.toUpperCase() })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">Tipo</Label>
                        <Select
                          value={(editDraft.manufacturing_type as any) || editingRecord.manufacturing_type}
                          onValueChange={(v) => setEditDraft({ ...editDraft, manufacturing_type: v as any })}
                        >
                          <SelectTrigger className="mt-1 h-10">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nova">Nova</SelectItem>
                            <SelectItem value="reposicao">Reposição</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">Perfil</Label>
                        <Select
                          value={(editDraft.profile_type as any) || editingRecord.profile_type}
                          onValueChange={(v) => setEditDraft({ ...editDraft, profile_type: v as any })}
                        >
                          <SelectTrigger className="mt-1 h-10">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tubular">Tubular</SelectItem>
                            <SelectItem value="solido">Sólido</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">Pacote</Label>
                        <Input
                          className="mt-1 h-10"
                          value={(editDraft.package_size as string) ?? editingRecord.package_size ?? ""}
                          onChange={(e) => setEditDraft({ ...editDraft, package_size: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">QTD Furos</Label>
                        <Input
                          className="mt-1 h-10"
                          type="number"
                          min={0}
                          value={(editDraft.hole_count as number) ?? (editingRecord.hole_count ?? 0)}
                          onChange={(e) => setEditDraft({ ...editDraft, hole_count: Number(e.target.value || 0) })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">Fornecedor</Label>
                        <Select
                          value={(editDraft.supplier as any) || editingRecord.supplier}
                          onValueChange={(v) => setEditDraft({ ...editDraft, supplier: v as any })}
                        >
                          <SelectTrigger className="mt-1 h-10">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {suppliers.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">Prioridade</Label>
                        <Select
                          value={(editDraft.priority as any) || (editingRecord.priority || "medium")}
                          onValueChange={(v) => setEditDraft({ ...editDraft, priority: v as any })}
                        >
                          <SelectTrigger className="mt-1 h-10">
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
                        <Label className="text-xs font-semibold text-slate-600">Entrega Prevista</Label>
                        <Input
                          className="mt-1 h-10"
                          type="date"
                          value={(editDraft.estimated_delivery_date as string) ?? (editingRecord.estimated_delivery_date || "")}
                          onChange={(e) => setEditDraft({ ...editDraft, estimated_delivery_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">Volume Produzido</Label>
                        <Input
                          className="mt-1 h-10"
                          type="number"
                          min={0}
                          value={(editDraft as any).volume_produced !== undefined
                            ? String((editDraft as any).volume_produced ?? "")
                            : String(editingRecord.volume_produced ?? "")}
                          onChange={(e) => setEditDraft({ ...editDraft, volume_produced: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs font-semibold text-slate-600">Observações Técnicas</Label>
                          {((editDraft.technical_notes as string) ?? editingRecord.technical_notes)?.length ? (
                            <span className="text-[11px] text-slate-400">{((editDraft.technical_notes as string) ?? editingRecord.technical_notes)?.length} caract.</span>
                          ) : null}
                        </div>
                        <Textarea
                          className="min-h-[100px] resize-none"
                          value={(editDraft.technical_notes as string) ?? (editingRecord.technical_notes || "")}
                          onChange={(e) => setEditDraft({ ...editDraft, technical_notes: e.target.value.toUpperCase() })}
                          placeholder="Descreva informações técnicas relevantes..."
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs font-semibold text-slate-600">Justificativa</Label>
                          {((editDraft.justification as string) ?? editingRecord.justification)?.length ? (
                            <span className="text-[11px] text-slate-400">{((editDraft.justification as string) ?? editingRecord.justification)?.length} caract.</span>
                          ) : null}
                        </div>
                        <Textarea
                          className="min-h-[100px] resize-none"
                          value={(editDraft.justification as string) ?? (editingRecord.justification || "")}
                          onChange={(e) => setEditDraft({ ...editDraft, justification: e.target.value.toUpperCase() })}
                          placeholder="Informe o motivo da confecção..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 bg-white/95 px-6 py-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" className="sm:min-w-[120px]" onClick={() => setEditingRecord(null)}>
                    Cancelar
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 sm:min-w-[140px]"
                    onClick={async () => {
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
                    }}
                  >
                    Salvar alterações
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
      </div>
    </div>

    {/* Diálogo para atualizar a data de entrega */}
    <Dialog open={updateDateDialogOpen} onOpenChange={setUpdateDateDialogOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Atualizar Data de Entrega</DialogTitle>
          <DialogDescription>
            Atualize a data de entrega prevista para esta matriz.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="newDeliveryDate" className="text-right">
              Nova Data
            </Label>
            <input
              id="newDeliveryDate"
              type="date"
              value={newDeliveryDate ? newDeliveryDate.split('T')[0] : ''}
              onChange={(e) => setNewDeliveryDate(e.target.value)}
              className="col-span-3 border rounded p-2"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="updateReason" className="text-right">
              Motivo (opcional)
            </Label>
            <textarea
              id="updateReason"
              value={updateReason}
              onChange={(e) => setUpdateReason(e.target.value)}
              placeholder="Informe o motivo da alteração da data"
              className="col-span-3 border rounded p-2 text-sm h-20"
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={handleCloseUpdateDateDialog}
            disabled={isUpdatingDate}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleUpdateDeliveryDate}
            disabled={!newDeliveryDate || isUpdatingDate}
          >
            {isUpdatingDate ? 'Atualizando...' : 'Atualizar Data'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
