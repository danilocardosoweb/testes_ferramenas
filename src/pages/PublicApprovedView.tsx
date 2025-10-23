import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Download, Calendar as CalendarIcon, Filter, ChevronDown, ChevronUp, File, Image } from "lucide-react";
import { ptBR } from 'date-fns/locale';
import { toast } from "sonner";
import { usePublicApproved, PublicApprovedProvider } from "@/contexts/PublicApprovedContext";

const PublicApprovedViewContent = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    records,
    suppliers,
    filters,
    isLoading,
    isFilterOpen,
    setFilters,
    toggleFilter,
    applyFilters,
    clearFilters,
    exportToExcel,
    getPriorityLabel,
    getPriorityBadgeClass,
    formatDate,
    formatFileSize
  } = usePublicApproved();

  // Verifica se há um parâmetro de código na URL
  useEffect(() => {
    const code = searchParams.get('codigo');
    if (code) {
      setFilters({ searchTerm: code });
      applyFilters();
    }
  }, [searchParams, setFilters, applyFilters]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando matrizes aprovadas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7"/>
              <path d="M19 12H5"/>
            </svg>
            Voltar para a timeline
          </Button>
          <h1 className="text-3xl font-bold">Matrizes Aprovadas</h1>
          <p className="text-muted-foreground">
            Consulte o status de aprovação das matrizes de fabricação
          </p>
        </div>

        {/* Filtros Avançados */}
        <Card className="mb-6 overflow-hidden">
          <button 
            onClick={toggleFilter}
            className="w-full text-left p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Filter className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Filtros de Busca</h3>
                  <p className="text-sm text-muted-foreground">
                    {filters.searchTerm || filters.supplier || filters.priority 
                      ? 'Filtros ativos: ' + 
                        [
                          filters.searchTerm && 'termo de busca',
                          filters.supplier && 'fornecedor',
                          filters.priority && 'prioridade'
                        ].filter(Boolean).join(', ')
                      : 'Nenhum filtro aplicado'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(filters.searchTerm || filters.supplier || filters.priority) && (
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFilters();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Limpar filtros
                  </Button>
                )}
                <div className="p-1 rounded-full bg-muted">
                  {isFilterOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </div>
            </div>
          </button>
          
          <div className={`overflow-hidden transition-all duration-300 ${isFilterOpen ? 'max-h-96' : 'max-h-0'}`}>
            <div className="p-6 pt-0 border-t">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="search">Buscar</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Código, responsável ou fornecedor"
                      className="pl-10"
                      value={filters.searchTerm}
                      onChange={(e) => setFilters({ searchTerm: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Período de Aprovação</Label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          className="pl-10"
                          value={filters.startDate}
                          onChange={(e) => setFilters({ startDate: e.target.value })}
                        />
                      </div>
                      <span className="text-muted-foreground">até</span>
                      <div className="relative flex-1">
                        <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          className="pl-10"
                          value={filters.endDate}
                          onChange={(e) => setFilters({ endDate: e.target.value })}
                          min={filters.startDate}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Fornecedor</Label>
                    <select
                      id="supplier"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={filters.supplier}
                      onChange={(e) => setFilters({ supplier: e.target.value })}
                    >
                      <option value="">Todos os fornecedores</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier} value={supplier}>
                          {supplier}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="flex items-end gap-2">
                  <Button 
                    onClick={applyFilters} 
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    Aplicar Filtros
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={clearFilters}
                    className="flex-1"
                  >
                    Limpar tudo
                  </Button>
                </div>
                
              </div>
            </div>
          </div>
        </Card>

        {/* Resultados */}
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            Mostrando {records.length} matrizes aprovadas
            {filters.searchTerm && ` que correspondem a "${filters.searchTerm}"`}
            {filters.supplier && ` do fornecedor "${filters.supplier}"`}
            {filters.priority && ` com prioridade "${getPriorityLabel(filters.priority)}"`}
            {filters.startDate && ` a partir de ${new Date(filters.startDate).toLocaleDateString('pt-BR')}`}
            {filters.endDate && ` até ${new Date(filters.endDate).toLocaleDateString('pt-BR')}`}
          </div>

          {records.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Nenhuma matriz aprovada encontrada com os critérios informados.
                </p>
                <Button 
                  variant="ghost" 
                  className="mt-4"
                  onClick={clearFilters}
                >
                  Limpar filtros
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="relative space-y-4">
              {records.map((record, index) => {
                const zIndex = records.length - index;
                const translateY = index * 8; // Ajuste este valor para controlar o espaçamento vertical
                
                return (
                  <div 
                    key={record.id} 
                    className="relative transition-all duration-300 hover:translate-x-1 hover:-translate-y-1 hover:shadow-lg"
                    style={{
                      zIndex,
                      transform: `translateY(-${translateY}px)`,
                      marginBottom: index < records.length - 1 ? `-${Math.max(0, 24 - (index * 2))}px` : '0',
                    }}
                  >
                    <Card className="overflow-hidden border-l-4 border-primary shadow-sm hover:shadow-md transition-shadow duration-300">
                      <div className="p-6">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-medium">{record.matrix_code}</h3>
                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                              <p><span className="font-medium">Tipo de Confecção:</span> {record.manufacturing_type === 'nova' ? 'Nova' : 'Reposição'}</p>
                              <p><span className="font-medium">Tipo de Perfil:</span> {record.profile_type === 'tubular' ? 'Tubular' : 'Sólido'}</p>
                              <p><span className="font-medium">Fornecedor:</span> {record.supplier || "Não informado"}</p>
                              {record.custom_supplier && (
                                <p><span className="font-medium">Fornecedor Personalizado:</span> {record.custom_supplier}</p>
                              )}
                              {record.package_size && (
                                <p><span className="font-medium">Tamanho do Pacote:</span> {record.package_size}</p>
                              )}
                              {record.hole_count && (
                                <p><span className="font-medium">Número de Furos:</span> {record.hole_count}</p>
                              )}
                              <p><span className="font-medium">Aprovado em:</span> {record.moved_to_approved_at ? formatDate(record.moved_to_approved_at) : "Data não disponível"}</p>
                              {record.estimated_delivery_date && (
                                <p><span className="font-medium">Previsão de Entrega:</span> {formatDate(record.estimated_delivery_date)}</p>
                              )}
                              {record.volume_produced && (
                                <p><span className="font-medium">Volume Produzido:</span> {record.volume_produced}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityBadgeClass(record.priority || '')}`}>
                              {getPriorityLabel(record.priority || '')} prioridade
                            </span>
                            {record.status === 'approved' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Aprovada
                              </span>
                            )}
                            {record.test_count !== undefined && (
                              <div className="flex items-center gap-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {record.test_count} {record.test_count === 1 ? 'teste' : 'testes'}
                                </span>
                                {record.approved_at && (
                                  <span className="text-xs text-muted-foreground">
                                    aprovado em {new Date(record.approved_at).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {(record.technical_notes || record.observacoes) && (
                          <div className="mt-4 space-y-2">
                            {record.technical_notes && (
                              <div>
                                <h4 className="text-sm font-medium">Observações Técnicas:</h4>
                                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{record.technical_notes}</p>
                              </div>
                            )}
                            {record.observacoes && (
                              <div>
                                <h4 className="text-sm font-medium">Observações Adicionais:</h4>
                                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{record.observacoes}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {(record.anexos?.length > 0 || record.matrix_images?.length > 0) && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium mb-2">
                              {record.anexos?.length ? 'Documentos Anexados:' : 'Imagens da Matriz:'}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {record.anexos?.map((anexo: any) => (
                                <a
                                  key={anexo.id}
                                  href={anexo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-3 py-1 border rounded-md text-sm text-primary hover:bg-accent transition-colors"
                                >
                                  <File className="h-4 w-4 mr-1" />
                                  {anexo.nome_arquivo}
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({formatFileSize(anexo.tamanho)})
                                  </span>
                                </a>
                              ))}
                              
                              {record.matrix_images?.map((imageUrl: string, imgIndex: number) => (
                                <a
                                  key={`img-${imgIndex}`}
                                  href={imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-3 py-1 border rounded-md text-sm text-primary hover:bg-accent transition-colors"
                                >
                                  <Image className="h-4 w-4 mr-1" />
                                  Imagem {imgIndex + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Para consultar o status de uma matriz específica, utilize a barra de busca acima.</p>
          <p className="mt-1">
            Dúvidas? Entre em contato com o responsável ou envie um e-mail para suporte@empresa.com.br
          </p>
        </div>
      </div>
    </div>
  );
};

// Wrapper component que fornece o contexto
const PublicApprovedView = () => {
  return (
    <PublicApprovedProvider>
      <PublicApprovedViewContent />
    </PublicApprovedProvider>
  );
};

export default PublicApprovedView;
