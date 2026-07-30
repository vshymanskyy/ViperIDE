/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Pure Node.js WebREPL transport using Node's built-in WebSocket.
 */

import { Transport, sleep, report } from './node_base.mjs'

export class WebSocketREPL extends Transport {
    constructor(url) {
        super()
        if (!url) {
            throw new Error("WebSocket URL is required")
        }
        this.url = url
        this.socket = null
        this.last_activity = 0
        this.info = {
            url: this.url
        }
    }

    onPasswordRequest(callback) {
        this._passReqCallback = callback
    }

    async requestAccess() {
    }

    async connect() {
        function _conn(url) {
            return new Promise(function(resolve, reject) {
                const ws = new WebSocket(url)
                let finished = false
                ws.onopen = async function() {
                    await sleep(300)
                    if (!finished) {
                        finished = true
                        resolve(ws)
                    }
                }
                ws.onerror = function(err) {
                    reject(err)
                }
                ws.onclose = function(ev) {
                    if (!finished) {
                        finished = true
                        reject(new Error(ev.reason))
                    }
                }
            })
        }
        this.socket = await _conn(this.url)
        this.socket.binaryType = 'arraybuffer'

        this.hbeat = setInterval(() => {
            const now = Date.now()
            if (this.socket && (now - this.last_activity > 55*1000)) {
                this.socket.send('')
                this.last_activity = now
            }
        }, 10*1000)

        this.socket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const decoder = new TextDecoder()
                this.receiveCallback(decoder.decode(event.data))
            } else {
                this.receiveCallback(event.data)
            }
            this.activityCallback()
            this.last_activity = Date.now()
        }

        this.socket.onclose = (_ev) => {
            this.disconnectCallback()
        }

        const release = await this.startTransaction()
        try {
            try {
                await this.readUntil('Password:', 5000)
            } catch (_err) {
                return
            }
            const pass = await this._passReqCallback()
            if (!pass) {
                throw new Error("Password is required")
            }
            await this.write(pass + '\n')
            await this.readUntil('\n')
            const rsp = (await this.readUntil('\n')).trim()
            if (rsp == "WebREPL connected") {
                // All good.
            } else if (rsp == "Access denied") {
                throw new Error("Invalid password")
            } else {
                throw new Error(rsp)
            }
        } finally {
            release()
        }
    }

    async disconnect() {
        if (this.socket) {
            clearInterval(this.hbeat)
            this.socket.close()
            this.socket = null
            this.hbeat = null
        }
    }

    async write(value) {
        if (!this.socket) { return; }
        try {
            let offset = 0
            while (offset < value.length) {
                const chunk = value.slice(offset, offset + this.writeChunk)
                this.socket.send(chunk)
                this.activityCallback()
                offset += this.writeChunk
                if (offset < value.length) {
                    await sleep(150)
                }
            }
            this.last_activity = Date.now()
        } catch (err) {
            report("Write error", err)
        }
    }
}
