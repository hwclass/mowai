/**
 * Relay state machine — pure functions, no I/O.
 *
 * All state transitions return { state, effects } tuples.
 * The shell (server.mjs) applies effects (sends, broadcasts, disconnects).
 */

import { buildAck, buildError, buildPeerThought, ARENA_VERSION } from './protocol.mjs';

// ── Effect types ──────────────────────────────────────────────────────────────

export const Effect = Object.freeze({
  SEND_TO: 'SEND_TO',       // { agentId, message }
  BROADCAST: 'BROADCAST',   // { message, excludeAgentId? }
  DISCONNECT: 'DISCONNECT', // { agentId, reason }
  LOG: 'LOG',               // { level, message }
});

// ── State shapes ──────────────────────────────────────────────────────────────

/**
 * AgentRecord — immutable snapshot of a connected agent.
 * @typedef {{
 *   agentId: string,
 *   slot: number,
 *   name: string,
 *   color: string,
 *   persona: string,
 *   version: string,
 *   connectedAt: number,
 *   errorCount: number,
 *   errorWindowStart: number,
 * }} AgentRecord
 */

/**
 * RelayState — immutable top-level state.
 * @typedef {{
 *   agents: Map<string, AgentRecord>,
 *   nextSlot: number,
 *   recentTasks: Array<object>,
 * }} RelayState
 */

const MAX_ERROR_RATE = 10;          // errors per window
const ERROR_WINDOW_MS = 60_000;     // 1 minute
const MAX_RECENT_TASKS = 5;

// ── createInitialState ────────────────────────────────────────────────────────

/** @returns {RelayState} */
export function createInitialState() {
  return {
    agents: new Map(),
    nextSlot: 0,
    recentTasks: [],
  };
}

// ── handleConnect ─────────────────────────────────────────────────────────────

/**
 * @param {RelayState} state
 * @param {string} agentId
 * @param {{ name: string, color: string, persona: string, version: string }} info
 * @returns {{ state: RelayState, effects: Array<object> }}
 */
export function handleConnect(state, agentId, info) {
  if (state.agents.has(agentId)) {
    return {
      state,
      effects: [
        { type: Effect.DISCONNECT, agentId, reason: 'Duplicate agentId' },
        { type: Effect.LOG, level: 'warn', message: `Duplicate connect for ${agentId}` },
      ],
    };
  }

  const slot = state.nextSlot;
  /** @type {AgentRecord} */
  const record = {
    agentId,
    slot,
    name: info.name,
    color: info.color,
    persona: info.persona,
    version: info.version,
    connectedAt: Date.now(),
    errorCount: 0,
    errorWindowStart: Date.now(),
  };

  const newAgents = new Map(state.agents);
  newAgents.set(agentId, record);

  const newState = { ...state, agents: newAgents, nextSlot: slot + 1 };

  const ack = buildAck(slot, newAgents.size, ARENA_VERSION);

  const effects = [
    { type: Effect.SEND_TO, agentId, message: ack },
    { type: Effect.LOG, level: 'info', message: `Agent connected: ${info.name} (slot ${slot})` },
  ];

  // Send recent tasks so late-joiners can catch up
  for (const task of state.recentTasks) {
    effects.push({ type: Effect.SEND_TO, agentId, message: task });
  }

  return { state: newState, effects };
}

// ── handleMessage ─────────────────────────────────────────────────────────────

/**
 * @param {RelayState} state
 * @param {string} agentId
 * @param {object} msg  Already parsed and validated SwarmMessage
 * @returns {{ state: RelayState, effects: Array<object> }}
 */
