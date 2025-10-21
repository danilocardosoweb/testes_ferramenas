import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { EmailTemplate, deleteEmailTemplate, listEmailTemplates, upsertEmailTemplate } from "@/services/templates";

const DEFAULT_KEYS = [
  { key: "aprovadas", name: "Aprovadas" },
  { key: "reprovado", name: "Reprovado" },
  { key: "limpeza", name: "Limpeza" },
  { key: "correcao_externa", name: "Correção Externa" },
  { key: "recebidas", name: "Recebidas" },
];

export function EmailTemplatesSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(DEFAULT_KEYS[0].key);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const selectedMeta = useMemo(() => DEFAULT_KEYS.find(k => k.key === selectedKey)!, [selectedKey]);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    const t = templates.find(t => t.key === selectedKey);
    setSubject(t?.subject || "");
    setBody(t?.body || "");
  }, [selectedKey, templates]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await listEmailTemplates();
      setTemplates(data);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao carregar modelos", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await upsertEmailTemplate({ key: selectedKey, name: selectedMeta.name, subject, body });
      await loadTemplates();
      toast({ title: "Modelo salvo", description: `${selectedMeta.name} atualizado com sucesso.` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao salvar", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setSubject("");
    setBody("");
  };

  const handleDelete = async () => {
    try {
      if (!confirm(`Remover o modelo "${selectedMeta.name}"?`)) return;
      setLoading(true);
      await deleteEmailTemplate(selectedKey);
      await loadTemplates();
      toast({ title: "Modelo removido" });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao remover", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cadastro das Mensagens</CardTitle>
        <CardDescription>Escreva e edite os textos enviados por e-mail.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-sm">Categoria</Label>
            <Select value={selectedKey} onValueChange={setSelectedKey}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_KEYS.map(k => (
                  <SelectItem key={k.key} value={k.key}>{k.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <Label className="text-sm">Assunto</Label>
            <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Assunto do e-mail" />
          </div>
        </div>

        <div>
          <Label className="text-sm">Corpo do E-mail</Label>
          <Textarea className="mt-1 h-56" value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Mensagem para ${selectedMeta.name}`} />
          <p className="text-xs text-muted-foreground mt-1">Dica: use placeholders como {`{codigo}`} , {`{fornecedor}`} , {`{data}`}.</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClear} disabled={loading}>Limpar</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>Remover</Button>
          <Button onClick={handleSave} disabled={loading}>Salvar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default EmailTemplatesSettings;


