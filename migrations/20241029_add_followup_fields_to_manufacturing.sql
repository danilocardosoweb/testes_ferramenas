/* ============================================================
   Migração: Adicionar suporte a follow-up de datas de entrega
   Data: 29/10/2025
   Objetivo: 
     1. Adicionar coluna 'original_delivery_date' para armazenar a data original de entrega
     2. Adicionar coluna 'follow_up_dates' (JSONB) para armazenar histórico de alterações
     3. Adicionar coluna 'follow_up_count' para contagem de alterações
   ============================================================ */

BEGIN;

-- 1) Adicionar coluna 'original_delivery_date' (timestamp with time zone)
ALTER TABLE IF EXISTS public.manufacturing_records 
ADD COLUMN IF NOT EXISTS original_delivery_date TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN public.manufacturing_records.original_delivery_date 
IS 'Data de entrega originalmente prevista no momento da aprovação';

-- 2) Adicionar coluna 'follow_up_dates' (JSONB com array de objetos)
ALTER TABLE IF EXISTS public.manufacturing_records 
ADD COLUMN IF NOT EXISTS follow_up_dates JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.manufacturing_records.follow_up_dates 
IS 'Array de objetos com histórico de alterações de data (cada objeto contém: date, previous_date, new_date, changed_by, reason)';

-- 3) Adicionar coluna 'follow_up_count' (inteiro)
ALTER TABLE IF EXISTS public.manufacturing_records 
ADD COLUMN IF NOT EXISTS follow_up_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.manufacturing_records.follow_up_count 
IS 'Número de vezes que a data de entrega foi alterada';

-- 4) Atualizar documentação da tabela
COMMENT ON TABLE public.manufacturing_records IS 
'Registros de confecção de matrizes. Cada registro representa uma solicitação de confecção de matriz, 
com status que evolui de "need" (necessidade) para "pending" (solicitação), "approved" (em fabricação) 
e "received" (recebida). Inclui campos para imagens, anexos, observações e histórico de follow-ups de entrega.';

-- 5) Atualizar registros existentes para terem original_delivery_date = estimated_delivery_date
UPDATE public.manufacturing_records 
SET original_delivery_date = estimated_delivery_date
WHERE status = 'approved' AND original_delivery_date IS NULL;

COMMIT;

/* ============================================================
   ROLLBACK (caso necessário)
   ============================================================
   BEGIN;
   ALTER TABLE public.manufacturing_records DROP COLUMN IF EXISTS original_delivery_date;
   ALTER TABLE public.manufacturing_records DROP COLUMN IF EXISTS follow_up_dates;
   ALTER TABLE public.manufacturing_records DROP COLUMN IF EXISTS follow_up_count;
   COMMIT;
   ============================================================ */
