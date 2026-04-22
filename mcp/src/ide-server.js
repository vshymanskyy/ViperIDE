import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer } from 'ws'

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
}

export class IDEServer {
    constructor(buildDir) {
        this.buildDir = path.resolve(buildDir)
        this.port = null
        this.onMessage = null
        this.onConnect = null
        this.onDisconnect = null
        this.serialBridge = null

        this.httpServer = http.createServer((req, res) => {
            this._handleRequest(req, res)
        })

        this.wss = new WebSocketServer({ noServer: true })
        this.wss.on('connection', (ws) => {
            if (this.onConnect) this.onConnect(ws)

            ws.on('message', (data) => {
                if (this.onMessage) this.onMessage(ws, data.toString())
            })

            ws.on('close', () => {
                if (this.onDisconnect) this.onDisconnect(ws)
            })
        })

        this.httpServer.on('upgrade', (req, socket, head) => {
            const pathname = new URL(req.url, 'http://localhost').pathname

            if (pathname === '/ws') {
                this.wss.handleUpgrade(req, socket, head, (ws) => {
                    this.wss.emit('connection', ws, req)
                })
            } else if (pathname.startsWith('/serial/') && this.serialBridge) {
                this.wss.handleUpgrade(req, socket, head, (ws) => {
                    this.serialBridge.handleConnection(ws, req)
                })
            } else {
                socket.destroy()
            }
        })
    }

    async start(port = 0) {
        return new Promise((resolve, reject) => {
            this.httpServer.once('error', reject)
            this.httpServer.listen(port, '127.0.0.1', () => {
                const addr = this.httpServer.address()
                this.port = addr.port
                resolve(addr.port)
            })
        })
    }

    async stop() {
        return new Promise((resolve) => {
            this.wss.close()
            this.httpServer.close(resolve)
        })
    }

    send(ws, msg) {
        if (ws.readyState === 1) {
            ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
            return true
        }
        return false
    }

    async _handleRequest(req, res) {
        let urlPath = new URL(req.url, 'http://localhost').pathname
        if (urlPath === '/') urlPath = '/index.html'

        const filePath = path.join(this.buildDir, urlPath)

        if (!filePath.startsWith(this.buildDir + path.sep) && filePath !== this.buildDir) {
            res.writeHead(403)
            res.end('Forbidden')
            return
        }

        try {
            const content = await fs.promises.readFile(filePath)
            const ext = path.extname(filePath)
            const mime = MIME_TYPES[ext] || 'application/octet-stream'
            res.writeHead(200, {
                'Content-Type': mime,
                'Content-Length': content.length,
                'Cache-Control': 'no-cache',
            })
            res.end(content)
        } catch {
            res.writeHead(404)
            res.end('Not found')
        }
    }
}
