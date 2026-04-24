#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import open from 'open'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { IDEServer } from './ide-server.js'
import { Bridge } from './bridge.js'
import { SerialBridge } from './serial-bridge.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Resolve the build directory: env var (MCPB bundle), sibling dir (tarball), or repo layout
const buildDir = process.env.VIPERIDE_BUILD_DIR
    || [path.resolve(__dirname, '../build'), path.resolve(__dirname, '../../build')]
        .find(d => fs.existsSync(path.join(d, 'index.html')))

if (!buildDir) {
    console.error('[ViperIDE MCP] Build directory not found.')
    console.error('[ViperIDE MCP] Run "python3 build.py" in the ViperIDE root first.')
    process.exit(1)
}

// IDE server and bridge are created lazily on first tool call so the MCP
// transport handshake completes immediately without waiting for HTTP listen.
let ideServer = null
let bridge = null
let serialBridge = null
let idePort = null
let ideUrl = null
let initPromise = null

async function ensureInit() {
    if (ideServer) return
    if (initPromise) return initPromise
    initPromise = (async () => {
        ideServer = new IDEServer(buildDir)
        bridge = new Bridge(ideServer)
        serialBridge = new SerialBridge()
        ideServer.serialBridge = serialBridge
        idePort = await ideServer.start()
        ideUrl = `http://localhost:${idePort}/?mcp=1`
        console.error(`[ViperIDE MCP] IDE server ready at ${ideUrl}`)
    })()
    return initPromise
}

let browserOpening = false
async function ensureBrowser() {
    await ensureInit()
    if (bridge.isConnected || browserOpening) return
    browserOpening = true
    console.error('[ViperIDE MCP] Opening browser...')
    open(ideUrl)
        .catch(err => console.error('[ViperIDE MCP] Failed to open browser:', err))
        .finally(() => { browserOpening = false })
}

function textResult(data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data)
    return { content: [{ type: 'text', text }] }
}

function errorResult(msg) {
    return { content: [{ type: 'text', text: msg }], isError: true }
}

const mcp = new McpServer({
    name: 'viperIDE',
    version: '0.1.0',
})

// get_status is handled separately so it works without the browser
mcp.tool(
    'viperIDE_get_status',
    'Get ViperIDE connection status, device info, and editor state. ViperIDE is served locally from this MCP server at ideUrl; it is NOT at viper-ide.org. If browserConnected is false the tab can be (re)launched with viperIDE_open_ide or by directing the user to ideUrl. The connected/connecting fields reflect the actual device connection state, not the browser state.',
    {},
    async () => {
        await ensureInit()
        if (!bridge.isConnected) {
            return textResult({
                browserConnected: false,
                connected: false,
                deviceInfo: null,
                ideUrl,
                message: 'ViperIDE browser tab is not open. Call viperIDE_open_ide to launch it, or open ideUrl in a browser. Do NOT direct the user to viper-ide.org - this MCP serves its own bundled copy locally.',
            })
        }
        try {
            const result = await bridge.call('get_status')
            return textResult({ browserConnected: true, ideUrl, ...result })
        } catch (err) {
            return errorResult(err.message)
        }
    }
)

mcp.tool(
    'viperIDE_open_ide',
    'Open the bundled ViperIDE in the user\'s default browser. Use this if get_status reports browserConnected: false, or if the user says they can\'t see ViperIDE. The URL is served by this MCP server on localhost; never direct the user to viper-ide.org.',
    {},
    async () => {
        await ensureBrowser()
        return textResult({
            ideUrl,
            browserConnected: bridge.isConnected,
            message: bridge.isConnected
                ? 'ViperIDE browser tab is already connected.'
                : 'Launching ViperIDE in the default browser. The tab should appear momentarily; poll get_status until browserConnected is true.',
        })
    }
)

