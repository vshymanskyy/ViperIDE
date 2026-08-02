/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

/* npm install ws */

const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    let id, isMainClient;

    if (path.startsWith('/new/')) {
        id = path.slice(5); // Extract the ID from /new/ID
        isMainClient = true;

        console.log('New DEV:', id)
    } else {
        id = path.slice(1); // Extract the ID from /ID
        isMainClient = false;

        console.log('New IDE:', id)
    }

    if (!rooms.has(id)) {
        rooms.set(id, { main: null, others: new Set() });
    }

    const room = rooms.get(id);

    if (isMainClient) {
        // Register the main client
        if (room.main) {
            ws.close(1000, "ID is already registered");
            return;
        }
        room.main = ws;

        ws.on('message', (message, isBinary) => {
            //console.log("DEV:", message, isBinary)
            // Relay the message to all other rooms
            for (const c of room.others) {
                if (c.readyState === WebSocket.OPEN) {
                    c.send(message, { binary: isBinary });
                }
            }
        });

        ws.on('close', () => {
            room.main = null

            // TODO: Disconnect after 30 seconds?
            /*for (const c of room.others) {
                c.close();
            }
            rooms.delete(id);*/
        });

        ws.on('error', () => {
            ws.close();
        });
    } else {
        // Register other rooms
        if (!room.main) {
            ws.close(1000, "Unknown ID");
            return;
        }
        room.others.add(ws);

        ws.on('message', (message, isBinary) => {
            //console.log("IDE:", message)
            // Relay the message to the main client
            if (room.main && room.main.readyState === WebSocket.OPEN) {
                room.main.send(message, { binary: isBinary });
            }
        });

        ws.on('close', () => {
            room.others.delete(ws);
        });

        ws.on('error', () => {
            ws.close();
        });
    }
});

server.listen(8080, () => {
    console.log('WebSocket relay server is listening on port 8080');
});
