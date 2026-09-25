import { Matrix, MatrixEvent } from "@/types";

export const TIMELINE_REMOVED_EVENT = "Retirado da Timeline";
export const TIMELINE_RESTORED_EVENT = "Reativado na Timeline";

export function normalizeLifecycleText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeMatrixCode(value: unknown): string | null {
  const source = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^F[\s-]*/, "");
  const parts = source.split(/[/\\]/);
  if (parts.length < 2) return null;

  const sequence = parts.pop()?.replace(/\D/g, "") ?? "";
  const base = parts.join("").replace(/[^A-Z0-9]/g, "");
  if (!base || !sequence) return null;

  return `F-${base}/${String(Number(sequence)).padStart(3, "0")}`;
}

export function isApprovalEvent(event: MatrixEvent): boolean {
  const type = normalizeLifecycleText(event.type);
  const testStatus = normalizeLifecycleText(event.testStatus);
  return type.includes("aprov") || testStatus === "aprovado";
}

export function getApprovalEventFromEvents(events: MatrixEvent[]): MatrixEvent | null {
  return [...(events || [])]
    .filter(isApprovalEvent)
    .filter((event) => Boolean(event.date))
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

export function getApprovalEvent(matrix: Matrix): MatrixEvent | null {
  return getApprovalEventFromEvents(matrix.events || []);
}

export function isMatrixApproved(matrix: Matrix): boolean {
  return Boolean(getApprovalEvent(matrix));
}

function isTimelineControlEvent(event: MatrixEvent): boolean {
  const type = normalizeLifecycleText(event.type);
  return (
    type === normalizeLifecycleText(TIMELINE_REMOVED_EVENT) ||
    type === normalizeLifecycleText(TIMELINE_RESTORED_EVENT)
  );
}

export function isMatrixActiveForTimeline(matrix: Matrix): boolean {
  const latestControlEvent = [...(matrix.events || [])]
    .filter(isTimelineControlEvent)
    .sort((a, b) => {
      const dateComparison = (a.date || "").localeCompare(b.date || "");
      if (dateComparison !== 0) return dateComparison;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    })
    .at(-1);

  if (!latestControlEvent) return true;

  return normalizeLifecycleText(latestControlEvent.type) ===
    normalizeLifecycleText(TIMELINE_RESTORED_EVENT);
}
