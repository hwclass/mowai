/**
 * wasm-host.mjs — main thread
 *
 * Spawns the agent Web Worker, wraps it with Comlink, and exposes
 * a clean async API to the UI layer. Owns the main-thread side of
 * host imports (host-llm, broadcast, log).
 */

import * as Comlink from 'https://cdn.jsdelivr.net/npm/comlink@4/dist/esm/comlink.mjs';

/** @type {import('comlink').Remote<object>} */
let workerProxy = null;
let _llmHost = null;      // set by setLlmHost()
let _arenaClient = null;  // set by setArenaClient()

/**
 * Initialise the Wasm host.
 *
 * @param {object} opts
 * @param {string} opts.wasmPath
 * @param {object} opts.config   window.__mowai_config__.agent + .systemPrompt
 */
export async function initWasmHost({ wasmPath, config }) {
  const worker = new Worker(
    new URL('./agent.worker.mjs', import.meta.url),
    { type: 'module' },
  );

  workerProxy = Comlink.wrap(worker);

  // Expose main-thread API back to the worker
  const mainApi = Comlink.proxy({
    async hostLlm(prompt) {
      if (!_llmHost) throw new Error('LLM host not ready');
      return _llmHost.generateCompletion(prompt);
    },
    async broadcast(message) {
      if (!_arenaClient) throw new Error('Arena client not ready');
      return _arenaClient.queueBroadcast(message);
    },
    log(level, message) {
      document.dispatchEvent(new CustomEvent('agent-log', { detail: { level, message } }));
    },
  });

  await workerProxy.init(
    wasmPath,
    {
      name: config.agent.name,
      color: config.agent.color,
      persona: config.agent.persona,
    },
    mainApi,
  );

  await workerProxy.callOnInit();
}

/** @param {{ generateCompletion: (prompt: string) => Promise<string> }} host */
export function setLlmHost(host) { _llmHost = host; }

/** @param {{ queueBroadcast: (msg: string) => Promise<void> }} client */
export function setArenaClient(client) { _arenaClient = client; }

export async function handleTask(description) {
  return workerProxy.callHandleTask(description);
}

export async function getInfo() {
  return workerProxy.callGetInfo();
}

export async function onInit() {
  return workerProxy.callOnInit();
}

export async function onPeerThought(peerId, thought) {
  return workerProxy.callOnPeerThought(peerId, thought);
}
