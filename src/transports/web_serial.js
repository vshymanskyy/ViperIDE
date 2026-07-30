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
        this.reader = decoderStream.readable.getReader()
        this.writer = this.port.writable.getWriter()

        const processStream = async () => {
            while (true) {
                const { value, done } = await this.reader.read()
                if (done) {
                    this.reader.releaseLock()
                    break
                }
                this.receiveCallback(value)
                this.activityCallback()
            }
            this.disconnectCallback()
        }
        processStream()
    }

    async disconnect() {
        if (this.reader) {
            await this.reader.cancel()
            await this.readableStreamClosed.catch(() => {})
        }
        await this.port.forget()
    }

    async writeBytes(data) {
        await this.writer.write(data)
    }
}
