# Análise Completa do App - Controle de Matrizes

**Data:** 19/12/2025  
**Versão:** 1.0  
**Autor:** Cascade

---

## 📋 Resumo Executivo

**Aplicação React (Vite + TypeScript + Tailwind CSS + shadcn/ui)** integrada ao **Supabase (Postgres, Storage, Realtime)** para gestão completa de matrizes de extrusão, timeline de eventos, análise de produtividade, limpeza/nitretação e workflow de confecção.

**Stack Principal:**
- Frontend: React 18 + TypeScript + Vite
- UI: Tailwind CSS v3 + shadcn/ui + Lucide Icons
- Backend: Supabase (Postgres + Realtime + Storage)
- Gráficos: Recharts
- Formulários: React Hook Form + Zod
- Planilhas: XLSX (Papa Parse)
- IA: Integração com LLM (OpenRouter, Groq, Google, OpenAI)

---

## 🏗️ Arquitetura Geral

### Estrutura de Pastas

```
src/
├── components/              # 93 componentes React
│   ├── analysis/           # 10 componentes de análise
│   ├── ui/                 # 49 componentes shadcn/ui
│   └── *.tsx               # Componentes principais (Timeline, Dashboard, etc.)
├── pages/                  # 4 páginas (Index, Dashboard, NotFound, PublicApprovedView)
├── services/               # 10 serviços (db, auth, llm, manufacturing, etc.)
├── types/                  # Tipos TypeScript centrais
├── utils/                  # 8 utilitários (datas, métricas, análise de produtividade)
├── hooks/                  # Hooks customizados
├── contexts/               # Contextos React
└── lib/                    # Configurações (Supabase client)
```

### Banco de Dados (Supabase)

**Tabelas Principais:**
- `matrices` – Matrizes (código, data recebimento, prioridade, responsável)
- `events` – Eventos da timeline (tipo, data, comentário, status teste)
- `event_files` – Arquivos anexados aos eventos
- `folders` – Pastas para organização
- `users` – Usuários do sistema (admin/editor/viewer)
- `user_sessions` – Sessões de autenticação

**Tabelas de Análise:**
- `analysis_producao` – Dados de produção (payload JSON + data normalizada)
- `analysis_carteira` – Dados de carteira/pedidos (payload JSON + data implantação)
- `analysis_ferramentas` – Dados de ferramentas (matriz, seq, status, datas)
- `analysis_keywords` – Palavras-chave para análise de causas
- `analysis_carteira_flat` – Tabela plana para agregações (última implantação por ferramenta)

**Tabelas de Workflow:**
- `manufacturing_records` – Workflow de confecção (necessidade → solicitação → fabricação → recebida)
- `testing_queue` – Fila de testes (P18/P19)
- `kanban_columns`, `kanban_cards`, `kanban_checklist` – Kanban board

**Tabelas de Limpeza/Nitretação:**
- `cleaning_orders` – Ordens de limpeza (saída/retorno, NF, diâmetro, SLA)
- `llm_config` – Configuração de provedores LLM por usuário

---

## 🎯 Funcionalidades Principais

### 1. **Timeline (Fluxo de Eventos)**
**Arquivo:** `src/components/FlowView.tsx`

- Visualização gráfica de eventos por matriz usando React Flow
- Tipos de eventos: Recebimento, Testes, Limpeza (Saída/Entrada), Correção Externa (Saída/Entrada), Aprovado, Outro
- Status de teste: Aprovado / Reprovado (apenas para eventos "Testes")
- Exibição de cliente (responsável da matriz)
- Zoom, pan, minimap
- Read-only para usuários não autenticados

**Dados Exibidos:**
- Código da matriz
- Cliente (responsável)
- Data do evento
- Tipo e comentário
- Responsável do evento
- Máquina (P18/P19 para testes)

---

### 2. **Planilha de Marcos (Matrix Sheet)**
**Arquivo:** `src/components/MatrixSheet.tsx`

