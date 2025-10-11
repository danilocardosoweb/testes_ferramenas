# Esquema de Banco de Dados (Supabase)

Este documento descreve as entidades e relacionamentos utilizados no Supabase (Postgres) para o app de controle de matrizes.

## Entidades

- **folders**
  - `id (uuid, PK)`
  - `name (text, unique)`
  - `created_at (timestamptz)`

- **matrices**
  - `id (uuid, PK)`
  - `code (text, unique)`
  - `received_date (date)`
  - `folder_id (uuid, FK -> folders.id, on delete set null)`
  - `priority (text, check in ['normal','medium','critical'])`
  - `responsible (text)`
  - `created_at (timestamptz)`

- **events**
  - `id (uuid, PK)`
  - `matrix_id (uuid, FK -> matrices.id, on delete cascade)`
  - `parent_event_id (uuid, FK -> events.id, on delete cascade)` — subeventos
  - `date (date)`
  - `type (text)` — livre para aceitar valores como "Correção Interna", "Projeto Cancelado", "Ajustes no Projeto".
  - `comment (text)`
  - `location (text)`
  - `responsible (text)`
  - `created_at (timestamptz)`

- **event_files**
  - `id (uuid, PK)`
  - `event_id (uuid, FK -> events.id, on delete cascade)`
  - `file_name (text)`
  - `mime_type (text)`
  - `file_size (bigint)`
  - `url (text)` — URL pública do arquivo/imagem no Supabase Storage
  - `created_at (timestamptz)`

## Relacionamentos

- `folders 1—n matrices`
- `matrices 1—n events`
- `events 1—n event_files`
- `events n—n events` via `parent_event_id` (árvore de subeventos)

## RLS (Row Level Security)

Para protótipo, políticas liberam a role `anon` para todas operações nas tabelas. Em produção, ajuste para autenticação de usuários e tenant isolation conforme necessário.

## Índices

- `idx_matrices_folder (folder_id)`
- `idx_matrices_received_date (received_date)`
- `idx_events_matrix (matrix_id)`
- `idx_events_parent (parent_event_id)`
- `idx_events_date (date)`
- `idx_event_files_event (event_id)`

## Arquivo de migração

Todas as queries de criação e rollback estão em `data_schema.sql`.

## Atualizações de Segurança e Performance (11/10/2025)

- RLS habilitado nas tabelas Kanban: `kanban_columns`, `kanban_cards`, `kanban_checklist`, `kanban_wip_settings`, `kanban_card_history`.
  - Para operação local sem autenticação, políticas provisórias liberais foram definidas (podem ser restritas futuramente).
- Índices criados:
  - `idx_events_matrix_date (events: matrix_id, date)` para ordenação/filtragem por cronologia dentro da matriz.
  - `idx_kanban_card_history_from_column (kanban_card_history: from_column)`.
  - `idx_kanban_card_history_to_column (kanban_card_history: to_column)`.
- Constraint em `events` para evitar auto-referência direta:
  - `events_no_self_parent`: `CHECK (parent_event_id IS NULL OR parent_event_id <> id)`.
- Triggers de atualização de `updated_at` criadas quando a função `public.set_updated_at()` está disponível.
- Funções com `search_path` fixado para evitar mutabilidade:
  - `public.set_updated_at`, `public.kanban_get_column_id`, `public.trg_create_card_on_corr_saida`, `public.trg_complete_card_on_corr_entrada` receberam `SET search_path = public, pg_catalog`.

Detalhes e rollbacks encontram-se em `data_schema.sql`.
