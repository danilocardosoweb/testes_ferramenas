# Checklist de Implementação – Mobile First (25/11/2025)

## 📋 Visão Geral

```
Fase 1: Index.tsx (Drawer)           ⏳ Não iniciado
Fase 2: ManufacturingView (Cards)    ⏳ Não iniciado
Fase 3: AnalysisView (Gráficos)      ⏳ Não iniciado
Fase 4: Validação Final              ⏳ Não iniciado

Total: 20–30 horas | Duração: 4 semanas
```

---

## 🔴 Fase 1: Index.tsx – Implementar Drawer (4–6 horas)

### Planejamento
- [ ] Revisar `src/pages/Index.tsx`
- [ ] Revisar `EXEMPLOS_MOBILE_FIRST.md` seção 1
- [ ] Criar branch `feature/mobile-first-phase1`
- [ ] Estimar tempo real

### Implementação
- [ ] Importar `Sheet` e `SheetContent` de `@/components/ui/sheet`
- [ ] Importar `Menu` de `lucide-react`
- [ ] Adicionar estado `sidebarOpen` com `useState`
- [ ] Criar `<Sheet>` com drawer para mobile
- [ ] Adicionar botão hambúrguer (`<Menu />`)
- [ ] Adicionar `hidden md:flex` para sidebar em desktop
- [ ] Testar layout em 375px, 768px, 1280px

### Testes
- [ ] Drawer abre ao clicar no hambúrguer (375px)
- [ ] Drawer fecha ao clicar fora (375px)
- [ ] Sidebar visível em desktop (1280px)
- [ ] Sem erros em console
- [ ] Sem scroll horizontal

### Validação
- [ ] Todas as funcionalidades mantidas
- [ ] Nenhum erro novo em console
- [ ] Layout responsivo em 3 larguras

### Finalização
- [ ] Commit com mensagem: `feat: implement drawer for sidebar on mobile`
- [ ] Atualizar `change_log.md`
- [ ] Fazer merge para main

**Status:** ⏳ Não iniciado | **Data Início:** _____ | **Data Fim:** _____

---

## 🔴 Fase 2: ManufacturingView.tsx – Converter Tabelas em Cards (8–12 horas)

### Planejamento
- [ ] Revisar `src/components/ManufacturingView.tsx` (116KB)
- [ ] Revisar `EXEMPLOS_MOBILE_FIRST.md` seção 2 e 3
- [ ] Criar branch `feature/mobile-first-phase2`
- [ ] Estimar tempo real

### Implementação – Parte 1: Hook de Media Query
- [ ] Criar `src/hooks/use-media-query.ts`
- [ ] Implementar hook com `window.matchMedia`
- [ ] Testar hook em componente

### Implementação – Parte 2: Componente de Card
- [ ] Criar componente `RecordCard` dentro de ManufacturingView
- [ ] Adicionar campos: código, fornecedor, prioridade, data
- [ ] Adicionar botões: Próximo, Detalhes
- [ ] Estilizar com `Card` e `Badge` do shadcn/ui

### Implementação – Parte 3: Lógica de Responsividade
- [ ] Usar `useMediaQuery("(min-width: 768px)")` para detectar desktop
- [ ] Renderizar cards em mobile
- [ ] Renderizar tabela em desktop
- [ ] Testar alternância em DevTools

### Implementação – Parte 4: Filtros em Sheet
- [ ] Criar estado `filtersOpen`
- [ ] Criar componente `FilterContent`
- [ ] Envolver em `<Sheet>` em mobile
- [ ] Manter filtros laterais em desktop
- [ ] Adicionar botão "Filtros" com ícone

### Implementação – Parte 5: Seleção Múltipla
- [ ] Adicionar checkboxes em cards (mobile)
- [ ] Adicionar checkboxes em tabela (desktop)
- [ ] Adicionar botão "Aprovar selecionados" fixo no rodapé
- [ ] Testar seleção múltipla em mobile