- Tabela compacta com edição rápida de datas
- Colunas: Código, Cliente, Recebimento, 1º/2º/3º Testes, Aprovação, Status
- Filtros por pasta, status, prioridade
- Busca por código
- Ordenação por data
- Datas em formato PT-BR (DD/MM/AAAA)
- Suporta múltiplos testes (conta apenas os concluídos)

---

### 3. **Dashboard**
**Arquivo:** `src/components/MatrixDashboard.tsx`

**KPIs Principais:**
- Total de matrizes
- Matrizes aprovadas
- Matrizes em teste
- Matrizes em correção
- Matrizes paradas (sem evento há 10+ dias)

**Indicadores Avançados:**
- Lead de aprovação por pasta (dias)
- Distribuição de aprovações por número de testes (1, 2, 3, >4)
- Distribuição por pasta
- Gráficos de tendência

---

### 4. **Workflow de Confecção (Manufacturing)**
**Arquivo:** `src/components/ManufacturingView.tsx`

**3 Estágios Progressivos:**

1. **Necessidade (need)** – Matrizes recém-registradas
   - Botão azul para mover para Solicitação
   - Formulário completo com tipo (Nova/Reposição), perfil (Tubular/Sólido), fornecedor, prazo

2. **Solicitação (pending)** – Processo interno/OCs
   - Seleção múltipla com aprovação em lote
   - Data estimada padrão (20 dias úteis)
   - Botão verde para aprovar fabricação

3. **Em Fabricação (approved)** – Matriz no fornecedor
   - Disponível para seleção na Timeline
   - Botão para marcar como recebida

**Campos Persistidos:**
- `priority` (low/medium/high/critical)
- `estimated_delivery_date`
- `package_size`, `hole_count`
- `observacoes` (texto)
- `anexos` (JSONB com arquivos)
- `matrix_images`, `problem_images`
- Timestamps de transição (`moved_to_pending_at`, `moved_to_approved_at`, `moved_to_received_at`)

**Lead Time:**
- Calculado automaticamente por estágio
- Exibido em dias úteis
- Exportação Excel com separação por status

---

### 5. **Área de Análise (Analysis)**
**Arquivo:** `src/components/AnalysisView.tsx`

**8 Abas Integradas:**

#### 5.1 **Análise com IA (Decisão de Reposição)**
**Arquivo:** `src/components/analysis/AnalysisDecisaoReposicaoView.tsx`

- **Score Único (0–100)** combinando:
  - Risco de Vida (40%): Cobertura, EOL, Desgaste
  - Pressão de Demanda (30%): Crescimento 6m vs 12m
  - Risco de Desempenho (20%): Inverso da produtividade
  - Risco Operacional (10%): Single point of failure, sequências insuficientes

- **Status Automático:**
  - ≥70: Confeccionar Imediatamente
  - 40–69: Planejar Reposição
  - <40: Não Necessita Reposição

- **Interface em 2 Painéis:**
  - **Esquerdo:** Lista de matrizes com status visual, score, indicadores rápidos
  - **Direito:** 3 abas
    - **Decisão:** Hero card + diagnóstico visual + motivos + timeline (+30/+60/+90 dias) + ações
    - **Sequências:** Análise por sequência (desgaste, cobertura, demanda, EOL)
    - **Simulador:** Controles "E se…" (demanda ±20–50%, sequências +0–3, resetar desgaste)

- **Integração LLM:**
  - Gera parecer técnico estruturado (recomendação + motivos + riscos + ações)
  - Ranking diário (Top 50 matrizes)
  - Provedores: OpenRouter → Groq → Google → OpenAI (com fallback)
  - Análise de produção (6 meses) integrada

#### 5.2 **Carteira**
**Arquivo:** `src/components/analysis/AnalysisCarteiraView.tsx`

- Upload de planilha Excel (XLSX/XLS/CSV)
- Tabela com: Ferramenta, Pedido Kg, Cliente, Liga, Têmpera, Data Implant
- Filtros: Ferramenta, Cliente, Período (De/Até), Tipo (Todos/Produção)
- Agregação case-insensitive por ferramenta
- Estatísticas: Total registros, volume em kg/ton, distribuição ABC
- Normalização de datas (DD/MM/AAAA, YYYY-MM-DD, serial Excel)
- VIEW `analysis_carteira_last_implant` para "Último Pedido" por ferramenta

