-- =============================================================
-- Tabela: email_templates
-- Objetivo: Armazenar modelos de e-mail editáveis via Configurações
-- Data: 21/10/2025
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_templates (
  key text PRIMARY KEY,
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER trg_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seeds iniciais (vazios)
INSERT INTO public.email_templates (key, name) VALUES
  ('aprovadas','Aprovadas') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.email_templates (key, name) VALUES
  ('reprovado','Reprovado') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.email_templates (key, name) VALUES
  ('limpeza','Limpeza') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.email_templates (key, name) VALUES
  ('correcao_externa','Correção Externa') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.email_templates (key, name) VALUES
  ('recebidas','Recebidas') ON CONFLICT (key) DO NOTHING;

COMMIT;


