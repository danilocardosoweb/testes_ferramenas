import { UserRole } from "@/types";

/**
 * Mapeamento de permissões por role:
 *
 * admin    – pode tudo, incluindo exclusões
 * gestor   – pode tudo MENOS exclusões
 * corretor – acesso às abas: Timeline, Limpeza Ferr., Ferramentas Aprovadas, Kanban, Em Teste
 * comercial– apenas relatórios e visualizações (Análise, Dashboard, Ferramentas Aprovadas)
 *
 * editor / viewer (legados) – tratados como gestor / comercial respectivamente
 */

export type MainView =
  | "timeline"
  | "sheet"
  | "dashboard"
  | "approved"
  | "kanban"
  | "cleaning"
  | "manufacturing"
  | "analysis"
  | "activity"
  | "testing"
  | "settings";

const CORRETOR_VIEWS: MainView[] = ["timeline", "sheet", "cleaning", "approved", "kanban", "testing"];
const COMERCIAL_VIEWS: MainView[] = ["analysis", "dashboard", "approved", "activity"];
const GESTOR_VIEWS: MainView[] = [
  "timeline", "sheet", "dashboard", "approved", "kanban", "cleaning",
  "manufacturing", "analysis", "activity", "testing", "settings",
];
const ADMIN_VIEWS: MainView[] = [...GESTOR_VIEWS];

function normalizeRole(role: UserRole): UserRole {
  if (role === "editor") return "gestor";
  if (role === "viewer") return "comercial";
  return role;
}

export function usePermissions(role: UserRole | undefined) {
  const r = normalizeRole(role ?? "comercial");

  const canDelete = r === "admin";
  const canEdit = r === "admin" || r === "gestor";
  const canCreate = r === "admin" || r === "gestor" || r === "corretor";
  const canExport = r !== "corretor";
  const isAdmin = r === "admin";
  const isGestor = r === "gestor";
  const isCorretor = r === "corretor";
  const isComercial = r === "comercial";

  function canAccessView(view: MainView): boolean {
    switch (r) {
      case "admin":    return ADMIN_VIEWS.includes(view);
      case "gestor":   return GESTOR_VIEWS.includes(view);
      case "corretor": return CORRETOR_VIEWS.includes(view);
      case "comercial":return COMERCIAL_VIEWS.includes(view);
      default:         return false;
    }
  }

  /** Retorna a primeira view acessível para usar como fallback */
  function defaultView(): MainView {
    switch (r) {
      case "admin":
      case "gestor":   return "timeline";
      case "corretor": return "timeline";
      case "comercial":return "analysis";
      default:         return "analysis";
    }
  }

  return {
    role: r,
    canDelete,
    canEdit,
    canCreate,
    canExport,
    isAdmin,
    isGestor,
    isCorretor,
    isComercial,
    canAccessView,
    defaultView,
  };
}
