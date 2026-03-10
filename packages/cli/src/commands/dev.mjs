/**
 * mowai dev — functional core + imperative shell.
 *
 * Starts a local static HTTP server serving participant-ui with injected
 * runtime config, watches dist/ for wasm changes, and opens the browser.
 */

import { createServer } from 'node:http';
import { readFile, access, watch } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { extname } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// participant-ui lives at packages/participant-ui relative to repo root
const REPO_ROOT = resolve(__dirname, '../../../../');
const PARTICIPANT_UI_DIR = join(REPO_ROOT, 'packages', 'participant-ui');

const DEFAULT_MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.ico':  'image/x-icon',
};

// ── Functional core ───────────────────────────────────────────────────────────

/**
 * @param {string} cwd
 * @returns {string}  absolute path to dist/agent.wasm
 */
export function resolveWasmPath(cwd) {
  const p = join(cwd, 'dist', 'agent.wasm');
  if (!existsSync(p)) {
    throw new Error(
      `dist/agent.wasm not found in ${cwd}\n\n` +
      `  This directory doesn't look like a mowai template.\n` +
      `  Run: mowai init --lang <rust|go|js>\n`,
    );
  }
  return p;
}

/**
 * @param {string} configPath
 * @returns {object}  validated MowaiConfig
 */
export function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(
      `mowai.config.json not found at ${configPath}\n` +
      `  Run: mowai init --lang <rust|go|js>\n`,
    );
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error(`mowai.config.json is not valid JSON: ${configPath}`);
  }
  if (!raw.persona || typeof raw.persona !== 'string') {
    throw new Error('mowai.config.json: missing "persona" field');
  }
  if (!raw.agent?.name || !raw.agent?.color) {
    throw new Error('mowai.config.json: missing "agent.name" or "agent.color"');
  }
  return raw;
}

/**
 * Read a SKILL.md file and return the body (everything after the second `---`).
 *
 * @param {object} config   MowaiConfig
 * @param {string} personasDir
 * @returns {string}
 */
export function loadPersona(config, personasDir) {
  const skillPath = join(personasDir, config.persona, 'SKILL.md');
  if (!existsSync(skillPath)) {
    throw new Error(
      `Persona "${config.persona}" not found.\n` +
      `  Expected: ${skillPath}\n` +
      `  Available: contrarian, synthesiser, first-principles, devils-advocate, pragmatist\n`,
    );
  }
  const raw = readFileSync(skillPath, 'utf8');
  // Strip YAML frontmatter (everything between the first two `---` lines)
  const parts = raw.split(/^---\s*$/m);
  // parts[0] = '' (before first ---), parts[1] = frontmatter, parts[2+] = body
  if (parts.length >= 3) {
    return parts.slice(2).join('---').trim();
  }
  return raw.trim();
}

/**
 * Build the injected config object for window.__mowai_config__.
 *
 * @param {{ port: number, arena: string }} args
 * @param {object} config
 * @param {string} systemPrompt
 * @returns {object}
 */
export function buildInjectedConfig(args, config, systemPrompt) {
  return {
    wasmPath: '/dist/agent.wasm',
    arenaUrl: args.arena,
    agent: {
      name: config.agent.name,
      color: config.agent.color,
      persona: config.persona,
    },
    systemPrompt,
    modelId: config.modelId ?? DEFAULT_MODEL_ID,
  };
}

// ── Imperative shell ──────────────────────────────────────────────────────────

/**
 * @param {{ port: number, arena: string, config: string }} args
 */
export async function runDev({ port = 3000, arena, config: configPath }) {
  const cwd = process.cwd();
  const absConfigPath = resolve(configPath);

  // Functional core — validate before doing anything
  resolveWasmPath(cwd);
  const config = loadConfig(absConfigPath);

  const personasDir = join(cwd, 'personas');
  const systemPrompt = loadPersona(config, personasDir);
  const injectedConfig = buildInjectedConfig({ port, arena }, config, systemPrompt);

  const configScript = `<script>window.__mowai_config__ = ${JSON.stringify(injectedConfig, null, 2)};</script>`;

  // SSE clients for live reload
  const sseClients = new Set();

  // ── Static HTTP server ──────────────────────────────────────────────────────

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost`);
    const urlPath = url.pathname;

    // SSE reload endpoint
    if (urlPath === '/reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Serve dist/agent.wasm from cwd
    if (urlPath === '/dist/agent.wasm') {
      try {
        const content = await readFile(join(cwd, 'dist', 'agent.wasm'));
        res.writeHead(200, { 'Content-Type': 'application/wasm' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Serve participant-ui files
    let filePath;
    if (urlPath === '/' || urlPath === '/index.html') {
      filePath = join(PARTICIPANT_UI_DIR, 'index.html');
    } else {
      filePath = join(PARTICIPANT_UI_DIR, urlPath);
    }

    try {
      let content = await readFile(filePath);
      const ext = extname(filePath);

      // Inject config into index.html
      if (urlPath === '/' || urlPath === '/index.html') {
        content = Buffer.from(
          content.toString('utf8').replace('<!-- MOWAI_CONFIG -->', configScript),
        );
      }

      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    process.stdout.write(
      `\nmowai dev server running at ${url}\n` +
      `Arena: ${arena}\n` +
      `Agent: ${config.agent.name} (${config.persona})\n\n` +
      `Watching dist/ for changes…\n\n`,
    );
    openBrowser(url);
  });

  // ── dist/ watcher → SSE reload ──────────────────────────────────────────────

  const distDir = join(cwd, 'dist');
  if (existsSync(distDir)) {
    watchDir(distDir, sseClients);
  }
}

async function watchDir(dir, sseClients) {
  try {
    const watcher = watch(dir, { recursive: false });
    for await (const event of watcher) {
      if (event.filename?.endsWith('.wasm')) {
        process.stdout.write(`[reload] ${event.filename} changed\n`);
        for (const client of sseClients) {
          client.write('data: reload\n\n');
        }
      }
    }
  } catch {
    // dist/ may not exist yet; ignore
  }
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'start'
    : process.platform === 'darwin' ? 'open'
    : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}
