#!/usr/bin/env bash
# OPTIONAL: only needed to recompile from source.
# The pre-compiled dist/agent.wasm works without running this.
set -euo pipefail
echo "Installing TinyGo 0.34+..."
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
[ "$ARCH" = "x86_64" ] && ARCH="amd64"
[ "$ARCH" = "aarch64" ] && ARCH="arm64"
TINYGO_URL="https://github.com/tinygo-org/tinygo/releases/download/v0.34.0/tinygo0.34.0.${OS}-${ARCH}.tar.gz"
curl -fsSL "$TINYGO_URL" | tar -xz -C /usr/local
export PATH="$PATH:/usr/local/tinygo/bin"
go install go.bytecodealliance.org/cmd/wkg@latest
echo "✓ TinyGo ready. Run ./build.sh to recompile."
echo "  Add to PATH: export PATH=\$PATH:/usr/local/tinygo/bin"
