# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## Project Overview

**AIConnect** — an MCP (Model Context Protocol) server + Figma plugin that let an AI
agent read and edit a live Figma file. Three components communicate in a pipeline:

```
MCP client ←(stdio)→ MCP Server ←(WebSocket)→ WebSocket Relay ←(WebSocket)→ Figma Plugin
```

## Build & Development Commands

```bash
bun install              # Install dependencies
bun run build            # Build MCP server (tsup → dist/)
bun run dev              # Build in watch mode
bun socket               # Start WebSocket relay server (port 3055)
bun run start            # Run built MCP server
bun run test             # Connection-free coverage test (tests/coverage.mjs)
bun run test:smoke <chan> # Live smoke test against the plugin (tests/smoke.mjs)
bun setup                # Install + write .mcp.json
```

## Architecture

### MCP Server (`src/aiconnect_mcp/server.ts`)
Implements the MCP protocol via `@modelcontextprotocol/sdk`. Exposes the tools (create
shapes, text, layouts, fills/gradients/effects, images, export, `batch_ops`, etc.).
Each request gets a UUID, tracked in a `pendingRequests` Map with timeout/promise
callbacks, and resolves when the plugin responds.

### WebSocket Relay (`src/socket.ts`)
Lightweight Bun WebSocket server on port 3055 (configurable via `PORT`). Routes messages
between server and plugin using channel-based isolation; `join` enters a channel and
messages broadcast only within it.

### Figma Plugin (`src/figma_plugin/`)
Runs inside Figma. `code.js` is the main thread: a `handleCommand` dispatcher over the
Plugin API (including `batch_ops`, which runs many commands in one round-trip with
`@ref` placeholders). `ui.html` manages the WebSocket connection. `manifest.json`
declares dynamic-page access and localhost-only network. The plugin is **not bundled** —
`code.js` is the runtime artifact, so re-run the plugin in Figma after editing it.

## Key Patterns

- **Colors**: RGBA 0-1 floats. `set_fill_color` accepts both top-level `{r,g,b,a}` and `{color:{…}}`.
- **batch_ops**: prefer it for multi-node builds; one round-trip instead of dozens of calls.
- **Logging**: stderr only — stdout is reserved for MCP protocol messages.
- **Timeouts**: 30s default per command (180s for `batch_ops`).
- **Reconnection**: the plugin UI auto-reconnects to the relay after a short delay.
- **Zod validation**: all tool params validated with Zod.
- **No telemetry**: the plugin makes no external network calls.

## Setup

1. `bun install && bun run build`
2. `bun socket` in one terminal
3. Figma → Plugins → Development → Import plugin from manifest → `src/figma_plugin/manifest.json`
4. Run the plugin, copy the channel id, register the server in your MCP client, then `join_channel`.
