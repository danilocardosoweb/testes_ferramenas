import React, { useEffect, useMemo, useState } from "react";
import { Matrix } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Calendar, CheckCircle, Clock, RefreshCw, Search, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Props {
  matrices: Matrix[];
  staleDaysThreshold?: number; // padrão 10
}

type ActivityType = "matrix" | "event" | "system";

type ActivitySeverity = "info" | "success" | "warning" | "error";

interface ActivityEntry {
  id: string;
  eventDate: string; // AAAA-MM-DD
  recordedAt: string; // ISO completo (data/hora do apontamento)
  matrixCode: string;
  matrixId: string;
  action: string;
  description: string;
  type: ActivityType;
  severity: ActivitySeverity;
}

const toDateTime = (value: string): Date => {
  if (!value) return new Date();
  return value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
};

const formatDateBR = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(toDateTime(value));

const formatDateTimeBR = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(toDateTime(value));

export default function ActivityHistory({ matrices, staleDaysThreshold = 10 }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");
  const [levelFilter, setLevelFilter] = useState<ActivitySeverity | "all">("all");
  const [dateRange, setDateRange] = useState<string>("7");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [nowTick, setNowTick] = useState(0); // apenas para reprocessar periodicamente
  const [notifCategories, setNotifCategories] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("notif_visible_categories");
      if (!raw) return ["Aprovadas", "Limpeza", "Correção Externa"];
      const parsed = JSON.parse(raw);
      const all = ["Aprovadas", "Limpeza", "Correção Externa"];
      const valid = Array.isArray(parsed) ? parsed.filter((x) => all.includes(x)) : all;
      return valid.length ? valid : all;
    } catch { return ["Aprovadas", "Limpeza", "Correção Externa"]; }
  });
  const saveNotifCategories = (list: string[]) => {
    const order = ["Aprovadas", "Limpeza", "Correção Externa"];
    const ordered = order.filter((x) => list.includes(x));
    try { localStorage.setItem("notif_visible_categories", JSON.stringify(ordered)); } catch {}
    setNotifCategories(ordered);
    // notifica o sino
    try { window.dispatchEvent(new CustomEvent("notif-filter-updated")); } catch {}
  };
  const [staleCache, setStaleCache] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("activity_stale_cache");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  });

  const persistStaleCache = (next: Record<string, string>) => {
    setStaleCache(next);
    try {
      localStorage.setItem("activity_stale_cache", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // Monta atividades a partir das matrizes + eventos
  const activities = useMemo<ActivityEntry[]>(() => {
    const list: ActivityEntry[] = [];
    const nextStaleCache: Record<string, string> = { ...staleCache };

    for (const m of matrices) {
      // eventos da matriz
      for (const ev of m.events || []) {
        const lower = ev.type.toLowerCase();
        let action = "Evento";
        let desc = `${m.code} teve o evento "${ev.type}"`;
        let sev: ActivitySeverity = "info";

        if (lower.includes("limpeza")) {
          if (lower.includes("saída") || lower.includes("saida")) {
            action = "Enviada para Limpeza";
            desc = `${m.code} foi enviada para limpeza externa`;
          } else {
            action = "Retornou da Limpeza";
            desc = `${m.code} retornou da limpeza e está disponível`;
          }
        } else if (lower.includes("correção") || lower.includes("correcao")) {
          if (lower.includes("saída") || lower.includes("saida")) {
            action = "Enviada para Correção";
            desc = `${m.code} foi enviada para correção externa`;
          } else {
            action = "Retornou da Correção";
            desc = `${m.code} retornou da correção externa`;
          }
        } else if (lower.includes("teste")) {
          action = "Teste Realizado";
          desc = `${m.code} teve um novo teste realizado`;
        } else if (lower.includes("aprov")) {
          action = "Matriz Aprovada";
          desc = `${m.code} foi aprovada e está pronta para uso`;
          sev = "success";
        } else if (lower.includes("receb")) {
          action = "Matriz Recebida";
          desc = `${m.code} foi recebida no sistema`;
        }

        list.push({
          id: ev.id,
          eventDate: ev.date,
          recordedAt: ev.createdAt ?? `${ev.date}T00:00:00`,
          matrixCode: m.code,
          matrixId: m.id,
          action,
          description: desc,
          type: "event",
          severity: sev,
        });
      }

      // alerta de matriz parada
      const lastDate = (m.events || []).reduce<string | null>((acc, e) => (acc && acc > e.date ? acc : e.date), m.receivedDate);
      if (lastDate) {
        const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
        if (days > staleDaysThreshold) {
          if (!nextStaleCache[m.id]) {
            nextStaleCache[m.id] = new Date().toISOString();
          }
          const recorded = nextStaleCache[m.id];
          list.push({
            id: `stale-${m.id}`,
            eventDate: lastDate,
            recordedAt: recorded,
            matrixCode: m.code,
            matrixId: m.id,
            action: "Matriz Parada",
            description: `${m.code} está sem movimentação há ${days} dias`,
            type: "system",
            severity: "warning",
          });
        } else if (nextStaleCache[m.id]) {
          delete nextStaleCache[m.id];
        }
      }
    }

    // inclui entradas do log de notificações enviadas
    try {
      const raw = localStorage.getItem("notif_sent_log");
      const log: Record<string, { id: string; eventDate: string; recordedAt: string; matrixCode: string; matrixId: string; action: string; description: string; category: string | null; }> = raw ? JSON.parse(raw) : {};
      for (const item of Object.values(log)) {
        if (item.category && notifCategories.length && !notifCategories.includes(item.category)) continue;
        list.push({
          id: `notif-sent-${item.id}`,
          eventDate: item.eventDate,
          recordedAt: item.recordedAt,
          matrixCode: item.matrixCode,
          matrixId: item.matrixId,
          action: "Notificação enviada",
          description: `${item.matrixCode} — ${item.action} (e-mail enviado)` ,
          type: "system",
          severity: "info",
        });
      }
    } catch {}

    // ordena do mais recente para o mais antigo
    list.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    if (JSON.stringify(nextStaleCache) !== JSON.stringify(staleCache)) {
      persistStaleCache(nextStaleCache);
    }
    return list;
  }, [matrices, staleDaysThreshold, nowTick, staleCache, notifCategories]);

  // filtros
  const filtered = useMemo(() => {
    let out = activities;
    // filtro temporal por recordedAt
    if (dateRange !== "all") {
      const days = parseInt(dateRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      out = out.filter((a) => new Date(a.recordedAt) >= cutoff);
    }
    if (search.trim()) {
      const t = search.toLowerCase();
      out = out.filter((a) => a.matrixCode.toLowerCase().includes(t) || a.action.toLowerCase().includes(t) || a.description.toLowerCase().includes(t));
    }
    if (typeFilter !== "all") out = out.filter((a) => a.type === typeFilter);
    if (levelFilter !== "all") out = out.filter((a) => a.severity === levelFilter);
    return out;
  }, [activities, search, typeFilter, levelFilter, dateRange]);

  // Data local AAAA-MM-DD (evita problemas de UTC ao comparar "hoje")
  const todayLocal = (() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })();

  // Contagem de aprovações de hoje baseada em string AAAA-MM-DD (timestamp pode ser "YYYY-MM-DD" ou ISO; slice(0,10) cobre ambos)
  const approvalsToday = filtered.filter(
    (a) => a.action === "Matriz Aprovada" && a.eventDate.slice(0, 10) === todayLocal
  ).length;

  // auto refresh simples
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => setNowTick((v) => v + 1), 3000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const severityColors: Record<ActivitySeverity, string> = {
    info: "bg-blue-100 text-blue-800 border-blue-200",
    success: "bg-green-100 text-green-800 border-green-200",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
    error: "bg-red-100 text-red-800 border-red-200",
  };

  // exportação CSV
  const handleExport = () => {
    const csv = [
      ["Data do Evento", "Data/Hora do Apontamento", "Código da Matriz", "Ação", "Descrição"],
      ...filtered.map((a) => [
        formatDateBR(a.eventDate),
        formatDateTimeBR(a.recordedAt),
        a.matrixCode,
        a.action,
        a.description,
      ]),
    ]
      .map((r) => r.join(";"))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico_atividades_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Atividades</p>
                <p className="text-2xl font-bold">{filtered.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Matrizes Ativas</p>
                <p className="text-2xl font-bold text-green-600">{matrices.filter((m) => (m.events || []).length > 0).length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alertas</p>
                <p className="text-2xl font-bold text-yellow-600">{filtered.filter((a) => a.severity === "warning").length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aprovações Hoje</p>
                <p className="text-2xl font-bold text-blue-600">{approvalsToday}</p>
              </div>
              <RefreshCw className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Filtros e Controles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por matriz, ação ou descrição..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button variant={autoRefresh ? "default" : "outline"} onClick={() => setAutoRefresh((v) => !v)} className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`} />
              Auto-refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="matrix">Operações de Matriz</SelectItem>
                <SelectItem value="event">Eventos</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={(v: any) => setLevelFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Nível" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Níveis</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="info">Informação</SelectItem>
                <SelectItem value="warning">Aviso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1 justify-between">
                  <span className="truncate text-left">Notificações: {notifCategories.length === 3 ? "Todas" : (notifCategories.join(", ") || "Nenhuma")}</span>
                  <ChevronDown className="w-4 h-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                {(["Aprovadas", "Limpeza", "Correção Externa"]).map((cat) => (
                  <DropdownMenuCheckboxItem
                    key={cat}
                    checked={notifCategories.includes(cat)}
                    onCheckedChange={(checked) => {
                      const set = new Set(notifCategories);
                      if (checked) set.add(cat); else set.delete(cat);
                      saveNotifCategories(Array.from(set));
                    }}
                  >
                    {cat}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setNowTick((v) => v + 1)} className="flex-1">
                <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
              </Button>
              <Button variant="outline" onClick={handleExport} className="flex-1">
                Exportar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Atividades ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="space-y-3 p-4">
              {filtered.map((a) => (
                <div key={a.id} className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex-shrink-0 mt-1">
                    <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="default" className="bg-blue-600 text-white font-bold text-sm px-3 py-1">
                        {a.matrixCode}
                      </Badge>
                      <Badge className={severityColors[a.severity]}>{a.action}</Badge>
                      <div className="ml-auto text-right text-xs text-muted-foreground space-y-0.5">
                        <div>Evento: {formatDateBR(a.eventDate)}</div>
                        <div>Apontado: {formatDateTimeBR(a.recordedAt)}</div>
                      </div>
                    </div>
                    <p className="text-sm font-medium mb-1">
                      <span className="font-bold text-blue-700 text-base">{a.matrixCode}</span> <span className="text-gray-700">{a.description.replace(a.matrixCode, "").trim()}</span>
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">Nenhuma atividade encontrada com os filtros aplicados.</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
