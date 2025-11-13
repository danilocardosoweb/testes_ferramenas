-- =============================================================
-- 12/11/2025 - Carteira: Coluna implanted_on e RPC truncate
-- Padronizar com análise de produção (produced_on)
-- Aplicado no projeto: Ferramentas_em_testes (sldhpwtdipndnljbzojm)
-- =============================================================

BEGIN;

-- Adicionar coluna derivada de data
ALTER TABLE public.analysis_carteira
  ADD COLUMN IF NOT EXISTS implanted_on date;

-- Função para popular implanted_on a partir do payload
CREATE OR REPLACE FUNCTION public.analysis_carteira_set_implanted_on()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_text text;
  v_num numeric;
  v_date date;
BEGIN
  v_text := COALESCE(NEW.payload->>'Data Implant', NEW.payload->>'Data', NEW.payload->>'Data Pedido');

  IF v_text IS NULL OR btrim(v_text) = '' THEN
    NEW.implanted_on := NULL;
    RETURN NEW;
  END IF;

  -- dd/mm/yyyy
  IF v_text ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' THEN
    BEGIN
      v_date := to_date(v_text, 'DD/MM/YYYY');
    EXCEPTION WHEN others THEN
      v_date := NULL;
    END;
  ELSIF v_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      v_date := to_date(v_text, 'YYYY-MM-DD');
    EXCEPTION WHEN others THEN
      v_date := NULL;
    END;
  ELSIF v_text ~ '^\d+(\.\d+)?$' THEN
    BEGIN
      v_num := v_text::numeric;
      v_date := date '1899-12-30' + trunc(v_num)::int;
    EXCEPTION WHEN others THEN
      v_date := NULL;
    END;
  ELSE
    v_date := NULL;
  END IF;

  NEW.implanted_on := v_date;
  RETURN NEW;
END;
$$;

-- Trigger para popular implanted_on
DROP TRIGGER IF EXISTS trg_analysis_carteira_implanted_on ON public.analysis_carteira;
CREATE TRIGGER trg_analysis_carteira_implanted_on
BEFORE INSERT OR UPDATE ON public.analysis_carteira
FOR EACH ROW EXECUTE FUNCTION public.analysis_carteira_set_implanted_on();

-- Índice para performance de queries por período
CREATE INDEX IF NOT EXISTS idx_analysis_carteira_implanted_on
  ON public.analysis_carteira(implanted_on DESC);

-- RPC para truncar carteira (uploads com sobrescrita)
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

-- Backfill de registros existentes (61k registros, ~20k com data)
UPDATE public.analysis_carteira a
SET implanted_on = (
  CASE
    WHEN COALESCE(a.payload->>'Data Implant', a.payload->>'Data', a.payload->>'Data Pedido') ~ '^\d{1,2}/\d{1,2}/\d{2,4}$'
      THEN to_date(COALESCE(a.payload->>'Data Implant', a.payload->>'Data', a.payload->>'Data Pedido'), 'DD/MM/YYYY')
    WHEN COALESCE(a.payload->>'Data Implant', a.payload->>'Data', a.payload->>'Data Pedido') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN to_date(COALESCE(a.payload->>'Data Implant', a.payload->>'Data', a.payload->>'Data Pedido'), 'YYYY-MM-DD')
    WHEN COALESCE(a.payload->>'Data Implant', a.payload->>'Data', a.payload->>'Data Pedido') ~ '^\d+(\.\d+)?$'
      THEN date '1899-12-30' + trunc((COALESCE(a.payload->>'Data Implant', a.payload->>'Data', a.payload->>'Data Pedido'))::numeric)::int
    ELSE NULL
  END
)
WHERE implanted_on IS NULL;

DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN NULL;
END $$;

COMMIT;

-- ROLLBACK (se necessário)
-- DROP TRIGGER IF EXISTS trg_analysis_carteira_implanted_on ON public.analysis_carteira;
-- DROP FUNCTION IF EXISTS public.analysis_carteira_set_implanted_on();
-- DROP FUNCTION IF EXISTS public.analysis_carteira_truncate();
-- ALTER TABLE public.analysis_carteira DROP COLUMN IF EXISTS implanted_on;
