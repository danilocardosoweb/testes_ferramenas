import { supabase } from '@/lib/supabaseClient';
import { Matrix, MatrixEvent } from '@/types';

// Helpers
const table = {
  folders: 'folders',
  matrices: 'matrices',
  events: 'events',
  event_files: 'event_files',
} as const;

// Kanban tables
const ktable = {
  columns: 'kanban_columns',
  cards: 'kanban_cards',
  checklist: 'kanban_checklist',
  wip: 'kanban_wip_settings',
} as const;

export type KanbanColumn = { id: string; slug: 'backlog'|'em_andamento'|'concluido'; title: string; position: number };
export type KanbanCardRow = { id: string; title: string; description: string | null; source: 'auto'|'manual'; blocked: boolean; created_at: string; moved_at: string | null; matrix_id: string | null; matrix_code: string | null; column_id: string };
export type KanbanChecklistRow = { id: string; card_id: string; text: string; done: boolean; created_at: string };
export type KanbanWipSetting = { column_id: string; limit_value: number };

// ===============
// AUDITORIA (LOG)
// ===============
type AuditPayload = Record<string, any> | null | undefined;

export async function logAudit(action: string, entityType: string, entityId?: string | null, payload?: AuditPayload) {
  const row = {
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    payload: payload ? payload : null,
  } as any;
  // Tenta gravar no Supabase
  const { error } = await supabase.from('audit_logs').insert(row);
  if (error) {
    // Fallback: localStorage
    try {
      const key = 'audit_logs_local';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.push({ id: crypto.randomUUID?.() || Date.now().toString(), created_at: new Date().toISOString(), ...row });
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (_) {
      // ignore
    }
  }
}

export async function getAuditLogs(): Promise<Array<{ id: string; created_at: string; action: string; entity_type: string; entity_id: string | null; payload: any }>> {
  // Busca do Supabase, com fallback para localStorage
  const res = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
  let remote: any[] = [];
  if (!res.error && Array.isArray(res.data)) remote = res.data;
  let local: any[] = [];
  try {
    local = JSON.parse(localStorage.getItem('audit_logs_local') || '[]');
  } catch (_) {
    local = [];
  }
  return [...remote, ...local];
}

// FOLDERS
export async function listFolders(): Promise<string[]> {
  const { data, error } = await supabase.from(table.folders).select('name').order('name');
  if (error) throw error;
  return (data || []).map((r) => r.name as string);
}

export async function listFoldersWithIds(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase.from(table.folders).select('id, name').order('name');
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id as string, name: r.name as string }));
}

export async function createFolder(name: string): Promise<void> {
  const { error } = await supabase.from(table.folders).upsert({ name });
  if (error) throw error;
  await logAudit('folder.create', 'Folder', null, { name });
}

export async function deleteFolderByName(name: string): Promise<void> {
  const { error } = await supabase.from(table.folders).delete().eq('name', name);
  if (error) throw error;
  await logAudit('folder.delete', 'Folder', null, { name });
}

export async function getFolderIdByName(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nome da pasta inválido');
  // tenta buscar
  let { data, error } = await supabase.from(table.folders).select('id').eq('name', trimmed).maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id as string;
  // cria
  const ins = await supabase.from(table.folders).insert({ name: trimmed }).select('id').single();
  if (ins.error) throw ins.error;
  await logAudit('folder.create', 'Folder', ins.data!.id as string, { name: trimmed });
  return ins.data!.id as string;
}

// MATRICES
export async function listMatrices(): Promise<Matrix[]> {
  // Busca pastas (id->name), matrizes e eventos, e junta no cliente
  const [foldersRes, mres, eres] = await Promise.all([
    supabase.from(table.folders).select('id, name'),
    supabase.from(table.matrices).select('*').order('received_date', { ascending: true }),
    supabase.from(table.events).select('*').order('date', { ascending: true }),
  ]);
  if (foldersRes.error) throw foldersRes.error;
  if (mres.error) throw mres.error;
  if (eres.error) throw eres.error;

  const folderMap = new Map<string, string>();
  (foldersRes.data || []).forEach((f: any) => folderMap.set(f.id, f.name));

  const eventsByMatrix = new Map<string, MatrixEvent[]>();
  for (const e of eres.data || []) {
    const arr = eventsByMatrix.get(e.matrix_id) || [];
    arr.push({
      id: e.id,
      date: e.date,
      type: e.type,
      comment: e.comment || '',
      createdAt: e.created_at || undefined,
      location: e.location || undefined,
      responsible: e.responsible || undefined,
      machine: e.machine || undefined,
      images: [],
      observations: undefined,
      files: [],
    });
    eventsByMatrix.set(e.matrix_id, arr);
  }

  return (mres.data || []).map((m) => ({
    id: m.id,
    code: m.code,
    receivedDate: m.received_date,
    events: eventsByMatrix.get(m.id) || [],
    priority: m.priority || undefined,
    responsible: m.responsible || undefined,
    folder: m.folder_id ? (folderMap.get(m.folder_id) || undefined) : undefined,
  }));
}

