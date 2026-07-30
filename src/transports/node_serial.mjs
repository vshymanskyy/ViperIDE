/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Pure Node.js serial transport.
 */

import { Transport } from './node_base.mjs'

const ROOT = new URL('../..', import.meta.url)

async function loadSerialPort() {
    // Prefer a top-level install, fall back to the one the MCP server depends on.
    try {
        return (await import('serialport')).SerialPort
    } catch (_err) { /* not installed at the root */ }

    try {
        const { createRequire } = await import('node:module')
        const { pathToFileURL } = await import('node:url')
        const require = createRequire(new URL('mcp/package.json', ROOT))
        const mod = await import(pathToFileURL(require.resolve('serialport')).href)
        return mod.SerialPort || mod.default?.SerialPort
    } catch (_err) { /* not installed for the MCP server either */ }
    throw new Error('The serial target needs node-serialport: npm install --no-save serialport')
}

export async function makeSerialTransport(devicePath, baudRate = 115200) {
    const SerialPort = await loadSerialPort()

    class NodeSerial extends Transport {
        constructor(devPath, baud) {
            super()
            this.devPath = devPath
            this.baud = baud
            this.port = null
            this.info = { path: devPath, baudRate: baud }
        }

        async requestAccess() {}

        async connect() {
            this.port = new SerialPort({ path: this.devPath, baudRate: this.baud, autoOpen: false })

            await new Promise((resolve, reject) => {
                this.port.open((err) => err ? reject(err) : resolve())
            })

            // Serial delivers arbitrary byte boundaries, so multi-byte UTF-8 sequences
            // can straddle two chunks - decode in streaming mode like TextDecoderStream.
            const decoder = new TextDecoder('utf-8')
            this.port.on('data', (chunk) => {
                this.receiveCallback(decoder.decode(chunk, { stream: true }))
                this.activityCallback()
            })
            this.port.on('close', () => { this.disconnectCallback() })
            this.port.on('error', (err) => { console.error('[serial]', err.message) })
        }

        async disconnect() {
            if (this.port && this.port.isOpen) {
                await new Promise((resolve) => this.port.close(() => resolve()))
            }
            this.port = null
        }

        async writeBytes(data) {
            await new Promise((resolve, reject) => {
                this.port.write(data, (err) => err ? reject(err) : resolve())
            })
            await new Promise((resolve) => this.port.drain(() => resolve()))
        }
    }

    return new NodeSerial(devicePath, baudRate)
}

export async function listSerialPorts() {
    const SerialPort = await loadSerialPort()
    return await SerialPort.list()
}
