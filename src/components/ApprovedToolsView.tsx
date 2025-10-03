import React from "react";
import { Matrix, MatrixEvent } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Props = {
  matrices: Matrix[];
};

// Extrai a primeira data de aprovação encontrada nos eventos da matriz
function getApprovalDate(events: MatrixEvent[]): string | null {
  // Considera qualquer evento cujo tipo contenha "aprov" (ex.: "Aprovado", "Aprovação")
  const approval = [...events]
    .filter((e) => e.type.toLowerCase().includes("aprov"))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return approval?.date ?? null;
}

// Agrupa por Ano > Mês (com base na data de aprovação)
function groupByYearMonth(matrices: Matrix[]) {
  const groups: Record<string, Record<string, Matrix[]>> = {};
  matrices.forEach((m) => {
    const approvalDate = getApprovalDate(m.events);
    if (!approvalDate) return;
    const d = new Date(approvalDate);
    const year = String(d.getFullYear());
    const month = String(d.getMonth() + 1).padStart(2, "0");
    if (!groups[year]) groups[year] = {};
    if (!groups[year][month]) groups[year][month] = [];
    groups[year][month].push(m);
  });
  return groups;
}

export const ApprovedToolsView: React.FC<Props> = ({ matrices }) => {
  // Filtra somente matrizes que possuem alguma aprovação
  const approved = React.useMemo(() => matrices.filter((m) => getApprovalDate(m.events)), [matrices]);

  // Estado dos filtros
  const [yearFilter, setYearFilter] = React.useState<string>("all");
  const [monthFilter, setMonthFilter] = React.useState<string>("all"); // "01".."12" ou "all"
  const [toolFilter, setToolFilter] = React.useState<string>("");

  // Opções de ano e mês derivadas dos aprovados
  const yearOptions = React.useMemo(() => {
    const set = new Set<string>();
    approved.forEach((m) => {
      const d = getApprovalDate(m.events);
      if (!d) return;
      set.add(String(new Date(d).getFullYear()));
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [approved]);

  const monthOptions = React.useMemo(() => {
    const set = new Set<string>();
    approved.forEach((m) => {
      const d = getApprovalDate(m.events);
      if (!d) return;
      const dt = new Date(d);
      const y = String(dt.getFullYear());
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      if (yearFilter === "all" || yearFilter === y) set.add(mm);
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [approved, yearFilter]);

  // Aplicar filtros
  const filtered = React.useMemo(() => {
    const term = toolFilter.trim().toLowerCase();
    return approved.filter((m) => {
      const d = getApprovalDate(m.events);
      if (!d) return false;
      const dt = new Date(d);
      const y = String(dt.getFullYear());
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const matchYear = yearFilter === "all" ? true : y === yearFilter;
      const matchMonth = monthFilter === "all" ? true : mm === monthFilter;
      const matchTool = term ? m.code.toLowerCase().includes(term) : true;
      return matchYear && matchMonth && matchTool;
    });
  }, [approved, yearFilter, monthFilter, toolFilter]);

  const grouped = React.useMemo(() => groupByYearMonth(filtered), [filtered]);
  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  if (approved.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Nenhuma ferramenta aprovada encontrada.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="p-3 border rounded-lg bg-background space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="min-w-40">
            <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setMonthFilter("all"); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {monthOptions.map((mm) => {
                  const name = new Date(2000, Number(mm) - 1, 1).toLocaleString("pt-BR", { month: "long" });
                  return (
                    <SelectItem key={mm} value={mm}>{mm} - {name}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-56">
            <Input
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              placeholder="Filtrar por código da ferramenta"
            />
          </div>
        </div>
      </div>

      {years.map((year) => {
        const months = Object.keys(grouped[year]).sort((a, b) => Number(b) - Number(a));
        return (
          <div key={year} className="border rounded-lg">
            <div className="px-4 py-2 border-b bg-muted/50 font-semibold">Ano: {year}</div>
            <div className="p-3 space-y-4">
              {months.map((month) => {
                const items = grouped[year][month]
                  .slice()
                  .sort((a, b) => {
                    const da = getApprovalDate(a.events)!;
                    const db = getApprovalDate(b.events)!;
                    return da.localeCompare(db);
                  });
                const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString("pt-BR", { month: "long" });
                return (
                  <div key={`${year}-${month}`} className="border rounded-md">
                    <div className="px-3 py-2 border-b font-medium capitalize">Mês: {month.padStart(2, "0")} - {monthName}</div>
                    <ul className="divide-y">
                      {items.map((m) => {
                        const approvalDate = getApprovalDate(m.events)!;
                        const formatted = new Date(approvalDate).toLocaleDateString("pt-BR");
                        return (
                          <li key={m.id} className="px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{m.code}</span>
                              {m.folder ? (
                                <span className="text-xs px-2 py-0.5 rounded bg-muted">{m.folder}</span>
                              ) : null}
                            </div>
                            <div className="text-sm text-muted-foreground">Aprovada em {formatted}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
