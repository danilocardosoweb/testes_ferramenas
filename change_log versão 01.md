[11/10/2025 18:19] - extrude-flow-main - Notificações: contador alinhado com itens visíveis, remoção automática pós-envio, filtro persistente por categorias (configuração centralizada no Histórico), registro de envios no ActivityHistory - Cascade

[11/10/2025 18:19] - extrude-flow-main - Histórico de Atividades: filtro temporal por período (Últimos 7/15/30/60/90 dias e Todos) com padrão 7 dias - Cascade

[11/10/2025 18:19] - extrude-flow-main - Ferramentas Aprovadas: agrupamento por Ano/Mês com estado inicial recolhido e diálogo de detalhes completo - Cascade

[11/10/2025 18:19] - extrude-flow-main - Kanban: Modo Compacto/Detalhado funcional (layout, paddings, descrição condicional, botões menores); remoção de botões Exportar/Importar - Cascade

[06/10/2025 07:29] - extrude-flow-main - Sino de Notificações com seleção por categorias (Aprovadas, Limpeza, Correção Externa) e envio por e-mail via mailto; integração em `src/pages/Index.tsx`; novo componente `src/components/NotificationsBell.tsx`; `.env.example` atualizado com `VITE_NOTIFY_GROUP_EMAILS`; documentação em `specs.md` - Cascade

[03/10/2025 10:12] - extrude-flow-main - Nova aba funcional: "Ferramentas Aprovadas" com agrupamento por Ano/Mês em `src/components/ApprovedToolsView.tsx` e integração no `Index.tsx` - Cascade

[03/10/2025 10:34] - extrude-flow-main - Dashboard: indicadores de lead por pasta e aprovações por nº de testes (geral e por pasta); Index: aprovadas ocultas na Sidebar, Timeline e Planilha - Cascade

[02/10/2025 10:11] - extrude-flow-main - Iteração 1: Status atual na sidebar, prioridade e responsável em formulários, indicadores por matriz, tradução PT-BR do 404, specs.md criado - Cascade

[02/10/2025 14:02] - extrude-flow-main - Criação do esquema Supabase: data_schema.sql com tabelas (folders, matrices, events com subeventos, event_files), índices, RLS e rollback; documentação em database_schema.md - Cascade

[11/10/2025 12:57] - extrude-flow-main - Consolidação Banco: RLS habilitada em tabelas Kanban com políticas provisórias; índices em events(matrix_id,date) e kanban_card_history(from_column,to_column); constraint anti auto-referência em events; triggers updated_at; ajuste de search_path em funções; atualização de data_schema.sql e database_schema.md - Cascade