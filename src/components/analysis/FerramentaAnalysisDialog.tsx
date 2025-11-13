import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { Settings } from "lucide-react";
import { KeywordsManagerDialog } from "./KeywordsManagerDialog";

interface KeywordData {
  id: string;
  keyword: string;
  category: string;
  is_active: boolean;
}

const EXCLUDED_COD_PARADA = new Set(["401", "402", "400", "306", "313", "315", "121"]);

type ViewRow = {
  Prensa: string | number | null;
  "Data Produção": string | null;
  Turno: string | null;
  Matriz: string | null;
  Seq: string | number | null;
  "Peso Bruto": number | string | null;
  "Eficiência": number | string | null;
  Produtividade: number | string | null;
  "Cod Parada": string | null;
  "Liga Utilizada": string | null;
  "Observação Lote": string | null;
};

interface FerramentaAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ViewRow[];
  matrizFilter: string;
}

interface ProdutivityAnalysis {
  ultimoMes: number;
  ultimos6Meses: number;
  ultimos12Meses: number;
  maiorProdutividade: number;
  menorProdutividade: number;
  volumeMaiorProd: number;
  volumeMenorProd: number;
}

interface CausaAnalysis {
  palavra: string;
  ocorrencias: number;
  porcentagem: number;
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  // Formato DD/MM/AAAA
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

function isWithinDays(date: Date, days: number): boolean {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days;
}

function getProdutividade(value: any): number | null {
  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value);
  return isFinite(num) ? num : null;
}

