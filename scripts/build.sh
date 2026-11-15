#!/usr/bin/env bash
# Build a release binary and package it for the current platform.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(grep -m1 '^version' Cargo.toml | sed 's/.*"\(.*\)".*/\1/')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$OS" in
  linux*)  PLATFORM="linux-$ARCH" ;;
  darwin*) PLATFORM="macos-$ARCH" ;;
  mingw*|msys*|cygwin*) PLATFORM="windows-$ARCH" ;;
  *) PLATFORM="$OS-$ARCH" ;;
esac

echo "==> CRAFT WARP v$VERSION — building for $PLATFORM"
cargo build --release

mkdir -p dist
BIN="target/release/craftwarp"
if [ -f "$BIN.exe" ]; then BIN="$BIN.exe"; fi
OUT="dist/craftwarp-${PLATFORM}"
if [[ "$BIN" == *.exe ]]; then OUT="$OUT.exe"; fi
cp "$BIN" "$OUT"
cp README.md LICENSE dist/
if command -v strip >/dev/null 2>&1 && [[ "$OS" != darwin* && "$BIN" != *.exe ]]; then
  strip "$OUT" || true
fi

echo "==> $(du -h "$OUT" | cut -f1)  $OUT"
echo "    running: $OUT"
if command -v zip >/dev/null 2>&1; then
  (cd dist && zip -q "craftwarp-${PLATFORM}.zip" "craftwarp-${PLATFORM}"* README.md LICENSE)
  echo "    archive: dist/craftwarp-${PLATFORM}.zip"
fi
