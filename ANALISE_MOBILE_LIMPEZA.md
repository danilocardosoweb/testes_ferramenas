# Análise Mobile - Aba "Limpeza Ferr."

## Componentes da Aba
1. **Romaneio** (RomaneioInterface.tsx) - ✅ JÁ RESPONSIVO
2. **Em Limpeza** (CleaningOrdersTable.tsx) - 🔴 CRÍTICO
3. **Em Nitretação** (NitrationOrdersTable.tsx) - 🔴 CRÍTICO
4. **Estoque** (StockInventoryView.tsx) - 🟡 MÉDIA
5. **Acompanhamento** (CleaningTrackingDashboard.tsx) - 🟡 MÉDIA

---

## Problemas Identificados

### 1. CleaningOrdersTable (Em Limpeza) - CRÍTICO
**Problemas:**
- ❌ Tabela com 7 colunas (`<table>`) não responsiva
- ❌ Overflow horizontal sem scroll visível
- ❌ Inputs de preenchimento em lote no header do dia (hidden em mobile)
- ❌ Botão "Enviar E-mail" oculto em mobile (`hidden md:flex`)
- ❌ Checkbox e ações inline não funcionam bem em telas pequenas
- ❌ Edição inline de células difícil de usar no touch

**Solução:**
- Converter tabela em cards empilháveis para mobile
- Mover inputs de lote para modal/drawer em mobile
- Tornar botões de ação acessíveis via menu dropdown
- Adicionar gestos de swipe para ações rápidas

### 2. NitrationOrdersTable (Em Nitretação) - CRÍTICO
**Problemas:**
- ❌ Mesma estrutura de tabela do CleaningOrdersTable
- ❌ Campos de entrada/saída nitretação em colunas
- ❌ Preenchimento em lote oculto em mobile

**Solução:**
- Mesma abordagem de cards do CleaningOrdersTable

### 3. StockInventoryView (Estoque) - MÉDIA
**Problemas:**
- ⚠️ Tabela com 5 colunas pode ser apertada
- ⚠️ Filtros em linha podem quebrar layout
- ⚠️ Botões de ação em lote podem ficar pequenos

**Solução:**
- Cards para mobile com informações empilhadas
- Filtros em accordion/drawer

### 4. CleaningTrackingDashboard (Acompanhamento) - MÉDIA
**Problemas:**
- ⚠️ KPIs em grid podem ficar apertados
- ⚠️ Listas de atenção com muitas colunas

**Solução:**
- Grid responsivo 1 coluna em mobile
- Cards compactos para listas

---

## Plano de Implementação (Prioridade)

### Fase 1: CleaningOrdersTable (URGENTE)
**Tempo estimado:** 2-3h

1. Criar versão mobile com cards
2. Adicionar drawer para preenchimento em lote
3. Menu dropdown para ações (e-mail, finalizar lote)
4. Testar em 375px, 768px, 1024px

### Fase 2: NitrationOrdersTable
**Tempo estimado:** 2h

1. Aplicar mesma estrutura de cards
2. Adaptar campos específicos de nitretação

### Fase 3: StockInventoryView
**Tempo estimado:** 1-2h

1. Cards para mobile
2. Filtros em drawer

### Fase 4: CleaningTrackingDashboard
**Tempo estimado:** 1h

1. Grid responsivo
2. Cards compactos

---

## Breakpoints Tailwind
- **Mobile:** < 768px (sm, default)
- **Tablet:** 768px - 1024px (md)
- **Desktop:** > 1024px (lg, xl)

## Estratégia Mobile-First
- Renderizar cards por padrão
- Mostrar tabela apenas em `md:` (768px+)
- Usar `hidden md:block` e `block md:hidden`
- Touch-friendly: botões min 44px, espaçamento adequado
