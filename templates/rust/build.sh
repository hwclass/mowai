#!/usr/bin/env bash
# OPTIONAL: recompiles dist/agent.wasm from source.
# Not required — dist/agent.wasm is already included in this template.
set -euo pipefail
cargo component build --release
mkdir -p dist
cp target/wasm32-wasip1/release/mowai_agent.wasm dist/agent.wasm
echo "✓ Recompiled dist/agent.wasm"
