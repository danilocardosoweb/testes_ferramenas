-- =============================================
-- 12/11/2025 - RPC para truncar analysis_producao
-- Objetivo: sobrescrita total antes de novo upload
-- =============================================

-- Criar função RPC
CREATE OR REPLACE FUNCTION public.analysis_producao_truncate()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  TRUNCATE TABLE public.analysis_producao RESTART IDENTITY;
  RETURN true;
END;
$$;

-- Conceder permissões
GRANT EXECUTE ON FUNCTION public.analysis_producao_truncate() TO anon, authenticated;

-- Solicitar reload do schema PostgREST (opcional)
SELECT pg_notify('pgrst', 'reload schema');

-- =============================================
-- ROLLBACK (se necessário)
-- =============================================
-- REVOKE EXECUTE ON FUNCTION public.analysis_producao_truncate() FROM anon, authenticated;
-- DROP FUNCTION IF EXISTS public.analysis_producao_truncate();
