# Plano de Implementação Mobile First – App Controle de Matrizes
**Revisão: 25/11/2025**

## 1. Objetivo

- Garantir que o app funcione **primeiro** e **bem** em telas pequenas (celulares), e depois seja estendido para tablets e desktops.
- Melhorar:
  - Usabilidade em campo (uso em fábrica / chão de fábrica).
  - Legibilidade e toques em telas menores.
  - Manutenção futura da interface com padrão consistente de responsividade.

## 1.1. Estado Atual do App (25/11/2025)

**Tecnologias confirmadas:**
- React 18 + TypeScript + Vite
- Tailwind CSS v3 + shadcn/ui
- Supabase (Postgres, Realtime, Storage)
- Lucide React para ícones

**Estrutura de componentes:**
- `src/components/` (82 arquivos): componentes reutilizáveis, diálogos, views
- `src/pages/Index.tsx`: layout raiz com sidebar + conteúdo
- `src/services/`: integração com Supabase (db.ts, auth.ts, manufacturing.ts, etc.)
- `src/types/`: tipos centrais (Matrix, MatrixEvent, AuthSession)

**Funcionalidades principais implementadas:**
- Timeline de eventos com status de testes (Aprovado/Reprovado)
- Workflow de confecção (Necessidade → Solicitação → Em Fabricação → Recebida)
- Área de Análise com 5 abas (Carteira, Produção, Ferramentas, Vida, Necessidades)
- Análise de Ferramenta com gráficos (produtividade 12m, entradas de pedido)
- Notificações em tempo real (Realtime) com categorias
- Kanban Board, Testing Queue, Manufacturing Records
- Sistema de autenticação com sessões

