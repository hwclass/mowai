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
echo "Installing wkg v0.10.1..."
WKG_OS=$(uname -s)
WKG_ARCH=$(uname -m)
case "${WKG_OS}-${WKG_ARCH}" in
  Linux-x86_64)   WKG_TRIPLE="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64)  WKG_TRIPLE="aarch64-unknown-linux-gnu" ;;
  Darwin-x86_64)  WKG_TRIPLE="x86_64-apple-darwin" ;;
  Darwin-arm64)   WKG_TRIPLE="aarch64-apple-darwin" ;;
  *) echo "Unsupported platform: ${WKG_OS}-${WKG_ARCH}. Install wkg manually." ; exit 1 ;;
esac
curl -fsSL "https://github.com/bytecodealliance/wasm-pkg-tools/releases/download/v0.10.1/wkg-${WKG_TRIPLE}.tar.gz" \
  | tar -xz -C /usr/local/bin wkg
echo "✓ TinyGo + wkg ready. Run ./build.sh to recompile."
echo "  Add TinyGo to PATH: export PATH=\$PATH:/usr/local/tinygo/bin"
