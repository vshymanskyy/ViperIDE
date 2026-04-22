/**
 * Bridge between MCP tool calls and the browser-side control client.
 * Sends JSON-RPC requests over WebSocket and correlates responses by ID.
 */
export class Bridge {
    constructor(ideServer) {
        this.ideServer = ideServer
        this.pending = new Map()
        this.nextId = 1
        this.activeWs = null
        this.connectWaiters = []

        ideServer.onConnect = (ws) => {
            if (this.activeWs) {
                console.error('[ViperIDE MCP] New browser tab connected, replacing previous')
                for (const [id, { reject, timeout }] of this.pending) {
                    clearTimeout(timeout)
                    reject(new Error('Another browser tab connected'))
                }
                this.pending.clear()
            }
            this.activeWs = ws
            for (const resolve of this.connectWaiters) resolve()
            this.connectWaiters = []
            console.error('[ViperIDE MCP] Browser connected')
        }

        ideServer.onDisconnect = (ws) => {
            if (this.activeWs === ws) {
                this.activeWs = null
                for (const [id, { reject, timeout }] of this.pending) {
                    clearTimeout(timeout)
                    reject(new Error('Browser disconnected'))
                }
                this.pending.clear()
                console.error('[ViperIDE MCP] Browser disconnected')
            }
        }

        ideServer.onMessage = (_ws, data) => {
            let msg
            try {
                msg = JSON.parse(data)
            } catch {
                return
            }

            if (msg.jsonrpc === '2.0' && msg.id != null) {
                const pending = this.pending.get(msg.id)
                if (pending) {
                    clearTimeout(pending.timeout)
                    this.pending.delete(msg.id)
                    if (msg.error) {
                        pending.reject(new Error(msg.error.message || 'Unknown error'))
                    } else {
                        pending.resolve(msg.result)
                    }
                }
            }

            if (msg.type === 'event') {
                console.error(`[ViperIDE MCP] Event: ${msg.event}`, msg.data || '')
            }
        }
    }

    get isConnected() {
        return this.activeWs !== null
    }

    async waitForConnection(timeoutMs = 15000) {
        if (this.activeWs) return
        return new Promise((resolve, reject) => {
            const waiter = () => {
                clearTimeout(timer)
                resolve()
            }
            const timer = setTimeout(() => {
                this.connectWaiters = this.connectWaiters.filter(w => w !== waiter)
                reject(new Error('Timed out waiting for ViperIDE browser to connect'))
            }, timeoutMs)
            this.connectWaiters.push(waiter)
        })
    }

    async call(method, params = {}, timeoutMs = 30000) {
        if (!this.activeWs) {
            await this.waitForConnection()
        }

        const id = this.nextId++
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error(`Timeout waiting for ${method} (${timeoutMs}ms)`))
            }, timeoutMs)

            this.pending.set(id, { resolve, reject, timeout })
            const sent = this.ideServer.send(this.activeWs, {
                jsonrpc: '2.0',
                id,
                method,
                params,
            })
            if (!sent) {
                clearTimeout(timeout)
                this.pending.delete(id)
                reject(new Error('Browser connection lost'))
            }
        })
    }
}
