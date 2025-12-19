## Iteração 19/12/2025 (Planilha e Timeline – UX)

- **Objetivo**: Tornar a planilha de datas e a linha do tempo mais intuitivas para cenários com >3 testes, reduzir ruído visual e padronizar lançamentos.

- **Testes extras (4º–6º) via Dialog**
  - Acesso: botão `Testes +` na coluna do `3º teste`.
  - Edição direta das datas do **4º, 5º e 6º testes**; salva automaticamente.
  - `Excluir` remove o evento correspondente dessa matriz.
  - Evita duplicação: se já existir evento com mesmo `type` + `comment`, apenas atualiza a `date`.

- **Mapeamento de marcos (Planilha → Eventos)**
  - `test1..6` → `type: "Testes"` e `comment`: "Nº teste" (ex.: "4º teste").
  - `clean_send1..4` → `type: "Limpeza Saída"` e comentário indicando ciclo (1–4).
  - `clean_return1..4` → `type: "Limpeza Entrada"` e comentário indicando ciclo (1–4).
  - `corr_send1..4` → `type: "Correção Externa Saída"` e comentário indicando ciclo (1–4).
  - `corr_return1..4` → `type: "Correção Externa Entrada"` e comentário indicando ciclo (1–4).
  - Observação: ciclos adicionais exibidos no Dialog atualmente: **4, 5 e 6** (sem alteração de schema).

- **Linha do Tempo (Dialog simplificado)**
  - Acesso: ícone de relógio na célula do `3º teste`.
  - Exibe: Recebimento, Testes (1–6), Limpeza (Saída/Entrada 1–4), Correção Externa (Saída/Entrada 1–4), Aprovação.
  - Cores por tipo via bullet; chips de categoria por item foram removidos para evitar redundância.
  - Layout em 2 colunas (Data | Conteúdo), com espaçamento maior entre linha/bullet/data.
  - Resumo superior: "Teste atual", "Último evento" (com data) e "Dias em andamento", além de contadores.
  - Botão `Copiar`: gera texto simples `DD/MM/AAAA | Rótulo` (sem Δ por item).

- **Indicador do teste atual**
  - Chip compacto `Tn` ao lado da célula do `3º teste` indicando o último teste da matriz (destaque âmbar quando `n ≥ 4`).

- **Filtros da planilha em uma linha**
  - Reorganizados para caber em telas médias+ (código, pasta, etapa, ordenação e botão de ciclos).

- **Notas**
  - Sem alterações estruturais de banco de dados nesta iteração.
  - Datas sempre em formato PT‑BR na UI; manipulação de ISO apenas para persistência.
  - Comportamento seguro para edição concorrente: Realtime refaz o fetch com debounce ao detectar mudanças em `events`, `matrices` ou `folders`.

---

## Iteração 17/12/2025 (SLA Limpeza com Dias Úteis e Baixa por NF-e)

- **SLA de Limpeza com Dias Úteis**
  - Regra diferenciada por tamanho da ferramenta:
    - **Pequena** (diâmetro ≤ 300 mm): 1 dia útil (segunda-sexta)
    - **Grande** (diâmetro > 300 mm): 3 dias úteis
  - Exemplo: Saída sexta-feira → retorno segunda-feira (pequena) ou quinta-feira (grande)
  - Implementação: `addBusinessDays()`, `businessDaysBetween()`, `isWeekend()`
  - Ajustado SLA de nitretação para 3 dias (antes 7)

- **Persistência de Diâmetro**
  - Nova coluna `diametro_mm` (numeric, nullable) em `cleaning_orders`
  - Captura automática do payload de `analysis_ferramentas` no romaneio
  - Aliases suportados: Diametro, Diâmetro, Diametro (mm), Diâmetro (mm), Diametro mm, Diâmetro mm
  - Arquivo: `data_schema.sql` com rollback

- **Formatação de Código Externo**
  - Padrão: `F-CODE/SEQ` (ex: `F-EXP908/001`)
  - Aplicado em: Excel, CSV, e-mail de NF
  - Função: `formatToolExternal(toolCode, sequence)`
  - Regra: Remove hífen/caracteres especiais, prefixo F-, sequência com 3 dígitos