export async function createMatrix(data: { code: string; receivedDate: string; folderId?: string | null; priority?: string | null; responsible?: string | null; }): Promise<string> {
  const payload = {
    code: data.code,
    received_date: data.receivedDate,
    folder_id: data.folderId ?? null,
    priority: data.priority ?? null,
    responsible: data.responsible ?? null,
  };
  const { data: res, error } = await supabase.from(table.matrices).insert(payload).select('id').single();
  if (error) throw error;
  const newId = res!.id as string;
  await logAudit('matrix.create', 'Matrix', newId, payload);
  return newId;
}

export async function updateMatrix(id: string, patch: Partial<{ receivedDate: string; folderId: string | null; priority: string | null; responsible: string | null; }>): Promise<void> {
  const payload: any = {};
  if (patch.receivedDate !== undefined) payload.received_date = patch.receivedDate;
  if (patch.folderId !== undefined) payload.folder_id = patch.folderId;
  if (patch.priority !== undefined) payload.priority = patch.priority;
  if (patch.responsible !== undefined) payload.responsible = patch.responsible;
  const { error } = await supabase.from(table.matrices).update(payload).eq('id', id);
  if (error) throw error;
  await logAudit('matrix.update', 'Matrix', id, payload);
}

export async function deleteMatrix(id: string): Promise<void> {
  const { error } = await supabase.from(table.matrices).delete().eq('id', id);
  if (error) throw error;
  await logAudit('matrix.delete', 'Matrix', id, null);
}

// EVENTS
export async function createEvent(matrixId: string, e: MatrixEvent): Promise<void> {
  const payload = {
    id: e.id,
    matrix_id: matrixId,
    date: e.date,
    type: e.type,
    comment: e.comment,
    created_at: e.createdAt ?? new Date().toISOString(),
    location: e.location ?? null,
    responsible: e.responsible ?? null,
  };
  const { error } = await supabase.from(table.events).insert(payload);
  if (error) throw error;
  await logAudit('event.create', 'Event', e.id, { matrix_id: matrixId, ...payload });
}

export async function updateEvent(eventId: string, patch: Partial<MatrixEvent>): Promise<void> {
  const payload: any = {};
  if (patch.date !== undefined) payload.date = patch.date;
  if (patch.type !== undefined) payload.type = patch.type;
  if (patch.comment !== undefined) payload.comment = patch.comment;
  if (patch.createdAt !== undefined) payload.created_at = patch.createdAt;
  if (patch.location !== undefined) payload.location = patch.location;
  if (patch.responsible !== undefined) payload.responsible = patch.responsible;
  const { error } = await supabase.from(table.events).update(payload).eq('id', eventId);
  if (error) throw error;
  await logAudit('event.update', 'Event', eventId, payload);
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from(table.events).delete().eq('id', eventId);
  if (error) throw error;
  await logAudit('event.delete', 'Event', eventId, null);
}

// EVENT FILES (somente metadados; upload real vai no Storage)
export async function addEventFile(eventId: string, meta: { file_name: string; mime_type?: string; file_size?: number; url: string; }): Promise<void> {
  const { error } = await supabase.from(table.event_files).insert({
    event_id: eventId,
    file_name: meta.file_name,
    mime_type: meta.mime_type ?? null,
    file_size: meta.file_size ?? null,
    url: meta.url,
  });
  if (error) throw error;
}

export async function listEventFiles(eventId: string): Promise<{ id: string; url: string; file_name: string; mime_type: string | null; file_size: number | null; }[]> {
  const { data, error } = await supabase.from(table.event_files).select('id, url, file_name, mime_type, file_size').eq('event_id', eventId).order('created_at');
  if (error) throw error;
  return data || [];
}

// IMPORTAÇÃO EM MASSA (LocalStorage -> Supabase)
export async function importMatrices(matrices: Matrix[]): Promise<{ folders: number; matrices: number; events: number; }>{
  // 1) Pastas
  const folderNames = Array.from(new Set(matrices.map(m => m.folder).filter((v): v is string => Boolean(v))));
  const folderIdMap = new Map<string, string>();
  for (const name of folderNames) {
    const id = await getFolderIdByName(name);
    folderIdMap.set(name, id);
  }

  // 2) Matrizes (upsert por code)
  let matricesInserted = 0;
  // Mapa code -> id real no banco
  const matrixIdByCode = new Map<string, string>();

  for (const m of matrices) {
    const payload: any = {
      code: m.code,
      received_date: m.receivedDate,
      folder_id: m.folder ? folderIdMap.get(m.folder) ?? null : null,
      priority: m.priority ?? null,
      responsible: m.responsible ?? null,
    };
    const { error } = await supabase
      .from(table.matrices)
      .upsert(payload, { onConflict: 'code' });
    if (error) throw error;
    // Buscar id real dessa matriz (pode não ser o id vindo do arquivo)
    const fetched = await supabase.from(table.matrices).select('id').eq('code', m.code).single();
    if (fetched.error) throw fetched.error;
    matrixIdByCode.set(m.code, fetched.data!.id as string);
    matricesInserted += 1;
  }

  // 3) Eventos (upsert por id)
  let eventsInserted = 0;
  for (const m of matrices) {
    const realMatrixId = matrixIdByCode.get(m.code)!;
    for (const e of (m.events || [])) {
      const ev = {
        id: e.id,
        matrix_id: realMatrixId,
        date: e.date,
        type: e.type,
        comment: e.comment,
        created_at: e.createdAt ?? new Date().toISOString(),
        location: e.location ?? null,
        responsible: e.responsible ?? null,
      };
      const { error } = await supabase.from(table.events).upsert(ev, { onConflict: 'id' });
      if (error) throw error;
      eventsInserted += 1;
    }
  }

  await logAudit('import', 'Import', null, { counts: { folders: folderNames.length, matrices: matricesInserted, events: eventsInserted } });
  return { folders: folderNames.length, matrices: matricesInserted, events: eventsInserted };
}

