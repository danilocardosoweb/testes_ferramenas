# Carteira - Curva ABC

## Visão Geral
Análise ABC da carteira de pedidos/clientes com filtros dinâmicos e período configurável (padrão: desde 01/01/2024 até hoje).

**Atualização 12/11/2025**: Correções críticas de agregação, normalização case-insensitive, layout padronizado e otimizações de performance.

## Funcionalidades

### 📊 Visualização
- **Agregação por Ferramenta**: soma de Pedido Kg com participação % e acúmulo %.
- **Classificação ABC**:
  - **A**: até 80% do volume acumulado
  - **B**: de 80% a 95%
  - **C**: acima de 95%
- **Última Compra**: data mais recente da coluna "Data Implant" por ferramenta.

### 🔍 Filtros
- **Período (De/Até)**: padrão 01/01/2024 até hoje; filtro aplicado no banco via `implanted_on`.
- **Ferramenta**: busca textual case-insensitive (campo input).
- **Cliente**: input com autocomplete (datalist); dependente do filtro Ferramenta.
- **Liga**: lista dinâmica; dependente de Ferramenta e Cliente.
- **Têmpera**: lista dinâmica; dependente de Ferramenta e Cliente.
- **Tipo**: Todos / Usinagem (SF*) / Produção (não SF) — padrão: Todos.
- **Classe ABC**: filtro por A, B, C ou Todas.

### 📤 Upload de Arquivo
- **Formato**: Excel (.xlsx, .xls) ou CSV.
- **Colunas obrigatórias**:
  - **Ferramenta** (ou Matriz/Código)
  - **Pedido Kg** (ou Kg/Pedido/Volume) — aceita formato brasileiro (1.234,56)
- **Colunas opcionais**:
  - **Cliente** (ou Nome do Cliente)
  - **Liga**
  - **Têmpera**
  - **Data Implant** (ou Data/Data Pedido/Dt Implant) — para filtro por período
- **Comportamento**: trunca a tabela antes de inserir (sobrescrita total).
- **Performance**: lotes de 500 registros com feedback em tempo real.
- **Parse**: Remove espaços, pontos de milhar e converte vírgula decimal.

## Estrutura de Dados

### Tabela: `analysis_carteira`
```sql
CREATE TABLE public.analysis_carteira (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  __file_name text,
  __uploaded_at timestamptz DEFAULT now(),
  implanted_on date,  -- Derivada via trigger do payload
  created_at timestamptz DEFAULT timezone('utc', now()),
  updated_at timestamptz DEFAULT timezone('utc', now())
);
```

### Coluna Derivada: `implanted_on`
- Populada automaticamente via trigger a partir de:
  - `payload->>'Data Implant'`
  - `payload->>'Data'`
  - `payload->>'Data Pedido'`
- Formatos aceitos:
  - DD/MM/YYYY (ex.: 12/11/2025)
  - YYYY-MM-DD (ISO)
  - Serial Excel (numérico, ex.: 45972)
- Indexada para performance: `CREATE INDEX idx_analysis_carteira_implanted_on ON analysis_carteira(implanted_on DESC);`

### RPC: `analysis_carteira_truncate()`
```sql
CREATE OR REPLACE FUNCTION public.analysis_carteira_truncate()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE public.analysis_carteira RESTART IDENTITY;
  RETURN true;
END;
$$;
```

## Fluxo de Dados

### Upload
1. Usuário seleciona arquivo Excel/CSV
2. Parse client-side com XLSX.js
3. Mapeia colunas via aliases (insensível a acentos/capitalização)
4. Chama RPC `analysis_carteira_truncate()` para limpar tabela
5. Insere em lotes de 500 registros
6. Trigger `trg_analysis_carteira_implanted_on` popula `implanted_on`
7. Recarrega dados com filtro de período aplicado

