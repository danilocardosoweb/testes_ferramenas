# Exemplos de Código – Mobile First (25/11/2025)

## 1. Padrão de Drawer para Sidebar (Fase 2)

### Antes (Não responsivo)
```tsx
// Index.tsx
<div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
  <MatrixSidebar ... />
  <div className="flex flex-col flex-1">
    {/* Conteúdo */}
  </div>
</div>
```

### Depois (Responsivo)
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

---

## 2. Padrão de Cards Responsivos (Fase 3)

### Antes (Tabela não responsiva)
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

### Depois (Responsivo com cards)
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

---

## 3. Padrão de Filtros em Sheet (Fase 3)

### Antes (Filtros laterais)
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

### Depois (Responsivo)
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

      <div>
        <label className="text-sm font-medium">Fornecedor</label>
        <select
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className="w-full mt-1 p-2 border rounded-md"
        >
          {/* Opções */}
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

---

## 4. Padrão de Gráficos Responsivos (Fase 4)

### Antes (Sem scroll)
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

### Depois (Responsivo com scroll)
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

---

## 5. Hook Customizado para Media Query

### Criar `src/hooks/use-media-query.ts`
```typescript
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

### Usar no componente
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

## 6. Padrão de Abas Responsivas

### Antes (Abas não responsivas)
```tsx
<div className="flex gap-2 border-b">
  <button onClick={() => setTab("timeline")}>Timeline</button>
  <button onClick={() => setTab("analysis")}>Análise</button>
  <button onClick={() => setTab("manufacturing")}>Confecção</button>
  <button onClick={() => setTab("kanban")}>Kanban</button>
  <button onClick={() => setTab("testing")}>Testing</button>
</div>
```

### Depois (Responsivo)
```tsx
<div className="overflow-x-auto border-b">
  <div className="flex gap-1 p-2">
    <button
      onClick={() => setTab("timeline")}
      className={cn(
        "px-3 py-2 rounded-md whitespace-nowrap shrink-0 text-sm",
        tab === "timeline" ? "bg-primary text-white" : "hover:bg-accent"
      )}
    >
      <span className="hidden sm:inline">📋 Timeline</span>
      <span className="sm:hidden">📋</span>
    </button>

    <button
      onClick={() => setTab("analysis")}
      className={cn(
        "px-3 py-2 rounded-md whitespace-nowrap shrink-0 text-sm",
        tab === "analysis" ? "bg-primary text-white" : "hover:bg-accent"
      )}
    >
      <span className="hidden sm:inline">📊 Análise</span>
      <span className="sm:hidden">📊</span>
    </button>

    {/* Mais abas */}
  </div>
</div>
```

---

## 7. Padrão de Botões Responsivos

### Antes (Botões não responsivos)
```tsx
<div className="flex gap-2">
  <button>Salvar</button>
  <button>Cancelar</button>
</div>
```

### Depois (Responsivo)
```tsx
<div className="flex flex-col sm:flex-row gap-2">
  <button className="w-full sm:w-auto flex-1 sm:flex-none">
    Salvar
  </button>
  <button className="w-full sm:w-auto flex-1 sm:flex-none" variant="outline">
    Cancelar
  </button>
</div>
```

---

## 8. Padrão de Inputs Responsivos

### Antes (Inputs não responsivos)
```tsx
<input
  type="text"
  placeholder="Buscar..."
  className="w-64 p-2 border rounded-md"
/>
```

### Depois (Responsivo)
```tsx
<input
  type="text"
  placeholder="Buscar..."
  className="w-full md:w-64 p-2 border rounded-md text-sm md:text-base"
/>
```

---

## 9. Padrão de Espaçamentos Responsivos

### Antes (Espaçamento fixo)
```tsx
<div className="p-8 gap-4">
  {/* Conteúdo */}
</div>
```

### Depois (Responsivo)
```tsx
<div className="p-4 md:p-6 lg:p-8 gap-2 md:gap-4">
  {/* Conteúdo */}
</div>
```

---

## 10. Checklist de Implementação

### Para cada componente:
- [ ] Identificar elementos que não cabem em mobile
- [ ] Criar versão mobile (cards, drawer, sheet, etc.)
- [ ] Criar versão desktop (tabela, sidebar, etc.)
- [ ] Usar `useMediaQuery` para alternar entre versões
- [ ] Testar em 375px, 768px, 1280px
- [ ] Validar sem erros em console
- [ ] Confirmar que funcionalidades não foram perdidas

---

**Nota:** Todos os exemplos usam Tailwind CSS v3 e shadcn/ui, que já estão implementados no projeto.
