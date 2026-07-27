#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

STAGING="$SCRIPT_DIR/dist/staging"
PLATFORM="${1:-$(uname -s | tr '[:upper:]' '[:lower:]')}"

case "$PLATFORM" in
    linux)  MCPB_PLATFORM="linux" ;;
    darwin) MCPB_PLATFORM="darwin" ;;
    win32|windows|mingw*|msys*) MCPB_PLATFORM="win32" ;;
    *) echo "Unknown platform: $PLATFORM"; exit 1 ;;
esac

VERSION=$(node -p "require('./package.json').version")
echo "=== Building ViperIDE MCP v${VERSION} for ${MCPB_PLATFORM} ==="

# Step 1: Build ViperIDE if needed
if [ ! -f "$REPO_ROOT/build/index.html" ]; then
    echo "Building ViperIDE..."
    cd "$REPO_ROOT"
    npm install
    python3 build.py
fi

# Step 2: Clean and create staging directory
rm -rf "$STAGING"
mkdir -p "$STAGING/server"

# Step 3: Copy server files
for f in index.js ide-server.js bridge.js serial-bridge.js; do
    cp "$SCRIPT_DIR/src/$f" "$STAGING/server/"
done

# Step 4: Copy pre-built ViperIDE assets (exclude source maps)
cp -r "$REPO_ROOT/build" "$STAGING/"
find "$STAGING/build" -name '*.map' -delete 2>/dev/null || true

# Step 5: Create package.json for the distribution
cat > "$STAGING/package.json" << PKGJSON
{
  "name": "@andrewleech/viperide-mcp",
  "version": "${VERSION}",
  "description": "MCP server for controlling ViperIDE - a MicroPython/CircuitPython IDE",
  "type": "module",
  "main": "server/index.js",
  "bin": {
    "viperide-mcp": "server/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "open": "^10.1.0",
    "serialport": "^12.0.0",
    "ws": "^8.18.0",
    "zod": "^3.24.0"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/andrewleech/ViperIDE",
    "directory": "mcp"
  }
}
PKGJSON

# Step 6: Install production dependencies
echo "Installing production dependencies..."
cd "$STAGING"
npm install --production 2>&1 | tail -3

# Step 7: Create tar.gz (for direct download / npm-like install)
TARBALL="$SCRIPT_DIR/dist/viperide-mcp-${VERSION}-${MCPB_PLATFORM}.tar.gz"
echo "Creating tarball..."
cd "$SCRIPT_DIR/dist"
tar czf "$TARBALL" -C staging .
echo "  $TARBALL ($(du -h "$TARBALL" | cut -f1))"

# Step 8: Generate platform-specific MCPB manifest and pack bundle
cat > "$STAGING/manifest.json" << MANIFEST
{
  "manifest_version": "0.3",
  "name": "viperIDE",
  "display_name": "ViperIDE",
  "version": "${VERSION}",
  "description": "MicroPython/CircuitPython IDE with full remote control. Connect to devices via USB serial, browse files, edit code, execute scripts, and interact with the REPL.",
  "author": {
    "name": "Andrew Leech & Volodymyr Shymanskyy"
  },
  "license": "MIT",
  "homepage": "https://viper-ide.org",
  "repository": {
    "url": "https://github.com/vshymanskyy/ViperIDE",
    "type": "git"
  },
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["\${__dirname}/server/index.js"],
      "env": {
        "VIPERIDE_BUILD_DIR": "\${__dirname}/build"
      }
    }
  },
  "tools": [
    { "name": "viperIDE_get_status", "description": "Get IDE connection status, device info, and editor state" },
    { "name": "viperIDE_connect_serial", "description": "Connect to a MicroPython device via USB serial" },
    { "name": "viperIDE_list_serial_ports", "description": "List available USB serial ports with device details" },
    { "name": "viperIDE_list_files", "description": "List files and directories on the device" },
    { "name": "viperIDE_read_file", "description": "Read a file from the device" },
    { "name": "viperIDE_write_file", "description": "Write a file to the device" },
    { "name": "viperIDE_run_file", "description": "Execute the current file on the device" },
    { "name": "viperIDE_read_terminal", "description": "Read REPL output" }
  ],
  "tools_generated": true,
  "compatibility": {
    "platforms": ["$MCPB_PLATFORM"]
  }
}
MANIFEST

MCPB_FILE="$SCRIPT_DIR/dist/viperide-mcp-${VERSION}-${MCPB_PLATFORM}.mcpb"
echo "Packing MCPB bundle..."
npx @anthropic-ai/mcpb pack "$STAGING" "$MCPB_FILE" 2>&1 | tail -5
echo "  $MCPB_FILE ($(du -h "$MCPB_FILE" | cut -f1))"

# Step 9: Validate
echo ""
npx @anthropic-ai/mcpb validate "$STAGING/manifest.json" 2>&1

echo ""
echo "=== Build complete ==="
echo "Tarball: $TARBALL"
echo "MCPB:    $MCPB_FILE"
echo ""
echo "Install tarball with Claude Code:"
echo "  tar xzf $(basename "$TARBALL") -C ~/.local/share/viperide-mcp"
echo "  claude mcp add viperIDE -- node ~/.local/share/viperide-mcp/server/index.js"
