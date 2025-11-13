-- =============================================================
-- =============================================
-- 11/11/2025 - Migração: Normalizar data em analysis_producao
-- Objetivo: criar coluna gerada 'produced_at' (timestamptz) a partir de payload->>'Data Produção' (DD/MM/AAAA),
--           e índice para ordenação/filtragem por período.
-- =============================================
DO $$
BEGIN
  -- Adiciona coluna gerada apenas se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analysis_producao' AND column_name = 'produced_at'
  ) THEN
    ALTER TABLE public.analysis_producao
      ADD COLUMN produced_at timestamptz GENERATED ALWAYS AS (
        (to_date((payload->>'Data Produção'), 'DD/MM/YYYY')::timestamp AT TIME ZONE 'UTC')
      ) STORED;
  END IF;

  -- Cria índice para produced_at, caso não exista
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_analysis_producao_produced_at'
  ) THEN
    CREATE INDEX idx_analysis_producao_produced_at ON public.analysis_producao (produced_at DESC);
  END IF;
END $$;

-- Rollback (produced_at gerado)
-- Para reverter:
-- DROP INDEX IF EXISTS public.idx_analysis_producao_produced_at;
-- ALTER TABLE public.analysis_producao DROP COLUMN IF EXISTS produced_at;

-- =============================================
-- 12/11/2025 - Migração: Normalizar data via coluna "produced_on" (DATE) + trigger + índice
-- Objetivo: manter a data de produção a partir de payload->>'Data Produção' (aceita DD/MM/AAAA ou serial Excel)
-- =============================================
-- 1) Coluna
ALTER TABLE public.analysis_producao
  ADD COLUMN IF NOT EXISTS produced_on date;

-- 2) Função da trigger para manter produced_on
CREATE OR REPLACE FUNCTION public.analysis_producao_set_produced_on()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_text text;
  v_num numeric;
  v_date date;
BEGIN
  v_text := COALESCE(NEW.payload->>'Data Produção', NEW.payload->>'Data Producao');

  IF v_text IS NOT NULL AND v_text ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN
    v_date := to_date(v_text, 'DD/MM/YYYY');
  ELSE
    BEGIN
      v_num := (COALESCE(NEW.payload->>'Data Produção', NEW.payload->>'Data Producao'))::numeric;
    EXCEPTION WHEN others THEN
      v_num := NULL;
    END;
    IF v_num IS NOT NULL THEN
      -- Excel serial: dias desde 1899-12-30
      v_date := DATE '1899-12-30' + (v_num::int);
    ELSE
      v_date := NULL;
    END IF;
  END IF;

  NEW.produced_on := v_date;
  RETURN NEW;
END;$$;

-- 3) Trigger
DROP TRIGGER IF EXISTS trg_analysis_producao_set_produced_on ON public.analysis_producao;
CREATE TRIGGER trg_analysis_producao_set_produced_on
BEFORE INSERT OR UPDATE ON public.analysis_producao
FOR EACH ROW EXECUTE FUNCTION public.analysis_producao_set_produced_on();

-- 4) Backfill (opcional; pode ser pesado em bases grandes)
UPDATE public.analysis_producao t
SET produced_on = COALESCE(
  CASE
    WHEN (t.payload->>'Data Produção') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(t.payload->>'Data Produção','DD/MM/YYYY')
    WHEN (t.payload->>'Data Producao')  ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(t.payload->>'Data Producao','DD/MM/YYYY')
    WHEN (t.payload->>'Data Produção') ~ '^[0-9]+(\.[0-9]+)?$' THEN DATE '1899-12-30' + ((t.payload->>'Data Produção')::numeric)::int
    WHEN (t.payload->>'Data Producao')  ~ '^[0-9]+(\.[0-9]+)?$' THEN DATE '1899-12-30' + ((t.payload->>'Data Producao')::numeric)::int
    ELSE NULL
  END,
  produced_on
)
WHERE produced_on IS NULL;

-- 5) Índice
CREATE INDEX IF NOT EXISTS idx_analysis_producao_produced_on
  ON public.analysis_producao (produced_on DESC);

-- Rollback (produced_on + trigger)
-- DROP INDEX IF EXISTS public.idx_analysis_producao_produced_on;
-- DROP TRIGGER IF EXISTS trg_analysis_producao_set_produced_on ON public.analysis_producao;
-- DROP FUNCTION IF EXISTS public.analysis_producao_set_produced_on();
-- ALTER TABLE public.analysis_producao DROP COLUMN IF EXISTS produced_on;

-- =============================================
-- 12/11/2025 - Migração: RPC para truncar analysis_producao
-- Objetivo: garantir sobrescrita total antes de novo upload (TRUNCATE mais rápido/atômico)
-- =============================================
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

