import { useEffect, useState } from "react";
import { Matrix, MatrixEvent } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, MapPin, Tag, Upload, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface EventDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrix: Matrix | null;
  event: MatrixEvent | null;
  onUpdateEvent: (matrixId: string, eventId: string, updates: Partial<MatrixEvent>) => void;
  onDeleteEvent?: (matrixId: string, eventId: string) => Promise<void> | void;
  canDelete?: boolean;
  canEditDate?: boolean;
}

export const EventDetailDialog = ({
  open,
  onOpenChange,
  matrix,
  event,
  onUpdateEvent,
  onDeleteEvent,
  canDelete = false,
  canEditDate = false,
}: EventDetailDialogProps) => {
  const [observations, setObservations] = useState(event?.observations || "");
  const [images, setImages] = useState<string[]>(Array.isArray(event?.images) ? [...(event!.images!)] : []);
  const [responsible, setResponsible] = useState(event?.responsible || "");
  const [files, setFiles] = useState<{ name: string; type: string; dataUrl: string }[]>(Array.isArray(event?.files) ? [...(event!.files!)] : []);
  const [testStatus, setTestStatus] = useState<string>(event?.testStatus || "");
  const [eventDate, setEventDate] = useState(event?.date || "");
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sempre que abrir o diálogo ou mudar o evento, sincroniza os estados locais.
  useEffect(() => {
    if (!open || !event) return;
    setObservations(event.observations || "");
    setResponsible(event.responsible || "");
    setImages(Array.isArray(event.images) ? [...event.images] : []);
    setFiles(Array.isArray(event.files) ? [...event.files] : []);
    setTestStatus(event.testStatus || "");
    setEventDate(event.date || "");
  }, [open, event]);

  // Ao fechar, evita que o próximo evento herde valores do anterior
  useEffect(() => {
    if (open) return;
    setObservations("");
    setResponsible("");
    setImages([]);
    setFiles([]);
    setTestStatus("");
    setEventDate("");
    setDeleting(false);
  }, [open]);

  const savePartial = async (patch: Partial<MatrixEvent>) => {
    if (!matrix || !event) return;
    try {
      setSaving(true);
      await onUpdateEvent(matrix.id, event.id, patch);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked) return;
    Array.from(picked).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFiles((prev) => [
          ...prev,
          { name: file.name, type: file.type, dataUrl: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!matrix || !event) return;

    const updates: Partial<MatrixEvent> = {
      observations,
      images,
      responsible: responsible.trim() || undefined,
      files,
    };
    if (canEditDate && eventDate) {
      updates.date = eventDate;
    }

    onUpdateEvent(matrix.id, event.id, updates);

    toast({
      title: "Atualizado",
      description: "Observações e imagens foram salvas com sucesso.",
    });

    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!matrix || !event || !onDeleteEvent) return;
    const confirmed = window.confirm("Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.");
    if (!confirmed) return;
    try {
      setDeleting(true);
      await onDeleteEvent(matrix.id, event.id);
      setDeleting(false);
      onOpenChange(false);
    } catch (err: any) {
      setDeleting(false);
      toast({
        title: "Erro ao excluir",
        description: String(err?.message || err),
        variant: "destructive",
      });
    }
  };

  if (!event || !matrix) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Evento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/30 p-4 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <span className="font-semibold">{event.type}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {new Date(event.date).toLocaleDateString("pt-BR")}
            </div>
            {event.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {event.location}
              </div>
            )}
            <p className="text-sm mt-2">{event.comment}</p>
          </div>

          <div>
            <Label htmlFor="responsible">Responsável</Label>
            <Input
              id="responsible"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              onBlur={() => savePartial({ responsible: responsible.trim() || undefined })}
              placeholder="Operador/Responsável pelo evento"
              className="mt-2"
            />
          </div>

          {/* Campo de Status apenas para eventos de Teste */}
          {event?.type === "Testes" && (
            <div>
              <Label htmlFor="test-status">Status do Teste</Label>
              <Select
                value={testStatus || "none"}
                onValueChange={(value) => {
                  const newStatus = value === "none" ? "" : value;
                  setTestStatus(newStatus);
                  savePartial({ testStatus: newStatus as "Aprovado" | "Reprovado" });
                }}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione o status do teste" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem status</SelectItem>
                  <SelectItem value="Reprovado">Reprovado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {canEditDate && (
            <div>
              <Label htmlFor="event-date">Data do Evento</Label>
              <Input
                id="event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                onBlur={() => {
                  if (!matrix || !event) return;
                  if (!eventDate) return;
                  savePartial({ date: eventDate });
                }}
                className="mt-2"
              />
            </div>
          )}

          <div>
            <Label htmlFor="observations">Observações Adicionais</Label>
            <Textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              onBlur={() => savePartial({ observations })}
              placeholder="Adicione observações detalhadas sobre este evento..."
              className="mt-2 min-h-[120px]"
            />
          </div>

          <div>
            <Label>Imagens</Label>
            <div className="mt-2 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("image-upload")?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Adicionar Imagens
                </Button>
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {images.map((image, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={image}
                        alt={`Imagem ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemoveImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>Documentos (PDF, DOC, XLS...)</Label>
            <div className="mt-2 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  id="doc-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("doc-upload")?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Adicionar Documentos
                </Button>
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded border p-2">
                      <a href={f.dataUrl} download={f.name} className="text-sm underline truncate max-w-[220px]" title={f.name}>
                        {f.name}
                      </a>
                      <Button type="button" variant="destructive" size="sm" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}>
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4">
            {saving && <span className="text-xs text-muted-foreground">Salvando...</span>}
            {canDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={saving || deleting}
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </Button>
            )}
            <Button onClick={handleSave} className="flex-1" disabled={saving || deleting}>
              Salvar
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={deleting}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
