# Publishing AIConnect to the Figma Community

This plugin is engineered to meet Figma's plugin review guidelines. This file is the
checklist + ready-to-paste listing copy. **Read "When to publish" at the bottom.**

## Name (compliant)
- **Listing title:** `AIConnect for Figma` — allowed: the brand is "AIConnect"; "for Figma"
  only qualifies the title. (Figma bans "Figma" *inside* a brand/company name, e.g. "Figdesigns".)
- Do **not** market it as "FigmaAIConnect" / "Figma AIConnect" (Figma as part of the brand).

## What already complies
- ✅ No telemetry / analytics; no external network. Only `ws://localhost:3055`.
- ✅ Network access is declared in `manifest.json` with a clear `reasoning`.
- ✅ The plugin UI **discloses** that it needs the separate (free, open-source) MCP server
  + local relay — required because the plugin depends on external software.
- ✅ MIT licensed; `documentAccess: dynamic-page`; valid manifest.

## Assets you must add in the Publish dialog (not in the repo)
- [ ] **Icon** — 128×128 PNG.
- [ ] **Cover art** — 1920×960 PNG.
- [ ] **Description** — use the copy below.
- [ ] **Tags** — e.g. `ai`, `automation`, `developer tools`, `productivity`, `mcp`.
- [ ] **Support contact** — an email or the GitHub Issues URL.

## Ready-to-paste description
> **AIConnect for Figma** lets an AI agent (Claude Code, Cursor, or any MCP client)
> read and edit your Figma file — create frames, text, auto-layout, fills, gradients,
> effects, SVGs, import images, and build entire pages in one step via `batch_ops`.
>
> **Requires free, open-source companion software:** the AIConnect MCP server and a local
> WebSocket relay running on your machine (`ws://localhost:3055`). No account, no payment,
> no external network — nothing leaves your computer. One-time setup (≈2 min) and full
> instructions: https://github.com/guptaprakhariitr/aiconnect-figma-mcp
>
> Open-source (MIT). No analytics or tracking.

## Before you click Publish
1. **Use your own plugin id.** The `id` in `manifest.json` must belong to *your* Figma
   account. In Figma desktop: *Plugins → Development → New plugin… → "Link existing" /
   import this `manifest.json`*. If it imports under your account, its id is yours and you
   can publish. If publishing is blocked because the id is registered elsewhere, create a
   brand-new plugin from the manifest under your account first.
2. **Test in a clean state**: `bun run build`, `bun socket`, run the plugin, `join_channel`,
   and confirm a create/edit works. (`bun test` must be green; `bun test:smoke <channel>`
   green with Figma focused.)
3. Add icon + cover + description + tags + support contact in the Publish dialog.

## When to publish — answer
**Publish once steps 1–3 above are done.** The code/manifest/policy side is ready now;
the only things outstanding are the **listing assets (icon, cover, description, tags)** and
confirming the **manifest id is under your account**. After you submit, Figma review
typically takes a few business days and may ask about the localhost connection — point them
to this repo's setup docs. Until then, you can use it privately as a **Development plugin**
(no review needed) or publish it **privately to your org**.
