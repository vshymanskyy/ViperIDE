/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

class Transport {
    constructor() {
        if (this.constructor === Transport) {
            throw new Error("Cannot instantiate abstract class Transport")
        }
        this.mutex = new Mutex()
        this.inTransaction = false
        this.receivedData = ''
        this.receiveCallback = null
        this.disconnectCallback = null
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
                await sleep(5)
                offset += this.writeChunk
            }
        } catch (err) {
            report("Write error", err)
        }
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
        const prevRecvCbk = this.receiveCallback
        this.inTransaction = true
        this.receivedData = ''
        this.receiveCallback = (data) => {
            this.receivedData += data
            if (this.emit && prevRecvCbk) { prevRecvCbk(data) }
        }

        document.documentElement.style.setProperty('--connected-color', 'var(--connected-active)');

        return () => {
            this.receiveCallback = prevRecvCbk
            if (prevRecvCbk) { prevRecvCbk(this.receivedData) }
            this.receivedData = null
            this.inTransaction = false

            document.documentElement.style.setProperty('--connected-color', 'var(--connected-passive)');

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
        let endTime = +Date.now() + timeout
        while (timeout <= 0 || (+Date.now() < endTime)) {
            if (this.receivedData.length >= n) {
                const res = this.receivedData.substring(0, n)
                this.receivedData = this.receivedData.substring(n)
                return res
            }
            const prev_avail = this.receivedData.length
            await sleep(10)
            if (this.receivedData.length > prev_avail) {
                endTime = +Date.now() + timeout
            }
        }
        throw new Error('Timeout')
    }

    async readUntil(ending, timeout=5000) {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        let endTime = +Date.now() + timeout
        while (timeout <= 0 || (+Date.now() < endTime)) {
            const idx = this.receivedData.indexOf(ending) + ending.length
            if (idx >= ending.length) {
                const res = this.receivedData.substring(0, idx)
                this.receivedData = this.receivedData.substring(idx)
                return res
            }
            const prev_avail = this.receivedData.length
            await sleep(10)
            if (this.receivedData.length > prev_avail) {
                endTime = +Date.now() + timeout
            }
        }
        throw new Error('Timeout reached before finding the ending sequence')
    }
}

/*
 * USB / Serial
 */

class WebSerial extends Transport {
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
        } catch(err) {}
    }

    async connect() {
        await this.port.open({ baudRate: 115200 })

        this.reader = this.port.readable.getReader()
        this.writer = this.port.writable.getWriter()

        this.listen()
    }

    async disconnect() {
        await this.reader.cancel()
        await this.port.forget()
    }

    async writeBytes(data) {
        await this.writer.write(data)
    }

    async listen() {
        const decoder = new TextDecoder()
        try {
            while (true) {
                const { value, done } = await this.reader.read()
                if (done) break
                if (this.receiveCallback) {
                    this.receiveCallback(decoder.decode(value))
                }
            }
        } catch (error) {
            if (this.disconnectCallback) {
                this.disconnectCallback()
            }
        }
    }
}

/*
 * Bluetooth
 */

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_TX_LIMIT = 241

const ADA_NUS_SERVICE = 'adaf0001-4369-7263-7569-74507974686e'
const ADA_NUS_TX = 'adaf0002-4369-7263-7569-74507974686e'
const ADA_NUS_RX = 'adaf0003-4369-7263-7569-74507974686e'
const ADA_VER = 'adaf0100-4669-6c65-5472-616e73666572'
const ADA_FT = 'adaf0200-4669-6c65-5472-616e73666572'
const ADA_NUS_TX_LIMIT = 20

class WebBluetooth extends Transport {
    constructor() {
        super()
        this.device = null
        this.server = null
        this.service = null
        this.rx = null
        this.tx = null
        this.tx_limit = 20
        if (typeof navigator.bluetooth === 'undefined') {
            throw new Error('WebBluetooth not available')
        }
    }