const tools = [
    {
        name: 'viperIDE_connect_device',
        description: 'Connect to a MicroPython device over WebSocket (WebREPL), Bluetooth LE, or the built-in virtual device. For USB serial devices do NOT use this tool; use viperIDE_list_serial_ports + viperIDE_connect_serial instead (they go through the local serial bridge and work without browser interaction). Use type "ws" with a URL for WebREPL, "ble" for Bluetooth LE (requires user to pick the device in the browser), "vm" for the virtual device. Non-blocking; the device handshake takes 10-20 seconds. Poll viperIDE_get_status every 5 seconds until connected is true; do not assume failure before 30 seconds.',
        schema: {
            type: z.enum(['ws', 'ble', 'vm']).describe('Connection type: ws (WebREPL), ble (Bluetooth LE), vm (virtual device). For USB, use viperIDE_connect_serial instead.'),
            url: z.string().optional().describe('WebSocket URL, e.g. ws://192.168.1.1:8266 (required for ws type)'),
            password: z.string().optional().describe('WebREPL password (for ws type)'),
        },
        method: 'connect_device',
    },
    {
        name: 'viperIDE_disconnect_device',
        description: 'Disconnect from the current device',
        schema: {},
        method: 'disconnect_device',
    },
    {
        name: 'viperIDE_list_files',
        description: 'List all files and directories on the connected MicroPython device',
        schema: {},
        method: 'list_files',
    },
    {
        name: 'viperIDE_read_file',
        description: 'Read a file from the connected MicroPython device',
        schema: { path: z.string().describe('File path on device, e.g. /main.py') },
        method: 'read_file',
    },
    {
        name: 'viperIDE_write_file',
        description: 'Write content to a file on the connected MicroPython device. Creates parent directories as needed. Note: this writes to the device filesystem only; the editor is not updated. Use open_file after writing to refresh the editor, or use set_editor + save_file to edit and save in one flow.',
        schema: {
            path: z.string().describe('File path on device, e.g. /main.py'),
            content: z.string().describe('File content to write'),
        },
        method: 'write_file',
    },
    {
        name: 'viperIDE_delete_file',
        description: 'Delete a file from the connected MicroPython device',
        schema: { path: z.string().describe('File path to delete') },
        method: 'delete_file',
    },
    {
        name: 'viperIDE_delete_dir',
        description: 'Delete a directory from the connected MicroPython device',
        schema: { path: z.string().describe('Directory path to delete') },
        method: 'delete_dir',
    },
    {
        name: 'viperIDE_mkdir',
        description: 'Create a directory on the connected MicroPython device',
        schema: { path: z.string().describe('Directory path to create') },
        method: 'mkdir',
    },
    {
        name: 'viperIDE_open_file',
        description: 'Open a file from the device in the ViperIDE editor',
        schema: { path: z.string().describe('File path on device to open') },
        method: 'open_file',
    },
    {
        name: 'viperIDE_get_editor',
        description: 'Get the current content of the ViperIDE editor and the open filename',
        schema: {},
        method: 'get_editor',
    },
    {
        name: 'viperIDE_set_editor',
        description: 'Replace the content of the ViperIDE editor',
        schema: { content: z.string().describe('New editor content') },
        method: 'set_editor',
    },
    {
        name: 'viperIDE_save_file',
        description: 'Save the current editor content to the connected device. Optionally provide a filename for untitled files.',
        schema: { filename: z.string().optional().describe('Filename for untitled files, e.g. main.py') },
        method: 'save_file',
    },
    {
        name: 'viperIDE_run_file',
        description: 'Execute the current EDITOR content on the device via raw REPL. Important: this runs whatever is shown in the editor, not what is on the device filesystem. To run new code: set_editor with the code, then run_file. Or write_file then open_file then run_file. Non-blocking; use read_terminal to monitor output, stop to interrupt.',
        schema: {},
        method: 'run_file',
    },
    {
        name: 'viperIDE_stop',
        description: 'Stop the currently running script on the device (sends Ctrl-C)',
        schema: {},
        method: 'stop',
    },
    {
        name: 'viperIDE_reboot',
        description: 'Reboot the connected MicroPython device',
        schema: { mode: z.enum(['soft', 'hard', 'bootloader']).default('hard').describe('Reboot mode') },
        method: 'reboot',
    },
    {
        name: 'viperIDE_read_terminal',
        description: 'Read the current content of the terminal/REPL output',
        schema: {},
        method: 'read_terminal',
        transform: (result) => result.content,
    },
    {
        name: 'viperIDE_write_terminal',
        description: 'Send a single short REPL command (a newline is appended automatically). Only for quick interactive commands like print() or help(). For multi-line code or scripts, use write_file + run_file instead.',
        schema: { text: z.string().describe('Single REPL command, e.g. "print(1+1)"') },
        method: 'write_terminal',
    },
    {
        name: 'viperIDE_clear_terminal',
        description: 'Clear the terminal/REPL output',
        schema: {},
        method: 'clear_terminal',
    },
    {
        name: 'viperIDE_install_package',
        description: 'Install a MicroPython package on the connected device',
        schema: {
            name: z.string().describe('Package name or URL'),
            version: z.string().optional().describe('Specific version to install'),
        },
        method: 'install_package',
    },
    {
        name: 'viperIDE_create_file',
        description: 'Create a new file on the connected device and open it in the editor',
        schema: {
            path: z.string().describe('Parent directory, e.g. /'),
            name: z.string().describe('Filename to create, e.g. main.py'),
        },
        method: 'create_file',
    },
    {
        name: 'viperIDE_close_file',
        description: 'Close a file tab in the editor. Does not delete the file from the device.',
        schema: { path: z.string().describe('File path to close, e.g. /main.py') },
        method: 'close_file',
    },
]

