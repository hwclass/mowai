import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  handleConnect,
  handleMessage,
  handleDisconnect,
  recordError,
  Effect,
} from '../src/relay.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ID_A = '123e4567-e89b-4d3c-a456-426614174000';
const ID_B = '223e4567-e89b-4d3c-a456-426614174001';
const TASK_ID = '323e4567-e89b-4d3c-a456-426614174002';

const INFO_A = { name: 'swift-mantis-7', color: '#a855f7', persona: 'contrarian', version: '0.1.0' };
const INFO_B = { name: 'bold-falcon-3', color: '#22c55e', persona: 'pragmatist', version: '0.1.0' };

function thoughtMsg(agentId, overrides = {}) {
  return {
    type: 'AGENT_THOUGHT',
    agentId,
    slot: 0,
    seq: 1,
    ts: Date.now(),
    payload: { step: 1, content: 'thinking...', taskId: TASK_ID, ...overrides.payload },
    ...overrides,
  };
}

function globalTaskMsg(description = 'Debate AI safety') {
  return {
    type: 'GLOBAL_TASK',
    agentId: '00000000-0000-4000-8000-000000000000',
    slot: 0,
    seq: 0,
    ts: Date.now(),
    payload: { taskId: TASK_ID, description, issuedAt: Date.now() },
  };
}

// ── createInitialState ────────────────────────────────────────────────────────

describe('createInitialState', () => {
  test('returns empty state', () => {
    const s = createInitialState();
    assert.equal(s.agents.size, 0);
    assert.equal(s.nextSlot, 0);
    assert.deepEqual(s.recentTasks, []);
  });
});

// ── handleConnect ─────────────────────────────────────────────────────────────

describe('handleConnect', () => {
  test('increments slot counter and sends ACK', () => {
    const s0 = createInitialState();
    const { state: s1, effects: e1 } = handleConnect(s0, ID_A, INFO_A);
    assert.equal(s1.agents.size, 1);
    assert.equal(s1.nextSlot, 1);
    assert.equal(s1.agents.get(ID_A).slot, 0);

    const ack = e1.find((e) => e.type === Effect.SEND_TO && e.message.type === 'ARENA_ACK');
    assert.ok(ack, 'ACK sent');
    assert.equal(ack.message.payload.slot, 0);
    assert.equal(ack.message.payload.connectedPeers, 1);
  });

  test('second connect gets slot 1', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    ({ state } = handleConnect(state, ID_B, INFO_B));
    assert.equal(state.agents.get(ID_B).slot, 1);
    assert.equal(state.nextSlot, 2);
  });

  test('duplicate agentId triggers disconnect', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    const { effects } = handleConnect(state, ID_A, INFO_A);
    const disc = effects.find((e) => e.type === Effect.DISCONNECT);
    assert.ok(disc);
    assert.match(disc.reason, /Duplicate/);
  });

  test('late-joiner receives recentTasks', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    // Simulate server injecting a GLOBAL_TASK
    ({ state } = handleMessage(state, ID_A, globalTaskMsg()));

    // ID_B joins after the task
    const { effects } = handleConnect(state, ID_B, INFO_B);
    const taskSend = effects.find(
      (e) => e.type === Effect.SEND_TO && e.message.type === 'GLOBAL_TASK' && e.agentId === ID_B,
    );
    assert.ok(taskSend, 'Late-joiner receives recent task');
  });
});

// ── handleMessage ─────────────────────────────────────────────────────────────

describe('handleMessage — AGENT_THOUGHT', () => {
  test('produces BROADCAST and PEER_THOUGHT per peer', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    ({ state } = handleConnect(state, ID_B, INFO_B));

    const { effects } = handleMessage(state, ID_A, thoughtMsg(ID_A));

    const broadcast = effects.filter((e) => e.type === Effect.BROADCAST);
    assert.equal(broadcast.length, 1);

    const peerThoughts = effects.filter(
      (e) => e.type === Effect.SEND_TO && e.message.type === 'PEER_THOUGHT',
    );
    // Only B should receive PEER_THOUGHT (not A itself)
    assert.equal(peerThoughts.length, 1);
    assert.equal(peerThoughts[0].agentId, ID_B);
  });

  test('unauthenticated agent gets error + disconnect', () => {
    const state = createInitialState();
    const { effects } = handleMessage(state, ID_A, thoughtMsg(ID_A));
    const disc = effects.find((e) => e.type === Effect.DISCONNECT);
    assert.ok(disc);
  });
});

