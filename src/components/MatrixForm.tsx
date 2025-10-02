import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { v4 as uuidv4 } from "uuid";
import { Matrix } from "@/types";

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
