[23/10/2025 08:15] - migrations/20241023_add_observations_and_attachments.sql - Adicionado suporte a anexos e observações em registros de confecção: (1) Nova coluna 'observacoes' (texto) para notas adicionais; (2) Nova coluna 'anexos' (JSONB) para armazenar arquivos PDF/imagems; (3) Atualização da documentação em database_schema.md; (4) Script de migração com rollback - Cascade

[23/10/2025 17:46] - docs - Documentação do workflow de confecção atualizada (prioridades, datas estimadas, timestamps de transição e anexos) em `database_schema.md`, `specs.md` e `README.md` - Cascade

[24/10/2025 08:22] - src/components/AnalysisView.tsx - Adicionado ícone discreto na aba Análise abrindo diálogo para anexar até quatro planilhas Excel (Produção, Carteira, Ferramentas, Correções) com histórico local de uploads - Cascade

[24/10/2025 08:39] - db - Criada tabela `analysis_excel_uploads` para armazenar a versão mais recente das planilhas de Produção, Carteira, Ferramentas e Correções (migr. 20251024_add_analysis_excel_uploads) - Cascade

[24/10/2025 08:44] - src/components/AnalysisView.tsx / src/services/analysis.ts - Uploads da aba Análise integrados com Supabase Storage + metadados em `analysis_excel_uploads` (sobrescrita controlada, download e limpeza por categoria) - Cascade

[24/10/2025 08:52] - db/ui - Tabela `analysis_excel_uploads` passou a registrar `has_header`/`header_row` (cabeçalhos na primeira linha) e área Análise exibe apenas instruções; uploads seguem via modal - Cascade

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

[11/11/2025 15:10] - db - Notificações: criação/alinhamento de `public.notifications_sent` (colunas: `sent_at`, `emitter_id`, `user_agent`, `platform`, `language`; categorias incluem "Recebidas"; índices `ux_notifications_sent_event_cat` e `idx_notifications_sent_event`; RLS liberal; Realtime habilitado na publicação `supabase_realtime`) via MCP - Cascade

[11/11/2025 15:12] - docs - Documentação atualizada com estado do banco e do app: `database_schema.md` (notifications_sent alinhada), `README.md` (Backup/Snapshot e checklist de notificações), `specs.md` (Iteração 11/11/2025 - Persistência reativada). Criado snapshot em `docs/snapshots/2025-11-11_supabase_snapshot.md` - Cascade

[12/11/2025 11:12] - db - Criado RPC `public.analysis_producao_truncate()` (SECURITY DEFINER) e integrado no frontend da aba Análise/Produção para sobrescrita total antes de novo upload; documentado `produced_on` + trigger + índice em `database_schema.md` e specs atualizadas - Cascade

[12/11/2025 15:00] - src/components/analysis - Carteira: Layout da tabela padronizado com Produção (removido Card wrapper, tabela HTML nativa com Tailwind, cabeçalho sticky, hover em linhas); rodapé com estatísticas (registros exibidos, volume total em kg e toneladas, distribuição ABC); imports desnecessários removidos - Cascade

[12/11/2025 15:10] - src/components/analysis - Carteira: Correção crítica de agregação - normalização case-insensitive para agrupar variações de ferramentas (tr-0100, TR-0100, Tr-0100); preservação do nome original para exibição; contador de registros por ferramenta; logs detalhados de debug (registros carregados, agregação antes/depois) - Cascade

[12/11/2025 15:12] - src/components/analysis - Carteira: Ajustes de filtros padrão (período iniciando em 01/01/2024 ao invés de 12 meses, tipo "Todos" ao invés de "Produção"); limite de registros aumentado de 20k para 100k; parseNumberBR melhorado (remoção de espaços); rodapé exibe totais em kg e toneladas + contador de registros - Cascade
