import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMessage,
  validateEnvelope,
  validatePayload,
  buildAck,
  buildGlobalTask,
  buildError,
  buildPeerThought,
} from '../src/protocol.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_UUID = '123e4567-e89b-4d3c-a456-426614174000';
const NOW = Date.now();

function makeEnvelope(overrides = {}) {
  return {
    type: 'AGENT_THOUGHT',
    agentId: VALID_UUID,
    slot: 1,
    seq: 1,
    ts: NOW,
    payload: {
      step: 1,
      content: 'hello',
      taskId: VALID_UUID,
    },
    ...overrides,
  };
}

// ── parseMessage ──────────────────────────────────────────────────────────────

describe('parseMessage', () => {
  test('valid JSON object round-trips', () => {
    const msg = { type: 'PING', agentId: VALID_UUID, seq: 1, ts: NOW };
    const result = parseMessage(JSON.stringify(msg));
    assert.ok(result.ok);
    assert.equal(result.value.type, 'PING');
  });

  test('malformed JSON returns error', () => {
    const result = parseMessage('{bad json}');
    assert.ok(!result.ok);
    assert.match(result.error, /Malformed JSON/);
  });

  test('JSON array returns error', () => {
    const result = parseMessage('[1,2,3]');
    assert.ok(!result.ok);
    assert.match(result.error, /JSON object/);
  });

  test('non-string input returns error', () => {
    const result = parseMessage(42);
    assert.ok(!result.ok);
  });
});

// ── validateEnvelope ──────────────────────────────────────────────────────────

describe('validateEnvelope', () => {
  test('valid message passes', () => {
    const result = validateEnvelope(makeEnvelope(), new Map(), NOW);
    assert.ok(result.valid);
  });

  test('invalid UUID v4 fails', () => {
    const result = validateEnvelope(
      makeEnvelope({ agentId: 'not-a-uuid' }),
      new Map(),
      NOW,
    );
    assert.ok(!result.valid);
    assert.match(result.reason, /UUID/);
  });

  test('non-increasing seq fails', () => {
    const seqMap = new Map([[VALID_UUID, 5]]);
    const result = validateEnvelope(makeEnvelope({ seq: 5 }), seqMap, NOW);
    assert.ok(!result.valid);
    assert.match(result.reason, /Non-increasing seq/);
  });

  test('equal seq fails', () => {
    const seqMap = new Map([[VALID_UUID, 3]]);
    const result = validateEnvelope(makeEnvelope({ seq: 3 }), seqMap, NOW);
    assert.ok(!result.valid);
  });

  test('higher seq passes', () => {
    const seqMap = new Map([[VALID_UUID, 3]]);
    const result = validateEnvelope(makeEnvelope({ seq: 4 }), seqMap, NOW);
    assert.ok(result.valid);
  });

  test('timestamp more than 30s in the past fails', () => {
    const result = validateEnvelope(
      makeEnvelope({ ts: NOW - 31_000 }),
      new Map(),
      NOW,
    );
    assert.ok(!result.valid);
    assert.match(result.reason, /drift/);
  });

  test('timestamp more than 30s in the future fails', () => {
    const result = validateEnvelope(
      makeEnvelope({ ts: NOW + 31_000 }),
      new Map(),
      NOW,
    );
    assert.ok(!result.valid);
    assert.match(result.reason, /drift/);
  });

  test('timestamp within 30s passes', () => {
    const result = validateEnvelope(
      makeEnvelope({ ts: NOW - 29_000 }),
      new Map(),
      NOW,
    );
    assert.ok(result.valid);
  });

  test('unknown type fails', () => {
    const result = validateEnvelope(
      makeEnvelope({ type: 'UNKNOWN_TYPE' }),
      new Map(),
      NOW,
    );
    assert.ok(!result.valid);
    assert.match(result.reason, /Unknown message type/);
  });

  test('PING bypasses UUID and seq checks', () => {
    const result = validateEnvelope(
      { type: 'PING', agentId: undefined, seq: undefined, ts: undefined },
      new Map(),
      NOW,
    );
    assert.ok(result.valid);
  });
});

// ── validatePayload ───────────────────────────────────────────────────────────

