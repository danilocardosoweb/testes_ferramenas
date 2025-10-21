-- =============================================================
-- Migração: Adicionar categoria "Recebidas" às notificações
-- Objetivo: Permitir notificações e e-mails para matrizes recebidas
-- Data: 21/10/2025
-- =============================================================

BEGIN;

-- 1) Atualizar constraint da tabela notifications_sent para incluir "Recebidas"
ALTER TABLE IF EXISTS public.notifications_sent 
DROP CONSTRAINT IF EXISTS notifications_sent_category_check;

ALTER TABLE IF EXISTS public.notifications_sent 
ADD CONSTRAINT notifications_sent_category_check 
CHECK (category IN ('Aprovadas','Reprovado','Limpeza','Correção Externa','Recebidas'));

-- 2) Atualizar constraint da tabela notifications_sent para incluir "Reprovado" (se não existir)
-- (Esta migração já foi aplicada anteriormente, mas incluímos para garantir consistência)
-- A constraint já deve incluir 'Reprovado' baseado na migração anterior

-- 3) Comentário explicativo
COMMENT ON CONSTRAINT notifications_sent_category_check ON public.notifications_sent 
IS 'Categorias de notificação: Aprovadas, Reprovado, Limpeza, Correção Externa, Recebidas';

COMMIT;

-- =============================================================
-- ROLLBACK - Categoria "Recebidas"
-- =============================================================

BEGIN;

-- Remover a nova categoria da constraint
ALTER TABLE IF EXISTS public.notifications_sent 
DROP CONSTRAINT IF EXISTS notifications_sent_category_check;

-- Restaurar constraint original (sem "Recebidas")
ALTER TABLE IF EXISTS public.notifications_sent 
ADD CONSTRAINT notifications_sent_category_check 
CHECK (category IN ('Aprovadas','Reprovado','Limpeza','Correção Externa'));

COMMIT;
