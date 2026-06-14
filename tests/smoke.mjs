#!/usr/bin/env bun
/**
 * Smoke test for the AIConnect plugin commands over the WebSocket relay.
 *
 * Prereqs:
 *   1. Relay running:           bun socket
 *   2. Figma open with the plugin running and joined to a channel.
 *   3. Run:  bun tests/smoke.mjs <channel>      (channel shown in the plugin UI)
 *
 * It drives the plugin DIRECTLY (same protocol the MCP server uses), exercising
 * batch_ops plus ~18 underlying commands through one batch, then cleans up.
 * Exits 0 if every step passes, 1 otherwise.
 */

const CHANNEL = process.argv[2] || process.env.FIGMA_CHANNEL;
const PORT = process.env.FIGMA_SOCKET_PORT || 3055;
if (!CHANNEL) {
  console.error("Usage: bun tests/smoke.mjs <channel>  (or set FIGMA_CHANNEL)");
  process.exit(2);
}

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const ws = new WebSocket(`ws://localhost:${PORT}`);
const pending = new Map();

function send(command, params = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for ${command}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    ws.send(
      JSON.stringify({ id, type: "message", channel: CHANNEL, message: { id, command, params } })
    );
  });
}

ws.addEventListener("message", (ev) => {
  let data;
  try { data = JSON.parse(ev.data); } catch { return; }
  const m = data.message;
  if (!m || !m.id || !pending.has(m.id)) return;
  const { resolve, reject, timer } = pending.get(m.id);
  clearTimeout(timer);
  pending.delete(m.id);
  if (m.error) reject(new Error(typeof m.error === "string" ? m.error : JSON.stringify(m.error)));
  else resolve(m.result);
});

const results = [];
async function step(name, fn) {
  try {
    const r = await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
    return r;
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  ✗ ${name} — ${e.message}`);
    return null;
  }
}

ws.addEventListener("open", async () => {
  ws.send(JSON.stringify({ id: uuid(), type: "join", channel: CHANNEL }));
  await new Promise((r) => setTimeout(r, 400)); // let join settle
  console.log(`\nSmoke test on channel "${CHANNEL}"\n`);

  // 1) read
  await step("get_document_info", () => send("get_document_info"));

  // 2) one big batch_ops exercising many commands + @ref resolution
  const batch = await step("batch_ops (build scratch tree)", () =>
    send("batch_ops", {
      ops: [
        { ref: "root", command: "create_frame", params: { x: 12000, y: 0, width: 600, height: 500, name: "QA-SMOKE", layoutMode: "VERTICAL", itemSpacing: 16, paddingTop: 24, paddingBottom: 24, paddingLeft: 24, paddingRight: 24, fillColor: { r: 0.96, g: 0.96, b: 0.94 } } },
        { command: "set_layout_sizing", params: { nodeId: "@root", layoutSizingVertical: "HUG", layoutSizingHorizontal: "FIXED" } },
        { ref: "title", command: "create_text", params: { x: 0, y: 0, text: "Smoke title", fontSize: 32, parentId: "@root", fontColor: { r: 0.1, g: 0.1, b: 0.1 } } },
        { command: "set_font_name", params: { nodeId: "@title", family: "Inter", style: "Bold" } },
        { command: "resize_node", params: { nodeId: "@title", width: 520, height: 40 } },
        { ref: "card", command: "create_frame", params: { x: 0, y: 0, width: 520, height: 120, name: "card", layoutMode: "HORIZONTAL", itemSpacing: 12, parentId: "@root", fillColor: { r: 1, g: 1, b: 1 } } },
        { command: "set_corner_radius", params: { nodeId: "@card", radius: 14 } },
        { command: "set_effect", params: { nodeId: "@card", effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 6 }, radius: 18, spread: 0 }] } },
        { ref: "dot", command: "create_ellipse", params: { x: 0, y: 0, width: 48, height: 48, name: "dot", parentId: "@card" } },
        { command: "set_fill_color", params: { nodeId: "@dot", r: 0.26, g: 0.5, b: 0.53 } },
        { ref: "grad", command: "create_frame", params: { x: 0, y: 0, width: 120, height: 48, name: "grad", parentId: "@card" } },
        { command: "set_gradient_fill", params: { nodeId: "@grad", direction: "horizontal", stops: [{ position: 0, color: { r: 0.2, g: 0.35, b: 0.37, a: 1 } }, { position: 1, color: { r: 0.9, g: 0.78, b: 0.63, a: 1 } }] } },
        { ref: "svg", command: "create_svg", params: { parentId: "@card", x: 0, y: 0, name: "tick", svg: "<svg width='40' height='40' xmlns='http://www.w3.org/2000/svg'><circle cx='20' cy='20' r='18' fill='#427F86'/></svg>" } },
        { ref: "label", command: "create_text", params: { x: 0, y: 0, text: "old text", fontSize: 16, parentId: "@root", fontColor: { r: 0.2, g: 0.2, b: 0.2 } } },
        { command: "set_font_name", params: { nodeId: "@label", family: "Inter", style: "Regular" } },
        { command: "set_text_content", params: { nodeId: "@label", text: "updated text" } },
        { command: "set_item_spacing", params: { nodeId: "@root", itemSpacing: 20 } },
        { command: "set_padding", params: { nodeId: "@root", paddingTop: 28 } },
        { command: "set_axis_align", params: { nodeId: "@card", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER" } },
      ],
    })
  );

  let rootId = batch?.ids?.root;
  if (batch && batch.errors && batch.errors.length) {
    console.log("    batch errors:", JSON.stringify(batch.errors));
  }

  // 3) commands that operate on returned ids: clone + move + get_node_info + delete
  if (rootId) {
    await step("get_node_info(root)", () => send("get_node_info", { nodeId: rootId }));
    const clone = await step("clone_node(root)", () => send("clone_node", { nodeId: rootId }));
    const cloneId = clone?.id;
    if (cloneId) {
      await step("move_node(clone)", () => send("move_node", { nodeId: cloneId, x: 12700, y: 0 }));
      await step("delete_node(clone)", () => send("delete_node", { nodeId: cloneId }));
    }
    await step("export_node_as_image(root)", () => send("export_node_as_image", { nodeId: rootId, format: "PNG", scale: 0.25 }));
    await step("delete_node(root) [cleanup]", () => send("delete_node", { nodeId: rootId }));
  } else {
    console.log("  ! skipping id-dependent steps (no root id returned)");
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${passed}/${results.length} steps passed.`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("ALL GREEN ✅");
  process.exit(0);
});

ws.addEventListener("error", (e) => {
  console.error("WebSocket error:", e.message || e);
  process.exit(1);
});
setTimeout(() => { console.error("Overall timeout."); process.exit(1); }, 180000);