### Consulta
```typescript
let query = supabase
  .from("analysis_carteira")
  .select("id,payload,implanted_on")
  .order("implanted_on", { ascending: false })
  .limit(100000); // Aumentado para 100k (12/11/2025)

// Filtros SQL
if (fFerramenta.trim()) query = query.ilike("payload->>Ferramenta", `%${fFerramenta.trim()}%`);
if (fCliente.trim()) query = query.ilike("payload->>Cliente", `%${fCliente.trim()}%`);
if (fLiga !== "__ALL__") query = query.eq("payload->>Liga", fLiga);
if (fTempera !== "__ALL__") query = query.eq("payload->>Têmpera", fTempera);
if (periodStart) query = query.gte("implanted_on", periodStart);
if (periodEnd) query = query.lte("implanted_on", periodEnd);
```

### Agregação (Client-side)
```typescript
const aggregated = useMemo(() => {
  // CORREÇÃO 12/11/2025: Normalização case-insensitive para agrupar variações
  const map = new Map<string, { vol: number; last?: string; count: number; originalName: string }>();
  filtered.forEach((r) => {
    const ferramentaKey = r.ferramenta.toUpperCase(); // Normalizar para agrupamento
    const cur = map.get(ferramentaKey) ?? { vol: 0, last: undefined, count: 0, originalName: r.ferramenta };
    cur.vol += r.pedidoKg;
    cur.count += 1;
    if (r.dateISO && (!cur.last || r.dateISO > cur.last)) cur.last = r.dateISO;
    if (!cur.originalName) cur.originalName = r.ferramenta;
    map.set(ferramentaKey, cur);
  });
  
  // Logs de debug para TR-0100
  const tr0100Data = map.get('TR-0100');
  if (tr0100Data) {
    console.log(`[Carteira] TR-0100 agregado:`, {
      volume: tr0100Data.vol,
      registros: tr0100Data.count,
      ultimaData: tr0100Data.last
    });
  }
  
  const total = Array.from(map.values()).reduce((a, b) => a + b.vol, 0);
  let months = 1;
  if (periodStart && periodEnd) {
    const s = new Date(periodStart + 'T00:00:00');
    const e = new Date(periodEnd + 'T00:00:00');
    months = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
  }
  let acum = 0;
  
  return Array.from(map.entries())
    .map(([f, v]) => ({ 
      ferramenta: v.originalName || f, // Usar nome original para exibição
      pedidoKg: v.vol, 
      lastDateISO: v.last,
      avgPerMonth: months > 0 ? v.vol / months : v.vol
    }))
    .sort((a, b) => b.pedidoKg - a.pedidoKg)
    .map((it) => {
      acum += it.pedidoKg;
      const share = total > 0 ? (it.pedidoKg / total) * 100 : 0;
      const cumulative = total > 0 ? (acum / total) * 100 : 0;
      const classe = cumulative <= 80 ? "A" : cumulative <= 95 ? "B" : "C";
      return { ...it, share, cumulative, classe };
    });
}, [filtered, periodStart, periodEnd]);
```

## Casos de Uso

### 1. Análise de Cliente
- Filtrar por cliente específico
- Ver quais ferramentas ele compra
- Identificar itens classe A (80% do volume)

### 2. Gestão de Estoque
- Filtrar ferramentas classe A
- Ordenar por "Última Compra"
- Priorizar reposição de itens críticos

### 3. Projeção de Demanda
- Filtrar período específico (ex.: último trimestre)
- Analisar distribuição por liga/têmpera
- Comparar períodos para tendências

### 4. Atualização de Carteira
- Upload de nova planilha (trunca e recarrega)
- Mantém histórico via `__uploaded_at`
- Trigger atualiza `implanted_on` automaticamente

## Troubleshooting

### Problema: Período não filtra nada
**Causa**: Planilha não possui coluna de data ou formato inválido.
**Solução**: O sistema exibe fallback automático mostrando todos os registros com mensagem "Sem datas para filtrar por período".

