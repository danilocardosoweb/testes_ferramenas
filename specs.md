## Iteração 23/10/2025 (Workflow de Confecção)

- **Workflow progressivo Necessidade → Solicitação → Em Fabricação**
  - `src/components/ManufacturingView.tsx`: três abas com contadores dinâmicos; filtro por prioridade (Baixa/Média/Alta/Crítica), ano, mês, fornecedor e busca.
  - Seleção múltipla na aba Solicitação com aprovação em lote (`approveMultipleRequests`), diálogo para data estimada padrão (20 dias úteis) usando `addBusinessDays`.
  - Botões dedicados para mover Necessidade → Solicitação (`moveToSolicitation`) e aprovar fabricação (`approveManufacturingRequest`).
  - Exportação Excel separa planilhas por status e inclui lead time baseado em `getLeadTimeDisplay`.
  - Formulário aprimorado: prioridade obrigatória, campos `packageSize`, `holeCount`, `replacedMatrix`, upload múltiplo de anexos com rename/delete e visualização.

- **Campos persistidos em `manufacturing_records`**
  - `priority` (`low|medium|high|critical`) define badges e filtros.
  - `estimated_delivery_date` preenchida na aprovação; valores exibidos em PT-BR.
  - Timestamps `moved_to_pending_at`, `moved_to_approved_at`, `moved_to_received_at` alimentam cálculo de lead time (`calculateLeadTimeDays`, `calculateLeadTimeAverages`).
  - Colunas `package_size` e `hole_count` armazenam dimensões adicionais.
  - `observacoes` (texto) e `anexos` (JSONB) suportam detalhamento completo; cada anexo persiste `{ id, url, nome_arquivo, tipo_mime, tamanho, caminho }`.

- **Serviços atualizados (`src/services/manufacturing.ts`)**
  - Atualizações de status definem timestamps automaticamente.
  - Função `listManufacturingRecords` filtra `processed_at IS NULL` e mantém cache em memória.
  - `getLeadTimeDisplay` e `calculateLeadTimeAverages` padronizam exibição de lead time.

- **Supabase / migrações**
  - Migração `migrations/20241023_add_observations_and_attachments.sql` adiciona `observacoes` e `anexos` à tabela `manufacturing_records`.
  - Documento `MIGRATION_FIX_STATUS.sql` registra ajustes de `priority`, `estimated_delivery_date` e timestamps de transição.

## Iteração 24/10/2025 (Área de Análise)

- **Uploads de planilhas base**
  - Upload individual por aba, com ícone ao lado dos filtros e input oculto.
  - Barra de progresso por lotes; mensagens de status na própria lista.
  - Integração em `AnalysisProducaoView` (12/11) e `AnalysisFerramentasView` (13/11), com sobrescrita total via RPC antes de inserir.

## Iteração 13/11/2025 (Área de Análise – Ferramentas)

- **Upload de Ferramentas (XLSX/XLS/CSV)**
  - Componente: `src/components/analysis/AnalysisFerramentasView.tsx`.
  - Ícone de upload ao lado do filtro "Matriz"; input de arquivo oculto.
  - Fluxo: ler planilha → truncar tabela → inserir em lotes → recarregar lista.
  - RPC utilizada: `public.analysis_ferramentas_truncate()` (SECURITY DEFINER) para TRUNCATE + RESTART IDENTITY.
  - Fallback: caso a RPC não exista, executa DELETE ALL na tabela (pode ser mais lento e sujeito a RLS).
  - Mapeamento de colunas aceitas (case-insensitive onde aplicável):
    - Matriz | Ferramenta → `payload["Matriz"]`
    - Seq → `payload["Seq"]`
    - Qte.Prod. | Qte Prod | Qte_Prod → `payload["Qte.Prod."]`
    - Status da Ferram. | Status → `payload["Status da Ferram."]`
    - Ativa → `payload["Ativa"]`
    - Dt.Entrega | Data Entrega → `payload["Dt.Entrega"]`
    - Data Uso → `payload["Data Uso"]`
  - Datas numéricas (serial Excel) são convertidas para exibição DD/MM/AAAA no front.

- **UI e Estatísticas**
  - Cabeçalho sticky, hover em linhas, tabela compacta.
  - Filtros: Ativa (Sim/Não/Todas), Status normalizado, Matriz (texto).
  - Estatísticas exibidas: Maior, Menor e Mediana de `Qte.Prod.` da lista filtrada.

## Iteração 12/11/2025 (Área de Análise – Produção)

- **Sobrescrita total antes do upload**
  - RPC `public.analysis_producao_truncate()` (SECURITY DEFINER) criado no banco e chamado pelo frontend antes de inserir novos dados.
  - Garante que a base de `analysis_producao` seja zerada (TRUNCATE + RESTART IDENTITY) e evite incrementos.

