import { useState, useEffect } from "react";
import { Matrix, MatrixEvent } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface QuickEventEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrix: Matrix | null;
  event: MatrixEvent | null;
  onUpdateEvent: (matrixId: string, eventId: string, updates: Partial<MatrixEvent>) => Promise<void> | void;
}

export const QuickEventEditModal = ({
  open,
  onOpenChange,
  matrix,
  event,
  onUpdateEvent,
}: QuickEventEditModalProps) => {
  const [testStatus, setTestStatus] = useState("");
  const [observations, setObservations] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && event) {
      setTestStatus((event.testStatus as string) || "");
      setObservations(event.observations || "");
    }
  }, [open, event]);

  const handleSave = async () => {
    if (!matrix || !event) return;
    
    try {
      setSaving(true);
      const updates: Partial<MatrixEvent> = {
        testStatus: testStatus || undefined,
        observations: observations || undefined,
      };
      await onUpdateEvent(matrix.id, event.id, updates);
      toast({ title: "Atualizado com sucesso" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ 
        title: "Erro ao atualizar", 
        description: String(err?.message || err), 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Editar Evento - {event?.type}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="testStatus">Status do Teste</Label>
            <Select value={testStatus || "none"} onValueChange={(value) => setTestStatus(value === "none" ? "" : value)}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Selecione um status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem status</SelectItem>
                <SelectItem value="Aprovado">Aprovado</SelectItem>
                <SelectItem value="Reprovado">Reprovado</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="observations">Observações Adicionais</Label>
            <Textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Adicione observações sobre este evento..."
              className="mt-2 min-h-[100px]"
            />
          </div>

          <div className="flex gap-2 justify-end">
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
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
