import { supabase } from '@/lib/supabaseClient';
import { createMatrix, createEvent } from './db';

export interface ManufacturingRecord {
  id: string;
  matrix_id?: string;
  matrix_code: string;
  manufacturing_type: 'nova' | 'reposicao';
  profile_type: 'tubular' | 'solido';
  package_size?: string | null;
  hole_count?: number | null;
  supplier: string;
  custom_supplier?: string;
  estimated_delivery_date?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  matrix_images: string[];
  problem_images: string[];
  volume_produced?: number | null;
  technical_notes?: string;
  justification: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  processed_at?: string | null;
  status?: 'need' | 'pending' | 'approved' | 'received' | null;
  moved_to_pending_at?: string | null;
  moved_to_approved_at?: string | null;
  moved_to_received_at?: string | null;
}

// Cache leve em memória (válido por 30 segundos)
let _manufCache: ManufacturingRecord[] = [];
let _manufCacheAt = 0; // epoch ms
const MANUF_CACHE_TTL_MS = 30_000;

export function getCachedManufacturingRecords(): ManufacturingRecord[] {
  return _manufCache;
}

export async function prefetchManufacturingRecords(force = false): Promise<ManufacturingRecord[]> {
  const now = Date.now();
  const fresh = now - _manufCacheAt < MANUF_CACHE_TTL_MS;
  if (!force && fresh && _manufCache.length) return _manufCache;
  const data = await listManufacturingRecords();
  return data;
}

// Função auxiliar para calcular dias úteis (exclui sábados e domingos)
export function addBusinessDays(startDate: Date, daysToAdd: number): Date {
  let currentDate = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < daysToAdd) {
    currentDate.setDate(currentDate.getDate() + 1);
    const dayOfWeek = currentDate.getDay();
    // 0 = Domingo, 6 = Sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }

  return currentDate;
}

