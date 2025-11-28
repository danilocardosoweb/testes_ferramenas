# Guia Rápido – Mobile First (25/11/2025)

## 📱 Comece Aqui

### 1. Entenda o Problema (5 min)
Leia **RESUMO_MOBILE_FIRST.md** para entender:
- Quais componentes precisam de ajustes
- Qual é a prioridade
- Quanto tempo vai levar

### 2. Veja a Análise Técnica (10 min)
Leia **ANALISE_MOBILE_FIRST.md** para entender:
- Problemas específicos de cada componente
- Soluções propostas
- Estimativas de tempo

### 3. Veja os Exemplos de Código (15 min)
Leia **EXEMPLOS_MOBILE_FIRST.md** para ver:
- Como implementar drawer
- Como converter tabelas em cards
- Como adicionar responsividade aos gráficos
- Padrões de código prontos para usar

### 4. Comece a Implementar (Fase 1)
Siga o plano em **MOBILE_FIRST_PLAN.md**:
- Fase 1: Implementar drawer em `Index.tsx` (4–6 horas)
- Fase 2: Converter tabelas em cards em `ManufacturingView.tsx` (8–12 horas)
- Fase 3: Adicionar responsividade aos gráficos em `AnalysisView.tsx` (6–8 horas)
- Fase 4: Validar em dispositivo real (2–4 horas)

---

## 🚀 Fase 1: Implementar Drawer (4–6 horas)

### Passo 1: Abra `src/pages/Index.tsx`
```bash
# No seu editor, abra:
src/pages/Index.tsx
```

### Passo 2: Importe os componentes necessários
```tsx
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
```

### Passo 3: Adicione estado para drawer
```tsx
const [sidebarOpen, setSidebarOpen] = useState(false);
```

### Passo 4: Modifique o layout raiz
Veja o exemplo em **EXEMPLOS_MOBILE_FIRST.md** seção "1. Padrão de Drawer para Sidebar"

### Passo 5: Teste em Chrome DevTools
```
1. Abra Chrome DevTools (F12)
2. Clique em "Toggle device toolbar" (Ctrl+Shift+M)
3. Teste em 375px, 768px, 1280px
4. Valide sem erros em console
```

### Passo 6: Atualize change_log.md
```
[25/11/2025 14:00] - src/pages/Index.tsx - Implementar drawer para sidebar em mobile - Seu Nome
```

---

## 🎯 Fase 2: Converter Tabelas em Cards (8–12 horas)

### Passo 1: Abra `src/components/ManufacturingView.tsx`
```bash
# No seu editor, abra:
src/components/ManufacturingView.tsx
```

### Passo 2: Crie um hook para media query
Veja o exemplo em **EXEMPLOS_MOBILE_FIRST.md** seção "5. Hook Customizado para Media Query"

### Passo 3: Crie componente de card
```tsx
function RecordCard({ record, onMoveToNext, onOpenDetails }) {
  return (
    <Card className="p-3">
      {/* Veja exemplo em EXEMPLOS_MOBILE_FIRST.md */}
    </Card>
  );
}
```

### Passo 4: Implemente lógica de responsividade
```tsx
const isMobile = !useMediaQuery("(min-width: 768px)");

if (isMobile) {
  return <div className="space-y-2">{/* Cards */}</div>;
}

return <Table>{/* Tabela */}</Table>;
```

### Passo 5: Mova filtros para Sheet em mobile
Veja o exemplo em **EXEMPLOS_MOBILE_FIRST.md** seção "3. Padrão de Filtros em Sheet"

### Passo 6: Teste tudo
```
1. Teste em 375px (cards devem aparecer)
2. Teste em 768px (tabela deve aparecer)
3. Teste seleção múltipla em mobile
4. Valide sem erros em console
```

### Passo 7: Atualize change_log.md
```
[25/11/2025 15:00] - src/components/ManufacturingView.tsx - Converter tabelas em cards responsivos - Seu Nome
```

---

## 📊 Fase 3: Adicionar Responsividade aos Gráficos (6–8 horas)

### Passo 1: Abra `src/components/analysis/AnalysisProducaoView.tsx`
```bash
# No seu editor, abra:
src/components/analysis/AnalysisProducaoView.tsx
```

### Passo 2: Adicione overflow-x-auto aos gráficos
Veja o exemplo em **EXEMPLOS_MOBILE_FIRST.md** seção "4. Padrão de Gráficos Responsivos"

### Passo 3: Repita para outros componentes de análise
- `AnalysisCarteiraView.tsx`
- `AnalysisFerramentasView.tsx`
- `AnalysisVidaView.tsx`
- `AnalysisNecessidadesView.tsx`

### Passo 4: Converta tabelas em cards (se aplicável)
Veja o exemplo em **EXEMPLOS_MOBILE_FIRST.md** seção "2. Padrão de Cards Responsivos"

### Passo 5: Teste tudo
```
1. Teste em 375px (gráficos devem ter scroll)
2. Teste em 768px (gráficos devem caber)
3. Teste em 1280px (layout completo)
4. Valide sem erros em console
```

### Passo 6: Atualize change_log.md
```
[25/11/2025 16:00] - src/components/analysis/* - Adicionar responsividade aos gráficos - Seu Nome
```

---

## ✅ Fase 4: Validação (2–4 horas)

