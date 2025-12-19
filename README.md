# Controle de Matrizes — App

Aplicação React (Vite + TypeScript + Tailwind + shadcn-ui) integrada ao Supabase (Postgres, Storage e Realtime) para gestão de matrizes, timeline de eventos, planilha de datas e sistema de notificações por e-mail.

## Visão Geral
- Timeline com eventos por matriz (`Recebimento`, `Testes`, `Limpeza Saída/Entrada`, `Correção Externa Saída/Entrada`, `Aprovado` etc.).
- Planilha de marcos com edição rápida e regras de negócio alinhadas.
- Notificações por e-mail agrupadas por categoria com persistência global em banco e Realtime.
- Dashboard e histórico com filtros.
- Workflow completo de confecção com três etapas (Necessidade → Solicitação → Em Fabricação), prioridades (Baixa/Média/Alta/Crítica), seleção múltipla e cálculo automático de lead time por estágio.
- Área de Análise com abas de Carteira, Produção, Ferramentas, Vida, Necessidades e **Produtividade**, além da aba dedicada de **Análise de Ferramenta** com gráficos de produtividade e de entradas de pedido em 12 meses, linhas de objetivo fixas e análise de causas por palavras‑chave.
- **Planejamento Mobile First** em andamento para tornar o aplicativo totalmente responsivo em dispositivos móveis.

## Planilha e Timeline – melhorias de 19/12/2025

- **Testes extras (4º–6º) via Dialog**
  - Na coluna do `3º teste`, use o botão `Testes +` para abrir o diálogo "Testes extras".
  - Edite as datas do **4º, 5º e 6º testes**. As alterações salvam automaticamente.
  - `Excluir` remove o evento correspondente.
  - Quando a opção "Mostrar ciclos" está ativa, o diálogo exibe também os ciclos **4, 5 e 6** de Limpeza/Correção (Saída/Entrada).
  - Mapeamento de eventos:
    - `test4|5|6` → `type: "Testes"` + `comment: "Nº teste"`.
    - `clean_send4|5|6` → `type: "Limpeza Saída"` + comentário indicando ciclo.
    - `clean_return4|5|6` → `type: "Limpeza Entrada"` + comentário indicando ciclo.
    - `corr_send4|5|6` → `type: "Correção Externa Saída"` + comentário indicando ciclo.
    - `corr_return4|5|6` → `type: "Correção Externa Entrada"` + comentário indicando ciclo.

- **Linha do Tempo (dialog simplificado)**
  - Ícone de relógio ao lado do `3º teste` abre a Linha do Tempo por ferramenta.
  - Exibe eventos em ordem cronológica com bullets coloridos por tipo.
  - Sem colunas redundantes: removido o campo Δ por item; chips de categoria ocultos (o rótulo já indica o tipo).
  - Resumo superior: Teste atual, Último evento (com data) e Dias em andamento, além de contadores.
  - Botão `Copiar` gera texto simples (data | evento) para colar em e-mail/WhatsApp.

- **Indicador do teste atual**
  - Chip compacto `Tn` ao lado do `3º teste` indica o número do último teste registrado.
  - Destaque visual (âmbar) quando `n ≥ 4`.

- **Filtros em uma única linha**
  - Na Planilha, os filtros foram reorganizados (código, pasta, etapa, ordenação e botão de ciclos) para caberem em 1 linha em telas médias+.

- **Observações**
  - Todas as melhorias acima são de **frontend**. Não há mudanças de schema no banco.
  - A criação/edição de eventos evita duplicação: se já existir evento com mesmo `type` + `comment`, apenas atualiza a `date`.

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

### Backup / Snapshot do Estado (Banco + App)

Para evitar perda de informações de configuração, registre snapshots versionados em `docs/snapshots/` sempre que houver mudanças estruturais.

- Passos sugeridos (via MCP Supabase):
  1. Tabelas e contagens (ajuste conforme necessário):
     - `select 'events' as t, count(*)::int as n from public.events union all select 'matrices', count(*)::int from public.matrices union all select 'manufacturing_records', count(*)::int from public.manufacturing_records union all select 'analysis_excel_uploads', count(*)::int from public.analysis_excel_uploads union all select 'notifications_read', count(*)::int from public.notifications_read union all select 'notifications_sent', count(*)::int from public.notifications_sent;`
  2. Publicação Realtime da tabela de notificações:
     - `select p.pubname from pg_publication p join pg_publication_rel pr on pr.prpubid=p.oid join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='notifications_sent';`
  3. Colunas de `public.notifications_sent` (para confirmar `sent_at` e categorias):
     - `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='notifications_sent' order by ordinal_position;`

- Inclua no snapshot: ID do projeto, URL do projeto, região, versão do Postgres, contagens por tabela, publicação Realtime e colunas críticas.

Checklist de Notificações (antes de publicar alterações):
- Realtime habilitado para `public.notifications_sent`.
- Constraint de categoria inclui: `Aprovadas`, `Reprovado`, `Limpeza`, `Correção Externa`, `Recebidas`.
- Índice único `(event_id, category)` presente.
- Colunas presentes: `sent_at`, `emitter_id`, `user_agent`, `platform`, `language`.
- Variável `VITE_NOTIFY_GROUP_EMAILS` configurada no `.env`.

## Notificações — Fluxo
- Componente: `src/components/NotificationsBell.tsx`.
- Categorias: `Aprovadas`, `Reprovado`, `Limpeza`, `Correção Externa`, `Recebidas`.
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
- Planejamento Mobile First: `MOBILE_FIRST_PLAN.md` e documentos relacionados.
- Análise de Produtividade: implementada em `AnalysisProdutividadeView.tsx` com gráficos interativos.
