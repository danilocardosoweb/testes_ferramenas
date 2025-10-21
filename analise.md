# Análise do Projeto - Sistema de Controle de Matrizes

## Visão Geral do Projeto

Este é um sistema completo de gestão de matrizes industriais desenvolvido em React + TypeScript + Vite, integrado ao Supabase para persistência de dados. O sistema gerencia todo o ciclo de vida das matrizes, desde a confecção até a aprovação final.

## Arquitetura

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui (componentes)
- **Roteamento**: React Router DOM
- **Estado**: React Hooks + Context
- **Queries**: TanStack React Query
- **Gráficos**: Recharts
- **Fluxo**: React Flow (@xyflow/react)

### Backend
- **Banco de Dados**: Supabase (PostgreSQL)
- **Autenticação**: Sistema customizado com sessões
- **Storage**: Supabase Storage para arquivos
- **Realtime**: Supabase Realtime para atualizações em tempo real

## Estrutura de Dados

### Entidades Principais

#### 1. Matrizes (matrices)
- **Campos**: id, code, received_date, folder_id, priority, responsible
- **Relacionamentos**: 1-n com events, n-1 com folders
- **Status**: Calculado dinamicamente pelo último evento

#### 2. Eventos (events)
- **Campos**: id, matrix_id, date, type, comment, location, responsible, test_status
- **Tipos**: Recebimento, Testes, Limpeza Saída/Entrada, Correção Externa Saída/Entrada, Aprovado, Outro
- **Status de Teste**: Aprovado/Reprovado (para eventos tipo "Testes")

#### 3. Pastas (folders)
- **Campos**: id, name
- **Função**: Organização das matrizes por projeto/cliente

#### 4. Confecção (manufacturing_records)
- **Campos**: matrix_code, manufacturing_type, profile_type, supplier, priority, status
- **Status**: need → pending → approved → received
- **Workflow**: Necessidade → Solicitação → Em Fabricação → Recebida

#### 5. Kanban
- **Tabelas**: kanban_columns, kanban_cards, kanban_checklist, kanban_wip_settings
- **Funcionalidade**: Gestão visual do fluxo de trabalho

#### 6. Usuários
- **Tabelas**: users, user_sessions
- **Roles**: admin, editor, viewer
- **Autenticação**: Sistema customizado com hash Base64 (desenvolvimento)

## Funcionalidades Principais

### 1. Timeline/FlowView
- **Componente**: `src/components/FlowView.tsx`
- **Funcionalidade**: Visualização em fluxo das matrizes e eventos
- **Recursos**: Zoom, pan, minimap, seleção de matrizes
- **Modo ReadOnly**: Para usuários não autenticados

### 2. Planilha
- **Componente**: `src/components/MatrixSheet.tsx`
- **Funcionalidade**: Edição rápida de datas de marcos
- **Marcos**: Testes (1º-6º), Limpeza (Saída/Entrada), Correção Externa (Saída/Entrada), Aprovação
- **Formatação**: Datas em PT-BR sem problemas de fuso

### 3. Dashboard
- **Componente**: `src/components/MatrixDashboard.tsx`
- **Métricas**: Lead time por pasta, distribuição de aprovações, indicadores gerais
- **Gráficos**: Recharts para visualização de dados

### 4. Confecção
- **Componente**: `src/components/ManufacturingView.tsx`
- **Workflow**: 3 abas (Necessidade, Solicitação, Em Fabricação)
- **Formulário**: Registro completo com validação
- **Upload**: Imagens com preview e lightbox

### 5. Testes
- **Componente**: `src/components/TestingView.tsx`
- **Funcionalidade**: Planejamento e execução de testes
- **Fila**: testing_queue com máquinas P18/P19
- **Lógica**: Um teste ativo por matriz

### 6. Kanban
- **Componente**: `src/components/KanbanBoard.tsx`
- **Funcionalidade**: Gestão visual do fluxo
- **Cards**: Automáticos e manuais
- **WIP**: Limites por coluna

### 7. Notificações
- **Componente**: `src/components/NotificationsBell.tsx`
- **Categorias**: Aprovadas, Reprovado, Limpeza, Correção Externa
- **E-mail**: Envio via mailto com template
- **Realtime**: Atualizações em tempo real

### 8. Histórico
- **Componente**: `src/components/ActivityHistory.tsx`
- **Funcionalidade**: Log de atividades com filtros
- **Filtros**: Por categoria, período, matriz

## Fluxo de Dados

### 1. Confecção → Recebimento
1. Registro na aba "Confecção"
2. Status: need → pending → approved
3. Quando recebida: cria matriz + evento "Recebimento"
4. Aparece na Timeline/Planilha

### 2. Processo de Testes
1. Planejamento na aba "Em Teste"
2. Execução com máquina (P18/P19)
3. Conclusão atualiza evento existente
4. Status: Aprovado/Reprovado

### 3. Fluxo Principal
1. Recebimento → Testes → Limpeza → Correção Externa → Aprovação
2. Cada etapa gera eventos com datas
3. Status calculado pelo último evento
4. Notificações automáticas por categoria

## Segurança

### Autenticação
- **Sistema**: Customizado com sessões de 8h
- **Hash**: Base64 (desenvolvimento) - migrar para bcrypt em produção
- **RLS**: Habilitado com políticas liberais (protótipo)

### Controle de Acesso
- **Admin**: Acesso total, gestão de usuários
- **Editor**: Criação/edição de matrizes e eventos
- **Viewer**: Apenas visualização

## Integrações

### Supabase
- **Banco**: PostgreSQL com RLS
- **Storage**: Arquivos e imagens
- **Realtime**: Atualizações em tempo real
- **Auth**: Sistema customizado

### Exportação
- **Excel**: XLSX com múltiplas planilhas
- **JSON**: Importação/exportação de dados
- **Filtros**: Por período, fornecedor, prioridade

## Padrões e Convenções

### Datas
- **Formato**: DD/MM/AAAA (PT-BR)
- **Armazenamento**: YYYY-MM-DD no banco
- **Exibição**: Helpers sem conversão de timezone

### UI/UX
- **Design**: shadcn/ui + Tailwind
- **Responsivo**: Mobile-first
- **Acessibilidade**: ARIA labels, keyboard navigation
- **Loading**: Estados de carregamento
- **Feedback**: Toasts para ações

### Código
- **TypeScript**: Tipagem forte
- **Componentes**: Funcionais com hooks
- **Serviços**: Separação de responsabilidades
- **Nomenclatura**: PT-BR para usuário, EN para código

## Pontos de Melhoria

### Performance
- **Cache**: Implementado em manufacturing
- **Lazy Loading**: Para componentes pesados
- **Debounce**: Para atualizações em tempo real

### Segurança
- **Hash**: Migrar para bcrypt
- **RLS**: Restringir políticas em produção
- **Validação**: Server-side para dados críticos

### Funcionalidades
- **Alertas**: Estagnação de matrizes
- **Relatórios**: PDF com anexos
- **Mobile**: PWA para acesso móvel
- **Offline**: Cache local para uso offline

## Conclusão

O sistema é uma solução completa e bem estruturada para gestão de matrizes industriais, com arquitetura moderna, funcionalidades robustas e boa experiência do usuário. A integração com Supabase fornece uma base sólida para escalabilidade e manutenibilidade.

