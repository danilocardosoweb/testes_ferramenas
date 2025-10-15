export interface MatrixEvent {
  id: string;
  date: string;
  type: string;
  comment: string;
  createdAt?: string;
  location?: string;
  observations?: string;
  images?: string[];
  responsible?: string;
  files?: { name: string; type: string; dataUrl: string }[];
}

export interface Folder {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
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
