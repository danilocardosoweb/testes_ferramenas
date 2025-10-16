import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Matrix, MatrixEvent } from "@/types";
import { daysSinceLastEvent, getCounts, computeDurations } from "@/utils/metrics";
import { uploadAttachment, listAttachments } from "@/services/files";
import { FileText, Image as ImageIcon, Upload } from "lucide-react";

interface FinalReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrix: Matrix | null;
  onRefresh?: () => void;
}

export const FinalReportDialog: React.FC<FinalReportDialogProps> = ({ open, onOpenChange, matrix, onRefresh }) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);

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
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden" aria-describedby="final-report-desc">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-xl font-bold">Relatório Final – {matrix.code}</DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6 overflow-auto">
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
              <div className="max-h-64 overflow-auto">
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
              <CardTitle className="text-base">Anexos (PDF/Imagens)</CardTitle>
              <div className="flex items-center gap-2">
                <Input type="file" multiple accept="application/pdf,image/*" onChange={handleUpload} disabled={uploading} />
                <Button disabled={uploading} variant="secondary">
                  <Upload className="h-4 w-4 mr-2" /> Selecionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum anexo ainda.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {attachments.flatMap((a: any) => {
                    const files = a.event_files || [];
                    if (files.length === 0) {
                      return [
                        <div key={a.id} className="border rounded p-2 text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span>{a.comment || "Anexo"}</span>
                        </div>
                      ];
                    }
                    return files.map((f: any) => {
                      const isImage = (f.content_type || "").startsWith("image/");
                      return (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="border rounded p-2 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-2">
                            {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            <span className="truncate text-sm" title={f.file_name}>{f.file_name}</span>
                          </div>
                        </a>
                      );
                    });
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
