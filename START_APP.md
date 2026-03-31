# 🚀 Guia de Inicialização - Testes de Ferramentas App

Este documento descreve como executar o aplicativo e todos os servidores necessários.

## 📋 Pré-requisitos

- **Node.js** (v16 ou superior) - [Download](https://nodejs.org/)
- **npm** (incluído com Node.js)
- **Git** (opcional, para controle de versão)

## 🎯 Como Executar o App

Existem 3 formas de iniciar o aplicativo:

### **Opção 1: Script Batch (Windows) - Recomendado**

1. Abra o **Explorador de Arquivos**
2. Navegue até a pasta do projeto: `c:\Users\Danilo\Desktop\apps\Testes de ferramentas`
3. **Clique duas vezes** em `start.bat`
4. O terminal abrirá e o servidor iniciará automaticamente

```bash
# Ou execute via terminal:
start.bat
```

### **Opção 2: PowerShell Script**

```powershell
# Abra o PowerShell como Administrador e execute:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\start.ps1
```

### **Opção 3: Node.js Script (Multiplataforma)**

```bash
# Via terminal/cmd:
node start.js
```

### **Opção 4: npm direto**

```bash
# Via terminal/cmd:
npm run dev
```

## 📱 Acessar o App

Após iniciar o servidor, o app estará disponível em:

- **URL Principal**: `http://localhost:8080`
- **URL Alternativa**: `http://127.0.0.1:8080`

Se a porta 8080 estiver em uso, o Vite tentará usar a próxima porta disponível (8081, 8082, etc).

## 🔧 Servidores Iniciados

O script inicia automaticamente:

1. **Vite Dev Server** - Servidor de desenvolvimento com hot reload
   - Porta: `8080` (ou próxima disponível)
   - Fornece live reload ao salvar arquivos

2. **Supabase** - Banco de dados (configurado via `.env`)
   - Conectado automaticamente via variáveis de ambiente

## 📝 Variáveis de Ambiente

O arquivo `.env` contém as configurações necessárias:

```env
VITE_SUPABASE_URL=sua_url_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima
```

Se não tiver um arquivo `.env`, copie de `.env.example`:

```bash
cp .env.example .env
```

## 🛑 Parar o Servidor

- **Windows**: Pressione `Ctrl + C` no terminal
- **Mac/Linux**: Pressione `Ctrl + C` no terminal

## 🐛 Troubleshooting

### Erro: "Node.js não encontrado"
- Instale Node.js em https://nodejs.org/
- Reinicie o terminal após instalar

### Erro: "Porta 8080 já está em uso"
- O Vite tentará usar a próxima porta disponível automaticamente
- Ou feche a aplicação que está usando a porta 8080

### Erro: "npm: comando não encontrado"
- Reinstale Node.js (npm é incluído)
- Verifique se Node.js está no PATH do sistema

### Dependências não instaladas
- Execute manualmente: `npm install`
- Aguarde a conclusão antes de iniciar o servidor

## 📦 Instalação Manual de Dependências

Se o script não instalar automaticamente:

```bash
npm install
```

## 🔄 Rebuild do Projeto

Se tiver problemas, tente limpar o cache:

```bash
# Limpar node_modules e reinstalar
rmdir /s /q node_modules
npm install

# Limpar cache do Vite
rmdir /s /q dist

# Reiniciar o servidor
npm run dev
```

## 📚 Comandos Disponíveis

```bash
# Iniciar servidor de desenvolvimento
npm run dev

# Build para produção
npm run build

# Build em modo desenvolvimento
npm run build:dev

# Preview da build de produção
npm preview

# Verificar linting
npm run lint
```

## 🌐 Acessar em Outro Computador

Para acessar o app de outro computador na mesma rede:

1. Descubra o IP da máquina:
   ```bash
   ipconfig
   # Procure por "IPv4 Address" (ex: 192.168.1.100)
   ```

2. Acesse via navegador:
   ```
   http://192.168.1.100:8080
   ```

## 💡 Dicas

- **Hot Reload**: Qualquer mudança nos arquivos será refletida automaticamente no navegador
- **DevTools**: Abra F12 no navegador para acessar as ferramentas de desenvolvimento
- **Console**: Verifique o console do navegador para mensagens de erro
- **Terminal**: Verifique o terminal para logs do servidor Vite

## 📞 Suporte

Se encontrar problemas:

1. Verifique se Node.js está instalado: `node --version`
2. Verifique se npm está instalado: `npm --version`
3. Limpe o cache: `npm install` e `npm run dev`
4. Consulte a documentação: [Vite Docs](https://vitejs.dev/)

---

**Pronto!** O app deve estar rodando agora. Abra seu navegador e acesse `http://localhost:8080` 🎉
