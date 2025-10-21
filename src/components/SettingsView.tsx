import { useState, useEffect } from "react";
import { User } from "@/types";
import { listUsers, createUser, updateUser, deleteUser, changePassword } from "@/services/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Edit, Trash2, Key, Users, Shield, Mails } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailTemplatesSettings } from "./EmailTemplatesSettings";
import { EmailGroupsSettings } from "./EmailGroupsSettings";

interface SettingsViewProps {
  currentUser: User;
}

export function SettingsView({ currentUser }: SettingsViewProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewUser, setShowNewUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [changingPassword, setChangingPassword] = useState<User | null>(null);
  const { toast } = useToast();

  // Form states
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await listUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('Erro ao carregar usuários:', err);
      toast({ title: "Erro ao carregar usuários", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formEmail || !formName || !formPassword) {
      toast({ title: "Erro", description: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      await createUser(formEmail, formName, formPassword, formRole);
      toast({ title: "Usuário criado", description: `${formName} foi adicionado ao sistema` });
      setShowNewUser(false);
      setFormEmail("");
      setFormName("");
      setFormPassword("");
      setFormRole('viewer');
      await loadUsers();
    } catch (err: any) {
      console.error('Erro ao criar usuário:', err);
      toast({ title: "Erro ao criar usuário", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setLoading(true);
      await updateUser(editingUser.id, {
        name: formName,
        email: formEmail,
        role: formRole,
      });
      toast({ title: "Usuário atualizado", description: `${formName} foi atualizado` });
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      console.error('Erro ao atualizar usuário:', err);
      toast({ title: "Erro ao atualizar usuário", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser.id) {
      toast({ title: "Erro", description: "Você não pode excluir sua própria conta", variant: "destructive" });
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o usuário ${user.name}?`)) return;

    try {
      setLoading(true);
      await deleteUser(user.id);
      toast({ title: "Usuário excluído", description: `${user.name} foi removido do sistema` });
      await loadUsers();
    } catch (err: any) {
      console.error('Erro ao excluir usuário:', err);
      toast({ title: "Erro ao excluir usuário", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changingPassword) return;

    if (newPassword !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem", variant: "destructive" });
      return;
    }

    if (newPassword.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      await changePassword(changingPassword.id, newPassword);
      toast({ title: "Senha alterada", description: "A senha foi atualizada com sucesso" });
      setChangingPassword(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error('Erro ao alterar senha:', err);
      toast({ title: "Erro ao alterar senha", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormName(user.name);
    setFormRole(user.role);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-600">Admin</Badge>;
      case 'editor':
        return <Badge className="bg-blue-600">Editor</Badge>;
      default:
        return <Badge variant="secondary">Visualizador</Badge>;
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Acesso total ao sistema';
      case 'editor':
        return 'Pode editar e criar dados';
      default:
        return 'Apenas visualização';
    }
  };

  if (currentUser.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              Acesso Negado
            </CardTitle>
            <CardDescription>
              Apenas administradores podem acessar as configurações do sistema.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            Configurações do Sistema
          </h1>
          <p className="text-muted-foreground mt-1">Administração</p>
        </div>
        <Button onClick={() => setShowNewUser(true)} disabled={loading}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="users" className="h-full flex flex-col">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="users">Usuários & Permissões</TabsTrigger>
            <TabsTrigger value="emails">Cadastro das Mensagens</TabsTrigger>
            <TabsTrigger value="groups">Grupos de E-mail</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="grid gap-4">
                {users.map((user) => (
                  <Card key={user.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div>
                            <CardTitle className="text-lg">{user.name}</CardTitle>
                            <CardDescription>{user.email}</CardDescription>
                          </div>
                          {getRoleBadge(user.role)}
                          {user.id === currentUser.id && (
                            <Badge variant="outline" className="border-green-500 text-green-700">Você</Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(user)}
                            disabled={loading}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setChangingPassword(user);
                              setNewPassword("");
                              setConfirmPassword("");
                            }}
                            disabled={loading}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteUser(user)}
                            disabled={loading || user.id === currentUser.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{getRoleDescription(user.role)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="emails" className="mt-4 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto">
              <EmailTemplatesSettings />
            </div>
          </TabsContent>

          <TabsContent value="groups" className="mt-4 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto">
              <EmailGroupsSettings />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog: Novo Usuário */}
      <Dialog open={showNewUser} onOpenChange={setShowNewUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Adicionar um novo usuário ao sistema</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Nome</Label>
              <Input
                id="new-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome completo"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@exemplo.com"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Senha</Label>
              <Input
                id="new-password"
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Permissão</Label>
              <Select value={formRole} onValueChange={(v: any) => setFormRole(v)} disabled={loading}>
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Visualizador (apenas leitura)</SelectItem>
                  <SelectItem value="editor">Editor (pode editar)</SelectItem>
                  <SelectItem value="admin">Admin (acesso total)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={loading}>
                Criar Usuário
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowNewUser(false)} disabled={loading}>
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Usuário */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>Atualizar informações do usuário</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Permissão</Label>
              <Select value={formRole} onValueChange={(v: any) => setFormRole(v)} disabled={loading}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Visualizador</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={loading}>
                Salvar Alterações
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)} disabled={loading}>
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Alterar Senha */}
      <Dialog open={!!changingPassword} onOpenChange={(open) => !open && setChangingPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>
              Definir nova senha para {changingPassword?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pwd">Nova Senha</Label>
              <Input
                id="new-pwd"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pwd">Confirmar Senha</Label>
              <Input
                id="confirm-pwd"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Digite novamente"
                disabled={loading}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={loading}>
                Alterar Senha
              </Button>
              <Button type="button" variant="outline" onClick={() => setChangingPassword(null)} disabled={loading}>
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
