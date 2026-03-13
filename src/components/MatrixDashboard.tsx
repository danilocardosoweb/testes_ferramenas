import { useMemo, useState, useEffect } from "react";
import { Matrix } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStatusFromLastEvent, daysSinceLastEvent } from "@/utils/metrics";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listManufacturingRecords, calculateLeadTimeAverages } from "@/services/manufacturing";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Package, 
  Activity,
  Calendar,
  Target,
  Zap
} from "lucide-react";

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

function DistRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors">
      <span className="text-sm font-medium" title={label}>{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function AvgBar({ items }: { items: [string, number][] }) {
  if (!items.length) return <div className="text-sm text-muted-foreground text-center py-4">Sem dados disponíveis</div>;
  const max = Math.max(...items.map(([, v]) => v));
  return (
    <div className="space-y-3">
      {items.map(([label, v]) => {
        const pct = max ? Math.round((v / max) * 100) : 0;
        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate" title={label}>{label}</span>
              <span className="text-sm font-semibold tabular-nums ml-2">{v} dias</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-2 bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-300" 
                style={{ width: `${pct}%` }} 
              />
            </div>
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
  
  // Dados de manufatura para Lead Time
  const [manufLeadTimes, setManufLeadTimes] = useState<{
    needToPending: number | null;
    pendingToApproved: number | null;
    approvedToReceived: number | null;
    samplesNeedToPending: number;
    samplesPendingToApproved: number;
    samplesApprovedToReceived: number;
  } | null>(null);

  useEffect(() => {
    listManufacturingRecords().then(records => {
      const leadTimes = calculateLeadTimeAverages(records);
      setManufLeadTimes(leadTimes);
    }).catch(err => console.error("Erro ao carregar Lead Time de manufatura:", err));
  }, []);

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
    <div className="h-full flex flex-col gap-4">
      {/* Filtros */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="shrink-0 w-40 md:w-48 lg:w-56 min-w-[10rem] max-w-[14rem]">
              <Input
                placeholder="Filtrar por código (ex.: TP-8215/004)"
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value)}
                className="h-9 text-sm w-full"
              />
            </div>
            <div className="flex-1 overflow-x-auto pb-2">
              <div className="flex items-center gap-2 w-max pr-4 py-1 whitespace-nowrap">
                {folders.map((f) => {
                  const active = selectedFolders.has(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleFolder(f)}
                      className={`h-8 px-3 rounded-full border text-sm whitespace-nowrap transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                      title={f}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              className="h-8 px-3 rounded-md border bg-background hover:bg-muted text-sm transition-colors"
              onClick={clearFilters}
            >Limpar</button>
            <div className="text-sm text-muted-foreground ml-auto font-medium">
              {scoped.length} de {matrices.length} matrizes
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hero Cards - Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroCard 
          title="Total de Matrizes" 
          value={data.total} 
          icon={Package}
          trend={null}
          className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800"
        />
        <HeroCard 
          title="Aprovados no Mês" 
          value={data.approvalsThisMonth}
          icon={CheckCircle2}
          trend={data.approvalsPrevMonth > 0 ? ((data.approvalsThisMonth - data.approvalsPrevMonth) / data.approvalsPrevMonth * 100) : null}
          className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800"
        />
        <HeroCard 
          title={`Paradas > ${staleDaysThreshold} dias`}
          value={data.stalled}
          icon={AlertTriangle}
          trend={null}
          className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800"
        />
        <HeroCard 
          title="Média Dias Parado"
          value={data.avgStaleDays}
          icon={Clock}
          suffix=" dias"
          trend={null}
          className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800"
        />
      </div>

      {/* Atividade Recente */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">Atividade Recente</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Últimos 7 dias" value={data.recent7} icon={Calendar} />
            <StatCard title="Últimos 30 dias" value={data.recent30} icon={Calendar} />
            <StatCard title="Média Testes/Aprovação" value={data.avgTestsToApproval} icon={Target} />
          </div>
        </CardContent>
      </Card>

      {/* Lead Times - Manufatura */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">Lead Times - Manufatura</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <LeadTimeCard
              title="Necessidade → Solicitação"
              value={manufLeadTimes?.needToPending ?? null}
              samples={manufLeadTimes?.samplesNeedToPending}
            />
            <LeadTimeCard
              title="Solicitação → Em Fabricação"
              value={manufLeadTimes?.pendingToApproved ?? null}
              samples={manufLeadTimes?.samplesPendingToApproved}
            />
            <LeadTimeCard
              title="Em Fabricação → Recebida"
              value={manufLeadTimes?.approvedToReceived ?? null}
              samples={manufLeadTimes?.samplesApprovedToReceived}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lead Times - Processos */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">Lead Times - Processos</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Tempo de Aprovação" value={data.avgApprovalDays} suffix=" dias" icon={CheckCircle2} />
            <StatCard title="Recebimento → 1º Teste" value={data.avgRecvToFirstTest} suffix=" dias" icon={Activity} />
            <StatCard title="Correção Externa" value={data.avgCorrLead} suffix=" dias" icon={Clock} />
            <StatCard title="Limpeza" value={data.avgCleanLead} suffix=" dias" icon={Clock} />
          </div>
        </CardContent>
      </Card>

      {/* Performance Comparativa */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">Performance Comparativa</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ComparisonCard 
              title="Aprovações vs Mês Anterior"
              current={data.approvalsThisMonth}
              previous={data.approvalsPrevMonth}
            />
            <ComparisonCard 
              title="Aprovações vs Ano Anterior"
              current={data.approvalsThisYear}
              previous={data.approvalsPrevYear}
            />
            <StatCard 
              title="Total Aprovações (Ano)"
              value={data.approvalsThisYear}
              icon={CheckCircle2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Análise de Testes e Pastas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Aprovações por Nº de Testes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <DistRow label="1 teste" value={data.approvalsByTestsOverall.t1} />
              <DistRow label="2 testes" value={data.approvalsByTestsOverall.t2} />
              <DistRow label="3 testes" value={data.approvalsByTestsOverall.t3} />
              <DistRow label="> 4 testes" value={data.approvalsByTestsOverall.gt4} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Lead de Aprovação por Pasta</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[180px]">
              <AvgBar items={data.leadByFolder} />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Análise Detalhada por Pasta */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Análise Detalhada por Pasta</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold">Pasta</TableHead>
                  <TableHead className="text-right font-semibold">1 teste</TableHead>
                  <TableHead className="text-right font-semibold">2 testes</TableHead>
                  <TableHead className="text-right font-semibold">3 testes</TableHead>
                  <TableHead className="text-right font-semibold">&gt; 4 testes</TableHead>
                  <TableHead className="text-right font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.approvalsByTestsFolderRows.map(row => (
                  <TableRow key={row.folder} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{row.folder}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.t1}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.t2}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.t3}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.gt4}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{row.total}</TableCell>
                  </TableRow>
                ))}
                {data.approvalsByTestsFolderRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sem dados disponíveis</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Distribuição por Status e Pasta */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[250px]">
              <SimpleBar items={data.statusTop} />
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Top 10 Pastas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[250px]">
              <SimpleBar items={data.folderTop} />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HeroCard({ title, value, icon: Icon, trend, suffix = "", className = "" }: { 
  title: string; 
  value: number | string; 
  icon: any;
  trend?: number | null;
  suffix?: string;
  className?: string;
}) {
  const getTrendIcon = () => {
    if (trend === null || trend === undefined) return null;
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />;
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />;
    return <Minus className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
  };

  const getTrendColor = () => {
    if (trend === null || trend === undefined) return "text-muted-foreground";
    if (trend > 0) return "text-green-600 dark:text-green-400";
    if (trend < 0) return "text-red-600 dark:text-red-400";
    return "text-gray-600 dark:text-gray-400";
  };

  return (
    <Card className={`border shadow-sm ${className}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold tracking-tight">{value}{suffix}</h3>
              {trend !== null && trend !== undefined && (
                <div className="flex items-center gap-1">
                  {getTrendIcon()}
                  <span className={`text-sm font-medium ${getTrendColor()}`}>
                    {Math.abs(trend).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="p-3 bg-background/50 rounded-lg">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, icon: Icon, suffix = "" }: { 
  title: string; 
  value: number | string; 
  icon: any;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
      <div className="p-2 bg-primary/10 rounded-md">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-xl font-semibold">{value}{suffix}</p>
      </div>
    </div>
  );
}

function LeadTimeCard({ title, value, samples }: { title: string; value: number | null; samples?: number }) {
  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">{title}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold">{value ?? "-"}</p>
        {value !== null && <span className="text-sm text-muted-foreground">dias</span>}
      </div>
      {samples !== undefined && (
        <p className="text-xs text-muted-foreground mt-1">{samples} amostras</p>
      )}
    </div>
  );
}

function ComparisonCard({ title, current, previous }: { title: string; current: number; previous: number }) {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const isPositive = change > 0;
  const isNegative = change < 0;
  
  return (
    <div className="p-4 rounded-lg border bg-card">
      <p className="text-sm font-medium mb-3">{title}</p>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold">{current}</p>
          <p className="text-xs text-muted-foreground mt-1">vs {previous} anterior</p>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${
          isPositive ? "bg-green-100 dark:bg-green-950" : 
          isNegative ? "bg-red-100 dark:bg-red-950" : 
          "bg-gray-100 dark:bg-gray-800"
        }`}>
          {isPositive && <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />}
          {isNegative && <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />}
          {!isPositive && !isNegative && <Minus className="h-4 w-4 text-gray-600 dark:text-gray-400" />}
          <span className={`text-sm font-semibold ${
            isPositive ? "text-green-600 dark:text-green-400" : 
            isNegative ? "text-red-600 dark:text-red-400" : 
            "text-gray-600 dark:text-gray-400"
          }`}>
            {change > 0 ? "+" : ""}{change.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function SimpleBar({ items }: { items: [string, number][] }) {
  if (!items.length) return <div className="text-sm text-muted-foreground text-center py-4">Sem dados disponíveis</div>;
  const total = items.reduce((acc, [, n]) => acc + n, 0);
  return (
    <div className="space-y-3">
      {items.map(([label, n]) => {
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate" title={label}>{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{pct}%</span>
                <span className="text-sm font-semibold tabular-nums">{n}</span>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-2 bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-300" 
                style={{ width: `${pct}%` }} 
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
