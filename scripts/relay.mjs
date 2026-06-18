#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Prakhar Gupta.
//
// Node-runnable WebSocket relay for AIConnect for Figma.
//
// This is a dependency-light, Bun-free port of src/socket.ts so the whole
// stack can run with plain `node` / `npx` (no Bun required). It brokers
// channel-scoped messages between the MCP server and the Figma plugin on
// ws://localhost:3055. Behaviour matches src/socket.ts byte-for-byte on the
// wire (join / message / progress_update / broadcast envelopes).
//
// Usage:
//   npx aiconnect-figma-relay            # default port 3055
//   PORT=4000 npx aiconnect-figma-relay  # custom port
//   node scripts/relay.mjs

import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || process.env.AICONNECT_RELAY_PORT || 3055);

// Store clients by channel.
const channels = new Map();

const wss = new WebSocketServer({ port: PORT });

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on("listening", () => {
  console.log(`AIConnect relay running on ws://localhost:${PORT}`);
  console.log("Leave this running. Next: run the AIConnect plugin in Figma and copy the channel id.");
});

wss.on("connection", (ws) => {
  console.log("New client connected");

  // Welcome message (matches src/socket.ts).
  send(ws, { type: "system", message: "Please join a channel to start chatting" });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (err) {
      console.error("Error handling message:", err);
      return;
    }

    const type = data.type;

    if (type === "join") {
      const channelName = data.channel;
      if (!channelName || typeof channelName !== "string") {
        send(ws, { type: "error", message: "Channel name is required" });
        return;
      }
      if (!channels.has(channelName)) channels.set(channelName, new Set());
      const channelClients = channels.get(channelName);
      channelClients.add(ws);
      console.log(`✓ Client joined channel "${channelName}" (${channelClients.size} total clients)`);

      send(ws, { type: "system", message: `Joined channel: ${channelName}`, channel: channelName });
      send(ws, {
        type: "system",
        message: { id: data.id, result: "Connected to channel: " + channelName },
        channel: channelName,
      });

      for (const client of channelClients) {
        if (client !== ws) {
          send(client, { type: "system", message: "A new user has joined the channel", channel: channelName });
        }
      }
      return;
    }

    if (type === "message") {
      const channelName = data.channel;
      if (!channelName || typeof channelName !== "string") {
        send(ws, { type: "error", message: "Channel name is required" });
        return;
      }
      const channelClients = channels.get(channelName);
      if (!channelClients || !channelClients.has(ws)) {
        send(ws, { type: "error", message: "You must join the channel first" });
        return;
      }
      let broadcastCount = 0;
      for (const client of channelClients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          broadcastCount++;
          send(client, { type: "broadcast", message: data.message, sender: "peer", channel: channelName });
        }
      }
      if (broadcastCount === 0) {
        console.log(`⚠️  No other clients in channel "${channelName}" to receive message!`);
      }
      return;
    }

    if (type === "progress_update") {
      const channelName = data.channel;
      if (!channelName) return;
      const channelClients = channels.get(channelName);
      if (!channelClients || !channelClients.has(ws)) return;
      for (const client of channelClients) {
        if (client !== ws) send(client, data);
      }
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    for (const [channelName, clients] of channels) {
      if (clients.has(ws)) {
        clients.delete(ws);
        for (const client of clients) {
          send(client, { type: "system", message: "A user has left the channel", channel: channelName });
        }
      }
    }
  });
});

process.on("SIGINT", () => {
  console.log("\nShutting down AIConnect relay.");
  wss.close(() => process.exit(0));
});