GRANT EXECUTE ON FUNCTION public.analysis_producao_truncate() TO anon, authenticated;

-- Opcional: solicitar recarregamento do schema no PostgREST
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Rollback (RPC truncate)
REVOKE EXECUTE ON FUNCTION public.analysis_producao_truncate() FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.analysis_producao_truncate();

-- =============================================
-- 12/11/2025 - Migração: Campos "package_size" e "hole_count" em manufacturing_records
-- Objetivo: alinhar formulário da aba Confecção com o schema
-- =============================================
ALTER TABLE public.manufacturing_records
  ADD COLUMN IF NOT EXISTS package_size text,
  ADD COLUMN IF NOT EXISTS hole_count integer;

-- Rollback (manufacturing_records)
-- ALTER TABLE public.manufacturing_records DROP COLUMN IF EXISTS package_size;
-- ALTER TABLE public.manufacturing_records DROP COLUMN IF EXISTS hole_count;

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
COMMIT;

-- =============================================
-- 13/11/2025 - Migração: Carteira AGG com contagens
-- Objetivo: Incluir quantidade de pedidos e quantidade distinta de clientes na RPC
--           analysis_carteira_flat_agg(period_start, period_end, ferramenta_filter, cliente_filter)
-- =============================================
BEGIN;

DROP FUNCTION IF EXISTS public.analysis_carteira_flat_agg(date, date, text, text);

CREATE OR REPLACE FUNCTION public.analysis_carteira_flat_agg(
  period_start date,
  period_end   date,
  ferramenta_filter text,
  cliente_filter   text
)
RETURNS TABLE (
  ferramenta text,
  pedido_kg_sum numeric,
  avg6m numeric,
  avg12m numeric,
  pedido_count bigint,
  cliente_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT 
      COALESCE(period_start, date '0001-01-01') AS ps,
      COALESCE(period_end, current_date)         AS pe,
      date_trunc('month', COALESCE(period_end, current_date))::date AS pem
  )
  SELECT
    upper(t.ferramenta) AS ferramenta,
    SUM(t.pedido_kg)::numeric AS pedido_kg_sum,
    (SUM(CASE WHEN t.data_implant BETWEEN (b.pem - interval '5 months')::date AND b.pe THEN t.pedido_kg ELSE 0 END) / 6.0)::numeric AS avg6m,
    (SUM(CASE WHEN t.data_implant BETWEEN (b.pem - interval '11 months')::date AND b.pe THEN t.pedido_kg ELSE 0 END) / 12.0)::numeric AS avg12m,
    COUNT(*)::bigint AS pedido_count,
    COUNT(DISTINCT t.cliente)::bigint AS cliente_count
  FROM public.analysis_carteira_flat t
  CROSS JOIN bounds b
  WHERE
    (t.data_implant IS NULL OR (t.data_implant BETWEEN b.ps AND b.pe))
    AND (ferramenta_filter IS NULL OR ferramenta_filter = '' OR t.ferramenta ILIKE '%' || ferramenta_filter || '%')
    AND (cliente_filter   IS NULL OR cliente_filter   = '' OR t.cliente   ILIKE '%' || cliente_filter   || '%')
  GROUP BY upper(t.ferramenta), b.pe, b.pem
  ORDER BY pedido_kg_sum DESC;
$$;

GRANT EXECUTE ON FUNCTION public.analysis_carteira_flat_agg(date, date, text, text) TO anon, authenticated;

DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;

COMMIT;

-- ROLLBACK - Carteira AGG com contagens (13/11/2025)
BEGIN;
REVOKE EXECUTE ON FUNCTION public.analysis_carteira_flat_agg(date, date, text, text) FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.analysis_carteira_flat_agg(date, date, text, text);
COMMIT;
-- =============================================
-- ROLLBACK - RPC da Carteira (13/11/2025)
-- =============================================
BEGIN;

REVOKE EXECUTE ON FUNCTION public.analysis_carteira_flat_truncate() FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.analysis_carteira_flat_truncate();

REVOKE EXECUTE ON FUNCTION public.analysis_carteira_flat_agg(date, date, text, text) FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.analysis_carteira_flat_agg(date, date, text, text);

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

-- =============================================================
-- Migração: Implementar workflow completo com 4 status
-- Objetivo: Permitir fluxo need -> pending -> approved -> received
-- Data: 20/10/2025 12:06
-- =============================================================

BEGIN;

-- Remover constraint antiga
ALTER TABLE IF EXISTS public.manufacturing_records 
DROP CONSTRAINT IF EXISTS manufacturing_records_status_check;