### Testes
- [ ] Cards aparecem em 375px
- [ ] Tabela aparece em 768px
- [ ] Filtros funcionam em mobile
- [ ] Seleção múltipla funciona em mobile
- [ ] Sem erros em console
- [ ] Sem scroll horizontal

### Validação
- [ ] Todas as funcionalidades mantidas
- [ ] Nenhum erro novo em console
- [ ] Layout responsivo em 3 larguras

### Finalização
- [ ] Commit com mensagem: `feat: convert manufacturing tables to responsive cards`
- [ ] Atualizar `change_log.md`
- [ ] Fazer merge para main

**Status:** ⏳ Não iniciado | **Data Início:** _____ | **Data Fim:** _____

---

## 🟡 Fase 3: AnalysisView.tsx – Adicionar Responsividade aos Gráficos (6–8 horas)

### Planejamento
- [ ] Revisar `src/components/analysis/AnalysisProducaoView.tsx`
- [ ] Revisar `src/components/analysis/AnalysisCarteiraView.tsx`
- [ ] Revisar `src/components/analysis/AnalysisFerramentasView.tsx`
- [ ] Revisar `EXEMPLOS_MOBILE_FIRST.md` seção 4
- [ ] Criar branch `feature/mobile-first-phase3`
- [ ] Estimar tempo real

### Implementação – Parte 1: Gráficos com Scroll
- [ ] Envolver gráficos em `<div className="overflow-x-auto">`
- [ ] Adicionar `min-w-[300px]` ao container interno
- [ ] Testar scroll em 375px
- [ ] Repetir para todos os gráficos

### Implementação – Parte 2: Tabelas em Cards
- [ ] Identificar tabelas em cada aba
- [ ] Criar componentes de card para cada tabela
- [ ] Implementar lógica de responsividade
- [ ] Testar em 375px, 768px, 1280px

### Implementação – Parte 3: Abas Responsivas
- [ ] Adicionar `overflow-x-auto` ao container de abas
- [ ] Adicionar `shrink-0` aos botões de aba
- [ ] Considerar ícones apenas em mobile
- [ ] Testar em 375px

### Testes
- [ ] Gráficos têm scroll em 375px
- [ ] Tabelas aparecem como cards em 375px
- [ ] Tabelas aparecem como tabelas em 768px
- [ ] Abas legíveis em 375px
- [ ] Sem erros em console
- [ ] Sem scroll horizontal global

### Validação
- [ ] Todas as funcionalidades mantidas
- [ ] Nenhum erro novo em console
- [ ] Layout responsivo em 3 larguras

### Finalização
- [ ] Commit com mensagem: `feat: add responsive charts and tables to analysis views`
- [ ] Atualizar `change_log.md`
- [ ] Fazer merge para main

**Status:** ⏳ Não iniciado | **Data Início:** _____ | **Data Fim:** _____

---

## 🟢 Fase 4: Validação Final (2–4 horas)

### Testes em Chrome DevTools
- [ ] Teste em 375px (iPhone SE)
  - [ ] Login funciona
  - [ ] Sidebar acessível via drawer
  - [ ] Abas legíveis
  - [ ] Manufacturing cards visíveis
  - [ ] Gráficos com scroll
  - [ ] Sem scroll horizontal
  - [ ] Sem erros em console

- [ ] Teste em 640px (iPhone 12)
  - [ ] Todos os elementos visíveis
  - [ ] Sem scroll horizontal
  - [ ] Sem erros em console

- [ ] Teste em 768px (iPad)
  - [ ] Sidebar visível
  - [ ] Tabelas começam a aparecer
  - [ ] Gráficos com scroll se necessário
  - [ ] Sem erros em console

- [ ] Teste em 1024px (iPad Pro)
  - [ ] Layout completo
  - [ ] Tabelas completas
  - [ ] Gráficos sem scroll
  - [ ] Sem erros em console

- [ ] Teste em 1280px (Desktop)
  - [ ] Layout completo
  - [ ] Sidebar sempre visível
  - [ ] Tabelas completas
  - [ ] Filtros laterais visíveis
  - [ ] Sem scroll horizontal
  - [ ] Sem erros em console

