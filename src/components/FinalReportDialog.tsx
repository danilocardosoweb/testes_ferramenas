import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Matrix, MatrixEvent } from "@/types";
import { daysSinceLastEvent, getCounts, computeDurations } from "@/utils/metrics";
import { uploadAttachment, listAttachments, deleteAttachment, renameAttachment, FinalReportAttachments } from "@/services/files";
import { FileText, Image as ImageIcon, Upload, Trash2, Eye, Pencil, RotateCcw, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface FinalReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrix: Matrix | null;
  onRefresh?: () => void;
  isAdmin?: boolean;
  onRestoreToApproval?: (matrixId: string) => Promise<void>;
}

export const FinalReportDialog: React.FC<FinalReportDialogProps> = ({ open, onOpenChange, matrix, onRefresh, isAdmin = false, onRestoreToApproval }) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [attachments, setAttachments] = useState<FinalReportAttachments>({ docsProjetos: [], rip: [] });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const counts = useMemo(() => (matrix ? getCounts(matrix) : { tests: 0, rejects: 0, fixes: 0, approvals: 0 }), [matrix]);
  const durations = useMemo(() => (matrix ? computeDurations(matrix) : []), [matrix]);
  const diasEntreEventos = useMemo(() => {
    const arr = durations.filter((d: any) => !!d.to).map((d: any) => d.days);
    return arr.length ? Math.round(arr.reduce((a: number, b: number) => a + b, 0) / arr.length) : 0;
  }, [durations]);

  const diasSemEvento = useMemo(() => (matrix ? daysSinceLastEvent(matrix) : 0), [matrix]);

  useEffect(() => {
    const load = async () => {
      if (!matrix) return;
      try {
        const list = await listAttachments(matrix.id);
        setAttachments(list);
      } catch (err) {
        // silencioso
      }
    };
    if (open) load();
  }, [open, matrix]);

  const handleRenameAttachment = async (fileId: string, currentName: string) => {
    if (!matrix) return;
    const newName = window.prompt("Novo nome para o anexo", currentName);
    if (newName === null) return;
    setRenamingId(fileId);
    try {
      await renameAttachment(fileId, newName);
      toast({ title: "Anexo renomeado" });
      const list = await listAttachments(matrix.id);
      setAttachments(list);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast({ title: "Falha ao renomear", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setRenamingId(null);
    }
  };

  const handleDeleteAttachment = async (fileId: string, fileUrl: string) => {
    if (!matrix) return;
    const confirmDelete = window.confirm("Excluir este anexo?");
    if (!confirmDelete) return;
    setDeletingId(fileId);
    try {
      await deleteAttachment(fileId, fileUrl);
      toast({ title: "Anexo removido" });
      const list = await listAttachments(matrix.id);
      setAttachments(list);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast({ title: "Falha ao excluir", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget; // capturar antes de qualquer await
    const files = inputEl.files;
    if (!files || !matrix) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: "Arquivo muito grande", description: `${file.name} excede 10MB`, variant: "destructive" });
          continue;
        }
        await uploadAttachment(matrix.id, file);
      }
      toast({ title: "Anexos enviados", description: "Arquivos adicionados ao relatório final." });
      if (onRefresh) onRefresh();
      // recarregar anexos
      const list = await listAttachments(matrix.id);
      setAttachments(list);
    } catch (err: any) {
      toast({ title: "Falha ao enviar", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setUploading(false);
      // limpar input com referência estável
      try { inputEl.value = ""; } catch {}
    }
  };

  if (!matrix) return null;

  const eventsSorted: MatrixEvent[] = [...(matrix.events || [])].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 overflow-hidden" aria-describedby="final-report-desc">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl font-bold">Relatório Final – {matrix.code}</DialogTitle>
            {isAdmin && onRestoreToApproval && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-orange-600 border-orange-300 hover:bg-orange-50"
                    disabled={restoring}
                  >
                    {restoring ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                    Restaurar para Aprovação
                  </Button>
                </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restaurar Ferramenta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá remover a aprovação da ferramenta <strong>{matrix.code}</strong> e ela voltará ao processo de testes/aprovação.
                    <br /><br />
                    <strong>Tem certeza que deseja continuar?</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-orange-600 hover:bg-orange-700"
                    onClick={async () => {
                      if (!matrix) return;
                      setRestoring(true);
                      try {
                        await onRestoreToApproval(matrix.id);
                        toast({ title: "Ferramenta restaurada", description: `${matrix.code} voltou ao processo de aprovação.` });
                        onOpenChange(false);
                        if (onRefresh) onRefresh();
                      } catch (err: any) {
                        toast({ title: "Erro ao restaurar", description: String(err?.message || err), variant: "destructive" });
                      } finally {
                        setRestoring(false);
                      }
                    }}
                  >
                    Sim, Restaurar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            )}
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          <p id="final-report-desc" className="sr-only">Relatório final da ferramenta com KPIs, histórico de eventos e anexos.</p>
          {/* Cabeçalho / KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Dias sem evento</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{diasSemEvento}</CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Testes</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{counts.tests}</CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Correções</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{counts.fixes}</CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Aprovações</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{counts.approvals}</CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader className="py-2"><CardTitle className="text-sm">Média dias entre eventos</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{diasEntreEventos}</CardContent>
            </Card>
            {matrix.folder && (
              <Card className="md:col-span-2">
                <CardHeader className="py-2"><CardTitle className="text-sm">Pasta</CardTitle></CardHeader>
                <CardContent className="text-lg font-medium">{matrix.folder}</CardContent>
              </Card>
            )}
          </div>

          {/* Linha do tempo / Eventos */}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Histórico de Eventos</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Data</TableHead>
                      <TableHead className="w-40">Tipo</TableHead>
                      <TableHead>Comentário</TableHead>
                      <TableHead className="w-36">Local</TableHead>
                      <TableHead className="w-40">Responsável</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsSorted.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Sem eventos</TableCell></TableRow>
                    ) : eventsSorted.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell>{new Date(ev.date).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell>{ev.type}</TableCell>
                        <TableCell>{ev.comment || "-"}</TableCell>
                        <TableCell>{ev.location || "-"}</TableCell>
                        <TableCell>{ev.responsible || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Anexos */}
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">RIP (matrix-attachments)</CardTitle>
              <div className="flex items-center gap-2">
                <Input type="file" multiple accept="application/pdf,image/*" onChange={handleUpload} disabled={uploading} />
                <Button disabled={uploading} variant="secondary">
                  <Upload className="h-4 w-4 mr-2" /> Selecionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {attachments.rip.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum anexo RIP.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {attachments.rip.map((f) => {
                    const mime = f.mime_type || "";
                    const isImage = mime.startsWith("image/");
                    const disabled = deletingId === f.id || renamingId === f.id;
                    return (
                      <div key={f.id} className="border rounded p-2 flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          <span className="truncate text-sm" title={f.file_name}>{f.file_name}</span>
                        </div>
                        {isImage && (
                          <button onClick={() => window.open(f.url, "_blank", "noopener")} className="border rounded overflow-hidden h-24 focus:outline-none focus:ring">
                            <img src={f.url} alt={f.file_name} className="w-full h-full object-cover" />
                          </button>
                        )}
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(f.url, "_blank", "noopener")}
                            title="Visualizar"
                            disabled={disabled}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRenameAttachment(f.id, f.file_name)}
                            title="Renomear"
                            disabled={disabled}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAttachment(f.id, f.url)}
                            title="Excluir"
                            disabled={disabled}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Docs Projetos (attachments)</CardTitle>
            </CardHeader>
            <CardContent>
              {attachments.docsProjetos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum documento legado.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {attachments.docsProjetos.map((doc) => {
                    const mime = doc.mime_type || "";
                    const isImage = mime.startsWith("image/");
                    return (
                      <div key={doc.id} className="border rounded p-2 flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          <span className="truncate text-sm" title={doc.file_name}>{doc.file_name}</span>
                        </div>
                        {isImage && (
                          <button onClick={() => window.open(doc.url, "_blank", "noopener")} className="border rounded overflow-hidden h-24 focus:outline-none focus:ring">
                            <img src={doc.url} alt={doc.file_name} className="w-full h-full object-cover" />
                          </button>
                        )}
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(doc.url, "_blank", "noopener")}
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
