#!/usr/bin/env bash
# OPTIONAL: only needed to recompile from source.
# This one is fast — jco is Node-only, no native toolchain.
# The pre-compiled dist/agent.wasm works without running this.
set -euo pipefail
npm install -g @bytecodealliance/jco
echo "✓ jco ready. Run ./build.sh to recompile."
