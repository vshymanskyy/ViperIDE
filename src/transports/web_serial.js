/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 */

import { report } from '../utils.js'
import { Transport } from './base.js'

export class WebSerial extends Transport {
    constructor(serial=null) {
        super()
        this.port = null
        this.reader = null
        this.writer = null
        this.canReopen = true
        if (serial) {
            this.serial = serial
        } else {
            if (typeof navigator.serial === 'undefined') {
                throw new Error('WebSerial not available')
            }
            this.serial = navigator.serial
        }
    }

    async requestAccess() {
        this.port = await this.serial.requestPort()
        try {
            const pi = this.port.getInfo()
            this.info = {
                vid: pi.usbVendorId.toString(16).padStart(4, '0'),
                pid: pi.usbProductId.toString(16).padStart(4, '0'),
            }
        } catch (err) {
            report("Error", err)
        }
    }

    async connect() {
        await this.port.open({ baudRate: 115200 })

        const decoderStream = new TextDecoderStream()
        this.readableStreamClosed = this.port.readable.pipeTo(decoderStream.writable)
        /* A device that is unplugged errors its readable rather than ending it, and
           this promise is only awaited while tearing down: marked handled here so it
           cannot surface as an unhandled rejection in the meantime. */
        this.readableStreamClosed.catch(() => {})
        this.reader = decoderStream.readable.getReader()
        this.writer = this.port.writable.getWriter()

        const processStream = async () => {
            try {
                while (true) {
                    const { value, done } = await this.reader.read()
                    if (done) { break }
                    this.receiveCallback(value)
                    this.activityCallback()
                }
            } catch (_err) {
                /* The device went away mid-read. Reading does not end cleanly then -
                   it throws - which is just as much a disconnect as `done` is. */
            } finally {
                try { this.reader.releaseLock() } catch (_err) { /* already gone */ }
                this.disconnectCallback()
            }
        }
        processStream()
    }

    /*
     * Everything that has to be let go of before the port can be opened again. The
     * device may already be gone, so every step is allowed to fail: what matters is
     * that the locks are released and the port is closed by the end.
     */
    async _teardown() {
        if (this.reader) {
            try { await this.reader.cancel() } catch (_err) { /* stream already errored */ }
            try { await this.readableStreamClosed } catch (_err) { /* device went away */ }
        }
        if (this.writer) {
            try { this.writer.releaseLock() } catch (_err) { /* already released */ }
        }
        this.reader = null
        this.writer = null
        try { await this.port.close() } catch (_err) { /* was never open */ }
    }

    async reopen() {
        await this._teardown()
        try {
            await this.connect()
        } catch (err) {
            /* Chrome hands back the same SerialPort object when a device re-enumerates,
               but the polyfill's USBDevice does not survive it. The permission is still
               granted either way, so the port can be picked out of the granted list
               rather than asked for again. */
            const granted = await this._findGranted()
            if (!granted) { throw err }
            this.port = granted
            await this.connect()
        }
    }

    async _findGranted() {
        const ports = await this.serial.getPorts()
        if (ports.includes(this.port)) { return this.port }
        if (!this.info.vid) { return null }
        /* No serial number to go by - two identical boards are indistinguishable
           here, so a single match is the only one worth trusting. */
        const matches = ports.filter((p) => {
            const pi = p.getInfo()
            return pi.usbVendorId?.toString(16).padStart(4, '0') === this.info.vid &&
                   pi.usbProductId?.toString(16).padStart(4, '0') === this.info.pid
        })
        return matches.length === 1 ? matches[0] : null
    }

    async disconnect() {
        await this._teardown()
        /* The user is done with this device: hand the permission back, which is what
           makes the next connection ask again. */
        await this.port.forget()
    }

    async writeBytes(data) {
        await this.writer.write(data)
    }
}
