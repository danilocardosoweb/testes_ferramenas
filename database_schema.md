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

- **notifications_sent** (11/11/2025 atualizado)
  - `id (uuid, PK)`
  - `event_id (uuid, FK -> events.id, on delete cascade)`
  - `category (text, check in ['Aprovadas','Reprovado','Limpeza','Correção Externa','Recebidas'])`
  - `sent_at (timestamptz, default now())`
  - `emitter_id (uuid, nullable)`, `user_agent (text, nullable)`, `platform (text, nullable)`, `language (text, nullable)`
  - Índices: `ux_notifications_sent_event_cat (unique event_id, category)`, `idx_notifications_sent_event (event_id)`
  - RLS habilitado; políticas liberais para protótipo (ajustar em produção). Realtime habilitado na publicação `supabase_realtime`.

- **users**
  - `id (uuid, PK)`
  - `email (text, unique)`
  - `name (text)`
  - `password_hash (text)`
  - `role (text, check in ['admin','editor','viewer'], default 'viewer')`
  - `is_active (boolean, default true)`
  - `created_at (timestamptz)`
  - `updated_at (timestamptz)`

- **user_sessions**
  - `id (uuid, PK)`
  - `user_id (uuid, FK -> users.id, on delete cascade)`
  - `token (text, unique)`
  - `expires_at (timestamptz)`
  - `created_at (timestamptz)`

- **testing_queue**
  - `id (uuid, PK)`
  - `matrix_id (uuid, FK -> matrices.id)`
  - `press (text, check in ['P18','P19'])`
  - `available_at (timestamptz, default now())`
  - `done_at (timestamptz, nullable)`
  - `note (text, nullable)`
  - `images (jsonb, default '[]'::jsonb)` — Array de imagens em base64
  - `created_by (uuid, nullable)`
  - `updated_at (timestamptz, default now())`

- **analysis_excel_uploads**
  - `id (uuid, PK)`
  - `category (text, unique, check in ['producao','carteira','ferramentas','correcoes'])` — identifica qual planilha foi carregada
  - `storage_path (text)` — caminho do arquivo no Supabase Storage
  - `file_name (text)` — nome original do arquivo
  - `file_size (bigint)` — tamanho em bytes
  - `mime_type (text, nullable)` — Content-Type detectado
  - `uploaded_by (uuid, FK -> users.id, on delete set null)` — usuário que enviou
  - `uploaded_at (timestamptz, default now())` — data do upload
  - `updated_at (timestamptz, default now())`
  - `checksum (text, nullable)` — hash opcional para controle de versão
  - `has_header (boolean, default true)` — indica se a primeira linha contém os nomes das colunas
  - `header_row (integer, default 1)` — número da linha utilizada como cabeçalho

- **analysis_producao** (12/11/2025 atualizado)
  - `id (uuid, PK)`
  - `payload (jsonb)` — linha original da planilha (campos como Prensa, Data Produção, Turno, Ferramenta, etc.)
  - `produced_on (date, nullable)` — data normalizada de produção
  - Índice: `idx_analysis_producao_produced_on (produced_on DESC)`
  - Trigger: `trg_analysis_producao_set_produced_on` chama função `public.analysis_producao_set_produced_on()` para popular `produced_on` a partir de `payload->>'Data Produção'` (aceita DD/MM/AAAA ou serial Excel)
  - RPC: `public.analysis_producao_truncate()` — função `SECURITY DEFINER` para truncar a tabela antes de novos uploads (sobrescrita total)

- **analysis_ferramentas** (13/11/2025 adicionado)
  - `id (uuid, PK)`
  - `ferramenta_code (text, nullable)` — opcional; código base da ferramenta
  - `ferramenta_seq (text, nullable)` — opcional; sequência
  - `payload (jsonb, not null, default '{}'::jsonb)` — linha original da planilha (Matriz, Seq, Qte.Prod., Status da Ferram., Ativa, Dt.Entrega, Data Uso)
  - Índices: conforme necessidade do PostgREST (consulta por JSON via `payload->>`)
  - RPC: `public.analysis_ferramentas_truncate()` — função `SECURITY DEFINER` para truncar a tabela antes de novos uploads (sobrescrita total)
  - Observação: Datas numéricas de Excel são exibidas no front-end como `DD/MM/AAAA`.

