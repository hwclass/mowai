/**
 * Arena HTTP + WebSocket server — imperative shell.
 *
 * All business logic lives in relay.mjs (pure) and protocol.mjs (pure).
 * This file owns: sockets, timers, I/O, process lifecycle.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

import { parseMessage, validateEnvelope, validatePayload, buildGlobalTask } from './protocol.mjs';
import {
  createInitialState,
  handleConnect,
  handleMessage,
  handleDisconnect,
  recordError,
  Effect,
} from './relay.mjs';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8080);
const ADMIN_SECRET = process.env.MOWAI_ADMIN_SECRET ?? '';
const KEEPALIVE_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 90_000;
const MAX_MESSAGE_BYTES = 8 * 1024; // 8 KB

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ARENA_UI_DIR = resolve(__dirname, '../../../packages/arena-ui');

// ── Mutable shell state ───────────────────────────────────────────────────────

/** @type {import('./relay.mjs').RelayState} */
let relayState = createInitialState();

/** @type {Map<string, import('ws').WebSocket>} */
const sockets = new Map(); // agentId → ws

/** @type {Map<string, NodeJS.Timeout>} */
const idleTimers = new Map(); // agentId → timer

const startedAt = Date.now();

// ── Effect application ────────────────────────────────────────────────────────

/**
 * Apply an array of effects from the pure core.
 * @param {Array<object>} effects
 */
function applyEffects(effects) {
  for (const effect of effects) {
    switch (effect.type) {
      case Effect.SEND_TO: {
        const ws = sockets.get(effect.agentId);
        if (ws?.readyState === 1 /* OPEN */) {
          ws.send(JSON.stringify(effect.message));
        }
        break;
      }
      case Effect.BROADCAST: {
        const json = JSON.stringify(effect.message);
        for (const [agentId, ws] of sockets) {
          if (effect.excludeAgentId && agentId === effect.excludeAgentId) continue;
          if (ws.readyState === 1) ws.send(json);
        }
        break;
      }
      case Effect.DISCONNECT: {
        const ws = sockets.get(effect.agentId);
        if (ws) {
          ws.close(1008, effect.reason ?? 'Disconnected by relay');
          sockets.delete(effect.agentId);
          clearIdleTimer(effect.agentId);
        }
        break;
      }
      case Effect.LOG: {
        const fn = effect.level === 'error' ? console.error
          : effect.level === 'warn' ? console.warn
          : console.log;
        fn(`[arena] ${effect.message}`);
        break;
      }
    }
  }
}

// ── Idle timer helpers ────────────────────────────────────────────────────────

function resetIdleTimer(agentId) {
  clearIdleTimer(agentId);
  idleTimers.set(agentId, setTimeout(() => {
    const ws = sockets.get(agentId);
    if (ws) {
      ws.close(1001, 'Idle timeout');
      sockets.delete(agentId);
    }
    const { state, effects } = handleDisconnect(relayState, agentId);
    relayState = state;
    applyEffects(effects);
  }, IDLE_TIMEOUT_MS));
}

function clearIdleTimer(agentId) {
  const t = idleTimers.get(agentId);
  if (t) {
    clearTimeout(t);
    idleTimers.delete(agentId);
  }
}

