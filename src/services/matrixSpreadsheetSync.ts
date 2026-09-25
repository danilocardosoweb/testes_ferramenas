import * as XLSX from "xlsx";
import { Matrix, MatrixEvent } from "@/types";
import { createEvent, createMatrix, logAudit } from "@/services/db";
import {
  isApprovalEvent,
  normalizeMatrixCode as normalizeLifecycleMatrixCode,
} from "@/utils/matrixLifecycle";

export type SpreadsheetMilestone =
  | "test1" | "test2" | "test3" | "test4" | "test5"
  | "clean_return1" | "clean_return2" | "clean_return3" | "clean_return4" | "clean_return5"
  | "corr_send1" | "corr_send2" | "corr_send3" | "corr_send4" | "corr_send5"
  | "corr_return1" | "corr_return2" | "corr_return3" | "corr_return4" | "corr_return5"
  | "approval";

export type SpreadsheetEventProposal = {
  milestone: SpreadsheetMilestone;
  type: string;
  comment: string;
  date: string;
  action: "insert" | "identical" | "conflict";
  databaseDate?: string;
};

export type SpreadsheetSyncItem = {
  rowNumber: number;
  code: string;
  receivedDate: string | null;
  databaseReceivedDate: string | null;
  receivedDateConflict: boolean;
  approvalDate: string | null;
  toolStatus: string;
  sourceStatus: string;
  quantityProduced: number | string | null;
  responsible: string | null;
  matrixId: string | null;
  category: "existing" | "new_active" | "historical" | "invalid";
  events: SpreadsheetEventProposal[];
  raw: Record<string, unknown>;
};

export type SpreadsheetSyncPlan = {
  fileName: string;
  sheetName: string;
  items: SpreadsheetSyncItem[];
  warnings: string[];
  summary: {
    spreadsheetRows: number;
    existingMatrices: number;
    newActiveMatrices: number;
    historicalSkipped: number;
    eventsToInsert: number;
    identicalEvents: number;
    eventConflicts: number;
    receivedDateConflicts: number;
    invalidRows: number;
  };
};

export type SpreadsheetSyncResult = {
  matricesCreated: number;
  eventsInserted: number;
  skippedConflicts: number;
  failures: Array<{ code: string; message: string }>;
};

type EventColumn = {
  label: string;
  occurrence?: number;
  milestone: SpreadsheetMilestone;
  type: string;
  comment: string;
  cycle: number;
};

const EVENT_COLUMNS: EventColumn[] = [
  { label: "Primeira Prod.", milestone: "test1", type: "Testes", comment: "1º teste", cycle: 1 },
  { label: "Retorno Limpeza", milestone: "clean_return1", type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 1)", cycle: 1 },
  { label: "Saída 1 FEP", milestone: "corr_send1", type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 1)", cycle: 1 },
  { label: "Retorno 1 FEP", milestone: "corr_return1", type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 1)", cycle: 1 },
  { label: "Segunda Prod.", milestone: "test2", type: "Testes", comment: "2º teste", cycle: 2 },
  { label: "Retorno da Limpeza", occurrence: 1, milestone: "clean_return2", type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 2)", cycle: 2 },
  { label: "Saída 2 FEP", milestone: "corr_send2", type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 2)", cycle: 2 },
  { label: "Retorno FEP", occurrence: 1, milestone: "corr_return2", type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 2)", cycle: 2 },
  { label: "Terceira Prod.", milestone: "test3", type: "Testes", comment: "3º teste", cycle: 3 },
  { label: "Retorno da Limpeza", occurrence: 2, milestone: "clean_return3", type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 3)", cycle: 3 },
  { label: "Saída 3 FEP", milestone: "corr_send3", type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 3)", cycle: 3 },
  { label: "Retorno 3 FEP", milestone: "corr_return3", type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 3)", cycle: 3 },
  { label: "Quarta Prod.", milestone: "test4", type: "Testes", comment: "4º teste", cycle: 4 },
  { label: "Retorno da Limpeza", occurrence: 3, milestone: "clean_return4", type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 4)", cycle: 4 },
  { label: "Saída 4 FEP", milestone: "corr_send4", type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 4)", cycle: 4 },
  { label: "Retorno 4 FEP", milestone: "corr_return4", type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 4)", cycle: 4 },
  { label: "Quinta Prod.", milestone: "test5", type: "Testes", comment: "5º teste", cycle: 5 },
  { label: "Retorno da Limpeza", occurrence: 4, milestone: "clean_return5", type: "Limpeza Entrada", comment: "Retornou da limpeza (ciclo 5)", cycle: 5 },
  { label: "Saída 5 FEP", milestone: "corr_send5", type: "Correção Externa Saída", comment: "Enviada para correção (ciclo 5)", cycle: 5 },
  { label: "Retorno FEP", occurrence: 2, milestone: "corr_return5", type: "Correção Externa Entrada", comment: "Retornou da correção (ciclo 5)", cycle: 5 },
  { label: "Dt.Aprov.", milestone: "approval", type: "Aprovado", comment: "Aprovação", cycle: 1 },
];

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeMatrixCode(value: unknown, matrixValue?: unknown, seqValue?: unknown): string | null {
  return normalizeLifecycleMatrixCode(value)
    ?? normalizeLifecycleMatrixCode(`${String(matrixValue ?? "")}/${String(seqValue ?? "")}`);
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 10000 || value > 80000) return null;
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed?.y || !parsed?.m || !parsed?.d) return null;
    return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  const raw = String(value ?? "").trim();
  if (!raw || raw === "0" || raw === "805") return null;
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return toIsoDate(Number(raw.replace(",", ".")));

  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

