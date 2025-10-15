import { supabase } from '@/lib/supabaseClient';
import { createMatrix, createEvent } from './db';

export interface ManufacturingRecord {
  id: string;
  matrix_id?: string;
  matrix_code: string;
  manufacturing_type: 'nova' | 'reposicao';
  profile_type: 'tubular' | 'solido';
  supplier: string;
  custom_supplier?: string;
  delivery_date: string;
  matrix_images: string[];
  problem_images: string[];
  volume_produced?: number | null;
  technical_notes?: string;
  justification: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
}

export async function createManufacturingRecord(data: Omit<ManufacturingRecord, 'id' | 'created_at' | 'updated_at' | 'matrix_id'>): Promise<{ record: ManufacturingRecord; matrixId: string }> {
  // 1. Criar a matriz no sistema
  const newMatrixId = await createMatrix({
    code: data.matrix_code,
    receivedDate: new Date().toISOString().split('T')[0],
    priority: 'normal',
  });

  // 2. Criar evento de Recebimento
  await createEvent(newMatrixId, {
    id: crypto.randomUUID(),
    date: new Date().toISOString().split('T')[0],
    type: 'Recebimento',
    comment: `Confecção registrada - ${data.manufacturing_type === 'nova' ? 'Matriz Nova' : 'Reposição'} - Fornecedor: ${data.supplier === 'Outro' ? data.custom_supplier : data.supplier}`,
    location: 'Confecção',
  });

  // 3. Salvar registro de confecção
  const { data: record, error } = await supabase
    .from('manufacturing_records')
    .insert({
      matrix_id: newMatrixId,
      matrix_code: data.matrix_code,
      manufacturing_type: data.manufacturing_type,
      profile_type: data.profile_type,
      supplier: data.supplier,
      custom_supplier: data.custom_supplier,
      delivery_date: data.delivery_date,
      matrix_images: data.matrix_images,
      problem_images: data.problem_images,
      volume_produced: (data as any).volume_produced ?? null,
      technical_notes: data.technical_notes,
      justification: data.justification,
    })
    .select()
    .single();

  if (error) throw error;

  return { record: record as ManufacturingRecord, matrixId: newMatrixId };
}

export async function listManufacturingRecords(): Promise<ManufacturingRecord[]> {
  const { data, error } = await supabase
    .from('manufacturing_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as ManufacturingRecord[];
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
