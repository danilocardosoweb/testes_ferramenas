-- =============================================================
-- 20/01/2026 - Migração: Adicionar coluna NF Saída na tabela cleaning_orders
-- Objetivo: Adicionar campo nf_saida para rastrear NF de saída das ferramentas
-- =============================================================

-- Adiciona coluna nf_saida se não existir
ALTER TABLE public.cleaning_orders
ADD COLUMN IF NOT EXISTS nf_saida varchar(50) NULL;

-- Cria índice para busca rápida por NF Saída
CREATE INDEX IF NOT EXISTS idx_cleaning_orders_nf_saida
ON public.cleaning_orders (nf_saida);

-- Rollback
-- DROP INDEX IF EXISTS public.idx_cleaning_orders_nf_saida;
-- ALTER TABLE public.cleaning_orders DROP COLUMN IF EXISTS nf_saida;
