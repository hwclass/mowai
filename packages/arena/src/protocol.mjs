/**
 * Swarm protocol — pure functions, no I/O.
 *
 * All exported functions are side-effect free. The imperative shell
 * (server.mjs) is responsible for all I/O and calling these functions.
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const ARENA_VERSION = '0.1.0';

export const MESSAGE_TYPES = new Set([
  'AGENT_CONNECT',
  'AGENT_DISCONNECT',
  'AGENT_THOUGHT',
  'AGENT_RESPONSE',
  'GLOBAL_TASK',
  'PEER_THOUGHT',
  'ARENA_ACK',
  'ARENA_ERROR',
  'PING',
  'PONG',
]);

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_LENGTHS = {
  name: 64,
  color: 32,
  persona: 64,
  version: 32,
  content_thought: 1024,
  content_response: 2048,
  description: 512,
};

const TIMESTAMP_DRIFT_MS = 30_000;

// ── Type helpers ─────────────────────────────────────────────────────────────

/** @param {string} id */
const isValidUuidV4 = (id) => typeof id === 'string' && UUID_V4_RE.test(id);

/** @param {unknown} v @param {number} max */
const isStringWithin = (v, max) => typeof v === 'string' && v.length <= max;

// ── parseMessage ─────────────────────────────────────────────────────────────

/**
 * Parse a raw WebSocket string into a SwarmMessage object.
 *
 * @param {string} rawString
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function parseMessage(rawString) {
  if (typeof rawString !== 'string') {
    return { ok: false, error: 'Message must be a string' };
  }
  let parsed;
  try {
    parsed = JSON.parse(rawString);
  } catch {
    return { ok: false, error: 'Malformed JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Message must be a JSON object' };
  }
  return { ok: true, value: parsed };
}

// ── validateEnvelope ─────────────────────────────────────────────────────────

/**
 * Validate the envelope fields of a parsed SwarmMessage.
 *
 * @param {object} msg
 * @param {Map<string, number>} lastSeqMap  agentId → last seen seq
 * @param {number} serverTime  Date.now() equivalent
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export function validateEnvelope(msg, lastSeqMap, serverTime) {
  if (!MESSAGE_TYPES.has(msg.type)) {
    return { valid: false, reason: `Unknown message type: ${msg.type}` };
  }

  // PING/PONG have minimal envelope requirements
  if (msg.type === 'PING' || msg.type === 'PONG') {
    return { valid: true };
  }

  if (!isValidUuidV4(msg.agentId)) {
    return { valid: false, reason: 'Invalid agentId: must be UUID v4' };
  }

  if (typeof msg.seq !== 'number' || !Number.isInteger(msg.seq) || msg.seq < 0) {
    return { valid: false, reason: 'Invalid seq: must be a non-negative integer' };
  }

  const lastSeq = lastSeqMap.get(msg.agentId);
  if (lastSeq !== undefined && msg.seq <= lastSeq) {
    return {
      valid: false,
      reason: `Non-increasing seq: got ${msg.seq}, last was ${lastSeq}`,
    };
  }

  if (typeof msg.ts !== 'number') {
    return { valid: false, reason: 'Invalid ts: must be a number' };
  }

  const drift = Math.abs(msg.ts - serverTime);
  if (drift > TIMESTAMP_DRIFT_MS) {
    return {
      valid: false,
      reason: `Timestamp drift too large: ${drift}ms (max ${TIMESTAMP_DRIFT_MS}ms)`,
    };
  }

  return { valid: true };
}

// ── validatePayload ──────────────────────────────────────────────────────────

/**
 * Validate the payload fields for a given message type.
 *
 * @param {object} msg  Full parsed SwarmMessage (envelope + payload)
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export function validatePayload(msg) {
  const p = msg.payload;

  switch (msg.type) {
    case 'AGENT_CONNECT': {
      if (!isStringWithin(p?.name, MAX_LENGTHS.name)) {
        return { valid: false, reason: `AGENT_CONNECT: name missing or too long (max ${MAX_LENGTHS.name})` };
      }
      if (!isStringWithin(p?.color, MAX_LENGTHS.color)) {
        return { valid: false, reason: `AGENT_CONNECT: color missing or too long (max ${MAX_LENGTHS.color})` };
      }
      if (!isStringWithin(p?.persona, MAX_LENGTHS.persona)) {
        return { valid: false, reason: `AGENT_CONNECT: persona missing or too long (max ${MAX_LENGTHS.persona})` };
      }
      if (!isStringWithin(p?.version, MAX_LENGTHS.version)) {
        return { valid: false, reason: `AGENT_CONNECT: version missing or too long (max ${MAX_LENGTHS.version})` };
      }
      return { valid: true };
    }

    case 'AGENT_THOUGHT': {
      if (!isStringWithin(p?.content, MAX_LENGTHS.content_thought)) {
        return { valid: false, reason: `AGENT_THOUGHT: content missing or too long (max ${MAX_LENGTHS.content_thought})` };
      }
      if (typeof p?.step !== 'number' || !Number.isInteger(p.step) || p.step < 1) {
        return { valid: false, reason: 'AGENT_THOUGHT: step must be a positive integer' };
      }
      if (!isValidUuidV4(p?.taskId)) {
        return { valid: false, reason: 'AGENT_THOUGHT: taskId must be UUID v4' };
      }
      return { valid: true };
    }

    case 'AGENT_RESPONSE': {
      if (!isStringWithin(p?.content, MAX_LENGTHS.content_response)) {
        return { valid: false, reason: `AGENT_RESPONSE: content missing or too long (max ${MAX_LENGTHS.content_response})` };
      }
      if (!isValidUuidV4(p?.taskId)) {
        return { valid: false, reason: 'AGENT_RESPONSE: taskId must be UUID v4' };
      }
      if (typeof p?.durationMs !== 'number' || p.durationMs < 0) {
        return { valid: false, reason: 'AGENT_RESPONSE: durationMs must be a non-negative number' };
      }
      return { valid: true };
    }

    case 'PING':
    case 'PONG':
    case 'AGENT_DISCONNECT':
    case 'GLOBAL_TASK':
    case 'PEER_THOUGHT':
    case 'ARENA_ACK':
    case 'ARENA_ERROR':
      return { valid: true };

    default:
      return { valid: false, reason: `No payload validator for type: ${msg.type}` };
  }
}

// ── Message builders ─────────────────────────────────────────────────────────

/**
 * @param {number} slot
 * @param {number} connectedPeers
 * @param {string} arenaVersion
 * @returns {object}
 */
