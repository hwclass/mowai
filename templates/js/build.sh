#!/usr/bin/env bash
# OPTIONAL: recompiles dist/agent.wasm from source.
# Not required — dist/agent.wasm is already included in this template.
set -euo pipefail
mkdir -p dist
jco componentize agent.js \
    --wit wit \
    --world-name agent-world \
    --out dist/agent.wasm
echo "✓ Recompiled dist/agent.wasm"
