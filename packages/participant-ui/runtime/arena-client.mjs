/**
 * arena-client.mjs — WebSocket client connecting participant to Arena relay.
 *
 * Handles:
 *  - AGENT_CONNECT handshake + ARENA_ACK
 *  - AGENT_THOUGHT / AGENT_RESPONSE send
 *  - GLOBAL_TASK receive → CustomEvent('task')
 *  - PEER_THOUGHT receive → wasm-host.onPeerThought()
 *  - PING/PONG keepalive
 *  - Auto-reconnect with exponential backoff (max 30s)
 *  - Monotonic seq counter
 */

const MAX_BACKOFF_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

let ws = null;
let seq = 0;
let agentId = null;
let agentInfo = null;
let arenaUrl = null;
let onPeerThoughtCallback = null;

let reconnectDelay = 1000;
let pongTimer = null;
let connected = false;

/** Pending broadcast messages while reconnecting */
const pendingBroadcasts = [];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Connect to the Arena and send AGENT_CONNECT.
 *
 * @param {string} url  wss://... or ws://...
 * @param {{ agentId: string, name: string, color: string, persona: string, version: string }} info
 * @param {(peerId: string, thought: string) => void} onPeerThought
 * @returns {Promise<{ slot: number }>}
 */
export function connect(url, info, onPeerThought) {
  arenaUrl = url;
  agentId = info.agentId;
  agentInfo = info;
  onPeerThoughtCallback = onPeerThought;
  return openConnection();
}

/**
 * Send an AGENT_THOUGHT to the arena.
 *
 * @param {string} taskId
 * @param {number} step
 * @param {string} content
 */
export function sendThought(taskId, step, content) {
  send({
    type: 'AGENT_THOUGHT',
    payload: { taskId, step, content: content.slice(0, 1024) },
  });
}

/**
 * Send an AGENT_RESPONSE to the arena.
 *
 * @param {string} taskId
 * @param {string} content
 * @param {number} durationMs
 */
export function sendResponse(taskId, content, durationMs) {
  send({
    type: 'AGENT_RESPONSE',
    payload: { taskId, content: content.slice(0, 2048), durationMs },
  });
}

/**
 * Queue a broadcast message (called from wasm host import).
 * The message is the plain thought string; this wraps it as AGENT_THOUGHT.
 *
 * @param {string} message
 */
export function queueBroadcast(message) {
  if (connected && ws?.readyState === WebSocket.OPEN) {
    send({
      type: 'AGENT_THOUGHT',
      payload: { taskId: '00000000-0000-4000-8000-000000000000', step: 1, content: message.slice(0, 1024) },
    });
  } else {
    pendingBroadcasts.push(message);
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function openConnection() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(arenaUrl);

    ws.addEventListener('open', () => {
      reconnectDelay = 1000;
      seq = 0;
      // Send AGENT_CONNECT
      const msg = envelope('AGENT_CONNECT', {
        name: agentInfo.name,
        color: agentInfo.color,
        persona: agentInfo.persona,
        version: agentInfo.version,
      });
      ws.send(JSON.stringify(msg));
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'ARENA_ACK') {
        connected = true;
        // Flush pending broadcasts
        for (const m of pendingBroadcasts.splice(0)) queueBroadcast(m);
        document.dispatchEvent(new CustomEvent('arena-connected', { detail: { slot: msg.payload.slot } }));
        resolve({ slot: msg.payload.slot });
        return;
      }

      if (msg.type === 'ARENA_ERROR') {
        if (!connected) reject(new Error(msg.payload?.reason ?? 'Arena error'));
        document.dispatchEvent(new CustomEvent('arena-error', { detail: msg.payload }));
        return;
      }

      if (msg.type === 'GLOBAL_TASK') {
        document.dispatchEvent(new CustomEvent('task', { detail: msg.payload }));
        return;
      }

      if (msg.type === 'PEER_THOUGHT') {
        onPeerThoughtCallback?.(msg.payload.sourceAgentId, msg.payload.content);
        return;
      }

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
        return;
      }

      if (msg.type === 'PONG') {
        clearTimeout(pongTimer);
        return;
      }
    });

    ws.addEventListener('close', () => {
      connected = false;
      document.dispatchEvent(new CustomEvent('arena-disconnected'));
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // 'close' will fire after error
    });
  });
}

function scheduleReconnect() {
  if (!arenaUrl) return;
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_BACKOFF_MS);
    openConnection().catch(() => {});
  }, reconnectDelay);
}

function envelope(type, payload) {
  seq += 1;
  return {
    type,
    agentId,
    slot: 0,
    seq,
    ts: Date.now(),
    payload,
  };
}

function send(partial) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(envelope(partial.type, partial.payload)));
}
