# Especificações - Sistema de Controle de Matrizes (Iteração 1)

## Escopo Atual
- Front-end único (Vite + React + TypeScript + Tailwind + shadcn-ui).
- Persistência local via LocalStorage (`src/utils/storage.ts`).
- Importação/Exportação: JSON (nativo) e, futuramente, Excel (.xlsx).

## Modelo de Dados
- `Matrix`:
  - `id: string`
  - `code: string`
  - `receivedDate: string` (YYYY-MM-DD)
  - `events: MatrixEvent[]`
  - `priority?: "normal" | "medium" | "critical"`
  - `responsible?: string`
- `MatrixEvent`:
  - `id: string`
  - `date: string` (YYYY-MM-DD)
  - `type: EventType`
  - `comment: string`
  - `location?: string`
  - `observations?: string`
  - `images?: string[]` (base64 por ora)
  - `responsible?: string`
- `EventType` (ampliado):
  - "Recebimento", "Teste Inicial", "Ajuste", "Teste Final", "Aprovado", "Reprovado", "Manutenção", "Limpeza", "Correção Externa", "Outro".

## Regras de Negócio Implementadas (Iteração 1)
- Status atual da matriz = último evento da lista:
  - Teste Inicial/Final → "Em teste".
  - Ajuste → "Em ajuste".
  - Aprovado → "Aprovada".
  - Reprovado → "Reprovada".
  - Correção Externa → "Em correção externa".
  - Limpeza → "Em limpeza".
  - Recebimento → "Recebida".
- Prioridade da matriz (badge na sidebar):
  - `critical` → vermelho (Crítico).
  - `medium` → amarelo (Médio).
  - `normal` → verde (Normal).
- Responsável:
  - Campo opcional no `MatrixForm` (responsável geral da matriz).
  - Campo opcional no `EventForm` e editável em `EventDetailDialog` (responsável do evento).
- Indicadores por matriz na Sidebar:
  - Testes: eventos "Teste Inicial" + "Teste Final".
  - Reprovações: eventos "Reprovado".
  - Correções: eventos "Ajuste" + "Correção Externa".

## Páginas/Componentes Atualizados
- `src/types/index.ts`: novos tipos de evento.
- `src/components/MatrixForm.tsx`: campos de prioridade e responsável.
- `src/components/EventForm.tsx`: campo de responsável por evento.
- `src/components/EventDetailDialog.tsx`: edição de responsável, junto com observações/imagens.
- `src/components/MatrixSidebar.tsx`: exibe status atual, prioridade e indicadores.
- `src/pages/NotFound.tsx`: traduzido para PT-BR.

## Decisões e Próximos Passos
- Manter LocalStorage nesta fase. Quando houver backend/BD, criar `database_schema.md` e `database_schema.sql` com migrações e rollback.
- Iteração 2 (planejada):
  - Cores por tipo de evento no `FlowView`.
  - Filtros e busca por código, status e período; filtros rápidos (Aprovadas, Em correção, Paradas há +10 dias).
  - Métricas de tempo entre eventos (KPIs) e "Resumo da Matriz".
- Iteração 3 (planejada):
  - Exportação Excel (.xlsx) com planilhas: Matrizes, Eventos, KPIs.
  - Alertas de estagnação (sem evento novo há X dias).
  - Anexos (PDF/relatórios) com aviso de tamanho por uso de LocalStorage.

## Padrões (PT-BR)
- Datas exibidas em formato brasileiro via `toLocaleDateString("pt-BR")`.
- Textos e rotulagem em PT-BR.
