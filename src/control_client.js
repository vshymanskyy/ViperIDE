/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

/*
 * MCP Control Client
 *
 * Browser-side WebSocket client that enables programmatic control
 * of ViperIDE from an MCP server. Connects to ws://localhost:PORT/ws
 * when the IDE is loaded with ?mcp query parameter.
 */

import { splitPath, Mutex } from './utils.js'

const utf8Decoder = new TextDecoder('utf-8', { fatal: false })

export function initControlClient(api) {
    const wsUrl = `ws://${window.location.host}/ws`
    let ws = null
    let reconnectDelay = 2000

    // Tracks the MCP-visible connection state. app.js does not clear its
    // module-local devInfo on disconnect, so we can't trust api.getDevInfo()
    // to reflect the active port. Instead we snapshot devInfo here when the
    // deviceConnected event fires, and drop it when the port goes away.
    let connecting = false
    let lastConnectedDevInfo = null

    function connect() {
        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
            console.log('[MCP] Control channel connected')
            reconnectDelay = 2000
            send({ type: 'hello', version: '0.1.0' })
        }

        ws.onclose = () => {
            console.log('[MCP] Control channel disconnected, reconnecting...')
            setTimeout(connect, reconnectDelay)
            reconnectDelay = Math.min(reconnectDelay * 2, 60000)
        }

        ws.onerror = () => {
            // onclose will fire after this
        }

        ws.onmessage = async (event) => {
            let msg
            try {
                msg = JSON.parse(event.data)
            } catch {
                return
            }

            if (!msg.method || !msg.id) return

            try {
                const result = await dispatch(msg.method, msg.params || {})
                send({ jsonrpc: '2.0', id: msg.id, result })
            } catch (err) {
                send({ jsonrpc: '2.0', id: msg.id, error: { message: err.message } })
            }
        }
    }

    function send(msg) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg))
        }
    }

    function pushEvent(name, data = {}) {
        send({ type: 'event', event: name, data })
    }

    // Serialized via mutex because upstream ViperIDE uses browser dialogs
    // and we can't modify those function signatures.
    const dialogMutex = new Mutex()
    async function withDialogOverrides(overrides, fn) {
        const release = await dialogMutex.acquire()
        const origPrompt = window.prompt
        const origConfirm = window.confirm
        if (overrides.prompt !== undefined) window.prompt = () => overrides.prompt
        if (overrides.confirm !== undefined) window.confirm = () => overrides.confirm
        try {
            return await fn()
        } finally {
            window.prompt = origPrompt
            window.confirm = origConfirm
            release()
        }
    }

    function readTerminalBuffer() {
        const term = api.getTerm()
        if (!term) return ''
        const buf = term.buffer.active
        const lines = []
        for (let i = 0; i < buf.length; i++) {
            const line = buf.getLine(i)
            if (line) lines.push(line.translateToString(true))
        }
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop()
        }
        return lines.join('\n')
    }

    async function withRawMode(fn) {
        const port = api.getPort()
        if (!port) throw new Error('No device connected')
        const raw = await api.MpRawMode.begin(port)
        try {
            return await fn(raw)
        } finally {
            try { await raw.end() } catch (_e) { /* device may have disconnected */ }
        }
    }

    async function dispatch(method, params) {
        switch (method) {
            case 'get_status': {
                const port = api.getPort()
                if (!port) {
                    lastConnectedDevInfo = null
                    connecting = false
                }
                const isConnected = !!port && lastConnectedDevInfo !== null
                return {
                    connected: isConnected,
                    connecting: !!port && connecting && !isConnected,
                    deviceInfo: isConnected ? lastConnectedDevInfo : null,
                    currentFile: api.getEditorFn(),
                    isRunning: api.isRunning(),
                    hasEditor: !!api.getEditor(),
                }
            }

            case 'connect_device': {
                const { type, url, password } = params
                if (type === 'usb' || type === 'ble') {
                    return {
                        requiresUserAction: true,
                        message: `${type.toUpperCase()} requires user interaction. Click the ${type === 'usb' ? 'USB' : 'Bluetooth'} button in the browser.`,
                    }
                }
                if (type === 'ws' && !url) throw new Error('URL is required for WebSocket connections')
                const port = api.getPort()
                if (port) await api.disconnectDevice()
                if (url && type === 'ws') window.webrepl_url = url
                if (type === 'vm') window.webrepl_url = 'vm://default'
                const overrides = { confirm: true }
                if (password) overrides.prompt = password
                // VM is connected via the 'ws' path with a vm:// webrepl_url.
                // Fire and forget - connectDevice includes raw mode handshake which
                // can take 20+ seconds, exceeding Claude Desktop's API timeout.
                const connType = type === 'vm' ? 'ws' : type
                connecting = true
                lastConnectedDevInfo = null
                withDialogOverrides(overrides, () => api.connectDevice(connType))
                    .catch(err => {
                        connecting = false
                        pushEvent('connect_error', { error: err.message })
                    })
                return { ok: true, message: 'Connection initiated. Use get_status to check when the device is ready.' }
            }

            case 'disconnect_device': {
                await api.disconnectDevice()
                connecting = false
                lastConnectedDevInfo = null
                return { ok: true }
            }

            case 'list_files': {
                return withRawMode(async (raw) => {
                    const tree = await raw.walkFs()
                    const stats = await raw.getFsStats().catch(() => [null, null, null])
                    const files = []
                    function walk(nodes) {
                        for (const n of nodes) {
                            if ('content' in n) {
                                files.push({ path: n.path, type: 'dir' })
                                walk(n.content)
                            } else {
                                files.push({ path: n.path, type: 'file', size: n.size })
                            }
                        }
                    }
                    walk(tree)
                    return { files, fsUsed: stats[0], fsFree: stats[1], fsSize: stats[2] }
                })
            }

            case 'read_file': {
                const { path } = params
                return withRawMode(async (raw) => {
                    const content = await raw.readFile(path)
                    const text = utf8Decoder.decode(content)
                    return { path, content: text }
                })
            }

            case 'write_file': {
                const { path, content } = params
                return withRawMode(async (raw) => {
                    const [dir] = splitPath(path)
                    if (dir) await raw.makePath(dir)
                    await raw.writeFile(path, content)
                    return { ok: true, path }
                })
            }

            case 'delete_file': {
                const { path } = params
                await withDialogOverrides({ confirm: true }, () => api.removeFile(path))
                return { ok: true }
            }

            case 'delete_dir': {
                const { path } = params
                await withDialogOverrides({ confirm: true }, () => api.removeDir(path))
                return { ok: true }
            }

            case 'mkdir': {
                const { path } = params
                return withRawMode(async (raw) => {
                    await raw.makePath(path)
                    return { ok: true }
                })
            }

            case 'open_file': {
                const { path } = params
                await api.fileClick(path)
                return { ok: true }
            }

            case 'get_editor': {
                const editor = api.getEditor()
                if (!editor) return { content: null, filename: null }
                return {
                    content: editor.state.doc.toString(),
                    filename: api.getEditorFn(),
                }
            }

            case 'set_editor': {
                const { content } = params
                const editor = api.getEditor()
                if (!editor) throw new Error('No editor open')
                editor.dispatch({
                    changes: { from: 0, to: editor.state.doc.length, insert: content }
                })
                return { ok: true }
            }

            case 'save_file': {
                if (!api.getPort()) throw new Error('No device connected')
                if (!api.getEditor()) throw new Error('No file open in editor')
                const { filename } = params
                if (filename) {
                    await withDialogOverrides({ prompt: filename }, () => api.saveCurrentFile())
                } else {
                    await api.saveCurrentFile()
                }
                return { ok: true }
            }

            case 'run_file': {
                if (!api.getPort()) throw new Error('No device connected')
                if (!api.getEditor()) throw new Error('No file open in editor')
                api.runCurrentFile().catch(err => {
                    pushEvent('execution_error', { error: err.message })
                })
                return { ok: true, message: 'Execution started. Use read_terminal to monitor output, stop to interrupt.' }
            }

            case 'stop': {
                if (!api.getPort()) throw new Error('No device connected')
                if (api.isRunning()) {
                    await api.getPort().write('\r\x03\x03')
                    return { ok: true }
                }
                return { ok: true, message: 'Nothing running' }
            }

            case 'reboot': {
                if (!api.getPort()) throw new Error('No device connected')
                const { mode } = params
                await api.reboot(mode || 'hard')
                return { ok: true }
            }

            case 'read_terminal': {
                return { content: readTerminalBuffer() }
            }

            case 'write_terminal': {
                let { text } = params
                const port = api.getPort()
                if (!port) throw new Error('No device connected')
                // Unescape literal \r \n \t \xNN sequences that arrive as text from JSON
                text = text.replace(/\\r/g, '\r').replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t').replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
                // Auto-append \r\n if the command doesn't end with a newline
                if (!text.endsWith('\n') && !text.endsWith('\r')) text += '\r\n'
                await port.write(text)
                return { ok: true }
            }

            case 'clear_terminal': {
                api.clearTerminal()
                return { ok: true }
            }

            case 'install_package': {
                const { name, version } = params
                await api.installPkg(name, { version: version || null })
                return { ok: true }
            }

            case 'create_file': {
                const { path, name } = params
                await withDialogOverrides({ prompt: name }, () => api.createNewFile(path))
                return { ok: true }
            }

            case 'close_file': {
                const { path } = params
                const tab = document.querySelector(`#editor-tabs .tab[data-fn="${path}"]`)
                if (!tab) return { ok: true, message: 'File not open' }
                // Bypass unsaved changes confirm, then click close
                await withDialogOverrides({ confirm: true }, () => {
                    tab.querySelector('.menu-action').click()
                })
                return { ok: true }
            }

            default:
                throw new Error(`Unknown method: ${method}`)
        }
    }

    document.addEventListener('deviceConnected', () => {
        lastConnectedDevInfo = api.getDevInfo() || null
        connecting = false
        pushEvent('device_connected', lastConnectedDevInfo || {})
    })
    document.addEventListener('fileRemoved', (e) => pushEvent('file_removed', e.detail))
    document.addEventListener('dirRemoved', (e) => pushEvent('dir_removed', e.detail))
    document.addEventListener('fileRenamed', (e) => pushEvent('file_renamed', e.detail))
    document.addEventListener('fileSaved', (e) => pushEvent('file_saved', e.detail))
    document.addEventListener('editorLoaded', (e) => pushEvent('editor_loaded', { fn: e.detail.fn }))

    connect()
}
