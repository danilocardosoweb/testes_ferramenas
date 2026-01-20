-- =============================================
-- 12/11/2025 - Tabela para palavras-chave de análise
-- Objetivo: sistema dinâmico de cadastro de palavras-chave
-- =============================================

-- Criar tabela de palavras-chave
CREATE TABLE IF NOT EXISTS public.analysis_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL UNIQUE,
  category text DEFAULT 'Geral' CHECK (category IN ('Geral', 'Mecânico', 'Material', 'Processo', 'Dimensional', 'Qualidade')),
  priority integer DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  color text DEFAULT '#6b7280',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_analysis_keywords_active ON public.analysis_keywords (is_active);
CREATE INDEX IF NOT EXISTS idx_analysis_keywords_category ON public.analysis_keywords (category);
CREATE INDEX IF NOT EXISTS idx_analysis_keywords_priority ON public.analysis_keywords (priority DESC);

-- RLS
ALTER TABLE IF EXISTS public.analysis_keywords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analysis_keywords_sel ON public.analysis_keywords;
CREATE POLICY analysis_keywords_sel ON public.analysis_keywords FOR SELECT USING (true);
DROP POLICY IF EXISTS analysis_keywords_ins ON public.analysis_keywords;
CREATE POLICY analysis_keywords_ins ON public.analysis_keywords FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS analysis_keywords_upd ON public.analysis_keywords;
CREATE POLICY analysis_keywords_upd ON public.analysis_keywords FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS analysis_keywords_del ON public.analysis_keywords;
CREATE POLICY analysis_keywords_del ON public.analysis_keywords FOR DELETE USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.analysis_keywords_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analysis_keywords_updated_at ON public.analysis_keywords;
CREATE TRIGGER trg_analysis_keywords_updated_at
BEFORE UPDATE ON public.analysis_keywords
FOR EACH ROW EXECUTE FUNCTION public.analysis_keywords_updated_at();

