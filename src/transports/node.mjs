/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The transports that work under Node. The base class and the WebREPL transport are the
 * very same ones the browser uses - only the ways of reaching a device that a page has no
 * access to (a serial port, an in-process wasm VM) are separate.
 */

export { Transport } from './base.js'
export { WebSocketREPL } from './websocket.js'
export { makeSerialTransport, listSerialPorts } from './node_serial.mjs'
export { MicroPythonWASM } from './vm.js'