export function handleMessage(state, agentId, msg) {
  const agent = state.agents.get(agentId);

  switch (msg.type) {
    case 'AGENT_THOUGHT': {
      if (!agent) {
        return unauthenticated(state, agentId, msg.type);
      }
      // Broadcast raw thought to all (for Arena chat)
      const broadcastEffect = { type: Effect.BROADCAST, message: msg };

      // Also send PEER_THOUGHT to each other agent individually
      const peerEffects = [];
      for (const [peerId] of state.agents) {
        if (peerId !== agentId) {
          const peerMsg = buildPeerThought(
            agentId,
            msg.payload.taskId,
            msg.payload.step,
            msg.payload.content,
          );
          peerEffects.push({ type: Effect.SEND_TO, agentId: peerId, message: peerMsg });
        }
      }

      return { state, effects: [broadcastEffect, ...peerEffects] };
    }

    case 'AGENT_RESPONSE': {
      if (!agent) {
        return unauthenticated(state, agentId, msg.type);
      }
      return { state, effects: [{ type: Effect.BROADCAST, message: msg }] };
    }

    case 'GLOBAL_TASK': {
      // Only server-originated; track in recentTasks
      const newRecent = [...state.recentTasks, msg].slice(-MAX_RECENT_TASKS);
      const newState = { ...state, recentTasks: newRecent };
      return { state: newState, effects: [{ type: Effect.BROADCAST, message: msg }] };
    }

    case 'PING': {
      const pong = { type: 'PONG', ts: Date.now() };
      return { state, effects: [{ type: Effect.SEND_TO, agentId, message: pong }] };
    }

    case 'PONG':
      return { state, effects: [] };

    default:
      return { state, effects: [{ type: Effect.LOG, level: 'debug', message: `Unhandled type: ${msg.type}` }] };
  }
}

// ── handleDisconnect ──────────────────────────────────────────────────────────

/**
 * @param {RelayState} state
 * @param {string} agentId
 * @returns {{ state: RelayState, effects: Array<object> }}
 */
export function handleDisconnect(state, agentId) {
  const agent = state.agents.get(agentId);
  if (!agent) {
    return { state, effects: [] };
  }

  const newAgents = new Map(state.agents);
  newAgents.delete(agentId);

  const newState = { ...state, agents: newAgents };

  const disconnectBroadcast = {
    type: 'AGENT_DISCONNECT',
    agentId,
    slot: 0,
    seq: 0,
    ts: Date.now(),
    payload: { name: agent.name, slot: agent.slot },
  };

  return {
    state: newState,
    effects: [
      { type: Effect.BROADCAST, message: disconnectBroadcast },
      { type: Effect.LOG, level: 'info', message: `Agent disconnected: ${agent.name} (slot ${agent.slot})` },
    ],
  };
}

// ── recordError ───────────────────────────────────────────────────────────────

/**
 * Track a validation error for an agent. Returns updated state and a
 * DISCONNECT effect if the error rate exceeds the threshold.
 *
 * @param {RelayState} state
 * @param {string} agentId
 * @param {string} reason
 * @returns {{ state: RelayState, effects: Array<object> }}
 */
export function recordError(state, agentId, reason) {
  const agent = state.agents.get(agentId);
  if (!agent) {
    return { state, effects: [] };
  }

  const now = Date.now();
  const windowElapsed = now - agent.errorWindowStart;
  const resetWindow = windowElapsed > ERROR_WINDOW_MS;

  const updatedAgent = {
    ...agent,
    errorCount: resetWindow ? 1 : agent.errorCount + 1,
    errorWindowStart: resetWindow ? now : agent.errorWindowStart,
  };

  const newAgents = new Map(state.agents);
  newAgents.set(agentId, updatedAgent);
  const newState = { ...state, agents: newAgents };

  const errorMsg = buildError(reason, agentId);
  const effects = [{ type: Effect.SEND_TO, agentId, message: errorMsg }];

  if (updatedAgent.errorCount > MAX_ERROR_RATE) {
    effects.push({
      type: Effect.DISCONNECT,
      agentId,
      reason: `Error rate exceeded (${updatedAgent.errorCount} errors in 60s)`,
    });
  }

  return { state: newState, effects };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unauthenticated(state, agentId, type) {
  const errMsg = buildError(`Must send AGENT_CONNECT before ${type}`, agentId);
  return {
    state,
    effects: [
      { type: Effect.SEND_TO, agentId, message: errMsg },
      { type: Effect.DISCONNECT, agentId, reason: 'Unauthenticated' },
    ],
  };
}