-- Popular com palavras-chave iniciais (migração das existentes)
INSERT INTO public.analysis_keywords (keyword, category, color) VALUES
('ARRANCAMENTO', 'Mecânico', '#ef4444'),
('ARRANCAMENTO INTERNO', 'Mecânico', '#ef4444'),
('BOLHA', 'Material', '#f97316'),
('DEFORMAÇÃO EMENDA', 'Dimensional', '#eab308'),
('DESLOCOU FERRAMENTA', 'Mecânico', '#ef4444'),
('ENTUPIU', 'Processo', '#8b5cf6'),
('FALHA OPERACIONAL CALCULO', 'Processo', '#8b5cf6'),
('FALTA AR COMPRIDO', 'Processo', '#8b5cf6'),
('FERRAMENTA RESTITUIU', 'Mecânico', '#ef4444'),
('FERRAMENTA PEGANDO ANEL', 'Mecânico', '#ef4444'),
('FERRAMENTA PESANDO', 'Mecânico', '#ef4444'),
('FERRAMENTA PESANDO SAIDA', 'Mecânico', '#ef4444'),
('FERRAMENTA RESTANDO', 'Mecânico', '#ef4444'),
('FERRAMENTA SEM CARCAÇA', 'Mecânico', '#ef4444'),
('FERRAMENTA SEM PINO', 'Mecânico', '#ef4444'),
('FERRAMENTA VIROU', 'Mecânico', '#ef4444'),
('FORMALI TAPETA', 'Processo', '#8b5cf6'),
('FURO ENTUPIU FERRAMENTA', 'Processo', '#8b5cf6'),
('PEGOU AR', 'Processo', '#8b5cf6'),
('PEGOU ASA PULLER', 'Mecânico', '#ef4444'),
('PEGOU NO PO', 'Processo', '#8b5cf6'),
('PEGOU NO PULLER', 'Mecânico', '#ef4444'),
('PROBLEMA IMPIEDRADOR TARUGO', 'Mecânico', '#ef4444'),
('PROBLEMA FACA FERRAMENTA', 'Mecânico', '#ef4444'),
('PROBLEMA RESULTADO BET', 'Qualidade', '#10b981'),
('PROBLEMA SENSOR TARUGO', 'Mecânico', '#ef4444'),
('QUEBRA SERRA CONIENTE', 'Mecânico', '#ef4444'),
('PULLER DESARMOU', 'Mecânico', '#ef4444'),
('QUEBROU CALMA', 'Mecânico', '#ef4444'),
('RASÇOU', 'Material', '#f97316'),
('ACANÃO FERRAMENTA TALÃO ERRADO', 'Processo', '#8b5cf6'),
('TARUGO PESANDO MUITO', 'Material', '#f97316'),
('TARUGO REZOTADO', 'Material', '#f97316'),
('TEMPERATURA OLEO AQUECEU', 'Processo', '#8b5cf6'),
('TRINCADO', 'Material', '#f97316'),
('ABA ONDULANDO', 'Dimensional', '#eab308'),
('ONDULANDO ABA', 'Dimensional', '#eab308'),
('ABAIXO DO PESO LINEAR', 'Dimensional', '#eab308'),
('ABALIXADO', 'Dimensional', '#eab308'),
('ACUMULO SUJEIRA', 'Qualidade', '#10b981'),
('AMASSAMENTO', 'Dimensional', '#eab308'),
('DIMENSIONAL FECHADO/ABERTO', 'Dimensional', '#eab308'),
('DISPAROU ACORDINA', 'Mecânico', '#ef4444'),
('EFICIENCIA BAIXA', 'Processo', '#8b5cf6'),
('ESPESSURA PESQUIOADA', 'Dimensional', '#eab308'),
('ESTUFADO', 'Dimensional', '#eab308'),
('FERRAMENTA ADIANTOU PULLER', 'Mecânico', '#ef4444'),
('FERRAMENTA CHATA', 'Mecânico', '#ef4444'),
('FORA DE ESQUADRO', 'Dimensional', '#eab308'),
('FORA DE MEDIDA', 'Dimensional', '#eab308'),
('FORA DE PLANICIDADE', 'Dimensional', '#eab308'),
('FORÇANDO PARA CENTRO', 'Processo', '#8b5cf6'),
('FORÇANDO PARA ESQUERDA/DIREITA', 'Processo', '#8b5cf6'),
('FURO ADIANTANDO', 'Dimensional', '#eab308'),
('FURO ATRASANDO', 'Dimensional', '#eab308'),
('MELHORAR RUGAMENTO RUGOSIDADE', 'Qualidade', '#10b981'),
('MELHORAR CORTE DE ABERTURA', 'Qualidade', '#10b981'),
('MULTI RISCO', 'Qualidade', '#10b981'),
('ONDULAÇÃO', 'Dimensional', '#eab308'),
('OPINA SOS ONDULADAS', 'Dimensional', '#eab308'),
('PICK UP', 'Processo', '#8b5cf6'),
('PRODUTIVIDADE BAIXA', 'Processo', '#8b5cf6'),
('PULLER ESCAPANDO', 'Mecânico', '#ef4444'),
('QUEIMANDO ACABAMENTO', 'Qualidade', '#10b981'),
('QUENCH PREPARANDO', 'Processo', '#8b5cf6'),
('RELEVO BAIXO/ALTO', 'Dimensional', '#eab308'),
('REVELANDO ONDA', 'Dimensional', '#eab308'),
('RISCO FURO', 'Qualidade', '#10b981'),
('SALENCIA INTERNA/EXTERNA', 'Dimensional', '#eab308'),
('SOLDA FRIO', 'Material', '#f97316'),
('TORCENDO DE DENTRO PARA FORA', 'Dimensional', '#eab308'),
('TORCENDO FRIO', 'Material', '#f97316'),
('TRINCA', 'Material', '#f97316')
ON CONFLICT (keyword) DO NOTHING;

-- =============================================
-- ROLLBACK
-- =============================================
-- DROP TRIGGER IF EXISTS trg_analysis_keywords_updated_at ON public.analysis_keywords;
-- DROP FUNCTION IF EXISTS public.analysis_keywords_updated_at();
-- DROP TABLE IF EXISTS public.analysis_keywords;
