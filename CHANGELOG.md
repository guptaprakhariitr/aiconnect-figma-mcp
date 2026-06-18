# Changelog

All notable changes to **AIConnect for Figma** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-06-18

First stable release. AIConnect grew from a thin Figma read/write bridge into a
**local design-intelligence engine** for AI agents — 67 MCP tools, zero cloud,
zero telemetry, and a one-round-trip page builder.

### Added — Design intelligence (keyless, fully local)

- **`apply_brand`** — generate and apply a complete design-token system (color
  ramps, semantic roles, type scale, radii, spacing) from a preset, a brand
  name, or a single seed color.
- **`list_brand_presets`** — browse the built-in brand presets (e.g.
  fintech-trust) before applying.
- **`generate_palette`** / **`generate_theme`** — perceptually-uniform **OKLCH**
  palettes and full light/dark themes.
- **`check_contrast`** — WCAG contrast checking with **automatic fix**
  suggestions that keep you accessible.
- **`suggest_fonts`** — font-pairing recommendations (replaces paid
  font-pairing plugins).
- **`search_icons`** / **`insert_icon`** — search and drop in icons from
  **200k+ Iconify** sets.
- **`search_images`** — openly-licensed stock imagery via **Openverse**.

### Added — Variables, tokens & Dev Mode parity

- First-class Figma **variables / design tokens**: `get_variables`,
  `create_variable_collection`, `create_variable`, `set_variable_value`,
  `bind_variable`.
- **`export_tokens`** — export your variables to **DTCG JSON, CSS, or Tailwind**.
- **`get_css`** — Dev Mode-equivalent CSS inspection of any node **without a
  paid Dev seat**.

### Added — Debuggability, fully local

- **`get_status`** — live connection/health for the agent.
- **`get_console_logs`** — surface plugin-side logs to the agent.
- **`get_page_snapshot`** — the agent literally *sees* what it just built and
  can self-correct. Runs entirely on `localhost` — no telemetry, nothing leaves
  your machine.

### Added — One-round-trip building

- **`batch_ops`** — assemble an entire page or section in a **single**
  round-trip. Children reference parents created earlier in the same batch via
  `@ref` placeholders (resolved in nested objects/arrays), ops run sequentially
  in the plugin, and the result is a compact `{ ids, errors }` map. `set_image_fill`
  is pre-encoded server-side so it works inside a batch too.

### Added — Rich create / style / layout commands

- Frames, text, rectangles, ellipses, **SVG**, component instances, clone,
  insert-child, move, resize, delete (single + multiple).
- Fills, strokes, **gradients**, **effects**, corner radius, **image fills**,
  fonts, text content (single + multiple).
- Auto-layout: layout mode, layout sizing, padding, item spacing, axis align.

### Added — Distribution & packaging

- **`npx` path on plain Node.** The MCP server runs under Node ≥18, and a new
  Node-native relay (`aiconnect-figma-relay`, `scripts/relay.mjs`, built on the
  bundled `ws`) means the whole stack runs without Bun if you prefer.
- `bin` entries: `aiconnect-figma-mcp` (server) and `aiconnect-figma-relay`
  (relay).
- `prepublishOnly` build hook, `engines.node >= 18`, and a packaged `files`
  list that ships everything needed to run from npm (server, relay, plugin,
  README, CHANGELOG, LICENSE, NOTICE).
- One-command `scripts/setup.sh` that builds, prints the exact `.mcp.json`
  snippet for Claude Code / Cursor, and walks through importing the Figma
  plugin and the channel flow.

### Fixed — Performance & reliability

- Replaced verbose per-node responses with compact result maps to keep agent
  context small and round-trips fast.
- Sequential op execution in `batch_ops` removes parallel-write crash risk.
- Removed all third-party/cloud network paths: the plugin only ever talks to
  `ws://localhost:3055`.

[1.0.0]: https://github.com/guptaprakhariitr/aiconnect-figma-mcp/releases/tag/v1.0.0