-- Adicionar nova constraint com 4 status
ALTER TABLE IF EXISTS public.manufacturing_records 
ADD CONSTRAINT manufacturing_records_status_check 
CHECK (status IN ('need', 'pending', 'approved', 'received'));

-- Atualizar o default para 'need' (novos registros começam em Necessidade)
ALTER TABLE IF EXISTS public.manufacturing_records 
ALTER COLUMN status SET DEFAULT 'need';

COMMIT;


-- =============================================================
-- Migração: Adicionar campos de Pacote e QTD Furos em manufacturing_records
-- Objetivo: Registrar informações complementares da confecção
-- Data: 21/10/2025 08:56
-- =============================================================

BEGIN;

ALTER TABLE IF EXISTS public.manufacturing_records
ADD COLUMN IF NOT EXISTS package_size TEXT;

ALTER TABLE IF EXISTS public.manufacturing_records
ADD COLUMN IF NOT EXISTS hole_count INTEGER;

COMMIT;

-- =============================================================
-- ROLLBACK - Campos de Pacote e QTD Furos
-- =============================================================

BEGIN;

ALTER TABLE IF EXISTS public.manufacturing_records
DROP COLUMN IF EXISTS package_size;

ALTER TABLE IF EXISTS public.manufacturing_records
DROP COLUMN IF EXISTS hole_count;

COMMIT;

-- =============================================================
-- Migração: Alinhar notifications_sent ao frontend (final 11/11/2025)
-- Objetivo: Garantir compatibilidade com o app (SELECT sent_at; UPSERT onConflict event_id,category)
--           e categorias completas incluindo "Recebidas". Adicionar colunas de auditoria do emissor.
-- Data: 11/11/2025 15:10
-- =============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='notifications_sent'
  ) THEN
    CREATE TABLE public.notifications_sent (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
      category text NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      emitter_id uuid NULL,
      user_agent text NULL,
      platform text NULL,
      language text NULL
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_sent_category_check'
      AND conrelid = 'public.notifications_sent'::regclass
  ) THEN
    ALTER TABLE public.notifications_sent DROP CONSTRAINT notifications_sent_category_check;
  END IF;
  ALTER TABLE public.notifications_sent
    ADD CONSTRAINT notifications_sent_category_check 
    CHECK (category IN ('Aprovadas','Reprovado','Limpeza','Correção Externa','Recebidas'));
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='recorded_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='sent_at'
  ) THEN
    ALTER TABLE public.notifications_sent RENAME COLUMN recorded_at TO sent_at;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='emitter_id'
  ) THEN
    ALTER TABLE public.notifications_sent ADD COLUMN emitter_id uuid NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='user_agent'
  ) THEN
    ALTER TABLE public.notifications_sent ADD COLUMN user_agent text NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='platform'
  ) THEN
    ALTER TABLE public.notifications_sent ADD COLUMN platform text NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='language'
  ) THEN
    ALTER TABLE public.notifications_sent ADD COLUMN language text NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_sent_event_cat
  ON public.notifications_sent(event_id, category);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_event
  ON public.notifications_sent(event_id);

ALTER TABLE IF EXISTS public.notifications_sent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_sent_sel ON public.notifications_sent;
CREATE POLICY notifications_sent_sel ON public.notifications_sent FOR SELECT USING (true);
DROP POLICY IF EXISTS notifications_sent_ins ON public.notifications_sent;
CREATE POLICY notifications_sent_ins ON public.notifications_sent FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS notifications_sent_del ON public.notifications_sent;
CREATE POLICY notifications_sent_del ON public.notifications_sent FOR DELETE USING (true);

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications_sent';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

COMMIT;

-- =============================================================
-- ROLLBACK - Alinhamento notifications_sent 11/11/2025
-- =============================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='language'
  ) THEN
    ALTER TABLE public.notifications_sent DROP COLUMN language;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='platform'
  ) THEN
    ALTER TABLE public.notifications_sent DROP COLUMN platform;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='user_agent'
  ) THEN
    ALTER TABLE public.notifications_sent DROP COLUMN user_agent;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='emitter_id'
  ) THEN
    ALTER TABLE public.notifications_sent DROP COLUMN emitter_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_sent_category_check'
      AND conrelid = 'public.notifications_sent'::regclass
  ) THEN
    ALTER TABLE public.notifications_sent DROP CONSTRAINT notifications_sent_category_check;
  END IF;
  ALTER TABLE public.notifications_sent
    ADD CONSTRAINT notifications_sent_category_check 
    CHECK (category IN ('Aprovadas','Reprovado','Limpeza','Correção Externa'));
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='sent_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications_sent' AND column_name='recorded_at'
  ) THEN
    ALTER TABLE public.notifications_sent RENAME COLUMN sent_at TO recorded_at;
  END IF;
END $$;

COMMIT;
