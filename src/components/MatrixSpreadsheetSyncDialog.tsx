import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, ShieldCheck, Upload } from "lucide-react";
import { Matrix } from "@/types";
import {
  buildSpreadsheetSyncPlan,
  executeSpreadsheetSync,
  SpreadsheetSyncPlan,
  SpreadsheetSyncResult,
} from "@/services/matrixSpreadsheetSync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

type MatrixSpreadsheetSyncDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrices: Matrix[];
  onCompleted?: () => Promise<void> | void;
};

export function MatrixSpreadsheetSyncDialog({
  open,
  onOpenChange,
  matrices,
  onCompleted,
}: MatrixSpreadsheetSyncDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [plan, setPlan] = useState<SpreadsheetSyncPlan | null>(null);
  const [result, setResult] = useState<SpreadsheetSyncResult | null>(null);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [includeNewActive, setIncludeNewActive] = useState(true);
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setPlan(null);
    setResult(null);
    setError("");
    setProgress(0);
    setIncludeNewActive(true);
  };

  const handleFile = async (file: File) => {
    setAnalyzing(true);
    setError("");
    setResult(null);
    try {
      setPlan(await buildSpreadsheetSyncPlan(file, matrices));
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSync = async () => {
    if (!plan) return;
    setSyncing(true);
    setError("");
    setProgress(0);
    try {
      const syncResult = await executeSpreadsheetSync(
        plan,
        { includeNewActiveMatrices: includeNewActive },
        (completed, total) => setProgress(total > 0 ? Math.round((completed / total) * 100) : 100),
      );
      setResult(syncResult);
      await onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const conflicts = plan?.items.flatMap((item) =>
    item.events
      .filter((event) => event.action === "conflict")
      .map((event) => ({ code: item.code, label: event.comment, app: event.databaseDate, sheet: event.date }))
  ) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen && !syncing) reset();
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Atualizar eventos por planilha
          </DialogTitle>
          <DialogDescription>
            Primeiro analisamos o arquivo. A atualização acrescenta dados ausentes e nunca substitui divergências automaticamente.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />

        {!plan && !analyzing && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="min-h-64 rounded-xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-emerald-50/60 p-8 text-center transition-colors hover:border-emerald-500"
          >
            <Upload className="mx-auto mb-4 h-10 w-10 text-emerald-600" />
            <span className="block text-base font-semibold text-slate-900">Selecionar planilha de controle</span>
            <span className="mt-2 block text-sm text-slate-600">Formatos aceitos: XLSX ou XLS</span>
          </button>
        )}

        {analyzing && (
          <div className="min-h-64 flex flex-col items-center justify-center gap-3 text-slate-600">
            <Loader2 className="h-9 w-9 animate-spin text-emerald-600" />
            <span>Analisando códigos, datas e divergências...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        {plan && !result && (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SummaryCard label="Já cadastradas" value={plan.summary.existingMatrices} tone="blue" />
                <SummaryCard label="Eventos a incluir" value={plan.summary.eventsToInsert} tone="green" />
                <SummaryCard label="Novas em andamento" value={plan.summary.newActiveMatrices} tone="amber" />
                <SummaryCard label="Histórico ignorado" value={plan.summary.historicalSkipped} tone="slate" />
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-emerald-950">Proteções desta atualização</p>
                    <p className="mt-1 text-sm text-emerald-900">
                      {plan.summary.identicalEvents} eventos iguais serão mantidos. {plan.summary.eventConflicts} divergências de eventos
                      e {plan.summary.receivedDateConflicts} divergências de recebimento ficarão bloqueadas para revisão.
                    </p>
                  </div>
                </div>
              </div>

              {plan.summary.newActiveMatrices > 0 && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
                  <Checkbox
                    checked={includeNewActive}
                    onCheckedChange={(checked) => setIncludeNewActive(checked === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium">Cadastrar ferramentas novas ainda em andamento</span>
                    <span className="block text-sm text-slate-600">
                      Inclui somente {plan.summary.newActiveMatrices} ferramenta(s) sem aprovação e com status ativo de teste, correção,
                      limpeza, prensa ou nitretação.
                    </span>
                  </span>
                </label>
              )}

              {conflicts.length > 0 && (
                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b bg-amber-50 px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold text-amber-950">
                      <AlertTriangle className="h-4 w-4" />
                      Divergências bloqueadas
                    </div>
                    <Badge variant="outline">{conflicts.length}</Badge>
                  </div>
                  <div className="max-h-52 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white text-left text-slate-600">
                        <tr>
                          <th className="px-4 py-2">Ferramenta</th>
                          <th className="px-4 py-2">Campo</th>
                          <th className="px-4 py-2">Aplicativo</th>
                          <th className="px-4 py-2">Planilha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conflicts.map((conflict, index) => (
                          <tr key={`${conflict.code}-${conflict.label}-${index}`} className="border-t">
                            <td className="px-4 py-2 font-medium">{conflict.code}</td>
                            <td className="px-4 py-2">{conflict.label}</td>
                            <td className="px-4 py-2">{formatDate(conflict.app)}</td>
                            <td className="px-4 py-2">{formatDate(conflict.sheet)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {plan.warnings.length > 0 && (
                <p className="text-xs text-slate-500">
                  {plan.warnings.length} valor(es) inválido(s) ou incompleto(s) foram ignorados e não serão enviados ao aplicativo.
                </p>
              )}
            </div>
          </ScrollArea>
        )}

        {syncing && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Atualizando dados seguros...</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h3 className="mt-3 text-lg font-semibold text-emerald-950">Atualização concluída</h3>
            <p className="mt-2 text-sm text-emerald-900">
              {result.eventsInserted} evento(s) incluído(s), {result.matricesCreated} ferramenta(s) cadastrada(s) e{" "}
              {result.skippedConflicts} divergência(s) preservada(s) sem alteração.
            </p>
            {result.failures.length > 0 && (
              <p className="mt-3 text-sm text-red-700">{result.failures.length} ferramenta(s) precisam de revisão manual.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={analyzing || syncing}>
            {plan ? "Trocar arquivo" : "Selecionar arquivo"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={syncing}>
              {result ? "Fechar" : "Cancelar"}
            </Button>
            {plan && !result && (
              <Button onClick={handleSync} disabled={syncing} className="bg-emerald-700 hover:bg-emerald-800">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Atualizar somente dados seguros
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "blue" | "green" | "amber" | "slate" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
