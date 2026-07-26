#!/usr/bin/env node
/**
 * One-command dev launcher.
 *
 * `npm run dev` boots BOTH services together:
 *   - the Python ai-layer (FastAPI/uvicorn) on http://127.0.0.1:8077
 *   - the Node api (tsx watch) on http://127.0.0.1:3000
 *
 * They're separate processes because the ai-layer is Python (the brain + RAG +
 * pandas) and the api is Node — two runtimes can't share one process. This script
 * just supervises both: their logs interleave in this one terminal, Ctrl+C stops
 * both, and if either dies the other is shut down too.
 *
 * `npm run dev:api` runs the api ALONE (no ai-layer; /ai-layer/* will degrade).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const apiDir = dirname(fileURLToPath(import.meta.url));      // apps/api
const repoRoot = join(apiDir, '..', '..');
const aiLayerDir = join(repoRoot, 'apps', 'ai-layer');
const pythonWin = join(repoRoot, 'cos', 'Scripts', 'python.exe');
const pythonNix = join(repoRoot, 'cos', 'bin', 'python');
const python = existsSync(pythonWin) ? pythonWin : existsSync(pythonNix) ? pythonNix : null;
const tsxCli = join(apiDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function start(name, cmd, args, cwd, extraEnv = {}) {
  // No shell: spawning the binaries directly means Ctrl+C cleanly kills them
  // (and tolerates the spaces in this repo's path).
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: 'inherit' });
  child.on('error', (e) => console.error(`[dev] ${name} failed to start:`, e.message));
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`[dev] ${name} exited (code ${code}) — stopping both.`);
      shutdown(code ?? 0);
    }
  });
  children.push(child);
}

// 1) Python ai-layer — optional. If the venv is missing, run api-only (degraded)
//    rather than failing, so a fresh checkout without the venv still boots.
if (python) {
  console.log('[dev] starting ai-layer  -> http://127.0.0.1:8077');
  start(
    'ai-layer',
    python,
    ['-m', 'uvicorn', 'ai_layer.api:app', '--host', '127.0.0.1', '--port', '8077'],
    aiLayerDir,
    { PYTHONIOENCODING: 'utf-8' },
  );
} else {
  console.warn(
    '[dev] cos venv python not found (cos/Scripts/python.exe) — starting the api WITHOUT the ' +
      'ai-layer; /ai-layer/* will degrade. Create the venv, or use `npm run dev:api`.',
  );
}

// 2) Node api (tsx watch). Run node directly on tsx's CLI so there's no shell/.cmd
//    wrapper to leak on shutdown.
console.log('[dev] starting api       -> http://127.0.0.1:3000');
start('api', process.execPath, [tsxCli, 'watch', 'src/index.ts'], apiDir);
