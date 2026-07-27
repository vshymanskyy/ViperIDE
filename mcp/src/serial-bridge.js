let SerialPort = null

async function getSerialPort() {
    if (!SerialPort) {
        const mod = await import('serialport')
        SerialPort = mod.SerialPort
    }
    return SerialPort
}

export class SerialBridge {

    async handleConnection(ws, req) {
        const SP = await getSerialPort()
        const url = new URL(req.url, 'http://localhost')
        const encoded = url.pathname.slice('/serial/'.length)
        const devicePath = decodeURIComponent(encoded)

        console.error(`[ViperIDE MCP] Serial bridge opening: ${devicePath}`)

        let port
        try {
            port = new SP({
                path: devicePath,
                baudRate: 115200,
                autoOpen: false,
            })
        } catch (err) {
            console.error(`[ViperIDE MCP] Serial port create error: ${err.message}`)
            ws.close(1011, err.message.slice(0, 123))
            return
        }

        let handshakeDone = false
        let closed = false
        const preHandshakeBuffer = []

        const cleanup = (reason) => {
            if (closed) return
            closed = true
            console.error(`[ViperIDE MCP] Serial bridge closed: ${devicePath} (${reason})`)
            if (port.isOpen) {
                port.close(() => {})
            }
            if (ws.readyState <= 1) {
                ws.close(1000, reason.slice(0, 123))
            }
        }

        port.on('error', (err) => {
            cleanup(`serial error: ${err.message}`)
        })

        port.on('close', () => {
            cleanup('serial port closed')
        })

        ws.on('close', () => {
            cleanup('websocket closed')
        })

        ws.on('error', (err) => {
            cleanup(`websocket error: ${err.message}`)
        })

        port.open((err) => {
            if (err) {
                console.error(`[ViperIDE MCP] Serial port open error: ${err.message}`)
                ws.close(1011, err.message.slice(0, 123))
                return
            }

            // Buffer serial data immediately so nothing is lost before handshake
            port.on('data', (chunk) => {
                if (closed) return
                if (!handshakeDone) {
                    preHandshakeBuffer.push(chunk)
                } else if (ws.readyState === 1) {
                    ws.send(chunk)
                }
            })

            ws.send('Password: ')

            ws.on('message', (data) => {
                if (closed) return

                if (!handshakeDone) {
                    handshakeDone = true
                    ws.send('\r\nWebREPL connected\r\n')

                    // Flush any data received before handshake completed
                    for (const chunk of preHandshakeBuffer) {
                        if (ws.readyState === 1) ws.send(chunk)
                    }
                    preHandshakeBuffer.length = 0
                    return
                }

                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
                port.write(buf, (err) => {
                    if (err) cleanup(`serial write error: ${err.message}`)
                })
            })
        })
    }

    async listPorts() {
        const SP = await getSerialPort()
        const ports = await SP.list()
        const allPorts = ports.map((p) => ({
            path: p.path,
            manufacturer: p.manufacturer || null,
            serialNumber: p.serialNumber || null,
            productId: p.productId || null,
            vendorId: p.vendorId || null,
            pnpId: p.pnpId || null,
        }))

        // Known USB VID/PID combinations for MicroPython-capable boards
        const knownVids = {
            'f055': 'MicroPython',           // MicroPython USB VID
            '2e8a': 'Raspberry Pi',          // Raspberry Pi (Pico, Pico W, Pico 2)
            '239a': 'Adafruit',              // Adafruit CircuitPython boards
            '303a': 'Espressif',             // ESP32-S2/S3 native USB
            '1a86': 'WCH',                   // CH340/CH9102 (common on ESP32 boards)
            '10c4': 'Silicon Labs',           // CP210x (common on ESP32 boards)
            '0403': 'FTDI',                  // FTDI (common USB-serial adapter)
        }

        const likelyPorts = []
        for (const p of allPorts) {
            const mfr = (p.manufacturer || '').toLowerCase()
            const vid = (p.vendorId || '').toLowerCase()
            if (mfr.includes('micropython') || mfr.includes('micro python')
                || mfr.includes('circuitpython')
                || vid in knownVids) {
                likelyPorts.push({ ...p, knownAs: knownVids[vid] || null })
            }
        }

        return { likelyPorts, allPorts }
    }
}
