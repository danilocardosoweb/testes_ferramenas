-- =============================================================
-- Migração: Consolidação de Segurança e Performance (Sem Login)
-- Objetivo: Habilitar RLS nas tabelas Kanban, criar políticas provisórias,
--           adicionar índices recomendados, impedir auto-referência em events,
--           ajustar search_path de funções e garantir triggers de updated_at.
-- Ambiente: Postgres 17 (Supabase)
-- =============================================================

BEGIN;

-- 1) Habilitar RLS nas tabelas Kanban (expostas via PostgREST)
ALTER TABLE IF EXISTS public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kanban_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kanban_wip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kanban_card_history ENABLE ROW LEVEL SECURITY;

-- 1.1) Políticas provisórias (liberais) para operação sem autenticação
-- Observação: em produção, restrinja para authenticated/service_role.
DROP POLICY IF EXISTS kanban_columns_sel ON public.kanban_columns;
CREATE POLICY kanban_columns_sel ON public.kanban_columns FOR SELECT USING (true);
DROP POLICY IF EXISTS kanban_columns_ins ON public.kanban_columns;
CREATE POLICY kanban_columns_ins ON public.kanban_columns FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS kanban_columns_upd ON public.kanban_columns;
CREATE POLICY kanban_columns_upd ON public.kanban_columns FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS kanban_columns_del ON public.kanban_columns;
CREATE POLICY kanban_columns_del ON public.kanban_columns FOR DELETE USING (true);

DROP POLICY IF EXISTS kanban_cards_sel ON public.kanban_cards;
CREATE POLICY kanban_cards_sel ON public.kanban_cards FOR SELECT USING (true);
DROP POLICY IF EXISTS kanban_cards_ins ON public.kanban_cards;
CREATE POLICY kanban_cards_ins ON public.kanban_cards FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS kanban_cards_upd ON public.kanban_cards;
CREATE POLICY kanban_cards_upd ON public.kanban_cards FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS kanban_cards_del ON public.kanban_cards;
CREATE POLICY kanban_cards_del ON public.kanban_cards FOR DELETE USING (true);

DROP POLICY IF EXISTS kanban_checklist_sel ON public.kanban_checklist;
CREATE POLICY kanban_checklist_sel ON public.kanban_checklist FOR SELECT USING (true);
DROP POLICY IF EXISTS kanban_checklist_ins ON public.kanban_checklist;
CREATE POLICY kanban_checklist_ins ON public.kanban_checklist FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS kanban_checklist_upd ON public.kanban_checklist;
CREATE POLICY kanban_checklist_upd ON public.kanban_checklist FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS kanban_checklist_del ON public.kanban_checklist;
CREATE POLICY kanban_checklist_del ON public.kanban_checklist FOR DELETE USING (true);

DROP POLICY IF EXISTS kanban_wip_settings_sel ON public.kanban_wip_settings;
CREATE POLICY kanban_wip_settings_sel ON public.kanban_wip_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS kanban_wip_settings_ins ON public.kanban_wip_settings;
CREATE POLICY kanban_wip_settings_ins ON public.kanban_wip_settings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS kanban_wip_settings_upd ON public.kanban_wip_settings;
CREATE POLICY kanban_wip_settings_upd ON public.kanban_wip_settings FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS kanban_wip_settings_del ON public.kanban_wip_settings;
CREATE POLICY kanban_wip_settings_del ON public.kanban_wip_settings FOR DELETE USING (true);

DROP POLICY IF EXISTS kanban_card_history_sel ON public.kanban_card_history;
CREATE POLICY kanban_card_history_sel ON public.kanban_card_history FOR SELECT USING (true);
DROP POLICY IF EXISTS kanban_card_history_ins ON public.kanban_card_history;
CREATE POLICY kanban_card_history_ins ON public.kanban_card_history FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS kanban_card_history_upd ON public.kanban_card_history;
CREATE POLICY kanban_card_history_upd ON public.kanban_card_history FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS kanban_card_history_del ON public.kanban_card_history;
CREATE POLICY kanban_card_history_del ON public.kanban_card_history FOR DELETE USING (true);

