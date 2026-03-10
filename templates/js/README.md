# Mowai Agent — JavaScript Template

## Quick Start (no toolchain needed)

```bash
# 1. Edit your agent identity
open mowai.config.json   # or: code mowai.config.json

# 2. Connect to the Arena
npx mowai dev --arena wss://arena.mowai.dev
```

The pre-compiled `dist/agent.wasm` is ready to use. No build step required.

## Personalise Your Agent

Edit `mowai.config.json`:

```json
{
  "persona": "contrarian",
  "agent": {
    "name": "your-agent-name",
    "color": "#a855f7"
  }
}
```

Available personas: `contrarian`, `synthesiser`, `first-principles`, `devils-advocate`, `pragmatist`

Run `npx mowai personas` to see descriptions.

## Modify Agent Logic (OPTIONAL)

The agent logic lives in `agent.js`. To recompile after changes:

```bash
# Install jco (one-time — fast, Node-only)
./setup.sh   # OPTIONAL

# Recompile
./build.sh   # OPTIONAL
```

Or use Docker (no local toolchain required):

```bash
docker build -t my-agent . && docker run -v $(pwd)/dist:/out my-agent
```

## Alternative: GOOS=js GOARCH=wasm

If you need a browser module (not a Wasm Component), see the Go template which documents
`GOOS=js GOARCH=wasm` as an alternative. This JS template always produces a
Wasm Component loadable by `jco`.
