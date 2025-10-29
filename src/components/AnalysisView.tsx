import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadCloud, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AnalysisCategory,
  AnalysisExcelUpload,
  deleteAnalysisExcelUpload,
  listAnalysisExcelUploads,
  uploadAnalysisExcel,
} from "@/services/analysis";
import { AuthSession } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CarteiraAnalysis } from "@/components/analysis/CarteiraAnalysis";

const FILE_SLOTS: Array<{ key: AnalysisCategory; label: string }> = [
  { key: "producao", label: "Produção" },
  { key: "carteira", label: "Carteira" },
  { key: "ferramentas", label: "Ferramentas" },
  { key: "correcoes", label: "Correções" },
];

type UploadState = Record<AnalysisCategory, AnalysisExcelUpload | null>;

const buildInitialState = (): UploadState => ({
  producao: null,
  carteira: null,
  ferramentas: null,
  correcoes: null,
});

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, idx);
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[idx]}`;
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface AnalysisViewProps {
  authSession?: AuthSession | null;
}

export function AnalysisView({ authSession }: AnalysisViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadState>(() => buildInitialState());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<AnalysisCategory | null>(null);
  const { toast } = useToast();

  const fetchUploads = async () => {
    setLoading(true);
    try {
      const data = await listAnalysisExcelUploads();
      setUploads((prev) => {
        const base = { ...buildInitialState() };
        for (const item of data) {
          base[item.category] = item;
        }
        return base;
      });
    } catch (error: any) {
      console.error("Erro ao carregar planilhas de análise", error);
      toast({
        title: "Falha ao carregar",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  const hasFiles = useMemo(() => Object.values(uploads).some(Boolean), [uploads]);

  const mainContent = useMemo(() => {
    return (
      <Tabs defaultValue="carteira" className="h-full">
        <TabsList className="grid max-w-md grid-cols-3">
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
          <TabsTrigger value="producao" disabled>
            Produção
          </TabsTrigger>
          <TabsTrigger value="ferramentas" disabled>
            Ferramentas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="carteira" className="mt-6 h-[calc(100%-3rem)]">
          <CarteiraAnalysis
            upload={uploads.carteira}
            ferramentasUpload={uploads.ferramentas}
            isUploadingMeta={loading}
            onRequestUpload={() => {
              setDialogOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="producao" className="mt-6 h-[calc(100%-3rem)]">
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-6 text-center">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Em breve: análises automáticas da planilha de Produção.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="ferramentas" className="mt-6 h-[calc(100%-3rem)]">
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-6 text-center">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Em breve: insights cruzando Ferramentas e Correções.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    );
  }, [uploads.carteira, uploads.ferramentas, loading]);

  const handleFileChange = async (
    category: AnalysisCategory,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setSubmitting(true);
      const result = await uploadAnalysisExcel(category, file, authSession?.user?.id);
      setUploads((prev) => ({ ...prev, [category]: result }));
      toast({
        title: "Upload concluído",
        description: `${result.file_name} salvo para ${FILE_SLOTS.find((slot) => slot.key === category)?.label ?? category}.`,
      });
    } catch (error: any) {
      console.error("Erro no upload de planilha", error);
      toast({
        title: "Erro ao enviar arquivo",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async (category: AnalysisCategory) => {
    try {
      setDeletingCategory(category);
      await deleteAnalysisExcelUpload(category);
      setUploads((prev) => ({ ...prev, [category]: null }));
      toast({
        title: "Arquivo removido",
        description: `${FILE_SLOTS.find((slot) => slot.key === category)?.label ?? category} foi limpo.`,
      });
    } catch (error: any) {
      console.error("Erro ao remover planilha", error);
      toast({
        title: "Erro ao remover",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setDeletingCategory(null);
    }
  };

  const handleClearAll = async () => {
    const promises = FILE_SLOTS.map((slot) => deleteAnalysisExcelUpload(slot.key).catch(() => undefined));
    setSubmitting(true);
    try {
      await Promise.all(promises);
      setUploads(buildInitialState());
      toast({ title: "Planilhas removidas", description: "Todas as categorias foram limpas." });
    } catch (error: any) {
      toast({
        title: "Erro ao limpar tudo",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (open) fetchUploads();
      }}
    >
      <div className="relative h-full">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDialogOpen(true)}
            title="Carregar planilhas de análise"
            aria-label="Carregar planilhas de análise"
            disabled={loading}
          >
            <UploadCloud className="h-5 w-5" />
          </Button>
        </div>

        {mainContent}

        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Carregar planilhas de análise</DialogTitle>
            <DialogDescription>
              Selecione até quatro arquivos Excel (.xlsx ou .xls) para as categorias indicadas. Arquivos enviados
              são sobrescritos na próxima atualização.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {FILE_SLOTS.map(({ key, label }) => {
              const entry = uploads[key];
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`analysis-upload-${key}`} className="text-sm font-medium">
                      {label}
                    </Label>
                    {entry && (
                      <span className="text-xs text-muted-foreground" title={entry.file_name}>
                        {entry.file_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`analysis-upload-${key}`}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(event) => handleFileChange(key, event)}
                      disabled={submitting}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleClear(key)}
                      aria-label={`Limpar arquivo de ${label}`}
                      title={`Limpar arquivo de ${label}`}
                      disabled={!entry || deletingCategory === key || submitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {entry && (
                    <p className="text-xs text-muted-foreground">
                      Arquivo salvo com {formatBytes(entry.file_size)} — atualizado em {formatTimestamp(entry.uploaded_at)}.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={submitting || !hasFiles}
            >
              Limpar tudo
            </Button>
            <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </div>
    </Dialog>
  );
}
