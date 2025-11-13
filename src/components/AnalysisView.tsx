import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnalysisFerramentasView } from "@/components/analysis/AnalysisFerramentasView";
import { AnalysisCarteiraView } from "@/components/analysis/AnalysisCarteiraView";
import { AnalysisProducaoView } from "@/components/analysis/AnalysisProducaoView";
import { AnalysisVidaView } from "@/components/analysis/AnalysisVidaView";
import { AnalysisNecessidadesView } from "@/components/analysis/AnalysisNecessidadesView";
import { useState } from "react";

interface AnalysisViewProps {}

export function AnalysisView(_: AnalysisViewProps) {
  const [tab, setTab] = useState("carteira");
  const [matrizFilterBridge, setMatrizFilterBridge] = useState<string>("");
  return (
    <div className="h-full">
      <Tabs value={tab} onValueChange={setTab} className="h-full">
        <TabsList className="flex w-full items-center gap-2 overflow-x-auto pr-2 flex-nowrap">
          <TabsTrigger className="h-8 shrink-0 whitespace-nowrap px-2 text-xs" value="carteira" title="Carteira">Carteira</TabsTrigger>
          <TabsTrigger className="h-8 shrink-0 whitespace-nowrap px-2 text-xs" value="producao" title="Produção">Produção</TabsTrigger>
          <TabsTrigger className="h-8 shrink-0 whitespace-nowrap px-2 text-xs" value="ferramentas" title="Ferramentas">Ferramentas</TabsTrigger>
          <TabsTrigger className="h-8 shrink-0 whitespace-nowrap px-2 text-xs" value="vida" title="Espectativa de Vida">Vida</TabsTrigger>
          <TabsTrigger className="h-8 shrink-0 whitespace-nowrap px-2 text-xs" value="necessidades" title="Relatório de Necessidades">Necessidades</TabsTrigger>
        </TabsList>

        <TabsContent value="carteira" className="mt-6">
          <AnalysisCarteiraView />
        </TabsContent>
        <TabsContent value="producao" className="mt-6">
          <AnalysisProducaoView
            presetMatriz={matrizFilterBridge}
            onSelectMatriz={(m) => {
              setMatrizFilterBridge(m);
              setTab("ferramentas");
            }}
          />
        </TabsContent>
        <TabsContent value="ferramentas" className="mt-6">
          <AnalysisFerramentasView
            presetMatriz={matrizFilterBridge}
            onSelectMatriz={(m) => {
              setMatrizFilterBridge(m);
              setTab("producao");
            }}
          />
        </TabsContent>
        <TabsContent value="vida" className="mt-6">
          <AnalysisVidaView
            onOpenFerramentas={(m) => {
              setMatrizFilterBridge(m);
              setTab("ferramentas");
            }}
          />
        </TabsContent>
        <TabsContent value="necessidades" className="mt-6">
          <AnalysisNecessidadesView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
