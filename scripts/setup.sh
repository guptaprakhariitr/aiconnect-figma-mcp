#!/bin/bash
set -e

# Build the local server and write an MCP client config pointing at it.
bun install
bun run build

MCP_CONFIG='{
  "mcpServers": {
    "FigmaAIConnect": {
      "command": "bun",
      "args": [
        "run",
        "'"$(pwd)"'/dist/server.js"
      ]
    }
  }
}'

# Claude Code / generic: write .mcp.json in project root
echo "$MCP_CONFIG" > .mcp.json
echo "✓ MCP config written to .mcp.json"
echo "  Next: 'bun socket' in one terminal, import src/figma_plugin/manifest.json in Figma,"
echo "  run the plugin, then join the channel it shows."
