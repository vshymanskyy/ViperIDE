#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${VIPERIDE_MCP_DIR:-$HOME/.local/share/viperIDE-mcp}"
BRANCH="feature/mcp-server"
REPO="https://github.com/andrewleech/ViperIDE.git"

echo "=== ViperIDE MCP Server Installer ==="
echo ""

# Check required tools
missing=""
for cmd in node npm python3 git; do
    if ! command -v "$cmd" &>/dev/null; then
        missing="$missing $cmd"
    fi
done
if [ -n "$missing" ]; then
    echo "Error: required tools not found:$missing" >&2
    exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Updating existing installation in $INSTALL_DIR ..."
    cd "$INSTALL_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    echo "Cloning ViperIDE ($BRANCH) to $INSTALL_DIR ..."
    git clone --branch "$BRANCH" --single-branch "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install ViperIDE dependencies and build
echo ""
echo "Installing ViperIDE dependencies..."
npm install

# python-minifier download in build.py needs requests
python3 -c "import requests" 2>/dev/null || {
    echo "Installing Python requests module..."
    pip3 install --user requests 2>/dev/null || pip install --user requests 2>/dev/null || {
        echo "Warning: could not install Python 'requests' module. build.py may fail." >&2
    }
}

echo "Building ViperIDE..."
python3 build.py

# Install MCP server dependencies
echo ""
echo "Installing MCP server dependencies..."
cd "$INSTALL_DIR/mcp"
npm install

MCP_CMD="node"
MCP_ARG="$INSTALL_DIR/mcp/src/index.js"

echo ""
echo "=== Installation complete ==="
echo ""

# Register with Claude Code if available
if command -v claude &>/dev/null; then
    echo "Registering with Claude Code..."
    claude mcp add viperIDE -- "$MCP_CMD" "$MCP_ARG" && {
        echo "Done. Restart Claude Code to use ViperIDE tools."
    } || {
        echo "Auto-registration failed. Register manually:"
        echo "  claude mcp add viperIDE -- $MCP_CMD $MCP_ARG"
    }
else
    echo "Claude Code CLI not found. To register manually:"
    echo "  claude mcp add viperIDE -- $MCP_CMD $MCP_ARG"
fi

echo ""
echo "For Claude Desktop, add this to your config:"
echo ""
echo "  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "  Linux: ~/.config/Claude/claude_desktop_config.json"
echo "  Windows: %APPDATA%\\Claude\\claude_desktop_config.json"
echo ""
cat <<JSONEOF
{
  "mcpServers": {
    "viperIDE": {
      "command": "$MCP_CMD",
      "args": ["$MCP_ARG"]
    }
  }
}
JSONEOF
echo ""
