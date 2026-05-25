#!/usr/bin/env bash
# Ad-hoc sign the spike .node addon and the dev Electron binary so
# task_for_pid + com.apple.security.cs.debugger entitlement work in
# `pnpm dev`. Throw-away helper — deleted (or moved to scripts/archive/)
# at the end of `spike-hearthmirror-mac-bridge`.
#
# Usage: bash scripts/codesign-mac-spike.sh
# Requires: macOS host with `codesign` available (built-in).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
SPIKE="$ROOT/packages/hearthmirror-mac-spike"
ENTITLEMENTS="$SPIKE/entitlements.dev.plist"

if [[ ! -f "$ENTITLEMENTS" ]]; then
  echo "ERROR: entitlements file not found at $ENTITLEMENTS" >&2
  exit 1
fi

# Locate the napi-rs build artifact. With `napi build --platform`
# the .node lands directly next to package.json with a triple suffix.
NODE_BIN=""
for candidate in \
  "$SPIKE/hearthmirror-mac-spike.darwin-arm64.node" \
  "$SPIKE/hearthmirror-mac-spike.darwin-aarch64.node"; do
  if [[ -f "$candidate" ]]; then
    NODE_BIN="$candidate"
    break
  fi
done

if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: spike .node binary not found under $SPIKE" >&2
  echo "       run \`pnpm --filter @hdt/hearthmirror-mac-spike build\` first" >&2
  exit 1
fi

echo "==> ad-hoc signing $NODE_BIN"
codesign --force --sign - \
  --entitlements "$ENTITLEMENTS" \
  --options runtime \
  "$NODE_BIN"

# Apple's Hardened Runtime requires that the host process loading a
# .node addon be signed with matching entitlements. For the dev build
# we reach into node_modules/electron and ad-hoc sign the bundled
# Electron.app.
ELECTRON_APP="$ROOT/node_modules/electron/dist/Electron.app"
if [[ -d "$ELECTRON_APP" ]]; then
  echo "==> ad-hoc signing dev Electron at $ELECTRON_APP"
  # --deep is needed so frameworks under Electron.app/Contents/Frameworks
  # (Electron Helper, Squirrel.Mac, etc) get re-signed with our entitlements.
  codesign --force --deep --sign - \
    --entitlements "$ENTITLEMENTS" \
    --options runtime \
    "$ELECTRON_APP"
else
  echo "WARNING: dev Electron not found at $ELECTRON_APP" >&2
  echo "         run \`pnpm install\` from repo root first; signing skipped" >&2
fi

echo
echo "==> verifying spike addon signature"
codesign -dv --verbose=4 "$NODE_BIN" 2>&1 | head -20

echo
echo "Done. Now run \`pnpm dev\` from repo root with Hearthstone running."