describe('validatePayload', () => {
  test('AGENT_CONNECT valid payload passes', () => {
    const msg = makeEnvelope({
      type: 'AGENT_CONNECT',
      payload: { name: 'swift-mantis-7', color: '#a855f7', persona: 'contrarian', version: '0.1.0' },
    });
    assert.ok(validatePayload(msg).valid);
  });

  test('AGENT_CONNECT missing name fails', () => {
    const msg = makeEnvelope({
      type: 'AGENT_CONNECT',
      payload: { color: '#a855f7', persona: 'contrarian', version: '0.1.0' },
    });
    const result = validatePayload(msg);
    assert.ok(!result.valid);
    assert.match(result.reason, /name/);
  });

  test('AGENT_CONNECT name exceeds max length fails', () => {
    const msg = makeEnvelope({
      type: 'AGENT_CONNECT',
      payload: { name: 'x'.repeat(65), color: '#a855f7', persona: 'contrarian', version: '0.1.0' },
    });
    assert.ok(!validatePayload(msg).valid);
  });

  test('AGENT_THOUGHT valid payload passes', () => {
    const msg = makeEnvelope();
    assert.ok(validatePayload(msg).valid);
  });

  test('AGENT_THOUGHT content too long fails', () => {
    const msg = makeEnvelope({
      payload: { step: 1, content: 'x'.repeat(1025), taskId: VALID_UUID },
    });
    const result = validatePayload(msg);
    assert.ok(!result.valid);
    assert.match(result.reason, /content/);
  });

  test('AGENT_THOUGHT invalid taskId fails', () => {
    const msg = makeEnvelope({
      payload: { step: 1, content: 'ok', taskId: 'not-a-uuid' },
    });
    assert.ok(!validatePayload(msg).valid);
  });

  test('AGENT_THOUGHT step zero fails', () => {
    const msg = makeEnvelope({
      payload: { step: 0, content: 'ok', taskId: VALID_UUID },
    });
    assert.ok(!validatePayload(msg).valid);
  });

  test('AGENT_RESPONSE valid payload passes', () => {
    const msg = makeEnvelope({
      type: 'AGENT_RESPONSE',
      payload: { content: 'result', taskId: VALID_UUID, durationMs: 1500 },
    });
    assert.ok(validatePayload(msg).valid);
  });

  test('AGENT_RESPONSE content too long fails', () => {
    const msg = makeEnvelope({
      type: 'AGENT_RESPONSE',
      payload: { content: 'x'.repeat(2049), taskId: VALID_UUID, durationMs: 0 },
    });
    assert.ok(!validatePayload(msg).valid);
  });

  test('PING passes without payload', () => {
    const msg = { type: 'PING', payload: undefined };
    assert.ok(validatePayload(msg).valid);
  });
});

// ── Builders ──────────────────────────────────────────────────────────────────

describe('buildAck', () => {
  test('produces ARENA_ACK with correct payload', () => {
    const msg = buildAck(3, 10, '0.1.0');
    assert.equal(msg.type, 'ARENA_ACK');
    assert.equal(msg.payload.slot, 3);
    assert.equal(msg.payload.connectedPeers, 10);
    assert.equal(msg.payload.arenaVersion, '0.1.0');
  });
});

describe('buildGlobalTask', () => {
  test('produces GLOBAL_TASK with description and taskId', () => {
    const msg = buildGlobalTask('Debate this topic', VALID_UUID);
    assert.equal(msg.type, 'GLOBAL_TASK');
    assert.equal(msg.payload.description, 'Debate this topic');
    assert.equal(msg.payload.taskId, VALID_UUID);
    assert.ok(typeof msg.payload.issuedAt === 'number');
  });
});

describe('buildError', () => {
  test('produces ARENA_ERROR with reason', () => {
    const msg = buildError('Invalid UUID', VALID_UUID);
    assert.equal(msg.type, 'ARENA_ERROR');
    assert.equal(msg.payload.reason, 'Invalid UUID');
    assert.equal(msg.payload.targetAgentId, VALID_UUID);
  });
});

describe('buildPeerThought', () => {
  test('produces PEER_THOUGHT with correct fields', () => {
    const msg = buildPeerThought(VALID_UUID, VALID_UUID, 2, 'interesting idea');
    assert.equal(msg.type, 'PEER_THOUGHT');
    assert.equal(msg.payload.sourceAgentId, VALID_UUID);
    assert.equal(msg.payload.step, 2);
    assert.equal(msg.payload.content, 'interesting idea');
  });
});
