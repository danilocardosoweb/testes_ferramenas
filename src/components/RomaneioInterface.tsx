import { useRef, useState, useEffect } from "react";
import { Matrix } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Check, Clock, ImageDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { CleaningOrdersView } from "@/components/CleaningOrdersView";

interface RomaneioRecord {
  id: string;
  date: string;
  toolCode: string;
  sequence: string;
  cleaning: boolean;
  stock: boolean;
  box: string;
  timestamp: number;
  imageName?: string;
  imageUrl?: string;
}

interface RomaneioDraftLine {
  id: string;
  toolSearch: string;
  toolCode: string;
  sequence: string;
  cleaning: boolean;
  stock: boolean;
  box: string;
  dropdownOpen: boolean;
  highlightedIndex: number;
  imageName: string;
  imageFile: File | null;
}

interface RomaneioInterfaceProps {
  matrices: Matrix[];
}

const deriveSequenceFromCode = (code: string) => {
  if (!code) return "";
  const slashParts = code.split("/");
  if (slashParts.length > 1) {
    const lastPart = slashParts[slashParts.length - 1];
    if (lastPart) return lastPart.trim();
  }
  return "";
};

const createEmptyLine = (): RomaneioDraftLine => ({
  id: crypto.randomUUID(),
  toolSearch: "",
  toolCode: "",
  sequence: "",
  cleaning: false,
  stock: false,
  box: "",
  dropdownOpen: false,
  highlightedIndex: 0,
  imageName: "",
  imageFile: null,
});