- **Data de produção normalizada**
  - Coluna `produced_on (date)` populada por trigger `trg_analysis_producao_set_produced_on` a partir de `payload->>'Data Produção'` (formato DD/MM/AAAA ou serial Excel).
  - Índice `idx_analysis_producao_produced_on (DESC)` para ordenação e filtros de período.

- **Filtros e ordenação**
  - Servidor: Matriz, Prensa e Seq; Período De/Até e ordenação por `produced_on` (mais recente → mais antigo).
  - Cliente: Mês e Produtividade (mín/máx).

- **UX do upload**
  - Barra de progresso por lotes.
  - Ícone de upload ao lado do campo "Produtividade máx.".

## Iteração 11/11/2025 (Notificações – Persistência Reativada)

- **Banco (Supabase)**
  - Tabela `public.notifications_sent` alinhada ao frontend:
    - Colunas: `id`, `event_id (FK events)`, `category` (inclui "Recebidas"), `sent_at`, `emitter_id`, `user_agent`, `platform`, `language`.
    - Índices: único `(event_id, category)` e índice em `(event_id)`.
    - RLS liberal para protótipo; Realtime habilitado na publicação `supabase_realtime`.
- **App**
  - `src/components/NotificationsBell.tsx` faz `select event_id, category, sent_at` e `upsert(..., { onConflict: 'event_id,category' })`.
  - Envio de e-mail marca itens na tabela; o Realtime remove itens da lista imediatamente.
- **Checklist operacional**
  - Confirmar Realtime habilitado para `public.notifications_sent`.
  - Constraint de categoria inclui: `Aprovadas`, `Reprovado`, `Limpeza`, `Correção Externa`, `Recebidas`.
  - Variável `VITE_NOTIFY_GROUP_EMAILS` definida.
- **Snapshot de Estado**
  - Registrar snapshots em `docs/snapshots/` com: ID/URL do projeto, região, versão do Postgres, contagens por tabela e publicação Realtime da `notifications_sent`.

## Iteração 16/10/2025 (Realtime + Reprovado)

- **Status do Teste no evento**
  - `src/components/EventDetailDialog.tsx`: campo "Status do Teste" (Aprovado/Reprovado) exibido somente quando `event.type === "Testes"`; persistido em `events.test_status`.
  - `src/types/index.ts`: `MatrixEvent.testStatus?: "Aprovado" | "Reprovado"`.

- **Notificações**
  - Novas categorias: inclui "Reprovado".
  - `src/components/NotificationsBell.tsx`: categorização usa `MatrixEvent.testStatus` para classificar "Testes" como "Reprovado" quando aplicável; filtro padrão e migração de localStorage incluindo a nova categoria.
  - Envio de e-mail: substituído "Apontado" por "Cliente" no corpo; cliente vem de `Matrix.responsible`.
  - Realtime: assinaturas de `notifications_sent` para atualizar em tempo real.

- **Timeline**
  - `src/components/FlowView.tsx`: exibe "Cliente: <responsible>" no cabeçalho da matriz.

- **Planilha**
  - `src/components/MatrixSheet.tsx`: correção de fuso (formatação direta) e ajuste do critério de testes (considera todos os `Testes`).

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
- **Lógica de teste ativo (15/10/2025)**: Um teste é considerado ativo apenas se o último evento "Testes" não tem "concluído" no comment E não há eventos posteriores. Matrizes com eventos após o último teste são disponibilizadas para novo planejamento.

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
  - Categorias: "Aprovadas", "Reprovado", "Limpeza", "Correção Externa".
  - Permite selecionar itens por categoria ou individualmente.
  - Botão "Enviar E-mail" monta um `mailto:` com os itens selecionados, organizados por categoria.
  - Template do e-mail: remove o campo "Apontado" e inclui o nome do cliente da matriz (campo `Matrix.responsible`).
  - Botão "Marcar como lidas" atualiza `lastSeen` em LocalStorage (`notif_last_seen`).
- Variável de ambiente para destinatários de grupo: `VITE_NOTIFY_GROUP_EMAILS` (lista separada por vírgulas). Exemplo em `.env.example`.
- Persistência global de itens já enviados via tabela `notifications_sent` (Supabase); atualização em tempo real usando Realtime (assinar alterações na tabela).

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
- Persistência: combinamos LocalStorage (itens lidos) com banco (tabela `notifications_sent`) para sincronização global. Realtime habilitado para a tabela.
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
- Políticas RLS liberais nas tabelas de protótipo; revisar antes de produção.

