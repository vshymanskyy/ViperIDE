/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Pure Node.js Transport base used by Node-only transports.
 */

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export class Mutex {
    constructor() { this._lock = Promise.resolve() }
    acquire() {
        let release
        const lock = new Promise(resolve => release = resolve)
        const acquire = this._lock.then(() => release)
        this._lock = this._lock.then(() => lock)
        return acquire
    }
}

export const report = (title, err) => {
    console.error('[report]', title, err && err.message)
}

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

    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented.")
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
            report("Write error", err)
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

    async startTransaction() {
        const release = await this.mutex.acquire()
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
    }

    async readExactly(n, timeout=5000) {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        let endTime = Date.now() + timeout
        while (timeout <= 0 || (Date.now() < endTime)) {
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

    async readUntil(ending, timeout=5000) {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        let endTime = Date.now() + timeout
        while (timeout <= 0 || (Date.now() < endTime)) {
            const idx = this.receivedData.indexOf(ending) + ending.length
            if (idx >= ending.length) {
                const res = this.receivedData.substring(0, idx)
                this.receivedData = this.receivedData.substring(idx)
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
