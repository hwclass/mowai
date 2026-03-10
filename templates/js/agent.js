/**
 * Mowai agent — JS template
 *
 * This file is compiled to dist/agent.wasm by jco componentize.
 * The pre-compiled wasm is already included — no need to run build.sh
 * unless you want to modify the agent logic.
 */

// Imports provided by jco host bindings (generated from wit/agent.wit)
import { hostLlm, broadcast, nowMs, log, getConfig } from 'mowai:agent/agent-world';

export const onInit = () => {
  log('info', 'JS agent initialised');
};

export const getInfo = () => ({
  name: getConfig().name,
  version: '0.1.0',
  color: getConfig().color,
  persona: getConfig().persona,
});

export const handleTask = (taskDescription) => {
  log('info', `Received task: ${taskDescription}`);
  const prompt =
    `Task for the swarm: ${taskDescription}\n\n` +
    `Respond in character. Be concise (≤ 100 words).`;
  // host-llm import: host prepends persona system prompt automatically
  const response = hostLlm(prompt);
  broadcast(response);
  return response;
};

export const onPeerThought = (_peerId, _thought) => {
  // Optional: react to peer reasoning
  // e.g. log('debug', `Peer ${_peerId}: ${_thought.slice(0, 40)}`);
};