function getColumnIndex(headers: unknown[], label: string, occurrence = 1): number {
  const target = normalize(label);
  const matches = headers
    .map((header, index) => ({ header: normalize(header), index }))
    .filter((entry) => entry.header === target);
  return matches[occurrence - 1]?.index ?? -1;
}

function getValue(values: unknown[], headers: unknown[], labels: string[]): unknown {
  for (const label of labels) {
    const index = getColumnIndex(headers, label);
    if (index >= 0) return values[index];
  }
  return null;
}

function eventTypeMatches(event: MatrixEvent, type: string): boolean {
  if (normalize(type).includes("aprov")) return isApprovalEvent(event);
  return normalize(event.type) === normalize(type);
}

function findSlotEvent(matrix: Matrix, proposal: Omit<SpreadsheetEventProposal, "action">, cycle: number): MatrixEvent | undefined {
  const sameType = matrix.events
    .filter((event) => eventTypeMatches(event, proposal.type))
    .sort((a, b) => a.date.localeCompare(b.date));
  const sameComment = sameType.find((event) => normalize(event.comment) === normalize(proposal.comment));
  if (sameComment) return sameComment;
  if (proposal.milestone === "approval") return sameType[0];
  return sameType[cycle - 1];
}

function isActiveUnapproved(toolStatus: string, sourceStatus: string): boolean {
  const status = `${normalize(toolStatus)} ${normalize(sourceStatus)}`;
  return /(teste|correcao|limpeza|prensa|nitretacao|em aprovacao)/.test(status)
    && !/(^|\s)aprovado(\s|$)/.test(normalize(sourceStatus));
}

