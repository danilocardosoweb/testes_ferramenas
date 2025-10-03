import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { Matrix } from "@/types";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { getStatusFromLastEvent, daysSinceLastEvent, getCounts, computeDurations } from "@/utils/metrics";
import { v4 as uuidv4 } from "uuid";
import { getAuditLogs } from "@/services/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface ImportExportProps {
  matrices: Matrix[];
  onImport: (matrices: Matrix[]) => void;
}

export const ImportExport = ({ matrices, onImport }: ImportExportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [period, setPeriod] = useState<string>("last30");
  const [entityType, setEntityType] = useState<string>("__all__");
  const [q, setQ] = useState<string>("");
  const [viewer, setViewer] = useState<{ open: boolean; rows: any[] }>({ open: false, rows: [] });

  const computeRangeByPreset = () => {
    if (period === "custom") return { from, to };
    const today = new Date();
    const end = today.toISOString().split("T")[0];
    const startDate = new Date(today);
    if (period === "last7") startDate.setDate(today.getDate() - 7);
    else if (period === "last30") startDate.setDate(today.getDate() - 30);
    else if (period === "last90") startDate.setDate(today.getDate() - 90);
    else if (period === "thisMonth") { startDate.setDate(1); }
    const start = startDate.toISOString().split("T")[0];
    return { from: start, to: end };
  };

  const handleExportExcel = () => {
    // Sheet: Matrizes
    const sheetMatrices = matrices.map((m) => ({
      id: m.id,
      codigo: m.code,
      prioridade: m.priority ?? "",
      responsavel: m.responsible ?? "",
      pasta: m.folder ?? "",
      data_recebimento: new Date(m.receivedDate).toLocaleDateString("pt-BR"),
      status_atual: getStatusFromLastEvent(m),
      dias_sem_evento: daysSinceLastEvent(m),
    }));

    // Sheet: Eventos
    const rowsEventos = matrices.flatMap((m) =>
      m.events.map((e) => ({
        id_evento: e.id,
        id_matriz: m.id,
        codigo_matriz: m.code,
        data: new Date(e.date).toLocaleDateString("pt-BR"),
        tipo: e.type,
        responsavel: e.responsible ?? "",
        local: e.location ?? "",
        comentario: e.comment,
      })),
    );

    // Sheet: KPIs
    const sheetKPIs = matrices.map((m) => {
      const c = getCounts(m);
      // total dias em correção externa (somando trechos cujo 'from.type' é Correção Externa)
      const durations = computeDurations(m);
      const diasCorrecaoExterna = durations
        .filter((d) => d.from.type === "Correção Externa")
        .reduce((acc, d) => acc + d.days, 0);
      return {
        id: m.id,
        codigo: m.code,
        testes: c.tests,
        reprovacoes: c.rejects,
        correcoes: c.fixes,
        aprovacoes: c.approvals,
        dias_correcao_externa: diasCorrecaoExterna,
      };
    });

    const wb = XLSX.utils.book_new();
    const wsMatrices = XLSX.utils.json_to_sheet(sheetMatrices);
    const wsEventos = XLSX.utils.json_to_sheet(rowsEventos);
    const wsKPIs = XLSX.utils.json_to_sheet(sheetKPIs);

    XLSX.utils.book_append_sheet(wb, wsMatrices, "Matrizes");
    XLSX.utils.book_append_sheet(wb, wsEventos, "Eventos");
    XLSX.utils.book_append_sheet(wb, wsKPIs, "KPIs");

    XLSX.writeFile(wb, `relatorio_matrizes_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({
      title: "Exportação Excel concluída",
      description: "Arquivo .xlsx gerado com sucesso.",
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });

      // Preferir sheet "Eventos" se existir; caso contrário, usar a primeira
      const sheetName = wb.SheetNames.includes("Eventos") ? "Eventos" : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      // Função para normalizar datas (aceita DD/MM/AAAA ou AAAA-MM-DD)
      const toISO = (s: string): string => {
        const t = String(s).trim();
        // já é Date? (quando o Excel traz como número será convertido em data pela lib se formatado)
        if (t === "") return new Date().toISOString().split("T")[0];
        // dd/mm/aaaa
        const dm = t.match(/^([0-3]?\d)\/(0?\d|1[0-2])\/(\d{4})$/);
        if (dm) {
          const [_, d, m, y] = dm;
          const iso = new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toISOString().split("T")[0];
          return iso;
        }
        // aaaa-mm-dd
        const ym = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ym) return t;
        // fallback: tentar Date.parse
        const d2 = new Date(t);
        if (!isNaN(d2.getTime())) return d2.toISOString().split("T")[0];
        return new Date().toISOString().split("T")[0];
      };

      // Aceita colunas: codigo_matriz, data, tipo, responsavel, local, comentario
      // Agrupar por código
      const byCode = new Map<string, Matrix>();
      for (const r of rows) {
        const code = (r["codigo_matriz"] || r["codigo"] || r["matriz"] || "").toString().trim();
        if (!code) continue;
        const dateISO = toISO(r["data"] || r["data_evento"] || r["date"] || "");
        const type = (r["tipo"] || r["type"] || "Outro").toString().trim() || "Outro";
        const responsible = (r["responsavel"] || r["responsável"] || r["responsible"] || "").toString().trim() || undefined;
        const location = (r["local"] || r["location"] || "").toString().trim() || undefined;
        const comment = (r["comentario"] || r["comentário"] || r["comment"] || "").toString();

        if (!byCode.has(code)) {
          byCode.set(code, {
            id: uuidv4(),
            code,
            receivedDate: dateISO,
            events: [],
          });
        }
        const matrix = byCode.get(code)!;
        matrix.events.push({
          id: uuidv4(),
          date: dateISO,
          type,
          comment,
          responsible,
          location,
        });
        // ajustar receivedDate para a menor data
        if (new Date(dateISO) < new Date(matrix.receivedDate)) {
          matrix.receivedDate = dateISO;
        }
      }

      const importedData = Array.from(byCode.values()).map((m) => ({
        ...m,
        events: m.events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      }));

      onImport(importedData);
      toast({
        title: "Importação Excel concluída",
        description: `${importedData.length} matriz(es) importada(s) com sucesso.`,
      });
    } catch (error) {
      toast({
        title: "Erro na importação",
        description: "Não foi possível importar o arquivo Excel.",
        variant: "destructive",
      });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Importar / Exportar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={handleExportExcel}
          className="w-full"
          disabled={matrices.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar Excel (.xlsx)
        </Button>

        <Button
          onClick={handleImportClick}
          variant="outline"
          className="w-full"
        >
          <Upload className="mr-2 h-4 w-4" />
          Importar Excel (.xlsx)
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        <p className="text-xs text-muted-foreground mt-2">
          Exporte para Excel ou importe uma planilha no padrão exportado. Datas no Excel ficam no formato PT-BR (DD/MM/AAAA).
        </p>

        {/* Relatório de Log */}
        <div className="pt-4 border-t mt-4">
          <h3 className="font-semibold mb-2">Relatório de Log</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-44">
              <label className="text-xs text-muted-foreground">Período</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="last7">Últimos 7 dias</SelectItem>
                  <SelectItem value="last30">Últimos 30 dias</SelectItem>
                  <SelectItem value="last90">Últimos 90 dias</SelectItem>
                  <SelectItem value="thisMonth">Este mês</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">De</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded h-8 px-2" disabled={period !== 'custom'} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Até</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded h-8 px-2" disabled={period !== 'custom'} />
            </div>
            <div className="w-44">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="Matrix">Matrix</SelectItem>
                  <SelectItem value="Event">Event</SelectItem>
                  <SelectItem value="Folder">Folder</SelectItem>
                  <SelectItem value="Import">Import</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground">Buscar (ID ou texto)</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar..." className="border rounded h-8 px-2 w-full" />
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end w-full">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    const logs = await getAuditLogs();
                    const range = computeRangeByPreset();
                    const f = range.from ? new Date(range.from) : null;
                    const t = range.to ? new Date(range.to) : null;
                    const filtered = logs.filter((r) => {
                      const d = new Date(r.created_at);
                      const typeOk = entityType === '__all__' ? true : r.entity_type === entityType;
                      const text = (r.entity_id || '') + ' ' + JSON.stringify(r.payload || {});
                      const qOk = q.trim() ? text.toLowerCase().includes(q.trim().toLowerCase()) : true;
                      return (!f || d >= f) && (!t || d <= t) && typeOk && qOk;
                    });
                    setViewer({ open: true, rows: filtered.slice(0, 200) });
                  } catch (err: any) {
                    toast({ title: 'Erro ao carregar log', description: String(err?.message || err), variant: 'destructive' });
                  }
                }}
                className="h-8 w-full sm:w-auto"
              >
                Visualizar
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const logs = await getAuditLogs();
                    const range = computeRangeByPreset();
                    const f = range.from ? new Date(range.from) : null;
                    const t = range.to ? new Date(range.to) : null;
                    const filtered = logs.filter((r) => {
                      const d = new Date(r.created_at);
                      const typeOk = entityType === '__all__' ? true : r.entity_type === entityType;
                      const text = (r.entity_id || '') + ' ' + JSON.stringify(r.payload || {});
                      const qOk = q.trim() ? text.toLowerCase().includes(q.trim().toLowerCase()) : true;
                      return (!f || d >= f) && (!t || d <= t) && typeOk && qOk;
                    });
                    const rows = filtered.map((r) => ({
                      id: r.id,
                      data: new Date(r.created_at).toLocaleString('pt-BR'),
                      acao: r.action,
                      tipo: r.entity_type,
                      entidade: r.entity_id ?? '',
                      detalhes: JSON.stringify(r.payload ?? {}),
                    }));
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.json_to_sheet(rows);
                    XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
                    XLSX.writeFile(wb, `audit_log_${new Date().toISOString().split('T')[0]}.xlsx`);
                    toast({ title: 'Relatório de log (Excel)', description: `${rows.length} registro(s).` });
                  } catch (err: any) {
                    console.error(err);
                    toast({ title: 'Erro ao gerar Excel', description: String(err?.message || err), variant: 'destructive' });
                  }
                }}
                className="h-8 w-full sm:w-auto"
              >
                Exportar Log (.xlsx)
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const logs = await getAuditLogs();
                    const range = computeRangeByPreset();
                    const f = range.from ? new Date(range.from) : null;
                    const t = range.to ? new Date(range.to) : null;
                    const filtered = logs.filter((r) => {
                      const d = new Date(r.created_at);
                      const typeOk = entityType === '__all__' ? true : r.entity_type === entityType;
                      const text = (r.entity_id || '') + ' ' + JSON.stringify(r.payload || {});
                      const qOk = q.trim() ? text.toLowerCase().includes(q.trim().toLowerCase()) : true;
                      return (!f || d >= f) && (!t || d <= t) && typeOk && qOk;
                    });
                    const header = ["id","created_at","action","entity_type","entity_id","payload"];
                    const rows = filtered.map((r) => [
                      r.id,
                      new Date(r.created_at).toLocaleString("pt-BR"),
                      r.action,
                      r.entity_type,
                      r.entity_id ?? "",
                      JSON.stringify(r.payload ?? {}),
                    ]);
                    const csv = [header, ...rows]
                      .map((arr) => arr.map((v) => `"${String(v).replace(/\"/g,'""')}"`).join(";")).join("\n");
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `audit_log_${new Date().toISOString().split("T")[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ title: "Relatório de log gerado", description: `${filtered.length} registro(s).` });
                  } catch (err: any) {
                    console.error(err);
                    toast({ title: "Erro ao gerar log", description: String(err?.message || err), variant: "destructive" });
                  }
                }}
                className="h-8 w-full sm:w-auto"
              >
                Exportar Log (.csv)
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const logs = await getAuditLogs();
                    // Mostra últimos 10 no console para diagnóstico
                    const latest = logs.slice(0, 10);
                    console.table(latest.map(r => ({ id: r.id, created_at: r.created_at, action: r.action, entity_type: r.entity_type, entity_id: r.entity_id })));
                    toast({ title: 'Diagnóstico', description: `Últimos ${latest.length} registros impressos no console.` });
                  } catch (err: any) {
                    toast({ title: 'Erro no diagnóstico', description: String(err?.message || err), variant: 'destructive' });
                  }
                }}
                className="h-8 w-full sm:w-auto"
              >
                Diagnóstico
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">O log registra inclusões, atualizações, deleções, importações e movimentações de pasta.</p>
        </div>
      </CardContent>

      <Dialog open={viewer.open} onOpenChange={(open) => setViewer((v) => ({ ...v, open }))}>
        <DialogContent className="sm:max-w-3xl" aria-describedby="audit-log-desc">
          <DialogTitle>Relatório de Log</DialogTitle>
          <DialogDescription id="audit-log-desc">Lista de eventos de auditoria filtrados.</DialogDescription>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-1 px-2">Data</th>
                  <th className="py-1 px-2">Ação</th>
                  <th className="py-1 px-2">Tipo</th>
                  <th className="py-1 px-2">Entidade</th>
                  <th className="py-1 px-2">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {viewer.rows.map((r, i) => (
                  <tr key={r.id || i} className="border-t">
                    <td className="py-1 px-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                    <td className="py-1 px-2">{r.action}</td>
                    <td className="py-1 px-2">{r.entity_type}</td>
                    <td className="py-1 px-2">{r.entity_id || '-'}</td>
                    <td className="py-1 px-2 truncate max-w-[380px]" title={JSON.stringify(r.payload || {})}>
                      {JSON.stringify(r.payload || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
