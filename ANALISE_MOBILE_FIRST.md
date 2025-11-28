# Análise Detalhada – Mobile First (25/11/2025)

## 1. Visão Geral do App

O app é uma aplicação React complexa para **controle de matrizes e testes de ferramentas** com funcionalidades avançadas:

- **Timeline de eventos** com status de testes (Aprovado/Reprovado)
- **Workflow de confecção** com 4 etapas (Necessidade → Solicitação → Em Fabricação → Recebida)
- **Área de Análise** com gráficos e tabelas de dados
- **Notificações em tempo real** (Realtime do Supabase)
- **Autenticação com sessões** (tabelas `users` e `user_sessions`)
- **Kanban Board** e **Testing Queue**

**Stack confirmado:**
- React 18 + TypeScript + Vite
- Tailwind CSS v3 + shadcn/ui
- Supabase (Postgres, Realtime, Storage)
- Lucide React (ícones)

---

## 2. Análise de Componentes Críticos

### 2.1. LoginDialog.tsx ✅ BOM ESTADO

**Tamanho:** 115 linhas | **Status:** Mobile-first implementado

**Características positivas:**
- `w-full max-w-sm sm:max-w-md mx-auto p-4 sm:p-6` – padrão correto
- Formulário em coluna (`flex flex-col gap-4`)
- Botões responsivos (`flex flex-col sm:flex-row gap-2`)
- Logo centralizada
- Sem overflow horizontal

**Recomendações:**
- Validar altura mínima de inputs (40px) em mobile
- Testar em 375px, 768px, 1280px

---

### 2.2. Index.tsx (Layout Raiz) 🔴 CRÍTICO

**Tamanho:** 965 linhas | **Status:** Precisa de ajustes

**Estrutura atual:**
```tsx
<div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
  <MatrixSidebar ... />
  <div className="flex flex-col flex-1">
    {/* Abas de navegação */}
    {/* Conteúdo principal */}
  </div>
</div>
```

**Problemas identificados:**

1. **Sidebar sempre visível em mobile**
   - Ocupa espaço precioso (até 320px em telas pequenas)
   - Sem opção de colapso/drawer
   - Força conteúdo para baixo

2. **Abas de navegação comprimidas**
   - Botões: Timeline, Análise, Confecção, Kanban, Testing, Manufacturing, Settings
   - Podem ficar ilegíveis em mobile
   - Sem indicador visual claro de aba ativa

3. **Sem indicador de responsividade**
   - Não há `md:` ou `lg:` prefixes no layout raiz
   - Comportamento é o mesmo em todas as larguras

**Solução proposta:**

```tsx
// Em mobile: drawer + conteúdo
// Em desktop: sidebar visível + conteúdo

<div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
  {/* Drawer em mobile */}
  <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
    <SheetContent side="left" className="w-80 p-0">
      <MatrixSidebar ... />
    </SheetContent>
  </Sheet>

  {/* Sidebar em desktop */}
  <div className="hidden md:block md:w-80 md:flex-shrink-0 md:border-r">
    <MatrixSidebar ... />
  </div>

  {/* Conteúdo principal */}
  <div className="flex flex-col flex-1">
    {/* Botão hambúrguer em mobile */}
    <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
      ☰
    </button>
    
    {/* Abas com overflow-x-auto */}
    <div className="overflow-x-auto">
      {/* Botões de aba */}
    </div>

    {/* Conteúdo */}
  </div>
</div>
```

**Estimativa:** 4–6 horas

---

### 2.3. MatrixSidebar.tsx 🟡 PRECISA DE AJUSTES

**Tamanho:** 449 linhas | **Status:** Funcional, mas não responsivo

**Características:**
- Lista de matrizes com filtros
- Busca, filtro de status, filtro de pasta
- Seleção de matriz
- Botão para criar nova matriz

**Problemas em mobile:**
1. ScrollArea sem altura máxima (pode ocupar tela inteira)
2. Inputs de filtro muito largos
3. Sem indicador visual de matriz selecionada em mobile