export function buildAck(slot, connectedPeers, arenaVersion) {
  return {
    type: 'ARENA_ACK',
    agentId: '00000000-0000-4000-8000-000000000000',
    slot: 0,
    seq: 0,
    ts: Date.now(),
    payload: { slot, connectedPeers, arenaVersion },
  };
}

/**
 * @param {string} description
 * @param {string} taskId  UUID v4
 * @returns {object}
 */
export function buildGlobalTask(description, taskId) {
  return {
    type: 'GLOBAL_TASK',
    agentId: '00000000-0000-4000-8000-000000000000',
    slot: 0,
    seq: 0,
    ts: Date.now(),
    payload: { taskId, description, issuedAt: Date.now() },
  };
}

/**
 * @param {string} reason
 * @param {string} agentId
 * @returns {object}
 */
export function buildError(reason, agentId) {
  return {
    type: 'ARENA_ERROR',
    agentId: '00000000-0000-4000-8000-000000000000',
    slot: 0,
    seq: 0,
    ts: Date.now(),
    payload: { reason, targetAgentId: agentId },
  };
}

/**
 * @param {string} sourceAgentId
 * @param {string} taskId
 * @param {number} step
 * @param {string} content
 * @returns {object}
 */
export function buildPeerThought(sourceAgentId, taskId, step, content) {
  return {
    type: 'PEER_THOUGHT',
    agentId: '00000000-0000-4000-8000-000000000000',
    slot: 0,
    seq: 0,
    ts: Date.now(),
    payload: { sourceAgentId, taskId, step, content },
  };
}
