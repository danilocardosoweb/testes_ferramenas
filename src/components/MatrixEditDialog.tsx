import { useEffect, useState } from "react";
import { Matrix } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar, User, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MatrixEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrix: Matrix | null;
  onUpdateMatrix: (matrixId: string, updates: { responsible?: string; receivedDate?: string }) => Promise<void>;
  isAdmin: boolean;
}

export const MatrixEditDialog = ({
  open,
  onOpenChange,
  matrix,
  onUpdateMatrix,
  isAdmin,
}: MatrixEditDialogProps) => {
  const [responsible, setResponsible] = useState(matrix?.responsible || "");
  const [receivedDate, setReceivedDate] = useState(matrix?.receivedDate || "");
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !matrix) return;
    setResponsible(matrix.responsible || "");
    setReceivedDate(matrix.receivedDate || "");
  }, [open, matrix]);

  useEffect(() => {
    if (open) return;
    setResponsible("");
    setReceivedDate("");
  }, [open]);

  const handleSave = async () => {
    if (!matrix || !isAdmin) return;
    
    try {
      setSaving(true);
      await onUpdateMatrix(matrix.id, {
        responsible: responsible.trim() || undefined,
        receivedDate: receivedDate || undefined,
      });
      
      toast({
        title: "Matriz atualizada",
        description: "Os dados da matriz foram atualizados com sucesso.",
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar matriz:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar os dados da matriz.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!matrix || !isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar Matriz: {matrix.code}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="responsible" className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4" />
              Nome do Cliente
            </Label>
            <Input
              id="responsible"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="Nome do cliente da matriz"
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="receivedDate" className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4" />
              Data de Recebimento
            </Label>
            <Input
              id="receivedDate"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