export const RomaneioInterface = ({ matrices }: RomaneioInterfaceProps) => {
  const [records, setRecords] = useState<RomaneioRecord[]>([]);
  const [activeTools, setActiveTools] = useState<Array<{ code: string; sequences: string[] }>>([]);
  const [vdNitretMap, setVdNitretMap] = useState<Record<string, string | null>>({}); // chave: CODE|SEQ
  const [diametroMap, setDiametroMap] = useState<Record<string, string | null>>({}); // chave: CODE|SEQ
  const [loadingTools, setLoadingTools] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
 
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [lines, setLines] = useState<RomaneioDraftLine[]>([createEmptyLine()]);
  const toolInputRef = useRef<HTMLInputElement | null>(null);
  const [focusToolNext, setFocusToolNext] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    if (!focusToolNext) return;
    window.requestAnimationFrame(() => {
      toolInputRef.current?.focus();
      setFocusToolNext(false);
    });
  }, [focusToolNext, lines.length]);

  const fmtISODate = (iso: string) => {
    const clean = (iso || "").split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      if (yyyy && mm && dd) return `${dd}/${mm}/${yyyy}`;
    }
    return iso;
  };

  const formatToolExternal = (toolCode: string, sequence?: string | null) => {
    const codeClean = (toolCode || "")
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9]/g, "");
    const seqRaw = (sequence ?? "").toString().trim();
    const seqNum = Number.parseInt(seqRaw, 10);
    const seq = Number.isFinite(seqNum) ? String(seqNum).padStart(3, "0") : seqRaw ? seqRaw.padStart(3, "0") : "";
    return seq ? `F-${codeClean}/${seq}` : `F-${codeClean}`;
  };

  const parseVdNitretNumber = (val?: string | null): number | null => {
    if (val == null) return null;
    const raw = String(val).trim();

    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');

    let normalized = raw;
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        normalized = raw.replace(/\./g, '').replace(/,/g, '.');
      } else {
        normalized = raw.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      normalized = raw.replace(/,/g, '.');
    } else {
      normalized = raw;
    }

    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const num = Number(match[0]);
    return Number.isFinite(num) ? num : null;
  };

  // Buscar ferramentas ativas de analysis_ferramentas (mesma fonte da aba "Ferramentas" em "Análise")
  useEffect(() => {
    const loadApprovedTools = async () => {
      setLoadingTools(true);
      try {
        // Debug: verificar total de registros na tabela
        const { count: totalCount } = await supabase
          .from("analysis_ferramentas")
          .select("*", { count: "exact", head: true });
        console.log(`Total de registros em analysis_ferramentas: ${totalCount}`);

        // Debug: buscar registros com Ativa = "Sim"
        const { data: sampleSim, count: countSim } = await supabase
          .from("analysis_ferramentas")
          .select("ferramenta_code, ferramenta_seq, payload", { count: "exact" })
          .eq("payload->>Ativa", "Sim")
          .limit(5);
        console.log(`Total de registros com Ativa='Sim': ${countSim}`);
        if (sampleSim && sampleSim.length > 0) {
          console.log("Amostra de registros com Ativa='Sim':", sampleSim);
        } else {
          console.warn("Nenhum registro encontrado com Ativa='Sim'. Verificando valores únicos de Ativa...");
          // Buscar valores únicos de Ativa
          const { data: allSample } = await supabase
            .from("analysis_ferramentas")
            .select("payload")
            .limit(100);
          if (allSample) {
            const ativaValues = new Set(allSample.map((r: any) => r.payload?.Ativa).filter(Boolean));
            console.log("Valores únicos de Ativa encontrados:", Array.from(ativaValues));
          }
        }

        // Paginar buscando todos os registros com ordenação estável
        const pageSize = 1000;
        let from = 0;
        const allRows: any[] = [];
        while (true) {
          const to = from + pageSize - 1;
          const { data: page, error: pageErr } = await supabase
            .from("analysis_ferramentas")
            .select("id, ferramenta_code, ferramenta_seq, payload")
            .order("id", { ascending: true })
            .range(from, to);
          if (pageErr) {
            console.error("Erro ao paginar ferramentas:", pageErr);
            break;
          }
          if (!page || page.length === 0) break;
          allRows.push(...page);
          if (page.length < pageSize) break;
          from += page.length;
        }

        if (allRows.length === 0) {
          console.warn("Nenhum registro encontrado em analysis_ferramentas");
          setActiveTools([]);
          return;
        }

        const activeOnly = allRows.filter((row: any) => {
          const v = (row?.payload?.Ativa ?? "").toString().trim().toLowerCase();
          return v === "sim";
        });

        const toolsMap = new Map<string, Set<string>>();
        const vdMap: Record<string, string | null> = {};
        const diaMap: Record<string, string | null> = {};
        activeOnly.forEach((row: any) => {
          const codeRaw = (row.ferramenta_code ?? row.payload?.Matriz ?? row.payload?.Ferramenta ?? "").toString();
          const seqRaw = (row.ferramenta_seq ?? row.payload?.Seq ?? "").toString();
          const code = codeRaw.trim();
          const seq = seqRaw.trim();
          if (!code) return;
          if (!toolsMap.has(code)) {
            toolsMap.set(code, new Set());
          }
          if (seq) {
            toolsMap.get(code)?.add(seq);
          }
          // Captura Vd Nitret para o par code|seq
          const vd = (row.payload?.["Vd Nitret"] ?? row.payload?.["Vd Nitretação"] ?? row.payload?.["Vida Nitretação"] ?? row.payload?.["Vida Nitret"] ?? row.payload?.["Vd.Nitret"] ?? row.payload?.["Vd_Nitret"]) ?? null;
          const key = `${code.toUpperCase()}|${seq}`;
          if (key) vdMap[key] = vd != null ? String(vd) : null;

          const dia = (row.payload?.["Diametro"] ?? row.payload?.["Diâmetro"] ?? row.payload?.["Diametro (mm)"] ?? row.payload?.["Diâmetro (mm)"] ?? row.payload?.["Ø"] ?? row.payload?.["diametro"]) ?? null;
          if (key) diaMap[key] = dia != null ? String(dia) : null;
        });

        const tools = Array.from(toolsMap.entries()).map(([code, sequences]) => ({
          code,
          sequences: Array.from(sequences).sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            return isNaN(numA) || isNaN(numB) ? a.localeCompare(b) : numA - numB;
          }),
        }));

        console.log(`Carregadas ${tools.length} ferramentas ativas do banco de dados (registros lidos: ${allRows.length})`);
        setActiveTools(tools);
        setVdNitretMap(vdMap);
        setDiametroMap(diaMap);
      } catch (err) {
        console.error("Erro ao carregar ferramentas ativas:", err);
        setActiveTools([]);
      } finally {
        setLoadingTools(false);
      }
    };

    loadApprovedTools();
  }, []);

  const updateLine = (id: string, patch: Partial<RomaneioDraftLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id === id) return { ...l, ...patch };
        if (patch.dropdownOpen) return { ...l, dropdownOpen: false };
        return l;
      })
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => {
      const next = prev.filter((l) => l.id !== id);
      if (next.length > 0) return next;
      return [createEmptyLine()];
    });
  };

  const getLineToolData = (toolCode: string) => activeTools.find((t) => t.code === toolCode);

  const handleSelectTool = (lineId: string, toolCode: string) => {
    const upperCode = toolCode.toUpperCase();
    const toolData = getLineToolData(upperCode);
    const derivedSeq = toolData?.sequences[0] || "1";
    updateLine(lineId, { toolCode: upperCode, toolSearch: upperCode, dropdownOpen: false, sequence: derivedSeq });
  };

  const handleSelectToolSeq = (lineId: string, toolCode: string, seq: string) => {
    const upperCode = toolCode.toUpperCase();
    const chosenSeq = seq || deriveSequenceFromCode(upperCode) || "1";
    updateLine(lineId, { toolCode: upperCode, toolSearch: upperCode, dropdownOpen: false, sequence: chosenSeq, highlightedIndex: 0 });
  };

  const clearBatch = () => {
    setLines([createEmptyLine()]);
  };

  const handleImageChange = (lineId: string, file: File | null) => {
    updateLine(lineId, {
      imageFile: file,
      imageName: file?.name ?? "",
    });
  };

  const handleRegisterBatch = () => {
    if (!batchDate) {
      toast({ title: "Erro", description: "Preencha a Data", variant: "destructive" });
      return;
    }

    const now = Date.now();
    const validLines = lines.filter((l) => l.toolCode.trim() || l.toolSearch.trim() || l.box.trim() || l.cleaning || l.stock);

    if (validLines.length === 0) {
      toast({ title: "Erro", description: "Adicione ao menos uma linha", variant: "destructive" });
      return;
    }

    for (const l of validLines) {
      if (!l.toolCode) {
        toast({ title: "Erro", description: "Preencha a Ferramenta em todas as linhas", variant: "destructive" });
        return;
      }
      if (!l.cleaning && !l.stock) {
        toast({ title: "Erro", description: "Selecione Limpeza ou Estoque em todas as linhas", variant: "destructive" });
        return;
      }
      if (l.stock && !l.box) {
        toast({ title: "Erro", description: "Preencha o Box quando a linha for para Estoque", variant: "destructive" });
        return;
      }
    }

    const dupCounts = new Map<string, number>();
    for (const l of validLines) {
      const code = (l.toolCode || l.toolSearch || "").trim().toUpperCase();
      const seq = (l.sequence || "1").trim();
      const key = `${code}|${seq}`;
      dupCounts.set(key, (dupCounts.get(key) ?? 0) + 1);
    }
    const dups = Array.from(dupCounts.entries()).filter(([, count]) => count > 1);
    if (dups.length > 0) {
      const txt = dups.map(([k]) => {
        const [code, seq] = k.split("|");
        return `${code} / ${seq}`;
      }).join(", ");
      toast({ title: "Erro", description: `Lote com ferramentas duplicadas: ${txt}`, variant: "destructive" });
      return;
    }

    const existingSet = new Set(
      records
        .filter((r) => r.date === batchDate)
        .map((r) => `${(r.toolCode || "").trim().toUpperCase()}|${(r.sequence || "1").trim()}`)
    );
    const alreadyAdded = Array.from(dupCounts.keys()).filter((k) => existingSet.has(k));
    if (alreadyAdded.length > 0) {
      const txt = alreadyAdded
        .map((k) => {
          const [code, seq] = k.split("|");
          return `${code} / ${seq}`;
        })
        .join(", ");
      toast({
        title: "Alerta",
        description: `Essas ferramentas já foram lançadas hoje e não podem repetir: ${txt}`,
        variant: "destructive",
      });
      return;
    }

    const newRecords: RomaneioRecord[] = validLines.map((l, idx) => ({
      id: crypto.randomUUID(),
      date: batchDate,
      toolCode: l.toolCode.toUpperCase(),
      sequence: l.sequence || "1",
      cleaning: l.cleaning,
      stock: l.stock,
      box: l.box,
      timestamp: now + idx,
      imageName: l.imageName || undefined,
      imageUrl: l.imageFile ? URL.createObjectURL(l.imageFile) : undefined,
    }));

    setRecords((prev) => [...newRecords, ...prev]);
    toast({ title: "Sucesso", description: `Registradas ${newRecords.length} linha(s) no romaneio` });
    setFocusToolNext(true);
    clearBatch();
  };

  const handleDeleteRecord = (id: string) => {
    setRecords(records.filter((r) => r.id !== id));
  };

  const buildCsv = (rows: RomaneioRecord[]) => {
    const headers = ["Data", "Ferramenta", "Sequência", "Destino", "Box", "Imagem"];
    const lines = rows.map((r) => [
      r.date,
      formatToolExternal(r.toolCode, r.sequence),
      r.sequence,
      r.cleaning ? "Limpeza" : r.stock ? "Estoque" : "",
      r.box ?? "",
      r.imageName ?? "",
    ].map((v) => `"${String(v ?? '').replace(/\"/g, '""')}"`).join(','));
    return [headers.join(','), ...lines].join("\n");
  };

  const downloadCsv = (name: string, csv: string) => {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = (name: string, rows: RomaneioRecord[]) => {
    // Monta AOA (array de arrays) com cabeçalho
    const aoa: any[][] = [
      ["Data", "Ferramenta", "Sequência", "Destino", "Box", "Imagem"],
    ];
    for (const r of rows) {
      const d = r.date ? new Date(r.date) : null;
      aoa.push([
        d && !isNaN(d.getTime()) ? d : r.date,
        formatToolExternal(r.toolCode, r.sequence),
        r.sequence,
        r.cleaning ? "Limpeza" : r.stock ? "Estoque" : "",
        r.box ?? "",
        r.imageName ?? "",
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    // Larguras de coluna
    ws["!cols"] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 28 },
    ];
    // Formato de data
    for (let r = 1; r < aoa.length; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: 0 });
      const cell = (ws as any)[cellRef];
      if (cell && (cell.t === 'd' || cell.v instanceof Date)) {
        cell.z = "dd/mm/yyyy";
      }
    }
    // Autofiltro
    const lastCol = XLSX.utils.encode_col(aoa[0].length - 1);
    const lastRow = aoa.length;
    (ws as any)['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` };

    const wb = XLSX.utils.book_new();
    const sheetName = name.replace(/\.xlsx$/i, "");
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.endsWith('.xlsx') ? name : `${name}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFinalize = () => {
    if (records.length === 0) return;
    setShowSummary(true);
  };

  const saveCleaningRecords = async (rows: RomaneioRecord[]) => {
    if (!rows || rows.length === 0) return { ok: true } as const;
    const payload = rows.map((r) => ({
      ferramenta: formatToolExternal(r.toolCode, r.sequence),
      sequencia: r.sequence,
      data_saida: r.date,
      data_retorno: null as string | null,
      nf_saida: null as string | null,
      nf_retorno: null as string | null,
      nitretacao: false,
      observacoes: null as string | null,
      diametro_mm: (() => {
        const raw = diametroMap[`${r.toolCode.toUpperCase()}|${r.sequence}`];
        const n = parseVdNitretNumber(raw);
        return n == null ? null : n;
      })(),
    }));
    const { error } = await supabase.from("cleaning_orders").insert(payload);
    if (error) {
      console.error("Falha ao registrar itens de limpeza:", error);
      return { ok: false as const, error };
    }
    return { ok: true as const };
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-2 md:p-4 space-y-4">
      {/* Seção de Entrada - Card Principal */}
      <Card className="border-2 border-primary/20 shadow-lg">
        <CardContent className="p-4 md:p-6">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-6">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg md:text-xl font-bold">Romaneio (Lote)</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="text-xs md:text-sm font-semibold text-muted-foreground block mb-2">
                  📅 Data do Romaneio
                </label>
                <Input
                  type="date"
                  value={batchDate}
                  onChange={(e) => setBatchDate(e.target.value)}
                  className="h-11 md:h-10 text-sm"
                />
              </div>
              <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 md:h-10 w-full sm:w-auto"
                  onClick={clearBatch}
                >
                  Limpar
                </Button>
                <Button
                  type="button"
                  className="h-11 md:h-10 w-full sm:w-auto"
                  onClick={addLine}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Linha
                </Button>
              </div>
            </div>

            <div className="space-y-3 md:space-y-2">
              <div className="hidden md:grid md:grid-cols-12 gap-3 px-1 text-xs font-semibold text-muted-foreground">
                <div className="col-span-5">Ferramenta</div>
                <div className="col-span-1">Imagem</div>
                <div className="col-span-3">Destino</div>
                <div className="col-span-3">Box</div>
              </div>
              {lines.map((line, idx) => {
                const search = line.toolSearch.trim().toUpperCase();
                const filteredTools = search
                  ? activeTools.filter((t) => t.code.toUpperCase().includes(search))
                  : activeTools;

                const flatOptions = filteredTools.flatMap((tool) => {
                  const seqs = tool.sequences && tool.sequences.length > 0 ? tool.sequences : ["1"];
                  return seqs.map((seq) => ({ code: tool.code, seq }));
                });

                return (
                  <div key={line.id} className="border rounded-lg p-3 md:p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs text-muted-foreground font-semibold md:hidden">Linha {idx + 1}</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-2 md:mt-0">
                      <div className="md:col-span-5 relative">
                        <label className="text-xs md:text-sm font-semibold text-muted-foreground block mb-2 md:sr-only">
                          🔧 Ferramenta
                        </label>
                        <Input
                          type="text"
                          placeholder="Digitar código..."
                          ref={idx === 0 ? toolInputRef : undefined}
                          value={line.toolSearch}
                          onChange={(e) =>
                            updateLine(line.id, {
                              toolSearch: e.target.value.toUpperCase(),
                              toolCode: "",
                              sequence: "",
                              dropdownOpen: true,
                              highlightedIndex: 0,
                            })
                          }
                          onFocus={() => updateLine(line.id, { dropdownOpen: true, highlightedIndex: 0 })}
                          onKeyDown={(e) => {
                            if (!line.dropdownOpen) return;
                            if (flatOptions.length === 0) return;

                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              const nextIndex = Math.min(line.highlightedIndex + 1, flatOptions.length - 1);
                              updateLine(line.id, { highlightedIndex: nextIndex });
                              window.requestAnimationFrame(() => {
                                const el = document.getElementById(`opt-${line.id}-${nextIndex}`);
                                el?.scrollIntoView({ block: "nearest" });
                              });
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              const nextIndex = Math.max(line.highlightedIndex - 1, 0);
                              updateLine(line.id, { highlightedIndex: nextIndex });
                              window.requestAnimationFrame(() => {
                                const el = document.getElementById(`opt-${line.id}-${nextIndex}`);
                                el?.scrollIntoView({ block: "nearest" });
                              });
                            }
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const opt = flatOptions[line.highlightedIndex];
                              if (opt) handleSelectToolSeq(line.id, opt.code, opt.seq);
                            }
                          }}
                          onBlur={() => {
                            const typed = line.toolSearch;
                            window.setTimeout(() => {
                              setLines((prev) =>
                                prev.map((l) => {
                                  if (l.id !== line.id) return l;
                                  if (l.toolCode) return { ...l, dropdownOpen: false };
                                  const term = typed.trim().toUpperCase();
                                  if (!term) return { ...l, dropdownOpen: false };
                                  const match = activeTools.find((t) => t.code.toUpperCase() === term);
                                  if (!match) return { ...l, dropdownOpen: false };
                                  const derivedSeq = deriveSequenceFromCode(match.code) || match.sequences[0] || "1";
                                  return {
                                    ...l,
                                    toolCode: match.code.toUpperCase(),
                                    toolSearch: match.code.toUpperCase(),
                                    sequence: derivedSeq,
                                    dropdownOpen: false,
                                  };
                                })
                              );
                            }, 120);
                          }}
                          className={`h-11 md:h-10 text-sm ${line.sequence ? 'pr-16' : ''}`}
                        />
                        {line.sequence && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                            / {line.sequence}
                          </span>
                        )}
                        {line.dropdownOpen && filteredTools.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 rounded-lg shadow-xl z-50 max-h-44 overflow-y-auto">
                            {filteredTools.flatMap((tool) => {
                              const seqs = tool.sequences && tool.sequences.length > 0 ? tool.sequences : ["1"];
                              return seqs.map((seq) => (
                                <button
                                  key={`${tool.code}__${seq}`}
                                  id={`opt-${line.id}-${flatOptions.findIndex((o) => o.code === tool.code && o.seq === seq)}`}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors border-b last:border-b-0 ${
                                    flatOptions.findIndex((o) => o.code === tool.code && o.seq === seq) === line.highlightedIndex
                                      ? "bg-primary/10"
                                      : ""
                                  }`}
                                  onClick={() => handleSelectToolSeq(line.id, tool.code, seq)}
                                  onMouseEnter={() => {
                                    const i = flatOptions.findIndex((o) => o.code === tool.code && o.seq === seq);
                                    if (i >= 0) updateLine(line.id, { highlightedIndex: i });
                                  }}
                                >
                                  <span className="font-semibold">{tool.code}</span>
                                  <span className="text-xs text-muted-foreground ml-2">/ {seq}</span>
                                </button>
                              ));
                            })}
                          </div>
                        )}
                      </div>

                      <div className="md:col-span-1">
                        <label className="text-xs md:text-sm font-semibold text-muted-foreground block mb-2 md:sr-only">
                          🖼️ Imagem
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id={`img-${line.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleImageChange(line.id, e.target.files?.[0] ?? null)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-11 md:h-10 px-2"
                            onClick={() => {
                              const el = document.getElementById(`img-${line.id}`) as HTMLInputElement | null;
                              el?.click();
                            }}
                            title={line.imageName ? `Imagem: ${line.imageName}` : "Anexar imagem"}
                            aria-label="Anexar imagem"
                          >
                            <ImageDown className="h-4 w-4" />
                          </Button>
                          {line.imageFile && (
                            <img
                              src={URL.createObjectURL(line.imageFile)}
                              alt={line.imageName || "Pré-visualização"}
                              className="h-9 w-9 rounded object-cover border"
                            />
                          )}
                        </div>
                      </div>

                      <div className="md:col-span-3">
                        <label className="text-xs md:text-sm font-semibold text-muted-foreground block mb-2 md:sr-only">
                          🎯 Destino
                        </label>
                        <div className="grid grid-cols-2 gap-2 md:gap-1">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              const next = !line.cleaning;
                              updateLine(line.id, { cleaning: next, stock: next ? false : line.stock, box: next ? "" : line.box });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                const next = !line.cleaning;
                                updateLine(line.id, { cleaning: next, stock: next ? false : line.stock, box: next ? "" : line.box });
                              }
                            }}
                            className={`p-2 rounded-lg border-2 transition-all cursor-pointer select-none ${
                              line.cleaning
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 bg-white hover:border-blue-300"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox checked={line.cleaning} className="h-5 w-5 md:h-4 md:w-4 pointer-events-none" tabIndex={-1} />
                              <span className="font-semibold text-sm md:text-xs">Limpeza</span>
                            </div>
                          </div>

                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              const next = !line.stock;
                              updateLine(line.id, { stock: next, cleaning: next ? false : line.cleaning, box: next ? line.box : "" });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                const next = !line.stock;
                                updateLine(line.id, { stock: next, cleaning: next ? false : line.cleaning, box: next ? line.box : "" });
                              }
                            }}
                            className={`p-2 rounded-lg border-2 transition-all cursor-pointer select-none ${
                              line.stock
                                ? "border-green-500 bg-green-50"
                                : "border-gray-200 bg-white hover:border-green-300"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox checked={line.stock} className="h-5 w-5 md:h-4 md:w-4 pointer-events-none" tabIndex={-1} />
                              <span className="font-semibold text-sm md:text-xs">Estoque</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-3">
                        <label className="text-xs md:text-sm font-semibold text-muted-foreground block mb-2 md:sr-only">
                          📦 Box (Localização)
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            placeholder="Ex: A1, B2..."
                            value={line.box}
                            onChange={(e) => updateLine(line.id, { box: e.target.value })}
                            disabled={!line.stock}
                            className="h-11 md:h-10 text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 md:h-10 px-2 text-red-600 hover:text-red-700"
                            onClick={() => removeLine(line.id)}
                            title="Remover linha"
                            aria-label="Remover linha"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col md:flex-row gap-2">
              <Button
                type="button"
                onClick={handleRegisterBatch}
                className="w-full md:flex-1 h-12 md:h-12 text-base font-semibold bg-primary hover:bg-primary/90 transition-all"
              >
                <Plus className="h-5 w-5 mr-2" />
                Registrar Lote
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onFinalize}
                disabled={records.length === 0}
                className="w-full md:w-56 h-12 md:h-12 text-base font-semibold"
                title={records.length === 0 ? "Adicione registros antes de finalizar" : "Finalizar Romaneio"}
              >
                Finalizar Romaneio
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histórico - Cards de Registros */}
      {records.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            Registros do Dia ({records.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {records.map((record) => (
              <Card key={record.id} className="border-l-4 border-l-primary hover:shadow-md transition-shadow">
                <CardContent className="p-3 md:p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm md:text-base">{record.toolCode}{record.sequence ? ` / ${record.sequence}` : ''}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtISODate(record.date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {record.imageUrl && (
                          <img
                            src={record.imageUrl}
                            alt={record.imageName || "Imagem"}
                            className="h-12 w-12 rounded object-cover border"
                          />
                        )}
                        <button
                          onClick={() => handleDeleteRecord(record.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 text-xs">
                      {record.box && (
                        <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
                          Box: {record.box}
                        </span>
                      )}
                      {/* Vd Nitret badge e alerta de Nitretação quando negativo */}
                      {(() => {
                        const raw = vdNitretMap[`${record.toolCode.toUpperCase()}|${record.sequence}`];
                        if (!raw) return null;
                        const n = parseVdNitretNumber(raw);
                        const isNeg = n != null && n < 0;
                        const vdFmt = n == null
                          ? raw
                          : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
                        return (
                          <>
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${isNeg ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              Vd Nitret: {vdFmt}
                            </span>
                            {isNeg && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-600 text-white">
                                Nitretação
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {record.imageName && (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-1 rounded">
                          <ImageDown className="h-3.5 w-3.5" />
                          {record.imageName}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {record.cleaning && (
                        <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                          🧹 Limpeza
                        </span>
                      )}
                      {record.stock && (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                          📦 Estoque
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {showSummary && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl shadow-xl">
            <div className="p-4 border-b">
              <h4 className="text-lg font-semibold">Resumo do Romaneio</h4>
              <p className="text-xs text-muted-foreground">Data: {fmtISODate(batchDate)}</p>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-md p-3">
                <h5 className="font-semibold mb-2">Para Limpeza</h5>
                {records.filter(r => r.cleaning).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item</p>
                ) : (
                  <ul className="space-y-1 text-sm max-h-56 overflow-auto">
                    {records.filter(r => r.cleaning).map((r) => (
                      <li key={r.id} className="flex justify-between gap-2">
                        <span className="truncate">{r.toolCode}{r.sequence ? ` / ${r.sequence}` : ''}</span>
                        <span className="text-muted-foreground">{fmtISODate(r.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const limpeza = records.filter(r => r.cleaning);
                      downloadExcel(`romaneio_limpeza_${batchDate}.xlsx`, limpeza);
                    }}
                    disabled={records.filter(r => r.cleaning).length === 0}
                  >
                    Baixar Excel (Limpeza)
                  </Button>
                </div>
              </div>
              <div className="border rounded-md p-3">
                <h5 className="font-semibold mb-2">Para Estoque</h5>
                {records.filter(r => r.stock).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item</p>
                ) : (
                  <ul className="space-y-1 text-sm max-h-56 overflow-auto">
                    {records.filter(r => r.stock).map((r) => (
                      <li key={r.id} className="flex justify-between gap-2">
                        <span className="truncate">{r.toolCode}{r.sequence ? ` / ${r.sequence}` : ''}{r.box ? ` — Box ${r.box}` : ''}</span>
                        <span className="text-muted-foreground">{fmtISODate(r.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const estoque = records.filter(r => r.stock);
                      downloadExcel(`registro_estoque_${batchDate}.xlsx`, estoque);
                    }}
                    disabled={records.filter(r => r.stock).length === 0}
                  >
                    Baixar Excel (Estoque)
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowSummary(false)}>Fechar</Button>
              <Button
                type="button"
                onClick={async () => {
                  const limpeza = records.filter(r => r.cleaning);
                  const { ok } = await saveCleaningRecords(limpeza);
                  if (!ok) {
                    toast({ title: "Erro ao registrar limpeza", description: "Não foi possível salvar as ferramentas em limpeza", variant: "destructive" });
                    return;
                  }
                  setRecords([]);
                  setShowSummary(false);
                  toast({ title: "Romaneio finalizado", description: "Registros salvos em Limpeza e lista limpa" });
                }}
              >
                Concluir e Limpar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Estado Vazio */}
      {records.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum registro ainda. Comece adicionando uma ferramenta!</p>
        </div>
      )}
    </div>
  );
};