## Aba Confecção (15/10/2025)
- **Objetivo**: Ponto de partida do processo - registrar novas matrizes antes de chegarem à empresa.
- **Funcionalidades**:
  - Formulário completo com validação de campos obrigatórios.
  - **Tipo de Confecção**: Matriz Nova ou Reposição (radio buttons visuais).
  - **Tipo de Perfil**: Tubular ou Sólido (radio buttons com ícones).
  - **Fornecedor**: FEP, EXXO, FELJ ou Outro (campo livre).
  - **Data de Entrega**: Seleção de data com validação (não permite datas passadas).
  - **Fotos da Matriz**: Upload múltiplo de imagens (até 5MB cada) com preview em grid e lightbox para ampliar.
  - **Fotos de Problemas**: Upload múltiplo de imagens dos problemas identificados.
  - **Observações Técnicas**: Campo opcional para detalhes técnicos, especificações, medidas.
  - **Justificativa**: Campo obrigatório explicando o motivo da confecção.
- **Fluxo Automático**:
  1. Ao registrar confecção, sistema cria automaticamente:
     - Nova matriz no banco (`matrices`) com código informado.
     - Evento de "Recebimento" com comentário detalhado (tipo, fornecedor).
     - Registro em `manufacturing_records` com todas as informações e imagens.
  2. Matriz aparece imediatamente em Timeline e Planilha.
  3. Formulário é limpo após sucesso para novo registro.
- **Design**: Cards coloridos por seção (azul=identificação, roxo=especificações, âmbar=fornecedor, verde=fotos, cinza=observações) com gradientes e ícones.
- **Segurança**: Requer login (apenas usuários autenticados podem registrar confecções).

## Padrões (PT-BR)
- Datas exibidas em formato brasileiro. Evitamos `new Date().toLocaleDateString` sobre datas `YYYY-MM-DD` para não haver variação por fuso; usamos helpers que formatam a string diretamente.
- Textos e rotulagem em PT-BR.

---

## Iteração 15/10/2025 (Melhorias gerais)

- **Notificações (somente leitura sem login)**
  - Componente: `src/components/NotificationsBell.tsx`.
  - Nova prop `readOnly`: quando `true` (usuário não logado) desabilita seleção, “Limpar”, “Marcar como lidas” e “Enviar E-mail”.
  - Integrado em `src/pages/Index.tsx` com `readOnly={!authSession}`.

- **Histórico – Filtros recolhíveis**
  - Componente: `src/components/ActivityHistory.tsx`.
  - Cabeçalho “Filtros e Controles” ganhou botão para recolher/expandir a área de filtros (`filtersCollapsed`).

- **Planilha – Layout mais compacto**
  - Componente: `src/components/MatrixSheet.tsx`.
  - Redução de espaçamentos (head/células), `min-w` menor e inputs de data com largura específica (`w-28 md:w-32`).
  - Datas renderizadas com helper sem fuso (formatação direta de `YYYY-MM-DD`).
  - Coluna "1º teste" agora lista todos os eventos `type = "Testes"` (novo fluxo), mantendo compatibilidade com tipos legados contendo "Teste".

- **Datas estáveis (sem fuso)**
  - `src/pages/Index.tsx`: helper `formatDatePtBR()` para mensagens/toasts e descrições do Kanban.
  - `src/components/FlowView.tsx`: helper `fmtISODate()` para DD/MM/AAAA sem variação por fuso.
  - `src/components/TestingView.tsx`: data “hoje” em local time (YYYY-MM-DD) ao concluir teste.
  - `src/components/MatrixSheet.tsx`: exibição de `receivedDate` com formatador sem fuso (corrige exibição -1 dia).

- **Testes – 1 evento por ciclo**
  - `src/components/TestingView.tsx`:
    - “Teste Realizado” agora ATUALIZA o último evento `type: "Testes"` (não cria um novo).
    - Badge “Teste N” considera apenas testes concluídos (`comment` contém "conclu/realizad/finalizad").
  - `src/components/MatrixSheet.tsx`: colunas 1º/2º/3º teste contam apenas `Testes` concluídos (mantendo compatibilidade com tipos antigos que continham "Teste").

- **Kanban – Correção Externa (Entrada)**
  - Serviço: `src/services/db.ts` (`kanbanUpdateLatestAutoCardForMatrix`).
  - `src/pages/Index.tsx`: ao registrar `corr_return*` (Correção Ext. Entrada) a partir da Planilha, atualiza o último card automático da matriz para “Correção Externa (Entrada)” com descrição contendo a data.

- **Relatório Final / Anexos**
  - `src/components/FinalReportDialog.tsx`:
    - Correção de `e.currentTarget` nulo em upload (referência estável do input).
    - Acessibilidade do `DialogContent` com `aria-describedby` e descrição oculta.
  - `src/services/files.ts`:
    - Metadados alinhados à tabela real `event_files` (`mime_type`, `file_size`).
    - Seleção/Join atualizados em `listAttachments()`.

- **Interações de UI adicionais**
  - Duplo clique para fechar painel direito (formulários): `src/pages/Index.tsx`.
  - Duplo clique em área vazia do menu esquerdo recolhe a sidebar: `src/components/MatrixSidebar.tsx`.
