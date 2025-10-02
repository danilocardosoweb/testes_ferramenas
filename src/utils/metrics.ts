import { Matrix, MatrixEvent } from "@/types";

export const getStatusFromLastEvent = (matrix: Matrix): string => {
  if (!matrix.events || matrix.events.length === 0) return "Sem eventos";
  const last = matrix.events[matrix.events.length - 1];
  switch (last.type) {
    case "Teste Inicial":
    case "Teste Final":
      return "Em teste";
    case "Ajuste":
      return "Em ajuste";
    case "Aprovado":
      return "Aprovada";
    case "Reprovado":
      return "Reprovada";
    case "Correção Externa":
      return "Em correção externa";
    case "Limpeza":
      return "Em limpeza";
    case "Recebimento":
      return "Recebida";
    default:
      return last.type;
  }
};

export const daysBetween = (aISO: string, bISO: string) => {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  const diff = Math.abs(b - a);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export const daysSinceLastEvent = (matrix: Matrix, todayISO?: string): number => {
  if (!matrix.events || matrix.events.length === 0) return 0;
  const last = matrix.events[matrix.events.length - 1];
  const today = todayISO ?? new Date().toISOString().split("T")[0];
  return daysBetween(last.date, today);
};

export const computeDurations = (matrix: Matrix) => {
  // Calcula dias entre eventos consecutivos; retorna lista de {from,to,days}
  const result: { from: MatrixEvent; to?: MatrixEvent; days: number }[] = [];
  const evs = matrix.events;
  for (let i = 0; i < evs.length; i++) {
    const from = evs[i];
    const to = evs[i + 1];
    const days = to ? daysBetween(from.date, to.date) : 0;
    result.push({ from, to, days });
  }
  return result;
};

export const getCounts = (matrix: Matrix) => {
  const tests = matrix.events.filter(e => e.type === "Teste Inicial" || e.type === "Teste Final").length;
  const rejects = matrix.events.filter(e => e.type === "Reprovado").length;
  const fixes = matrix.events.filter(e => e.type === "Ajuste" || e.type === "Correção Externa").length;
  const approvals = matrix.events.filter(e => e.type === "Aprovado").length;
  return { tests, rejects, fixes, approvals };
};
