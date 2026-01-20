-- =============================================================
-- MIGRAÇÃO: Workflow completo + Prioridades + Data Estimada
-- Execute este código no SQL Editor do Supabase
-- Data: 20/10/2025 12:20
-- 
-- FLUXO DO WORKFLOW:
-- need (Necessidade) → pending (Solicitação) → approved (Em Fabricação) → received (Recebida)
-- 
-- MUDANÇAS:
-- 1. Campo 'status' com 4 valores
-- 2. Campo 'priority' para Necessidade (low, medium, high, critical)
-- 3. Renomear 'delivery_date' para 'estimated_delivery_date'
-- 4. Campo não obrigatório no registro, preenchido na aprovação
-- =============================================================

BEGIN;

-- 1. Remover a constraint antiga de status
ALTER TABLE manufacturing_records 
DROP CONSTRAINT IF EXISTS manufacturing_records_status_check;

-- 2. Adicionar a nova constraint com 4 status
ALTER TABLE manufacturing_records 
ADD CONSTRAINT manufacturing_records_status_check 
CHECK (status IN ('need', 'pending', 'approved', 'received'));

-- 3. Atualizar o default para 'need'
ALTER TABLE manufacturing_records 
ALTER COLUMN status SET DEFAULT 'need';

-- 4. Adicionar campo de prioridade
ALTER TABLE manufacturing_records 
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' 
CHECK (priority IN ('low', 'medium', 'high', 'critical'));

-- 5. Renomear delivery_date para estimated_delivery_date
ALTER TABLE manufacturing_records 
RENAME COLUMN delivery_date TO estimated_delivery_date;

-- 6. Tornar estimated_delivery_date opcional (será preenchida na aprovação)
ALTER TABLE manufacturing_records 
ALTER COLUMN estimated_delivery_date DROP NOT NULL;

-- 7. Adicionar campos de timestamp para Lead Time
ALTER TABLE manufacturing_records 
ADD COLUMN IF NOT EXISTS moved_to_pending_at TIMESTAMPTZ;

ALTER TABLE manufacturing_records 
ADD COLUMN IF NOT EXISTS moved_to_approved_at TIMESTAMPTZ;

ALTER TABLE manufacturing_records 
ADD COLUMN IF NOT EXISTS moved_to_received_at TIMESTAMPTZ;

COMMENT ON COLUMN manufacturing_records.moved_to_pending_at IS 'Data/hora da transição: Necessidade → Solicitação';
COMMENT ON COLUMN manufacturing_records.moved_to_approved_at IS 'Data/hora da transição: Solicitação → Em Fabricação';
COMMENT ON COLUMN manufacturing_records.moved_to_received_at IS 'Data/hora da transição: Em Fabricação → Recebida';

-- 8. Migrar registros existentes
UPDATE manufacturing_records 
SET status = 'need' 
WHERE status IS NULL OR status NOT IN ('need', 'pending', 'approved', 'received');

UPDATE manufacturing_records 
SET priority = 'medium' 
WHERE priority IS NULL;

COMMIT;

-- =============================================================
-- VERIFICAÇÕES
-- =============================================================

-- Ver a definição da constraint atualizada
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'manufacturing_records'::regclass
AND conname = 'manufacturing_records_status_check';

-- Ver quantidade de registros por status
SELECT 
    status,
    COUNT(*) as total
FROM manufacturing_records
WHERE processed_at IS NULL
GROUP BY status
ORDER BY 
    CASE status
        WHEN 'need' THEN 1
        WHEN 'pending' THEN 2
        WHEN 'approved' THEN 3
        WHEN 'received' THEN 4
    END;
