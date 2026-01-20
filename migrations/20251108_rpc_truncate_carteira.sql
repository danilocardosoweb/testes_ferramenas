-- =============================================
-- 12/11/2025 - RPC para truncar analysis_carteira
-- Objetivo: sobrescrever totalmente antes de novo upload
-- =============================================

CREATE OR REPLACE FUNCTION public.analysis_carteira_truncate()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  TRUNCATE TABLE public.analysis_carteira RESTART IDENTITY;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analysis_carteira_truncate() TO anon, authenticated;

-- Recarregar cache do PostgREST (opcional)
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- ROLLBACK (se necessário)
-- REVOKE EXECUTE ON FUNCTION public.analysis_carteira_truncate() FROM anon, authenticated;
-- DROP FUNCTION IF EXISTS public.analysis_carteira_truncate();
