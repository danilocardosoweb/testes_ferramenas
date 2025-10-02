-- Extrude Flow - Supabase schema
-- Ambiente: Postgres (Supabase)
-- Observação: usamos TEXT para tipo de evento para permitir valores livres (ex.: "Correção Interna", "Projeto Cancelado").
-- Rollback ao final do arquivo.

-- Extensões necessárias
create extension if not exists pgcrypto; -- para gen_random_uuid()

-- TABELAS

-- Pastas de organização (opcional)
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Matrizes
create table if not exists public.matrices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  received_date date not null,
  folder_id uuid null references public.folders(id) on delete set null,
  priority text check (priority in ('normal','medium','critical')),
  responsible text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_matrices_folder on public.matrices(folder_id);
create index if not exists idx_matrices_received_date on public.matrices(received_date);

-- Eventos
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  matrix_id uuid not null references public.matrices(id) on delete cascade,
  parent_event_id uuid null references public.events(id) on delete cascade, -- subeventos
  date date not null,
  type text not null, -- livre para aceitar "Correção Interna", "Ajustes no Projeto", etc.
  comment text,
  location text,
  responsible text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_matrix on public.events(matrix_id);
create index if not exists idx_events_parent on public.events(parent_event_id);
create index if not exists idx_events_date on public.events(date);

-- Anexos (imagens/arquivos) por evento
create table if not exists public.event_files (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  file_name text not null,
  mime_type text,
  file_size bigint,
  url text not null, -- URL pública (pode apontar para bucket do Supabase Storage)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_files_event on public.event_files(event_id);

-- RLS (Row Level Security)
-- Atenção: Para protótipo, liberamos todas as operações para role "anon".
-- Em produção, restrinja conforme autenticação (auth.uid).

alter table public.folders enable row level security;
alter table public.matrices enable row level security;
alter table public.events enable row level security;
alter table public.event_files enable row level security;

-- Políticas básicas (anon pode tudo). Ajuste depois conforme necessidade.
drop policy if exists folders_anon_all on public.folders;
create policy folders_anon_all on public.folders for all using (true) with check (true);

drop policy if exists matrices_anon_all on public.matrices;
create policy matrices_anon_all on public.matrices for all using (true) with check (true);

drop policy if exists events_anon_all on public.events;
create policy events_anon_all on public.events for all using (true) with check (true);

drop policy if exists event_files_anon_all on public.event_files;
create policy event_files_anon_all on public.event_files for all using (true) with check (true);

-- Triggers de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists t_matrices_updated_at on public.matrices;
create trigger t_matrices_updated_at before update on public.matrices
for each row execute function public.set_updated_at();

drop trigger if exists t_events_updated_at on public.events;
create trigger t_events_updated_at before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists t_event_files_updated_at on public.event_files;
create trigger t_event_files_updated_at before update on public.event_files
for each row execute function public.set_updated_at();

-- Opcional: seeds iniciais
-- insert into public.folders (name) values ('Outubro'), ('Setembro') on conflict do nothing;

-- =====================
-- ROLLBACK (DROP)
-- =====================
-- Para desfazer todas as mudanças (ordem reversa para respeitar FKs):
-- drop policy if exists event_files_anon_all on public.event_files;
-- drop policy if exists events_anon_all on public.events;
-- drop policy if exists matrices_anon_all on public.matrices;
-- drop policy if exists folders_anon_all on public.folders;
-- alter table public.event_files disable row level security;
-- alter table public.events disable row level security;
-- alter table public.matrices disable row level security;
-- alter table public.folders disable row level security;
-- drop table if exists public.event_files cascade;
-- drop table if exists public.events cascade;
-- drop table if exists public.matrices cascade;
-- drop table if exists public.folders cascade;