export async function buildSpreadsheetSyncPlan(file: File, matrices: Matrix[]): Promise<SpreadsheetSyncPlan> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => normalize(name).includes("controle de testes"))
    ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const headers = grid[0] ?? [];
  const warnings: string[] = [];

  const ferramentaIndex = getColumnIndex(headers, "Ferramenta");
  const matrizIndex = getColumnIndex(headers, "Matriz");
  const seqIndex = getColumnIndex(headers, "Seq");
  if (ferramentaIndex < 0 && (matrizIndex < 0 || seqIndex < 0)) {
    throw new Error("A planilha precisa ter a coluna Ferramenta ou o conjunto Matriz + Seq.");
  }

  const matrixByCode = new Map<string, Matrix>();
  for (const matrix of matrices) {
    const code = normalizeMatrixCode(matrix.code);
    if (code && !matrixByCode.has(code)) matrixByCode.set(code, matrix);
  }

  const parsedItems: SpreadsheetSyncItem[] = [];
  let invalidRows = 0;

  grid.slice(1).forEach((values, rowOffset) => {
    const rowNumber = rowOffset + 2;
    if (!values.some((value) => String(value ?? "").trim())) return;
    const code = normalizeMatrixCode(
      ferramentaIndex >= 0 ? values[ferramentaIndex] : null,
      matrizIndex >= 0 ? values[matrizIndex] : null,
      seqIndex >= 0 ? values[seqIndex] : null,
    );
    if (!code) {
      invalidRows += 1;
      warnings.push(`Linha ${rowNumber}: código da ferramenta incompleto.`);
      return;
    }

    const receivedRaw = getValue(values, headers, ["Dt.Entrega", "Data Entrega"]);
    const approvalRaw = getValue(values, headers, ["Dt.Aprov.", "Data Aprovação"]);
    const receivedDate = toIsoDate(receivedRaw);
    const approvalDate = toIsoDate(approvalRaw);
    const sourceStatus = String(getValue(values, headers, ["Status"]) ?? "").trim();
    const toolStatus = String(getValue(values, headers, ["Status da Ferram.", "Status Ferramenta"]) ?? "").trim();
    const matrix = matrixByCode.get(code) ?? null;

    if (receivedRaw && !receivedDate) warnings.push(`Linha ${rowNumber}: data de entrega inválida ignorada.`);
    if (approvalRaw && !approvalDate) warnings.push(`Linha ${rowNumber}: data de aprovação inválida ignorada.`);

    const events: SpreadsheetEventProposal[] = [];
    for (const definition of EVENT_COLUMNS) {
      const columnIndex = getColumnIndex(headers, definition.label, definition.occurrence ?? 1);
      if (columnIndex < 0) continue;
      const rawDate = values[columnIndex];
      const date = toIsoDate(rawDate);
      if (!date) {
        if (rawDate && !["0", "805"].includes(String(rawDate).trim())) {
          warnings.push(`Linha ${rowNumber}, ${definition.label}: valor inválido ignorado.`);
        }
        continue;
      }

      const baseProposal = {
        milestone: definition.milestone,
        type: definition.type,
        comment: definition.comment,
        date,
      };
      if (!matrix) {
        events.push({ ...baseProposal, action: "insert" });
        continue;
      }

      const exact = matrix.events.find((event) => eventTypeMatches(event, definition.type) && event.date === date);
      if (exact) {
        events.push({ ...baseProposal, action: "identical" });
        continue;
      }

      const slotEvent = findSlotEvent(matrix, baseProposal, definition.cycle);
      events.push(slotEvent
        ? { ...baseProposal, action: "conflict", databaseDate: slotEvent.date }
        : { ...baseProposal, action: "insert" });
    }

    const raw: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const key = String(header ?? "").trim() || `Coluna ${index + 1}`;
      raw[key] = values[index];
    });

    const category: SpreadsheetSyncItem["category"] = matrix
      ? "existing"
      : approvalDate || !isActiveUnapproved(toolStatus, sourceStatus)
        ? "historical"
        : "new_active";

    parsedItems.push({
      rowNumber,
      code,
      receivedDate,
      databaseReceivedDate: matrix?.receivedDate ?? null,
      receivedDateConflict: Boolean(matrix && receivedDate && matrix.receivedDate && receivedDate !== matrix.receivedDate),
      approvalDate,
      toolStatus,
      sourceStatus,
      quantityProduced: getValue(values, headers, ["Qte.Prod.", "Qte Prod", "Qte_Prod"]) as number | string | null,
      responsible: String(getValue(values, headers, ["Corretor", "Responsável"]) ?? "").trim() || null,
      matrixId: matrix?.id ?? null,
      category,
      events,
      raw,
    });
  });

  const itemsByCode = new Map<string, SpreadsheetSyncItem>();
  for (const item of parsedItems) {
    const previous = itemsByCode.get(item.code);
    if (!previous || item.events.length > previous.events.length) {
      itemsByCode.set(item.code, item);
    } else {
      warnings.push(`Código repetido ${item.code}: foi mantida a linha mais completa.`);
    }
  }
  const items = [...itemsByCode.values()];

  return {
    fileName: file.name,
    sheetName,
    items,
    warnings,
    summary: {
      spreadsheetRows: parsedItems.length,
      existingMatrices: items.filter((item) => item.category === "existing").length,
      newActiveMatrices: items.filter((item) => item.category === "new_active").length,
      historicalSkipped: items.filter((item) => item.category === "historical").length,
      eventsToInsert: items
        .filter((item) => item.category !== "historical")
        .reduce((total, item) => total + item.events.filter((event) => event.action === "insert").length, 0),
      identicalEvents: items.reduce((total, item) => total + item.events.filter((event) => event.action === "identical").length, 0),
      eventConflicts: items.reduce((total, item) => total + item.events.filter((event) => event.action === "conflict").length, 0),
      receivedDateConflicts: items.filter((item) => item.receivedDateConflict).length,
      invalidRows,
    },
  };
}

export async function executeSpreadsheetSync(
  plan: SpreadsheetSyncPlan,
  options: { includeNewActiveMatrices: boolean },
  onProgress?: (completed: number, total: number) => void,
): Promise<SpreadsheetSyncResult> {
  const eligible = plan.items.filter((item) =>
    item.category === "existing" || (options.includeNewActiveMatrices && item.category === "new_active")
  );
  const totalOperations = eligible.reduce(
    (total, item) => total + (item.category === "new_active" ? 1 : 0)
      + item.events.filter((event) => event.action === "insert").length,
    0,
  );
  const result: SpreadsheetSyncResult = {
    matricesCreated: 0,
    eventsInserted: 0,
    skippedConflicts: plan.summary.eventConflicts + plan.summary.receivedDateConflicts,
    failures: [],
  };
  let completed = 0;

  for (const item of eligible) {
    try {
      let matrixId = item.matrixId;
      if (!matrixId) {
        if (!item.receivedDate) throw new Error("Data de entrega ausente.");
        matrixId = await createMatrix({
          code: item.code,
          receivedDate: item.receivedDate,
          responsible: item.responsible,
        });
        result.matricesCreated += 1;
        completed += 1;
        onProgress?.(completed, totalOperations);
      }

      for (const proposal of item.events.filter((event) => event.action === "insert")) {
        await createEvent(matrixId, {
          id: crypto.randomUUID(),
          date: proposal.date,
          type: proposal.type,
          comment: proposal.comment,
        });
        result.eventsInserted += 1;
        completed += 1;
        onProgress?.(completed, totalOperations);
      }
    } catch (error) {
      result.failures.push({
        code: item.code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await logAudit("spreadsheet.safe_sync", "SpreadsheetImport", null, {
    fileName: plan.fileName,
    sheetName: plan.sheetName,
    options,
    summary: plan.summary,
    result,
  });
  return result;
}
