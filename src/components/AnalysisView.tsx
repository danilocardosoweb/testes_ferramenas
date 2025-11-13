import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnalysisFerramentasView } from "@/components/analysis/AnalysisFerramentasView";
import { AnalysisCarteiraView } from "@/components/analysis/AnalysisCarteiraView";
import { AnalysisProducaoView } from "@/components/analysis/AnalysisProducaoView";
import { useState } from "react";

interface AnalysisViewProps {}

export function AnalysisView(_: AnalysisViewProps) {
  const [tab, setTab] = useState("carteira");
  const [matrizFilterBridge, setMatrizFilterBridge] = useState<string>("");
  return (
    <div className="h-full">
      <Tabs value={tab} onValueChange={setTab} className="h-full">
        <TabsList className="grid max-w-md grid-cols-3">
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
          <TabsTrigger value="producao">Produção</TabsTrigger>
          <TabsTrigger value="ferramentas">Ferramentas</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