// Função para calcular lead time em dias entre duas datas
export function calculateLeadTimeDays(startDate: string | null | undefined, endDate: string | null | undefined): number | null {
  if (!startDate || !endDate) return null;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

// Função para calcular lead time formatado
export function getLeadTimeDisplay(record: ManufacturingRecord): string {
  // Dependendo do status atual, mostra o lead time relevante
  switch (record.status) {
    case 'need':
      return '-'; // Ainda não moveu para nenhum status
    case 'pending':
      // Mostra tempo entre need e pending
      const lt1 = calculateLeadTimeDays(record.created_at, record.moved_to_pending_at);
      return lt1 !== null ? `${lt1}d` : '-';
    case 'approved':
      // Mostra tempo entre pending e approved
      const lt2 = calculateLeadTimeDays(record.moved_to_pending_at, record.moved_to_approved_at);
      return lt2 !== null ? `${lt2}d` : '-';
    case 'received':
      // Mostra tempo entre approved e received
      const lt3 = calculateLeadTimeDays(record.moved_to_approved_at, record.moved_to_received_at);
      return lt3 !== null ? `${lt3}d` : '-';
    default:
      return '-';
  }
}

// Calcular médias de Lead Time para Dashboard
export function calculateLeadTimeAverages(records: ManufacturingRecord[]) {
  // Necessidade → Solicitação
  const needToPending = records
    .filter(r => r.moved_to_pending_at)
    .map(r => calculateLeadTimeDays(r.created_at, r.moved_to_pending_at))
    .filter(d => d !== null) as number[];
  
  const avgNeedToPending = needToPending.length > 0 
    ? Math.round(needToPending.reduce((a, b) => a + b, 0) / needToPending.length)
    : null;

  // Solicitação → Em Fabricação
  const pendingToApproved = records
    .filter(r => r.moved_to_approved_at)
    .map(r => calculateLeadTimeDays(r.moved_to_pending_at, r.moved_to_approved_at))
    .filter(d => d !== null) as number[];
  
  const avgPendingToApproved = pendingToApproved.length > 0
    ? Math.round(pendingToApproved.reduce((a, b) => a + b, 0) / pendingToApproved.length)
    : null;

  // Em Fabricação → Recebida
  const approvedToReceived = records
    .filter(r => r.moved_to_received_at)
    .map(r => calculateLeadTimeDays(r.moved_to_approved_at, r.moved_to_received_at))
    .filter(d => d !== null) as number[];
  
  const avgApprovedToReceived = approvedToReceived.length > 0
    ? Math.round(approvedToReceived.reduce((a, b) => a + b, 0) / approvedToReceived.length)
    : null;

  return {
    needToPending: avgNeedToPending,
    pendingToApproved: avgPendingToApproved,
    approvedToReceived: avgApprovedToReceived,
    totalRecords: records.length,
    samplesNeedToPending: needToPending.length,
    samplesPendingToApproved: pendingToApproved.length,
    samplesApprovedToReceived: approvedToReceived.length
  };
}

export async function createManufacturingRecord(data: Omit<ManufacturingRecord, 'id' | 'created_at' | 'updated_at' | 'matrix_id'>): Promise<{ record: ManufacturingRecord }> {
  // Apenas salvar registro de confecção - matriz será criada quando recebida
  const { data: record, error } = await supabase
    .from('manufacturing_records')
    .insert({
      matrix_code: data.matrix_code,
      manufacturing_type: data.manufacturing_type,
      profile_type: data.profile_type,
      package_size: data.package_size ?? null,
      hole_count: data.hole_count ?? null,
      supplier: data.supplier,
      custom_supplier: data.custom_supplier,
      priority: data.priority || 'medium',
      matrix_images: data.matrix_images,
      problem_images: data.problem_images,
      volume_produced: (data as any).volume_produced ?? null,
      technical_notes: data.technical_notes,
      justification: data.justification,
      status: 'need'
    })
    .select()
    .single();

  if (error) throw error;

  return { record: record as ManufacturingRecord };
}

export async function listManufacturingRecords(): Promise<ManufacturingRecord[]> {
  const { data, error } = await supabase
    .from('manufacturing_records')
    .select('*')
    .is('processed_at', null) // Apenas registros não processados
    .order('created_at', { ascending: false });

  if (error) throw error;
  const list = (data || []) as ManufacturingRecord[];
  _manufCache = list;
  _manufCacheAt = Date.now();
  return list;
}

export async function getManufacturingRecordByMatrixId(matrixId: string): Promise<ManufacturingRecord | null> {
  const { data, error } = await supabase
    .from('manufacturing_records')
    .select('*')
    .eq('matrix_id', matrixId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data as ManufacturingRecord;
}

export async function receiveManufacturingMatrix(
  recordId: string, 
  matrixData: {
    receivedDate: string;
    priority: 'normal' | 'medium' | 'critical';
    responsible?: string;
    folder?: string;
  }
): Promise<{ matrixId: string }> {
  // 1. Buscar o registro de confecção
  const { data: record, error: fetchError } = await supabase
    .from('manufacturing_records')
    .select('*')
    .eq('id', recordId)
    .single();

  if (fetchError) throw fetchError;
  if (!record) throw new Error('Registro de confecção não encontrado');

  // 2. Buscar ID da pasta pelo nome (se fornecido)
  let folderId: string | undefined;
  if (matrixData.folder) {
    const { data: folderData, error: folderError } = await supabase
      .from('folders')
      .select('id')
      .eq('name', matrixData.folder)
      .single();
    
    if (!folderError && folderData) {
      folderId = folderData.id;
    } else {
      // Se a pasta não existe, criar uma nova
      const { data: newFolder, error: createError } = await supabase
        .from('folders')
        .insert({ name: matrixData.folder })
        .select('id')
        .single();
      
      if (!createError && newFolder) {
        folderId = newFolder.id;
      }
    }
  }

  // 3. Verificar se a matriz já existe
  const { data: existingMatrix, error: checkError } = await supabase
    .from('matrices')
    .select('id')
    .eq('code', record.matrix_code)
    .single();

  let matrixId: string;
  
  if (!checkError && existingMatrix) {
    // Matriz já existe, usar a existente
    matrixId = existingMatrix.id;
  } else {
    // Matriz não existe, criar nova
    const { createMatrix } = await import('./db');
    matrixId = await createMatrix({
      code: record.matrix_code,
      receivedDate: matrixData.receivedDate,
      priority: matrixData.priority,
      responsible: matrixData.responsible,
      folderId: folderId,
    });
  }

  // 4. Garantir evento de Recebimento: se não existir na data, criar
  {
    // Verifica se já existe um evento de Recebimento nessa data
    const { data: existingRecv, error: recvErr } = await supabase
      .from('events')
      .select('id')
      .eq('matrix_id', matrixId)
      .eq('type', 'Recebimento')
      .eq('date', matrixData.receivedDate)
      .maybeSingle();

    if (!recvErr && !existingRecv) {
      const { createEvent } = await import('./db');
      await createEvent(matrixId, {
        id: crypto.randomUUID(),
        date: matrixData.receivedDate,
        type: 'Recebimento',
        comment: `Matriz recebida da confecção - ${record.manufacturing_type === 'nova' ? 'Matriz Nova' : 'Reposição'} - Fornecedor: ${record.supplier === 'Outro' ? record.custom_supplier : record.supplier}`,
        location: 'Recebimento',
      });
    }
  }

  // 5. Marcar registro como processado e associar à matriz
  const { error: updateError } = await supabase
    .from('manufacturing_records')
    .update({ 
      matrix_id: matrixId,
      processed_at: new Date().toISOString(),
      status: 'received' 
    })
    .eq('id', recordId);

  if (updateError) throw updateError;

  return { matrixId: matrixId };
}

export async function deleteManufacturingRecord(recordId: string): Promise<void> {
  // Função mantida para compatibilidade - agora apenas marca como processado
  const { error } = await supabase
    .from('manufacturing_records')
    .update({ 
      processed_at: new Date().toISOString(),
      status: 'received' 
    })
    .eq('id', recordId);

  if (error) throw error;
}

export async function permanentlyDeleteManufacturingRecord(recordId: string): Promise<void> {
  // Deletar permanentemente o registro de confecção
  const { error } = await supabase
    .from('manufacturing_records')
    .delete()
    .eq('id', recordId);

  if (error) throw error;
}

export async function moveToSolicitation(recordId: string): Promise<void> {
  // Mover de Necessidade para Solicitação (processo interno)
  const { error } = await supabase
    .from('manufacturing_records')
    .update({ 
      status: 'pending',
      moved_to_pending_at: new Date().toISOString()
    })
    .eq('id', recordId);

  if (error) throw error;
}

export async function approveManufacturingRequest(recordId: string, estimatedDeliveryDate: string): Promise<void> {
  // Aprovar solicitação para fabricação (vai para fornecedor)
  const { error } = await supabase
    .from('manufacturing_records')
    .update({ 
      status: 'approved',
      estimated_delivery_date: estimatedDeliveryDate,
      moved_to_approved_at: new Date().toISOString()
    })
    .eq('id', recordId);

  if (error) throw error;
}

export async function approveMultipleRequests(recordIds: string[], estimatedDeliveryDate: string): Promise<void> {
  // Aprovar múltiplas solicitações de uma vez
  const { error } = await supabase
    .from('manufacturing_records')
    .update({ 
      status: 'approved',
      estimated_delivery_date: estimatedDeliveryDate,
      moved_to_approved_at: new Date().toISOString()
    })
    .in('id', recordIds);

  if (error) throw error;
}

export async function updatePriority(recordId: string, priority: 'low' | 'medium' | 'high' | 'critical'): Promise<void> {
  // Atualizar prioridade de uma necessidade
  const { error } = await supabase
    .from('manufacturing_records')
    .update({ priority })
    .eq('id', recordId);

  if (error) throw error;
}
