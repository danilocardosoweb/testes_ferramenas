import React, { useEffect, useMemo, useState } from "react";
import { Bell, Check, Mail, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Matrix } from "@/types";

// Tipos e props
export type NotifCategory = "Aprovadas" | "Limpeza" | "Correção Externa";

type SentLogEntry = {
  id: string;
  eventDate: string;
  recordedAt: string;
  matrixCode: string;
  matrixId: string;
  action: string;
  description: string;
  category: NotifCategory | null;
};

interface Props {
  matrices: Matrix[];
  staleDaysThreshold?: number; // alinhado com Index.tsx (padrão 10)
}

type Activity = {
  id: string;
  eventDate: string; // AAAA-MM-DD
  recordedAt: string; // ISO completo
  matrixCode: string;
  matrixId: string;
  action: string;
  description: string;
  category: NotifCategory | null; // somente as que importam para envio terão categoria
};

const LAST_SEEN_KEY = "notif_last_seen";
const SENT_LOG_KEY = "notif_sent_log";
const NOTIF_FILTER_KEY = "notif_visible_categories";

// Helpers
const toDateTime = (value: string): Date => (value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`));

function formatBRDateTime(value: string | Date) {
  const date = value instanceof Date ? value : toDateTime(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBRDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(toDateTime(value));
}

function getGreeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function categorize(typeLower: string): NotifCategory | null {
  if (typeLower.includes("aprov")) return "Aprovadas";
  if (typeLower.includes("limpeza")) return "Limpeza";
  if (typeLower.includes("correção") || typeLower.includes("correcao")) return "Correção Externa";
  return null;
}

function loadSentLog(): Record<string, SentLogEntry> {
  try {
    const raw = localStorage.getItem(SENT_LOG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistSentLog(log: Record<string, SentLogEntry>) {
  try {
    localStorage.setItem(SENT_LOG_KEY, JSON.stringify(log));
  } catch {}
}

function loadNotifFilter(): NotifCategory[] {
  try {
    const raw = localStorage.getItem(NOTIF_FILTER_KEY);
    if (!raw) return ["Aprovadas", "Limpeza", "Correção Externa"];
    const arr = JSON.parse(raw) as NotifCategory[];
    const all: NotifCategory[] = ["Aprovadas", "Limpeza", "Correção Externa"];
    const valid = arr.filter((x) => all.includes(x));
    return valid.length ? valid : all;
  } catch {
    return ["Aprovadas", "Limpeza", "Correção Externa"];
  }
}

function buildActivities(matrices: Matrix[], staleDaysThreshold: number, sentLog: Record<string, SentLogEntry>, visibleCats: NotifCategory[]): Activity[] {
  const list: Activity[] = [];

  for (const m of matrices) {
    // eventos
    for (const ev of m.events || []) {
      const lower = ev.type.toLowerCase();
      let action = "Evento";
      let desc = `${m.code} teve o evento "${ev.type}"`;

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
      } else if (lower.includes("receb")) {
        action = "Matriz Recebida";
        desc = `${m.code} foi recebida no sistema`;
      }

      // Remove atividades já enviadas (sentLog) e respeita o filtro de categorias visíveis
      const cat = categorize(lower);
      if (cat && sentLog[ev.id]) {
        continue;
      }
      if (cat && visibleCats.length && !visibleCats.includes(cat)) {
        continue;
      }

      list.push({
        id: ev.id,
        eventDate: ev.date,
        recordedAt: ev.createdAt ?? `${ev.date}T00:00:00`,
        matrixCode: m.code,
        matrixId: m.id,
        action,
        description: desc,
        category: cat,
      });
    }

    // alerta de estagnação (não entra em categoria de envio por e-mail)
    const lastDate = (m.events || []).reduce<string | null>((acc, e) => (acc && acc > e.date ? acc : e.date), m.receivedDate);
    if (lastDate) {
      const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
      if (days > staleDaysThreshold) {
        list.push({
          id: `stale-${m.id}`,
          eventDate: lastDate,
          recordedAt: new Date().toISOString(),
          matrixCode: m.code,
          matrixId: m.id,
          action: "Matriz Parada",
          description: `${m.code} está sem movimentação há ${days} dias`,
          category: null,
        });
      }
    }
  }

  // ordena mais recentes primeiro (considerando data/hora do apontamento)
  list.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  return list;
}

export default function NotificationsBell({ matrices, staleDaysThreshold = 10 }: Props) {
  const [open, setOpen] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sentLog, setSentLog] = useState<Record<string, SentLogEntry>>(() => loadSentLog());
  const [visibleCats, setVisibleCats] = useState<NotifCategory[]>(() => loadNotifFilter());

  // atividades e contagem de "novas"
  const activities = useMemo(() => buildActivities(matrices, staleDaysThreshold, sentLog, visibleCats), [matrices, staleDaysThreshold, nowTick, sentLog, visibleCats]);
  const visibleActivities = useMemo(() => activities.filter((a) => !!a.category), [activities]);

  const lastSeen = useMemo(() => {
    try {
      return localStorage.getItem(LAST_SEEN_KEY) || "";
    } catch {
      return "";
    }
  }, [open]);

  const unreadCount = useMemo(() => {
    if (!lastSeen) return visibleActivities.length;
    const last = new Date(lastSeen).getTime();
    return visibleActivities.filter((a) => new Date(a.recordedAt).getTime() > last).length;
  }, [visibleActivities, lastSeen]);

  // auto refresh leve
  useEffect(() => {
    const id = setInterval(() => setNowTick((v) => v + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // ouvir mudanças externas do filtro de categorias
  useEffect(() => {
    const onFilter = () => setVisibleCats(loadNotifFilter());
    window.addEventListener("notif-filter-updated", onFilter as EventListener);
    window.addEventListener("storage", onFilter);
    return () => {
      window.removeEventListener("notif-filter-updated", onFilter as EventListener);
      window.removeEventListener("storage", onFilter);
    };
  }, []);

  // seleção por categoria
  const categories: NotifCategory[] = ["Aprovadas", "Limpeza", "Correção Externa"];
  const grouped = useMemo(() => {
    const g: Record<NotifCategory, Activity[]> = {
      Aprovadas: [],
      Limpeza: [],
      "Correção Externa": [],
    };
    for (const a of activities) {
      if (a.category && categories.includes(a.category)) g[a.category].push(a);
    }
    return g;
  }, [activities]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function selectAll(cat: NotifCategory) {
    const ids = new Set(selectedIds);
    for (const a of grouped[cat]) ids.add(a.id);
    setSelectedIds(ids);
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function markAsRead() {
    try {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    } catch {}
    setOpen(false);
  }

  function buildMailToBody() {
    // monta corpo do e-mail por categoria, apenas com selecionados
    const lines: string[] = [];
    const now = new Date();
    const greeting = getGreeting(now);
    const when = formatBRDateTime(now);

    // cabeçalho
    lines.push(`${greeting},`);
    lines.push("");
    lines.push(`Segue notificação de eventos registrada em ${when}.`);
    lines.push("Itens listados por categoria:");
    lines.push("");
    for (const cat of categories) {
      const items = grouped[cat].filter((a) => selectedIds.has(a.id));
      if (items.length === 0) continue;
      lines.push(`${cat}:`);
      for (const it of items) {
        const whenRecorded = formatBRDateTime(it.recordedAt);
        const whenEvent = formatBRDate(it.eventDate);
        lines.push(`- ${it.matrixCode} | ${it.action} | Evento: ${whenEvent} | Apontado: ${whenRecorded}`);
      }
      lines.push("");
    }
    if (lines.length === 5) lines.push("Nenhum item selecionado.");
    return lines.join("%0D%0A"); // CRLF encoded
  }

  function handleSendEmail() {
    const confirmed = window.confirm("Deseja enviar um e-mail de notificação com os eventos selecionados?");
    if (!confirmed) return;

    const recipients = (import.meta.env.VITE_NOTIFY_GROUP_EMAILS as string | undefined)?.trim();
    if (!recipients) {
      alert("Configurar VITE_NOTIFY_GROUP_EMAILS no .env para enviar a um grupo (separado por vírgulas). Abrindo seu cliente de e-mail sem destinatários.");
    }

    const to = recipients ? encodeURIComponent(recipients) : "";
    const ts = formatBRDateTime(new Date().toISOString()).replace(" ", ", ");
    const subject = encodeURIComponent(`Acompanhamento de Testes de Ferramenta - Notificação de Eventos - ${ts}`);
    const body = buildMailToBody();

    // mailto padrão do SO
    const href = `mailto:${to}?subject=${subject}&body=${body}`;
    window.location.href = href;

    // Registro e remoção automática
    const sentAt = new Date().toISOString();
    const nextLog = { ...sentLog };
    for (const act of activities) {
      if (!selectedIds.has(act.id)) continue;
      nextLog[act.id] = {
        id: act.id,
        eventDate: act.eventDate,
        recordedAt: sentAt,
        matrixCode: act.matrixCode,
        matrixId: act.matrixId,
        action: act.action,
        description: act.description,
        category: act.category,
      };
    }
    persistSentLog(nextLog);
    setSentLog(nextLog);
    setSelectedIds(new Set());
    setNowTick((v) => v + 1);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 text-[11px] font-bold bg-yellow-400 text-black rounded-full px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0">
        <div className="p-3 border-b flex items-center gap-2">
          <Badge className="bg-blue-600 text-white">Notificações</Badge>
          <span className="ml-auto text-xs text-muted-foreground">{visibleActivities.length} atividade(s)</span>
        </div>

        <ScrollArea className="h-[360px]">
          <div className="p-3 space-y-4">
            {categories.map((cat) => (
              <div key={cat} className="border rounded-md">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                  <div className="font-semibold">{cat}</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => selectAll(cat)}>Selecionar</Button>
                    <Button size="sm" variant="ghost" onClick={clearSelection}>Limpar</Button>
                  </div>
                </div>
                <div>
                  {grouped[cat].length === 0 ? (
                    <div className="text-xs text-muted-foreground px-3 py-2">Sem itens</div>
                  ) : (
                    <ul className="divide-y">
                      {grouped[cat].map((a) => (
                        <li key={a.id} className="flex items-start gap-3 px-3 py-2">
                          <Checkbox checked={selectedIds.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{a.matrixCode} — {a.action}</div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <div>Evento: {formatBRDate(a.eventDate)}</div>
                              <div>Apontado: {formatBRDateTime(a.recordedAt)}</div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator />
        <div className="p-3 flex items-center gap-2">
          <Button variant="outline" className="flex items-center gap-2" onClick={markAsRead}>
            <Check className="w-4 h-4" /> Marcar como lidas
          </Button>
          <Button className="ml-auto flex items-center gap-2" onClick={handleSendEmail}>
            <Mail className="w-4 h-4" /> Enviar E-mail
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
