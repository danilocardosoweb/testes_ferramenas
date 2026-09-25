import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Package,
  Search,
  Target,
  Wrench,
  Zap,
} from "lucide-react";
import { Matrix, MatrixEvent } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listManufacturingRecords, calculateLeadTimeAverages } from "@/services/manufacturing";
import { formatToBR, parseDateOnlyLocal } from "@/utils/dateUtils";
import {
  getApprovalEvent,
  isApprovalEvent,
  isMatrixApproved,
  normalizeMatrixCode,
} from "@/utils/matrixLifecycle";

interface MatrixDashboardProps {
  matrices: Matrix[];
  staleDaysThreshold?: number;
}

type ToolKind = "all" | "f1" | "replacement";
type PeriodMode = "month" | "year" | "custom" | "all";
type DateBasis = "received" | "approval" | "last_event";
type ToolMetrics = ReturnType<typeof calculateMetrics>;

const DAY_MS = 86_400_000;
const MONTHS = [
  ["01", "Janeiro"],
  ["02", "Fevereiro"],
  ["03", "Março"],
  ["04", "Abril"],
  ["05", "Maio"],
  ["06", "Junho"],
  ["07", "Julho"],
  ["08", "Agosto"],
  ["09", "Setembro"],
  ["10", "Outubro"],
  ["11", "Novembro"],
  ["12", "Dezembro"],
] as const;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sequenceFromCode(code: string): number | null {
  const match = code.trim().match(/\/\s*0*(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function kindFromCode(code: string): Exclude<ToolKind, "all"> | "unknown" {
  const sequence = sequenceFromCode(code);
  if (sequence === 1) return "f1";
  if (sequence !== null && sequence >= 2) return "replacement";
  return "unknown";
}

function isTest(event: MatrixEvent): boolean {
  return normalize(event.type).includes("teste");
}

function daysBetweenISO(from: string, to: string): number {
  const start = parseDateOnlyLocal(from);
  const end = parseDateOnlyLocal(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

function latestEvent(matrix: Matrix): MatrixEvent | null {
  return [...(matrix.events || [])].sort(
    (a, b) =>
      b.date.localeCompare(a.date)
      || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  )[0] ?? null;
}

function latestOperationalDate(matrix: Matrix): string {
  const latest = latestEvent(matrix)?.date;
  return latest && latest > matrix.receivedDate ? latest : matrix.receivedDate;
}

function outsideStage(matrix: Matrix, todayISO: string): {
  kind: "correction" | "cleaning";
  since: string;
  days: number;
} | null {
  const last = latestEvent(matrix);
  if (!last) return null;
  const type = normalize(last.type);

  if (type.includes("correcao externa saida")) {
    return { kind: "correction", since: last.date, days: daysBetweenISO(last.date, todayISO) };
  }
  if (type.includes("limpeza saida")) {
    return { kind: "cleaning", since: last.date, days: daysBetweenISO(last.date, todayISO) };
  }
  return null;
}

function approvalDate(matrix: Matrix): string | null {
  return getApprovalEvent(matrix)?.date ?? null;
}

function referenceDate(matrix: Matrix, basis: DateBasis): string | null {
  if (basis === "received") return matrix.receivedDate || null;
  if (basis === "approval") return approvalDate(matrix);
  return latestEvent(matrix)?.date ?? matrix.receivedDate ?? null;
}

function isInPeriod(
  matrix: Matrix,
  mode: PeriodMode,
  basis: DateBasis,
  year: string,
  month: string,
  range: { start: string; end: string },
): boolean {
  if (mode === "all") return true;
  const date = referenceDate(matrix, basis);
  if (!date) return false;
  if (mode === "year") return date.startsWith(year);
  if (mode === "month") return date.startsWith(`${year}-${month}`);
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function nextAction(matrix: Matrix): string {
  const events = matrix.events || [];
  if (isMatrixApproved(matrix)) return "Concluída";
  const tests = events.filter(isTest).length;
  const lastType = normalize(latestEvent(matrix)?.type ?? "");
  if (lastType.includes("correcao externa saida")) return "Cobrar retorno da correção";
  if (lastType.includes("limpeza saida")) return "Cobrar retorno da limpeza";
  if (lastType.includes("correcao") || lastType.includes("limpeza")) return "Programar novo teste";
  if (tests === 0) return "Programar 1º teste";
  return `Definir ação após ${tests}º teste`;
}

function consolidateMatrices(matrices: Matrix[]): Matrix[] {
  const consolidated = new Map<string, Matrix>();

  for (const matrix of matrices) {
    const key = normalizeMatrixCode(matrix.code) ?? `id:${matrix.id}`;
    const existing = consolidated.get(key);
    if (!existing) {
      consolidated.set(key, {
        ...matrix,
        code: normalizeMatrixCode(matrix.code) ?? matrix.code,
        events: [...(matrix.events || [])],
      });
      continue;
    }

    const events = new Map(existing.events.map((event) => [event.id, event]));
    (matrix.events || []).forEach((event) => events.set(event.id, event));
    consolidated.set(key, {
      ...existing,
      receivedDate: [existing.receivedDate, matrix.receivedDate]
        .filter(Boolean)
        .sort()[0] ?? existing.receivedDate,
      events: [...events.values()].sort((a, b) =>
        a.date.localeCompare(b.date) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
      ),
    });
  }

  return [...consolidated.values()];
}

function calculateMetrics(matrices: Matrix[], staleDaysThreshold: number, todayISO: string) {
  let approved = 0;
  let waitingFirstTest = 0;
  let inTests = 0;
  let inCorrection = 0;
  let stalled = 0;
  let approvalDaysTotal = 0;
  let approvalDaysCount = 0;
  let firstTestDaysTotal = 0;
  let firstTestDaysCount = 0;
  let testsToApprovalTotal = 0;
  let approvedWithTests = 0;
  let firstPass = 0;
  let openDaysTotal = 0;
  let outsideCount = 0;
  let outsideDaysTotal = 0;
  let outsideOverThreshold = 0;

  for (const matrix of matrices) {
    const events = matrix.events || [];
    const tests = events.filter(isTest).sort((a, b) => a.date.localeCompare(b.date));
    const approval = getApprovalEvent(matrix);
    const lastType = normalize(latestEvent(matrix)?.type ?? "");
    const isApproved = Boolean(approval);

    if (isApproved) {
      approved += 1;
      approvalDaysTotal += daysBetweenISO(matrix.receivedDate, approval.date);
      approvalDaysCount += 1;
      testsToApprovalTotal += tests.filter((event) => event.date <= approval.date).length;
      approvedWithTests += 1;
      if (tests.filter((event) => event.date <= approval.date).length <= 1) firstPass += 1;
    } else {
      if (tests.length === 0) waitingFirstTest += 1;
      else inTests += 1;
      if (lastType.includes("correcao") || lastType.includes("limpeza")) inCorrection += 1;
      if (daysBetweenISO(latestOperationalDate(matrix), todayISO) > staleDaysThreshold) stalled += 1;
      openDaysTotal += daysBetweenISO(matrix.receivedDate, todayISO);

      const outside = outsideStage(matrix, todayISO);
      if (outside) {
        outsideCount += 1;
        outsideDaysTotal += outside.days;
        if (outside.days > staleDaysThreshold) outsideOverThreshold += 1;
      }
    }

    if (tests[0]) {
      firstTestDaysTotal += daysBetweenISO(matrix.receivedDate, tests[0].date);
      firstTestDaysCount += 1;
    }
  }

  const total = matrices.length;
  const open = total - approved;
  return {
    total,
    approved,
    open,
    waitingFirstTest,
    inTests,
    inCorrection,
    stalled,
    approvalRate: total ? Math.round((approved / total) * 100) : 0,
    avgApprovalDays: approvalDaysCount ? Math.round(approvalDaysTotal / approvalDaysCount) : 0,
    avgFirstTestDays: firstTestDaysCount ? Math.round(firstTestDaysTotal / firstTestDaysCount) : 0,
    avgOpenDays: open ? Math.round(openDaysTotal / open) : 0,
    outsideCount,
    avgOutsideDays: outsideCount ? Math.round(outsideDaysTotal / outsideCount) : 0,
    outsideOverThreshold,
    avgTestsToApproval: approvedWithTests
      ? Number((testsToApprovalTotal / approvedWithTests).toFixed(1))
      : 0,
    firstPassRate: approvedWithTests ? Math.round((firstPass / approvedWithTests) * 100) : 0,
  };
}

export function MatrixDashboard({ matrices, staleDaysThreshold = 10 }: MatrixDashboardProps) {
  const currentDate = useMemo(() => new Date(), []);
  const currentYear = String(currentDate.getFullYear());
  const currentMonth = String(currentDate.getMonth() + 1).padStart(2, "0");
  const [kind, setKind] = useState<ToolKind>("all");
  const [codeFilter, setCodeFilter] = useState("");
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("year");
  const [dateBasis, setDateBasis] = useState<DateBasis>("received");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [customStart, setCustomStart] = useState(`${currentYear}-01-01`);
  const [customEnd, setCustomEnd] = useState(
    `${currentYear}-${currentMonth}-${String(currentDate.getDate()).padStart(2, "0")}`,
  );
  const [manufacturingLeadTimes, setManufacturingLeadTimes] = useState<{
    needToPending: number | null;
    pendingToApproved: number | null;
    approvedToReceived: number | null;
    samplesNeedToPending: number;
    samplesPendingToApproved: number;
    samplesApprovedToReceived: number;
  } | null>(null);

  useEffect(() => {
    listManufacturingRecords()
      .then((records) => setManufacturingLeadTimes(calculateLeadTimeAverages(records)))
      .catch((error) => console.error("Erro ao carregar lead times:", error));
  }, []);

  const dashboardMatrices = useMemo(() => consolidateMatrices(matrices), [matrices]);
  const duplicateMatrixRecords = matrices.length - dashboardMatrices.length;

  const todayISO = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const folders = useMemo(() => {
    return [...new Set(dashboardMatrices.map((matrix) => matrix.folder || "(Sem pasta)"))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dashboardMatrices]);

  const availableYears = useMemo(() => {
    const years = new Set<string>([currentYear]);
    dashboardMatrices.forEach((matrix) => {
      const date = referenceDate(matrix, dateBasis);
      if (date?.length >= 4) years.add(date.slice(0, 4));
    });
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [dashboardMatrices, dateBasis, currentYear]);

  const normalizedCustomRange = useMemo(() => {
    if (!customStart || !customEnd) return { start: customStart, end: customEnd };
    return customStart <= customEnd
      ? { start: customStart, end: customEnd }
      : { start: customEnd, end: customStart };
  }, [customStart, customEnd]);

  const baseScoped = useMemo(() => {
    const term = codeFilter.trim().toLowerCase();
    return dashboardMatrices.filter((matrix) => {
      const folder = matrix.folder || "(Sem pasta)";
      return (!term || matrix.code.toLowerCase().includes(term))
        && (selectedFolders.size === 0 || selectedFolders.has(folder))
        && isInPeriod(
          matrix,
          periodMode,
          dateBasis,
          selectedYear,
          selectedMonth,
          normalizedCustomRange,
        );
    });
  }, [
    dashboardMatrices,
    codeFilter,
    selectedFolders,
    periodMode,
    dateBasis,
    selectedYear,
    selectedMonth,
    normalizedCustomRange,
  ]);

  const excludedWithoutReferenceDate = useMemo(() => {
    if (periodMode === "all") return 0;
    const term = codeFilter.trim().toLowerCase();
    return dashboardMatrices.filter((matrix) => {
      const folder = matrix.folder || "(Sem pasta)";
      return (!term || matrix.code.toLowerCase().includes(term))
        && (selectedFolders.size === 0 || selectedFolders.has(folder))
        && !referenceDate(matrix, dateBasis);
    }).length;
  }, [dashboardMatrices, codeFilter, selectedFolders, periodMode, dateBasis]);

  const periodSummary = useMemo(() => {
    const basisLabel = dateBasis === "received"
      ? "recebimento"
      : dateBasis === "approval"
        ? "aprovação"
        : "último evento";
    if (periodMode === "all") return `Todo o histórico por ${basisLabel}`;
    if (periodMode === "year") return `Ano ${selectedYear} por ${basisLabel}`;
    if (periodMode === "month") {
      const month = MONTHS.find(([value]) => value === selectedMonth)?.[1] ?? selectedMonth;
      return `${month} de ${selectedYear} por ${basisLabel}`;
    }
    const start = normalizedCustomRange.start ? formatToBR(normalizedCustomRange.start) : "início";
    const end = normalizedCustomRange.end ? formatToBR(normalizedCustomRange.end) : "hoje";
    return `${start} a ${end} por ${basisLabel}`;
  }, [periodMode, dateBasis, selectedYear, selectedMonth, normalizedCustomRange]);

  const scoped = useMemo(() => {
    if (kind === "all") return baseScoped;
    return baseScoped.filter((matrix) => kindFromCode(matrix.code) === kind);
  }, [baseScoped, kind]);

  const metrics = useMemo(
    () => calculateMetrics(scoped, staleDaysThreshold, todayISO),
    [scoped, staleDaysThreshold, todayISO],
  );
  const f1Metrics = useMemo(
    () => calculateMetrics(baseScoped.filter((matrix) => kindFromCode(matrix.code) === "f1"), staleDaysThreshold, todayISO),
    [baseScoped, staleDaysThreshold, todayISO],
  );
  const replacementMetrics = useMemo(
    () => calculateMetrics(baseScoped.filter((matrix) => kindFromCode(matrix.code) === "replacement"), staleDaysThreshold, todayISO),
    [baseScoped, staleDaysThreshold, todayISO],
  );

  const criticalQueue = useMemo(() => {
    return scoped
      .filter((matrix) => !isMatrixApproved(matrix))
      .map((matrix) => {
        const outside = outsideStage(matrix, todayISO);
        const inactiveDays = daysBetweenISO(latestOperationalDate(matrix), todayISO);
        const approvalWaitingDays = daysBetweenISO(matrix.receivedDate, todayISO);
        const last = latestEvent(matrix);
        const urgencyDays = Math.max(inactiveDays, outside?.days ?? 0);
        return {
          matrix,
          inactiveDays,
          approvalWaitingDays,
          outside,
          urgency:
            urgencyDays >= 30 || approvalWaitingDays >= 75
              ? "Crítica"
              : urgencyDays >= 15 || approvalWaitingDays >= 45
                ? "Alta"
                : "Atenção",
          tests: (matrix.events || []).filter(isTest).length,
          lastDate: latestOperationalDate(matrix),
          responsible: last?.responsible || matrix.responsible || "Não informado",
          action: nextAction(matrix),
        };
      })
      .filter((item) => item.inactiveDays > staleDaysThreshold)
      .sort((a, b) =>
        (b.outside?.days ?? 0) - (a.outside?.days ?? 0)
        || b.inactiveDays - a.inactiveDays
        || b.approvalWaitingDays - a.approvalWaitingDays
      )
      .slice(0, 10);
  }, [scoped, staleDaysThreshold, todayISO]);

  const pipeline = useMemo(() => {
    const values = [
      { label: "Sem teste", value: metrics.waitingFirstTest, color: "bg-amber-500" },
      {
        label: "1º teste",
        value: scoped.filter((matrix) => !isMatrixApproved(matrix) && matrix.events.filter(isTest).length === 1).length,
        color: "bg-sky-500",
      },
      {
        label: "2º teste",
        value: scoped.filter((matrix) => !isMatrixApproved(matrix) && matrix.events.filter(isTest).length === 2).length,
        color: "bg-blue-600",
      },
      {
        label: "3º teste ou mais",
        value: scoped.filter((matrix) => !isMatrixApproved(matrix) && matrix.events.filter(isTest).length >= 3).length,
        color: "bg-orange-600",
      },
      { label: "Aprovadas", value: metrics.approved, color: "bg-emerald-600" },
    ];
    const max = Math.max(1, ...values.map((item) => item.value));
    return values.map((item) => ({ ...item, percent: Math.round((item.value / max) * 100) }));
  }, [metrics, scoped]);

  const monthlyApprovals = useMemo(() => {
    const current = new Date();
    return Array.from({ length: 6 }, (_, offset) => {
      const date = new Date(current.getFullYear(), current.getMonth() - (5 - offset), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthMatrices = baseScoped.filter((matrix) =>
        matrix.events.some((event) => isApprovalEvent(event) && event.date.startsWith(key))
      );
      return {
        key,
        label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
        f1: monthMatrices.filter((matrix) => kindFromCode(matrix.code) === "f1").length,
        replacement: monthMatrices.filter((matrix) => kindFromCode(matrix.code) === "replacement").length,
      };
    });
  }, [baseScoped]);

  const maxMonthly = Math.max(1, ...monthlyApprovals.map((month) => month.f1 + month.replacement));
  const unknownCodes = baseScoped.filter((matrix) => kindFromCode(matrix.code) === "unknown").length;

  const toggleFolder = (folder: string) => {
    setSelectedFolders((current) => {
      const next = new Set(current);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  return (
    <div className="min-h-full space-y-4 bg-[radial-gradient(circle_at_top_right,_rgba(15,118,110,0.10),_transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef4f3_100%)] p-1 md:p-3">
      <section className="overflow-hidden rounded-2xl bg-[#123047] text-white shadow-sm">
        <div className="grid gap-5 p-5 md:grid-cols-[1.4fr_1fr] md:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Central de decisão</p>
            <h1 className="mt-2 text-2xl font-semibold md:text-3xl">Desempenho das ferramentas</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Compare as primeiras ferramentas com as reposições e veja rapidamente onde o processo está parado.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DefinitionCard title="F1" value="/001" description="Primeira ferramenta confeccionada" />
            <DefinitionCard title="Reposição" value="/002+" description="Substituição por desgaste ou afastamento" />
          </div>
        </div>
      </section>

      <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="inline-flex w-fit rounded-lg bg-slate-100 p-1">
              {([
                ["all", "Todas"],
                ["f1", "F1 · /001"],
                ["replacement", "Reposição · /002+"],
              ] as Array<[ToolKind, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    kind === value ? "bg-[#123047] text-white shadow-sm" : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={codeFilter}
                onChange={(event) => setCodeFilter(event.target.value)}
                placeholder="Buscar ferramenta..."
                className="h-9 bg-white pl-9"
              />
            </div>
            <div className="text-sm font-medium text-slate-600">
              {scoped.length} ferramenta(s) na visão
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CalendarDays className="h-4 w-4 text-emerald-700" />
              Período da análise
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <Select value={dateBasis} onValueChange={(value) => setDateBasis(value as DateBasis)}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Por recebimento</SelectItem>
                  <SelectItem value="approval">Por aprovação</SelectItem>
                  <SelectItem value="last_event">Por último evento</SelectItem>
                </SelectContent>
              </Select>

              <Select value={periodMode} onValueChange={(value) => setPeriodMode(value as PeriodMode)}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Acompanhar mês</SelectItem>
                  <SelectItem value="year">Visualizar ano</SelectItem>
                  <SelectItem value="custom">Intervalo de datas</SelectItem>
                  <SelectItem value="all">Todo o histórico</SelectItem>
                </SelectContent>
              </Select>

              {(periodMode === "year" || periodMode === "month") && (
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {periodMode === "month" && (
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {periodMode === "custom" && (
                <>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(event) => setCustomStart(event.target.value)}
                    aria-label="Data inicial"
                    className="h-9 bg-white"
                  />
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(event) => setCustomEnd(event.target.value)}
                    aria-label="Data final"
                    className="h-9 bg-white"
                  />
                </>
              )}

              <div className="flex min-h-9 items-center text-xs text-slate-600 sm:col-span-2 xl:col-span-2">
                <span className="font-medium">{periodSummary}</span>
                {excludedWithoutReferenceDate > 0 && (
                  <span className="ml-2 text-amber-700">
                    ({excludedWithoutReferenceDate} sem essa data)
                  </span>
                )}
                {duplicateMatrixRecords > 0 && (
                  <span className="ml-2 text-sky-700">
                    ({duplicateMatrixRecords} registro(s) duplicado(s) consolidado(s))
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => toggleFolder(folder)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedFolders.has(folder)
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                {folder}
              </button>
            ))}
            {(codeFilter || selectedFolders.size > 0 || kind !== "all" || periodMode !== "year"
              || dateBasis !== "received" || selectedYear !== currentYear) && (
              <button
                type="button"
                onClick={() => {
                  setKind("all");
                  setCodeFilter("");
                  setSelectedFolders(new Set());
                  setPeriodMode("year");
                  setDateBasis("received");
                  setSelectedYear(currentYear);
                  setSelectedMonth(currentMonth);
                }}
                className="shrink-0 px-2 text-xs font-semibold text-red-700"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <DecisionCard
          title="Em acompanhamento"
          value={metrics.open}
          helper={`${metrics.total} no total da visão`}
          icon={Package}
          tone="blue"
        />
        <DecisionCard
          title="Aguardando 1º teste"
          value={metrics.waitingFirstTest}
          helper="Recebidas sem teste"
          icon={Target}
          tone="amber"
        />
        <DecisionCard
          title="Média aguardando aprovação"
          value={metrics.avgOpenDays}
          helper="dias desde o recebimento na fila atual"
          icon={Clock}
          tone="cyan"
        />
        <DecisionCard
          title="Fora para correção/limpeza"
          value={metrics.outsideCount}
          helper={metrics.outsideCount ? `média de ${metrics.avgOutsideDays} dias fora` : "Nenhuma ferramenta fora"}
          icon={Wrench}
          tone="amber"
        />
        <DecisionCard
          title={`Cobranças +${staleDaysThreshold} dias`}
          value={metrics.outsideOverThreshold}
          helper={metrics.outsideOverThreshold ? "Retornos que precisam ser cobrados" : "Nenhum retorno vencido"}
          icon={AlertTriangle}
          tone="red"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-slate-900">F1 x Reposição</CardTitle>
            <p className="text-sm text-slate-500">Comparação considerando todos os filtros ativos.</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-3">Indicador</th>
                    <th className="py-3 text-right">F1 · /001</th>
                    <th className="py-3 text-right">Reposição · /002+</th>
                    <th className="py-3 pl-5">Leitura rápida</th>
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow label="Total" f1={f1Metrics.total} replacement={replacementMetrics.total} neutral />
                  <ComparisonRow label="Em acompanhamento" f1={f1Metrics.open} replacement={replacementMetrics.open} lowerIsBetter />
                  <ComparisonRow label="Taxa de aprovação" f1={f1Metrics.approvalRate} replacement={replacementMetrics.approvalRate} suffix="%" />
                  <ComparisonRow label="Tempo até aprovação" f1={f1Metrics.avgApprovalDays} replacement={replacementMetrics.avgApprovalDays} suffix=" dias" lowerIsBetter />
                  <ComparisonRow label="Tempo atual aguardando aprovação" f1={f1Metrics.avgOpenDays} replacement={replacementMetrics.avgOpenDays} suffix=" dias" lowerIsBetter />
                  <ComparisonRow label="Tempo médio fora" f1={f1Metrics.avgOutsideDays} replacement={replacementMetrics.avgOutsideDays} suffix=" dias" lowerIsBetter />
                  <ComparisonRow label="Testes até aprovação" f1={f1Metrics.avgTestsToApproval} replacement={replacementMetrics.avgTestsToApproval} lowerIsBetter />
                  <ComparisonRow label="Aprovação no 1º teste" f1={f1Metrics.firstPassRate} replacement={replacementMetrics.firstPassRate} suffix="%" />
                  <ComparisonRow label={`Paradas +${staleDaysThreshold} dias`} f1={f1Metrics.stalled} replacement={replacementMetrics.stalled} lowerIsBetter />
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-slate-900">Etapas do processo</CardTitle>
            <p className="text-sm text-slate-500">Onde as ferramentas da visão estão concentradas.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {pipeline.map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{item.label}</span>
                  <span className="font-semibold tabular-nums text-slate-950">{item.value}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-900">Fila que exige decisão</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Prioriza tempo fora, falta de movimento e espera total pela aprovação.
                </p>
              </div>
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            {criticalQueue.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-900">
                Nenhuma ferramenta parada acima do limite nesta visão.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {criticalQueue.map((item) => (
                  <div
                    key={item.matrix.id}
                    className="grid gap-3 py-4 lg:grid-cols-[minmax(220px,1fr)_auto_auto_minmax(180px,0.9fr)] lg:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-950">{item.matrix.code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          kindFromCode(item.matrix.code) === "f1"
                            ? "bg-cyan-100 text-cyan-800"
                            : "bg-slate-200 text-slate-700"
                        }`}>
                          {kindFromCode(item.matrix.code) === "f1" ? "F1" : "REPOSIÇÃO"}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          item.urgency === "Crítica"
                            ? "bg-red-100 text-red-800"
                            : item.urgency === "Alta"
                              ? "bg-orange-100 text-orange-800"
                              : "bg-amber-100 text-amber-800"
                        }`}>
                          {item.urgency}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Último movimento: {formatToBR(item.lastDate)} · {item.tests} teste(s)
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-600">
                        Cobrar de: {item.responsible}
                      </p>
                    </div>
                    <div className="min-w-32 rounded-lg bg-slate-100 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Aguardando aprovação
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                        {item.approvalWaitingDays} dias
                      </p>
                    </div>
                    <div className={`min-w-28 rounded-lg px-3 py-2 ${
                      item.outside
                        ? item.outside.days >= 30
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                        : "bg-sky-50 text-sky-800"
                    }`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-75">
                        {item.outside
                          ? item.outside.kind === "correction"
                            ? "Fora em correção"
                            : "Fora em limpeza"
                          : "Sem movimento"}
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums">
                        {item.outside?.days ?? item.inactiveDays} dias
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <ArrowRight className="h-4 w-4 text-emerald-700" />
                      {item.action}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-slate-900">Aprovações nos últimos 6 meses</CardTitle>
            <p className="text-sm text-slate-500">F1 em verde e reposições em azul petróleo.</p>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-end justify-between gap-3 pt-6">
              {monthlyApprovals.map((month) => {
                const total = month.f1 + month.replacement;
                return (
                  <div key={month.key} className="flex h-full flex-1 flex-col items-center justify-end">
                    <span className="mb-2 text-xs font-semibold text-slate-700">{total}</span>
                    <div className="flex h-40 w-full max-w-12 flex-col justify-end overflow-hidden rounded-t-md bg-slate-100">
                      <div
                        className="bg-[#176B75]"
                        style={{ height: `${Math.round((month.replacement / maxMonthly) * 100)}%` }}
                        title={`${month.replacement} reposições`}
                      />
                      <div
                        className="bg-emerald-500"
                        style={{ height: `${Math.round((month.f1 / maxMonthly) * 100)}%` }}
                        title={`${month.f1} F1`}
                      />
                    </div>
                    <span className="mt-2 text-xs font-medium capitalize text-slate-500">{month.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-center gap-5 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />F1</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#176B75]" />Reposição</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EfficiencyCard title="Eficiência F1" metrics={f1Metrics} icon={Wrench} />
        <EfficiencyCard title="Eficiência das reposições" metrics={replacementMetrics} icon={Zap} />
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-slate-900">Tempo da confecção até o recebimento</CardTitle>
          <p className="text-sm text-slate-500">Indicadores da aba Confecção, mantidos separados do desempenho dos testes.</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <LeadTimeTile
            title="Necessidade → Solicitação"
            value={manufacturingLeadTimes?.needToPending ?? null}
            samples={manufacturingLeadTimes?.samplesNeedToPending ?? 0}
          />
          <LeadTimeTile
            title="Solicitação → Fabricação"
            value={manufacturingLeadTimes?.pendingToApproved ?? null}
            samples={manufacturingLeadTimes?.samplesPendingToApproved ?? 0}
          />
          <LeadTimeTile
            title="Fabricação → Recebimento"
            value={manufacturingLeadTimes?.approvedToReceived ?? null}
            samples={manufacturingLeadTimes?.samplesApprovedToReceived ?? 0}
          />
        </CardContent>
      </Card>

      {unknownCodes > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {unknownCodes} código(s) não possuem sequência no padrão `/001`, `/002` etc. e ficaram fora da comparação F1 x Reposição.
        </div>
      )}
    </div>
  );
}

function DefinitionCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-bold">{value}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-300">{description}</p>
    </div>
  );
}

function DecisionCard({
  title,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  helper: string;
  icon: typeof Package;
  tone: "blue" | "amber" | "cyan" | "red";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <Card className={`border shadow-sm ${tones[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{title}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
          </div>
          <Icon className="h-5 w-5 opacity-80" />
        </div>
        <p className="mt-2 text-xs opacity-75">{helper}</p>
      </CardContent>
    </Card>
  );
}

function ComparisonRow({
  label,
  f1,
  replacement,
  suffix = "",
  lowerIsBetter = false,
  neutral = false,
}: {
  label: string;
  f1: number;
  replacement: number;
  suffix?: string;
  lowerIsBetter?: boolean;
  neutral?: boolean;
}) {
  const equal = f1 === replacement;
  const f1Better = lowerIsBetter ? f1 < replacement : f1 > replacement;
  const reading = neutral ? "Base analisada" : equal ? "Mesmo resultado" : f1Better ? "F1 melhor" : "Reposição melhor";
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 font-medium text-slate-700">{label}</td>
      <td className="py-3 text-right font-semibold tabular-nums text-emerald-700">{f1}{suffix}</td>
      <td className="py-3 text-right font-semibold tabular-nums text-[#176B75]">{replacement}{suffix}</td>
      <td className="py-3 pl-5 text-xs font-medium text-slate-500">{reading}</td>
    </tr>
  );
}

function EfficiencyCard({ title, metrics, icon: Icon }: { title: string; metrics: ToolMetrics; icon: typeof Wrench }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-slate-900">{title}</CardTitle>
          <Icon className="h-5 w-5 text-emerald-700" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <EfficiencyLine label="Taxa de aprovação" value={`${metrics.approvalRate}%`} progress={metrics.approvalRate} />
        <EfficiencyLine label="Aprovação no 1º teste" value={`${metrics.firstPassRate}%`} progress={metrics.firstPassRate} />
        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <MiniMetric label="Até 1º teste" value={`${metrics.avgFirstTestDays}d`} />
          <MiniMetric label="Até aprovação" value={`${metrics.avgApprovalDays}d`} />
          <MiniMetric label="Testes/aprov." value={String(metrics.avgTestsToApproval)} />
        </div>
      </CardContent>
    </Card>
  );
}

function EfficiencyLine({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-slate-950">{value}</span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-lg font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function LeadTimeTile({ title, value, samples }: { title: string; value: number | null; samples: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value === null ? "-" : `${value} dias`}</p>
          <p className="mt-1 text-xs text-slate-500">{samples} registro(s) válidos</p>
        </div>
        <Clock className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  );
}