-- 2) Índices de performance
-- 2.1) events: timeline por matriz
CREATE INDEX IF NOT EXISTS idx_events_matrix_date ON public.events (matrix_id, date);

-- 2.2) FKs em kanban_card_history (advisors apontaram falta de cobertura)
CREATE INDEX IF NOT EXISTS idx_kanban_card_history_from_column ON public.kanban_card_history (from_column);
CREATE INDEX IF NOT EXISTS idx_kanban_card_history_to_column   ON public.kanban_card_history (to_column);

-- 3) Integridade: evitar auto-referência direta em events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint c
    WHERE  c.conname = 'events_no_self_parent'
    AND    c.conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_no_self_parent
      CHECK (parent_event_id IS NULL OR parent_event_id <> id);
  END IF;
END
$$;

-- 4) Ajustar search_path das funções sinalizadas pelos advisors
--    (aplica para todas as assinaturas encontradas com esses nomes)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
    AND    p.proname IN (
      'set_updated_at',
      'kanban_get_column_id',
      'trg_create_card_on_corr_saida',
      'trg_complete_card_on_corr_entrada'
    )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog', r.f);
  END LOOP;
END
$$;

-- 5) Criar triggers de updated_at onde existir coluna updated_at
--    Usa a função public.set_updated_at() se disponível.
DO $$
DECLARE
  t record;
  has_fn boolean := EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='set_updated_at'
  );
BEGIN
  IF has_fn THEN
    FOR t IN
      SELECT c.oid::regclass AS rel
      FROM   pg_class c
      JOIN   pg_namespace n ON n.oid = c.relnamespace
      WHERE  n.nspname = 'public'
      AND    c.relkind = 'r' -- tabelas
      AND    EXISTS (
        SELECT 1
        FROM   information_schema.columns col
        WHERE  col.table_schema = 'public'
        AND    col.table_name  = c.relname
        AND    col.column_name = 'updated_at'
      )
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger tg
        WHERE  tg.tgrelid = t.rel
        AND    tg.tgname = 'set_updated_at_trg'
      ) THEN
        EXECUTE format('CREATE TRIGGER set_updated_at_trg BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t.rel);
      END IF;
    END LOOP;
  END IF;
END
$$;

COMMIT;


-- =============================================================
-- Migração: Persistência Global de Notificações Enviadas
-- Objetivo: Registrar no banco os eventos já notificados por categoria,
--           permitindo que múltiplos usuários vejam o mesmo estado em tempo real
-- Data: 16/10/2025
-- =============================================================

BEGIN;

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.notifications_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('Aprovadas','Limpeza','Correção Externa')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL
);

-- Índices e unicidade (um registro por evento+categoria)
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_sent_event_cat
  ON public.notifications_sent(event_id, category);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_event
  ON public.notifications_sent(event_id);

-- RLS liberal para protótipo
ALTER TABLE IF EXISTS public.notifications_sent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_sent_sel ON public.notifications_sent;
CREATE POLICY notifications_sent_sel ON public.notifications_sent FOR SELECT USING (true);
DROP POLICY IF EXISTS notifications_sent_ins ON public.notifications_sent;
CREATE POLICY notifications_sent_ins ON public.notifications_sent FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS notifications_sent_del ON public.notifications_sent;
CREATE POLICY notifications_sent_del ON public.notifications_sent FOR DELETE USING (true);

COMMIT;

-- =============================================================
-- ROLLBACK - Persistência Global de Notificações Enviadas
-- =============================================================

BEGIN;
DROP TABLE IF EXISTS public.notifications_sent;
COMMIT;

-- =============================================================
-- ROLLBACK
-- =============================================================

BEGIN;

-- Remover triggers de updated_at criadas
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS rel
    FROM   pg_class c
    JOIN   pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public' AND c.relkind='r'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_trigger tg
      WHERE  tg.tgrelid = t.rel AND tg.tgname = 'set_updated_at_trg'
    ) THEN
      EXECUTE format('DROP TRIGGER set_updated_at_trg ON %s', t.rel);
    END IF;
  END LOOP;
END
$$;

-- Remover constraint anti auto-referência em events
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'events_no_self_parent'
    AND   c.conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events DROP CONSTRAINT events_no_self_parent;
  END IF;
