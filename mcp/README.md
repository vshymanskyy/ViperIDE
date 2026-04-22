# ViperIDE MCP Server

An MCP (Model Context Protocol) server that gives Claude full remote control of [ViperIDE](https://viper-ide.org), a MicroPython/CircuitPython IDE. The IDE opens in your browser for direct interaction while Claude simultaneously controls it via MCP tools.

## Architecture

The MCP server acts as a bridge between Claude and ViperIDE running in your browser. It also provides a serial-to-WebSocket bridge so USB devices can be connected without browser permission dialogs.

| Component | Role | Connection |
|---|---|---|
| **Claude** (Code/Desktop) | Sends MCP tool calls | stdio JSON-RPC to MCP server |
| **MCP Server** (Node.js) | Routes commands, serves IDE, bridges serial | localhost HTTP + WebSocket |
| **Browser** (ViperIDE) | IDE UI, executes commands on device | WS control channel (`/ws`) |
| **USB Device** (MicroPython) | Target hardware | Serial port via WS bridge (`/serial/...`) |

The MCP server:
1. Serves the built ViperIDE on a random localhost port
2. Opens your default browser to the IDE
3. Maintains a WebSocket control channel for sending commands
4. Exposes IDE operations as MCP tools that Claude can call

Both you and Claude can interact with the IDE simultaneously.

## Install

### Claude Desktop

Download the `.mcpb` bundle for your platform from [Releases](https://github.com/andrewleech/ViperIDE/releases). In Claude Desktop, go to Settings > Extensions > Advanced Settings > Install Extension, then select the `.mcpb` file.

### Claude Code

```bash
claude mcp add viperIDE -- npx -y @andrewleech/viperide-mcp
```

### From source

```bash
git clone https://github.com/andrewleech/ViperIDE.git
cd ViperIDE && npm install && python3 build.py
cd mcp && npm install
claude mcp add viperIDE -- node $(pwd)/src/index.js
```

## Available Tools

### Connection
| Tool | Description |
|---|---|
| `viperIDE_get_status` | Connection status, device info, open file, editor state |
| `viperIDE_connect_device` | Connect via WebSocket (`ws`), virtual device (`vm`), or prompt user for USB/BLE |
| `viperIDE_connect_serial` | Connect to a USB serial MicroPython device via the local WebSocket bridge |
| `viperIDE_list_serial_ports` | List available USB serial ports with device details |
| `viperIDE_disconnect_device` | Disconnect current device |

### File Operations (on device)
| Tool | Description |
|---|---|
| `viperIDE_list_files` | List all files and directories with sizes |
| `viperIDE_read_file` | Read file content |
| `viperIDE_write_file` | Write content to file (creates parent dirs) |
| `viperIDE_delete_file` | Delete a file |
| `viperIDE_delete_dir` | Delete a directory |
| `viperIDE_mkdir` | Create a directory |
| `viperIDE_create_file` | Create a new file and open it in the editor |

### Editor
| Tool | Description |
|---|---|
| `viperIDE_open_file` | Open a device file in the editor |
| `viperIDE_get_editor` | Get current editor content and filename |
| `viperIDE_set_editor` | Replace editor content |
| `viperIDE_save_file` | Save editor content to device |

### Execution
| Tool | Description |
|---|---|
| `viperIDE_run_file` | Run current file on device (non-blocking) |
| `viperIDE_stop` | Interrupt running script (Ctrl-C) |
| `viperIDE_reboot` | Reboot device (soft/hard/bootloader) |

### Terminal
| Tool | Description |
|---|---|
| `viperIDE_read_terminal` | Read REPL output |
| `viperIDE_write_terminal` | Send input to REPL |
| `viperIDE_clear_terminal` | Clear terminal |

### Packages
| Tool | Description |
|---|---|
| `viperIDE_install_package` | Install a MicroPython package by name or URL |

## USB Serial Bridge

The MCP server includes a serial-to-WebSocket bridge that lets Claude connect directly to USB serial MicroPython devices without requiring the browser's WebSerial permission picker.

1. Use `viperIDE_list_serial_ports` to discover connected devices
2. Use `viperIDE_connect_serial` with the device path to connect

The bridge opens the serial port at 115200 baud and fakes a WebREPL handshake so ViperIDE's existing WebSocket transport works unchanged. Multiple devices can be bridged simultaneously.

Requires the `serialport` npm package (installed automatically with `npm install`).

## Limitations

- **Bluetooth connections** require the user to click the connect button in the browser (browser security policy requires a user gesture for device picker dialogs).
- **USB connections** can be made via the serial bridge (`viperIDE_connect_serial`) without user interaction, or via the browser's WebSerial API which requires a user gesture.
- **WebSocket and VM connections** can be initiated fully by Claude.
- Running scripts is fire-and-forget. Use `read_terminal` to monitor output and `stop` to interrupt.
- Only one browser tab should be connected to the MCP server at a time.

## Development

During development, you can run the MCP server directly:

```bash
# Build ViperIDE first
npm install && python3 build.py

# Install MCP deps
cd mcp && npm install

# Run the server (logs to stderr, MCP protocol on stdio)
node mcp/src/index.js
```

The server picks a random port and opens the browser automatically.
