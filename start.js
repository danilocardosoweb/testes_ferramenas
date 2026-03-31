#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log('', 'reset');
  log('========================================', 'cyan');
  log(title, 'cyan');
  log('========================================', 'cyan');
  log('', 'reset');
}

async function checkCommand(command, displayName) {
  return new Promise((resolve) => {
    const proc = spawn(command, ['--version'], {
      stdio: 'pipe',
      shell: true,
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const version = output.trim();
        log(`✓ ${displayName} ${version} encontrado`, 'green');
        resolve(true);
      } else {
        log(`✗ ${displayName} não encontrado`, 'red');
        resolve(false);
      }
    });
  });
}

async function installDependencies() {
  return new Promise((resolve) => {
    log('Instalando dependências...', 'yellow');

    const npm = spawn('npm', ['install'], {
      stdio: 'inherit',
      shell: true,
    });

    npm.on('close', (code) => {
      if (code === 0) {
        log('✓ Dependências instaladas com sucesso', 'green');
        resolve(true);
      } else {
        log('✗ Erro ao instalar dependências', 'red');
        resolve(false);
      }
    });
  });
}

async function startViteServer() {
  return new Promise((resolve) => {
    log('Iniciando servidor Vite...', 'yellow');
    log('Aguarde alguns segundos...', 'gray');
    log('', 'reset');

    const vite = spawn('npm', ['run', 'dev'], {
      stdio: 'inherit',
      shell: true,
    });

    vite.on('close', (code) => {
      if (code === 0) {
        log('✓ Servidor Vite finalizado com sucesso', 'green');
      } else {
        log('✗ Servidor Vite finalizado com erro', 'red');
      }
      resolve();
    });

    vite.on('error', (err) => {
      log(`✗ Erro ao iniciar Vite: ${err.message}`, 'red');
      resolve();
    });
  });
}

async function main() {
  logSection('Iniciando Testes de Ferramentas App');

  // Verificar Node.js
  log('Verificando Node.js...', 'yellow');
  const hasNode = await checkCommand('node', 'Node.js');
  if (!hasNode) {
    log('Por favor, instale Node.js em https://nodejs.org/', 'red');
    process.exit(1);
  }

  // Verificar npm
  log('Verificando npm...', 'yellow');
  const hasNpm = await checkCommand('npm', 'npm');
  if (!hasNpm) {
    log('Por favor, instale npm com Node.js', 'red');
    process.exit(1);
  }

  // Instalar dependências se necessário
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    log('', 'reset');
    const installed = await installDependencies();
    if (!installed) {
      process.exit(1);
    }
  }

  logSection('Iniciando servidores');

  // Iniciar Vite
  await startViteServer();

  logSection('Servidor finalizado');
}

main().catch((err) => {
  log(`Erro: ${err.message}`, 'red');
  process.exit(1);
});
