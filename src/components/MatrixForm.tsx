import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { v4 as uuidv4 } from "uuid";
import { Matrix } from "@/types";
import { listManufacturingRecords, ManufacturingRecord } from "@/services/manufacturing";

interface MatrixFormProps {
  onSubmit: (matrix: Matrix) => void;
  onCancel: () => void;
  folders?: string[];
  defaultFolder?: string | null;
}

export const MatrixForm = ({ onSubmit, onCancel, folders = [], defaultFolder = null }: MatrixFormProps) => {
  const [code, setCode] = useState("");
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [priority, setPriority] = useState<"normal" | "medium" | "critical">("normal");
  const [responsible, setResponsible] = useState("");
  const [folder, setFolder] = useState<string>(defaultFolder ?? "");
  const [manufacturingRecords, setManufacturingRecords] = useState<ManufacturingRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ManufacturingRecord | null>(null);

  useEffect(() => {
    const loadManufacturingRecords = async () => {
      try {
        const records = await listManufacturingRecords();
        setManufacturingRecords(records);
      } catch (err) {
        console.error("Erro ao carregar registros de confecção:", err);
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

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
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Nova Matriz</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Seção de Registros de Confecção */}
          {manufacturingRecords.length > 0 && (
            <div>
              <Label className="text-sm font-semibold">Matrizes em Confecção ({manufacturingRecords.length})</Label>
              <p className="text-xs text-muted-foreground mb-2">Selecione uma matriz que chegou na empresa:</p>
              <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                {manufacturingRecords.map((record) => (
                  <div
                    key={record.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                      selectedRecord?.id === record.id ? "bg-blue-100 border border-blue-300" : "hover:bg-slate-50"
                    }`}
                    onClick={() => handleSelectManufacturingRecord(record)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{record.matrix_code}</span>
                      <Badge variant={record.manufacturing_type === 'nova' ? 'default' : 'secondary'} className="text-xs">
                        {record.manufacturing_type === 'nova' ? 'Nova' : 'Reposição'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {record.supplier === 'Outro' ? record.custom_supplier : record.supplier}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Entrega: {new Date(record.delivery_date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="code">Código da Matriz</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: TMP-347"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="receivedDate">Data de Recebimento</Label>
            <Input
              id="receivedDate"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="priority">Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="responsible">Responsável (opcional)</Label>
            <Input
              id="responsible"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="Nome do responsável geral"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="folder">Pasta (opcional)</Label>
            <Input
              id="folder"
              list="folder-list"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Digite ou selecione uma pasta"
              className="mt-1"
            />
            {folders.length > 0 && (
              <datalist id="folder-list">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1">
              Criar Matriz
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
