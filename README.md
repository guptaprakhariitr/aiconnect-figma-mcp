# FigmaAIConnect

An MCP (Model Context Protocol) server **and** a Figma plugin that let an AI agent
(Claude Code, Cursor, or any MCP client) **read and edit a live Figma file** over a
local WebSocket — create frames, text, auto-layout, fills, gradients, effects, SVGs,
import real images, clone nodes, and assemble entire pages in one call.

## How it works

```
AI agent (MCP client)
        │  MCP (stdio)
        ▼
  MCP server  ──┐
                │  WebSocket  ws://localhost:3055
  Figma plugin ─┘   (the relay / socket server)
        │  Plugin API
        ▼
   Your Figma file
```

Three processes:
1. **MCP server** (`src/figma_ai_connect_mcp/server.ts` → `dist/server.js`) — exposes tools to the agent and forwards them as commands.
2. **WebSocket relay** (`src/socket.ts`) — a tiny channel-based broker on port `3055`.
3. **Figma plugin** (`src/figma_plugin/`) — runs inside Figma, executes commands against the Plugin API, returns results.

The agent and the plugin join the same **channel**; messages route between them through the relay.

## Quick start

Requires [Bun](https://bun.sh) and the Figma desktop app.

```bash
bun install
bun run build      # build the MCP server → dist/
bun socket         # start the WebSocket relay (leave running) → port 3055
```

**Install the plugin in Figma** (development):
- Figma → *Plugins → Development → Import plugin from manifest…* → pick `src/figma_plugin/manifest.json`.
- Run it: *Plugins → Development → FigmaAIConnect*. The plugin UI shows a **channel** id — copy it.

**Register the MCP server** with your client (`.mcp.json` for Claude Code, `mcp.json` for Cursor):

```json
{
  "mcpServers": {
    "FigmaAIConnect": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/figma-ai-connect-mcp/dist/server.js"]
    }
  }
}
```

**Join the channel.** In the agent, call `join_channel` with the id from the plugin UI. Now the agent can drive Figma.

> Keep the Figma window focused while the agent works — Figma throttles/pauses plugins whose window is in the background, which shows up as command timeouts.

## `batch_ops` — build pages in one call

One tool call per node is correct but slow and token-heavy: a single page can be
100–150 calls. **`batch_ops` runs many commands in one round-trip.** Children reference
parents created earlier in the *same* batch via `@ref` placeholders.

```jsonc
batch_ops({
  ops: [
    { "ref": "page", "command": "create_frame",
      "params": { "x": 0, "y": 0, "width": 1440, "height": 800, "name": "Landing",
                  "layoutMode": "VERTICAL", "fillColor": { "r": 0.98, "g": 0.96, "b": 0.92 } } },
    { "command": "set_layout_sizing",
      "params": { "nodeId": "@page", "layoutSizingVertical": "HUG", "layoutSizingHorizontal": "FIXED" } },

    { "ref": "title", "command": "create_text",
      "params": { "x": 0, "y": 0, "text": "Hello", "fontSize": 56, "parentId": "@page" } },
    { "command": "set_font_name", "params": { "nodeId": "@title", "family": "Inter", "style": "Bold" } }
  ]
})
// → { ok, count, ids: { page: "12:3", title: "12:4" }, errors: [] }
```

- `@ref` resolves anywhere a node id is expected, including nested objects/arrays (`parentId`, `nodeId`, `nodeIds[]`).
- Ops run **sequentially** in the plugin (no parallel-crash risk).
- The result is compact (`ids` + `errors`), not a verbose node dump.
- A failing op is recorded in `errors[]` and the batch continues (pass `stopOnError: true` to halt).

Tips: build one repeated element (card/step/review), then `clone_node` + `set_text_content`
for the rest; keep image-heavy batches smaller; validate with one `export_node_as_image`.

## Tools

Reads: `get_document_info`, `get_selection`, `get_node_info`, `get_nodes_info`, `read_my_design`, `scan_text_nodes`, `scan_nodes_by_types`, `get_styles`, `get_local_components`, `get_annotations`, `get_reactions`, `export_node_as_image`.

Create / edit: `create_frame`, `create_text`, `create_rectangle`, `create_ellipse`, `create_svg`, `create_component_instance`, `clone_node`, `insert_child`, `move_node`, `resize_node`, `delete_node`, `delete_multiple_nodes`.

Style: `set_fill_color`, `set_stroke_color`, `set_gradient_fill`, `set_effect`, `set_corner_radius`, `set_image_fill`, `set_font_name`, `set_text_content`, `set_multiple_text_contents`.

Layout: `set_layout_mode`, `set_layout_sizing`, `set_padding`, `set_item_spacing`, `set_axis_align`.

Batch: **`batch_ops`** (run many of the above in one round-trip).

Channel / misc: `join_channel`, annotations, connectors, focus/selection helpers.

> `set_fill_color` accepts both `{ nodeId, r, g, b, a }` and `{ nodeId, color: { … } }`, so it works identically inside `batch_ops`.

## Testing

```bash
bun test               # coverage.mjs — connection-free: every MCP command has a plugin handler
bun test:smoke <chan>  # smoke.mjs   — live: drives the plugin, exercises batch_ops + ~18 commands, cleans up
```

`coverage.mjs` needs nothing running. `smoke.mjs` needs the relay + Figma + plugin on a channel (pass the channel id), with Figma focused.

## Privacy

No telemetry. The plugin sends nothing to any external service — its only network use is
the local relay (`ws://localhost:3055`). No file content or personal data leaves your machine.

## Before you publish

A few placeholders to personalize (search `TODO`):

- [ ] `package.json` — (done)
- [ ] `LICENSE` — (done)
- [ ] `src/figma_plugin/manifest.json` — set the plugin `name`; Figma assigns a new `id` when you publish to Community.
- [ ] Publish the plugin via Figma desktop → *Plugins → Development → Publish*.
- [ ] `npm publish` the server with `bun run pub:release` (after `npm login`).

## License

MIT — see [LICENSE](./LICENSE).
