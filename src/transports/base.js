/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { sleep, Mutex, report } from '../utils.js'

export class Transport {
    constructor() {
        if (this.constructor === Transport) {
            throw new Error("Cannot instantiate abstract class Transport")
        }
        this.mutex = new Mutex()
        this.inTransaction = false
        this.receivedData = ''
        this.activityCallback = () => {}
        this.receiveCallback = () => {}
        this.disconnectCallback = () => {}
        this.writeChunk = 128
        this.emit = false
        this.info = {}
        /* Whether this transport still knows enough about the device to open it
           again on its own. Access is granted to a device, not to a connection, so
           what needs asking is asked once - but only the transport can say whether
           what it holds outlives the device going away. */
        this.canReopen = false
        this._readsAborted = false
    }

    /*
     * Makes every pending read throw promptly. A port that died mid-read would
     * otherwise hold its transaction (and the mutex behind it) forever - most
     * notably a Run with no timeout. The next transaction clears it: it can only
     * start once the aborted one has seen the flag and let the mutex go.
     */
    abortReads() {
        this._readsAborted = true
    }

    async requestAccess() {
        throw new Error("Method 'requestAccess()' must be implemented.")
    }

    async connect() {
        throw new Error("Method 'connect()' must be implemented.")
    }

    async getInfo() {
        return this.info
    }

    setDeviceInfo(_deviceInfo) {
        // skip
    }

    handleWriteError(_err) {
        return false
    }

    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented.")
    }

    /*
     * Clears away a connection that died and brings the same device back up, with
     * nothing asked of the user. Throws if the device is not back yet, which is the
     * expected answer while a board is still rebooting.
     */
    async reopen() {
        throw new Error("Reconnecting is not supported by this transport")
    }

    async write(data) {
        const encoder = new TextEncoder()
        const value = encoder.encode(data)
        try {
            let offset = 0
            while (offset < value.byteLength) {
                const chunk = value.slice(offset, offset + this.writeChunk)
                await this.writeBytes(chunk)
                this.activityCallback()
                offset += this.writeChunk
            }
        } catch (err) {
            if (!this.handleWriteError(err)) {
                report("Write error", err) // TODO
            }
        }
    }

    onActivity(callback) {
        this.activityCallback = callback
    }

    onReceive(callback) {
        this.receiveCallback = callback
    }

    onDisconnect(callback) {
        this.disconnectCallback = callback
    }

    /*
     * Transaction API
     */

    async startTransaction() {
        const release = await this.mutex.acquire()
        this._readsAborted = false
        this.prevRecvCbk = this.receiveCallback
        this.inTransaction = true
        this.receivedData = ''
        this.receiveCallback = (data) => {
            this.receivedData += data
            if (this.emit && this.prevRecvCbk) { this.prevRecvCbk(data) }
        }

        return () => {
            if (this.prevRecvCbk) {
                this.receiveCallback = this.prevRecvCbk
                this.receiveCallback(this.receivedData)
            }
            this.receivedData = null
            this.inTransaction = false

            release()
        }
    }

    async flushInput() {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        this.receivedData = ''
        /*while (1) {
            const { value, done } = await reader.read()
            console.log(value, done)
            if (done) { break }
            if (value.length == 0) { break }
        }*/
    }

    async readExactly(n, timeout=5000) {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        let endTime = Date.now() + timeout
        while (timeout <= 0 || (Date.now() < endTime)) {
            if (this._readsAborted) {
                throw new Error('Timeout: transport closed')
            }
            if (this.receivedData.length >= n) {
                const res = this.receivedData.substring(0, n)
                this.receivedData = this.receivedData.substring(n)
                return res
            }
            const prev_avail = this.receivedData.length
            await sleep(10)
            if (this.receivedData.length > prev_avail) {
                endTime = Date.now() + timeout
            }
        }
        throw new Error('Timeout')
    }

    /* `endings` is one string, or a list of alternatives - whichever turns up first
       in the buffer wins. Alternatives are needed because the prompt a board answers
       with is not fixed: see REPL_PROMPTS in rawmode.js. */
    async readUntil(endings, timeout=5000) {
        if (!Array.isArray(endings)) { endings = [endings] }
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        let endTime = Date.now() + timeout
        while (timeout <= 0 || (Date.now() < endTime)) {
            if (this._readsAborted) {
                throw new Error('Timeout: transport closed')
            }
            /* The earliest ending wins, not the first one listed: reading past one
               match to reach another would swallow whatever sits between them. */
            let end = -1
            for (const ending of endings) {
                const at = this.receivedData.indexOf(ending)
                if (at >= 0 && (end < 0 || at + ending.length < end)) {
                    end = at + ending.length
                }
            }
            if (end >= 0) {
                const res = this.receivedData.substring(0, end)
                this.receivedData = this.receivedData.substring(end)
                return res
            }
            const prev_avail = this.receivedData.length
            await sleep(10)
            if (this.receivedData.length > prev_avail) {
                endTime = Date.now() + timeout
            }
        }
        throw new Error('Timeout reached before finding the ending sequence')
    }
}
