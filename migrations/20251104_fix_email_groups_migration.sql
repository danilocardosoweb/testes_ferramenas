-- =============================================================
-- Migração: Adicionar coluna 'emails' à tabela email_groups existente
-- Objetivo: Corrigir estrutura da tabela para suportar arrays de e-mails
-- Data: 21/10/2025
-- =============================================================

BEGIN;

-- 1. Verificar se a coluna 'emails' existe, se não, adicionar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_groups' 
        AND column_name = 'emails' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.email_groups 
        ADD COLUMN emails text[] NOT NULL DEFAULT '{}';
        
        RAISE NOTICE 'Coluna emails adicionada à tabela email_groups';
    ELSE
        RAISE NOTICE 'Coluna emails já existe na tabela email_groups';
    END IF;
END $$;

-- 2. Verificar se a coluna 'created_at' existe, se não, adicionar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_groups' 
        AND column_name = 'created_at' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.email_groups 
        ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
        
        RAISE NOTICE 'Coluna created_at adicionada à tabela email_groups';
    ELSE
        RAISE NOTICE 'Coluna created_at já existe na tabela email_groups';
    END IF;
END $$;

-- 3. Verificar se a coluna 'updated_at' existe, se não, adicionar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_groups' 
        AND column_name = 'updated_at' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.email_groups 
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
        
        RAISE NOTICE 'Coluna updated_at adicionada à tabela email_groups';
    ELSE
        RAISE NOTICE 'Coluna updated_at já existe na tabela email_groups';
    END IF;
END $$;

-- 4. Criar tabela de mapeamento se não existir
CREATE TABLE IF NOT EXISTS public.notification_group_mappings (
  category text PRIMARY KEY,
  group_id uuid REFERENCES public.email_groups(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Criar função de trigger se não existir
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Criar triggers
DROP TRIGGER IF EXISTS trg_email_groups_updated_at ON public.email_groups;
CREATE TRIGGER trg_email_groups_updated_at
BEFORE UPDATE ON public.email_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_group_mappings_updated_at ON public.notification_group_mappings;
CREATE TRIGGER trg_notification_group_mappings_updated_at
BEFORE UPDATE ON public.notification_group_mappings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Seeds iniciais: grupos de exemplo (apenas se não existirem)
INSERT INTO public.email_groups (name, emails) VALUES
  ('Gerência', ARRAY['gerencia@empresa.com', 'diretor@empresa.com']),
  ('Produção', ARRAY['producao@empresa.com', 'supervisor@empresa.com']),
  ('Qualidade', ARRAY['qualidade@empresa.com', 'inspetor@empresa.com'])
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- =============================================================
-- Verificação final
-- =============================================================

-- Verificar estrutura final da tabela
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'email_groups' 
AND table_schema = 'public'
ORDER BY ordinal_position;