**Solução:**
- Usar `max-h-[calc(100vh-200px)]` para ScrollArea
- Reduzir padding em mobile (`p-2 md:p-4`)
- Adicionar indicador visual claro de seleção

**Estimativa:** 2–3 horas

---

### 2.4. ManufacturingView.tsx 🔴 CRÍTICO

**Tamanho:** 116KB | **Status:** Muito grande, não responsivo

**Estrutura:**
- 3 abas (Necessidade, Solicitação, Em Fabricação)
- Tabelas com muitas colunas
- Filtros laterais (prioridade, ano, mês, fornecedor, busca)
- Seleção múltipla com aprovação em lote
- Modais de criação/edição

**Problemas em mobile:**

1. **Tabelas com overflow horizontal**
   ```
   Colunas: matrix_code | supplier | priority | estimated_delivery_date | actions
   ```
   - Sem scroll visível em mobile
   - Texto comprimido

2. **Filtros ocupam espaço lateral**
   - Não há espaço em mobile
   - Precisam estar em Sheet/Dialog

3. **Botões de ação comprimidos**
   - Difícil de tocar em mobile
   - Sem espaço para ícones + texto

4. **Seleção múltipla não é clara**
   - Checkboxes em coluna separada
   - Difícil de usar em mobile

**Solução proposta:**

```tsx
// Em mobile: cards empilhados
// Em desktop: tabela completa

{isMobile ? (
  <div className="space-y-2">
    {records.map(record => (
      <Card className="p-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold">{record.matrix_code}</h3>
            <p className="text-sm text-muted-foreground">{record.supplier}</p>
          </div>
          <Badge>{record.priority}</Badge>
        </div>
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={() => moveToNext(record)}>
            Próximo
          </Button>
          <Button size="sm" variant="outline" onClick={() => openDetails(record)}>
            Detalhes
          </Button>
        </div>
      </Card>
    ))}
  </div>
) : (
  <Table>
    {/* Tabela completa */}
  </Table>
)}
```

**Estimativa:** 8–12 horas

---

### 2.5. AnalysisView.tsx 🟡 MÉDIA PRIORIDADE

**Tamanho:** 3.889 bytes | **Status:** Funcional, precisa de ajustes

**Estrutura:**
- 5 abas (Carteira, Produção, Ferramentas, Vida, Necessidades)
- Cada aba tem componentes diferentes (gráficos, tabelas, uploads)

**Problemas em mobile:**
1. Abas podem ficar comprimidas
2. Gráficos (Recharts) podem ter overflow horizontal
3. Tabelas sem responsividade

**Solução:**
- Adicionar `overflow-x-auto` aos gráficos
- Usar `min-w-[300px]` nos gráficos
- Converter tabelas em cards em mobile

**Estimativa:** 6–8 horas

---

### 2.6. MatrixSheet.tsx 🟡 MÉDIA PRIORIDADE

**Tamanho:** 20.830 bytes | **Status:** Funcional, precisa de ajustes

**Estrutura:**
- Planilha de marcos com edição rápida
- Múltiplas colunas (data, tipo de evento, status, etc.)

**Problemas em mobile:**
1. Tabela com muitas colunas (overflow horizontal)
2. Sem responsividade

**Solução:**
- Converter em cards em mobile
- Manter tabela em desktop

**Estimativa:** 4–6 horas

---

## 3. Análise de Breakpoints

**Tailwind padrão (confirmado em tailwind.config.ts):**
- `base` (sem prefixo): até 639px → **mobile**
- `sm`: ≥ 640px → celulares grandes
- `md`: ≥ 768px → tablets
- `lg`: ≥ 1024px → desktops
- `xl`: ≥ 1280px → desktops grandes

**Recomendação:**
- Usar `md:` (768px) como breakpoint principal para drawer/sidebar
- Usar `sm:` para ajustes menores em celulares grandes

---

## 4. Padrões de Responsividade Observados

