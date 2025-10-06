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

### Novo: Notificações (Sino)
- `src/components/NotificationsBell.tsx`: exibe um sino com badge de contagem baseada nas atividades (mesma lógica do `ActivityHistory`).
- Integração no topo de `src/pages/Index.tsx` (barra de botões de visão).
- Popover com agrupamento e seleção por categorias para envio de e-mail:
  - Categorias: "Aprovadas", "Limpeza", "Correção Externa".
  - Permite selecionar itens por categoria ou individualmente.
  - Botão "Enviar E-mail" monta um `mailto:` com os itens selecionados, organizados por categoria.
  - Botão "Marcar como lidas" atualiza `lastSeen` em LocalStorage (`notif_last_seen`).
- Variável de ambiente para destinatários de grupo: `VITE_NOTIFY_GROUP_EMAILS` (lista separada por vírgulas). Exemplo em `.env.example`.

## Nova Aba: Ferramentas Aprovadas
- Local: `src/pages/Index.tsx` (estado `mainView` = "approved").
- Componente: `src/components/ApprovedToolsView.tsx`.
- Regra de exibição:
  - Lista todas as matrizes que possuam ao menos um evento cujo `type` contenha "aprov" (ex.: "Aprovado", "Aprovação").
  - A data considerada é a primeira data de aprovação (cronologicamente) encontrada nos eventos da matriz.
  - Agrupamento visual: Ano > Mês (com nome do mês em PT-BR), contendo as ferramentas aprovadas naquele período.
  - Ordenação dentro de cada mês pela data de aprovação crescente.
  - Formatação de datas em PT-BR.

## Dashboard - Novos Indicadores
- Lead de aprovação por pasta (dias): média de `recebimento → 1ª aprovação` por pasta.
- Distribuição de aprovações por número de testes (geral): contagem de matrizes aprovadas com 1, 2, 3 e >4 testes até a 1ª aprovação.
- Distribuição por pasta: tabela com as mesmas colunas (1, 2, 3, >4, Total) agregadas por pasta.

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