for (const { name, description, schema, method, transform } of tools) {
    mcp.tool(name, description, schema, async (params) => {
        await ensureBrowser()
        try {
            const result = await bridge.call(method, params)
            return textResult(transform ? transform(result) : result)
        } catch (err) {
            return errorResult(err.message)
        }
    })
}

mcp.tool(
    'viperIDE_list_serial_ports',
    'List available USB serial ports on the host. Use this as the FIRST step when the user asks to connect to a USB MicroPython device. Returns likelyPorts (MicroPython-capable boards identified by USB VID: Raspberry Pi/Pico, Adafruit, Espressif, WCH, Silicon Labs, FTDI, etc.) and allPorts. On Windows, ports appear as COMx; on Linux as /dev/ttyACMx or /dev/serial/by-id/...',
    {},
    async () => {
        await ensureInit()
        try {
            const result = await serialBridge.listPorts()
            return textResult(result)
        } catch (err) {
            return errorResult(err.message)
        }
    }
)

mcp.tool(
    'viperIDE_connect_serial',
    'Connect to a USB MicroPython device. This is the PREFERRED way to connect to any USB/serial MicroPython board (do NOT use viperIDE_connect_device with type "usb"). Goes through the local serial bridge so no browser interaction is required. Call viperIDE_list_serial_ports first to find the port path; if exactly one likelyPort is returned, use it without prompting. On Windows use COMx format, on Linux use /dev/ttyACMx or /dev/serial/by-id/... paths. Non-blocking; the device handshake takes 10-20 seconds. Poll viperIDE_get_status every 5 seconds until connected is true; do not assume failure before 30 seconds.',
    {
        port_path: z.string().describe('Serial port path, e.g. COM4 or /dev/serial/by-id/usb-MicroPython_Board_...'),
    },
    async ({ port_path }) => {
        await ensureBrowser()
        try {
            const wsUrl = `ws://localhost:${idePort}/serial/${encodeURIComponent(port_path)}`
            // Fire and forget - connection + raw mode handshake can take 20+ seconds
            // which exceeds Claude Desktop's API timeout. Return immediately.
            bridge.call('connect_device', { type: 'ws', url: wsUrl })
                .catch(err => console.error('[ViperIDE MCP] connect_serial error:', err.message))
            return textResult({
                url: wsUrl,
                ok: true,
                message: 'Connection initiated. Use get_status to check when the device is ready.',
            })
        } catch (err) {
            return errorResult(err.message)
        }
    }
)

for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
        if (ideServer) await ideServer.stop()
        process.exit(0)
    })
}

const transport = new StdioServerTransport()
await mcp.connect(transport)
console.error('[ViperIDE MCP] MCP server ready')