- **Importação de NF-e para Baixa Automática**
  - Ícone de upload na aba "Em Limpeza"
  - Suporte: XML (completo), PDF (placeholder)
  - Parser robusto para XML com namespace:
    - Extrai: `nNF`, `serie`, `dhEmi`/`dEmi`, ferramentas de `xProd`/`infAdProd`/`infCpl`
    - Funções: `getTextByLocalName()`, `getAllTextByLocalName()`
  - Extração de ferramentas: Regex para padrão `CODE/SEQ` (ex: `TFV011/02`)
  - Normalização: Remove hífen, sequência vira número (02 → 2)
  - Modal profissional de preview:
    - Data em PT-BR (DD/MM/AAAA)
    - Número da nota (nNF/série)
    - Total de ferramentas na nota
    - Lista de encontradas para baixa
    - Lista de não encontradas
  - Ação: Confirmar aplica baixa automática:
    - Atualiza `data_retorno` e `nf_retorno` no banco
    - Preenche campos de data/NF na UI
    - Seleciona itens automaticamente

- **Arquivos Modificados**
  - `data_schema.sql`: Coluna `diametro_mm`
  - `database_schema.md`: Documentação de `cleaning_orders`
  - `src/components/RomaneioInterface.tsx`: Captura e persistência de diâmetro, formatação externa
  - `src/components/CleaningTrackingDashboard.tsx`: Cálculo de dias úteis, SLA diferenciado
  - `src/components/analysis/AnalysisFerramentasView.tsx`: Inclusão de Diametro no payload
  - `src/components/CleaningOrdersTable.tsx`: Importação de NF-e, modal de preview, baixa automática

## Iteração 15/12/2025 (Integração LLM - Parecer de Matrizes)

- **Integração LLM para Análise Inteligente**
  - Tipos: `src/types/llm.ts`
  - Serviço: `src/services/llm.ts`
  - Edge Function: `supabase/functions/llm-parecer/index.ts`

- **Funcionalidades**
  - **Gerar Parecer**: Análise técnica detalhada para matriz selecionada
  - **Ranking do Dia**: Top 50 matrizes ordenadas por urgência de ação

- **Contrato JSON de Saída (ParecerData)**
  - `recomendacao`: "Confeccionar" | "Planejar" | "OK"
  - `resumo_executivo`: Texto com 2-3 frases
  - `motivos_com_numeros`: Array de motivos com dados quantitativos
  - `riscos`: Array de riscos identificados
  - `acoes_recomendadas`: Array de ações sugeridas
  - `o_que_confirmar`: Array de verificações antes de agir
  - `confianca_0a100`: Nível de confiança da análise
  - `limitacoes_dos_dados`: Array de limitações conhecidas

- **Arquitetura de Provedores LLM**
  - Ordem de prioridade: OpenRouter → Google AI → Groq → OpenAI
  - Fallback automático entre provedores
  - Fallback local quando nenhum provider disponível (gerarParecerLocal)

- **UI**
  - Botão "Ranking do Dia" (roxo): Gera ranking das Top 50 matrizes
  - Botão "Gerar Parecer" (azul): Gera parecer para matriz selecionada
  - Modal de Parecer: Cards coloridos com recomendação, motivos, riscos, ações
  - Modal de Ranking: Lista clicável com posição, score e resumo

- **Deploy da Edge Function**
  - Requer configuração de secrets no Supabase: `OPENROUTER_API_KEY`, `GOOGLE_AI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`
  - Deploy via: `supabase functions deploy llm-parecer`

- **Análise de Produção (6 meses)**
  - Campo `producao_6m` no contexto LLM com:
    - `historico_mensal`: Array com mês, avg_produtividade, avg_eficiencia, registros
    - `observacoes_lote`: Últimas 10 observações de lote não vazias
    - `ligas_utilizadas`: Ligas usadas no período
    - `ref_produtividade`: Objetivos (1.000-1.300 kg/h), média geral, % acima objetivo
  - Busca dados via RPC `get_productivity_stats` e tabela `analysis_producao`
  - Análise automática:
    - Produtividade vs referências (baixa < 1.000, excelente ≥ 1.300)
    - Eficiência (baixa < 70%, excelente ≥ 90%)
    - Tendência (subindo/estável/caindo)
    - Observações de lote relevantes (problema, defeito, parada, trinca, desgaste)
  - Seção visual no modal de parecer com:
    - KPIs: Média Geral, Objetivo, % Acima Objetivo
    - Histórico mensal com cores (verde ≥ 1.000, laranja < 1.000)
    - Ligas utilizadas
    - Observações de lote recentes

