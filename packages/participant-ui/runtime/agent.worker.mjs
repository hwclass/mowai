/**
 * agent.worker.mjs — Web Worker
 *
 * Loads the jco-transpiled Wasm component and exposes its exports
 * via Comlink. Host imports (host-llm, broadcast, get-config, log, now-ms)
 * are answered by calling back to the main thread through Comlink.
 */

import * as Comlink from 'https://cdn.jsdelivr.net/npm/comlink@4/dist/esm/comlink.mjs';

let wasmExports = null;
let mainThread = null; // Comlink proxy back to main thread

/**
 * Called once by wasm-host.mjs to initialise the worker.
 *
 * @param {string} wasmPath   URL to dist/agent.wasm
 * @param {object} config     { name, color, persona, systemPrompt }
 * @param {Comlink.Remote}    mainProxy — proxy to main-thread API
 */
async function init(wasmPath, config, mainProxy) {
  mainThread = mainProxy;

  // Host imports required by the WIT interface
  const imports = {
    'mowai:agent/agent-world': {
      'host-llm': async (prompt) => {
        return mainThread.hostLlm(prompt);
      },
      'broadcast': async (message) => {
        return mainThread.broadcast(message);
      },
      'now-ms': () => BigInt(Date.now()),
      'log': (level, message) => {
        mainThread.log(level, message);
      },
      'get-config': () => ({
        name: config.name,
        color: config.color,
        persona: config.persona,
      }),
    },
  };

  // Load the Wasm component via jco's generated JS bindings
  // The transpiled module is expected at /dist/bindings/agent.js
  const { instantiate } = await import('/dist/bindings/agent.js');
  wasmExports = await instantiate(
    async (importObject) => {
      const response = await fetch(wasmPath);
      return WebAssembly.instantiate(await response.arrayBuffer(), importObject);
    },
    imports,
  );
}

async function callOnInit() {
  if (!wasmExports) throw new Error('Worker not initialised');
  return wasmExports['on-init']();
}

async function callGetInfo() {
  if (!wasmExports) throw new Error('Worker not initialised');
  return wasmExports['get-info']();
}

async function callHandleTask(description) {
  if (!wasmExports) throw new Error('Worker not initialised');
  return wasmExports['handle-task'](description);
}

async function callOnPeerThought(peerId, thought) {
  if (!wasmExports) throw new Error('Worker not initialised');
  return wasmExports['on-peer-thought'](peerId, thought);
}

Comlink.expose({ init, callOnInit, callGetInfo, callHandleTask, callOnPeerThought });