#### 5.3 **Produção**
**Arquivo:** `src/components/analysis/AnalysisProducaoView.tsx`

- Upload de planilha Excel (XLSX/XLS/CSV)
- Tabela com: Prensa, Data Produção, Turno, Ferramenta, Seq, Peso Bruto, Peso Líquido, Produtividade, Cod Parada, Observação Lote
- Filtros: Matriz, Prensa, Seq, Período (De/Até), Produtividade (mín/máx)
- Ordenação por data (mais recente → mais antigo)
- Botão "Analisar Ferramenta" abre aba dedicada com gráficos
- RPC `public.analysis_producao_truncate()` para sobrescrita total antes de novo upload

#### 5.4 **Produtividade**
**Arquivo:** `src/components/analysis/AnalysisProdutividadeView.tsx`

- Análise completa com gráficos interativos (linha, barras, pizza)
- Filtros avançados: Cliente, Ferramenta, Período personalizado
- Métricas: Produtividade média, eficiência, volume total
- Exportação Excel e PDF
- Tendências e comparações

#### 5.5 **Análise de Ferramenta**
**Arquivo:** `src/components/analysis/FerramentaAnalysisDialog.tsx`

- Gráfico de Produtividade (12 meses)
  - Linha suavizada com média mensal (kg/h)
  - Linhas de objetivo fixas: 1.300 kg/h (Liga Comum), 1.000 kg/h (Liga Especial)
  - Filtro: Peso bruto ≥ 200 kg, produtividade > 0 e ≤ 2.400 kg/h
  - Tooltip com valor e sequência

- Gráfico de Entradas de Pedido (Carteira, 12 meses)
  - Soma mensal de `pedido_kg` por ferramenta
  - Eixo Y em kg com formatação PT-BR

- Análise de Causas por Palavras-Chave
  - Gerenciador `KeywordsManagerDialog`
  - Categorias: Geral, Mecânico, Material, Processo, Dimensional, Qualidade
  - Conta ocorrências em "Observação Lote"
  - Botão "Adicionar Todas" remove duplicatas e ignora existentes

- Indicadores Adicionais:
  - Média de produtividade (último mês, 6 meses, 12 meses)
  - Análise de Extremos (maior/menor produtividade com volume)
  - Indicador por Cod Parada (exclui 400, 401, 402, 306, 313, 315, 121)
  - Rodapé com total de registros e regra de filtro

#### 5.6 **Ferramentas**
**Arquivo:** `src/components/analysis/AnalysisFerramentasView.tsx`

- Upload de planilha Excel (XLSX/XLS/CSV)
- Tabela com: Matriz, Seq, Qte.Prod., Status, Ativa, Dt.Entrega, Data Uso
- Filtros: Ativa (Sim/Não/Todas), Status, Matriz
- Estatísticas: Maior, Menor, Mediana de Qte.Prod.
- Mapeamento de colunas flexível (case-insensitive)
- RPC `public.analysis_ferramentas_truncate()` para sobrescrita

#### 5.7 **Vida (Expectativa de Vida)**
**Arquivo:** `src/components/analysis/AnalysisVidaView.tsx`

- **KPIs Estratégicos:**
  - Matrizes críticas, em atenção, saudáveis
  - EOL em 30 dias
  - Sequências ativas
  - Utilização média

- **Insights Automáticos:**
  - Alertas de ruptura
  - Cobertura baixa
  - Demanda crescente
  - Sequências insuficientes

- **Score de Risco Composto (0-100):**
  - Cobertura (50%)
  - EOL (30%)
  - Desgaste (20%)
  - Single point of failure