### Problema: Upload falha com timeout
**Causa**: Arquivo muito grande (>50k linhas).
**Solução**: Dividir planilha em lotes menores ou aumentar timeout do Supabase.

### Problema: "Última Compra" mostra "-"
**Causa**: Nenhuma data válida encontrada no payload para aquela ferramenta.
**Solução**: Verificar se a planilha possui coluna "Data Implant" com formato DD/MM/YYYY ou serial Excel.

### Problema: Soma incorreta de Pedido Kg
**Causa**: Agregação case-sensitive (tr-0100 ≠ TR-0100 ≠ Tr-0100).
**Solução**: ✅ CORRIGIDO em 12/11/2025 — normalização para `.toUpperCase()` na chave do Map, preservando nome original para exibição.

### Problema: Filtro de Cliente não funciona
**Causa**: Query usava `eq` (exact match), sensível a espaços.
**Solução**: ✅ CORRIGIDO em 12/11/2025 — mudado para `ilike` com trim.

### Problema: Valores diferentes entre Excel e App
**Possíveis causas**:
1. ✅ Período padrão diferente — CORRIGIDO: agora inicia em 01/01/2024
2. ✅ Filtro "Tipo" ativo — CORRIGIDO: padrão "Todos"
3. ✅ Limite de registros — CORRIGIDO: aumentado para 100k
4. ❌ Dados não carregados no banco — verificar upload

## Padrão vs Produção

| Aspecto | Produção | Carteira |
|---------|----------|----------|
| Coluna de data derivada | `produced_on` | `implanted_on` |
| RPC truncate | `analysis_producao_truncate()` | `analysis_carteira_truncate()` |
| Trigger | `trg_analysis_producao_produced_on` | `trg_analysis_carteira_implanted_on` |
| Filtro período | No banco via `gte/lte` | No banco via `gte/lte` |
| Fallback sem data | Não implementado | Automático com mensagem |
| Lote de inserção | 500 registros | 500 registros |
| Feedback | Barra de progresso | Barra de progresso + lote atual |

## Melhorias Implementadas (12/11/2025)
- [x] Normalização case-insensitive na agregação
- [x] Layout padronizado com aba Produção (tabela HTML nativa)
- [x] Rodapé com estatísticas (volume em kg e ton, distribuição ABC)
- [x] Logs de debug detalhados no console
- [x] Filtros padrão ajustados (01/01/2024, Tipo "Todos")
- [x] Limite de registros aumentado para 100k
- [x] Parse de números melhorado (remove espaços)
- [x] Coluna Média/Mês adicionada
- [x] Filtros em cascata (Cliente → Liga/Têmpera)
- [x] Cliente com autocomplete (datalist)

## Melhorias Futuras
- [ ] Exportar CSV com resultados filtrados
- [ ] Gráfico de Pareto (ABC visual)
- [ ] Comparação de períodos (mês a mês)
- [ ] Alertas de queda de demanda em itens classe A
- [ ] Histórico de uploads (versionamento de planilhas)
- [ ] Paginação server-side para datasets >100k

## Arquivos Relacionados
- **Frontend**: `src/components/analysis/AnalysisCarteiraView.tsx`
- **Migração**: `migration_carteira_final.sql`
- **Schema**: `data_schema.sql` (seção Carteira)
- **Docs**: Este arquivo

---

**Última atualização**: 12/11/2025 15:15 (Correções críticas de agregação)  
**Autor**: Windsurf AI + Danilo Cardoso  
**Projeto**: Ferramentas_em_testes (sldhpwtdipndnljbzojm)

## Changelog
- **12/11/2025 15:15**: Correção crítica de agregação case-sensitive, layout padronizado, filtros ajustados
- **12/11/2025 11:00**: Implementação inicial da Curva ABC com filtros e upload
- **11/11/2025**: Criação da tabela, trigger e RPC no banco de dados
