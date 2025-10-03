import { useMemo, useState } from "react";
import { Matrix } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface MatrixDashboardProps {
  matrices: Matrix[];
  staleDaysThreshold?: number;
}

// Formata variação percentual entre dois períodos
function formatChangePct(curr: number, prev: number): string {
  if (prev === 0) {
    if (curr === 0) return "0%";
    return "+∞%"; // sem base comparativa
  }
  const diff = ((curr - prev) / prev) * 100;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

// Linha de distribuição simples para uma métrica numérica
function DistRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2">
      <div className="col-span-9 truncate text-sm" title={label}>{label}</div>
      <div className="col-span-3 text-right text-sm tabular-nums">{value}</div>
    </div>
  );
}

// Lista com barras proporcionais ao maior valor (ideal para médias)
function AvgBar({ items }: { items: [string, number][] }) {
  if (!items.length) return <div className="text-sm text-muted-foreground">Sem dados</div>;
  const max = Math.max(...items.map(([, v]) => v));
  return (
    <div className="space-y-2">
      {items.map(([label, v]) => {
        const pct = max ? Math.round((v / max) * 100) : 0;
        return (
          <div key={label} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-4 truncate text-sm" title={label}>{label}</div>
            <div className="col-span-7 h-3 bg-muted rounded">
              <div className="h-3 bg-primary rounded" style={{ width: `${pct}%` }} />
            </div>
            <div className="col-span-1 text-right text-sm tabular-nums">{v}</div>
          </div>
        );
      })}
    </div>
  );
}
export function MatrixDashboard({ matrices, staleDaysThreshold = 10 }: MatrixDashboardProps) {
  // Filtros
  const [codeFilter, setCodeFilter] = useState("");
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());

  // Pasta list derivada
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const m of matrices) set.add(m.folder || "(Sem pasta)");
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [matrices]);

  const toggleFolder = (f: string) => {
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  };

  const clearFilters = () => { setCodeFilter(""); setSelectedFolders(new Set()); };

  const scoped = useMemo(() => {
    const term = codeFilter.trim().toLowerCase();
    return matrices.filter(m => {
      const codeOk = term ? m.code.toLowerCase().includes(term) : true;
      const folderName = m.folder || "(Sem pasta)";
      const folderOk = selectedFolders.size > 0 ? selectedFolders.has(folderName) : true;
      return codeOk && folderOk;
    });
  }, [matrices, codeFilter, selectedFolders]);

  const data = useMemo(() => {
    const total = scoped.length;

    const byStatus = new Map<string, number>();
    const byFolder = new Map<string, number>();

    let stalled = 0; // paradas há > threshold
    let avgStale = 0;
    let staleCount = 0;

    let approvals = 0;
    let tests = 0;

    let recent7 = 0;
    let recent30 = 0;
    const today = new Date();
    const d7 = new Date(today); d7.setDate(today.getDate() - 7);
    const d30 = new Date(today); d30.setDate(today.getDate() - 30);

    // Novos acumuladores
    const folderLeadSum = new Map<string, number>();
    const folderLeadCount = new Map<string, number>();
    const approvalsByTestsOverall = { t1: 0, t2: 0, t3: 0, gt4: 0 };
    const approvalsByTestsPerFolder = new Map<string, { t1: number; t2: number; t3: number; gt4: number }>();

    for (const m of scoped) {
      // status
      const st = getStatusFromLastEvent(m);
      byStatus.set(st, (byStatus.get(st) || 0) + 1);

      // pasta
      const folder = m.folder || "(Sem pasta)";
      byFolder.set(folder, (byFolder.get(folder) || 0) + 1);

      // estagnação
      const stale = daysSinceLastEvent(m);
      if (stale > 0) {
        avgStale += stale;
        staleCount += 1;
        }

      // ===== Cálculos para novos indicadores por pasta =====
      const folderName = m.folder || "(Sem pasta)";
      const testsList = m.events.filter(e => e.type === 'Testes').sort((a, b) => a.date.localeCompare(b.date));
      const approvalsList = m.events.filter(e => e.type === 'Aprovado').sort((a, b) => a.date.localeCompare(b.date));
      const firstApproval = approvalsList[0] ? new Date(approvalsList[0].date) : null;
      if (firstApproval) {
        // lead time de aprovação (recebimento -> 1ª aprovação)
        const received = new Date(m.receivedDate);
        const lead = Math.max(0, Math.round((firstApproval.getTime() - received.getTime()) / 86400000));
        folderLeadSum.set(folderName, (folderLeadSum.get(folderName) || 0) + lead);
        folderLeadCount.set(folderName, (folderLeadCount.get(folderName) || 0) + 1);

        // número de testes até a 1ª aprovação
        const testsUpTo = testsList.filter(e => new Date(e.date) <= firstApproval).length;
        const bucket = testsUpTo <= 1 ? 't1' : testsUpTo === 2 ? 't2' : testsUpTo === 3 ? 't3' : 'gt4';
        approvalsByTestsOverall[bucket] += 1;
        const pf = approvalsByTestsPerFolder.get(folderName) || { t1: 0, t2: 0, t3: 0, gt4: 0 };
        pf[bucket] += 1;
        approvalsByTestsPerFolder.set(folderName, pf);
      }
      // marcar como parada se acima do threshold
      if (stale > staleDaysThreshold) stalled += 1;

      // contagens simples por tipo
      for (const e of m.events) {
        if (e.type === "Aprovado") approvals += 1;
        if (e.type === "Testes") tests += 1;

        const d = new Date(e.date);
        if (d >= d7) recent7 += 1;
        if (d >= d30) recent30 += 1;
      }
    }

    const avgStaleDays = staleCount ? Math.round(avgStale / staleCount) : 0;

    // === Novos Indicadores ===
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 1);
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const nextYearStart = new Date(today.getFullYear() + 1, 0, 1);
    const prevYearStart = new Date(today.getFullYear() - 1, 0, 1);
    const prevYearEnd = new Date(today.getFullYear(), 0, 1);
    const inMonth = (d: Date) => d >= monthStart && d < nextMonthStart;
    const inPrevMonth = (d: Date) => d >= prevMonthStart && d < prevMonthEnd;
    const inYear = (d: Date) => d >= yearStart && d < nextYearStart;
    const inPrevYear = (d: Date) => d >= prevYearStart && d < prevYearEnd;

    const approvalsThisMonth = scoped.reduce((acc, m) => acc + m.events.filter(e => e.type === 'Aprovado' && inMonth(new Date(e.date))).length, 0);
    const approvalsPrevMonth = scoped.reduce((acc, m) => acc + m.events.filter(e => e.type === 'Aprovado' && inPrevMonth(new Date(e.date))).length, 0);
    const approvalsThisYear = scoped.reduce((acc, m) => acc + m.events.filter(e => e.type === 'Aprovado' && inYear(new Date(e.date))).length, 0);
    const approvalsPrevYear = scoped.reduce((acc, m) => acc + m.events.filter(e => e.type === 'Aprovado' && inPrevYear(new Date(e.date))).length, 0);

    // Média de tempo de Aprovação (recebimento -> primeira aprovação)
    let sumApprovalDays = 0, countApproval = 0;
    // Lead recebimento -> 1º teste
    let sumRecvToFirstTest = 0, countRecvToFirstTest = 0;
    // Lead entre Correção Ext. Saída -> Entrada
    let sumCorrLead = 0, countCorrLead = 0;
    // Lead entre Limpeza Saída -> Entrada
    let sumCleanLead = 0, countCleanLead = 0;
    // Média de testes até aprovação
    let sumTestsToApproval = 0, countTestsToApproval = 0;

    const daysBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));

    for (const m of scoped) {
      const received = new Date(m.receivedDate);
      const testsList = m.events.filter(e => e.type === 'Testes').sort((a, b) => a.date.localeCompare(b.date));
      const firstTest = testsList[0] ? new Date(testsList[0].date) : null;
      if (firstTest) { sumRecvToFirstTest += daysBetween(received, firstTest); countRecvToFirstTest += 1; }

      const approvals = m.events.filter(e => e.type === 'Aprovado').sort((a, b) => a.date.localeCompare(b.date));
      const firstApproval = approvals[0] ? new Date(approvals[0].date) : null;
      if (firstApproval) { sumApprovalDays += daysBetween(received, firstApproval); countApproval += 1; }
      if (firstApproval) {
        // testes até a aprovação (<= data aprovação)
        const testsUpTo = testsList.filter(e => new Date(e.date) <= firstApproval).length;
        sumTestsToApproval += testsUpTo;
        countTestsToApproval += 1;
      }

      // Pairs Correção Externa (Saída, Entrada) por índice
      const corrOut = m.events.filter(e => e.type === 'Correção Externa Saída').sort((a, b) => a.date.localeCompare(b.date));
      const corrIn = m.events.filter(e => e.type === 'Correção Externa Entrada').sort((a, b) => a.date.localeCompare(b.date));
      const corrPairs = Math.min(corrOut.length, corrIn.length);
      for (let i = 0; i < corrPairs; i++) {
        const d1 = new Date(corrOut[i].date);
        const d2 = new Date(corrIn[i].date);
        if (d2 >= d1) { sumCorrLead += daysBetween(d1, d2); countCorrLead += 1; }
      }

      // Pairs Limpeza (Saída, Entrada)
      const cleanOut = m.events.filter(e => e.type === 'Limpeza Saída').sort((a, b) => a.date.localeCompare(b.date));
      const cleanIn = m.events.filter(e => e.type === 'Limpeza Entrada').sort((a, b) => a.date.localeCompare(b.date));
      const cleanPairs = Math.min(cleanOut.length, cleanIn.length);
      for (let i = 0; i < cleanPairs; i++) {
        const d1 = new Date(cleanOut[i].date);
        const d2 = new Date(cleanIn[i].date);
        if (d2 >= d1) { sumCleanLead += daysBetween(d1, d2); countCleanLead += 1; }
      }
    }

    const avgApprovalDays = countApproval ? Math.round(sumApprovalDays / countApproval) : 0;
    const avgRecvToFirstTest = countRecvToFirstTest ? Math.round(sumRecvToFirstTest / countRecvToFirstTest) : 0;
    const avgCorrLead = countCorrLead ? Math.round(sumCorrLead / countCorrLead) : 0;
    const avgCleanLead = countCleanLead ? Math.round(sumCleanLead / countCleanLead) : 0;
    const avgTestsToApproval = countTestsToApproval ? Number((sumTestsToApproval / countTestsToApproval).toFixed(2)) : 0;

    const statusTop = Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1]);
    const folderTop = Array.from(byFolder.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Médias por pasta
    const leadByFolder: [string, number][] = Array.from(folderLeadSum.entries()).map(([folder, sum]): [string, number] => {
      const count = folderLeadCount.get(folder) || 1;
      return [folder, Math.round(sum / count)] as [string, number];
    }).sort((a, b) => b[1] - a[1]);

    // Tabela por pasta para buckets de testes
    const approvalsByTestsFolderRows = Array.from(approvalsByTestsPerFolder.entries()).map(([folder, v]) => ({
      folder,
      t1: v.t1,
      t2: v.t2,
      t3: v.t3,
      gt4: v.gt4,
      total: v.t1 + v.t2 + v.t3 + v.gt4,
    })).sort((a, b) => b.total - a.total);

    return {
      total,
      statusTop,
      folderTop,
      stalled,
      avgStaleDays,
      approvals,
      tests,
      recent7,
      recent30,
      approvalsThisMonth,
      approvalsPrevMonth,
      approvalsThisYear,
      approvalsPrevYear,
      avgApprovalDays,
      avgRecvToFirstTest,
      avgCorrLead,
      avgCleanLead,
      avgTestsToApproval,
      // novos retornos
      leadByFolder,
      approvalsByTestsOverall,
      approvalsByTestsFolderRows,
    };
  }, [scoped, staleDaysThreshold]);

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-64 min-w-[220px]">
              <Input
                placeholder="Filtrar por código (ex.: TP-8215/004)"
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="flex-1 overflow-x-auto">
              <div className="flex items-center gap-2 w-max pr-2">
                {folders.map((f) => {
                  const active = selectedFolders.has(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleFolder(f)}
                      className={`h-8 px-3 rounded-full border text-sm whitespace-nowrap ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                      title={f}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              className="h-8 px-3 rounded border bg-muted hover:bg-muted/80 text-sm"
              onClick={clearFilters}
            >Limpar</button>
            <div className="text-sm text-muted-foreground ml-auto">
              Escopo: {scoped.length} de {matrices.length} matrizes
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Matrizes" value={data.total} />
        <MetricCard title={`Paradas > ${staleDaysThreshold}d`} value={data.stalled} />
        <MetricCard title="Média dias desde último evento" value={data.avgStaleDays} />
        <MetricCard title="Aprovados no mês" value={data.approvalsThisMonth} />
      </div>

      {/* Eventos recentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard title="Eventos últimos 7 dias" value={data.recent7} />
        <MetricCard title="Eventos últimos 30 dias" value={data.recent30} />
        <MetricCard title="Média testes até aprovação" value={data.avgTestsToApproval} />
      </div>

      {/* Leads médios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard title="Média tempo de aprovação (dias)" value={data.avgApprovalDays} />
        <MetricCard title="Lead: recebimento → 1º teste (dias)" value={data.avgRecvToFirstTest} />
        <MetricCard title="Lead: Corr. Ext. Saída → Entrada (dias)" value={data.avgCorrLead} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard title="Lead: Limpeza Saída → Entrada (dias)" value={data.avgCleanLead} />
        <MetricCard title="% Aprov. vs mês anterior" value={formatChangePct(data.approvalsThisMonth, data.approvalsPrevMonth)} />
        <MetricCard title="% Aprov. vs ano anterior" value={formatChangePct(data.approvalsThisYear, data.approvalsPrevYear)} />
      </div>

      {/* Distribuição de aprovações por nº de testes (geral) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle>Aprovações por nº de testes (geral)</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <DistRow label="1 teste" value={data.approvalsByTestsOverall.t1} />
              <DistRow label="2 testes" value={data.approvalsByTestsOverall.t2} />
              <DistRow label="3 testes" value={data.approvalsByTestsOverall.t3} />
              <DistRow label="> 4 testes" value={data.approvalsByTestsOverall.gt4} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle>Lead de aprovação por pasta (média dias)</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <AvgBar items={data.leadByFolder} />
          </CardContent>
        </Card>
      </div>

      {/* Por pasta: distribuição de aprovações por nº de testes */}
      <Card>
        <CardHeader className="pb-2"><CardTitle>Aprovações por nº de testes (por pasta)</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pasta</TableHead>
                  <TableHead className="text-right">1 teste</TableHead>
                  <TableHead className="text-right">2 testes</TableHead>
                  <TableHead className="text-right">3 testes</TableHead>
                  <TableHead className="text-right">&gt; 4 testes</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.approvalsByTestsFolderRows.map(row => (
                  <TableRow key={row.folder}>
                    <TableCell>{row.folder}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.t1}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.t2}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.t3}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.gt4}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.total}</TableCell>
                  </TableRow>
                ))}
                {data.approvalsByTestsFolderRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Sem dados</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle>Status (top) </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <SimpleBar items={data.statusTop} />
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle>Por Pasta (top 10)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <SimpleBar items={data.folderTop} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function SimpleBar({ items }: { items: [string, number][] }) {
  if (!items.length) return <div className="text-sm text-muted-foreground">Sem dados</div>;
  const total = items.reduce((acc, [, n]) => acc + n, 0);
  return (
    <div className="space-y-2">
      {items.map(([label, n]) => {
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={label} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-4 truncate text-sm" title={label}>{label}</div>
            <div className="col-span-7 h-3 bg-muted rounded">
              <div className="h-3 bg-primary rounded" style={{ width: `${pct}%` }} />
            </div>
            <div className="col-span-1 text-right text-sm tabular-nums">{n}</div>
          </div>
        );
      })}
    </div>
  );
}
