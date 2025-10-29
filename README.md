# Controle de Matrizes — App

Aplicação React (Vite + TypeScript + Tailwind + shadcn-ui) integrada ao Supabase (Postgres, Storage e Realtime) para gestão de matrizes, timeline de eventos, planilha de datas e sistema de notificações por e-mail.

## Visão Geral
- Timeline com eventos por matriz (`Recebimento`, `Testes`, `Limpeza Saída/Entrada`, `Correção Externa Saída/Entrada`, `Aprovado` etc.).
- Planilha de marcos com edição rápida e regras de negócio alinhadas.
- Notificações por e-mail agrupadas por categoria com persistência global em banco e Realtime.
- Dashboard e histórico com filtros.
- Workflow completo de confecção com três etapas (Necessidade → Solicitação → Em Fabricação), prioridades (Baixa/Média/Alta/Crítica), seleção múltipla e cálculo automático de lead time por estágio.

## Stack
- Vite + React + TypeScript
- Tailwind CSS + shadcn-ui
- Supabase (Postgres + Realtime + Storage)

## Requisitos
- Node.js 18+
- Conta Supabase

## Setup do Projeto
1. Instalar dependências:
```sh
npm i
```
2. Criar arquivo `.env` na raiz (exemplo):
```env
VITE_SUPABASE_URL=https://<PROJECT>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_NOTIFY_GROUP_EMAILS=grupo@empresa.com, outro@empresa.com
```
3. Rodar em desenvolvimento:
```sh
npm run dev
```

## Supabase — Banco de Dados
- Migrations estão em `data_schema.sql` (DDL cumulativa com blocos e rollback).
- Documentação do esquema em `database_schema.md`.
- Migrações incrementais ficam em `migrations/` para execução pontual (ex.: `20241023_add_observations_and_attachments.sql`).

### Aplicar migrações
Use o console SQL do Supabase ou CLI para aplicar o conteúdo relevante de `data_schema.sql`.

Migrações recentes relevantes:
- `events.test_status` (Aprovado/Reprovado) — status para eventos do tipo `Testes`.
- `notifications_sent.category` inclui "Reprovado".
- Workflow de confecção: campos `status` (`need`/`pending`/`approved`/`received`), prioridades e timestamps (`moved_to_*`) em `manufacturing_records`.
- `manufacturing_records.observacoes` (texto) e `manufacturing_records.anexos` (JSONB) para detalhes adicionais e arquivos.

### Realtime
Habilitar Realtime na tabela `public.notifications_sent`:
1. Dashboard Supabase → Realtime.
2. Add table → selecionar `public.notifications_sent`.
3. Confirmar replicação.

O app assina o canal e atualiza o sino/histórico em tempo real.

## Notificações — Fluxo
- Componente: `src/components/NotificationsBell.tsx`.
- Categorias: `Aprovadas`, `Reprovado`, `Limpeza`, `Correção Externa`.
- Seleção por item/categoria e montagem de e-mail via `mailto:`.
- Corpo do e-mail: usa `Cliente` (campo `Matrix.responsible`) e remove "Apontado".
- Persistência global: `public.notifications_sent` (um registro por `event_id + categoria`).
- Realtime: assinatura para refletir alterações entre abas/usuários.

## Campos Importantes
- `Matrix.responsible`: tratado como Cliente da matriz (exibido na Timeline).
- `MatrixEvent.testStatus`: `Aprovado` | `Reprovado` (aparece em Notificações na categoria Reprovado quando `type = "Testes"`).
- `ManufacturingRecord.priority`: `low` | `medium` | `high` | `critical` — determina a cor dos badges e filtro principal.
- `ManufacturingRecord.moved_to_pending_at` / `moved_to_approved_at` / `moved_to_received_at`: timestamps usados para calcular lead time por estágio.
- `ManufacturingRecord.anexos`: lista de objetos `{ id, url, nome_arquivo, tipo_mime, tamanho, caminho }` persistidos no Supabase Storage.

## Convenções de Datas (PT-BR)
- Exibição em `DD/MM/AAAA`.
- Nunca converter `YYYY-MM-DD` com `new Date(...)` (timezone). Helpers formatam a string diretamente onde necessário.

## Scripts NPM
- `dev`: inicia o servidor de desenvolvimento.
- `build`: build de produção.
- `preview`: preview local do build.

## Estrutura de Pastas
- `src/components/` — componentes (Timeline/FlowView, Planilha/MatrixSheet, Notificações, etc.).
- `src/types/` — tipos TS centrais (`Matrix`, `MatrixEvent`).
- `src/pages/` — páginas e composição de visões.
- `src/services/` — integrações com banco/serviços.

## Troubleshooting
- "Reprovado" não aparece no sino: recarregar a página para migrar `notif_visible_categories` no localStorage. Verificar se `events.test_status = 'Reprovado'` e Realtime habilitado.
- Datas -1 dia: conferir que a exibição usa helpers de formatação direta (`MatrixSheet.tsx` e `FlowView.tsx`).
- E-mail sem destinatários: setar `VITE_NOTIFY_GROUP_EMAILS` no `.env`.

## Histórico e Especificações
- Alterações diárias: `change_log.md`.
- Requisitos e decisões: `specs.md`.
