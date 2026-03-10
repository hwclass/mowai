#!/usr/bin/env bash
# OPTIONAL: only needed if you want to modify and recompile the agent.
# The pre-compiled dist/agent.wasm works without running this.
set -euo pipefail
echo "Installing Rust toolchain..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup target add wasm32-wasip1
cargo install cargo-component --locked
cargo install wasm-tools --locked
echo "✓ Rust toolchain ready. Run ./build.sh to recompile."