- **Análises Avançadas:**
  - Sala de Guerra (Top 10 críticas)
  - Previsão de Gargalos (30/60/90 dias)
  - Single Point of Failure
  - Distribuição de Capacidade por faixa de risco
  - Plano de Ação Recomendado

#### 5.8 **Necessidades**
**Arquivo:** `src/components/analysis/AnalysisNecessidadesView.tsx`

- Painel gerencial inteligente
- KPIs: Críticas, Atenção, Saudáveis, EOL 30d, Seq. Ativas, Utilização
- Insights com alertas de ruptura, cobertura, demanda, sequências
- Ações recomendadas (confeccionar, ampliar capacidade, revisar planejamento)

---

### 6. **Notificações (Sino)**
**Arquivo:** `src/components/NotificationsBell.tsx`

- Sino com badge de contagem
- Categorias: Aprovadas, Reprovado, Limpeza, Correção Externa, Recebidas
- Seleção por categoria ou individual
- Envio de e-mail via `mailto:`
- Template: Remove "Apontado", inclui Cliente (responsável da matriz)
- Persistência global em `notifications_sent` (Supabase)
- Realtime para sincronização entre abas/usuários
- Variável de ambiente: `VITE_NOTIFY_GROUP_EMAILS` (lista separada por vírgulas)

---

### 7. **Kanban Board**
**Arquivo:** `src/components/KanbanBoard.tsx`

- 3 colunas: Backlog, Em Andamento, Concluído
- Cards automáticos gerados por eventos (Correção Externa Saída/Entrada)
- Cards manuais para tarefas customizadas
- Checklist por card
- WIP (Work In Progress) limits
- Histórico de movimentação

---

### 8. **Fila de Testes**
**Arquivo:** `src/components/TestingView.tsx`

- 2 prensas: P18 e P19
- Planejamento de teste com fila em `testing_queue`
- Iniciar teste: cria evento "Testes"
- Finalizar teste: atualiza último evento "Testes" com "concluído"
- Edição rápida: observação e imagens em memória
- Lightbox para visualizar imagens
- Numeração de testes: badge "Teste N"
- Sincronização automática

---

### 9. **Limpeza e Nitretação**
**Arquivo:** `src/components/CleaningOrdersView.tsx`, `CleaningTrackingDashboard.tsx`, `RomaneioInterface.tsx`

**Componentes:**

1. **Romaneio (Saída)**
   - Registro de ferramenta saindo para limpeza
   - Captura automática de diâmetro do payload de `analysis_ferramentas`
   - NF de saída, data saída
   - Observações
   - Opção de nitretação

2. **Em Limpeza**
   - Tabela com ferramentas em limpeza
   - SLA diferenciado por tamanho:
     - Pequena (≤300mm): 1 dia útil
     - Grande (>300mm): 3 dias úteis
   - Cálculo de dias úteis (segunda-sexta)
   - Importação de NF-e (XML/PDF) para baixa automática
   - Parser robusto para XML (suporta namespace)
   - Extração de nNF, série, data, ferramentas
   - Modal de preview com data PT-BR, nº nota, total, encontradas, não encontradas
   - Aplicação automática de baixa com preenchimento de `data_retorno` e `nf_retorno`

3. **Em Nitretação**
   - Tabela com ferramentas em nitretação
   - SLA: 3 dias
   - Datas de entrada/saída

4. **Estoque**
   - Inventário de ferramentas
   - Controle de quantidade

5. **Acompanhamento**
   - Dashboard de SLA
   - Gráficos de status
   - Alertas de atraso

---

### 10. **Autenticação e Controle de Acesso**
**Arquivo:** `src/services/auth.ts`, `src/components/LoginDialog.tsx`

- Login/Logout com sessões
- Papéis: admin, editor, viewer
- Sessões expiram após 8 horas
- Tabelas: `users`, `user_sessions`
- Navegação protegida por login
- Sidebar e painel de formulários ocultos para não logados

---

### 11. **Histórico de Atividades**
**Arquivo:** `src/components/ActivityHistory.tsx`

