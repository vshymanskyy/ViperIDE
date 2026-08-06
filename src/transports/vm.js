/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * MicroPython WASM transport. Works in both browser and Node: the caller passes
 * a loadMicroPython function (statically imported in the browser bundle, dynamically
 * resolved under Node) and optional configuration for the WASM URL and initial FS.
 */

import { Transport } from './base.js'

const PYEXEC_FORCED_EXIT = 0x100
export const SYSTEM_DIRS = new Set(['/sys', '/dev', '/proc'])

const MACHINE_MODULE = `\
def reset():
    raise SystemExit

def soft_reset():
    raise SystemExit
`

/**
 * Recursively walk the Emscripten FS and collect all user files/dirs.
 */
function snapshotFS(FS, root = '/') {
    const dirs = []
    const files = []

    function walk(path) {
        if (SYSTEM_DIRS.has(path)) return
        let entries
        try {
            entries = FS.readdir(path)
        } catch {
            return
        }
        for (const name of entries) {
            if (name === '.' || name === '..') continue
            const full = path === '/' ? '/' + name : path + '/' + name
            let stat
            try {
                stat = FS.stat(full)
            } catch {
                continue
            }
            if (FS.isDir(stat.mode)) {
                dirs.push(full)
                walk(full)
            } else if (FS.isFile(stat.mode)) {
                try {
                    files.push({ path: full, data: FS.readFile(full) })
                } catch {
                    // skip unreadable files
                }
            }
        }
    }

    walk(root)
    return { dirs, files }
}

function restoreFS(FS, snapshot) {
    for (const dir of snapshot.dirs) {
        try { FS.mkdir(dir) } catch { /* already exists */ }
    }
    for (const { path, data } of snapshot.files) {
        try { FS.writeFile(path, data) } catch { /* skip */ }
    }
}

/**
 * MicroPython WASM transport.
 *
 * @param {Function} loadMicroPython  - The loadMicroPython factory from the MP package
 * @param {Object}   [opts]
 * @param {string}   [opts.wasmURL]   - Explicit URL for micropython.wasm (browser)
 * @param {Function} [opts.populateFS] - async (mp) => void, called on first boot to
 *                                       populate the filesystem with example files etc.
 */
export class MicroPythonWASM extends Transport {
    constructor(loadMicroPython, opts = {}) {
        super()
        this._loadMicroPython = loadMicroPython
        this._wasmURL = opts.wasmURL || undefined
        this._populateFS = opts.populateFS || null
        this.mp = null
        this._inRawMode = false
        this._suppressedOutput = false
        this._fsPopulated = false
        this._decoder = new TextDecoder('utf-8')
        this.info = { type: 'MicroPython WASM' }
    }

    async requestAccess() {
        await this._createVM()
    }

    async _createVM(fsSnapshot = null) {
        const mpOpts = { linebuffer: false }
        if (this._wasmURL) mpOpts.url = this._wasmURL

        mpOpts.stdout = (data) => {
            if (this._suppressedOutput) return
            if (typeof data === 'string') {
                this.receiveCallback(data)
            } else {
                this.receiveCallback(this._decoder.decode(data, { stream: true }))
            }
            this.activityCallback()
        }

        this.mp = await this._loadMicroPython(mpOpts)

        if (fsSnapshot) {
            restoreFS(this.mp.FS, fsSnapshot)
        } else if (this._populateFS && !this._fsPopulated) {
            await this._populateFS(this.mp)
            this._fsPopulated = true
        } else {
            try { this.mp.FS.mkdir('/lib') } catch { /* exists */ }
        }

        // Always ensure machine module is present
        try { this.mp.FS.mkdir('/lib') } catch { /* exists */ }
        this.mp.FS.writeFile('/lib/machine.py', MACHINE_MODULE)
    }

    _processInputChar(c) {
        // NOTE: PyScript variant is not built with ASYNCIFY
        //return this.mp.replProcessCharWithAsyncify(c)

        return this.mp.replProcessChar(c)
    }

    /**
     * Restart the WASM VM while preserving the filesystem.
     * Implements both hard and soft reset identically.
     */
    async _restart() {
        const wasRaw = this._inRawMode

        const snapshot = snapshotFS(this.mp.FS)
        this._suppressedOutput = true

        this._decoder = new TextDecoder('utf-8')

        await this._createVM(snapshot)
        this.mp.replInit()

        if (wasRaw) {
            await this._processInputChar(0x03)
            await this._processInputChar(0x01)
        }

        this._suppressedOutput = false
        if (wasRaw) {
            this.receiveCallback('MPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>')
        } else {
            this.receiveCallback('MPY: soft reboot\r\n>>> ')
        }
        this.activityCallback()
    }

    async connect() {
        this.mp.replInit()
    }

    async disconnect() {
        this.mp = null
    }

    async writeBytes(data) {
        for (let i = 0; i < data.length; i++) {
            const byte = data[i]

            if (byte === 0x01) this._inRawMode = true
            else if (byte === 0x02) this._inRawMode = false

            const ret = await this._processInputChar(byte)
            if (ret === PYEXEC_FORCED_EXIT) {
                await this._restart()
            } else if (ret) {
                this.disconnectCallback()
            }
        }
    }
}
