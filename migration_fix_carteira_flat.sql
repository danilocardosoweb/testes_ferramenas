-- =============================================================
-- 14/11/2025 - CORREÇÃO CRÍTICA: Criar tabela analysis_carteira_flat
-- Esta tabela estava faltando e causando erro na VIEW
-- =============================================================

BEGIN;

-- Criar tabela plana para dados da Carteira (se não existir)
CREATE TABLE IF NOT EXISTS public.analysis_carteira_flat (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente text NOT NULL,
  ferramenta text NOT NULL,
  pedido_kg numeric NOT NULL,
  data_implant date,
  created_at timestamptz DEFAULT now()
);

-- RPC para truncar a tabela (sobrescrita total)
CREATE OR REPLACE FUNCTION public.analysis_carteira_flat_truncate()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  TRUNCATE TABLE public.analysis_carteira_flat RESTART IDENTITY;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analysis_carteira_flat_truncate() TO anon, authenticated;

-- Habilitar RLS
ALTER TABLE public.analysis_carteira_flat ENABLE ROW LEVEL SECURITY;

-- Políticas liberais para protótipo
DROP POLICY IF EXISTS analysis_carteira_flat_sel ON public.analysis_carteira_flat;
CREATE POLICY analysis_carteira_flat_sel ON public.analysis_carteira_flat FOR SELECT USING (true);

DROP POLICY IF EXISTS analysis_carteira_flat_ins ON public.analysis_carteira_flat;
CREATE POLICY analysis_carteira_flat_ins ON public.analysis_carteira_flat FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS analysis_carteira_flat_upd ON public.analysis_carteira_flat;
CREATE POLICY analysis_carteira_flat_upd ON public.analysis_carteira_flat FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS analysis_carteira_flat_del ON public.analysis_carteira_flat;
CREATE POLICY analysis_carteira_flat_del ON public.analysis_carteira_flat FOR DELETE USING (true);

-- Índice por chave normalizada (evita full scan ao agrupar por expressão)
CREATE INDEX IF NOT EXISTS idx_analysis_carteira_flat_ferr_key
  ON public.analysis_carteira_flat ((upper(trim(ferramenta))));

-- Índice para operações por data_implant
CREATE INDEX IF NOT EXISTS idx_analysis_carteira_flat_data_implant
  ON public.analysis_carteira_flat (data_implant DESC);

-- Recriar VIEW (drop first to ensure clean state)
DROP VIEW IF EXISTS public.analysis_carteira_last_implant;

-- VIEW com última data_implant por ferramenta normalizada
CREATE VIEW public.analysis_carteira_last_implant AS
SELECT
  upper(trim(ferramenta)) AS ferramenta_key,
  max(data_implant)       AS last_implant
FROM public.analysis_carteira_flat
WHERE data_implant IS NOT NULL
GROUP BY upper(trim(ferramenta));

GRANT SELECT ON public.analysis_carteira_last_implant TO anon, authenticated;

-- Notificar PostgREST para recarregar schema
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;

COMMIT;

-- IMPORTANTE: Após executar este script, você precisa:
-- 1. Re-importar a planilha da Carteira para popular a tabela
-- 2. Verificar se a VIEW está retornando dados corretamente