- Timeline de eventos com filtros
- Categorias: Aprovadas, Reprovado, Limpeza, Correção Externa, Recebidas
- Filtros recolhíveis
- Busca por código
- Ordenação por data

---

### 12. **Ferramentas Aprovadas**
**Arquivo:** `src/components/ApprovedToolsView.tsx`

- Agrupamento por Ano > Mês
- Exibição de matrizes aprovadas
- Data de primeira aprovação
- Formatação PT-BR

---

## 🔧 Serviços (Services)

### `src/services/db.ts`
- CRUD de matrizes, eventos, pastas
- Kanban operations
- Auditoria (log de ações)
- Helpers para queries

### `src/services/auth.ts`
- Login/logout
- Gerenciamento de sessões
- CRUD de usuários

### `src/services/manufacturing.ts`
- CRUD de registros de confecção
- Cálculo de lead time
- Filtros e ordenação

### `src/services/llm.ts`
- Integração com LLM (OpenRouter, Groq, Google, OpenAI)
- Geração de parecer técnico
- Ranking diário
- Fallback automático entre provedores

### `src/services/analysis.ts`
- Upload de planilhas Excel
- Gerenciamento de arquivos no Storage

### `src/services/files.ts`
- Upload/download de arquivos
- Metadados (mime_type, file_size)

### `src/services/testingQueue.ts`
- Gerenciamento da fila de testes
- Disponibilidade de matrizes para teste

### `src/services/cache.ts`
- Cache em memória para otimização

### `src/services/emailGroups.ts`
- Gerenciamento de grupos de e-mail

### `src/services/templates.ts`
- Templates de e-mail

---

## 📊 Utilitários (Utils)

### `dateUtils.ts`
- Formatação de datas PT-BR
- Cálculo de dias úteis
- Conversão de formatos

### `metrics.ts`
- Cálculo de status atual
- Dias desde último evento
- Indicadores de matriz

### `productivityAnalysis.ts`
- Análise de produtividade
- Cálculos de eficiência
- Processamento de dados

### `productivityScore.ts`
- Score de produtividade (0-100)

### `productivityInsights.ts`
- Insights automáticos de produtividade

### `productivityDrilldown.ts`
- Análise detalhada por dimensão

### `productivityPrediction.ts`
- Previsões de produtividade

---

## 🗄️ Banco de Dados - Detalhes

### RPCs (Remote Procedure Calls)

1. **`public.analysis_producao_truncate()`**
   - Trunca tabela `analysis_producao` antes de novo upload
   - SECURITY DEFINER
   - GRANT para anon/authenticated

2. **`public.analysis_carteira_truncate()`**
   - Trunca tabela `analysis_carteira` antes de novo upload

3. **`public.analysis_ferramentas_truncate()`**
   - Trunca tabela `analysis_ferramentas` antes de novo upload

4. **`public.analysis_carteira_flat_truncate()`**
   - Trunca tabela `analysis_carteira_flat`

5. **`public.matrix_lifespan_summary()`**
   - Retorna vida útil, capacidade, cobertura, EOL por matriz

6. **`public.matrix_lifespan_by_sequence()`**
   - Retorna dados por sequência

7. **`public.analysis_carteira_flat_agg()`**
   - Agregação de carteira (crescimento demanda 6m vs 12m)

8. **`public.get_productivity_stats()`**
   - Produtividade e eficiência média

### Triggers

1. **`trg_analysis_producao_set_produced_on`**
   - Popula `produced_on` a partir de `payload->>'Data Produção'`
   - Aceita: DD/MM/AAAA, YYYY-MM-DD, serial Excel

2. **`trg_analysis_carteira_implanted_on`**
   - Popula `implanted_on` a partir de `payload->>'Data Implant'` (ou `Data`, `Data Pedido`)

3. **`trg_analysis_carteira_flat_sync`**
   - Sincroniza dados para tabela plana

### Views

1. **`analysis_carteira_last_implant`**
   - Agrega `max(data_implant)` por ferramenta normalizada
   - Índices: `idx_analysis_carteira_flat_ferr_key`, `idx_analysis_carteira_flat_data_implant`

