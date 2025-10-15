import { supabase } from '@/lib/supabaseClient';
import { Matrix } from '@/types';

export interface TestingQueueItem {
  id: string;
  matrix_id: string;
  press: 'P18' | 'P19';
  available_at: string;
  done_at?: string;
  note?: string;
  images?: string[]; // Array de imagens em base64
  created_by?: string;
  updated_at: string;
  // Dados da matriz (join)
  matrix_code?: string;
  matrix_priority?: string;
  matrix_responsible?: string;
}

export interface TestingItem {
  id: string;
  matrix_id: string;
  matrix_code: string;
  press: 'P18' | 'P19';
  available_at: string;
  done_at?: string;
  note?: string;
  created_at: string;
}

// FILA DE PLANEJAMENTO (testing_queue)
export async function addToTestingQueue(matrixId: string, press: 'P18' | 'P19', note?: string): Promise<string> {
  // Primeiro, busca o código da matriz
  const { data: matrix, error: matrixError } = await supabase
    .from('matrices')
    .select('code')
    .eq('id', matrixId)
    .single();

  if (matrixError) throw matrixError;

  // Adiciona à fila
  const { data, error } = await supabase
    .from('testing_queue')
    .insert({
      matrix_id: matrixId,
      press,
      note,
      available_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;

  // Também adiciona ao histórico (testing_items)
  await supabase
    .from('testing_items')
    .insert({
      matrix_id: matrixId,
      matrix_code: matrix.code,
      press,
      note,
      available_at: new Date().toISOString(),
    });

  return data.id;
}

export async function listTestingQueue(): Promise<TestingQueueItem[]> {
  const { data, error } = await supabase
    .from('testing_queue')
    .select(`
      *,
      matrices!inner(
        code,
        priority,
        responsible
      )
    `)
    .is('done_at', null)
    .order('available_at', { ascending: true });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    id: item.id,
    matrix_id: item.matrix_id,
    press: item.press,
    available_at: item.available_at,
    done_at: item.done_at,
    note: item.note,
    images: item.images || [],
    created_by: item.created_by,
    updated_at: item.updated_at,
    matrix_code: item.matrices.code,
    matrix_priority: item.matrices.priority,
    matrix_responsible: item.matrices.responsible,
  }));
}

export async function startTestFromQueue(queueId: string): Promise<void> {
  // Busca o item da fila
  const { data: queueItem, error: queueError } = await supabase
    .from('testing_queue')
    .select('*')
    .eq('id', queueId)
    .single();

  if (queueError) throw queueError;

  // Marca como concluído na fila
  const { error: updateError } = await supabase
    .from('testing_queue')
    .update({ done_at: new Date().toISOString() })
    .eq('id', queueId);

  if (updateError) throw updateError;

  // Cria evento de teste na matriz
  const { error: eventError } = await supabase
    .from('events')
    .insert({
      matrix_id: queueItem.matrix_id,
      date: new Date().toISOString().split('T')[0],
      type: 'Testes',
      comment: queueItem.note || 'Teste iniciado da fila de planejamento',
      machine: queueItem.press,
      created_at: new Date().toISOString(),
    });

  if (eventError) throw eventError;

  // Atualiza o histórico (testing_items)
  await supabase
    .from('testing_items')
    .update({ done_at: new Date().toISOString() })
    .eq('matrix_id', queueItem.matrix_id)
    .eq('press', queueItem.press)
    .is('done_at', null);
}

export async function removeFromTestingQueue(queueId: string): Promise<void> {
  const { error } = await supabase
    .from('testing_queue')
    .delete()
    .eq('id', queueId);

  if (error) throw error;
}

export async function updateTestingQueueNote(queueId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('testing_queue')
    .update({ note })
    .eq('id', queueId);

  if (error) throw error;
}

export async function updateTestingQueueDetails(queueId: string, note: string, images: string[]): Promise<void> {
  const { error } = await supabase
    .from('testing_queue')
    .update({ note, images })
    .eq('id', queueId);

  if (error) throw error;
}

// HISTÓRICO DE TESTES (testing_items)
export async function listTestingHistory(): Promise<TestingItem[]> {
  const { data, error } = await supabase
    .from('testing_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// UTILITÁRIOS
export async function getAvailableMatricesForTesting(): Promise<Matrix[]> {
  // Busca matrizes com LEFT JOIN de eventos (para incluir matrizes sem eventos)
  const { data, error } = await supabase
    .from('matrices')
    .select(`
      id, code, received_date, priority, responsible, folder_id,
      events ( id, type, date, created_at, comment )
    `)
    .order('code');

  if (error) throw error;

  const available: Matrix[] = [];

  for (const m of (data as any[]) || []) {
    const events = (m.events || []) as Array<{ id: string; type: string; date: string; created_at: string; comment?: string }>;

    // 1) Não pode ter aprovação (evento explícito 'Aprovado')
    const hasApproval = events.some(e => e.type === 'Aprovado');
    if (hasApproval) continue;

    // 2) Não pode estar com teste ativo 
    // Um teste está ativo se o último evento "Testes" não tem "concluído" E não há eventos posteriores
    const sorted = [...events].sort((a,b) => {
      const dateA = a.created_at || a.date + 'T00:00:00Z';
      const dateB = b.created_at || b.date + 'T00:00:00Z';
      return dateA.localeCompare(dateB);
    });
    
    // Encontra o último evento "Testes"
    const testEvents = sorted.filter(e => e.type === 'Testes');
    if (testEvents.length > 0) {
      const lastTest = testEvents[testEvents.length - 1];
      const lastTestTime = lastTest.created_at || lastTest.date + 'T00:00:00Z';
      
      // Verifica se há eventos posteriores ao último teste
      const hasEventsAfterLastTest = sorted.some(e => {
        const eventTime = e.created_at || e.date + 'T00:00:00Z';
        return eventTime > lastTestTime;
      });
      
      // Teste ativo = último teste sem "concluído" E sem eventos posteriores
      const hasActiveTest = !(lastTest.comment && /concluído/i.test(lastTest.comment)) && !hasEventsAfterLastTest;
      if (hasActiveTest) continue;
    }

    // 3) Não pode estar na fila de planejamento
    const { data: queueItem } = await supabase
      .from('testing_queue')
      .select('id')
      .eq('matrix_id', m.id)
      .is('done_at', null)
      .maybeSingle();
    if (queueItem) continue;

    available.push({
      id: m.id,
      code: m.code,
      receivedDate: m.received_date,
      events: events.map(e => ({ 
        id: e.id, 
        date: e.date, 
        type: e.type, 
        comment: e.comment || '', 
        createdAt: e.created_at 
      } as any)),
      priority: m.priority,
      responsible: m.responsible,
      folder: undefined,
    });
  }

  return available;
}

export async function getTestingQueueStats(): Promise<{
  total: number;
  p18: number;
  p19: number;
  available: number;
}> {
  const [queueData, availableMatrices] = await Promise.all([
    listTestingQueue(),
    getAvailableMatricesForTesting(),
  ]);

  return {
    total: queueData.length,
    p18: queueData.filter(item => item.press === 'P18').length,
    p19: queueData.filter(item => item.press === 'P19').length,
    available: availableMatrices.length,
  };
}
