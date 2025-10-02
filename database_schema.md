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
