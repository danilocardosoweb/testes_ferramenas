-- =============================================================
-- Migração: RPC para Evolução de Produtividade Otimizada
-- Objetivo: Agregar dados de produtividade no banco para performance
-- Data: 03/12/2025
-- =============================================================

BEGIN;

-- Função para obter evolução da produtividade com filtros e anomalias
CREATE OR REPLACE FUNCTION public.get_productivity_evolution(
  months_back integer,
  matriz_filter text DEFAULT NULL,
  prensa_filter text DEFAULT NULL,
  seq_filter text DEFAULT NULL,
  liga_filter text DEFAULT NULL
)
RETURNS TABLE (
  month text,
  avg_produtividade numeric,
  avg_eficiencia numeric,
  total_records bigint,
  is_anomaly boolean,
  anomaly_drop numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  period_start date;
  period_end date;
BEGIN
  -- Definir período
  period_end := current_date;
  period_start := (date_trunc('month', period_end) - (months_back || ' months')::interval)::date;

  RETURN QUERY
  WITH filtered_data AS (
    SELECT
      to_char(produced_on, 'YYYY-MM') as month_str,
      date_trunc('month', produced_on)::date as month_date,
      (payload->>'Produtividade')::numeric as produtividade,
      (payload->>'Eficiência')::numeric as eficiencia
    FROM public.analysis_producao
    WHERE
      produced_on >= period_start
      AND produced_on <= period_end
      AND (matriz_filter IS NULL OR matriz_filter = '' OR (payload->>'Ferramenta') ILIKE '%' || matriz_filter || '%')
      AND (prensa_filter IS NULL OR prensa_filter = '' OR (payload->>'Prensa') ILIKE '%' || prensa_filter || '%')
      AND (seq_filter IS NULL OR seq_filter = '' OR seq_filter = 'Todas' OR (payload->>'Seq') = seq_filter)
      AND (liga_filter IS NULL OR liga_filter = '' OR (payload->>'Liga Utilizada') ILIKE '%' || liga_filter || '%')
      AND (payload->>'Produtividade') IS NOT NULL
  ),
  monthly_stats AS (
    SELECT
      month_str,
      month_date,
      AVG(produtividade)::numeric(10,2) as avg_prod,
      AVG(eficiencia)::numeric(10,2) as avg_efic,
      COUNT(*) as records
    FROM filtered_data
    GROUP BY month_str, month_date
  ),
  with_lag AS (
    SELECT
      month_str,
      month_date,
      avg_prod,
      avg_efic,
      records,
      LAG(avg_prod) OVER (ORDER BY month_date) as prev_prod
    FROM monthly_stats
  )
  SELECT
    w.month_str as month,
    w.avg_prod as avg_produtividade,
    w.avg_efic as avg_eficiencia,
    w.records as total_records,
    CASE
      WHEN w.prev_prod IS NULL OR w.prev_prod = 0 THEN false
      WHEN ((w.prev_prod - w.avg_prod) / w.prev_prod) * 100 > 20 THEN true
      ELSE false
    END as is_anomaly,
    CASE
      WHEN w.prev_prod IS NULL OR w.prev_prod = 0 THEN 0
      ELSE ROUND(((w.prev_prod - w.avg_prod) / w.prev_prod * 100)::numeric, 2)
    END as anomaly_drop
  FROM with_lag w
  ORDER BY w.month_date ASC;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.get_productivity_evolution(integer, text, text, text, text) TO anon, authenticated;

-- Notificar PostgREST para recarregar schema
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  NULL;
END $$;

COMMIT;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.get_productivity_evolution(integer, text, text, text, text);
