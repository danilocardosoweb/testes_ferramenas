@echo off
REM Script para iniciar o app e todos os servidores necessários
REM Uso: start.bat

setlocal enabledelayedexpansion

echo.
echo ========================================
echo Iniciando Testes de Ferramentas App
echo ========================================
echo.

REM Verificar se Node.js está instalado
echo Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js não encontrado. Por favor, instale Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js %NODE_VERSION% encontrado

REM Verificar se npm está instalado
echo Verificando npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] npm não encontrado. Por favor, instale npm.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [OK] npm %NPM_VERSION% encontrado

REM Instalar dependências se necessário
if not exist "node_modules" (
    echo.
    echo Instalando dependências...
    call npm install
    if errorlevel 1 (
        echo [ERRO] Erro ao instalar dependências
        pause
        exit /b 1
    )
    echo [OK] Dependências instaladas com sucesso
)

echo.
echo ========================================
echo Iniciando servidores...
echo ========================================
echo.

echo Iniciando servidor Vite...
echo Aguarde alguns segundos...
echo.

REM Executar o servidor Vite
call npm run dev

echo.
echo ========================================
echo Servidor finalizado
echo ========================================
echo.
pause