---

## 🎨 UI/UX

### Componentes shadcn/ui (49 componentes)
- Dialog, Sheet, Tabs, Button, Input, Select, Checkbox, Radio, Toggle
- Accordion, Collapsible, Dropdown Menu, Context Menu
- Card, Badge, Avatar, Progress, Slider, Switch
- Toast, Tooltip, Popover, Hover Card
- Scroll Area, Separator, Navigation Menu
- Alert Dialog, Aspect Ratio, Carousel, Combobox, Command, Date Picker
- Form, Menubar, Pagination, Resizable, Sonner (toast)

### Design System
- Tailwind CSS v3 com animações
- Cores: Primária (azul), Secundária (roxo), Sucesso (verde), Aviso (amarelo), Erro (vermelho)
- Ícones: Lucide React (462 ícones)
- Responsividade: Mobile-first (planejamento em andamento)

---

## 📱 Planejamento Mobile-First

**Status:** Em andamento (4 fases planejadas)

**Documentação:**
- `MOBILE_FIRST_PLAN.md` – Plano detalhado
- `ANALISE_MOBILE_FIRST.md` – Análise técnica
- `EXEMPLOS_MOBILE_FIRST.md` – Exemplos de código
- `CHECKLIST_MOBILE_FIRST.md` – Validação

**Componentes Críticos:**
1. **Index.tsx** – Sidebar sempre visível (precisa drawer)
2. **ManufacturingView.tsx** – Tabelas largas (precisa cards)
3. **AnalysisView.tsx** – Gráficos sem scroll (precisa overflow-x-auto)
4. **MatrixSheet.tsx** – Tabela não responsiva
5. **MatrixSidebar.tsx** – Altura máxima

---

## 🔐 Segurança

- RLS (Row Level Security) habilitado nas tabelas
- Políticas liberais para protótipo (ajustar em produção)
- Autenticação via sessões (token + expires_at)
- Hash Base64 simples em desenvolvimento (migrar para bcrypt em produção)
- Variáveis de ambiente: `.env` com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_NOTIFY_GROUP_EMAILS`

---

## 📦 Dependências Principais

```json
{
  "react": "^18.3.1",
  "typescript": "^5.8.3",
  "vite": "^5.4.19",
  "tailwindcss": "^3.4.17",
  "@supabase/supabase-js": "^2.58.0",
  "recharts": "^2.15.4",
  "react-hook-form": "^7.61.1",
  "zod": "^3.25.76",
  "xlsx": "^0.18.5",
  "papaparse": "^5.5.3",
  "date-fns": "^3.6.0",
  "lucide-react": "^0.462.0",
  "@tanstack/react-query": "^5.83.0",
  "@xyflow/react": "^12.8.6"
}
```

---

## 🚀 Scripts NPM

```bash
npm run dev          # Inicia servidor de desenvolvimento
npm run build        # Build de produção
npm run build:dev    # Build em modo desenvolvimento
npm run lint         # Lint com ESLint
npm run preview      # Preview local do build
```

---

## 📝 Convenções

### Datas
- Exibição: **DD/MM/AAAA** (PT-BR)
- Armazenamento: **YYYY-MM-DD** (ISO)
- Nunca usar `new Date(...)` em strings ISO (timezone)
- Helpers: `formatToBR()`, `fmtISODate()`

### Números
- Decimal: **1.000,50** (milhar com ponto, decimal com vírgula)
- Separação de milhares: **10.000,99**

### Idioma
- **Português Brasileiro (PT-BR)** em todas as respostas e UI

---

## 🔄 Fluxos de Trabalho Principais

### 1. Confecção de Matriz
```
Formulário de Confecção
  ↓
Criar Matriz + Evento Recebimento
  ↓
Aparece em Timeline/Planilha
  ↓
Manufacturing Record (Necessidade)
  ↓
Mover para Solicitação (Pending)
  ↓
Aprovar Fabricação (Approved)
  ↓
