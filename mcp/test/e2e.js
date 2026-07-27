#!/usr/bin/env node

/**
 * End-to-end test for the ViperIDE MCP server.
 *
 * Usage:
 *   node mcp/test/e2e.js                                    # VM-only test
 *   node mcp/test/e2e.js ws://192.168.0.143:8266 test       # WebREPL device test
 *
 * The test spawns the MCP server, waits for the browser to connect,
 * then exercises every MCP tool and reports pass/fail.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = path.resolve(__dirname, '../src/index.js')

const wsUrl = process.argv[2] || null
const wsPass = process.argv[3] || null
const serialPath = process.argv[4] || null

let passed = 0
let failed = 0
const results = []

async function test(name, fn) {
    try {
        const result = await fn()
        passed++
        results.push({ name, status: 'PASS', detail: null })
        console.log(`  PASS  ${name}`)
        return result
    } catch (err) {
        failed++
        results.push({ name, status: 'FAIL', detail: err.message })
        console.log(`  FAIL  ${name}: ${err.message}`)
        return null
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed')
}

function assertIncludes(obj, key, msg) {
    if (!(key in obj)) throw new Error(msg || `Missing key: ${key}`)
}

async function callTool(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args })
    if (result.isError) {
        const text = result.content?.[0]?.text || 'Unknown error'
        throw new Error(`Tool error: ${text}`)
    }
    const text = result.content?.[0]?.text
    if (!text) return {}
    try {
        return JSON.parse(text)
    } catch {
        return { _raw: text }
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForBrowser(client, timeoutMs = 30000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        try {
            const status = await callTool(client, 'viperIDE_get_status')
            if (status && 'connected' in status) return status
        } catch {
            // Bridge not ready yet
        }
        await sleep(1000)
    }
    throw new Error('Timeout waiting for browser to connect')
}

async function waitForDevice(client, timeoutMs = 30000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        const status = await callTool(client, 'viperIDE_get_status')
        if (status.connected) return status
        await sleep(1000)
    }
    throw new Error('Timeout waiting for device to connect')
}

async function runVMTests(client) {
    console.log('\n--- Phase 1: VM Device Tests ---\n')

    await test('connect_device (vm)', async () => {
        const r = await callTool(client, 'viperIDE_connect_device', { type: 'vm' })
        assert(r.ok, 'Expected ok:true')
    })

    // VM (WASM MicroPython) takes time to load and initialize
    await test('get_status (connected)', async () => {
        const r = await waitForDevice(client, 30000)
        assert(r.connected === true, `Expected connected:true, got ${r.connected}`)
    })

    await test('list_files', async () => {
        const r = await callTool(client, 'viperIDE_list_files')
        assertIncludes(r, 'files', 'Missing files array')
        assert(Array.isArray(r.files), 'files should be an array')
    })

    await test('write_file', async () => {
        const r = await callTool(client, 'viperIDE_write_file', {
            path: '/test_e2e.py',
            content: "print('hello from e2e')\n",
        })
        assert(r.ok, 'Expected ok:true')
    })

    await test('read_file', async () => {
        const r = await callTool(client, 'viperIDE_read_file', { path: '/test_e2e.py' })
        assert(r.content.includes("hello from e2e"), `Unexpected content: ${r.content}`)
    })

    await test('open_file', async () => {
        const r = await callTool(client, 'viperIDE_open_file', { path: '/test_e2e.py' })
        assert(r.ok, 'Expected ok:true')
    })

    await sleep(500)

    await test('get_editor', async () => {
        const r = await callTool(client, 'viperIDE_get_editor')
        assert(r.content !== null, 'Editor content is null')
        assert(r.content.includes("hello from e2e"), `Editor missing expected content`)
    })

    await test('set_editor', async () => {
        const r = await callTool(client, 'viperIDE_set_editor', {
            content: "print('modified by e2e')\n",
        })
        assert(r.ok, 'Expected ok:true')
    })

    await test('save_file', async () => {
        const r = await callTool(client, 'viperIDE_save_file')
        assert(r.ok, 'Expected ok:true')
    })

    await sleep(500)

    await test('read_file (after save)', async () => {
        const r = await callTool(client, 'viperIDE_read_file', { path: '/test_e2e.py' })
        assert(r.content.includes("modified by e2e"), `Save did not persist: ${r.content}`)
    })

    await test('run_file', async () => {
        const r = await callTool(client, 'viperIDE_run_file')
        assert(r.ok, 'Expected ok:true')
    })

    await sleep(2000)

    await test('read_terminal', async () => {
        const r = await callTool(client, 'viperIDE_read_terminal')
        assert(typeof r._raw === 'string' || typeof r.content === 'string',
            'Expected terminal content')
    })

    await test('clear_terminal', async () => {
        const r = await callTool(client, 'viperIDE_clear_terminal')
        assert(r.ok, 'Expected ok:true')
    })

    await test('mkdir', async () => {
        const r = await callTool(client, 'viperIDE_mkdir', { path: '/test_dir' })
        assert(r.ok, 'Expected ok:true')
    })

    await test('delete_dir', async () => {
        const r = await callTool(client, 'viperIDE_delete_dir', { path: '/test_dir' })
        assert(r.ok, 'Expected ok:true')
    })

    await test('delete_file', async () => {
        const r = await callTool(client, 'viperIDE_delete_file', { path: '/test_e2e.py' })
        assert(r.ok, 'Expected ok:true')
    })

    await test('reboot (soft)', async () => {
        const r = await callTool(client, 'viperIDE_reboot', { mode: 'soft' })
        assert(r.ok, 'Expected ok:true')
    })

    await sleep(1000)

    await test('disconnect_device', async () => {
        const r = await callTool(client, 'viperIDE_disconnect_device')
        assert(r.ok, 'Expected ok:true')
    })

    await test('get_status (disconnected)', async () => {
        const r = await callTool(client, 'viperIDE_get_status')
        assert(r.connected === false, `Expected connected:false, got ${r.connected}`)
    })
}

async function runWebREPLTests(client, url, password) {
    console.log(`\n--- Phase 2: WebREPL Device Tests (${url}) ---\n`)

    await test('connect_device (ws)', async () => {
        const r = await callTool(client, 'viperIDE_connect_device', {
            type: 'ws',
            url,
            password,
        })
        assert(r.ok, 'Expected ok:true')
    })

    // WebREPL connection + device interrogation takes time
    await test('get_status (ws connected)', async () => {
        const r = await waitForDevice(client, 30000)
        assert(r.connected === true, `Expected connected:true, got ${r.connected}`)
        if (r.deviceInfo) {
            console.log(`         Device: ${r.deviceInfo.machine || 'unknown'}`)
            console.log(`         Firmware: ${r.deviceInfo.version || 'unknown'}`)
        }
    })

    await test('list_files (ws)', async () => {
        const r = await callTool(client, 'viperIDE_list_files')
        assertIncludes(r, 'files', 'Missing files array')
        console.log(`         ${r.files.length} files/dirs found`)
        if (r.fsSize) console.log(`         FS: ${r.fsUsed}/${r.fsSize} bytes used`)
    })

    await test('write_file (ws)', async () => {
        const r = await callTool(client, 'viperIDE_write_file', {
            path: '/test_e2e.py',
            content: "import sys\nprint('e2e', sys.platform)\n",
        })
        assert(r.ok, 'Expected ok:true')
    })

    await test('read_file (ws)', async () => {
        const r = await callTool(client, 'viperIDE_read_file', { path: '/test_e2e.py' })
        assert(r.content.includes('e2e'), `Unexpected content: ${r.content}`)
    })

    await test('open_file (ws)', async () => {
        const r = await callTool(client, 'viperIDE_open_file', { path: '/test_e2e.py' })
        assert(r.ok, 'Expected ok:true')
    })

    await sleep(500)

    await test('run_file (ws)', async () => {
        const r = await callTool(client, 'viperIDE_run_file')
        assert(r.ok, 'Expected ok:true')
    })

    await sleep(3000)

    await test('read_terminal (ws)', async () => {
        const r = await callTool(client, 'viperIDE_read_terminal')
        const text = r._raw || r.content || ''
        console.log(`         Terminal (last 200 chars): ${text.slice(-200).replace(/\n/g, '\\n')}`)
    })

    await test('write_terminal (ws)', async () => {
        const r = await callTool(client, 'viperIDE_write_terminal', {
            text: "print('repl_echo_test')\r\n",
        })
        assert(r.ok, 'Expected ok:true')
    })

    await sleep(1000)

    await test('read_terminal after write (ws)', async () => {
        const r = await callTool(client, 'viperIDE_read_terminal')
        const text = r._raw || r.content || ''
        assert(text.includes('repl_echo_test'), `REPL echo not found in terminal`)
    })

    await test('delete_file (ws)', async () => {
        const r = await callTool(client, 'viperIDE_delete_file', { path: '/test_e2e.py' })
        assert(r.ok, 'Expected ok:true')
    })

    await test('reboot soft (ws)', async () => {
        const r = await callTool(client, 'viperIDE_reboot', { mode: 'soft' })
        assert(r.ok, 'Expected ok:true')
    })

    await sleep(2000)

    await test('disconnect_device (ws)', async () => {
        const r = await callTool(client, 'viperIDE_disconnect_device')
        assert(r.ok, 'Expected ok:true')
    })
}

async function runSerialBridgeTests(client, portPath) {
    console.log(`\n--- Phase 2b: Serial Bridge Tests (${portPath}) ---\n`)

    await test('list_serial_ports', async () => {
        const r = await callTool(client, 'viperIDE_list_serial_ports')
        assertIncludes(r, 'allPorts', 'Missing allPorts')
        assert(Array.isArray(r.allPorts), 'allPorts should be array')
        console.log(`         ${r.likelyPorts.length} likely ports, ${r.allPorts.length} total`)
        for (const p of r.likelyPorts) {
            console.log(`         - ${p.path} (${p.knownAs || p.manufacturer})`)
        }
    })

    await test('connect_serial', async () => {
        const r = await callTool(client, 'viperIDE_connect_serial', { port_path: portPath })
        assert(r.ok || r.url, `Expected ok or url, got: ${JSON.stringify(r)}`)
        if (r.url) console.log(`         Bridge URL: ${r.url}`)
    })

    await test('get_status (serial connected)', async () => {
        const r = await waitForDevice(client, 30000)
        assert(r.connected === true, `Expected connected:true, got ${r.connected}`)
        if (r.deviceInfo) {
            console.log(`         Device: ${r.deviceInfo.machine || 'unknown'}`)
            console.log(`         Firmware: ${r.deviceInfo.version || 'unknown'}`)
        }
    })

    // Detect writable root: STM32 boards use /flash/, others use /
    let fsRoot = '/'
    await test('list_files (serial)', async () => {
        const r = await callTool(client, 'viperIDE_list_files')
        assertIncludes(r, 'files', 'Missing files')
        console.log(`         ${r.files.length} files/dirs`)
        const hasFlash = r.files.some(f => f.path === '/flash' && f.type === 'dir')
        if (hasFlash) fsRoot = '/flash/'
        console.log(`         Writable root: ${fsRoot}`)
    })

    const testFile = fsRoot + 'test_e2e.py'

    await test('write_file (serial)', async () => {
        const r = await callTool(client, 'viperIDE_write_file', {
            path: testFile,
            content: "import sys\nprint('serial_e2e', sys.platform)\n",
        })
        assert(r.ok, 'Expected ok:true')
    })

    await test('read_file (serial)', async () => {
        const r = await callTool(client, 'viperIDE_read_file', { path: testFile })
        assert(r.content.includes('serial_e2e'), `Unexpected content: ${r.content}`)
    })

    await test('open_file (serial)', async () => {
        await callTool(client, 'viperIDE_open_file', { path: testFile })
    })

    await sleep(500)

    await test('run_file (serial)', async () => {
        await callTool(client, 'viperIDE_run_file')
    })

    await sleep(3000)

    await test('read_terminal (serial)', async () => {
        const r = await callTool(client, 'viperIDE_read_terminal')
        const text = r._raw || r.content || ''
        console.log(`         Terminal (last 200 chars): ${text.slice(-200).replace(/\n/g, '\\n')}`)
    })

    await test('write_terminal (serial)', async () => {
        await callTool(client, 'viperIDE_write_terminal', { text: "print('repl_serial_test')\r\n" })
    })

    await sleep(1500)

    await test('read_terminal after write (serial)', async () => {
        const r = await callTool(client, 'viperIDE_read_terminal')
        const text = r._raw || r.content || ''
        assert(text.includes('repl_serial_test'), `REPL echo not found in terminal`)
    })

    await test('delete_file (serial)', async () => {
        await callTool(client, 'viperIDE_delete_file', { path: testFile })
    })

    await test('disconnect_device (serial)', async () => {
        await callTool(client, 'viperIDE_disconnect_device')
    })
}

async function runErrorTests(client) {
    console.log('\n--- Phase 3: Error Handling Tests ---\n')

    await test('read_file with no device throws', async () => {
        try {
            await callTool(client, 'viperIDE_read_file', { path: '/nope.py' })
            throw new Error('Should have thrown')
        } catch (err) {
            assert(err.message.includes('No device connected') || err.message.includes('not connected'),
                `Unexpected error: ${err.message}`)
        }
    })

    await test('run_file with no device throws', async () => {
        try {
            await callTool(client, 'viperIDE_run_file')
            throw new Error('Should have thrown')
        } catch (err) {
            assert(err.message.includes('No device connected') || err.message.includes('not connected'),
                `Unexpected error: ${err.message}`)
        }
    })

    await test('connect_device ws without url throws', async () => {
        try {
            await callTool(client, 'viperIDE_connect_device', { type: 'ws' })
            throw new Error('Should have thrown')
        } catch (err) {
            assert(err.message.includes('URL is required'),
                `Unexpected error: ${err.message}`)
        }
    })

    await test('connect_device usb returns user action required', async () => {
        const r = await callTool(client, 'viperIDE_connect_device', { type: 'usb' })
        assert(r.requiresUserAction === true, 'Expected requiresUserAction:true')
    })
}

// --- Main ---

console.log('ViperIDE MCP Server - End-to-End Test')
console.log('=====================================\n')

// Ensure the server can open a browser on the local display
const env = { ...process.env }
if (!env.DISPLAY || env.DISPLAY.startsWith('localhost')) {
    env.DISPLAY = ':0'
}

const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    stderr: 'pipe',
    env,
})

// Forward server stderr for diagnostics
transport.stderr?.on('data', (chunk) => {
    const line = chunk.toString().trim()
    if (line) console.log(`  [server] ${line}`)
})

const client = new Client({ name: 'e2e-test', version: '0.1.0' })
await client.connect(transport)

console.log('MCP client connected. Waiting for browser...\n')
await waitForBrowser(client)
console.log('Browser connected.\n')

// List available tools
const { tools } = await client.listTools()
console.log(`Available tools: ${tools.length}`)
console.log(tools.map(t => `  - ${t.name}`).join('\n'))

await runVMTests(client)

if (wsUrl) {
    await runWebREPLTests(client, wsUrl, wsPass)
}

if (serialPath) {
    await runSerialBridgeTests(client, serialPath)
}

await runErrorTests(client)

// Summary
console.log('\n=====================================')
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`)
if (failed > 0) {
    console.log('\nFailures:')
    for (const r of results.filter(r => r.status === 'FAIL')) {
        console.log(`  - ${r.name}: ${r.detail}`)
    }
}
console.log('=====================================\n')

await client.close()
process.exit(failed > 0 ? 1 : 0)
