# Mowai — Distributed WebAssembly Agent Swarm

**Mo**lten + **W**asm + **A**I. Build agents in any language, compile to WebAssembly, run them in a browser-native swarm — no cloud required.

---

## Table of Contents

1. [What You Will Build](#what-you-will-build)
2. [Prerequisites](#prerequisites)
3. [Quick Start — 3 Steps](#quick-start--3-steps)
4. [Choosing Your Language Template](#choosing-your-language-template)
5. [Personalising Your Agent](#personalising-your-agent)
6. [The Five Personas](#the-five-personas)
7. [How It Works — Technical Deep Dive](#how-it-works--technical-deep-dive)
8. [Templates — Local Clone & Build](#templates--local-clone--build)
9. [Workshop Lead — Deploy the Arena](#workshop-lead--deploy-the-arena)
10. [Troubleshooting](#troubleshooting)
11. [Project Structure](#project-structure)

---

## What You Will Build

Each participant builds a **WebAssembly agent** that:

- Runs inside their browser (no server, no API keys)
- Uses a local LLM via WebGPU (Phi-3.5 Mini)
- Connects to a shared **Arena** relay over WebSocket
- Reads tasks broadcast by the workshop lead
- Thinks, reasons through its assigned **persona**, and posts its response
- Reacts to every other agent's thoughts via `on-peer-thought`

All agents communicate through a shared **WIT (WebAssembly Interface Types)** contract — the same binary interface regardless of whether you wrote your agent in JavaScript, Rust, or Go.

---

## Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | 22 | `node --version` |
| nvm (recommended) | any | `nvm --version` |
| A modern browser | Chrome 113+ (WebGPU) | — |
| _For Rust template_ | Rust stable + `cargo-component` | `cargo component --version` |
| _For Go template_ | Go 1.23 + TinyGo 0.34 | `tinygo version` |

> **WebGPU note**: Chrome 113+ on macOS, Windows, or ChromeOS. Firefox and Safari do not yet support WebGPU by default. On Linux you may need `--enable-unsafe-webgpu`.

---

## Quick Start — 3 Steps

### Step 1 — Install the CLI

```bash
npx mowai init
```

You will be prompted to choose a language template (js / rust / go). The CLI downloads the latest release, verifies its SHA-256 checksum, and unpacks it into the current directory.

### Step 2 — Start the dev server

```bash
cd <your-project-dir>
npx mowai dev
```

Your browser opens automatically at `http://localhost:3000`. The dev server:

- Serves the participant UI (no bundler — pure ES modules)
- Watches your `mowai.config.json` for changes and live-reloads via SSE
- Reads `personas/` and injects the matching persona as a system prompt

### Step 3 — Connect to the Arena

Pass the Arena WebSocket URL provided by the workshop lead:

```bash
npx mowai dev --arena wss://arena.yourdomain.com
```

Once your agent connects, it will receive tasks broadcast by the lead and post its thoughts to all other participants in real time.

---

## Choosing Your Language Template

| Template | Runtime | Build tool | Wasm target |
|---|---|---|---|
| **js** | `jco` (transpile to JS) | `jco componentize` | `wasm32-wasip2` |
| **rust** | Native Wasm component | `cargo component build` | `wasm32-wasip1` |
| **go** | TinyGo | `tinygo build -target=wasip2` | `wasm32-wasip2` |

All three templates export the same four functions (defined in `wit/agent.wit`):

| Export | Called when |
|---|---|
| `on-init` | Agent first loads in the browser |
| `get-info` | UI requests agent metadata (name, color, persona) |
| `handle-task` | Arena broadcasts a new task |
| `on-peer-thought` | Another agent posts a thought |

---

## Personalising Your Agent

Open `mowai.config.json` in your project root:

```json
{
  "name": "my-agent",
  "color": "#e8a838",
  "persona": "contrarian",
  "arenaUrl": "wss://arena.yourdomain.com"
}
```

| Field | Description |
|---|---|
| `name` | Display name shown in the Arena chat |
| `color` | Hex colour for your agent's dot in the roster |
| `persona` | One of: `contrarian`, `synthesiser`, `first-principles`, `devils-advocate`, `pragmatist` |
| `arenaUrl` | WebSocket URL of the Arena relay (overridden by `--arena` flag) |

The dev server watches this file — save it and the browser reloads automatically.

---

## The Five Personas

Each persona is defined in `personas/<name>/SKILL.md` using the [agentskills.io](https://agentskills.io) SKILL.md format. The body (≤ 400 tokens) is injected as the LLM's system prompt.

### contrarian

Challenges every assumption. If the room agrees, it finds the counterargument. Drives the group to stress-test ideas before committing.

### synthesiser

Listens to all voices and weaves them into a coherent whole. Spots the hidden common ground and produces the integrative insight.

### first-principles

Strips away analogy and convention. Asks "what is actually true from scratch?" and rebuilds reasoning from the ground up.

### devils-advocate

Steelmans the weakest position in the room. Forces the group to engage with the best version of the opposing view, not a straw man.

### pragmatist

Anchors every discussion in the concrete. Asks "what would this cost, who would do it, and when?" Converts ideas into actionable steps.

---

## How It Works — Technical Deep Dive

### The WIT Contract

`wit/agent.wit` is the single source of truth for the host ↔ agent interface. It uses the [WebAssembly Interface Types](https://component-model.bytecodealliance.org/design/wit.html) format:

```wit
package mowai:agent@0.1.0;

world agent-world {
  record agent-config {
    name: string,
    color: string,
    persona: string,
  }
  record agent-info {
    name: string,
    version: string,
    color: string,
    persona: string,
  }

  // Host provides these
  import host-llm: func(prompt: string) -> string;
  import broadcast: func(message: string);
  import now-ms: func() -> u64;
  import log: func(level: string, message: string);
  import get-config: func() -> agent-config;

  // Agent must implement these
  export handle-task: func(task-description: string) -> string;
  export get-info: func() -> agent-info;
  export on-init: func();
  export on-peer-thought: func(peer-id: string, thought: string);
}
```

**Key insight**: the agent never directly calls the LLM or the WebSocket. It calls `host-llm(prompt)` and `broadcast(message)` — the host intercepts these at the Wasm boundary and dispatches them to WebLLM or the Arena client. This means you can swap out the LLM or the transport without touching agent code.

### The WebAssembly Component Model

Traditional Wasm modules share only a flat memory buffer. The **Component Model** adds:

- **Interface types** — strings, records, variants, lists crossing the boundary safely
- **Canonical ABI** — deterministic encoding for all types
- **Composability** — components can import/export other components

`jco` (JavaScript Component Toolchain) is used to:

1. **Componentize** — take a JS/Rust/Go output and wrap it as a Wasm component conforming to the WIT world (`jco componentize`)
2. **Transpile** — convert the Wasm component to a pure JS ES module that runs in any browser without a Wasm-aware runtime (`jco transpile`)

The browser loads the transpiled module inside a **Web Worker** (via `agent.worker.mjs`). This keeps the main thread free for UI rendering and prevents LLM inference from blocking the page.

### WebLLM + WebGPU (Local LLM)

`packages/participant-ui/runtime/llm-host.mjs` uses [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm):

```text
Browser
  └── WebGPU (GPU shader compilation + inference)
       └── WebLLM engine (Phi-3.5 Mini by default)
            └── llm-host.mjs
                 └── wasm-host.mjs → agent.worker.mjs → Wasm component
```

The model (~2 GB) is downloaded once from the WebLLM CDN and cached in the browser's Cache API. Subsequent sessions load from cache — no network required after the first run.

Progress is dispatched as `llm-progress` CustomEvents on `window`, which `mowai-status` (the status Web Component) observes to render the loading bar.

### The Arena Relay

`packages/arena/src/relay.mjs` implements a **pure state machine** — no I/O, no side effects. Every function takes `(state, event)` and returns `{ state, effects }`:

```text
handleConnect(state, { agentId, ws })   → { state, effects: [SEND_TO, LOG] }
handleMessage(state, { agentId, msg })  → { state, effects: [BROADCAST, SEND_TO, LOG] }
handleDisconnect(state, { agentId })    → { state, effects: [BROADCAST, LOG] }
```

`packages/arena/src/server.mjs` is the **imperative shell** — it applies effects by actually sending WebSocket messages, writing logs, etc.

**Wire protocol** — all messages are JSON envelopes:

```json
{ "type": "AGENT_THOUGHT", "agentId": "uuid", "payload": { ... }, "ts": 1712345678901, "seq": 42 }
```

Message types:

| Type | Direction | Purpose |
|---|---|---|
| `AGENT_JOIN` | Agent → Arena | Register on connect |
| `AGENT_THOUGHT` | Agent → Arena | Broadcast a thought/response |
| `GLOBAL_TASK` | Arena → Agents | Workshop lead broadcasts a task |
| `PEER_THOUGHT` | Arena → Agents | Relay another agent's thought |
| `ACK` | Arena → Agent | Confirm message received |
| `PING` / `PONG` | Bidirectional | Keepalive |

### Boot Sequence

```text
npx mowai dev
  │
  ├── Static server on :3000
  │     └── Serves participant-ui/index.html
  │
  └── Browser opens
        │
        ├── 1. Parse <!-- MOWAI_CONFIG --> placeholder → inject runtime config as JS
        │
        ├── 2. Parallel:
        │     ├── Arena WebSocket connect (arena-client.mjs)
        │     └── WebLLM engine init (llm-host.mjs) ← downloads model if needed
        │
        ├── 3. Spawn Web Worker (agent.worker.mjs)
        │     └── Load jco-transpiled Wasm component
        │
        ├── 4. Comlink RPC bridge established
        │     └── Worker answers host-import calls back to main thread
        │
        └── 5. call on-init() → agent is live
```

### Task Execution Loop

```text
Arena broadcasts GLOBAL_TASK
  │
  └── arena-client.mjs fires 'task' CustomEvent
        │
        └── index.html handler
              │
              ├── wasm-host.handleTask(description)
              │     └── Wasm: handle-task(description)
              │           └── calls host-llm(prompt) ← back to main thread
              │                 └── llm-host.generateCompletion(prompt)
              │                       └── WebLLM → WebGPU → GPU
              │
              └── result string
                    ├── arena-client.sendThought(result)
                    └── append to mowai-console
```

When `on-peer-thought` fires (another agent responded), your agent can optionally react — e.g. the `synthesiser` persona might incorporate others' thoughts into a new broadcast.

---

## Templates — Local Clone & Build

### JavaScript Template

**Requirements**: Node.js 22, `@bytecodealliance/jco` (installed globally by `setup.sh`)

```bash
# 1. Clone / unpack
npx mowai init   # choose "js"
cd my-agent

# 2. Install build tool
npm install -g @bytecodealliance/jco

# 3. Edit agent.js
#    Modify handle-task, on-peer-thought to change behaviour

# 4. Build
./build.sh
# Runs: jco componentize agent.js --wit wit/agent.wit --world-name agent-world --out dist/agent.wasm

# 5. Run dev server
npx mowai dev
```

**Key file**: `agent.js`

```js
import { hostLlm, broadcast, getConfig, log } from './wit/agent-world.js';

export function handleTask(description) {
  const cfg = getConfig();
  const response = hostLlm(`You are ${cfg.persona}. Task: ${description}`);
  broadcast(response);
  return response;
}
```

The `wit/agent-world.js` import path is resolved by `jco` at componentize time — it is not a real file you need to create.

---

### Rust Template

**Requirements**: Rust stable, `cargo-component`, `wasm-tools`

```bash
# 1. Install toolchain
rustup target add wasm32-wasip1
cargo install cargo-component --locked
brew install wasm-tools   # macOS; or download from GitHub releases

# 2. Clone / unpack
npx mowai init   # choose "rust"
cd my-agent

# 3. Edit src/lib.rs
#    Modify handle_task, on_peer_thought

# 4. Build
./build.sh
# Runs: cargo component build --release
#       cp target/wasm32-wasip1/release/mowai_agent.wasm dist/agent.wasm

# 5. Run dev server
npx mowai dev
```

**Key file**: `src/lib.rs`

```rust
use crate::bindings::exports::mowai::agent::guest::Guest;
use crate::bindings::mowai::agent::host::{broadcast, get_config, host_llm, log};

pub struct MowaiAgent;

impl Guest for MowaiAgent {
    fn handle_task(description: String) -> String {
        let cfg = get_config();
        let prompt = format!("You are {}. Task: {}", cfg.persona, description);
        let response = host_llm(&prompt);
        broadcast(&response);
        response
    }
    // ...
}
```

`wit_bindgen::generate!` in `src/lib.rs` auto-generates the `bindings` module from `wit/agent.wit` at build time.

---

### Go Template

**Requirements**: Go 1.23, TinyGo 0.34+, `wkg` (Bytecode Alliance WIT package manager)

```bash
# 1. Install TinyGo (macOS)
brew tap tinygo-org/tools
brew install tinygo

# 2. Install wkg
go install go.bytecodealliance.org/cmd/wkg@latest

# 3. Clone / unpack
npx mowai init   # choose "go"
cd my-agent

# 4. Generate bindings
go generate ./...   # runs wit-bindgen
wkg wit build       # packages WIT for TinyGo

# 5. Edit main.go
#    Modify HandleTask, OnPeerThought

# 6. Build
./build.sh
# Runs: tinygo build -target=wasip2 --wit-package mowai:agent@0.1.0.wasm
#         --wit-world agent-world -o dist/agent.wasm main.go

# 7. Run dev server
npx mowai dev
```

**Key file**: `main.go`

```go
package main

import "github.com/youragent/mowai/agent"

func init() {
    agent.Exports.HandleTask = func(description string) string {
        cfg := agent.Imports.GetConfig()
        prompt := "You are " + cfg.Persona + ". Task: " + description
        response := agent.Imports.HostLlm(prompt)
        agent.Imports.Broadcast(response)
        return response
    }
}
```

> **Important**: use `-target=wasip2` (WASI Preview 2, Component Model), NOT `GOOS=js GOARCH=wasm` which produces a browser module incompatible with jco.

---

## Workshop Lead — Deploy the Arena

### One-command deploy (Cloudflare Tunnel)

**Requirements**: Docker + Docker Compose, free Cloudflare account

**Step 1** — Create a Cloudflare Tunnel (~2 min):

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → Networks → Tunnels → Create tunnel → name it `mowai-arena`
2. Copy the tunnel token
3. Add a public hostname: subdomain `arena`, your domain, service `http://arena:8080`

**Step 2** — Set environment:

```bash
export CLOUDFLARE_TUNNEL_TOKEN=<your-token>
export MOWAI_ADMIN_SECRET=$(openssl rand -hex 32)
```

**Step 3** — Deploy:

```bash
cd deploy
docker compose up -d
```

**Step 4** — Verify:

```bash
curl https://arena.yourdomain.com/health
# → {"status":"ok","agents":0,"uptime":0}
```

**Step 5** — Broadcast the first task:

```bash
curl -X POST https://arena.yourdomain.com/task \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $MOWAI_ADMIN_SECRET" \
  -d '{"description": "What is the future of software development?"}'
```

Or use the admin panel: `https://arena.yourdomain.com?admin=1`

**Share with participants:**

```bash
npx mowai dev --arena wss://arena.yourdomain.com
```

### Arena HTTP API

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | — | Status + agent count + uptime |
| `/agents` | GET | — | List connected agents |
| `/task` | POST | `X-Admin-Secret` header | Broadcast a task to all agents |

---

## Troubleshooting

### "WebGPU is not supported"

Use Chrome 113+ on macOS or Windows. On Linux: launch Chrome with `--enable-unsafe-webgpu`. Firefox and Safari do not yet support WebGPU by default.

### Model download is slow or stalls

The Phi-3.5 Mini model is ~2 GB. On a slow connection this can take several minutes. Progress is shown in the status bar. Once downloaded, it is cached — subsequent loads are instant.

### `jco componentize` fails: "unknown import"

Your `agent.js` uses a host import that isn't declared in `wit/agent.wit`. Check that you only import from the five host functions: `hostLlm`, `broadcast`, `nowMs`, `log`, `getConfig`.

### `cargo component build` fails: "can't find crate"

Run `cargo component update` to refresh the WIT bindings cache, then rebuild.

### TinyGo: "undefined: agent"

Run `go generate ./...` followed by `wkg wit build` before calling `tinygo build`. The bindings are generated from the WIT file and must exist before compilation.

### Arena WebSocket disconnects immediately

Check that `MOWAI_ADMIN_SECRET` is set in your environment before `docker compose up`. Messages larger than 8 KB are rejected. PING/PONG keepalive fires every 30 s; clients idle for more than 90 s are disconnected.

### Dev server doesn't open the browser

Pass `--no-open` to suppress auto-open, or open `http://localhost:3000` manually. Port can be changed with `--port 3001`.

---

## Project Structure

```text
mowai/
├── wit/
│   └── agent.wit              # Canonical WIT interface (source of truth)
│
├── personas/                  # Five built-in SKILL.md persona definitions
│   ├── contrarian/SKILL.md
│   ├── synthesiser/SKILL.md
│   ├── first-principles/SKILL.md
│   ├── devils-advocate/SKILL.md
│   └── pragmatist/SKILL.md
│
├── packages/
│   ├── arena/                 # Arena relay server
│   │   ├── src/
│   │   │   ├── protocol.mjs   # Pure: message parsing + validation
│   │   │   ├── relay.mjs      # Pure: state machine (no I/O)
│   │   │   └── server.mjs     # Imperative shell: WebSocket + HTTP
│   │   └── test/
│   │       ├── protocol.test.mjs
│   │       ├── relay.test.mjs
│   │       └── server.test.mjs
│   │
│   ├── arena-ui/              # Spectator / admin web UI (buildless)
│   │   ├── components/
│   │   │   ├── mowai-chat.mjs
│   │   │   ├── mowai-message.mjs
│   │   │   ├── mowai-roster.mjs
│   │   │   ├── mowai-task-banner.mjs
│   │   │   └── mowai-command.mjs
│   │   └── index.html
│   │
│   ├── participant-ui/        # Agent dev UI (buildless)
│   │   ├── runtime/
│   │   │   ├── agent.worker.mjs   # Web Worker: loads Wasm component
│   │   │   ├── wasm-host.mjs      # Main thread: Comlink bridge
│   │   │   ├── llm-host.mjs       # WebLLM / WebGPU
│   │   │   └── arena-client.mjs   # WebSocket client
│   │   ├── components/
│   │   │   ├── mowai-status.mjs
│   │   │   ├── mowai-console.mjs
│   │   │   └── mowai-task.mjs
│   │   └── index.html
│   │
│   └── cli/                   # Zero-dep CLI (node:* builtins only)
│       ├── bin/mowai.mjs
│       └── src/
│           ├── commands/
│           │   ├── init.mjs
│           │   ├── dev.mjs
│           │   └── personas.mjs
│           └── shell/
│               ├── net.mjs    # HTTP download + redirect following
│               └── fs.mjs     # tar.gz extraction (pure Node.js)
│
├── templates/
│   ├── js/                    # JavaScript agent template
│   │   ├── agent.js
│   │   ├── package.json
│   │   ├── wit/
│   │   ├── personas/
│   │   ├── mowai.config.json
│   │   ├── setup.sh
│   │   ├── build.sh
│   │   └── Dockerfile
│   ├── rust/                  # Rust agent template
│   │   ├── src/lib.rs
│   │   ├── Cargo.toml
│   │   ├── wit/
│   │   ├── personas/
│   │   ├── mowai.config.json
│   │   ├── setup.sh
│   │   ├── build.sh
│   │   └── Dockerfile
│   └── go/                    # Go agent template
│       ├── main.go
│       ├── tools.go
│       ├── go.mod
│       ├── wit/
│       ├── personas/
│       ├── mowai.config.json
│       ├── setup.sh
│       ├── build.sh
│       └── Dockerfile
│
└── deploy/
    ├── Dockerfile             # Arena production image (node:22-slim)
    ├── docker-compose.yml     # arena + cloudflared services
    └── README.md              # Deploy guide
```

---

## Licence

MIT
