-- =============================================================
-- Tabelas: email_groups e notification_group_mappings
-- Objetivo: Gerenciar grupos de e-mail e mapear categorias de notificação
-- Data: 21/10/2025
-- =============================================================

BEGIN;

-- Tabela de grupos de e-mail
CREATE TABLE IF NOT EXISTS public.email_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emails text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de mapeamento categoria -> grupo
CREATE TABLE IF NOT EXISTS public.notification_group_mappings (
  category text PRIMARY KEY,
  group_id uuid REFERENCES public.email_groups(id) ON DELETE SET NULL,
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

DROP TRIGGER IF EXISTS trg_email_groups_updated_at ON public.email_groups;
CREATE TRIGGER trg_email_groups_updated_at
BEFORE UPDATE ON public.email_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_group_mappings_updated_at ON public.notification_group_mappings;
CREATE TRIGGER trg_notification_group_mappings_updated_at
BEFORE UPDATE ON public.notification_group_mappings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seeds iniciais: grupos de exemplo
INSERT INTO public.email_groups (name, emails) VALUES
  ('Gerência', ARRAY['gerencia@empresa.com', 'diretor@empresa.com']),
  ('Produção', ARRAY['producao@empresa.com', 'supervisor@empresa.com']),
  ('Qualidade', ARRAY['qualidade@empresa.com', 'inspetor@empresa.com'])
ON CONFLICT DO NOTHING;

COMMIT;