- **analysis_carteira** (12/11/2025 atualizado)
  - `id (uuid, PK)`
  - `payload (jsonb, not null, default '{}'::jsonb)` — linha original da planilha (Ferramenta, Pedido Kg, Cliente, Liga, Têmpera, Data Implant, etc.)
  - `__file_name (text, nullable)` — nome do arquivo Excel original
  - `__uploaded_at (timestamptz, default now())` — timestamp do upload
  - `implanted_on (date, nullable)` — data normalizada de implantação/pedido
  - `created_at (timestamptz, default timezone('utc', now()))`
  - `updated_at (timestamptz, default timezone('utc', now()))`
  - Índice: `idx_analysis_carteira_implanted_on (implanted_on DESC)` — otimiza filtros por período
  - Trigger: `trg_analysis_carteira_implanted_on` executa `BEFORE INSERT OR UPDATE` chamando `public.analysis_carteira_set_implanted_on()` para popular `implanted_on` a partir de:
    - `payload->>'Data Implant'`
    - `payload->>'Data'`
    - `payload->>'Data Pedido'`
    - Formatos aceitos: DD/MM/YYYY, YYYY-MM-DD (ISO), serial Excel (numérico)
  - RPC: `public.analysis_carteira_truncate()` — função `SECURITY DEFINER` para truncar a tabela antes de novos uploads (sobrescrita total)
  - **VIEW auxiliar**: `analysis_carteira_last_implant`
    - Agrega `max(data_implant)` por `upper(trim(ferramenta))` para fornecer o último pedido por ferramenta normalizada.
    - Consumida diretamente pelas abas Carteira e Vida para exibir "Último Pedido" sem múltiplas consultas à tabela plana.
    - Índices de apoio em `analysis_carteira_flat`: `idx_analysis_carteira_flat_ferr_key` (`upper(trim(ferramenta))`) e `idx_analysis_carteira_flat_data_implant` (`data_implant DESC`).
    - Permissões: `GRANT SELECT` para `anon` e `authenticated`.
  - **Correções 12/11/2025**:
    - Frontend: Agregação case-insensitive (tr-0100 = TR-0100 = Tr-0100)
    - Frontend: Filtros padrão ajustados (período desde 01/01/2024, tipo "Todos")
    - Frontend: Limite de registros aumentado para 100k
    - Frontend: Parse de números melhorado (remove espaços e pontos de milhar)
    - Frontend: Layout da tabela padronizado com aba Produção (HTML nativo + Tailwind)
    - Frontend: Rodapé com estatísticas (volume em kg/ton, distribuição ABC)
    - Frontend: Logs de debug detalhados no console

- **manufacturing_records**
  - `id (uuid, PK)`
  - `matrix_id (uuid, FK -> matrices.id, on delete cascade)`
  - `matrix_code (text, not null)`
  - `manufacturing_type (text, not null, check in ['nova','reposicao'])`
  - `profile_type (text, not null, check in ['tubular','solido'])`
  - `package_size (text, nullable)` — Dimensão do pacote associada à matriz
  - `hole_count (integer, nullable)` — Quantidade de furos
  - `supplier (text, not null)`
  - `custom_supplier (text, nullable)` — Nome livre quando `supplier = 'Outro'`
  - `priority (text, default 'medium', check in ['low','medium','high','critical'])`
  - `estimated_delivery_date (date, nullable)` — Data estimada preenchida na aprovação
  - `matrix_images (jsonb, default '[]'::jsonb)` — Fotos da matriz
  - `problem_images (jsonb, default '[]'::jsonb)` — Fotos de problemas
  - `observacoes (text, nullable)` — Observações adicionais sobre a confecção
  - `anexos (jsonb, default '[]'::jsonb)` — Array de anexos (cada item com id, url, nome_arquivo, tipo_mime, tamanho, caminho)
  - `volume_produced (integer, nullable)` — Volume produzido
  - `technical_notes (text, nullable)` — Notas técnicas sobre a confecção
  - `justification (text, not null)` — Justificativa para a confecção
  - `status (text, default 'need', check in ['need','pending','approved','received'])` — Status do workflow (need = Necessidade, pending = Solicitação, approved = Em Fabricação, received = Recebida)
  - `moved_to_pending_at (timestamptz, nullable)` — Timestamp da transição Necessidade → Solicitação
  - `moved_to_approved_at (timestamptz, nullable)` — Timestamp da transição Solicitação → Em Fabricação
  - `moved_to_received_at (timestamptz, nullable)` — Timestamp da transição Em Fabricação → Recebida
  - `processed_at (timestamptz, nullable)` — Data de processamento/recebimento final
  - `created_at (timestamptz, default now())`
  - `created_by (uuid, nullable)`
  - `updated_at (timestamptz, default now())`

## Relacionamentos

- `folders 1—n matrices`
- `matrices 1—n events`
- `events 1—n event_files`
- `events n—n events` via `parent_event_id` (árvore de subeventos)
- `users 1—n user_sessions`

## RLS (Row Level Security)

Para protótipo, políticas liberam a role `anon` para todas operações nas tabelas. Em produção, ajuste para autenticação de usuários e tenant isolation conforme necessário.

## Índices

- `idx_matrices_folder (folder_id)`
- `idx_matrices_received_date (received_date)`
- `idx_events_matrix (matrix_id)`
- `idx_events_parent (parent_event_id)`
- `idx_events_date (date)`
- `idx_event_files_event (event_id)`
- `idx_users_email (users: email)`
- `idx_user_sessions_token (user_sessions: token)`
- `idx_user_sessions_user (user_sessions: user_id)`

## Arquivo de migração

Todas as queries de criação e rollback estão em `data_schema.sql`.

## Autenticação (15/10/2025)

- Criadas tabelas `users` e `user_sessions` para controle de acesso no app.
- Papeis suportados: `admin`, `editor`, `viewer`.
- Sessões expiram após 8 horas (campos `token` e `expires_at`).
- Trigger `update_users_updated_at` para manter `updated_at` sincronizado.

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
