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
