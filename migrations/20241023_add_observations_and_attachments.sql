-- =============================================================
-- Migração: Adicionar suporte a observações e anexos em registros de confecção
-- Data: 23/10/2025
-- Objetivo: 
--   1. Adicionar coluna 'observacoes' na tabela manufacturing_records
--   2. Adicionar coluna 'anexos' (JSONB) na tabela manufacturing_records
--   3. Atualizar documentação relacionada
-- =============================================================

BEGIN;

-- 1) Adicionar coluna 'observacoes' (texto opcional)
ALTER TABLE IF EXISTS public.manufacturing_records 
ADD COLUMN IF NOT EXISTS observacoes TEXT NULL;

COMMENT ON COLUMN public.manufacturing_records.observacoes 
IS 'Campo para observações adicionais sobre a confecção da matriz';

-- 2) Adicionar coluna 'anexos' (JSONB com array de objetos)
ALTER TABLE IF EXISTS public.manufacturing_records 
ADD COLUMN IF NOT EXISTS anexos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.manufacturing_records.anexos 
IS 'Array de objetos com informações de anexos (cada objeto contém: id, url, nome_arquivo, tipo_mime, tamanho)';

-- 3) Atualizar documentação (comentários adicionais)
COMMENT ON TABLE public.manufacturing_records IS 
'Registros de confecção de matrizes. Cada registro representa uma solicitação de confecção de matriz, 
com status que evolui de "need" (necessidade) para "pending" (solicitação), "approved" (em fabricação) 
e "received" (recebida). Inclui campos para imagens, anexos e observações.';

COMMIT;

-- =============================================================
-- ROLLBACK (caso necessário)
-- =============================================================
-- BEGIN;
-- ALTER TABLE public.manufacturing_records DROP COLUMN IF EXISTS observacoes;
-- ALTER TABLE public.manufacturing_records DROP COLUMN IF EXISTS anexos;
-- COMMIT;
-- =============================================================
