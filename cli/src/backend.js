// Backend launcher - spawns the FastAPI backend as a subprocess,
// auto-detects port conflicts, polls /health until ready, then hands off.

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend');

let _port = 8000;
let _proc = null;

export function getPort() { return _port; }

async function isPortFree(port) {
  const { default: fetch } = await import('node-fetch');
  try {
    await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
    return false; // Something is already running
  } catch {
    return true;
  }
}

async function findFreePort(startPort = 8000) {
  for (let p = startPort; p < startPort + 20; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('Could not find a free port in range ' + startPort + '-' + (startPort + 20));
}

export async function launchBackend(keys) {
  _port = await findFreePort(8000);

  const env = {
    ...process.env,
    GITHUB_ACCESS_TOKEN: keys.GITHUB_ACCESS_TOKEN || '',
    // The CLI has already live-validated this identity. Pass only non-secret
    // metadata so the dashboard can render the connected state on first load.
    NYX_GITHUB_LOGIN: keys.GITHUB_LOGIN || '',
    NYX_GITHUB_SCOPES: keys.GITHUB_SCOPES || '',
    GOOGLE_GEMINI_API_KEY: keys.GOOGLE_GEMINI_API_KEY || '',
    GROQ_API_KEY: keys.GROQ_API_KEY || '',
    TRUFFLEHOG_BINARY_PATH: keys.TRUFFLEHOG_BINARY_PATH || 'trufflehog',
    CANARYTOKENS_API_KEY: keys.CANARYTOKENS_API_KEY || '',
    NYX_PORT: String(_port),
    PYTHONUNBUFFERED: '1',
  };

  // Try uvicorn first, then python -m uvicorn
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const args = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(_port), '--log-level', 'warning'];

  _proc = spawn(pythonCmd, args, {
    cwd: BACKEND_DIR,
    env,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  _proc.stdout?.on('data', (d) => {
    const line = d.toString().trim();
    if (line) process.stdout.write('\n  [backend] ' + line);
  });

  _proc.stderr?.on('data', (d) => {
    const line = d.toString().trim();
    if (line && !line.includes('INFO')) {
      // Only surface actual errors, not uvicorn startup noise
    }
  });

  _proc.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      process.stderr.write('\n  [backend] Exited with code ' + code + '\n');
    }
  });

  return _proc;
}

export async function waitForHealth(port, maxWaitMs = 30000) {
  const { default: fetch } = await import('node-fetch');
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') return true;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Backend did not become healthy within ' + maxWaitMs + 'ms');
}
