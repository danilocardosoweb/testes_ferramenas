export interface MatrixEvent {
  id: string;
  date: string;
  type: string;
  comment: string;
  location?: string;
  observations?: string;
  images?: string[];
  responsible?: string;
  files?: { name: string; type: string; dataUrl: string }[];
}

export interface Matrix {
  id: string;
  code: string;
  receivedDate: string;
  events: MatrixEvent[];
  priority?: "normal" | "medium" | "critical";
  responsible?: string;
  folder?: string;
}

export type EventType =
  | "Recebimento"
  | "Testes"
  | "Limpeza Saída"
  | "Limpeza Entrada"
  | "Correção Externa Saída"
  | "Correção Externa Entrada"
  | "Aprovado"
  | "Outro";

export const EVENT_TYPES: EventType[] = [
  "Recebimento",
  "Testes",
  "Limpeza Saída",
  "Limpeza Entrada",
  "Correção Externa Saída",
  "Correção Externa Entrada",
  "Aprovado",
  "Outro",
];