// ── HTTP request handler ──────────────────────────────────────────────────────

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const path = url.pathname;

  // ── REST endpoints ──────────────────────────────────────────────────────────

  if (req.method === 'GET' && path === '/health') {
    json(res, 200, {
      status: 'ok',
      agents: relayState.agents.size,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
    return;
  }

  if (req.method === 'GET' && path === '/agents') {
    const agents = [];
    for (const [, record] of relayState.agents) {
      agents.push({
        agentId: record.agentId,
        slot: record.slot,
        name: record.name,
        color: record.color,
        persona: record.persona,
        version: record.version,
        connectedAt: record.connectedAt,
      });
    }
    json(res, 200, agents);
    return;
  }

  if (req.method === 'POST' && path === '/task') {
    const secret = req.headers['x-admin-secret'];
    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed;
    try { parsed = JSON.parse(body); } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }
    if (typeof parsed.description !== 'string' || !parsed.description.trim()) {
      json(res, 400, { error: 'description is required' });
      return;
    }
    const taskId = randomUUID();
    const taskMsg = buildGlobalTask(parsed.description.slice(0, 512), taskId);
    const { state, effects } = handleMessage(relayState, 'server', taskMsg);
    relayState = state;
    applyEffects(effects);
    json(res, 200, { taskId });
    return;
  }

  // ── Static file serving (arena-ui) ─────────────────────────────────────────

  let filePath;
  if (path === '/' || path === '/index.html') {
    filePath = join(ARENA_UI_DIR, 'index.html');
  } else {
    filePath = join(ARENA_UI_DIR, path);
  }

  if (!existsSync(filePath)) {
    json(res, 404, { error: 'Not found' });
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = filePath.split('.').pop();
    const mimeTypes = {
      html: 'text/html; charset=utf-8',
      js: 'application/javascript; charset=utf-8',
      mjs: 'application/javascript; charset=utf-8',
      css: 'text/css; charset=utf-8',
      json: 'application/json',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    json(res, 500, { error: 'Server error' });
  }
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const httpServer = createServer(handleRequest);
const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws) => {
  /** @type {string|null} */
  let agentId = null;
  /** @type {Map<string, number>} */
  const seqMap = new Map();

  ws.on('message', (raw) => {
    const str = raw.toString('utf8');

    const parsed = parseMessage(str);
    if (!parsed.ok) {
      ws.send(JSON.stringify({ type: 'ARENA_ERROR', payload: { reason: parsed.error } }));
      return;
    }

    const msg = parsed.value;

    // First message must be AGENT_CONNECT
    if (!agentId) {
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
        return;
      }
      if (msg.type !== 'AGENT_CONNECT') {
        ws.send(JSON.stringify({ type: 'ARENA_ERROR', payload: { reason: 'First message must be AGENT_CONNECT' } }));
        ws.close(1008, 'Protocol violation');
        return;
      }

      const envResult = validateEnvelope(msg, seqMap, Date.now());
      if (!envResult.valid) {
        ws.send(JSON.stringify({ type: 'ARENA_ERROR', payload: { reason: envResult.reason } }));
        ws.close(1008, envResult.reason);
        return;
      }

      const payResult = validatePayload(msg);
      if (!payResult.valid) {
        ws.send(JSON.stringify({ type: 'ARENA_ERROR', payload: { reason: payResult.reason } }));
        ws.close(1008, payResult.reason);
        return;
      }

      agentId = msg.agentId;
      seqMap.set(agentId, msg.seq);
      sockets.set(agentId, ws);
      resetIdleTimer(agentId);

      const { state, effects } = handleConnect(relayState, agentId, msg.payload);
      relayState = state;
      applyEffects(effects);
      return;
    }

    // Subsequent messages
    resetIdleTimer(agentId);

    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
      return;
    }
    if (msg.type === 'PONG') return;

    const envResult = validateEnvelope(msg, seqMap, Date.now());
    if (!envResult.valid) {
      const { state, effects } = recordError(relayState, agentId, envResult.reason);
      relayState = state;
      applyEffects(effects);
      return;
    }
    seqMap.set(agentId, msg.seq);

    const payResult = validatePayload(msg);
    if (!payResult.valid) {
      const { state, effects } = recordError(relayState, agentId, payResult.reason);
      relayState = state;
      applyEffects(effects);
      return;
    }

    const { state, effects } = handleMessage(relayState, agentId, msg);
    relayState = state;
    applyEffects(effects);
  });

  ws.on('close', () => {
    if (agentId) {
      sockets.delete(agentId);
      clearIdleTimer(agentId);
      const { state, effects } = handleDisconnect(relayState, agentId);
      relayState = state;
      applyEffects(effects);
    }
  });

  ws.on('error', (err) => {
    console.error(`[arena] ws error${agentId ? ` for ${agentId}` : ''}:`, err.message);
  });
});

// ── PING keepalive ────────────────────────────────────────────────────────────

setInterval(() => {
  const ping = JSON.stringify({ type: 'PING', ts: Date.now() });
  for (const [, ws] of sockets) {
    if (ws.readyState === 1) ws.send(ping);
  }
}, KEEPALIVE_INTERVAL_MS);

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[arena] listening on http://localhost:${PORT}`);
});