### Passo 1: Teste em emulador Android
```
1. Abra Chrome DevTools (F12)
2. Clique em "Toggle device toolbar" (Ctrl+Shift+M)
3. Selecione "Pixel 5" ou "iPhone 12"
4. Teste todas as funcionalidades
```

### Passo 2: Teste em dispositivo real (se possível)
```
1. Abra http://localhost:5173 no celular
2. Teste todas as funcionalidades
3. Valide sem erros em console (F12)
```

### Passo 3: Checklist de Validação
- [ ] Login funciona sem scroll horizontal
- [ ] Sidebar acessível via drawer em mobile
- [ ] Abas de navegação legíveis
- [ ] Manufacturing cards visíveis em mobile
- [ ] Tabelas aparecem em desktop
- [ ] Gráficos com scroll em mobile
- [ ] Botões com altura ≥ 40px
- [ ] Sem erros em console
- [ ] Nenhuma funcionalidade foi perdida

### Passo 4: Atualize change_log.md
```
[25/11/2025 17:00] - Validação - Mobile First implementado e testado - Seu Nome
```

---

## 🛠️ Ferramentas Úteis

### Chrome DevTools
```
F12 → Toggle device toolbar (Ctrl+Shift+M)
```

### Breakpoints para testar
- **375px** – iPhone SE (mobile pequeno)
- **640px** – iPhone 12 (mobile grande)
- **768px** – iPad (tablet)
- **1024px** – iPad Pro (tablet grande)
- **1280px** – Desktop

### Comandos úteis
```bash
# Iniciar servidor de desenvolvimento
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

---

## 📚 Documentos de Referência

| Documento | Objetivo |
|-----------|----------|
| **MOBILE_FIRST_PLAN.md** | Plano detalhado com fases e estratégia |
| **ANALISE_MOBILE_FIRST.md** | Análise técnica de cada componente |
| **RESUMO_MOBILE_FIRST.md** | Resumo executivo (status, cronograma, checklist) |
| **EXEMPLOS_MOBILE_FIRST.md** | Exemplos de código prontos para usar |
| **GUIA_RAPIDO_MOBILE_FIRST.md** | Este arquivo (guia rápido de início) |

---

## ❓ Dúvidas Frequentes

### P: Por onde começo?
**R:** Comece pela Fase 1 (Index.tsx). É o fundamento de todo o app.

### P: Quanto tempo vai levar?
**R:** 20–30 horas no total (4 semanas com 5–7 horas por semana).

### P: Posso fazer tudo de uma vez?
**R:** Não recomendado. Faça uma fase por vez, teste e valide antes de passar para a próxima.

### P: E se quebrar algo?
**R:** Use Git para reverter: `git checkout src/pages/Index.tsx`

### P: Como testo em mobile real?
**R:** Abra `http://localhost:5173` no celular (na mesma rede).

### P: Preciso alterar o banco de dados?
**R:** Não. Apenas layout e responsividade. Nenhuma mudança em lógica ou Supabase.

---

## 🎓 Padrões de Código

### Usar `useMediaQuery` para responsividade
```tsx
const isMobile = !useMediaQuery("(min-width: 768px)");

if (isMobile) {
  return <MobileVersion />;
}

return <DesktopVersion />;
```

### Usar `overflow-x-auto` para scroll horizontal
```tsx
<div className="overflow-x-auto">
  <div className="min-w-[300px]">
    {/* Conteúdo largo */}
  </div>
</div>
```

### Usar `Sheet` para drawer em mobile
```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="left" className="w-80">
    {/* Conteúdo do drawer */}
  </SheetContent>
</Sheet>
```

### Usar `Card` para cards em mobile
```tsx
<Card className="p-3">
  <h3 className="font-bold">{title}</h3>
  <p className="text-sm text-muted-foreground">{subtitle}</p>
</Card>
```

---

## 📝 Checklist de Implementação

### Antes de começar
- [ ] Leia RESUMO_MOBILE_FIRST.md
- [ ] Leia ANALISE_MOBILE_FIRST.md
- [ ] Leia EXEMPLOS_MOBILE_FIRST.md
- [ ] Crie branch `feature/mobile-first-phase1`

### Durante a implementação
- [ ] Implemente a mudança
- [ ] Teste em Chrome DevTools (375px, 768px, 1280px)
- [ ] Valide sem erros em console
- [ ] Commit com mensagem clara
- [ ] Atualize change_log.md

### Após a implementação
- [ ] Teste em dispositivo real (se possível)
- [ ] Confirme que nenhuma funcionalidade foi perdida
- [ ] Faça merge para main
- [ ] Deploy para produção

---

## 🎉 Próximos Passos

1. ✅ Leia este guia
2. ⏭️ Leia RESUMO_MOBILE_FIRST.md
3. ⏭️ Leia ANALISE_MOBILE_FIRST.md
4. ⏭️ Leia EXEMPLOS_MOBILE_FIRST.md
5. ⏭️ Comece a Fase 1: Implementar drawer em Index.tsx
6. ⏭️ Teste em Chrome DevTools
7. ⏭️ Atualize change_log.md
8. ⏭️ Faça commit e push

---

**Boa sorte! 🚀**

Se tiver dúvidas, consulte os documentos de referência ou a análise técnica em ANALISE_MOBILE_FIRST.md.
