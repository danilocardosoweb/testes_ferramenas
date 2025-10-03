import { useMemo, useState } from "react";
import { Matrix } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";
import { Input } from "@/components/ui/input";

interface MatrixDashboardProps {
  matrices: Matrix[];
  staleDaysThreshold?: number;
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
    const inMonth = (d: Date) => d >= monthStart && d < nextMonthStart;

    const approvalsThisMonth = scoped.reduce((acc, m) => acc + m.events.filter(e => e.type === 'Aprovado' && inMonth(new Date(e.date))).length, 0);

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
      avgApprovalDays,
      avgRecvToFirstTest,
      avgCorrLead,
      avgCleanLead,
      avgTestsToApproval,
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
      </div>

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
