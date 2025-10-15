# Especificações - Sistema de Controle de Matrizes (Iterações 1 e 2)

## Escopo Atual
- Front-end (Vite + React + TypeScript + Tailwind + shadcn-ui).
- Persistência principal via Supabase (Postgres) com serviços em `src/services/`.
- Importação/Exportação: JSON (nativo) e, futuramente, Excel (.xlsx).
- Autenticação simples (Users/Sessions no Supabase) com controle de acesso por papel (admin/editor/viewer).

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

- `User`:
  - `id`, `email`, `name`, `role: 'admin'|'editor'|'viewer'`, `isActive`, `createdAt`, `updatedAt`.
- `AuthSession`:
  - `user: User`, `token`, `expiresAt` (duração padrão 8h).

## Regras de Negócio Implementadas (Iterações 1 e 2)
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

### Em Teste (Aba)
- Componente: `src/components/TestingView.tsx`.
- Planejamento de teste: fila em `testing_queue` (Supabase). Itens podem ser iniciados (gera evento "Testes").
- Teste iniciado: cria evento `type: "Testes"` com `created_at` e `machine (P18|P19)`.
- Finalizar teste: cria novo evento `type: "Testes"` com `comment` contendo "concluído" para compatibilidade com Timeline/Planilha. O card é removido localmente (estado `hiddenIds`) sem recarregar a página.
- Remover manualmente: cria evento `type: "Outro"` ("Encerrado manualmente") e oculta o card.
- Numeração de testes: badge "Teste N" exibida no card calculando a quantidade de eventos `type === 'Testes'` da matriz.
- Sincronização: atualizações de fila e listas após planejar/iniciar/remover (`loadAvailableMatrices`, `loadTestingQueue`, `onRefresh`).
- Scroll por coluna (P18/P19): colunas com `min-h-0` e `ScrollArea` para visualizar todos os cards.
- Edição rápida: diálogo para editar observação e imagens em memória, com lightbox ao clicar na miniatura.

### Planejamento - Disponibilidade
- Serviço: `src/services/testingQueue.ts` (`getAvailableMatricesForTesting`).
- Regras:
  - Excluir matrizes já aprovadas (evento exato `type = 'Aprovado'`).
  - Excluir matrizes com teste ativo: último evento `type = 'Testes'` sem `comment` contendo "concluído".
  - Ordenação de eventos por `created_at` (fallback `date`).
  - Preservar `comment` ao mapear eventos para o front.

## Páginas/Componentes Atualizados
- `src/types/index.ts`: novos tipos de evento.
- `src/components/MatrixForm.tsx`: campos de prioridade e responsável.
- `src/components/EventForm.tsx`: campo de responsável por evento.
- `src/components/EventDetailDialog.tsx`: edição de responsável, junto com observações/imagens.
- `src/components/MatrixSidebar.tsx`: exibe status atual, prioridade e indicadores.
- `src/pages/NotFound.tsx`: traduzido para PT-BR.

### Autenticação e Acesso
- `src/services/auth.ts`: login/logout; sessões (`user_sessions`); CRUD de usuários.
- `src/components/LoginDialog.tsx`: formulário de login (sem exibir credenciais padrão).
- `src/components/SettingsView.tsx`: gestão de usuários (apenas admin).
- `src/pages/Index.tsx`:
  - Navegação protegida por login (Planilha, Dashboard, Aprovadas, Kanban, Histórico, Em Teste, Configurações).
  - Sidebar e painel de formulários ocultos para não logados.
  - Botões de Login/Logout.
- `src/components/FlowView.tsx`:
  - `isReadOnly` para uso sem login: remove `Controls` (cadeado, zoom, fit), bloqueia drag/select e pan; mantém visualização e MiniMap.

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

### Segurança
- Ambiente de desenvolvimento usa hash Base64 simples nas senhas. Em produção, migrar para bcrypt (hash e comparação server-side) ou Supabase Auth.

## Padrões (PT-BR)
- Datas exibidas em formato brasileiro via `toLocaleDateString("pt-BR")`.
- Textos e rotulagem em PT-BR.
