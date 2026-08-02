/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 */

import { Peer } from 'peerjs'
import { sleep } from '../utils.js'
import { Transport } from './base.js'

export class WebRTCTransport extends Transport {
    constructor(peerId = null, myId = null) {
        super();

        this.peerId = peerId
        this.myId = myId
        /* The peer outlives the data connection, and the peer id is all that dialling
           it again takes */
        this.canReopen = true
    }

    onConnect(callback) {
        this.connectCallback = callback
    }

    async requestAccess() {
        let iceServers = [
            {
                urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                    'stun:stun3.l.google.com:19302',
                    'stun:stun4.l.google.com:19302',
                    'stun:stun.cloudflare.com:3478',
                    'stun:stun.nextcloud.com:3478',
                ]
            }
        ]

        const controller = new AbortController()
        const timeout = setTimeout(() => {
            controller.abort()
        }, 3000);

        try {
            const ice = await (await fetch('https://hub.viper-ide.org/ice.json', {
                cache: "no-store",
                signal: controller.signal,
            })).json()
            iceServers.push(...ice)
        } finally {
            clearTimeout(timeout)
        }

        iceServers.push(...[
            {
                urls: [
                    'turn:eu-0.turn.peerjs.com:3478',
                    'turn:us-0.turn.peerjs.com:3478',
                ],
                username: "peerjs",
                credential: "peerjsp"
            }, {
                url: 'turn:hub.viper-ide.org:3478?transport=udp',
                username: 'viper-ide',
                credential: 'K70h5k>6ni/a',
            }
        ]);

        this.peer = new Peer(this.myId, {
            secure: true,
            config: { iceServers }
        })
        this.connection = null
        this.connectCallback = () => {}
        this.peer.on('connection', (conn) => {
            this.peerId = conn.peer
            this._setup_conn(conn)
            this.connectCallback()
        })

        // Generate a unique ID if not provided
        if (!this.peer.id) {
            await new Promise((resolve) => this.peer.on('open', resolve))
        }
        this.info = { id: this.peer.id }
        console.log('My P2P ID:', this.peer.id)
    }

    _setup_conn(conn) {
        conn.on('data', (data) => {
            const decoder = new TextDecoder()
            this.receiveCallback(decoder.decode(data))
            this.activityCallback()
        })
        conn.on('close', () => {
            this.disconnectCallback()
        })
        this.connection = conn
    }

    connect() {
        return new Promise((resolve, reject) => {
            /* Taken off again once this attempt is over: a retry would otherwise leave
               a listener behind on the peer for every connection ever tried. */
            const onPeerError = (err) => { this.peer.off('error', onPeerError); reject(err) }
            this.peer.on('error', onPeerError)

            const conn = this.peer.connect(this.peerId, {
                serialization: 'binary',
                reliable: true,
            })

            conn.on('error', reject)
            conn.on('open', () => {
                this.peer.off('error', onPeerError)
                this._setup_conn(conn)
                resolve()
            })
        });
    }

    /* The peer is still up; only the data connection died */
    async reopen() {
        this.connection = null
        await this.connect()
    }

    async disconnect() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
    }

    async write(data) {
        const encoder = new TextEncoder()
        const value = encoder.encode(data)

        if (this.connection && this.connection.open) {
            this.connection.send(value)
            await sleep(50)  // TODO find a better way
        }
    }
}
