import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { EmailGroup, NotificationGroupMapping, listEmailGroups, createEmailGroup, updateEmailGroup, deleteEmailGroup, getNotificationGroupMappings, updateNotificationGroupMapping } from "@/services/emailGroups";
import { Plus, Edit, Trash2, Users, Mail } from "lucide-react";

const NOTIFICATION_CATEGORIES = [
  { key: "aprovadas", name: "Aprovadas" },
  { key: "reprovado", name: "Reprovado" },
  { key: "limpeza", name: "Limpeza" },
  { key: "correcao_externa", name: "Correção Externa" },
  { key: "recebidas", name: "Recebidas" },
];

export function EmailGroupsSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<EmailGroup[]>([]);
  const [mappings, setMappings] = useState<NotificationGroupMapping[]>([]);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<EmailGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupEmails, setGroupEmails] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [groupsData, mappingsData] = await Promise.all([
        listEmailGroups(),
        getNotificationGroupMappings()
      ]);
      setGroups(groupsData);
      setMappings(mappingsData);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao carregar dados", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast({ title: "Nome obrigatório", description: "Informe o nome do grupo", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const emails = groupEmails.split('\n').map(e => e.trim()).filter(e => e);
      await createEmailGroup(groupName.trim(), emails);
      await loadData();
      setShowGroupDialog(false);
      setGroupName("");
      setGroupEmails("");
      toast({ title: "Grupo criado", description: `Grupo "${groupName}" criado com sucesso` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao criar grupo", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !groupName.trim()) return;

    try {
      setLoading(true);
      const emails = groupEmails.split('\n').map(e => e.trim()).filter(e => e);
      await updateEmailGroup(editingGroup.id, groupName.trim(), emails);
      await loadData();
      setShowGroupDialog(false);
      setEditingGroup(null);
      setGroupName("");
      setGroupEmails("");
      toast({ title: "Grupo atualizado", description: `Grupo "${groupName}" atualizado com sucesso` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao atualizar grupo", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`Tem certeza que deseja deletar o grupo "${groupName}"?`)) return;

    try {
      setLoading(true);
      await deleteEmailGroup(groupId);
      await loadData();
      toast({ title: "Grupo deletado", description: `Grupo "${groupName}" removido com sucesso` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao deletar grupo", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEditGroup = (group: EmailGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupEmails(group.emails.join('\n'));
    setShowGroupDialog(true);
  };

  const handleNewGroup = () => {
    setEditingGroup(null);
    setGroupName("");
    setGroupEmails("");
    setShowGroupDialog(true);
  };

  const handleMappingChange = async (category: string, groupId: string | null) => {
    try {
      await updateNotificationGroupMapping(category, groupId);
      await loadData();
      const categoryName = NOTIFICATION_CATEGORIES.find(c => c.key === category)?.name || category;
      const groupName = groupId ? groups.find(g => g.id === groupId)?.name : "Nenhum";
      toast({ title: "Configuração atualizada", description: `${categoryName} agora envia para: ${groupName}` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao atualizar configuração", description: String(err?.message || err), variant: "destructive" });
    }
  };

  const getGroupForCategory = (category: string) => {
    const mapping = mappings.find(m => m.category === category);
    return mapping?.group_id || null;
  };

  return (
    <div className="space-y-4">
      {/* Grupos de E-mail */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Grupos de E-mail
              </CardTitle>
              <CardDescription>Crie grupos de destinatários para organizar os envios</CardDescription>
            </div>
            <Button onClick={handleNewGroup} disabled={loading} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Grupo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {groups.map((group) => (
              <Card key={group.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{group.name}</h3>
                      <Badge variant="secondary" className="text-xs">{group.emails.length} e-mail(s)</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {group.emails.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {group.emails.slice(0, 2).map((email, i) => (
                            <span key={i} className="bg-slate-100 px-2 py-1 rounded text-xs truncate max-w-32">{email}</span>
                          ))}
                          {group.emails.length > 2 && (
                            <span className="bg-slate-100 px-2 py-1 rounded text-xs">+{group.emails.length - 2} mais</span>
                          )}
                        </div>
                      ) : (
                        <span>Nenhum e-mail cadastrado</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditGroup(group)}
                      disabled={loading}
                      className="h-7 w-7 p-0"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteGroup(group.id, group.name)}
                      disabled={loading}
                      className="h-7 w-7 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {groups.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum grupo de e-mail criado</p>
                <p className="text-xs">Clique em "Novo Grupo" para começar</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuração de Envios */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            Configuração de Envios
          </CardTitle>
          <CardDescription>Configure qual grupo recebe cada tipo de notificação</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <div key={category.key} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50">
                <div className="flex-1 min-w-0">
                  <Label className="font-semibold text-sm">{category.name}</Label>
                  <p className="text-xs text-muted-foreground">Notificações de {category.name.toLowerCase()}</p>
                </div>
                <div className="w-48 ml-3">
                  <Select
                    value={getGroupForCategory(category.key) || "none"}
                    onValueChange={(value) => handleMappingChange(category.key, value === "none" ? null : value)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione um grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não enviar</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name} ({group.emails.length} e-mails)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog para Criar/Editar Grupo */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Editar Grupo" : "Novo Grupo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="group-name">Nome do Grupo</Label>
              <Input
                id="group-name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex: Gerência, Produção, Qualidade"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="group-emails">E-mails (um por linha)</Label>
              <Textarea
                id="group-emails"
                value={groupEmails}
                onChange={(e) => setGroupEmails(e.target.value)}
                placeholder="gerencia@empresa.com&#10;producao@empresa.com&#10;qualidade@empresa.com"
                className="mt-1 h-32"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Digite um e-mail por linha
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowGroupDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={editingGroup ? handleUpdateGroup : handleCreateGroup} disabled={loading}>
                {editingGroup ? "Atualizar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EmailGroupsSettings;