---

## Iteração 15/12/2025 (Decisão de Reposição de Matrizes)

- **Nova sub-aba: "Decisão de Reposição"**
  - Componente: `src/components/analysis/AnalysisDecisaoReposicaoView.tsx`
  - Objetivo: Painel decisório inteligente que unifica múltiplas dimensões em um Score Único (0–100)
  - Responde objetivamente: "Confeccionar Imediatamente" (≥70), "Planejar Reposição" (40–69), ou "Não Necessita Reposição" (<40)

- **Score Único de Decisão (0–100)**
  - Fórmula: `ScoreTotal = 0,40*RiscoVida + 0,30*PressaoDemanda + 0,20*RiscoDesempenho + 0,10*RiscoOperacional`
  - **RiscoVida**: Cobertura (50%), EOL (30%), Desgaste (20%)
  - **PressaoDemanda**: Crescimento 6m vs 12m (60%), Demanda normalizada (40%)
  - **RiscoDesempenho**: Inverso do Score de Produtividade (100 - score)
  - **RiscoOperacional**: Single point of failure (50%), Sequências insuficientes (50%)

- **Interface em 2 painéis**
  - **Painel esquerdo**: Lista de matrizes com status visual (cores), Score e indicadores rápidos (Cobertura, Seq. Ativas, Crescimento)
  - **Painel direito**: 3 abas
    - **Decisão**: Hero Card com status + diagnóstico visual (barras por dimensão) + motivos objetivos + timeline (+30/+60/+90/EOL/Data Ideal Pedido com lead time 20 dias) + ações recomendadas
    - **Sequências**: Análise por sequência (desgaste, cobertura, demanda, EOL)
    - **Simulador**: Controles "E se…" (aumentar demanda ±20–50%, adicionar sequências +0–3, resetar desgaste) com recálculo em tempo real

- **Integração de dados**
  - RPC `matrix_lifespan_summary`: Vida útil, capacidade, cobertura, EOL
  - RPC `matrix_lifespan_by_sequence`: Dados por sequência
  - RPC `analysis_carteira_flat_agg`: Crescimento de demanda (6m vs 12m)
  - RPC `get_productivity_stats`: Produtividade e eficiência média
  - Filtros: Busca por matriz, Status (Todas/Confeccionar/Planejar)

- **Motivos automáticos e auditáveis**
  - Demanda cresceu X% (6m vs 12m)
  - Cobertura estimada: X mês(es)
  - Desgaste acumulado: X%
  - Apenas X sequência(s) ativa(s)
  - Sequências insuficientes para demanda
  - EOL próximo: X dias

- **Ações recomendadas por status**
  - **Confeccionar**: Confeccionar nova matriz, definir data de pedido, avaliar duplicação de sequência
  - **Planejar**: Programar reposição em 30–60 dias, monitorar demanda, preparar especificações
  - **OK**: Reavaliar em 30 dias, manter monitoramento

## Iteração 28/11/2025 (Análise de Produtividade)

- **Nova aba de Produtividade**
  - Componente: `src/components/analysis/AnalysisProdutividadeView.tsx`
  - Utilitário: `src/utils/productivityAnalysis.ts` para cálculos e processamento
  - Gráficos interativos: linha (tendência), barras (comparação), pizza (distribuição)
  - Filtros avançados: cliente, ferramenta, período personalizado
  - Métricas calculadas: produtividade média, eficiência, volume total
  - Exportação de dados em Excel e PDF

- **Planejamento Mobile First**
  - Documentação completa criada com 8 arquivos especializados
  - Análise detalhada de componentes críticos para responsividade
  - Plano de implementação em 4 fases (20-30 horas totais)
  - Exemplos de código e melhores práticas para mobile
  - Checklist de validação e guia rápido de referência

- **Melhorias de Responsividade**
  - LoginDialog.tsx: ajustado para padrão mobile-first
  - Index.tsx: melhorias na navegação para dispositivos móveis
  - Preparação para implementação de drawer e cards responsivos

