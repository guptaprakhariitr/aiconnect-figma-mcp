# Use the Bun image as the base image
FROM oven/bun:latest

# Set the working directory in the container
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json bun.lock* ./
RUN bun install

# Copy the rest of the source (server, plugin, relay)
COPY . .

# Expose the local relay port
EXPOSE 3055

# Run the MCP server on stdio (responds to introspection without a live relay)
CMD ["bun", "src/aiconnect_mcp/server.ts"]