export function FerramentaAnalysisDialog({ 
  open, 
  onOpenChange, 
  data, 
  matrizFilter 
}: FerramentaAnalysisDialogProps) {
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [keywordsManagerOpen, setKeywordsManagerOpen] = useState(false);
  
  // Carregar palavras-chave do banco
  const loadKeywords = async () => {
    try {
      const { data: keywordsData, error } = await supabase
        .from('analysis_keywords')
        .select('*')
        .order('keyword');
      
      if (error) throw error;
      setKeywords((keywordsData || []).map(k => ({
        ...k,
        keyword: (k.keyword || '').toString().toUpperCase(),
      })) as any);
    } catch (error) {
      console.error('Erro ao carregar palavras-chave:', error);
      // Fallback para palavras-chave padrão se houver erro
      setKeywords([]);
    }
  };
  
  useEffect(() => {
    if (open) {
      loadKeywords();
    }
  }, [open]);
  
  // Filtrar dados pela matriz selecionada
  const filteredData = useMemo(() => {
    if (!matrizFilter.trim()) return data;
    return data.filter(row => 
      (row.Matriz || '').toString().toLowerCase().includes(matrizFilter.trim().toLowerCase())
    );
  }, [data, matrizFilter]);

  // Análise de produtividade
  const productivityAnalysis = useMemo((): ProdutivityAnalysis => {
    const validRows = filteredData.filter(row => {
      const date = parseDate(row["Data Produção"]);
      const prod = getProdutividade(row.Produtividade);
      return date && prod !== null && prod >= 400 && prod <= 2400;
    });

    const now = new Date();
    const ultimo30 = validRows.filter(row => {
      const date = parseDate(row["Data Produção"]);
      return date && isWithinDays(date, 30);
    });

    const ultimo180 = validRows.filter(row => {
      const date = parseDate(row["Data Produção"]);
      return date && isWithinDays(date, 180);
    });

    const ultimo365 = validRows.filter(row => {
      const date = parseDate(row["Data Produção"]);
      return date && isWithinDays(date, 365);
    });

    const calcMedia = (rows: ViewRow[]) => {
      if (rows.length === 0) return 0;
      const sum = rows.reduce((acc, row) => {
        const prod = getProdutividade(row.Produtividade);
        return acc + (prod || 0);
      }, 0);
      return sum / rows.length;
    };

    const allProds = validRows.map(row => getProdutividade(row.Produtividade)).filter(p => p !== null) as number[];
    
    // Encontrar os registros com maior e menor produtividade para pegar os volumes
    let maiorProd = 0;
    let menorProd = 0;
    let volumeMaior = 0;
    let volumeMenor = 0;
    
    if (allProds.length > 0) {
      maiorProd = Math.max(...allProds);
      menorProd = Math.min(...allProds);
      
      // Encontrar o registro com maior produtividade
      const rowMaior = validRows.find(row => getProdutividade(row.Produtividade) === maiorProd);
      if (rowMaior) {
        const peso = typeof rowMaior["Peso Bruto"] === 'string' ? 
          parseFloat(rowMaior["Peso Bruto"].replace(',', '.')) : 
          Number(rowMaior["Peso Bruto"]);
        volumeMaior = isFinite(peso) ? peso : 0;
      }
      
      // Encontrar o registro com menor produtividade
      const rowMenor = validRows.find(row => getProdutividade(row.Produtividade) === menorProd);
      if (rowMenor) {
        const peso = typeof rowMenor["Peso Bruto"] === 'string' ? 
          parseFloat(rowMenor["Peso Bruto"].replace(',', '.')) : 
          Number(rowMenor["Peso Bruto"]);
        volumeMenor = isFinite(peso) ? peso : 0;
      }
    }
    
    return {
      ultimoMes: calcMedia(ultimo30),
      ultimos6Meses: calcMedia(ultimo180),
      ultimos12Meses: calcMedia(ultimo365),
      maiorProdutividade: maiorProd,
      menorProdutividade: menorProd,
      volumeMaiorProd: volumeMaior,
      volumeMenorProd: volumeMenor,
    };
  }, [filteredData]);

  // Análise de causas
  const causasAnalysis = useMemo((): CausaAnalysis[] => {
    const totalObservacoes = filteredData.filter(row => row["Observação Lote"]).length;
    
    if (totalObservacoes === 0) {
      // Retorna todas as palavras-chave com 0 ocorrências
      return keywords.map(keyword => ({
        palavra: keyword.keyword,
        ocorrencias: 0,
        porcentagem: 0
      }));
    }

    const contadores = new Map<string, number>();
    
    // Inicializar todas as palavras-chave com 0
    keywords.forEach(keyword => {
      contadores.set((keyword.keyword || '').toString().toUpperCase(), 0);
    });
    
    filteredData.forEach(row => {
      const obs = (row["Observação Lote"] || '').toString().toUpperCase();
      if (!obs.trim()) return;
      
      keywords.forEach(keyword => {
        const kw = (keyword.keyword || '').toString().toUpperCase();
        if (kw && obs.includes(kw)) {
          contadores.set(kw, (contadores.get(kw) || 0) + 1);
        }
      });
    });

    const result: CausaAnalysis[] = [];
    contadores.forEach((ocorrencias, palavra) => {
      result.push({
        palavra,
        ocorrencias,
        porcentagem: (ocorrencias / totalObservacoes) * 100
      });
    });

    return result.sort((a, b) => b.porcentagem - a.porcentagem);
  }, [filteredData, keywords]);
  
  const totalPorcentagem = useMemo(() => {
    return causasAnalysis.reduce((acc, causa) => acc + causa.porcentagem, 0);
  }, [causasAnalysis]);

  const formatNumber = (num: number) => {
    return num.toLocaleString('pt-BR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const codParadaStats = useMemo(() => {
    let atendido = 0;
    let outros = 0;
    filteredData.forEach(row => {
      const raw = (row["Cod Parada"] || "").toString();
      if (!raw) return;
      const upper = raw.toUpperCase();
      const code = upper.split("-")[0].trim();
      if (EXCLUDED_COD_PARADA.has(code)) return;
      if (upper.includes("001") && upper.includes("PEDIDO ATENDIDO")) {
        atendido += 1;
      } else {
        outros += 1;
      }
    });
    const total = atendido + outros;
    const pAtendido = total > 0 ? (atendido / total) * 100 : 0;
    const pOutros = total > 0 ? (outros / total) * 100 : 0;
    return { atendido, outros, total, pAtendido, pOutros };
  }, [filteredData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              Análise de Ferramenta {matrizFilter && `- ${matrizFilter}`}
            </DialogTitle>
            <button
              onClick={() => setKeywordsManagerOpen(true)}
              className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm mr-8"
              title="Gerenciar palavras-chave"
            >
              <Settings className="h-4 w-4" />
              Gerenciar Palavras-Chave
            </button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Análise de Produtividade */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Média de Produtividade</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600 font-medium">Último Mês</div>
                <div className="text-xl font-bold text-blue-800">
                  {formatNumber(productivityAnalysis.ultimoMes)} kg/h
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600 font-medium">Últimos 6 Meses</div>
                <div className="text-xl font-bold text-green-800">
                  {formatNumber(productivityAnalysis.ultimos6Meses)} kg/h
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-purple-600 font-medium">Últimos 12 Meses</div>
                <div className="text-xl font-bold text-purple-800">
                  {formatNumber(productivityAnalysis.ultimos12Meses)} kg/h
                </div>
              </div>
            </div>
          </div>

          {/* Análise de Extremos */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Análise de Extremos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-red-600 font-medium">Maior Produtividade</div>
                <div className="text-xl font-bold text-red-800">
                  {formatNumber(productivityAnalysis.volumeMaiorProd)} kg - {formatNumber(productivityAnalysis.maiorProdutividade)} kg/h
                </div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm text-orange-600 font-medium">Menor Produtividade</div>
                <div className="text-xl font-bold text-orange-800">
                  {formatNumber(productivityAnalysis.volumeMenorProd)} kg - {formatNumber(productivityAnalysis.menorProdutividade)} kg/h
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Indicador por Cod Parada</h3>
            {codParadaStats.total === 0 ? (
              <div className="text-sm text-muted-foreground">Sem ocorrências consideradas.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-sky-50 p-4 rounded-lg">
                  <div className="text-sm text-sky-600 font-medium">001 - PEDIDO ATENDIDO</div>
                  <div className="text-xl font-bold text-sky-800">
                    {codParadaStats.atendido} • {formatNumber(codParadaStats.pAtendido)}%
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 font-medium">Demais ocorrências (excluídos códigos 400, 401, 402, 306, 313, 315, 121)</div>
                  <div className="text-xl font-bold text-gray-800">
                    {codParadaStats.outros} • {formatNumber(codParadaStats.pOutros)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Análise de Causas */}
          <div>
            <h3 className="text-lg font-semibold mb-3">
              Análise de Causas ({causasAnalysis.filter(c => c.ocorrencias > 0).length} com ocorrências)
            </h3>
            {causasAnalysis.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nenhuma observação encontrada nos dados.
              </div>
            ) : (
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Causa</th>
                      <th className="text-right p-2">Ocorrências</th>
                      <th className="text-right p-2">Porcentagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {causasAnalysis.map((causa, index) => (
                      <tr key={causa.palavra} className={`border-b ${
                        causa.ocorrencias === 0 ? 'opacity-40' : ''
                      }`}>
                        <td className="p-2 font-medium">{causa.palavra}</td>
                        <td className="p-2 text-right">{causa.ocorrencias}</td>
                        <td className="p-2 text-right">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            causa.porcentagem >= 10 ? 'bg-red-100 text-red-800' :
                            causa.porcentagem >= 5 ? 'bg-yellow-100 text-yellow-800' :
                            causa.porcentagem > 0 ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {formatNumber(causa.porcentagem)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 bg-muted/50 font-semibold">
                      <td className="p-2">TOTAL</td>
                      <td className="p-2 text-right">
                        {causasAnalysis.reduce((acc, causa) => acc + causa.ocorrencias, 0)}
                      </td>
                      <td className="p-2 text-right">
                        <span className="px-2 py-1 rounded text-xs font-bold bg-primary text-primary-foreground">
                          {formatNumber(totalPorcentagem)}%
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Informações adicionais */}
          <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
            <div>• Dados filtrados: {filteredData.length} registros</div>
            <div>• Produtividade válida: valores entre 400 e 2.400 kg/h</div>
            <div>• Análise baseada em {keywords.length} palavras-chave cadastradas</div>
          </div>
        </div>
      </DialogContent>
      
      <KeywordsManagerDialog
        open={keywordsManagerOpen}
        onOpenChange={setKeywordsManagerOpen}
        onKeywordsUpdated={loadKeywords}
      />
    </Dialog>
  );
}