describe('handleMessage — AGENT_RESPONSE', () => {
  test('broadcasts to all agents', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    const msg = { ...thoughtMsg(ID_A), type: 'AGENT_RESPONSE', payload: { content: 'answer', taskId: TASK_ID, durationMs: 500 } };
    const { effects } = handleMessage(state, ID_A, msg);
    const broadcast = effects.find((e) => e.type === Effect.BROADCAST);
    assert.ok(broadcast);
    assert.equal(broadcast.message.type, 'AGENT_RESPONSE');
  });
});

describe('handleMessage — GLOBAL_TASK', () => {
  test('stores in recentTasks (up to 5) and broadcasts', () => {
    let state = createInitialState();
    for (let i = 0; i < 7; i++) {
      ({ state } = handleMessage(state, 'server', { ...globalTaskMsg(`task ${i}`) }));
    }
    assert.equal(state.recentTasks.length, 5);
    assert.equal(state.recentTasks[4].payload.description, 'task 6');
  });

  test('routes GLOBAL_TASK to all agents', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    const { effects } = handleMessage(state, 'server', globalTaskMsg());
    const broadcast = effects.find((e) => e.type === Effect.BROADCAST);
    assert.ok(broadcast);
    assert.equal(broadcast.message.type, 'GLOBAL_TASK');
  });
});

describe('handleMessage — PING', () => {
  test('responds with PONG', () => {
    const state = createInitialState();
    const { effects } = handleMessage(state, ID_A, { type: 'PING' });
    const pong = effects.find((e) => e.type === Effect.SEND_TO && e.message.type === 'PONG');
    assert.ok(pong);
    assert.equal(pong.agentId, ID_A);
  });
});

// ── handleDisconnect ──────────────────────────────────────────────────────────

describe('handleDisconnect', () => {
  test('removes agent and broadcasts AGENT_DISCONNECT', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    const { state: s2, effects } = handleDisconnect(state, ID_A);
    assert.equal(s2.agents.size, 0);
    const broadcast = effects.find((e) => e.type === Effect.BROADCAST);
    assert.ok(broadcast);
    assert.equal(broadcast.message.type, 'AGENT_DISCONNECT');
    assert.equal(broadcast.message.agentId, ID_A);
  });

  test('disconnect of unknown agent is a no-op', () => {
    const state = createInitialState();
    const { state: s2, effects } = handleDisconnect(state, ID_A);
    assert.equal(s2.agents.size, 0);
    assert.equal(effects.length, 0);
  });
});

// ── recordError ───────────────────────────────────────────────────────────────

describe('recordError', () => {
  test('sends ARENA_ERROR to agent', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    const { effects } = recordError(state, ID_A, 'bad message');
    const errSend = effects.find((e) => e.type === Effect.SEND_TO && e.message.type === 'ARENA_ERROR');
    assert.ok(errSend);
  });

  test('triggers disconnect after >10 errors per minute', () => {
    let state = createInitialState();
    ({ state } = handleConnect(state, ID_A, INFO_A));
    for (let i = 0; i < 11; i++) {
      ({ state } = recordError(state, ID_A, 'err').state ? recordError(state, ID_A, 'err') : { state, effects: [] });
      // Re-call properly
      const r = recordError(state, ID_A, 'err');
      state = r.state;
    }
    const { effects } = recordError(state, ID_A, 'one more');
    const disc = effects.find((e) => e.type === Effect.DISCONNECT);
    assert.ok(disc);
    assert.match(disc.reason, /Error rate exceeded/);
  });
});

// ── 200-agent stress test ─────────────────────────────────────────────────────

describe('stress test', () => {
  test('200 agent connects complete in < 100ms (pure, no I/O)', () => {
    const start = Date.now();
    let state = createInitialState();

    for (let i = 0; i < 200; i++) {
      const agentId = `${i.toString(16).padStart(8, '0')}-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
      ({ state } = handleConnect(state, agentId, {
        name: `agent-${i}`,
        color: '#ffffff',
        persona: 'contrarian',
        version: '0.1.0',
      }));
    }

    const elapsed = Date.now() - start;
    assert.equal(state.agents.size, 200);
    assert.ok(elapsed < 100, `Expected < 100ms, got ${elapsed}ms`);
  });
});