    async requestAccess() {
        this.device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [NUS_SERVICE] },
                { namePrefix: 'mpy-' },
                { services: [ 0xfebb ] },
                { namePrefix: 'CIRCUITPY' },
            ],
            //acceptAllDevices: true,
            optionalServices: [NUS_SERVICE, ADA_NUS_SERVICE, 0xfebb],
        })

        this.device.addEventListener("gattserverdisconnected", () => {
            if (this.disconnectCallback) {
                this.disconnectCallback()
            }
        })
        try {
            this.info = {
                name: this.device.name,
            }
        } catch(err) {}
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
                this.tx_limit = NUS_TX_LIMIT
            } else if (service.uuid === ADA_NUS_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(ADA_NUS_RX)
                this.tx = await service.getCharacteristic(ADA_NUS_TX)
                this.tx_limit = ADA_NUS_TX_LIMIT

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
            }

            if (this.service) {
                await this.rx.startNotifications()
                this.rx.addEventListener('characteristicvaluechanged', this.handleNotifications.bind(this))
                return
            }
        }

        throw new Error('No compatible NUS service found')
    }

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
    }

    async writeBytes(data) {
        //await this.tx.writeValueWithoutResponse(data)
        await this.tx.writeValue(data)
    }

    handleNotifications(event) {
        const decoder = new TextDecoder()
        const value = event.target.value
        if (this.receiveCallback) {
            this.receiveCallback(decoder.decode(value))
        }
    }
}

/*
 * WebSocket
 */

class WebSocketREPL extends Transport {
    constructor(url, pass) {
        super()
        if (!url) {
            throw new Error("WebSocket URL is required")
        }
        this.url = url
        this.pass = pass
        this.socket = null
        this.info = {
            url: this.url
        }
    }

    async requestAccess() {
    }

    async connect() {
        function _conn(url) {
            return new Promise(function(resolve, reject) {
                const ws = new WebSocket(url)
                ws.onopen = function() { resolve(ws) }
                ws.onerror = function(err) { reject(err) }
            })
        }
        this.socket = await _conn(this.url)
        this.socket.binaryType = 'arraybuffer'
        this.socket.onmessage = (event) => {
            if (this.receiveCallback) {
                this.receiveCallback(event.data)
            }
        }

        this.socket.onclose = () => {
            if (this.disconnectCallback) {
                this.disconnectCallback()
            }
        }

        const release = await this.startTransaction()
        try {
            await this.readUntil('Password:')
            await this.write(this.pass + '\n')
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

    async disconnect() {
        if (this.socket) {
            this.socket.close()
        }
    }

    async write(value) {
        if (!this.socket) { return; }
        try {
            let offset = 0
            while (offset < value.length) {
                const chunk = value.slice(offset, offset + this.writeChunk)
                this.socket.send(chunk)
                offset += this.writeChunk
                if (offset < value.length) {
                    await sleep(150)
                }
            }
        } catch (err) {
            report("Write error", err)
        }
    }
}

/*
 * P2P / WebRTC
 */

class WebRTCTransport extends Transport {
    constructor(peerId = null) {
        super();
        this.peer = new Peer()
        this.targetPeerId = peerId
        this.connection = null
    }

    async requestAccess() {
        // Generate a unique ID if not provided
        if (!this.peer.id) {
            await new Promise((resolve) => this.peer.on('open', resolve));
        }
        this.info = { id: this.peer.id };
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.connection = this.peer.connect(this.targetPeerId);

            this.connection.on('open', () => {
                this.connection.on('data', (data) => {
                    if (this.receiveCallback) {
                        this.receiveCallback(data)
                    }
                })
                resolve()
            })

            this.connection.on('error', (err) => {
                console.error('WebRTC connection error:', err);
                reject(err)
            })

            this.connection.on('close', () => {
                if (this.disconnectCallback) {
                    this.disconnectCallback()
                }
            })
        });
    }

    async disconnect() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
    }

    async writeBytes(data) {
        if (this.connection && this.connection.open) {
            this.connection.send(data);
        } else {
            throw new Error('Connection is not open.');
        }
    }
}

