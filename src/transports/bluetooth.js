/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 */

import { sleep, report } from '../utils.js'
import { Transport } from './base.js'

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'       // Write or Write Without Response
const NUS_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'       // Notify
const NUS_TX_LIMIT = 20

const ADA_NUS_SERVICE = 'adaf0001-4369-7263-7569-74507974686e'
const ADA_NUS_TX = 'adaf0002-4369-7263-7569-74507974686e'   // Write or Write Without Response
const ADA_NUS_RX = 'adaf0003-4369-7263-7569-74507974686e'   // Notify
const ADA_VER = 'adaf0100-4669-6c65-5472-616e73666572'
const ADA_FT = 'adaf0200-4669-6c65-5472-616e73666572'
const ADA_NUS_TX_LIMIT = 20

const CH9143_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb'
const CH9143_TX = '0000fff2-0000-1000-8000-00805f9b34fb'    // Write or Write Without Response
const CH9143_RX = '0000fff1-0000-1000-8000-00805f9b34fb'    // Notify
const CH9143_CTRL = '0000fff3-0000-1000-8000-00805f9b34fb'  // Read / Write
const CH9143_TX_LIMIT = 20

export class WebBluetooth extends Transport {
    constructor() {
        super()
        if (typeof navigator.bluetooth === 'undefined') {
            throw new Error('WebBluetooth not available')
        }
        this.device = null
        this.server = null
        this.service = null
        this.rx = null
        this.tx = null
        super.writeChunk = 20
        this.decoderStream = null
        this.reader = null
        /* The device object outlives the GATT link, and reconnecting to it needs no
           picker - only requestDevice() does. */
        this.canReopen = true
    }

    async requestAccess() {
        this.device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [NUS_SERVICE] },
                { namePrefix: 'mpy-' },
                { services: [ 0xfebb ] },
                { namePrefix: 'CIRCUITPY' },
                { namePrefix: 'CH9143' },
            ],
            //acceptAllDevices: true,
            optionalServices: [NUS_SERVICE, ADA_NUS_SERVICE, 0xfebb, CH9143_SERVICE],
        })

        /* Kept so it can be taken off again: the listener sits on the device, which
           outlives this transport, and one that is no longer anybody's must not
           still be reporting drops. */
        this.onGattDisconnected = () => { this.disconnectCallback() }
        this.device.addEventListener("gattserverdisconnected", this.onGattDisconnected)
        try {
            this.info = {
                name: this.device.name,
            }
        } catch (err) {
            report("Error", err)
        }
    }

    async connect() {
        this.server = await this.device.gatt.connect()
        this.service = null

        const services = await this.server.getPrimaryServices()
        for (let service of services) {
            if (service.uuid === NUS_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(NUS_RX)
                this.tx = await service.getCharacteristic(NUS_TX)
                super.writeChunk = NUS_TX_LIMIT
                break
            } else if (service.uuid === ADA_NUS_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(ADA_NUS_RX)
                this.tx = await service.getCharacteristic(ADA_NUS_TX)
                super.writeChunk = ADA_NUS_TX_LIMIT

                // Check version
                const ada_fts = await this.server.getPrimaryService(0xfebb)
                const versionChar = await ada_fts.getCharacteristic(ADA_VER)
                const version = (await versionChar.readValue()).getUint32(0, true)
                if (version != 4) {
                    throw new Error(`Unsupported version: ${version}`)
                }

                // Register file transfer char
                const ft = await ada_fts.getCharacteristic(ADA_FT)
                //ft.removeEventListener('characteristicvaluechanged', () => {})
                ft.addEventListener('characteristicvaluechanged', () => {})
                await ft.startNotifications()
                break
            } else if (service.uuid === CH9143_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(CH9143_RX)
                this.tx = await service.getCharacteristic(CH9143_TX)
                super.writeChunk = CH9143_TX_LIMIT

                // Setup 115200 8N1
                const ctrl = await service.getCharacteristic(CH9143_CTRL)
                await ctrl.writeValue(new Uint8Array([0x06,0x00,0x09,0x00,0x00,0xC2,0x01,0x00,0x08,0x01,0x00,0x06]))
                break
            }
        }

        if (!this.service) {
            throw new Error('No compatible NUS service found')
        }

        this.decoderStream = new TextDecoderStream()
        this.reader = this.decoderStream.readable.getReader()
        const writer = this.decoderStream.writable.getWriter()

        const processStream = async () => {
            while (this.device.gatt.connected) {
                const { value, done } = await this.reader.read()
                if (done) break
                this.receiveCallback(value)
                this.activityCallback()
            }
        }

        this.rx.addEventListener('characteristicvaluechanged', (ev) => {
            writer.write(ev.target.value)
        })
        await this.rx.startNotifications()
        processStream()
    }

    /*
     * connect() rebuilds the GATT link, the characteristics and the stream from the
     * device object, so reconnecting is that plus letting go of the dead stream. The
     * 'gattserverdisconnected' listener sits on the device, not on the link, and so
     * survives to report the next drop.
     */
    async reopen() {
        await this._dropStream()
        await this.connect()
    }

    async _dropStream() {
        if (this.reader) {
            try { await this.reader.cancel() } catch (_err) { /* link already gone */ }
            try { this.reader.releaseLock() } catch (_err) { /* already released */ }
        }
        if (this.decoderStream) {
            try { await this.decoderStream.writable.abort() } catch (_err) { /* already aborted */ }
        }
        this.reader = null
        this.decoderStream = null
    }

    async disconnect() {
        /* This device is done with, so the drop about to happen is not news - and
           nothing that comes off it afterwards is either. */
        if (this.device && this.onGattDisconnected) {
            this.device.removeEventListener("gattserverdisconnected", this.onGattDisconnected)
            this.onGattDisconnected = null
        }
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
        await this._dropStream()
    }

    async writeBytes(data) {
        //await this.tx.writeValueWithoutResponse(data)
        await this.tx.writeValue(data)
        await sleep(1)
    }
}
