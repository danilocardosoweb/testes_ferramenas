[20/10/2025 12:06] - src/components/ManufacturingView.tsx - Sistema de workflow com TRÊS abas (Necessidade, Solicitação, Em Fabricação): Fluxo progressivo - (1) Necessidade (need): matrizes recém-registradas, botão azul para mover para Solicitação; (2) Solicitação (pending): processo interno/OCs, botão verde para aprovar fabricação; (3) Em Fabricação (approved): matriz no fornecedor sendo fabricada, disponível para seleção na Timeline; cores distintivas (vermelho/amber/verde); ícones AlertCircle/Clock/CheckCircle2; função moveToSolicitation() criada; migração com 4 status (need/pending/approved/received); documentação completa atualizada - Cascade

[06/10/2025 07:29] - extrude-flow-main - Sino de Notificações com seleção por categorias (Aprovadas, Limpeza, Correção Externa) e envio por e-mail via mailto; integração em `src/pages/Index.tsx`; novo componente `src/components/NotificationsBell.tsx`; `.env.example` atualizado com `VITE_NOTIFY_GROUP_EMAILS`; documentação em `specs.md` - Cascade
[03/10/2025 10:12] - extrude-flow-main - Nova aba funcional: "Ferramentas Aprovadas" com agrupamento por Ano/Mês em `src/components/ApprovedToolsView.tsx` e integração no `Index.tsx` - Cascade

[03/10/2025 10:34] - extrude-flow-main - Dashboard: indicadores de lead por pasta e aprovações por nº de testes (geral e por pasta); Index: aprovadas ocultas na Sidebar, Timeline e Planilha - Cascade

[02/10/2025 10:11] - extrude-flow-main - Iteração 1: Status atual na sidebar, prioridade e responsável em formulários, indicadores por matriz, tradução PT-BR do 404, specs.md criado - Cascade

[02/10/2025 14:02] - extrude-flow-main - Criação do esquema Supabase: data_schema.sql com tabelas (folders, matrices, events com subeventos, event_files), índices, RLS e rollback; documentação em database_schema.md - Cascade

[07/10/2025 07:33] - extrude-flow-main - UI: Painel direito (cartões) mais estreito em `src/pages/Index.tsx` e redução do espaço entre título e ícone em `src/components/CollapsibleCard.tsx` - Cascade

[07/10/2025 07:35] - extrude-flow-main - Removido/Desabilitado o bloco "Relatório de Log" de `src/components/ImportExport.tsx` (UI, estados, funções e imports); mantidas apenas ações de Importar/Exportar Excel - Cascade

[15/10/2025 12:26] - extrude-flow-main - Correção lógica de teste ativo: matrizes com eventos posteriores ao último "Testes" são consideradas disponíveis para novo planejamento; UI: botão Atualizar trocado por ícone, removido contador de matrizes da barra superior - Cascade

[15/10/2025 12:48] - extrude-flow-main - Edição de itens da fila: campo images (JSONB) adicionado à testing_queue; cards da fila clicáveis para editar observação e imagens; diálogo de edição com upload múltiplo e lightbox; correções em sidebar (tipo "Testes" nos indicadores e status); clique em cards de teste ativo habilitado - Cascade

[15/10/2025 13:54] - extrude-flow-main - Nova aba Confecção: ponto de partida do processo com formulário completo (tipo confecção, perfil, fornecedor, prazo, fotos matriz/problemas, observações técnicas, justificativa); tabela manufacturing_records criada; ao registrar confecção, matriz é criada automaticamente com evento Recebimento e aparece em Timeline/Planilha; design inovador com cards coloridos e upload de imagens com lightbox - Cascade

[15/10/2025 20:15] - src/components - Timeline/Planilha: correção de fuso nas datas; Timeline com formatador estável; Planilha mais compacta (menos espaçamento e inputs de data ajustados). Conclusão de teste agora atualiza o último evento 'Testes' e Planilha conta apenas testes concluídos - Cascade

[15/10/2025 20:28] - src/components - Kanban: ao registrar 'Correção Externa Entrada' pela Planilha, atualização do cartão automático para 'Entrada' com descrição de retorno; serviço `kanbanUpdateLatestAutoCardForMatrix` adicionado - Cascade

[15/10/2025 20:36] - src/components - UX: duplo clique para fechar painel direito e recolher menu esquerdo (área vazia); ajustes no sininho de notificações para 'somente leitura' quando não autenticado (sem selecionar/limpar/marcar/mandar e-mail) - Cascade

[15/10/2025 20:58] - src/components - Histórico: seção 'Filtros e Controles' recolhível/expandível com botão no cabeçalho - Cascade

[15/10/2025 21:05] - src/components - Relatório Final/Anexos: correção de `e.currentTarget` nulo; acessibilidade do Dialog; serviço de arquivos compatível com `event_files` (mime_type, file_size) - Cascade

[16/10/2025 16:10] - db - Migração: adicionar coluna `test_status` em `events` (Aprovado/Reprovado) e atualizar constraint de `notifications_sent.category` para incluir "Reprovado" - Cascade
[16/10/2025 16:18] - src/components - EventDetailDialog: campo "Status do Teste" exibido para eventos `type = "Testes"`, persistindo em `events.test_status` - Cascade
[16/10/2025 16:24] - src/components - NotificationsBell: nova categoria "Reprovado"; categorização via `MatrixEvent.testStatus`; migração automática do localStorage para incluir a categoria; e-mail usa "Cliente" em vez de "Apontado" - Cascade
[16/10/2025 16:28] - src/components - ActivityHistory: suporte à categoria "Reprovado" nos filtros e migração de localStorage - Cascade
[16/10/2025 16:32] - src/components - FlowView: exibir "Cliente: <responsible>" no cabeçalho da matriz - Cascade
[16/10/2025 16:36] - src/components - MatrixSheet: corrigida exibição de data (sem fuso) e ajuste do critério de testes (lista todos os `Testes`); helper de formatação sem timezone - Cascade
[16/10/2025 16:45] - docs - Atualização de `database_schema.md` (test_status, categorias de notificações) e `specs.md` (Realtime, Reprovado, e-mail com Cliente, correções de data) - Cascade
