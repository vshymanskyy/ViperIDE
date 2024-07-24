/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import 'toastr/build/toastr.css'
import './app_common.css'

import toastr from 'toastr'
export { toastr }

export { serial as webSerialPolyfill } from 'web-serial-polyfill'
export { WebSerial, WebBluetooth, WebSocketREPL, WebRTCTransport } from './transports.js'
export { MpRawMode } from './rawmode.js'
export { MicroPythonWASM } from './emulator.js'
export { ConnectionUID } from './connection_uid.js'
export { splitPath, sleep, getUserUID,
         getCssPropertyValue, QSA, QS, QID, iOS, sanitizeHTML,
         sizeFmt, indicateActivity, setupTabs, report } from './utils.js'

import { library, dom } from '@fortawesome/fontawesome-svg-core'
import { faLink } from '@fortawesome/free-solid-svg-icons'
import { faUsb, faBluetoothB } from '@fortawesome/free-brands-svg-icons'

library.add(faLink, faUsb, faBluetoothB)
dom.watch()

