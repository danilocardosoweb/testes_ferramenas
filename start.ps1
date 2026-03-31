# Script para iniciar o app e todos os servidores necessários
# Uso: .\start.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Iniciando Testes de Ferramentas App" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se Node.js está instalado
Write-Host "Verificando Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Node.js $nodeVersion encontrado" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js não encontrado. Por favor, instale Node.js." -ForegroundColor Red
    exit 1
}

# Verificar se npm está instalado
Write-Host "Verificando npm..." -ForegroundColor Yellow
$npmVersion = npm --version
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ npm $npmVersion encontrado" -ForegroundColor Green
} else {
    Write-Host "✗ npm não encontrado. Por favor, instale npm." -ForegroundColor Red
    exit 1
}

# Instalar dependências se necessário
if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "Instalando dependências..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Erro ao instalar dependências" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Dependências instaladas com sucesso" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Iniciando servidores..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Iniciar Vite dev server
Write-Host "Iniciando servidor Vite..." -ForegroundColor Yellow
Write-Host "Aguarde alguns segundos..." -ForegroundColor Gray
Write-Host ""

# Executar o servidor Vite
npm run dev

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Servidor finalizado" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
