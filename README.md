# AIConnect for Figma

![AIConnect](assets/aiconnect-cover-1920x960.png)

**Drive Figma from any AI agent — locally, open-source.** AIConnect is an MCP (Model
Context Protocol) server + Figma plugin that let an agent (Claude Code, Cursor, or any
MCP client) read and edit a live Figma file: create frames, text, auto-layout, fills,
gradients, effects, and SVGs, import images, clone nodes, and **assemble entire pages in
one call** via `batch_ops`.

> **Note on Figma's official MCP.** Figma now ships a first-party MCP (`use_figma`).
> AIConnect is an **independent, open-source, fully-local** alternative: client-agnostic
> (use it with whatever agent you already run), scriptable, and built around a
> one-round-trip `batch_ops` command for fast page building. Everything runs on your
> machine — no Community install, no account, nothing leaves your computer. Use whichever
> fits your workflow, or both.

## Why AIConnect
- **Local & private** — only talks to a relay on `localhost`. No telemetry, no third-party servers.
- **Client-agnostic** — any MCP client (Claude Code, Cursor, …), not tied to one editor.
- **`batch_ops`** — build a whole page/section in a single round-trip instead of 100+ calls.
- **Rich commands** — images, fonts, gradients, effects, SVG, auto-layout, clone, reorder.
- **Open-source (AGPL-3.0), hackable** — fork it, add commands, wire it into your own agent skills. Commercial license available.

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

Three local processes: the **MCP server** (`src/aiconnect_mcp/server.ts` → `dist/server.js`)
exposes tools to the agent; the **WebSocket relay** (`src/socket.ts`) brokers messages on
port 3055; the **Figma plugin** (`src/figma_plugin/`) runs inside Figma and executes the
commands. The agent and the plugin join the same **channel**.

## Local setup (~2 minutes)

Requires [Bun](https://bun.sh) and the Figma desktop app.

```bash
# 1. install + build the MCP server
bun install && bun run build

# 2. start the WebSocket relay (leave this running)
bun socket            # → WebSocket server running on port 3055
```

3. **Load the plugin in Figma** → *Plugins → Development → Import plugin from manifest…* →
   pick `src/figma_plugin/manifest.json`. Run it (*Plugins → Development → AIConnect for
   Figma*). The plugin window shows a **channel id** — copy it.

4. **Register the MCP server** with your agent (`.mcp.json` for Claude Code, `mcp.json` for Cursor):
   ```json
   {
     "mcpServers": {
       "AIConnect": { "command": "bun", "args": ["run", "/absolute/path/to/aiconnect-figma-mcp/dist/server.js"] }
     }
   }
   ```
   Or run `bun setup` to write `.mcp.json` for you.

5. In the agent, call **`join_channel`** with the id from the plugin, and start building.

> Keep the Figma window focused while the agent works — Figma pauses plugins whose window
> is in the background (that shows up as command timeouts).

## `batch_ops` — build pages in one call

Children reference parents created earlier in the same batch via `@ref` placeholders:

```jsonc
batch_ops({
  ops: [
    { "ref": "page", "command": "create_frame",
      "params": { "x": 0, "y": 0, "width": 1440, "height": 800, "name": "Landing",
                  "layoutMode": "VERTICAL", "fillColor": { "r": 0.98, "g": 0.96, "b": 0.92 } } },
    { "command": "set_layout_sizing", "params": { "nodeId": "@page", "layoutSizingVertical": "HUG", "layoutSizingHorizontal": "FIXED" } },
    { "ref": "title", "command": "create_text", "params": { "x": 0, "y": 0, "text": "Hello", "fontSize": 56, "parentId": "@page" } },
    { "command": "set_font_name", "params": { "nodeId": "@title", "family": "Inter", "style": "Bold" } }
  ]
})
// → { ok, ids: { page: "12:3", title: "12:4" }, errors: [] }
```

`@ref` resolves anywhere a node id is expected (incl. nested objects/arrays). Ops run
sequentially (no parallel crashes). Result is compact `ids` + `errors`. `set_image_fill`
works in a batch too — the server pre-encodes `imagePath`/`imageUrl` before sending.

## Tools

Reads: `get_document_info`, `get_selection`, `get_node_info`, `get_nodes_info`, `read_my_design`, `scan_text_nodes`, `scan_nodes_by_types`, `get_styles`, `get_local_components`, `get_annotations`, `get_reactions`, `export_node_as_image`.
Create/edit: `create_frame`, `create_text`, `create_rectangle`, `create_ellipse`, `create_svg`, `create_component_instance`, `clone_node`, `insert_child`, `move_node`, `resize_node`, `delete_node`, `delete_multiple_nodes`.
Style: `set_fill_color`, `set_stroke_color`, `set_gradient_fill`, `set_effect`, `set_corner_radius`, `set_image_fill`, `set_font_name`, `set_text_content`, `set_multiple_text_contents`.
Layout: `set_layout_mode`, `set_layout_sizing`, `set_padding`, `set_item_spacing`, `set_axis_align`.
Batch: **`batch_ops`**. Plus `join_channel`, annotations, connectors, focus/selection helpers.

## Testing

```bash
bun test               # coverage.mjs — connection-free: every MCP command has a plugin handler
bun test:smoke <chan>  # smoke.mjs   — live: drives the plugin, exercises batch_ops + ~18 commands
```

## Privacy

No telemetry. The plugin's only network use is the local relay (`ws://localhost:3055`).
No file content or personal data leaves your machine.

## License & commercial use

AIConnect is licensed under the **GNU AGPL-3.0** (see [LICENSE](./LICENSE)). You're free to
use, modify, and self-host it — but if you run a modified version as a network service, the
AGPL requires you to release your source under the same license.

**Want to use AIConnect in a closed-source product or a hosted service without AGPL
obligations?** A separate commercial license is available — contact **prakshatechnologies@gmail.com**.

Builds on prior MIT-licensed work — see [NOTICE](./NOTICE). Contributions are welcome under
the AGPL; by contributing, you agree your contribution may also be offered under the
commercial license.