// ======================
// KANBAN - Supabase APIs
// ======================

export async function kanbanListColumns(): Promise<KanbanColumn[]> {
  const { data, error } = await supabase.from(ktable.columns).select('id, slug, title, position').order('position');
  if (error) throw error;
  return (data || []) as any;
}

export async function kanbanGetWip(): Promise<KanbanWipSetting[]> {
  const { data, error } = await supabase.from(ktable.wip).select('column_id, limit_value');
  if (error) throw error;
  return (data || []) as any;
}

export async function kanbanSetWip(columnId: string, limitValue: number): Promise<void> {
  const { error } = await supabase.from(ktable.wip).upsert({ column_id: columnId, limit_value: limitValue }, { onConflict: 'column_id' });
  if (error) throw error;
  await logAudit('kanban.wip.upsert', 'KanbanWip', columnId, { limitValue });
}

export async function kanbanListCards(): Promise<KanbanCardRow[]> {
  const { data, error } = await supabase
    .from(ktable.cards)
    .select('id, title, description, source, blocked, created_at, moved_at, matrix_id, matrix_code, column_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function kanbanCreateCard(payload: Partial<KanbanCardRow> & { title: string; column_id: string; source?: 'auto'|'manual' }): Promise<string> {
  const row: any = {
    title: payload.title,
    description: payload.description ?? null,
    source: payload.source ?? 'manual',
    blocked: payload.blocked ?? false,
    matrix_id: payload.matrix_id ?? null,
    matrix_code: payload.matrix_code ?? null,
    column_id: payload.column_id,
    moved_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(ktable.cards).insert(row).select('id').single();
  if (error) throw error;
  const id = (data as any).id as string;
  await logAudit('kanban.card.create', 'KanbanCard', id, row);
  return id;
}

export async function kanbanUpdateCard(id: string, patch: Partial<Pick<KanbanCardRow,'title'|'description'|'blocked'>>): Promise<void> {
  const upd: any = {};
  if (patch.title !== undefined) upd.title = patch.title;
  if (patch.description !== undefined) upd.description = patch.description;
  if (patch.blocked !== undefined) upd.blocked = patch.blocked;
  const { error } = await supabase.from(ktable.cards).update(upd).eq('id', id);
  if (error) throw error;
  await logAudit('kanban.card.update', 'KanbanCard', id, upd);
}

export async function kanbanMoveCard(id: string, columnId: string): Promise<void> {
  const { error } = await supabase.from(ktable.cards).update({ column_id: columnId, moved_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await logAudit('kanban.card.move', 'KanbanCard', id, { column_id: columnId });
}

export async function kanbanDeleteCard(id: string): Promise<void> {
  const { error } = await supabase.from(ktable.cards).delete().eq('id', id);
  if (error) throw error;
  await logAudit('kanban.card.delete', 'KanbanCard', id, null);
}

export async function kanbanListChecklist(cardId: string): Promise<KanbanChecklistRow[]> {
  const { data, error } = await supabase.from(ktable.checklist).select('id, card_id, text, done, created_at').eq('card_id', cardId).order('created_at');
  if (error) throw error;
  return (data || []) as any;
}

export async function kanbanAddChecklist(cardId: string, text: string): Promise<string> {
  const { data, error } = await supabase.from(ktable.checklist).insert({ card_id: cardId, text }).select('id').single();
  if (error) throw error;
  const id = (data as any).id as string;
  await logAudit('kanban.check.add', 'KanbanChecklist', id, { card_id: cardId, text });
  return id;
}

export async function kanbanToggleChecklist(itemId: string, done: boolean): Promise<void> {
  const { error } = await supabase.from(ktable.checklist).update({ done }).eq('id', itemId);
  if (error) throw error;
  await logAudit('kanban.check.toggle', 'KanbanChecklist', itemId, { done });
}

export async function kanbanDeleteChecklist(itemId: string): Promise<void> {
  const { error } = await supabase.from(ktable.checklist).delete().eq('id', itemId);
  if (error) throw error;
  await logAudit('kanban.check.delete', 'KanbanChecklist', itemId, null);
}
