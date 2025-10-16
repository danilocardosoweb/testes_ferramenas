import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { v4 as uuidv4 } from "uuid";
import { Matrix } from "@/types";
import { listManufacturingRecords, ManufacturingRecord, receiveManufacturingMatrix } from "@/services/manufacturing";
import { Package, Calendar, AlertCircle, User, Folder, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MatrixFormProps {
  onSubmit: (matrix: Matrix) => void;
  onCancel: () => void;
  folders?: string[];
  defaultFolder?: string | null;
  onMatrixFromManufacturing?: (matrixId: string) => void;
}

export const MatrixForm = ({ onSubmit, onCancel, folders = [], defaultFolder = null, onMatrixFromManufacturing }: MatrixFormProps) => {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [priority, setPriority] = useState<"normal" | "medium" | "critical">("normal");
  const [responsible, setResponsible] = useState("");
  const [folder, setFolder] = useState<string>(defaultFolder ?? "");
  const [manufacturingRecords, setManufacturingRecords] = useState<ManufacturingRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ManufacturingRecord | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    // Busca direto do banco - simples e direto
    const loadManufacturingRecords = async () => {
      setLoadingRecords(true);
      console.log('[MatrixForm] Iniciando busca de registros de confecção...');
      try {
        const records = await listManufacturingRecords();
        console.log('[MatrixForm] Registros carregados:', records.length, records);
        setManufacturingRecords(records);
      } catch (err) {
        console.error("[MatrixForm] Erro ao carregar registros de confecção:", err);
        toast({
          title: "Erro ao carregar",
          description: "Não foi possível carregar as matrizes em confecção",
          variant: "destructive"
        });
      } finally {
        setLoadingRecords(false);
      }
    };
    loadManufacturingRecords();
  }, []);

  const handleSelectManufacturingRecord = (record: ManufacturingRecord) => {
    setSelectedRecord(record);
    setCode(record.matrix_code);
    setReceivedDate(new Date().toISOString().split("T")[0]); // Data atual (chegada na empresa)
    setPriority("normal");
    setResponsible("");
    setFolder("");
    setShowSuggestions(false);
  };

  const handleCodeChange = (value: string) => {
    setCode(value.toUpperCase());
    // Verificar se o código corresponde a algum registro
    const matchingRecord = manufacturingRecords.find(r => r.matrix_code === value.toUpperCase());
    if (matchingRecord) {
      setSelectedRecord(matchingRecord);
    } else {
      setSelectedRecord(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    // Se foi selecionado um registro de confecção, processar recebimento
    if (selectedRecord) {
      try {
        // Receber matriz de confecção (cria matriz + marca como recebida)
        const { matrixId } = await receiveManufacturingMatrix(selectedRecord.id, {
          receivedDate,
          priority,
          responsible: responsible.trim() || undefined,
          folder: folder.trim() || undefined,
        });
        
        // Atualizar lista local
        setManufacturingRecords(prev => prev.filter(r => r.id !== selectedRecord.id));
        
        // Notificar que a matriz foi criada
        if (onMatrixFromManufacturing) {
          onMatrixFromManufacturing(matrixId);
        }
        
        toast({
          title: "Matriz recebida com sucesso!",
          description: `Matriz ${selectedRecord.matrix_code} foi processada e removida da lista de confecção`,
        });
        
        // Limpar formulário
        setCode("");
        setReceivedDate(new Date().toISOString().split("T")[0]);
        setPriority("normal");
        setResponsible("");
        setFolder(defaultFolder ?? "");
        setSelectedRecord(null);
        onCancel(); // Fechar o formulário
        return;
      } catch (err: any) {
        console.error("Erro ao processar matriz de confecção:", err);
        toast({
          title: "Erro ao processar matriz",
          description: err?.message || "Não foi possível processar a matriz de confecção",
          variant: "destructive"
        });
        return;
      }
    }

    // Se não é de confecção ou não tem matrix_id, criar normalmente
    const newMatrix: Matrix = {
      id: uuidv4(),
      code: code.trim(),
      receivedDate,
      priority,
      responsible: responsible.trim() || undefined,
      folder: folder.trim() || undefined,
      events: [
        {
          id: uuidv4(),
          date: receivedDate,
          type: "Recebimento",
          comment: "Matriz recebida",
          location: "",
        },
      ],
    };

    onSubmit(newMatrix);
    setCode("");
    setReceivedDate(new Date().toISOString().split("T")[0]);
    setPriority("normal");
    setResponsible("");
    setFolder(defaultFolder ?? "");
    setSelectedRecord(null);
  };

  return (
    <Card className="shadow-lg border-0 max-h-[90vh] flex flex-col">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-t-lg py-3 px-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          <CardTitle className="text-base">Nova Matriz</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 relative">
            <Label htmlFor="code" className="flex items-center gap-2 text-sm font-semibold">
              <Package className="h-4 w-4 text-slate-600" />
              Código da Matriz <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="code"
                list="manufacturing-codes"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder={loadingRecords ? "Carregando opções..." : "Ex: TMP-347 ou selecione da lista"}
                required
                className="h-10 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                autoComplete="off"
                name="matrix-code-input"
                spellCheck={false}
                disabled={loadingRecords}
              />
              {manufacturingRecords.length > 0 && (
                <datalist id="manufacturing-codes">
                  {manufacturingRecords.map((record) => {
                    const tipo = record.manufacturing_type === 'nova' ? 'Nova' : 'Reposição';
                    const fornecedor = record.supplier === 'Outro' ? record.custom_supplier : record.supplier;
                    const entrega = new Date(record.delivery_date).toLocaleDateString('pt-BR');
                    return (
                      <option 
                        key={record.id} 
                        value={record.matrix_code}
                        label={`${record.matrix_code} | ${tipo} | ${fornecedor} | Entrega: ${entrega}`}
                      />
                    );
                  })}
                </datalist>
              )}
              {selectedRecord && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
              )}
            </div>
            {selectedRecord && (
              <div className="bg-green-50 border border-green-200 rounded p-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span className="font-semibold text-green-900">Matriz de confecção selecionada:</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <Badge variant={selectedRecord.manufacturing_type === 'nova' ? 'default' : 'secondary'} className="text-[10px] h-4">
                    {selectedRecord.manufacturing_type === 'nova' ? 'Nova' : 'Reposição'}
                  </Badge>
                  <span className="text-green-800 font-medium">
                    {selectedRecord.supplier === 'Outro' ? selectedRecord.custom_supplier : selectedRecord.supplier}
                  </span>
                  <span className="text-green-700">
                    Entrega: {new Date(selectedRecord.delivery_date).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <p className="text-[10px] text-green-700 mt-1 italic">
                  * Esta matriz será removida da lista de confecção ao criar
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="receivedDate" className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4 text-slate-600" />
              Data de Recebimento <span className="text-red-500">*</span>
            </Label>
            <Input
              id="receivedDate"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              required
              className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority" className="flex items-center gap-2 text-sm font-semibold">
              <AlertCircle className="h-4 w-4 text-slate-600" />
              Prioridade <span className="text-red-500">*</span>
            </Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-blue-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    Crítico
                  </div>
                </SelectItem>
                <SelectItem value="medium">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                    Médio
                  </div>
                </SelectItem>
                <SelectItem value="normal">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    Normal
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="responsible" className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-slate-600" />
              Cliente
            </Label>
            <Input
              id="responsible"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="Nome do cliente da matriz"
              className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="folder" className="flex items-center gap-2 text-sm font-semibold">
              <Folder className="h-4 w-4 text-slate-600" />
              Pasta (opcional)
            </Label>
            <Input
              id="folder"
              list="folder-list"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Digite ou selecione uma pasta"
              className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-blue-500"
            />
            {folders.length > 0 && (
              <datalist id="folder-list">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-slate-200">
            <Button 
              type="submit" 
              className="flex-1 h-10 text-sm bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold shadow-md"
            >
              Criar Matriz
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
              className="h-10 px-4 text-sm border-slate-300 hover:bg-slate-100"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
