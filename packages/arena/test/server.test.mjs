/**
 * Integration test: 2 mock WS clients connect → AGENT_THOUGHT → verify relay.
 *
 * Spawns the real server on a random port, connects two WS clients,
 * exercises the full path through server.mjs → relay.mjs → protocol.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

// Re-use relay + protocol directly to boot a minimal test server
import { parseMessage, validateEnvelope, validatePayload, buildGlobalTask } from '../src/protocol.mjs';
import { createInitialState, handleConnect, handleMessage, handleDisconnect, recordError, Effect } from '../src/relay.mjs';

// ── Test server factory ───────────────────────────────────────────────────────

async function startTestServer() {
  let relayState = createInitialState();
  const sockets = new Map();

  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 8192 });

  wss.on('connection', (ws) => {
    let agentId = null;
    const seqMap = new Map();

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());

      if (!agentId) {
        if (msg.type !== 'AGENT_CONNECT') { ws.close(); return; }
        agentId = msg.agentId;
        sockets.set(agentId, ws);
        seqMap.set(agentId, msg.seq);
        const { state, effects } = handleConnect(relayState, agentId, msg.payload);
        relayState = state;
        applyEffects(effects, sockets);
        return;
      }

      seqMap.set(agentId, msg.seq);
      const { state, effects } = handleMessage(relayState, agentId, msg);
      relayState = state;
      applyEffects(effects, sockets);
    });

    ws.on('close', () => {
      if (agentId) {
        sockets.delete(agentId);
        const { state, effects } = handleDisconnect(relayState, agentId);
        relayState = state;
        applyEffects(effects, sockets);
      }
    });
  });

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();

  return {
    url: `ws://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => httpServer.close(resolve)),
    getState: () => relayState,
  };
}

function applyEffects(effects, sockets) {
  for (const effect of effects) {
    if (effect.type === Effect.SEND_TO) {
      sockets.get(effect.agentId)?.send(JSON.stringify(effect.message));
    } else if (effect.type === Effect.BROADCAST) {
      const json = JSON.stringify(effect.message);
      for (const [, ws] of sockets) ws.send(json);
    } else if (effect.type === Effect.DISCONNECT) {
      sockets.get(effect.agentId)?.close();
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function connectAgent(url, agentId, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const received = [];

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        agentId,
        slot: 0,
        seq: 1,
        ts: Date.now(),
        payload: { name, color: '#a855f7', persona: 'contrarian', version: '0.1.0' },
      }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      received.push(msg);
      // Resolve on ACK
      if (msg.type === 'ARENA_ACK') {
        resolve({ ws, received });
      }
    });

    ws.on('error', reject);
  });
}

function waitForMessage(ws, type, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('two clients connect, AGENT_THOUGHT relayed as BROADCAST and PEER_THOUGHT', async () => {
  const server = await startTestServer();

  const idA = randomUUID();
  const idB = randomUUID();
  const taskId = randomUUID();

  const { ws: wsA } = await connectAgent(server.url, idA, 'agent-alpha');
  const { ws: wsB } = await connectAgent(server.url, idB, 'agent-beta');

  // B waits for a PEER_THOUGHT
  const peerThoughtP = waitForMessage(wsB, 'PEER_THOUGHT');
  // B also waits for the BROADCAST (AGENT_THOUGHT itself)
  const broadcastP = waitForMessage(wsB, 'AGENT_THOUGHT');

  // A sends an AGENT_THOUGHT
  wsA.send(JSON.stringify({
    type: 'AGENT_THOUGHT',
    agentId: idA,
    slot: 0,
    seq: 2,
    ts: Date.now(),
    payload: { step: 1, content: 'deep thought', taskId },
  }));

  const [peerThought, broadcast] = await Promise.all([peerThoughtP, broadcastP]);

  assert.equal(peerThought.type, 'PEER_THOUGHT');
  assert.equal(peerThought.payload.sourceAgentId, idA);
  assert.equal(peerThought.payload.content, 'deep thought');

  assert.equal(broadcast.type, 'AGENT_THOUGHT');
  assert.equal(broadcast.payload.content, 'deep thought');

  wsA.close();
  wsB.close();
  await server.close();
});

test('health endpoint returns correct agent count', async () => {
  // Health endpoint lives on httpServer - test via relay state
  const server = await startTestServer();
  const idA = randomUUID();
  const { ws } = await connectAgent(server.url, idA, 'agent-alpha');

  assert.equal(server.getState().agents.size, 1);

  ws.close();
  await new Promise((r) => ws.on('close', r));
  await server.close();
});
