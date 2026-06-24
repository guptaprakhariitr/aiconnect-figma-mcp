#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 Prakhar Gupta.
#
# AIConnect for Figma — one-command setup.
# Builds the server, writes a correctly-pathed .mcp.json, and prints the
# exact next steps (plugin import + channel flow). Safe to re-run (idempotent).

set -euo pipefail

# Resolve repo root from this script's location, regardless of where it's run.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
info() { printf '  \033[36m·\033[0m %s\n' "$1"; }

echo
bold "AIConnect for Figma — setup"
echo

# 1 · Build. Prefer Bun (dev default); fall back to npm so this works anywhere.
if command -v bun >/dev/null 2>&1; then
  info "Building with Bun…"
  bun install >/dev/null 2>&1 || bun install
  bun run build
  RUNTIME="bun"
elif command -v npm >/dev/null 2>&1; then
  info "Bun not found — building with npm…"
  npm install >/dev/null 2>&1 || npm install
  npm run build
  RUNTIME="node"
else
  echo "Neither bun nor npm found. Install one and re-run." >&2
  exit 1
fi
ok "Built dist/server.js + dist/server.cjs"

# 2 · Pick a runtime for the MCP config. Node works for the published server;
#     the relay also runs under Node (scripts/relay.mjs).
if command -v node >/dev/null 2>&1; then
  CMD="node"
  SERVER_ARG="$ROOT/dist/server.js"
else
  CMD="bun"
  SERVER_ARG="$ROOT/dist/server.js"
fi

# 3 · Write .mcp.json (idempotent overwrite of our own block).
MCP_CONFIG=$(cat <<JSON
{
  "mcpServers": {
    "AIConnect": {
      "command": "$CMD",
      "args": ["$SERVER_ARG"]
    }
  }
}
JSON
)
printf '%s\n' "$MCP_CONFIG" > .mcp.json
ok "Wrote .mcp.json (server command: $CMD)"

echo
bold "Copy this into your MCP client config"
info "Claude Code: .mcp.json (already written here) · Cursor: ~/.cursor/mcp.json or project mcp.json"
echo
printf '%s\n' "$MCP_CONFIG"
echo

bold "Next steps"
echo "  1) In the Figma DESKTOP app (browser can't import dev plugins):"
echo "         Plugins → Development → Import plugin from manifest…"
echo "         → choose  $ROOT/src/figma_plugin/manifest.json"
echo
echo "  2) Run  Plugins → Development → AIConnect for Figma."
echo "     The MCP server hosts the relay, so once your agent is running the"
echo "     panel turns green on its own. (Standalone relay if ever needed:"
echo "     $RUNTIME run relay  — or  npx -y aiconnect-figma-mcp relay)"
echo
echo "  3) In your agent, just call  join_channel  (no arguments) — it"
echo "     auto-detects the plugin's channel. Then start designing."
echo
ok "Done. Keep the Figma window focused while the agent works."
echo
