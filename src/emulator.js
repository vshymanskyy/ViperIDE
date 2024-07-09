/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { Transport } from './transports.js'

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
