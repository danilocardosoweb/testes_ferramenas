import { useState, useEffect } from "react";
import { Matrix } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

interface RomaneioRecord {
  id?: string;
  date: string;
  toolCode: string;
  sequence: string;
  cleaning: boolean;
  stock: boolean;
  box: string;
  createdAt?: string;
}

interface RomaneioFormProps {
  matrices: Matrix[];
}

export const RomaneioForm = ({ matrices }: RomaneioFormProps) => {
  const [formData, setFormData] = useState<RomaneioRecord>({
    date: new Date().toISOString().split('T')[0],
    toolCode: "",
    sequence: "",
    cleaning: false,
    stock: false,
    box: "",
  });

  const [activeTools, setActiveTools] = useState<Array<{ code: string; sequences: string[] }>>([]);
  const [selectedToolSequences, setSelectedToolSequences] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [toolSearchOpen, setToolSearchOpen] = useState(false);
  const [toolSearchValue, setToolSearchValue] = useState("");
  const [filteredTools, setFilteredTools] = useState<Array<{ code: string; sequences: string[] }>>([]);
  const { toast } = useToast();

  // Extrair ferramentas ativas e suas sequências
  useEffect(() => {
    const toolsMap = new Map<string, Set<string>>();

    matrices.forEach((matrix) => {
      // Verificar se a matriz tem status "Ativo" (último evento é Aprovação)
      const lastEvent = matrix.events[matrix.events.length - 1];
      const isActive = lastEvent?.type === "Aprovação";

      if (isActive) {
        const toolCode = matrix.code;
        if (!toolsMap.has(toolCode)) {
          toolsMap.set(toolCode, new Set());
        }

        // Extrair sequências dos eventos
        matrix.events.forEach((event) => {
          if (event.comment && event.comment.includes("sequência")) {
            const match = event.comment.match(/sequência\s+(\d+)/i);
            if (match) {
              toolsMap.get(toolCode)?.add(match[1]);
            }
          }
        });

        // Se não houver sequências, adicionar uma padrão
        if (toolsMap.get(toolCode)?.size === 0) {
          toolsMap.get(toolCode)?.add("1");
        }
      }
    });

    const tools = Array.from(toolsMap.entries()).map(([code, sequences]) => ({
      code,
      sequences: Array.from(sequences).sort(),
    }));

    const sortedTools = tools.sort((a, b) => a.code.localeCompare(b.code));
    setActiveTools(sortedTools);
    setFilteredTools(sortedTools);
  }, [matrices]);

  // Filtrar ferramentas conforme digitação
  useEffect(() => {
    if (toolSearchValue.trim()) {
      const filtered = activeTools.filter((tool) =>
        tool.code.toLowerCase().includes(toolSearchValue.toLowerCase())
      );
      setFilteredTools(filtered);
    } else {
      setFilteredTools(activeTools);
    }
  }, [toolSearchValue, activeTools]);

  // Atualizar sequências quando ferramenta muda
  useEffect(() => {
    const tool = activeTools.find((t) => t.code === formData.toolCode);
    setSelectedToolSequences(tool?.sequences || []);
    setFormData((prev) => ({ ...prev, sequence: "" }));
  }, [formData.toolCode, activeTools]);

  const handleToolChange = (toolCode: string) => {
    setFormData((prev) => ({ ...prev, toolCode }));
  };

  const handleSequenceChange = (sequence: string) => {
    setFormData((prev) => ({ ...prev, sequence }));
  };

  const handleCheckboxChange = (field: "cleaning" | "stock") => {
    setFormData((prev) => ({
      ...prev,
      [field]: !prev[field],
      // Se marcar Limpeza, desmarcar Estoque e vice-versa
      ...(field === "cleaning" && { stock: false }),
      ...(field === "stock" && { cleaning: false }),
    }));
  };

  const handleBoxChange = (value: string) => {
    setFormData((prev) => ({ ...prev, box: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validações
    if (!formData.date) {
      toast({ title: "Erro", description: "Data é obrigatória", variant: "destructive" });
      return;
    }
    if (!formData.toolCode) {
      toast({ title: "Erro", description: "Ferramenta é obrigatória", variant: "destructive" });
      return;
    }
    if (!formData.sequence) {
      toast({ title: "Erro", description: "Sequência é obrigatória", variant: "destructive" });
      return;
    }
    if (!formData.cleaning && !formData.stock) {
      toast({ title: "Erro", description: "Selecione Limpeza ou Estoque", variant: "destructive" });
      return;
    }
    if (formData.stock && !formData.box) {
      toast({ title: "Erro", description: "Box é obrigatório quando retornando para estoque", variant: "destructive" });
      return;
    }

    try {
      setSubmitting(true);

      // Aqui você pode adicionar a lógica para salvar no banco de dados
      // Por enquanto, apenas mostra um toast de sucesso
      console.log("Registro de Romaneio:", formData);

      toast({
        title: "Sucesso",
        description: `Ferramenta ${formData.toolCode} registrada com sucesso`,
      });

      // Resetar formulário
      setFormData({
        date: new Date().toISOString().split('T')[0],
        toolCode: "",
        sequence: "",
        cleaning: false,
        stock: false,
        box: "",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao registrar",
        description: String(err?.message || err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-6xl border-0 md:border shadow-none md:shadow-sm">
      <CardHeader className="p-3 md:p-6">
        <CardTitle className="text-lg md:text-2xl">Registro de Romaneio</CardTitle>
      </CardHeader>
      <CardContent className="p-2 md:p-4">
        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          {/* Primeira linha: Data */}
          <div className="w-full md:w-48">
            <Label htmlFor="date" className="text-xs md:text-sm font-medium block">Data</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
              className="mt-1 text-xs md:text-sm h-9 md:h-10 p-1 md:p-2 w-full"
            />
          </div>

          {/* Segunda linha: Ferramenta | Sequência | Box | Destino (lado a lado) */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 md:gap-3">
            {/* Ferramenta com Autocomplete */}
            <div className="relative">
              <Label htmlFor="toolCode" className="text-xs md:text-sm font-medium block">Ferramenta</Label>
              <div className="flex gap-1 mt-1">
                <div className="flex-1 relative">
                  <Input
                    id="toolCode"
                    type="text"
                    placeholder="Digitar..."
                    value={toolSearchValue}
                    onChange={(e) => {
                      setToolSearchValue(e.target.value);
                      setToolSearchOpen(true);
                    }}
                    onFocus={() => setToolSearchOpen(true)}
                    className="text-xs md:text-sm h-9 md:h-10 w-full"
                  />
                  {/* Dropdown de autocomplete */}
                  {toolSearchOpen && filteredTools.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {filteredTools.map((tool) => (
                        <button
                          key={tool.code}
                          type="button"
                          className="w-full text-left px-2 py-1 text-xs md:text-sm hover:bg-muted"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, toolCode: tool.code }));
                            setToolSearchValue(tool.code);
                            setToolSearchOpen(false);
                          }}
                        >
                          {tool.code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 md:h-10 px-2"
                  title="Adicionar nova ferramenta"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Sequência */}
            <div>
              <Label htmlFor="sequence" className="text-xs md:text-sm font-medium block">Sequência</Label>
              <Select value={formData.sequence} onValueChange={(value) => setFormData((prev) => ({ ...prev, sequence: value }))}>
                <SelectTrigger className="mt-1 text-xs md:text-sm h-9 md:h-10">
                  <SelectValue placeholder="Sel." />
                </SelectTrigger>
                <SelectContent>
                  {selectedToolSequences.map((seq) => (
                    <SelectItem key={seq} value={seq}>
                      {seq}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Box */}
            <div>
              <Label htmlFor="box" className="text-xs md:text-sm font-medium block">Box</Label>
              <Input
                id="box"
                type="text"
                placeholder="A1"
                value={formData.box}
                onChange={(e) => handleBoxChange(e.target.value)}
                className="mt-1 text-xs md:text-sm h-9 md:h-10 p-1 md:p-2"
                disabled={!formData.stock}
              />
            </div>

            {/* Destino (Checkboxes lado a lado) */}
            <div className="md:col-span-2">
              <Label className="text-xs md:text-sm font-medium block">Destino</Label>
              <div className="flex gap-2 md:gap-3 mt-1">
                <div className="flex items-center gap-1 p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleCheckboxChange("cleaning")}>
                  <Checkbox
                    id="cleaning"
                    checked={formData.cleaning}
                    onCheckedChange={() => handleCheckboxChange("cleaning")}
                    className="h-4 w-4 md:h-5 md:w-5"
                  />
                  <Label htmlFor="cleaning" className="font-normal cursor-pointer text-xs">
                    Limpeza
                  </Label>
                </div>
                <div className="flex items-center gap-1 p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleCheckboxChange("stock")}>
                  <Checkbox
                    id="stock"
                    checked={formData.stock}
                    onCheckedChange={() => handleCheckboxChange("stock")}
                    className="h-4 w-4 md:h-5 md:w-5"
                  />
                  <Label htmlFor="stock" className="font-normal cursor-pointer text-xs">
                    Estoque
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {/* Terceira linha: Botões */}
          <div className="flex gap-2 pt-2 md:pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormData({
                  date: new Date().toISOString().split('T')[0],
                  toolCode: "",
                  sequence: "",
                  cleaning: false,
                  stock: false,
                  box: "",
                });
              }}
              disabled={submitting}
              className="text-xs md:text-sm h-9 md:h-10 px-3 md:px-4"
            >
              Limpar
            </Button>
            <Button 
              type="submit" 
              disabled={submitting}
              className="text-xs md:text-sm h-9 md:h-10 px-3 md:px-4"
            >
              {submitting ? "..." : "Registrar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
