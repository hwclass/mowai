#!/usr/bin/env bash
# OPTIONAL: recompiles dist/agent.wasm from source.
# Not required — dist/agent.wasm is already included in this template.
set -euo pipefail
# Generate WIT bindings
go generate ./...
# Bundle WIT into component binary format
wkg wit build
# Compile to Wasm Component via TinyGo 0.34+ wasip2 target
mkdir -p dist
tinygo build \
    -target=wasip2 \
    -no-debug \
    --wit-package mowai:agent@0.1.0.wasm \
    --wit-world agent-world \
    -o dist/agent.wasm \
    main.go
wasm-tools validate dist/agent.wasm
echo "✓ Recompiled dist/agent.wasm ($(du -sh dist/agent.wasm | cut -f1))"
