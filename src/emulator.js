/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { Transport } from './transports.js'
import i18next from 'i18next'

const T = i18next.t.bind(i18next)

function populateFS(fs) {

    // ----------------------------------------------------------------------
    fs.writeFile('/main.py', `
# ViperIDE - MicroPython Web IDE
# Read more: https://github.com/vshymanskyy/ViperIDE

# 🚧 This is an experimental virtual device 🚧
# It runs the official MicroPython WASM port directly in your browser
# Most things work: you can edit and run files, use the Terminal, install packages, etc.
# WARNING: if your script takes a long time to run, the browser will busy-wait

colors = [
    "\\033[31m", "\\033[32m", "\\033[33m", "\\033[34m",
    "\\033[35m", "\\033[36m", "\\033[37m",
]
reset = "\\033[0m"

text = "  ${T('example.hello', 'Привіт')} MicroPython! 𓆙"

# ${T('example.comment-colors', 'Print each letter with a different color')}
print("=" * 32)
for i, char in enumerate(text):
    color = colors[i % len(colors)]
    print(color + char, end="")
print(reset)
print("=" * 32)
`);

    // ----------------------------------------------------------------------
    fs.writeFile('/01_fetch.py', `
import js
import asyncio

async def task():
    url = "https://api.github.com/users/micropython"
    print(f"Fetching {url}...")
    res = await js.fetch(url)
    data = await res.json()
    for i in dir(data):
        print(f"{i}: {data[i]}")

asyncio.create_task(task())
`);

    // ----------------------------------------------------------------------
    fs.writeFile('/02_js_eval.py', `
import js
js.eval("alert('Hello from JavaScript')")
`);
}

export class MicroPythonWASM extends Transport {
    constructor() {
        super()
        this.mpy = null
        this.decoderStream = new TextDecoderStream()
        this.reader = this.decoderStream.readable.getReader()
        this.writer = this.decoderStream.writable.getWriter()
        this.isConnected = false
    }

    async requestAccess() {
        const processStream = async (reader) => {
            while (this.isConnected) {
                const { value, done } = await this.reader.read()
                if (done) break
                this.receiveCallback(value)
                this.activityCallback()
            }
        }

        this.mp = await loadMicroPython({
            url: 'https://viper-ide.org/assets/micropython.wasm',
            stdout: (data) => {
                this.writer.write(data)
            },
            linebuffer: false,
        });

        populateFS(this.mp.FS)

        this.isConnected = true
        processStream()
    }

    async connect() {
        this.mp.replInit()
    }

    async disconnect() {
        this.isConnected = false
        if (this.reader) {
            await this.reader.cancel()
            this.reader.releaseLock()
        }
        if (this.decoderStream) {
            await this.decoderStream.writable.abort()
        }
        // TODO: deinit emulator
    }

    async writeBytes(data) {
        for (let i = 0; i < data.length; i++) {
            const ret = await this.mp.replProcessCharWithAsyncify(data[i])
            if (ret) {
                this.disconnectCallback()
            }
        }
    }
}
