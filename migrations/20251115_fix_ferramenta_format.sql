-- Migration: Corrigir formatação de ferramenta em cleaning_orders
-- Data: 20/01/2026
-- Descrição: Formata todos os registros de cleaning_orders para o padrão F-CÓDIGO/SEQUÊNCIA

-- Atualizar registros que não começam com "F-"
UPDATE cleaning_orders
SET ferramenta = 'F-' || REGEXP_REPLACE(UPPER(TRIM(ferramenta)), '[^A-Z0-9]', '', 'g') || 
                 CASE 
                   WHEN sequencia IS NOT NULL AND sequencia != '' THEN 
                     '/' || LPAD(sequencia, 3, '0')
                   ELSE 
                     '/001'
                 END
WHERE ferramenta NOT LIKE 'F-%'
  AND ferramenta IS NOT NULL
  AND ferramenta != '';

-- Verificar registros atualizados
SELECT id, ferramenta, sequencia, data_saida, updated_at 
FROM cleaning_orders 
WHERE ferramenta LIKE 'F-%'
ORDER BY updated_at DESC 
LIMIT 10;
