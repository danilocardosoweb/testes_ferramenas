import { useEffect, useState } from 'react';
import { Matrix } from '@/types';
import { EnhancedDashboard } from '@/components/EnhancedDashboard';
import { 
  listMatrices as sbListMatrices,
  listFolders as sbListFolders,
} from '@/services/db';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export function DashboardPage() {
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setIsLoading(true);
      // Carrega as pastas primeiro para garantir que existam
      await sbListFolders();
      // Depois carrega as matrizes
      const matricesData = await sbListMatrices();
      setMatrices(matricesData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados do dashboard.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    loadData();
  };

  const handleMatrixSelect = (matrix: Matrix) => {
    // Aqui você pode navegar para a visualização detalhada da matriz
    console.log('Matriz selecionada:', matrix);
    // Exemplo de navegação:
    // navigate(`/matriz/${matrix.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Carregando dados do dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <EnhancedDashboard 
        matrices={matrices} 
        onRefresh={handleRefresh}
        onMatrixSelect={handleMatrixSelect}
      />
    </div>
  );
}

export default DashboardPage;