Marcar como Recebida (Received)
```

### 2. Teste
```
Planejamento (Testing Queue)
  ↓
Iniciar Teste (Cria evento "Testes")
  ↓
Finalizar Teste (Atualiza evento com "concluído")
  ↓
Editar Observação/Imagens
```

### 3. Limpeza
```
Romaneio (Saída)
  ↓
Em Limpeza (Acompanhamento SLA)
  ↓
Importar NF-e (XML)
  ↓
Baixa Automática (data_retorno + nf_retorno)
```

### 4. Análise
```
Upload de Planilha (Excel)
  ↓
Truncar Tabela (RPC)
  ↓
Inserir em Lotes
  ↓
Filtros e Visualização
  ↓
Gráficos e Insights
```

### 5. Notificação
```
Evento Criado/Atualizado
  ↓
Categorização (Aprovadas/Reprovado/Limpeza/etc)
  ↓
Sino com Badge
  ↓
Seleção e Envio de E-mail
  ↓
Persistência em notifications_sent
  ↓
Realtime para Sincronização
```

---

## 📊 Métricas e KPIs

### Dashboard
- Total de matrizes
- Matrizes aprovadas
- Matrizes em teste
- Matrizes em correção
- Matrizes paradas
- Lead de aprovação por pasta
- Distribuição de aprovações por nº de testes

### Análise de Vida
- Matrizes críticas
- Matrizes em atenção
- Matrizes saudáveis
- EOL em 30 dias
- Sequências ativas
- Utilização média
- Score de Risco Composto

### Produtividade
- Produtividade média (kg/h)
- Eficiência (%)
- Volume total (kg)
- Tendência (subindo/estável/caindo)
- Comparação vs objetivos (1.000-1.300 kg/h)

### Limpeza
- SLA por tamanho (1 ou 3 dias úteis)
- Ferramentas em limpeza
- Ferramentas em nitretação
- Taxa de atraso

---

## 🔗 Integração com Supabase

### Realtime
- Habilitado em `public.notifications_sent`
- Sincronização em tempo real entre abas/usuários
- Publicação: `supabase_realtime`

### Storage
- Arquivos de eventos (`event_files`)
- Imagens de confecção (`manufacturing_records`)
- Planilhas Excel (`analysis_excel_uploads`)
- Caminho: `s3://bucket-name/path/to/file`

### Authentication
- Sessões customizadas (não usa Supabase Auth)
- Tabelas: `users`, `user_sessions`
- Token + expires_at

---

## 🐛 Troubleshooting

| Problema | Solução |
|----------|---------|
| "Reprovado" não aparece no sino | Recarregar página, verificar `events.test_status = 'Reprovado'`, Realtime habilitado |
| Datas -1 dia | Usar helpers de formatação direta (`formatToBR`, `fmtISODate`) |
| E-mail sem destinatários | Setar `VITE_NOTIFY_GROUP_EMAILS` no `.env` |
| RPC não encontrada | Executar migração em `data_schema.sql`, recarregar schema do PostgREST |
| Tabela plana vazia | Executar RPC de truncate + inserção, verificar trigger |

---

## 📚 Documentação Relacionada

- `README.md` – Setup e visão geral
- `database_schema.md` – Esquema do banco
- `specs.md` – Especificações e iterações
- `change_log.md` – Histórico de alterações
- `data_schema.sql` – DDL cumulativa com rollback
- `MOBILE_FIRST_PLAN.md` – Planejamento mobile
- `ANALISE_MOBILE_FIRST.md` – Análise técnica mobile

---

## 🎯 Próximos Passos Recomendados

1. **Mobile-First (Fase 1):** Implementar drawer para sidebar em `Index.tsx`
2. **Responsividade:** Converter tabelas em cards em `ManufacturingView.tsx`
3. **Gráficos:** Adicionar scroll horizontal em `AnalysisView.tsx`
4. **Validação:** Testar em dispositivo real (375px, 768px, 1280px)
5. **Documentação:** Atualizar `change_log.md` após cada fase

---

**Fim da Análise Completa**
