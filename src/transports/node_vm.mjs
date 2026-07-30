/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Pure Node.js MicroPython WASM transport.
 */

import { Transport } from './node_base.mjs'

const MP_PACKAGE = '@micropython/micropython-webassembly-pyscript'

async function loadMicroPythonModule() {
    const { createRequire } = await import('node:module')
    const { pathToFileURL } = await import('node:url')
    const require = createRequire(new URL('../../package.json', import.meta.url))
    const entry = require.resolve(`${MP_PACKAGE}/micropython.mjs`)
    return await import(pathToFileURL(entry).href)
}

export async function makeVMTransport() {
    const { loadMicroPython } = await loadMicroPythonModule()

    class MicroPythonVM extends Transport {
        constructor() {
            super()
            this.mp = null
            this.info = { type: 'MicroPython WASM' }
        }

        async requestAccess() {
            const decoder = new TextDecoder('utf-8')
            this.mp = await loadMicroPython({
                linebuffer: false,
                stdout: (data) => {
                    this.receiveCallback(decoder.decode(data, { stream: true }))
                    this.activityCallback()
                },
            })

            // A real board has a lib directory on sys.path; the bare wasm build does not
            // ship one, and mip installs would fail on the missing parent directory.
            this.mp.FS.mkdir('/lib')
        }

        async connect() {
            this.mp.replInit()
        }

        async disconnect() {
            this.mp = null
        }

        async writeBytes(data) {
            for (let i = 0; i < data.length; i++) {
                const ret = await this.mp.replProcessCharWithAsyncify(data[i])
                if (ret) { this.disconnectCallback() }
            }
        }
    }

    return new MicroPythonVM()
}
