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
    }

    async requestAccess() {
        const stdoutWriter = (data) => {
            const decoder = new TextDecoder()
            this.receiveCallback(decoder.decode(data))
            this.activityCallback()
        }

        this.mp = await loadMicroPython({
            url: 'https://viper-ide.org/assets/micropython.wasm',
            stdout: stdoutWriter,
            linebuffer: false,
        });

        this.mp.runPython("print('hello world')");
    }

    async connect() {
        this.mp.replInit()
    }

    async disconnect() {

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
