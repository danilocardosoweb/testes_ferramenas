import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { login } from "@/services/auth";
import { AuthSession } from "@/types";
import { LogIn } from "lucide-react";
import LogoDaniloBranco from "../../Imagens/LogoDaniloBranco.png";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoginSuccess: (session: AuthSession) => void;
}

export function LoginDialog({ open, onOpenChange, onLoginSuccess }: LoginDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Limpa os campos sempre que o diálogo é aberto
  useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
    }
  }, [open]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({ title: "Erro", description: "Preencha email e senha", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const session = await login(email, password);
      toast({ title: "Login realizado", description: `Bem-vindo, ${session.user.name}!` });
      onLoginSuccess(session);
      onOpenChange(false);
      setEmail("");
      setPassword("");
    } catch (err: any) {
      console.error('Erro ao fazer login:', err);
      toast({ title: "Erro ao fazer login", description: String(err?.message || err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <img
            src={LogoDaniloBranco}
            alt="Logo Danilo Cardoso"
            className="h-24 w-auto mx-auto mb-2"
          />
          <DialogTitle className="flex items-center justify-center gap-2">
            <LogIn className="h-5 w-5" />
            Controle de Testes de Ferramentas
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Faça login para acessar o sistema</p>
        </DialogHeader>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