## Iteração 25/11/2025 (Fluxo de Aprovação de Testes)

- **Status de Teste em Eventos**
  - A coluna `test_status` na tabela `events` armazena o status de aprovação/reprovação para eventos do tipo "Testes"
  - Valores permitidos: 'Aprovado', 'Reprovado' ou NULL
  - Aplicada restrição CHECK para garantir a integridade dos dados

- **Integração com Notificações**
  - Eventos do tipo "Testes" com `test_status = 'Reprovado'` geram notificações na categoria "Reprovado"
  - Eventos aprovados são notificados na categoria "Aprovados"
  - O sistema de notificações foi atualizado para lidar com o novo status

- **Interface do Usuário**
  - O campo de status de teste é exibido apenas para eventos do tipo "Testes"
  - Validação no frontend para garantir que apenas valores permitidos sejam enviados
  - Feedback visual para o usuário sobre o status atual do teste

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

## Iteração 14/11/2025 (Área de Análise – Análise de Ferramenta)

- **Aba dedicada de Análise de Ferramenta (substitui o modal)**
  - Componentes: `AnalysisView`, `AnalysisProducaoView`, `FerramentaAnalysisDialog`.
  - O botão **"Analisar Ferramenta"** da aba Produção passa a abrir a aba **"Análise Ferramenta"**, levando junto a matriz e as linhas filtradas.
  - A aba de análise só aparece quando há dados carregados; o botão **"Voltar para Produção"** retorna à aba Produção e limpa os dados, escondendo a aba até uma nova análise.

- **Gráfico de Produtividade (12 meses)**
  - Linha suavizada com a **média mensal de produtividade (kg/h)** da matriz selecionada.
  - Regras de filtro para considerar o ponto na análise:
    - Peso bruto ≥ **200 kg**.
    - Produtividade > 0 e ≤ **2.400 kg/h**.
  - Linhas de objetivo fixas, sempre exibidas (sem depender da coluna de liga):
    - **1.300 kg/h** – objetivo para Liga Comum.
    - **1.000 kg/h** – objetivo para Liga Especial.
  - Tooltip do gráfico:
    - Mostra o valor formatado em kg/h.
    - Exibe **Seq da Matriz** apenas na série de produtividade (não aparece nas linhas de objetivo).

- **Gráfico de Entradas de Pedido (Carteira, 12 meses)**
  - Usa a tabela plana `analysis_carteira_flat` para somar `pedido_kg` por mês.
  - Considera os últimos **12 meses** para a ferramenta selecionada, exibindo a soma mensal em kg.
  - Eixo Y em kg com formatação PT-BR; tooltip exibe o volume do mês (kg) e o mês/ano completo.

- **Análise de Causas por Palavras-Chave**
  - Componente de gerenciamento: `KeywordsManagerDialog`.
  - É possível cadastrar palavras-chave por categoria (Geral, Mecânico, Material, Processo, Dimensional, Qualidade).
  - A aba de Análise de Ferramenta percorre o campo **"Observação Lote"** das linhas filtradas, conta as ocorrências de cada palavra-chave e calcula o percentual sobre o total de observações.
  - O botão **"Adicionar Todas"** na área **Adicionar em Lote**:
    - Converte tudo para maiúsculo.
    - Remove duplicatas dentro do próprio texto em lote.
    - Ignora palavras que já existem na tabela `analysis_keywords`, preservando os registros atuais.
    - Insere apenas as palavras realmente novas na categoria selecionada.

- **Indicadores adicionais da análise de ferramenta**
  - Cartões com **média de produtividade** no último mês, últimos 6 meses e últimos 12 meses.
  - Bloco de **Análise de Extremos**: maior e menor produtividade, exibindo também o volume (kg) associado a cada caso.
  - Indicador por **Cod Parada**: separa "001 - PEDIDO ATENDIDO" dos demais códigos (exclui 400, 401, 402, 306, 313, 315, 121) e mostra percentuais.
  - Rodapé informa total de registros analisados, regra de filtro aplicada (≥ 200 kg e até 2.400 kg/h) e quantidade de palavras-chave cadastradas.

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
