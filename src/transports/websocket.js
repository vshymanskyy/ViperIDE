/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 */

import { sleep, report } from '../utils.js'
import { Transport } from './base.js'

export class WebSocketREPL extends Transport {
    constructor(url) {
        super()
        if (!url) {
            throw new Error("WebSocket URL is required")
        }
        this.url = url
        this.socket = null
        this.last_activity = 0
        super.writeChunk = 512
        this.info = {
            url: this.url
        }
        /* The address is all it takes to open this one again */
        this.canReopen = true
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
            // Send empty data frame
            const now = Date.now()
            if (this.socket && (now - this.last_activity > 55*1000)) {
                this.socket.send('')
                this.last_activity = now
            }
        }, 10*1000)

        const decoder = new TextDecoder('utf-8')

        this.socket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                this.receiveCallback(decoder.decode(event.data, { stream: true }))
            } else {
                this.receiveCallback(event.data)
            }
            this.activityCallback()
            this.last_activity = Date.now()
        }

        this.socket.onclose = (_ev) => {
            /* Nothing left to keep alive, and the heartbeat would otherwise go on
               poking a closed socket every ten seconds */
            clearInterval(this.hbeat)
            this.hbeat = null
            this.disconnectCallback()
        }

        const release = await this.startTransaction()
        try {
            try {
                this.socket.send('')
                await this.readUntil('Password:', 5000)
            } catch (_err) {
                return
            }
            const pass = await this._passReqCallback()
            if (!pass) {
                throw new Error("Password is required")
            }
            await this.write(pass + '\n')
            await this.readUntil('\n') // skip echo
            const rsp = (await this.readUntil('\n')).trim()
            if (rsp == "WebREPL connected") {
                // All good!
            } else if (rsp == "Access denied") {
                throw new Error("Invalid password")
            } else {
                throw new Error(rsp)
            }
        } finally {
            release()
        }
    }

    /* connect() builds its own socket and redoes the WebREPL handshake, so all this
       has to do is let go of the closed one. */
    async reopen() {
        clearInterval(this.hbeat)
        this.hbeat = null
        if (this.socket) {
            /* An attempt that got as far as opening a socket and then failed the
               handshake leaves one behind, and it will not close itself */
            try { this.socket.close() } catch (_err) { /* already closed */ }
            this.socket = null
        }
        await this.connect()
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
                    await sleep(20)
                }
            }
            this.last_activity = Date.now()
        } catch (err) {
            report("Write error", err) // TODO
        }
    }
}
