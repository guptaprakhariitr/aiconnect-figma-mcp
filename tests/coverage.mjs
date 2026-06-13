#!/usr/bin/env bun
/**
 * Connection-free wiring test: every command the MCP server sends to Figma must
 * have a matching `case` handler in the plugin, and the plugin's handlers should
 * be reachable. Catches drift between server.ts and the plugin code.js without
 * needing Figma open. Run: bun tests/coverage.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = readFileSync(join(root, "src/figma_ai_connect_mcp/server.ts"), "utf8");
const plugin = readFileSync(join(root, "src/figma_plugin/code.js"), "utf8");

// Commands the MCP server forwards to Figma.
const sent = new Set();
for (const m of server.matchAll(/sendCommandToFigma\(\s*["'`]([a-z_]+)["'`]/g)) sent.add(m[1]);

// Command cases the plugin handles (inside handleCommand's switch).
const handled = new Set();
for (const m of plugin.matchAll(/case\s+["'`]([a-z_]+)["'`]\s*:/g)) handled.add(m[1]);

// "join" is handled by the relay/UI, not handleCommand — exclude from the check.
const ignore = new Set(["join"]);

const missing = [...sent].filter((c) => !handled.has(c) && !ignore.has(c)).sort();
const orphanHandlers = [...handled].filter((c) => !sent.has(c)).sort();

console.log(`MCP commands sent:   ${[...sent].length}`);
console.log(`Plugin case handlers: ${[...handled].length}`);

// Our custom additions must be present on both sides.
const custom = ["set_image_fill", "set_font_name", "insert_child", "set_effect", "set_gradient_fill", "create_ellipse", "create_svg", "batch_ops"];
const customOk = custom.every((c) => sent.has(c) && handled.has(c));
console.log(`Custom commands wired (tool + handler): ${customOk ? "yes ✓" : "NO ✗"}`);
for (const c of custom) {
  if (!(sent.has(c) && handled.has(c))) console.log(`  ✗ ${c}: tool=${sent.has(c)} handler=${handled.has(c)}`);
}

if (orphanHandlers.length) console.log(`Handlers with no MCP tool (ok if internal): ${orphanHandlers.join(", ")}`);

if (missing.length) {
  console.log(`\n✗ MCP commands with NO plugin handler: ${missing.join(", ")}`);
  process.exit(1);
}
if (!customOk) {
  console.log(`\n✗ One or more custom commands are not wired on both sides.`);
  process.exit(1);
}
console.log(`\nALL WIRED ✅  (every MCP command has a plugin handler; custom commands present)`);
process.exit(0);