**Componentes críticos para mobile:**
1. `LoginDialog.tsx` – Já tem classes mobile-first (`w-full max-w-sm sm:max-w-md`)
2. `Index.tsx` – Layout raiz com sidebar + conteúdo (precisa de ajustes)
3. `MatrixSidebar.tsx` – Sidebar lateral (precisa de drawer/collapse em mobile)
4. `ManufacturingView.tsx` – Tabelas largas (116KB, precisa de cards em mobile)
5. `AnalysisView.tsx` e análise/* – Gráficos e tabelas (precisa de scroll/responsividade)
6. `MatrixSheet.tsx` – Planilha de marcos (20KB, precisa de layout responsivo)

---

## 2. Contexto do Projeto

Tecnologias principais (já existentes):

- **Frontend**: React + TypeScript.
- **UI**:
  - Componentes customizados (`MatrixSidebar`, `FlowView`, `ManufacturingView`, `AnalysisView`, etc.).
  - Dialogs, Buttons, Inputs de uma lib de componentes (provavelmente baseada em Tailwind/shadcn-ui).
- **Páginas/Telas principais**:
  - `LoginDialog.tsx`
  - `Index.tsx` (layout principal: sidebar + conteúdo)
  - `ManufacturingView.tsx` (workflow de confecção)
  - Área de análise:
    - `AnalysisView.tsx`
    - `AnalysisProducaoView.tsx`
    - `AnalysisCarteiraView.tsx`
    - `FerramentaAnalysisDialog.tsx`
  - Outros: `MatrixSheet`, `FlowView`, `ApprovedToolsView`, `KanbanBoard`, etc.

---

## 3. Princípios de Design Mobile First

1. **Layout em coluna primeiro**
   - Padrão default (sem breakpoint) = layout em **1 coluna**.
   - Elementos laterais (sidebars, painéis extras) são empilhados ou acionados por botões (Drawer/Dialog).

2. **Complexidade progressiva**
   - Mobile: só o essencial visível de cara.
   - Desktop: mostra mais colunas, filtros avançados, gráficos adicionais.

3. **Tamanho de toque e legibilidade**
   - Altura mínima de botões/inputs ≈ 40–44px.
   - Fontes entre 14–16px em mobile.
   - Espaçamentos consistentes (`gap`, `padding`) para evitar interface “apertada”.

4. **Scroll controlado**
   - Evitar scroll horizontal global.
   - Quando necessário (tabela, gráfico largo), colocar `overflow-x-auto` apenas no container específico.

---

## 4. Breakpoints e Grid (Sugeridos)

Adotar convenção parecida com Tailwind:

- `base` (sem prefixo): até ~639px → **mobile**.
- `sm`: ≥ 640px → celulares grandes / tablets pequenos.
- `md`: ≥ 768px → tablets.
- `lg`: ≥ 1024px → desktops.

Padrão:

- Estilos sem prefixo = mobile.
- Adições para telas maiores:
  - `sm:`, `md:`, `lg:`.

Exemplos:

- Layout de colunas:

  ```tsx
  <div className="flex flex-col md:flex-row">
    <Sidebar />
    <Main />
  </div>
  ```

- Larguras:

  ```tsx
  <div className="w-full md:w-80 md:flex-shrink-0" />
  ```

---

## 5. Inventário de Telas e Prioridade

### 5.1. Alta prioridade (Fase 1 e 2)

- **Login**
  - Componente: `src/components/LoginDialog.tsx`
  - Crítico para qualquer uso do sistema.

- **Layout principal**
  - Página: `src/pages/Index.tsx`
  - Componentes dentro:
    - `MatrixSidebar`
    - `FlowView`
    - `MatrixSheet`
    - `MatrixDashboard`
    - `ApprovedToolsView`
    - `ActivityHistory`
    - `ManufacturingView`
    - `AnalysisView`, etc.

- **Manufacturing / Confecção**
  - Componente: `src/components/ManufacturingView.tsx`
  - Fluxo operacional importante e com potencial de uso em tablet/celular.

### 5.2. Média prioridade (Fase 3)

- **Área de Análise**
  - `AnalysisView.tsx`
  - `AnalysisProducaoView.tsx`
  - `AnalysisCarteiraView.tsx`
  - `FerramentaAnalysisDialog.tsx`

### 5.3. Baixa prioridade (Fase 4)

- Telas auxiliares, dashboards secundários, ajustes finos de gráficos e históricos.

---

## 6. Estratégia por Fases (Revisada)

### Fase 1 – Fundamentos + Login (Piloto) ✅ PARCIALMENTE CONCLUÍDO

**Status:**
- `LoginDialog.tsx` já implementa padrão mobile-first (`w-full max-w-sm sm:max-w-md mx-auto p-4 sm:p-6`).
- Formulário em coluna com gap consistente.
- Botões responsivos (`flex flex-col sm:flex-row`).

**Itens restantes:**

1. **Validar Tokens Globais em `index.css` e `tailwind.config.ts`**:
   - Confirmar tipografia padrão mobile (tamanho 14–16px).
   - Espaçamentos base consistentes (`gap-2`, `gap-4`, `p-4`).
   - Verificar se há `max-w-*` definidos globalmente.

2. **Testes de DevTools**:
   - Validar em 375px, 768px, 1280px.
   - Confirmar sem overflow horizontal.
   - Testar fluxo de login em cada breakpoint.

---

### Fase 2 – Layout principal (`Index.tsx`) 🔴 CRÍTICO PARA MOBILE

**Status atual:**
- Layout raiz usa `flex` com sidebar + conteúdo.
- Sidebar é sempre visível (sem drawer em mobile).
- Abas de navegação (Timeline, Análise, Confecção, etc.) usam `overflow-x-auto`.

**Problemas identificados:**
1. Sidebar em mobile ocupa espaço precioso (sem opção de colapso/drawer).
2. Abas podem ficar muito comprimidas em telas pequenas.
3. Sem indicador visual claro de qual aba está ativa em mobile.

**Itens prioritários:**

1. **Container raiz**:
   - Manter `flex flex-col md:flex-row` para empilhar em mobile.
   - Garantir `h-screen w-full overflow-hidden bg-background`.

2. **Sidebar (`MatrixSidebar`) – Transformar em Drawer em mobile**:
   - Em mobile (< 768px):
     - Usar `Sheet` (drawer) acionado por botão hambúrguer.
     - Botão hambúrguer fixo no topo (`sticky top-0`).
     - Drawer com `side="left"` e `className="w-80"`.
   - Em desktop (≥ 768px):
     - `md:w-80 md:flex-shrink-0 md:border-r md:block`.
     - Manter `sidebarCollapsed` funcional.

3. **Header / barra de abas**:
   - Garantir:
     - Botões de abas com `overflow-x-auto` no container.
     - `shrink-0` nos botões para evitar quebra.
     - Ícones + texto em mobile (reduzir tamanho de texto se necessário).
   - Considerar ícones apenas em mobile para economizar espaço.

4. **Testes**:
   - Validar drawer em 375px, 768px.
   - Confirmar sem scroll horizontal nas abas.
   - Testar navegação entre abas em mobile.

---

### Fase 3 – ManufacturingView (Confecção) 🔴 CRÍTICO PARA MOBILE

**Objetivos:**
- Tornar o fluxo de confecção usável em celular, onde tabelas largas costumam quebrar.

**Itens:**

1. **Inventariar componentes dentro de `ManufacturingView.tsx`**:
   - Abas (Necessidade / Solicitação / Em Fabricação / Recebidas?).
   - Listas / tabelas de registros.
   - Modais de criação/edição.

2. **Estratégia para listas/tabelas**:
   - Em mobile:
     - Substituir visualmente `<tr>` por cards empilhados:
       - Código da matriz
       - Status (badges)
       - Datas chave (estimada, recebida)
       - Botões principais (mover de fase, abrir detalhes)
   - Em desktop:
     - Manter tabelas completas.

3. **Filtros e buscas**:
   - Agrupar filtros em:
     - Coluna lateral,
     - Ou botão “Filtros” que abre um `Dialog` ou `Sheet` em mobile.

4. **Testes**:
   - Validar cards em 375px, 768px.
   - Confirmar sem scroll horizontal.
   - Testar seleção múltipla em mobile.

---

### Fase 4 – Área de Análise

- Adaptar gráficos e painéis para uso razoável em celulares.
- Manter poder analítico em desktop.

**Itens:**

1. **`AnalysisView.tsx` (container de abas da análise)**:
   - Garantir que a navegação entre abas seja horizontal scrollable em mobile.

2. **`AnalysisProducaoView.tsx` e `AnalysisCarteiraView.tsx`**:
   - Envolver gráficos em contêineres com:
     - `overflow-x-auto`
     - `min-w-[...]` nos gráficos se necessário.

3. **`FerramentaAnalysisDialog.tsx`**:
   - Em mobile:
     - Reduzir margens.
     - Empilhar cards de KPIs e gráficos em coluna.
   - Em desktop:
     - Manter ou evoluir layout em duas colunas (cards à esquerda, gráficos à direita, por exemplo).

---

## 7. Boas Práticas Operacionais

1. **Mudanças sempre focadas em layout**:
   - Evitar alterar hooks, lógica de negócio ou chamadas ao Supabase quando o objetivo for apenas responsividade.

2. **Pequenos passos + testes frequentes**:
   - Ajustar uma tela por vez.
   - Rodar o app e checar:
     - Console sem erros.
     - Layout em 3 larguras.

3. **Registro no `change_log.md`**:
   - Para cada conjunto de ajustes mobile:
     - Adicionar entrada documentando:
       - Data/hora,
       - Pasta/arquivo,
       - "Ajustes mobile-first (layout responsivo, sem mudança de lógica)".

4. **Feature flags (se necessário)**:
   - Em mudanças mais agressivas, considerar deixar partes do novo layout opcionais (behind a flag) até validar em produção.

---

## 8. Critérios de Conclusão do Mobile First

Considerar a fase de mobile first "boa o suficiente" quando:

- **Login, Index (timeline/planilha) e Manufacturing**:
  - Funcionam sem scroll horizontal em telas ~360–400px.
  - Têm botões e campos confortáveis para toque (≥ 40px altura).
  - Sidebar acessível via drawer em mobile.
  - Abas de navegação legíveis.

- **Área de análise**:
  - Gráficos não quebram a página em mobile.
  - Principais informações são visíveis sem zoom manual.
  - Tabelas substituídas por cards em mobile (se aplicável).

- **Nenhuma funcionalidade antes existente foi perdida**:
  - Nenhum erro novo em console relacionado a props/hook/lógica.
  - Apenas mudanças visuais.
  - Funcionalidades de desktop mantidas intactas.

---

## 9. Resumo Executivo (25/11/2025)

### Prioridade Imediata (Próximas 2 semanas)

**Fase 2 (Index.tsx) – CRÍTICO**
- Transformar sidebar em drawer em mobile (< 768px).
- Adicionar botão hambúrguer para abrir drawer.
- Testar em 375px, 768px, 1280px.
- Estimativa: 4–6 horas.

**Fase 3 (ManufacturingView.tsx) – CRÍTICO**
- Converter tabelas em cards em mobile.
- Mover filtros para Sheet em mobile.
- Testar seleção múltipla em mobile.
- Estimativa: 8–12 horas.

### Prioridade Secundária (Próximas 3–4 semanas)

**Fase 4 (AnalysisView.tsx) – MÉDIA**
- Adicionar `overflow-x-auto` aos gráficos.
- Converter tabelas em cards em mobile.
- Testar em 375px, 768px, 1280px.
- Estimativa: 6–8 horas.

### Validação Final

- Testar em emulador Android (Chrome DevTools).
- Testar em dispositivo real (se possível).
- Validar sem erros em console.
- Confirmar que nenhuma funcionalidade foi perdida.

### Próximos Passos

1. Revisar `Index.tsx` e `MatrixSidebar.tsx` para implementar drawer.
2. Revisar `ManufacturingView.tsx` para converter tabelas em cards.
3. Criar branches de feature para cada fase.
4. Atualizar `change_log.md` após cada fase concluída.
