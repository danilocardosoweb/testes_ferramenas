import { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { 
  Plus, 
  X, 
  Save, 
  Upload, 
  Palette,
  Filter,
  Search,
  Trash2,
  Eye,
  EyeOff
} from "lucide-react";

interface Keyword {
  id: string;
  keyword: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

interface KeywordsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeywordsUpdated?: () => void;
}

const CATEGORIES = [
  { name: 'Geral', color: '#6b7280' },
  { name: 'Mecânico', color: '#ef4444' },
  { name: 'Material', color: '#f97316' },
  { name: 'Processo', color: '#8b5cf6' },
  { name: 'Dimensional', color: '#eab308' },
  { name: 'Qualidade', color: '#10b981' }
];

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#10b981', '#06b6d4', 
  '#8b5cf6', '#ec4899', '#6b7280', '#f59e0b', '#14b8a6'
];

export function KeywordsManagerDialog({ 
  open, 
  onOpenChange, 
  onKeywordsUpdated 
}: KeywordsManagerDialogProps) {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Geral');
  const [bulkText, setBulkText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');
  

  // Buscar palavras-chave existentes
  const loadKeywords = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('analysis_keywords')
        .select('*')
        .order('keyword');
      
      if (error) throw error;
      setKeywords(data || []);
    } catch (error) {
      console.error('Erro ao carregar palavras-chave:', error);
    } finally {
      setLoading(false);
    }
  };

  // (Sugestões automáticas removidas a pedido)

  useEffect(() => {
    if (open) {
      loadKeywords();
    }
  }, [open]);

  // Adicionar palavra-chave individual
  const addKeyword = async () => {
    if (!newKeyword.trim()) return;

    try {
      const { error } = await supabase
        .from('analysis_keywords')
        .insert({
          keyword: newKeyword.trim().toUpperCase(),
          category: selectedCategory
        });

      if (error) throw error;

      setNewKeyword('');
      await loadKeywords();
      onKeywordsUpdated?.();
    } catch (error) {
      console.error('Erro ao adicionar palavra-chave:', error);
    }
  };

  // (Inserção por sugestão removida)

  // Adicionar múltiplas palavras-chave por texto
  const addBulkKeywords = async () => {
    if (!bulkText.trim()) return;

    const words = bulkText
      .toUpperCase()
      .split(/[\n,;]+/)
      .map(w => w.trim())
      .filter(w => w.length >= 3);

    // Remover duplicatas dentro do próprio lote
    const uniqueBatch: string[] = [];
    const seenInBatch = new Set<string>();
    for (const w of words) {
      if (!seenInBatch.has(w)) {
        seenInBatch.add(w);
        uniqueBatch.push(w);
      }
    }

    // Ignorar palavras que já existem no banco (estado local)
    const existing = new Set(
      keywords.map(k => (k.keyword || '').toString().toUpperCase().trim())
    );

    const newWords = uniqueBatch.filter(w => !existing.has(w));

    if (newWords.length === 0) {
      setBulkText('');
      return;
    }

    try {
      const { error } = await supabase
        .from('analysis_keywords')
        .insert(
          newWords.map(word => ({
            keyword: word,
            category: selectedCategory
          }))
        );

      if (error) throw error;

      setBulkText('');
      await loadKeywords();
      onKeywordsUpdated?.();
    } catch (error) {
      console.error('Erro ao adicionar palavras em lote:', error);
    }
  };

  // Atualizar palavra-chave
  const updateKeyword = async (id: string, updates: Partial<Keyword>) => {
    try {
      const { error } = await supabase
        .from('analysis_keywords')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      await loadKeywords();
      onKeywordsUpdated?.();
    } catch (error) {
      console.error('Erro ao atualizar palavra-chave:', error);
    }
  };

  // Deletar palavra-chave
  const deleteKeyword = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar esta palavra-chave?')) return;

    try {
      const { error } = await supabase
        .from('analysis_keywords')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadKeywords();
      onKeywordsUpdated?.();
    } catch (error) {
      console.error('Erro ao deletar palavra-chave:', error);
    }
  };

  // Filtrar palavras-chave
  const filteredKeywords = useMemo(() => {
    return keywords.filter(k => {
      const matchesSearch = k.keyword.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'Todas' || k.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [keywords, searchTerm, filterCategory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Gerenciar Palavras-Chave
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Adicionar nova palavra-chave */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Nova Palavra-Chave
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Digite a palavra-chave..."
                className="px-3 py-2 border rounded-md"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
              />
              <select
                className="px-3 py-2 border rounded-md"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.name} value={cat.name}>{cat.name}</option>
                ))}
              </select>
              <div className="text-sm text-gray-500">
                Categoria selecionada
              </div>
              <button
                onClick={addKeyword}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </div>

          {/* Adição em lote */}
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Adicionar em Lote
            </h3>
            <div className="space-y-3">
              <textarea
                placeholder="Cole aqui uma lista de palavras-chave (uma por linha ou separadas por vírgula)..."
                className="w-full px-3 py-2 border rounded-md h-20 resize-none"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <button
                onClick={addBulkKeywords}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Adicionar Todas
              </button>
            </div>
          </div>

          {/* Bloco de Sugestões Inteligentes removido */}

          {/* Filtros */}
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar palavras-chave..."
                className="px-3 py-2 border rounded-md w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                className="px-3 py-2 border rounded-md"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="Todas">Todas Categorias</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.name} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="text-sm text-gray-600">
              {filteredKeywords.length} de {keywords.length} palavras-chave
            </div>
          </div>

          {/* Lista de palavras-chave */}
          <div className="max-h-96 overflow-auto border rounded-lg">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Carregando...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
                {filteredKeywords.map(keyword => (
                  <div
                    key={keyword.id}
                    className={`p-3 border rounded-lg flex items-center justify-between ${
                      keyword.is_active ? 'bg-white' : 'bg-gray-100 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{keyword.keyword}</div>
                        <div className="text-xs text-gray-500">{keyword.category}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateKeyword(keyword.id, { is_active: !keyword.is_active })}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title={keyword.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {keyword.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => deleteKeyword(keyword.id)}
                        className="p-1 text-red-400 hover:text-red-600"
                        title="Deletar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
