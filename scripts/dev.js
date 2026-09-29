#!/usr/bin/env node
// Arranca el backend y el frontend juntos con un solo comando desde la raíz.
// Antes había que abrir dos terminales y acordarse de entrar a cada carpeta.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const targets = [
  { name: 'backend', dir: resolve(root, 'backend'), args: ['run', 'dev'], color: '\x1b[36m' },
  { name: 'frontend', dir: resolve(root, 'frontend'), args: ['run', 'dev'], color: '\x1b[35m' },
];

const missing = targets.filter((target) => !existsSync(resolve(target.dir, 'package.json')));
if (missing.length > 0) {
  console.error(`Falta package.json en: ${missing.map((target) => target.dir).join(', ')}`);
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function prefix(name, color) {
  // Un prefijo por línea para poder distinguir la salida de cada proceso.
  return (chunk) => {
    const text = chunk.toString();
    return text
      .split('\n')
      .filter((line, index, lines) => line.trim() !== '' || index < lines.length - 1)
      .map((line) => `${color}[${name}]\x1b[0m ${line}`)
      .join('\n');
  };
}

for (const target of targets) {
  const child = spawn(npm, target.args, { cwd: target.dir, env: process.env });
  const label = prefix(target.name, target.color);

  child.stdout.on('data', (chunk) => process.stdout.write(`${label(chunk)}\n`));
  child.stderr.on('data', (chunk) => process.stderr.write(`${label(chunk)}\n`));

  child.on('error', (error) => {
    console.error(`No se pudo iniciar ${target.name}: ${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`${target.color}[${target.name}]\x1b[0m terminó (código ${code ?? signal}). Deteniendo el resto.`);
    shutdown(code ?? 0);
  });

  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
