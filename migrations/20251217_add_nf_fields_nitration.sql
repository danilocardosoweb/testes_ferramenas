-- =============================================================
-- 20/01/2026 - Migração: Adicionar colunas NF Saída e NF Retorno
-- Objetivo: Adicionar campos nf_saida e nf_retorno para controle de NF em Nitretação
-- =============================================================

-- Adiciona coluna nf_saida se não existir
ALTER TABLE public.cleaning_orders
ADD COLUMN IF NOT EXISTS nf_saida varchar(50) NULL;

-- Adiciona coluna nf_retorno se não existir
ALTER TABLE public.cleaning_orders
ADD COLUMN IF NOT EXISTS nf_retorno varchar(50) NULL;

-- Cria índice para busca rápida por NF Saída
CREATE INDEX IF NOT EXISTS idx_cleaning_orders_nf_saida
ON public.cleaning_orders (nf_saida);

-- Cria índice para busca rápida por NF Retorno
CREATE INDEX IF NOT EXISTS idx_cleaning_orders_nf_retorno
ON public.cleaning_orders (nf_retorno);

-- Rollback
-- DROP INDEX IF EXISTS public.idx_cleaning_orders_nf_saida;
-- DROP INDEX IF EXISTS public.idx_cleaning_orders_nf_retorno;
-- ALTER TABLE public.cleaning_orders DROP COLUMN IF EXISTS nf_saida;
-- ALTER TABLE public.cleaning_orders DROP COLUMN IF EXISTS nf_retorno;