### Positivos ✅
- `LoginDialog.tsx` usa padrão correto (`w-full max-w-sm sm:max-w-md`)
- Botões responsivos (`flex flex-col sm:flex-row`)
- Inputs com `w-full` em mobile

### Negativos 🔴
- Sidebar sempre visível (sem drawer)
- Tabelas sem cards alternativos em mobile
- Filtros não responsivos
- Gráficos sem `overflow-x-auto`

---

## 5. Plano de Ação Priorizado

### Semana 1: Fundamentos (4–6 horas)
1. Implementar drawer para sidebar em `Index.tsx`
2. Adicionar botão hambúrguer
3. Testar em 375px, 768px, 1280px

### Semana 2: Manufacturing (8–12 horas)
1. Converter tabelas em cards em mobile
2. Mover filtros para Sheet
3. Testar seleção múltipla em mobile

### Semana 3: Análise (6–8 horas)
1. Adicionar `overflow-x-auto` aos gráficos
2. Converter tabelas em cards
3. Testar em múltiplas larguras

### Semana 4: Validação (2–4 horas)
1. Testar em emulador Android
2. Validar sem erros em console
3. Confirmar que nenhuma funcionalidade foi perdida

---

## 6. Checklist de Testes

### Teste em 375px (iPhone SE)
- [ ] Login funciona sem scroll horizontal
- [ ] Sidebar acessível via drawer
- [ ] Abas de navegação legíveis
- [ ] Manufacturing cards visíveis
- [ ] Botões com altura ≥ 40px
- [ ] Sem erros em console

### Teste em 768px (iPad)
- [ ] Sidebar visível (não drawer)
- [ ] Layout em 2 colunas (sidebar + conteúdo)
- [ ] Tabelas começam a aparecer
- [ ] Gráficos com scroll horizontal se necessário

### Teste em 1280px (Desktop)
- [ ] Layout completo
- [ ] Sidebar sempre visível
- [ ] Tabelas completas
- [ ] Filtros laterais visíveis
- [ ] Sem scroll horizontal global

---

## 7. Tecnologias Disponíveis

**shadcn/ui components:**
- `Sheet` – drawer/modal lateral
- `Dialog` – modal central
- `Card` – container com borda
- `Table` – tabela HTML
- `Button` – botão
- `Input` – input de texto
- `Badge` – badge de status
- `ScrollArea` – área com scroll

**Tailwind utilities:**
- `overflow-x-auto` – scroll horizontal
- `shrink-0` – não encolher
- `flex-col` / `flex-row` – direção do flex
- `md:` / `lg:` – breakpoints
- `sticky` – posição fixa ao scroll
- `w-full` / `max-w-*` – largura

---

## 8. Recomendações Finais

1. **Comece pela Fase 2 (Index.tsx)**
   - É o fundamento de todo o app
   - Drawer é essencial para mobile
   - Afeta todas as outras telas

2. **Depois Fase 3 (ManufacturingView.tsx)**
   - É o maior componente
   - Tem mais impacto na usabilidade
   - Requer mais trabalho

3. **Por último Fase 4 (AnalysisView.tsx)**
   - Menos crítico para mobile
   - Pode ser feito em paralelo
   - Ajustes menores

4. **Sempre teste em DevTools**
   - Abra Chrome DevTools (F12)
   - Clique em "Toggle device toolbar" (Ctrl+Shift+M)
   - Teste em 375px, 768px, 1280px

5. **Não altere lógica de negócio**
   - Apenas layout e responsividade
   - Mantenha todas as funcionalidades
   - Sem mudanças em hooks ou Supabase

---

## 9. Próximos Passos

1. ✅ Revisar este documento
2. ⏭️ Iniciar Fase 2: Implementar drawer em `Index.tsx`
3. ⏭️ Criar branch `feature/mobile-first-phase2`
4. ⏭️ Atualizar `change_log.md` após cada fase
5. ⏭️ Testar em DevTools e dispositivo real