END
$$;

-- Remover índices criados
DROP INDEX IF EXISTS public.idx_events_matrix_date;
DROP INDEX IF EXISTS public.idx_kanban_card_history_from_column;
DROP INDEX IF EXISTS public.idx_kanban_card_history_to_column;

-- Remover políticas criadas (mantém RLS habilitado)
DROP POLICY IF EXISTS kanban_columns_sel ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_ins ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_upd ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_del ON public.kanban_columns;

DROP POLICY IF EXISTS kanban_cards_sel ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_ins ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_upd ON public.kanban_cards;
DROP POLICY IF EXISTS kanban_cards_del ON public.kanban_cards;

DROP POLICY IF EXISTS kanban_checklist_sel ON public.kanban_checklist;
DROP POLICY IF EXISTS kanban_checklist_ins ON public.kanban_checklist;
DROP POLICY IF EXISTS kanban_checklist_upd ON public.kanban_checklist;
DROP POLICY IF EXISTS kanban_checklist_del ON public.kanban_checklist;

DROP POLICY IF EXISTS kanban_wip_settings_sel ON public.kanban_wip_settings;
DROP POLICY IF EXISTS kanban_wip_settings_ins ON public.kanban_wip_settings;
DROP POLICY IF EXISTS kanban_wip_settings_upd ON public.kanban_wip_settings;
DROP POLICY IF EXISTS kanban_wip_settings_del ON public.kanban_wip_settings;

DROP POLICY IF EXISTS kanban_card_history_sel ON public.kanban_card_history;
DROP POLICY IF EXISTS kanban_card_history_ins ON public.kanban_card_history;
DROP POLICY IF EXISTS kanban_card_history_upd ON public.kanban_card_history;
DROP POLICY IF EXISTS kanban_card_history_del ON public.kanban_card_history;

COMMIT;

-- =============================================================
-- Migração: Adicionar campo test_status à tabela events
-- Objetivo: Registrar status do teste (Aprovado/Reprovado) para eventos tipo Testes
-- Data: 16/10/2025
-- =============================================================

BEGIN;
ALTER TABLE IF EXISTS public.events ADD COLUMN IF NOT EXISTS test_status TEXT CHECK (test_status IN ('Aprovado', 'Reprovado') OR test_status IS NULL);
COMMIT;

-- =============================================================
-- ROLLBACK - Campo test_status na tabela events
-- =============================================================

BEGIN;
ALTER TABLE IF EXISTS public.events DROP COLUMN IF EXISTS test_status;
COMMIT;

-- =============================================================
-- Migração: Adicionar campos de controle na tabela manufacturing_records
-- Objetivo: Permitir marcar registros como processados em vez de deletá-los
-- Data: 15/10/2025
-- =============================================================

BEGIN;

-- Adicionar colunas para controle de processamento
ALTER TABLE IF EXISTS public.manufacturing_records 
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS public.manufacturing_records 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'received'));

-- Criar índice para performance na consulta de registros não processados
CREATE INDEX IF NOT EXISTS idx_manufacturing_records_processed 
ON public.manufacturing_records (processed_at) 
WHERE processed_at IS NULL;

-- Habilitar RLS na tabela manufacturing_records se não estiver habilitado
ALTER TABLE IF EXISTS public.manufacturing_records ENABLE ROW LEVEL SECURITY;

-- Políticas liberais para operação (ajustar em produção)
DROP POLICY IF EXISTS manufacturing_records_sel ON public.manufacturing_records;
CREATE POLICY manufacturing_records_sel ON public.manufacturing_records FOR SELECT USING (true);

DROP POLICY IF EXISTS manufacturing_records_ins ON public.manufacturing_records;
CREATE POLICY manufacturing_records_ins ON public.manufacturing_records FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS manufacturing_records_upd ON public.manufacturing_records;
CREATE POLICY manufacturing_records_upd ON public.manufacturing_records FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS manufacturing_records_del ON public.manufacturing_records;
CREATE POLICY manufacturing_records_del ON public.manufacturing_records FOR DELETE USING (true);

COMMIT;