### Testes em Dispositivo Real
- [ ] Teste em smartphone (Android ou iOS)
- [ ] Teste em tablet (se possível)
- [ ] Teste todas as funcionalidades
- [ ] Valide sem erros em console (F12)

### Checklist de Funcionalidades
- [ ] Login funciona
- [ ] Sidebar/Drawer funciona
- [ ] Abas de navegação funcionam
- [ ] Timeline funciona
- [ ] Manufacturing workflow funciona
- [ ] Análise funciona
- [ ] Notificações funcionam
- [ ] Kanban funciona
- [ ] Testing Queue funciona
- [ ] Nenhuma funcionalidade foi perdida

### Checklist de Responsividade
- [ ] Sem scroll horizontal em mobile
- [ ] Botões com altura ≥ 40px
- [ ] Texto legível (14–16px mínimo)
- [ ] Espaçamentos consistentes
- [ ] Drawer funciona em mobile
- [ ] Cards aparecem em mobile
- [ ] Tabelas aparecem em desktop
- [ ] Gráficos responsivos

### Finalização
- [ ] Criar release notes
- [ ] Atualizar `change_log.md`
- [ ] Fazer merge para main
- [ ] Deploy para produção

**Status:** ⏳ Não iniciado | **Data Início:** _____ | **Data Fim:** _____

---

## 📊 Resumo de Progresso

| Fase | Componente | Status | Horas | Início | Fim |
|------|-----------|--------|-------|--------|-----|
| 1 | Index.tsx | ⏳ | 4–6h | _____ | _____ |
| 2 | ManufacturingView.tsx | ⏳ | 8–12h | _____ | _____ |
| 3 | AnalysisView.tsx | ⏳ | 6–8h | _____ | _____ |
| 4 | Validação | ⏳ | 2–4h | _____ | _____ |
| **Total** | | ⏳ | **20–30h** | _____ | _____ |

---

## 🎯 Métricas de Sucesso

### Antes (Desktop Only)
- ❌ Sidebar ocupa 25–30% da tela em mobile
- ❌ Tabelas com overflow horizontal
- ❌ Filtros não responsivos
- ❌ Gráficos sem scroll

### Depois (Mobile First)
- ✅ Sidebar acessível via drawer em mobile
- ✅ Tabelas convertidas em cards em mobile
- ✅ Filtros em Sheet em mobile
- ✅ Gráficos com scroll em mobile
- ✅ Layout responsivo em 3 larguras (375px, 768px, 1280px)
- ✅ Nenhuma funcionalidade perdida
- ✅ Sem erros em console

---

## 📝 Notas

### Semana 1
```
Data: _____
Fase: 1 (Index.tsx)
Progresso: _____
Notas: _____
```

### Semana 2
```
Data: _____
Fase: 2 (ManufacturingView.tsx)
Progresso: _____
Notas: _____
```

### Semana 3
```
Data: _____
Fase: 3 (AnalysisView.tsx)
Progresso: _____
Notas: _____
```

### Semana 4
```
Data: _____
Fase: 4 (Validação)
Progresso: _____
Notas: _____
```

---

## 🔗 Referências Rápidas

| Documento | Seção | Tempo |
|-----------|-------|-------|
| GUIA_RAPIDO_MOBILE_FIRST.md | Comece aqui | 5 min |
| RESUMO_MOBILE_FIRST.md | Entenda o problema | 10 min |
| ANALISE_MOBILE_FIRST.md | Análise técnica | 15 min |
| EXEMPLOS_MOBILE_FIRST.md | Exemplos de código | 20 min |
| MOBILE_FIRST_PLAN.md | Plano detalhado | 30 min |

---

## ✅ Assinatura

**Responsável:** _____________________  
**Data de Início:** _____________________  
**Data de Conclusão Estimada:** _____________________  

---

**Última Atualização:** 25/11/2025 13:36 UTC-03:00  
**Status:** Pronto para implementação
