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

---

## 10. Exemplos de Código – Padrões Mobile First

### Padrão 1: Drawer para Sidebar (Fase 2)

#### Antes (Não responsivo)
```tsx
// Index.tsx
<div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
  <MatrixSidebar ... />
  <div className="flex flex-col flex-1">
    {/* Conteúdo */}
  </div>
</div>
```

#### Depois (Responsivo)
```tsx
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

export function Index() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
      {/* Drawer em mobile */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <MatrixSidebar ... />
        </SheetContent>
      </Sheet>

      {/* Sidebar em desktop */}
      <div className="hidden md:flex md:w-80 md:flex-shrink-0 md:border-r md:flex-col">
        <MatrixSidebar ... />
      </div>

      {/* Conteúdo principal */}
      <div className="flex flex-col flex-1">
        {/* Botão hambúrguer em mobile */}
        <div className="flex items-center gap-2 p-4 border-b md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-accent rounded-md"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Controle de Matrizes</h1>
        </div>

        {/* Abas de navegação */}
        <div className="overflow-x-auto border-b">
          <div className="flex gap-1 p-2">
            <button
              onClick={() => setMainView("timeline")}
              className={cn(
                "px-3 py-2 rounded-md whitespace-nowrap shrink-0",
                mainView === "timeline" ? "bg-primary text-white" : "hover:bg-accent"
              )}
            >
              <span className="hidden sm:inline">Timeline</span>
              <span className="sm:hidden">📋</span>
            </button>
            {/* Mais abas */}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-auto">
          {mainView === "timeline" && <FlowView ... />}
          {/* Mais views */}
        </div>
      </div>
    </div>
  );
}
```

### Padrão 2: Cards Responsivos (Fase 3)

#### Antes (Tabela não responsiva)
```tsx
// ManufacturingView.tsx
<table className="w-full">
  <thead>
    <tr>
      <th>Código</th>
      <th>Fornecedor</th>
      <th>Prioridade</th>
      <th>Data Estimada</th>
      <th>Ações</th>
    </tr>
  </thead>
  <tbody>
    {records.map(record => (
      <tr key={record.id}>
        <td>{record.matrix_code}</td>
        <td>{record.supplier}</td>
        <td>{record.priority}</td>
        <td>{record.estimated_delivery_date}</td>
        <td>
          <button onClick={() => moveToNext(record)}>Próximo</button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

#### Depois (Responsivo com cards)
```tsx
// ManufacturingView.tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";

export function ManufacturingView() {
  const isMobile = !useMediaQuery("(min-width: 768px)");

  if (isMobile) {
    return (
      <div className="space-y-2 p-4">
        {records.map(record => (
          <Card key={record.id} className="p-3">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1">
                <h3 className="font-bold text-sm">{record.matrix_code}</h3>
                <p className="text-xs text-muted-foreground">{record.supplier}</p>
              </div>
              <Badge variant={getPriorityVariant(record.priority)}>
                {record.priority}
              </Badge>
            </div>

            {record.estimated_delivery_date && (
              <p className="text-xs mt-2">
                📅 {formatToBR(record.estimated_delivery_date)}
              </p>
            )}

            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => moveToNext(record)}
              >
                Próximo
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => openDetails(record)}
              >
                Detalhes
              </Button>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // Desktop: tabela
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th>Código</th>
            <th>Fornecedor</th>
            <th>Prioridade</th>
            <th>Data Estimada</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {records.map(record => (
            <tr key={record.id}>
              <td>{record.matrix_code}</td>
              <td>{record.supplier}</td>
              <td>{record.priority}</td>
              <td>{record.estimated_delivery_date}</td>
              <td>
                <button onClick={() => moveToNext(record)}>Próximo</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Padrão 3: Filtros em Sheet (Fase 3)

#### Antes (Filtros laterais)
```tsx
<div className="flex gap-4">
  <div className="w-64 border-r p-4">
    {/* Filtros */}
    <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
      <option>Todas</option>
      <option>Baixa</option>
      <option>Média</option>
      <option>Alta</option>
      <option>Crítica</option>
    </select>
  </div>
  <div className="flex-1">
    {/* Conteúdo */}
  </div>
</div>
```

#### Depois (Responsivo)
```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

export function ManufacturingView() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isMobile = !useMediaQuery("(min-width: 768px)");

  const FilterContent = () => (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Prioridade</label>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
          className="w-full mt-1 p-2 border rounded-md"
        >
          <option>Todas</option>
          <option>Baixa</option>
          <option>Média</option>
          <option>Alta</option>
          <option>Crítica</option>
        </select>
      </div>
      {/* Mais filtros */}
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Sheet em mobile */}
      {isMobile && (
        <>
          <Button
            onClick={() => setFiltersOpen(true)}
            variant="outline"
            className="w-full"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>

          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetContent side="bottom" className="h-auto">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <FilterContent />
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Sidebar em desktop */}
      {!isMobile && (
        <div className="w-64 border-r p-4">
          <FilterContent />
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1">
        {/* Tabela/Cards */}
      </div>
    </div>
  );
}
```

### Padrão 4: Gráficos Responsivos (Fase 4)

#### Antes (Sem scroll)
```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="name" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Line type="monotone" dataKey="value" stroke="#8884d8" />
  </LineChart>
</ResponsiveContainer>
```

#### Depois (Responsivo com scroll)
```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

<div className="overflow-x-auto">
  <div className="min-w-[300px] md:min-w-0">
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="value" stroke="#8884d8" />
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>
```

### Hook Customizado: useMediaQuery

```typescript
// src/hooks/use-media-query.ts
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);

  return matches;
}
```

### Uso no componente
```tsx
import { useMediaQuery } from "@/hooks/use-media-query";

export function MyComponent() {
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const isTablet = useMediaQuery("(min-width: 768px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  return (
    <div>
      {isMobile && <p>Você está em mobile</p>}
      {isTablet && <p>Você está em tablet</p>}
      {isDesktop && <p>Você está em desktop</p>}
    </div>
  );
}
```

---

**Nota:** Todos os exemplos usam Tailwind CSS v3 e shadcn/ui, que já estão implementados no projeto.
