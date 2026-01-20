-- =============================================
-- 12/11/2025 - Criar tabela analysis_carteira
-- Objetivo: tabela para Curva ABC da Carteira
-- =============================================

BEGIN;

-- Criar tabela analysis_carteira
CREATE TABLE IF NOT EXISTS public.analysis_carteira (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_analysis_carteira_payload ON public.analysis_carteira USING GIN (payload);
CREATE INDEX IF NOT EXISTS idx_analysis_carteira_created_at ON public.analysis_carteira (created_at DESC);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_analysis_carteira_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS tr_analysis_carteira_updated_at ON public.analysis_carteira;
CREATE TRIGGER tr_analysis_carteira_updated_at
  BEFORE UPDATE ON public.analysis_carteira
  FOR EACH ROW EXECUTE FUNCTION public.update_analysis_carteira_updated_at();

-- Habilitar RLS
ALTER TABLE public.analysis_carteira ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (acesso total para usuários autenticados)
DROP POLICY IF EXISTS analysis_carteira_select ON public.analysis_carteira;
CREATE POLICY analysis_carteira_select ON public.analysis_carteira FOR SELECT USING (true);

DROP POLICY IF EXISTS analysis_carteira_insert ON public.analysis_carteira;
CREATE POLICY analysis_carteira_insert ON public.analysis_carteira FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS analysis_carteira_update ON public.analysis_carteira;
CREATE POLICY analysis_carteira_update ON public.analysis_carteira FOR UPDATE USING (true);

DROP POLICY IF EXISTS analysis_carteira_delete ON public.analysis_carteira;
CREATE POLICY analysis_carteira_delete ON public.analysis_carteira FOR DELETE USING (true);

-- Adicionar à publicação realtime (se existir)
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.analysis_carteira';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Notificar PostgREST para recarregar schema
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;

COMMIT;

-- ROLLBACK (se necessário)
-- DROP TABLE IF EXISTS public.analysis_carteira CASCADE;
