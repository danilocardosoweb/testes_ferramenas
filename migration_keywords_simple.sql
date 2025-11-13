-- =============================================
-- 12/11/2025 - Sistema de palavras-chave dinâmicas
-- =============================================

-- Criar tabela
CREATE TABLE IF NOT EXISTS public.analysis_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL UNIQUE,
  category text DEFAULT 'Geral',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_analysis_keywords_active ON public.analysis_keywords (is_active);
CREATE INDEX IF NOT EXISTS idx_analysis_keywords_category ON public.analysis_keywords (category);

-- RLS
ALTER TABLE public.analysis_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY analysis_keywords_policy ON public.analysis_keywords FOR ALL USING (true);

-- Popular com palavras existentes
INSERT INTO public.analysis_keywords (keyword, category) VALUES
('ARRANCAMENTO', 'Mecânico'),
('ARRANCAMENTO INTERNO', 'Mecânico'),
('BOLHA', 'Material'),
('DEFORMAÇÃO EMENDA', 'Dimensional'),
('DESLOCOU FERRAMENTA', 'Mecânico'),
('ENTUPIU', 'Processo'),
('FALHA OPERACIONAL CALCULO', 'Processo'),
('FALTA AR COMPRIDO', 'Processo'),
('FERRAMENTA RESTITUIU', 'Mecânico'),
('FERRAMENTA PEGANDO ANEL', 'Mecânico'),
('FERRAMENTA PESANDO', 'Mecânico'),
('FERRAMENTA PESANDO SAIDA', 'Mecânico'),
('FERRAMENTA RESTANDO', 'Mecânico'),
('FERRAMENTA SEM CARCAÇA', 'Mecânico'),
('FERRAMENTA SEM PINO', 'Mecânico'),
('FERRAMENTA VIROU', 'Mecânico'),
('FORMALI TAPETA', 'Processo'),
('FURO ENTUPIU FERRAMENTA', 'Processo'),
('PEGOU AR', 'Processo'),
('PEGOU ASA PULLER', 'Mecânico'),
('PEGOU NO PO', 'Processo'),
('PEGOU NO PULLER', 'Mecânico'),
('PROBLEMA IMPIEDRADOR TARUGO', 'Mecânico'),
('PROBLEMA FACA FERRAMENTA', 'Mecânico'),
('PROBLEMA RESULTADO BET', 'Qualidade'),
('PROBLEMA SENSOR TARUGO', 'Mecânico'),
('QUEBRA SERRA CONIENTE', 'Mecânico'),
('PULLER DESARMOU', 'Mecânico'),
('QUEBROU CALMA', 'Mecânico'),
('RASÇOU', 'Material'),
('ACANÃO FERRAMENTA TALÃO ERRADO', 'Processo'),
('TARUGO PESANDO MUITO', 'Material'),
('TARUGO REZOTADO', 'Material'),
('TEMPERATURA OLEO AQUECEU', 'Processo'),
('TRINCADO', 'Material'),
('ABA ONDULANDO', 'Dimensional'),
('ONDULANDO ABA', 'Dimensional'),
('ABAIXO DO PESO LINEAR', 'Dimensional'),
('ABALIXADO', 'Dimensional'),
('ACUMULO SUJEIRA', 'Qualidade'),
('AMASSAMENTO', 'Dimensional'),
('DIMENSIONAL FECHADO/ABERTO', 'Dimensional'),
('DISPAROU ACORDINA', 'Mecânico'),
('EFICIENCIA BAIXA', 'Processo'),
('ESPESSURA PESQUIOADA', 'Dimensional'),
('ESTUFADO', 'Dimensional'),
('FERRAMENTA ADIANTOU PULLER', 'Mecânico'),
('FERRAMENTA CHATA', 'Mecânico'),
('FORA DE ESQUADRO', 'Dimensional'),
('FORA DE MEDIDA', 'Dimensional'),
('FORA DE PLANICIDADE', 'Dimensional'),
('FORÇANDO PARA CENTRO', 'Processo'),
('FORÇANDO PARA ESQUERDA/DIREITA', 'Processo'),
('FURO ADIANTANDO', 'Dimensional'),
('FURO ATRASANDO', 'Dimensional'),
('MELHORAR RUGAMENTO RUGOSIDADE', 'Qualidade'),
('MELHORAR CORTE DE ABERTURA', 'Qualidade'),
('MULTI RISCO', 'Qualidade'),
('ONDULAÇÃO', 'Dimensional'),
('OPINA SOS ONDULADAS', 'Dimensional'),
('PICK UP', 'Processo'),
('PRODUTIVIDADE BAIXA', 'Processo'),
('PULLER ESCAPANDO', 'Mecânico'),
('QUEIMANDO ACABAMENTO', 'Qualidade'),
('QUENCH PREPARANDO', 'Processo'),
('RELEVO BAIXO/ALTO', 'Dimensional'),
('REVELANDO ONDA', 'Dimensional'),
('RISCO FURO', 'Qualidade'),
('SALENCIA INTERNA/EXTERNA', 'Dimensional'),
('SOLDA FRIO', 'Material'),
('TORCENDO DE DENTRO PARA FORA', 'Dimensional'),
('TORCENDO FRIO', 'Material'),
('TRINCA', 'Material')
ON CONFLICT (keyword) DO NOTHING;

-- =============================================
-- ROLLBACK (se necessário)
-- =============================================
-- DROP TABLE IF EXISTS public.analysis_keywords;
