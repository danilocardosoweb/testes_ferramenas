import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { createManufacturingRecord, listManufacturingRecords, ManufacturingRecord } from "@/services/manufacturing";
import { Factory, X, Eye, Download, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import * as XLSX from 'xlsx';

interface FormData {
  matrixCode: string;
  manufacturingType: "nova" | "reposicao" | "";
  profileType: "tubular" | "solido" | "";
  supplier: string;
  customSupplier: string;
  deliveryDate: string;
  replacedMatrix: string; // Matriz sendo substituída (só para reposição)
  images: string[];
  volumeProduced: string; // número em string para input controlado
  technicalNotes: string;
  justification: string;
}

interface ManufacturingViewProps {
  onSuccess?: () => void;
}

export function ManufacturingView({ onSuccess }: ManufacturingViewProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [records, setRecords] = useState<ManufacturingRecord[]>([]);
  const [viewRecord, setViewRecord] = useState<ManufacturingRecord | null>(null);
  const [isFormExpanded, setIsFormExpanded] = useState(true);
  
  const [formData, setFormData] = useState<FormData>({
    matrixCode: "",
    manufacturingType: "",
    profileType: "",
    supplier: "",
    customSupplier: "",
    deliveryDate: "",
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

  // refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const suppliers = ["FEP", "EXXO", "FELJ", "Outro"];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
  const months = [
    { value: "01", label: "Jan" }, { value: "02", label: "Fev" }, { value: "03", label: "Mar" },
    { value: "04", label: "Abr" }, { value: "05", label: "Mai" }, { value: "06", label: "Jun" },
    { value: "07", label: "Jul" }, { value: "08", label: "Ago" }, { value: "09", label: "Set" },
    { value: "10", label: "Out" }, { value: "11", label: "Nov" }, { value: "12", label: "Dez" },
  ];

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const data = await listManufacturingRecords();
      setRecords(data);
    } catch (err: any) {
      console.error("Erro ao carregar registros:", err);
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
      toast({ 
        title: "Registro deletado", 
        description: `O registro da matriz ${matrixCode} foi removido permanentemente` 
      });
    } catch (err: any) {
      console.error("Erro ao deletar registro:", err);
      toast({ 
        title: "Erro ao deletar", 
        description: String(err?.message || err), 
        variant: "destructive" 
      });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Arquivo muito grande", description: `${file.name} excede 5MB`, variant: "destructive" });
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

  const handleExportToExcel = () => {
    try {
      // Filtrar registros
      const filtered = records.filter(r => {
        const y = new Date(r.created_at).getFullYear().toString();
        const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
        const matchYear = !filterYear || filterYear === " " || y === filterYear;
        const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
        const matchSupplier = !filterSupplier || filterSupplier === " " || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
        return matchYear && matchMonth && matchSupplier;
      });

      // Preparar dados para Excel
      const excelData = filtered.map(r => ({
        'Código': r.matrix_code,
        'Tipo': r.manufacturing_type === 'nova' ? 'Matriz Nova' : 'Reposição',
        'Perfil': r.profile_type === 'tubular' ? 'Tubular' : 'Sólido',
        'Fornecedor': r.supplier === 'Outro' ? r.custom_supplier : r.supplier,
        'Data Entrega': new Date(r.delivery_date).toLocaleDateString('pt-BR'),
        'Volume Produzido': r.volume_produced || '-',
        'Observações': r.technical_notes || '-',
        'Justificativa': r.justification,
        'Data Criação': new Date(r.created_at).toLocaleDateString('pt-BR'),
      }));

      // Criar workbook
      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Confecções');

      // Ajustar largura das colunas
      const colWidths = [
        { wch: 15 }, // Código
        { wch: 15 }, // Tipo
        { wch: 10 }, // Perfil
        { wch: 15 }, // Fornecedor
        { wch: 12 }, // Data Entrega
        { wch: 15 }, // Volume
        { wch: 30 }, // Observações
        { wch: 40 }, // Justificativa
        { wch: 12 }, // Data Criação
      ];
      ws['!cols'] = colWidths;

      // Download
      const fileName = `confeccoes_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({ title: "Exportado com sucesso", description: `${filtered.length} registro(s) exportado(s)` });
    } catch (err: any) {
      console.error("Erro ao exportar:", err);
      toast({ title: "Erro ao exportar", description: String(err?.message || err), variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.matrixCode || !formData.manufacturingType || !formData.profileType || 
        !formData.supplier || !formData.deliveryDate || !formData.justification) {
      toast({ title: "Formulário incompleto", description: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    if (formData.supplier === "Outro" && !formData.customSupplier) {
      toast({ title: "Fornecedor não especificado", description: "Informe o nome do fornecedor", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      await createManufacturingRecord({
        matrix_code: formData.matrixCode,
        manufacturing_type: formData.manufacturingType as "nova" | "reposicao",
        profile_type: formData.profileType as "tubular" | "solido",
        supplier: formData.supplier,
        custom_supplier: formData.customSupplier,
        delivery_date: formData.deliveryDate,
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
        supplier: "",
        customSupplier: "",
        deliveryDate: "",
        replacedMatrix: "",
        images: [],
        volumeProduced: "",
        technicalNotes: "",
        justification: "",
      });
      
      await loadRecords();
      toast({ title: "Confecção registrada!", description: "O pedido de confecção foi registrado. A matriz será criada quando recebida." });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Erro ao registrar confecção:", err);
      toast({ title: "Erro ao registrar", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-3 bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header Compacto */}
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded shadow">
          <Factory className="h-4 w-4 text-white" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">Registro de Confecção</h1>
        <Button 
          onClick={loadRecords} 
          variant="outline" 
          size="sm"
          className="ml-auto"
        >
          🔄 Recarregar
        </Button>
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
            {/* Grid de 6 colunas */}
            <div className="grid grid-cols-6 gap-3">
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
                <Select value={formData.profileType} onValueChange={(value) => setFormData({ ...formData, profileType: value as "tubular" | "solido" })}>
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
                <Label className="text-xs font-semibold">Entrega <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={formData.deliveryDate}
                  onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                  className="h-7 text-xs"
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              {/* Coluna 6: Volume Produzido */}
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
            </div>

            {/* Segunda linha: Campos condicionais */}
            {(formData.supplier === "Outro" || formData.manufacturingType === "reposicao") && (
              <div className="grid grid-cols-5 gap-2">
                {formData.supplier === "Outro" && (
                  <div className="col-span-2">
                    <Label className="text-xs font-semibold">Nome do Fornecedor <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="Nome do fornecedor"
                      value={formData.customSupplier}
                      onChange={(e) => setFormData({ ...formData, customSupplier: e.target.value })}
                      className="h-7 text-xs"
                      required
                    />
                  </div>
                )}
                {formData.manufacturingType === "reposicao" && (
                  <div className="col-span-2">
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
              </div>
            )}

            {/* Linha 3: Observações e Justificativa */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">Observações Técnicas</Label>
                <Textarea
                  placeholder="Detalhes técnicos..."
                  value={formData.technicalNotes}
                  onChange={(e) => setFormData({ ...formData, technicalNotes: e.target.value })}
                  className="h-12 text-xs resize-none"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Justificativa <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Motivo da confecção..."
                  value={formData.justification}
                  onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                  className="h-12 text-xs resize-none"
                  required
                />
              </div>
            </div>

            {/* Linha 4: Upload de Imagens - Minimalista */}
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

            {/* Botões */}
            <div className="flex gap-2 justify-end">
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
                      supplier: "",
                      customSupplier: "",
                      deliveryDate: "",
                      replacedMatrix: "",
                      images: [],
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
          </form>
        </CardContent>}
      </Card>

      {/* Tabela de Registros */}
      <Card className="flex-1 border border-slate-200 shadow-sm">
        <CardHeader className="py-2 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-800">Matrizes em Confecção ({records.filter(r => {
              const y = new Date(r.created_at).getFullYear().toString();
              const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
              const matchYear = !filterYear || y === filterYear;
              const matchMonth = !filterMonth || m === filterMonth;
              const matchSupplier = !filterSupplier || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
              return matchYear && matchMonth && matchSupplier;
            }).length})</CardTitle>
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
              {(filterYear || filterMonth || filterSupplier) && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setFilterYear(""); setFilterMonth(""); setFilterSupplier(""); }}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="h-8 px-2">Código</TableHead>
                  <TableHead className="h-8 px-2">Tipo</TableHead>
                  <TableHead className="h-8 px-2">Perfil</TableHead>
                  <TableHead className="h-8 px-2">Fornecedor</TableHead>
                  <TableHead className="h-8 px-2">Criado</TableHead>
                  <TableHead className="h-8 px-2">Entrega</TableHead>
                  <TableHead className="h-8 px-2">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-4">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  records.filter(r => {
                    const y = new Date(r.created_at).getFullYear().toString();
                    const m = (new Date(r.created_at).getMonth() + 1).toString().padStart(2, '0');
                    const matchYear = !filterYear || filterYear === " " || y === filterYear;
                    const matchMonth = !filterMonth || filterMonth === " " || m === filterMonth;
                    const matchSupplier = !filterSupplier || filterSupplier === " " || r.supplier === filterSupplier || (r.supplier === "Outro" && r.custom_supplier === filterSupplier);
                    return matchYear && matchMonth && matchSupplier;
                  }).map((record) => (
                    <TableRow key={record.id} className="text-xs">
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
                        {record.supplier === "Outro" ? record.custom_supplier : record.supplier}
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        {new Date(record.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        {new Date(record.delivery_date).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setViewRecord(record)}
                            title="Visualizar detalhes"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
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
                  <Label className="font-semibold">Data de Entrega:</Label>
                  <p>{new Date(viewRecord.delivery_date).toLocaleDateString('pt-BR')}</p>
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
                  <Label className="font-semibold">Imagens ({viewRecord.matrix_images.length}):</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {viewRecord.matrix_images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`Imagem ${i + 1}`}
                        className="w-full h-20 object-cover rounded border cursor-pointer hover:opacity-80"
                        onClick={() => setPreviewImage(img)}
                      />
                    ))}
                  </div>
                </div>
              )}
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
    </div>
  );
}
