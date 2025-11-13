# Snapshot Supabase — 11/11/2025 15:12

- **Projeto**: Ferramentas_em_testes
- **Project ID**: sldhpwtdipndnljbzojm
- **URL**: https://sldhpwtdipndnljbzojm.supabase.co
- **Região**: sa-east-1
- **Postgres**: 17.6.1.011

## Tabelas e Contagens
- **events**: 119
- **matrices**: 31
- **manufacturing_records**: 45
- **analysis_excel_uploads**: 1
- **notifications_read**: 0
- **notifications_sent**: 71

## notifications_sent (estado atual)
- **Colunas**:
  - `id uuid PK default gen_random_uuid()`
  - `event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE`
  - `category text NOT NULL` (constraint: IN ['Aprovadas','Reprovado','Limpeza','Correção Externa','Recebidas'])
  - `sent_at timestamptz NOT NULL DEFAULT now()`
  - `emitter_id uuid NULL`
  - `user_agent text NULL`
  - `platform text NULL`
  - `language text NULL`
- **Índices**:
  - `ux_notifications_sent_event_cat (unique event_id, category)`
  - `idx_notifications_sent_event (event_id)`
- **RLS**: habilitado (políticas liberais para protótipo)
- **Realtime**: tabela incluída na publicação `supabase_realtime`

## Observações de Schema relevantes
- `events.test_status` NÃO existe neste projeto no momento (a categorização "Reprovado" depende do frontend/serviço).
- Workflow de `manufacturing_records`: `status` em ['need','pending','approved','received'] com timestamps de transição.

## Variáveis de Ambiente (exemplo)
- `VITE_SUPABASE_URL=https://sldhpwtdipndnljbzojm.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<anon_key>`
- `VITE_NOTIFY_GROUP_EMAILS=grupo@empresa.com,qa@empresa.com`

## Procedimento de Verificação Rápida
- Tabelas/contagens: consultar query consolidada (ver README > Backup/Snapshot).
- Realtime notifications_sent: confirmar publicação `supabase_realtime`.
- Colunas de notifications_sent: confirmar presença de `sent_at`, `emitter_id`, `user_agent`, `platform`, `language`.

## Procedimento de Restauração (alto nível)
- Aplicar blocos pertinentes do `data_schema.sql` (inclui migração de alinhamento de `notifications_sent`).
- Re-habilitar Realtime na publicação `supabase_realtime` se necessário.
- Configurar `.env` conforme `.env.example`.
