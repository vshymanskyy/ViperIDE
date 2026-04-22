#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING="$SCRIPT_DIR/dist/npm-staging"

VERSION=$(node -p "require('./package.json').version")
echo "=== Building @andrewleech/viperide-mcp v${VERSION} for npm ==="

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

# Step 5: Copy README
cp "$SCRIPT_DIR/README.md" "$STAGING/README.md"

# Step 6: Create package.json
cat > "$STAGING/package.json" << PKGJSON
{
  "name": "@andrewleech/viperide-mcp",
  "version": "${VERSION}",
  "description": "MCP server for controlling ViperIDE, a MicroPython/CircuitPython IDE. Connects to devices via USB serial, manages files, executes code, and provides full REPL access.",
  "type": "module",
  "main": "server/index.js",
  "bin": {
    "viperide-mcp": "server/index.js"
  },
  "files": [
    "server/",
    "build/",
    "README.md"
  ],
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
  },
  "homepage": "https://viper-ide.org",
  "keywords": [
    "mcp",
    "micropython",
    "circuitpython",
    "ide",
    "viperide",
    "serial",
    "repl",
    "embedded"
  ]
}
PKGJSON

echo ""
echo "=== npm package staged at: $STAGING ==="
echo ""
echo "To publish:"
echo "  cd $STAGING"
echo "  npm publish --access public"
echo ""
echo "To test locally:"
echo "  npm install $STAGING"
echo ""
echo "After publishing, users install with:"
echo "  claude mcp add viperIDE -- npx -y @andrewleech/viperide-mcp"
