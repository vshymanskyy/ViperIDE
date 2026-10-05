/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * flasher.html's pure logic: firmware URL construction, board matching, and the
 * INFO_UF2.TXT parser. Nothing here touches a board or the DOM.
 *
 * The board list itself (loadBoards) is a vendored copy of boards/index.json, not a
 * live fetch, so it needs no stubbing here - only the one test below that checks a
 * hard-coded RELEASES entry against the real server reaches the network, and skips
 * itself the same way test/suites/packages.js does when micropython.org cannot be
 * reached.
 */

import { readFileSync } from 'fs'
import { assert } from 'chai'
import { skipSuite } from '../setup.js'
import {
    RELEASES, FAMILIES, loadBoards, firmwareFileName, firmwareUrl, firmwareFetchUrl, extFor,
    nrf52Ext, flashOffsetFor, matchBuildId, mcuForChipName, preferredBoard,
    stm32Route, STM32_UNSUPPORTED, stlinkBoardId, STLINK_BOARD_CODES,
    ARDUINO_BOOTLOADERS, arduinoBootloader, releasesFor, findBuild,
} from '../../src/flasher/firmware.js'
import boardsOverlay from '../../src/flasher/boards_overlay.js'
import {
    crc16, w600Command, xmodemPacket, isW600Fls, openW600, closeW600, enterW600Bootloader, w600Mac, flashW600,
} from '../../src/flasher/w600.js'
import { parseIntelHex, hexToBin, stlinkBin } from '../../src/flasher/hex.js'
import {
    parseDfuFile, dfuCrc, connectDfu, flashDfu, flashDfuBin, dfuMemoryName, DFU_FILTERS,
} from '../../src/flasher/dfu.js'
import { parseInfoUf2, parseDaplinkDetails, parseJlinkReadme, parseStlinkDrive } from '../../src/flasher/drive.js'
import {
    boardIdForProduct, teensyPages, teensyPageReport, teensyRebootReport, TEENSY_FILTERS,
} from '../../src/flasher/teensy.js'
import boardsIndex from '../../src/flasher/boards_index.js'

const ALL_STM32_IDS = boardsIndex.filter(b => b.port === 'stm32').map(b => b.id)

// One Intel HEX record: ":" count, 16-bit offset, type, data, checksum.
function hexLine(type, offset, data) {
    const rec = [data.length, offset >> 8, offset & 0xff, type, ...data]
    rec.push(-rec.reduce((sum, b) => sum + b, 0) & 0xff)
    return ':' + rec.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('')
}

/*
 * Builds a DfuSe file with one target holding `elements` ([{ address, data }]), the way
 * MicroPython's dfu.py does. `elementSizeDelta` overstates the last element's size, for
 * the parser's bounds check; the CRC is still correct, so that check is what is reached.
 */
function makeDfu(elements, { elementSizeDelta = 0 } = {}) {
    const body = elements.reduce((sum, el) => sum + 8 + el.data.length, 0)
    const file = new Uint8Array(11 + 274 + body + 16)
    const view = new DataView(file.buffer)
    const put = (pos, text) => { for (let i = 0; i < text.length; i++) { file[pos + i] = text.charCodeAt(i) } }

    put(0, 'DfuSe')
    file[5] = 1
    view.setUint32(6, file.length - 16, true)
    file[10] = 1
    put(11, 'Target')
    view.setUint32(11 + 266, body, true)
    view.setUint32(11 + 270, elements.length, true)
    let pos = 11 + 274
    elements.forEach((el, i) => {
        const last = i === elements.length - 1
        view.setUint32(pos, el.address, true)
        view.setUint32(pos + 4, el.data.length + (last ? elementSizeDelta : 0), true)
        file.set(el.data, pos + 8)
        pos += 8 + el.data.length
    })
    view.setUint16(pos + 2, 0xdf11, true)
    view.setUint16(pos + 4, 0x0483, true)
    view.setUint16(pos + 6, 0x011a, true)
    put(pos + 8, 'UFD')
    file[pos + 11] = 16
    view.setUint32(pos + 12, dfuCrc(file.subarray(0, file.length - 4)), true)
    return file
}

/*
 * A WebUSB device that behaves like the STM32F405's ROM bootloader as far as flashDfu()
 * can tell: one DFU interface whose name is the flash layout, the DfuSe commands (set
 * address, erase sector), block downloads, and a status that turns into a disconnect
 * once it has been told to leave. It records what it was asked to do.
 */
function fakeBootloader({ interfaceName = '@Internal Flash  /0x08000000/04*016Kg,01*064Kg,07*128Kg', failWriteAt = null } = {}) {
    const MEMORY_MAP = '@Internal Flash  /0x08000000/04*016Kg,01*064Kg,07*128Kg'
    const IDLE = 2, DNLOAD_IDLE = 5, ERROR = 10
    const CONFIG = [
        9, 2, 27, 0, 1, 1, 0, 0x80, 50,            // configuration, 27 bytes in all
        9, 4, 0, 0, 0, 0xfe, 0x01, 0x02, 4,        // DFU interface, name in string 4
        9, 0x21, 0x0b, 0xff, 0x00, 0x00, 0x08, 0x1a, 0x01,   // DFU functional: 2048-byte transfers
    ]
    const iface = {
        interfaceNumber: 0,
        claimed: false,
        alternate: null,
        alternates: [{
            alternateSetting: 0, interfaceClass: 0xfe, interfaceSubclass: 0x01, interfaceProtocol: 0x02, interfaceName,
        }],
    }
    const configuration = { configurationValue: 1, interfaces: [iface] }
    let state = IDLE
    let pointer = 0
    let gone = false
    const reply = (bytes) => ({ status: 'ok', data: new DataView(new Uint8Array(bytes).buffer) })

    const usb = {
        productName: 'STM32  BOOTLOADER',
        opened: false,
        configuration: null,
        configurations: [configuration],
        erased: [],
        written: [],
        left: [],
        async open() { usb.opened = true },
        async close() { usb.opened = false },
        async selectConfiguration() { usb.configuration = configuration },
        async claimInterface() { iface.claimed = true },
        async selectAlternateInterface() { iface.alternate = iface.alternates[0] },
        async controlTransferOut(setup, data) {
            const bytes = !data ? new Uint8Array(0)
                : data instanceof ArrayBuffer ? new Uint8Array(data)
                : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            if (setup.request === 1 && setup.value === 0 && bytes.length === 0) {
                usb.left.push(pointer)
                gone = true
            } else if (setup.request === 1 && setup.value === 0) {
                const address = new DataView(bytes.buffer, bytes.byteOffset).getUint32(1, true)
                if (bytes[0] === 0x21) { pointer = address }
                if (bytes[0] === 0x41) { usb.erased.push(address) }
                state = DNLOAD_IDLE
            } else if (setup.request === 1) {
                if (pointer === failWriteAt) {
                    state = ERROR
                } else {
                    usb.written.push({ address: pointer, length: bytes.length, first: bytes[0] })
                    state = DNLOAD_IDLE
                }
            } else {
                state = IDLE   // CLRSTATUS, ABORT
            }
            return { status: 'ok', bytesWritten: bytes.length }
        },
        async controlTransferIn(setup, length) {
            if (setup.requestType === 'standard' && (setup.value >> 8) === 2) {
                return reply(CONFIG.slice(0, length))
            }
            if (setup.requestType === 'standard' && (setup.value >> 8) === 3) {
                const text = [...MEMORY_MAP].flatMap(c => [c.charCodeAt(0), 0])
                return reply([text.length + 2, 3, ...text].slice(0, length))
            }
            if (gone) { throw new Error('The device was disconnected.') }
            if (setup.request === 3) {
                return reply([state === ERROR ? 3 : 0, 0, 0, 0, state, 0])
            }
            return reply([state])
        },
    }
    return usb
}

/*
 * A WebUSB device that behaves like the Portenta C33's bootloader (TinyUSB's DFU class,
 * as set up in arduino-renesas-bootloader): plain DFU 1.1 with 64-byte transfers, where
 * a block's number times 64 is its place in the image. Each download is busy for one
 * status read; a zero-length download manifests; a detach request resets the board.
 */
function fakeArduinoBootloader({ transferSize = 64, failAtBlock = null } = {}) {
    const IDLE = 2, DNBUSY = 4, DNLOAD_IDLE = 5, MANIFEST = 7, ERROR = 10
    const functional = transferSize === null ? [] : [9, 0x21, 0x07, 0xe8, 0x03, transferSize & 0xff, transferSize >> 8, 0x01, 0x01]
    const CONFIG = [
        9, 2, 18 + functional.length, 0, 1, 1, 0, 0x80, 50,
        9, 4, 0, 0, 0, 0xfe, 0x01, 0x02, 4,
        ...functional,
    ]
    const iface = {
        interfaceNumber: 0,
        claimed: false,
        alternate: null,
        alternates: ['@CodeFlash /0x00000000/8*8Ka,30*32Kg', '@SketchFlash /0x100000/32*32Kg', '@DataFlash /0x08000000/8*1Kg']
            .map((interfaceName, alternateSetting) => ({
                alternateSetting, interfaceClass: 0xfe, interfaceSubclass: 0x01, interfaceProtocol: 0x02, interfaceName,
            })),
    }
    const configuration = { configurationValue: 1, interfaces: [iface] }
    let pending = []      // states the next status reads will report, in order
    let state = IDLE
    let gone = false
    const reply = (bytes) => ({ status: 'ok', data: new DataView(new Uint8Array(bytes).buffer) })

    const usb = {
        productName: 'Portenta C33 DFU',
        opened: false,
        configuration: null,
        configurations: [configuration],
        blocks: [],
        image: [],
        manifested: 0,
        detached: 0,
        async open() { usb.opened = true },
        async close() { usb.opened = false },
        async selectConfiguration() { usb.configuration = configuration },
        async claimInterface() { iface.claimed = true },
        async selectAlternateInterface(_n, alt) { iface.alternate = iface.alternates[alt] },
        async controlTransferOut(setup, data) {
            const bytes = !data ? new Uint8Array(0)
                : data instanceof ArrayBuffer ? new Uint8Array(data)
                : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            if (setup.request === 0) {
                usb.detached++
                gone = true
            } else if (setup.request === 1 && bytes.length === 0) {
                usb.manifested++
                pending = [MANIFEST, IDLE]
            } else if (setup.request === 1) {
                if (setup.value === failAtBlock) {
                    pending = [ERROR]
                } else {
                    usb.blocks.push([setup.value, bytes.length])
                    bytes.forEach((b, i) => { usb.image[setup.value * transferSize + i] = b })
                    pending = [DNBUSY, DNLOAD_IDLE]
                }
            } else {
                pending = [IDLE]   // CLRSTATUS, ABORT
            }
            return { status: 'ok', bytesWritten: bytes.length }
        },
        async controlTransferIn(setup, length) {
            if (setup.requestType === 'standard') { return reply(CONFIG.slice(0, length)) }
            if (gone) { throw new Error('The device was disconnected.') }
            if (pending.length) { state = pending.shift() }
            return setup.request === 3 ? reply([state === ERROR ? 3 : 0, 0, 0, 0, state, 0]) : reply([state])
        },
    }
    return usb
}

// A W600 .fls as far as isW600Fls() can tell: the image magic at the start, and again
// where secboot's own header begins.
function makeFls(size) {
    const data = Uint8Array.from({ length: size }, (_, i) => (i * 5 + 1) & 0xff)
    data.set([0x9f, 0xff, 0xff, 0xa0], 0)
    data.set([0x9f, 0xff, 0xff, 0xa0], 56)
    return data
}

/*
 * A WebSerial port with a W600 behind it, as w600tool.py sees one: running its firmware
 * until reset; after a reset, an ESC gets it into download mode, where it keeps sending
 * 'C' and takes command frames and XMODEM-1K blocks. Erasing secboot leaves the ROM
 * bootloader, the only one that answers the flash-id query. `rtsResets: false` is a
 * board without the reset line wired (pushReset() is the user's finger); `nakBlocks`
 * are XMODEM blocks it rejects the first time it sees them.
 */
function fakeW600Port({ rtsResets = true, nakBlocks = [] } = {}) {
    let controller = null
    let mode = 'app'
    let rts = false
    let ticker = null
    let expected = 1
    const rejected = new Set()
    const emit = (out) => controller.enqueue(typeof out === 'string' ? new TextEncoder().encode(out) : new Uint8Array(out))
    const stopTicker = () => { clearInterval(ticker); ticker = null }
    const reset = () => { port.resets++; mode = 'boot'; expected = 1; stopTicker() }

    const handle = (chunk) => {
        if (mode !== 'boot') { return }
        if (chunk[0] === 0x1b) {
            emit('C')
            if (!ticker) { ticker = setInterval(() => emit('C'), 40); ticker.unref() }
        } else if (chunk[0] === 0x21) {
            const payload = chunk.subarray(5)
            const ok = (chunk[1] | (chunk[2] << 8)) === payload.length + 2 && (chunk[3] | (chunk[4] << 8)) === crc16(payload)
            if (!ok) { port.badFrames++; return }
            const code = new DataView(payload.buffer, payload.byteOffset).getUint32(0, true)
            port.commands.push(code)
            if (code === 0x38) { emit('MAC:286DCD0A1B2C\n') }
            if (code === 0x3c && !port.secboot) { emit('FID:1615\n') }
            if (code === 0x3f) { port.secboot = false }
        } else if (chunk[0] === 0x02) {
            stopTicker()
            const seq = chunk[1]
            const data = chunk.subarray(3, 3 + 1024)
            const crc = (chunk[1027] << 8) | chunk[1028]
            const ok = chunk.length === 1029 && chunk[2] === 0xff - seq && crc === crc16(data, 0) && seq === (expected & 0xff)
            if (!ok || (nakBlocks.includes(seq) && !rejected.has(seq))) {
                rejected.add(seq)
                emit([0x15])
                return
            }
            port.commands.push(`block ${seq}`)
            port.received.push(...data)
            expected++
            emit([0x06])
        } else if (chunk[0] === 0x04) {
            emit([0x06])
            emit('\r\nrun user code...\r\n')
            mode = 'done'
        }
    }

    const port = {
        opened: false,
        baudRate: null,
        secboot: true,
        resets: 0,
        badFrames: 0,
        commands: [],
        received: [],
        readable: new ReadableStream({ start(c) { controller = c } }),
        writable: new WritableStream({ write: handle }),
        async open({ baudRate }) { port.opened = true; port.baudRate = baudRate },
        async close() { port.opened = false; stopTicker() },
        async setSignals(signals) {
            if ('dataTerminalReady' in signals) { port.dtr = signals.dataTerminalReady }
            if (!('requestToSend' in signals)) { return }
            if (rts && !signals.requestToSend && rtsResets) { reset() }
            rts = signals.requestToSend
        },
        pushReset: reset,
    }
    return port
}

// webdfu writes to console.error when a transfer is refused, which is exactly what the
// bootloader does on its way out.
async function quietly(fn) {
    const saved = console.error
    console.error = () => {}
    try {
        return await fn()
    } finally {
        console.error = saved
    }
}

describe('Flasher', () => {

    describe('firmware URLs', () => {
        it('builds a plain board URL without a variant', () => {
            assert.strictEqual(
                firmwareFileName('RPI_PICO2', null, '20260824-v1.29.0', 'uf2'),
                'RPI_PICO2-20260824-v1.29.0.uf2')
            assert.strictEqual(
                firmwareUrl('RPI_PICO2', null, '20260824-v1.29.0', 'uf2'),
                'https://micropython.org/resources/firmware/RPI_PICO2-20260824-v1.29.0.uf2')
        })

        it('inserts the variant between the id and the release', () => {
            assert.strictEqual(
                firmwareFileName('ESP32_GENERIC', 'SPIRAM', '20260824-v1.29.0', 'bin'),
                'ESP32_GENERIC-SPIRAM-20260824-v1.29.0.bin')
        })

        it('routes the download through the CORS proxy, but not the plain URL', () => {
            const plain = firmwareUrl('RPI_PICO', null, '20260824-v1.29.0', 'uf2')
            const proxied = firmwareFetchUrl('RPI_PICO', null, '20260824-v1.29.0', 'uf2')
            assert.notInclude(plain, 'cors.lol')
            // Checks the shape (host, url param round-trips, a token is sent), not the
            // literal token value - that one is free to rotate without breaking this test.
            const proxiedUrl = new URL(proxied)
            assert.include(proxiedUrl.origin + proxiedUrl.pathname, 'cors')
        })

        it('lists the hard-coded releases newest first', () => {
            assert.isAbove(RELEASES.length, 0)
            for (const rel of RELEASES) {
                assert.match(rel, /^\d{8}-v\d+\.\d+\.\d+$/, `malformed release entry: ${rel}`)
            }
            const dates = RELEASES.map(r => r.slice(0, 8))
            assert.deepStrictEqual(dates, [...dates].sort().reverse(), 'RELEASES must be newest first')
        })
    })

    /* nukeUf2Url() itself just interpolates VIPER_IDE_BASE_URL - a compile-time constant
     * that only exists once Rollup has substituted it, not under plain Node - so there is
     * nothing to usefully call here. What actually needs guarding is the vendored file it
     * points at: that it was not forgotten, and still looks like a UF2. */
    describe('vendored universal_flash_nuke.uf2', () => {
        it('exists in assets/ and starts with the UF2 magic number', () => {
            const data = readFileSync(new URL('../../assets/universal_flash_nuke.uf2', import.meta.url))
            assert.isAbove(data.length, 0)
            assert.strictEqual(data.readUInt32LE(0), 0x0A324655, 'first UF2 magic number (see the UF2 spec)')
        })
    })

    describe('nrf52Ext / extFor', () => {
        it('uses .uf2 only for the boards known to publish one', () => {
            assert.strictEqual(nrf52Ext('SEEED_XIAO_NRF52'), 'uf2')
            assert.strictEqual(nrf52Ext('PCA10040'), 'hex')
            assert.strictEqual(extFor('nrf52', 'SEEED_XIAO_NRF52'), 'uf2')
            assert.strictEqual(extFor('nrf52', 'PCA10040'), 'hex')
        })

        it('uses the family-wide extension for esp32 and rp2', () => {
            assert.strictEqual(extFor('esp32', 'ESP32_GENERIC'), 'bin')
            assert.strictEqual(extFor('rp2', 'RPI_PICO'), 'uf2')
        })
    })

    describe('flashOffsetFor', () => {
        it('prefers the board-specific deploy_options.flash_offset', () => {
            assert.strictEqual(flashOffsetFor({ mcu: 'esp32', deploy_options: { flash_offset: '0x2000' } }), 0x2000)
            assert.strictEqual(flashOffsetFor({ mcu: 'esp32', deploy_options: { flash_offset: 0 } }), 0)
        })

        it('falls back to the per-mcu default', () => {
            assert.strictEqual(flashOffsetFor({ mcu: 'esp32s3' }), 0x0000)
            assert.strictEqual(flashOffsetFor({ mcu: 'esp32' }), 0x1000)
            assert.strictEqual(flashOffsetFor({ mcu: 'esp8266' }), 0x0000)
        })
    })

    describe('matchBuildId', () => {
        const boards = [
            { id: 'ESP32_GENERIC', variants: { D2WD: 'x', OTA: 'y', SPIRAM: 'z', UNICORE: 'w' } },
            { id: 'ESP32_GENERIC_S3', variants: { SPIRAM_OCT: 'x' } },
            { id: 'RPI_PICO2', variants: { RISCV: 'x' } },
        ]

        it('matches a plain build with no variant', () => {
            assert.deepStrictEqual(matchBuildId('RPI_PICO2', boards), { board: boards[2], variant: null })
        })

        it('matches a build with a variant suffix', () => {
            assert.deepStrictEqual(matchBuildId('ESP32_GENERIC-SPIRAM', boards), { board: boards[0], variant: 'SPIRAM' })
        })

        it('returns null for an unknown build, and for no build at all', () => {
            assert.isNull(matchBuildId('SOMETHING_ELSE', boards))
            assert.isNull(matchBuildId('', boards))
            assert.isNull(matchBuildId(null, boards))
        })
    })

    describe('findBuild', () => {
        it('finds the family and board of a build id, with or without a variant', () => {
            assert.deepInclude(findBuild('RPI_PICO'), { family: 'rp2', variant: null })
            assert.strictEqual(findBuild('RPI_PICO').board.id, 'RPI_PICO')
            const spiram = findBuild('ESP32_GENERIC-SPIRAM')
            assert.deepInclude(spiram, { family: 'esp32', variant: 'SPIRAM' })
            assert.strictEqual(spiram.board.id, 'ESP32_GENERIC')
        })

        it('reaches boards that live in a special family, or only in the overlay', () => {
            assert.strictEqual(findBuild('ARDUINO_GIGA').family, 'arduino')
            assert.strictEqual(findBuild('PYBV11-THREAD').family, 'stm32dfu')
            assert.strictEqual(findBuild('NUCLEO_WB55').family, 'stm32link')
            assert.strictEqual(findBuild('MICROBIT').family, 'nrf52')
            assert.strictEqual(findBuild('W600_WEMOS').family, 'w600')
        })

        it('forgives case, and returns null for nothing or an unknown build', () => {
            assert.strictEqual(findBuild('rpi_pico').board.id, 'RPI_PICO')
            assert.isNull(findBuild('NOT_A_BOARD'))
            assert.isNull(findBuild('LEGO_HUB_NO6'))     // in the index, but no family can flash it
            assert.isNull(findBuild(''))
            assert.isNull(findBuild(null))
        })
    })

    describe('mcuForChipName / preferredBoard', () => {
        it('maps the esptool-js chip names this page cares about', () => {
            assert.strictEqual(mcuForChipName('ESP32-S3'), 'esp32s3')
            assert.strictEqual(mcuForChipName('ESP8266'), 'esp8266')
            assert.isNull(mcuForChipName('ESP32-NOT-A-REAL-CHIP'))
        })

        it('prefers the *_GENERIC board, falling back to the first one', () => {
            const boards = [{ id: 'UM_TINYS3' }, { id: 'ESP32_GENERIC_S3' }, { id: 'LOLIN_S2_MINI' }]
            assert.strictEqual(preferredBoard(boards).id, 'ESP32_GENERIC_S3')
            assert.strictEqual(preferredBoard([boards[0]]).id, 'UM_TINYS3')
            assert.isNull(preferredBoard([]))
        })
    })

    describe('parseInfoUf2', () => {
        it('reads Model and Board-ID out of a real INFO_UF2.TXT', () => {
            const text = 'UF2 Bootloader v3.0\r\nModel: Raspberry Pi RP2350\r\nBoard-ID: RPI-RP2350\r\n'
            assert.deepStrictEqual(parseInfoUf2(text), { model: 'Raspberry Pi RP2350', boardId: 'RPI-RP2350' })
        })

        it('returns nulls for text that is not an INFO_UF2.TXT', () => {
            assert.deepStrictEqual(parseInfoUf2('not a uf2 drive'), { model: null, boardId: null })
        })
    })

    describe('parseJlinkReadme', () => {
        it('recognises a J-Link MSD README, without naming a board', () => {
            assert.deepStrictEqual(
                parseJlinkReadme('SEGGER J-Link MSD volume.\nThis volume is used to update the flash content of your target device.\n'),
                { model: 'SEGGER J-Link', boardId: null })
        })

        it('returns null for a README that is not J-Link', () => {
            assert.isNull(parseJlinkReadme('Hello, this is a readme.'))
        })
    })

    describe('parseDaplinkDetails', () => {
        const MICROBIT_V1 = [
            '# DAPLink Firmware - see https://mbed.com/daplink',
            'Unique ID: 9900000037024e45004d20070000006e0000000097969901',
            'Interface Version: 0249',
            'URL: https://microbit.org/device/?id=9900&v=0249',
        ].join('\n')

        it('reads a micro:bit v1 DETAILS.TXT', () => {
            assert.deepStrictEqual(parseDaplinkDetails(MICROBIT_V1), {
                model: 'micro:bit v1',
                boardId: 'Interface 0249',
            })
        })

        it('reads a micro:bit v2 DETAILS.TXT as v2', () => {
            const MICROBIT_V2 = MICROBIT_V1.replace('id=9900&v=0249', 'id=9904&v=0255')
                .replace('Interface Version: 0249', 'Interface Version: 0255')
            assert.deepStrictEqual(parseDaplinkDetails(MICROBIT_V2), {
                model: 'micro:bit v2',
                boardId: 'Interface 0255',
            })
        })

        it('reports an unknown micro:bit id as plain micro:bit, not as v1', () => {
            assert.strictEqual(parseDaplinkDetails(MICROBIT_V1.replace('id=9900', 'id=9999')).model, 'micro:bit')
        })

        it('falls back to a generic DAPLink name for anything else', () => {
            assert.deepStrictEqual(parseDaplinkDetails('Interface Version: 0255\n'), {
                model: 'DAPLink',
                boardId: 'Interface 0255',
            })
        })
    })

    describe('loadBoards for the Nordic family', () => {
        it('includes the micro:bit v1 alongside the nRF52 boards, but not the other nRF51 kits', () => {
            const ids = loadBoards('nrf52').map(b => b.id)
            assert.include(ids, 'MICROBIT')
            assert.include(ids, 'PCA10040')
            assert.include(ids, 'PCA10090')
            assert.notInclude(ids, 'PCA10000')
            assert.notInclude(ids, 'WT51822_S4AT')
        })
    })

    describe('Teensy HalfKay protocol', () => {
        it('maps the Teensy 4.0 / 4.1 HalfKay product ids to their board ids', () => {
            assert.strictEqual(boardIdForProduct(0x0478), 'TEENSY40')
            assert.strictEqual(boardIdForProduct(0x0479), 'TEENSY41')
            assert.isNull(boardIdForProduct(0x0483))   // Teensy 3.0 serial, not HalfKay here
        })

        it('filters for the HalfKay product ids only', () => {
            assert.deepStrictEqual(TEENSY_FILTERS, [
                { vendorId: 0x16c0, productId: 0x0478 },
                { vendorId: 0x16c0, productId: 0x0479 },
            ])
        })

        it('splits a .bin into 1KB pages at their flash offsets, padding the last one', () => {
            const data = new Uint8Array(1024 + 10).fill(0x42)
            const pages = teensyPages(data)
            assert.strictEqual(pages.length, 2)
            assert.strictEqual(pages[0].address, 0)
            assert.strictEqual(pages[1].address, 1024)
            assert.strictEqual(pages[1].data.length, 1024)
            assert.strictEqual(pages[1].data[9], 0x42)
            assert.strictEqual(pages[1].data[10], 0xff)
        })

        it('skips erased (all 0xFF) pages, but always keeps the first one', () => {
            const data = new Uint8Array(3 * 1024).fill(0xff)
            data[2 * 1024] = 0x01
            const pages = teensyPages(data)
            assert.deepStrictEqual(pages.map(p => p.address), [0, 2048])
        })

        it('builds a 1088-byte report: 24-bit little-endian address, data at byte 64', () => {
            const page = new Uint8Array(1024)
            page[0] = 0xaa
            page[1023] = 0xbb
            const report = teensyPageReport(0x123456, page)
            assert.strictEqual(report.length, 1088)
            assert.deepStrictEqual([...report.slice(0, 4)], [0x56, 0x34, 0x12, 0])
            assert.strictEqual(report[64], 0xaa)
            assert.strictEqual(report[64 + 1023], 0xbb)
        })

        it('builds the reboot report: 0xFF in the first three bytes', () => {
            const report = teensyRebootReport()
            assert.strictEqual(report.length, 1088)
            assert.deepStrictEqual([...report.slice(0, 4)], [0xff, 0xff, 0xff, 0])
        })
    })

    describe('loadBoards for the Teensy family', () => {
        it('lists only the Teensy 4.0 and 4.1, not every i.MX RT board', () => {
            assert.deepStrictEqual(loadBoards('teensy').map(b => b.id), ['TEENSY40', 'TEENSY41'])
        })
    })

    describe('STM32 boards', () => {
        const stm32 = () => loadBoards('stm32dfu').map(b => b.id)

        it('offers the USB boards over DFU, not the ST-Link kits', () => {
            const ids = stm32()
            for (const id of ['PYBV11', 'ADAFRUIT_F405_EXPRESS', 'PYBD_SF2', 'WEACT_F411_BLACKPILL', 'USBDONGLE_WB55']) {
                assert.include(ids, id)
            }
            for (const id of ['NUCLEO_F767ZI', 'STM32F4DISC', 'STM32H7B3I_DK', 'B_L475E_IOT01A', 'STM32H747I_DISCO']) {
                assert.notInclude(ids, id)
                assert.strictEqual(stm32Route(id), 'link')
            }
        })

        it('leaves out the boards with a bootloader of their own', () => {
            const ids = stm32()
            for (const id of STM32_UNSUPPORTED) {
                assert.notInclude(ids, id)
                assert.isNull(stm32Route(id))
            }
        })

        // Guards the split when boards_index.js is refreshed: a new board lands in one of
        // the two routes by its name alone, so the counts are worth a second look then.
        it('puts every board of the port on exactly one route, or on the unsupported list', () => {
            const routes = { dfu: 0, link: 0, arduino: 0, none: 0 }
            for (const id of ALL_STM32_IDS) { routes[stm32Route(id) || 'none']++ }
            assert.deepStrictEqual(routes, { dfu: 28, link: 41, arduino: 4, none: 3 })
            assert.strictEqual(loadBoards('stm32dfu').length, routes.dfu)
            assert.strictEqual(loadBoards('stm32link').length, routes.link)
            assert.strictEqual(loadBoards('arduino').filter(b => b.port === 'stm32').length, routes.arduino)
            for (const id of STM32_UNSUPPORTED) { assert.include(ALL_STM32_IDS, id, `${id} is not in the index`) }
        })

        it('offers the Nucleo and Discovery kits through their ST-Link drive, as a .hex download', () => {
            const ids = loadBoards('stm32link').map(b => b.id)
            assert.include(ids, 'NUCLEO_WB55')
            assert.include(ids, 'STM32F4DISC')
            assert.notInclude(ids, 'PYBV11')
            assert.strictEqual(extFor('stm32link', 'NUCLEO_WB55'), 'hex')
        })

        it('knows which board an ST-Link drive code stands for', () => {
            assert.strictEqual(stlinkBoardId('0839'), 'NUCLEO_WB55')
            assert.strictEqual(stlinkBoardId('0818'), 'NUCLEO_F767ZI')
            assert.isNull(stlinkBoardId('0776'))    // NUCLEO-L4R5ZI: no MicroPython build
            assert.isNull(stlinkBoardId(null))
        })

        it('has exactly one drive code for every ST-Link board, and none for any other', () => {
            const mapped = STLINK_BOARD_CODES.map(stlinkBoardId)
            assert.deepStrictEqual([...mapped].sort(), loadBoards('stm32link').map(b => b.id).sort())
        })
    })

    describe('parseStlinkDrive', () => {
        const DETAILS = 'Version: 0221\r\nBuild:   Sep 18 2018 11:09:21\r\n'
        const MBED_HTM = '<!-- mbed Platform Website and Authentication Shortcut -->\n<html>\n<head>\n' +
            '<meta http-equiv="refresh" content="0; url=http://mbed.org/device/?code=08390221103168772F75F173"/>\n' +
            '<title>mbed Website Shortcut</title>\n</head>\n<body></body>\n</html>\n'

        it('takes the board code from MBED.HTM', () => {
            assert.deepStrictEqual(parseStlinkDrive(DETAILS, MBED_HTM), { model: 'ST-Link', boardId: '0839' })
        })

        it('still recognises the drive without an MBED.HTM', () => {
            assert.deepStrictEqual(parseStlinkDrive(DETAILS, null), { model: 'ST-Link', boardId: null })
        })

        it('leaves a DAPLink DETAILS.TXT to parseDaplinkDetails', () => {
            const daplink = '# DAPLink Firmware - see https://mbed.com/daplink\nInterface Version: 0249\n' +
                'URL: https://microbit.org/device/?id=9900&v=0249\n'
            assert.isNull(parseStlinkDrive(daplink, null))
            assert.strictEqual(parseDaplinkDetails(daplink).model, 'micro:bit v1')
        })
    })

    describe('Intel HEX to .bin', () => {
        // Extended linear address 0x0800, then two 4-byte records one after the other.
        const base = hexLine(0x04, 0x0000, [0x08, 0x00])
        const eof = hexLine(0x01, 0x0000, [])

        it('joins adjacent records into one region at the right address', () => {
            const hex = [base, hexLine(0, 0x0000, [1, 2, 3, 4]), hexLine(0, 0x0004, [5, 6, 7, 8]), eof].join('\r\n')
            const regions = parseIntelHex(new TextEncoder().encode(hex))
            assert.strictEqual(regions.length, 1)
            assert.strictEqual(regions[0].address, 0x08000000)
            assert.deepStrictEqual([...regions[0].data], [1, 2, 3, 4, 5, 6, 7, 8])
        })

        it('fills the gap between regions with 0xFF, and says there was one', () => {
            const hex = [base, hexLine(0, 0x0000, [1, 2]), hexLine(0, 0x0008, [9]), hexLine(0x05, 0, [8, 0, 4, 0xd5]), eof].join('\n')
            const bin = hexToBin(new TextEncoder().encode(hex))
            assert.strictEqual(bin.address, 0x08000000)
            assert.strictEqual(bin.regions, 2)
            assert.deepStrictEqual([...bin.data], [1, 2, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 9])
        })

        it('rejects a damaged, incomplete or non-HEX file', () => {
            const text = (s) => new TextEncoder().encode(s)
            const good = [base, hexLine(0, 0, [1, 2, 3, 4]), eof].join('\n')
            assert.throws(() => parseIntelHex(text(good.replace('01020304', '01020305'))), /Corrupted/)
            assert.throws(() => parseIntelHex(text([base, hexLine(0, 0, [1, 2, 3, 4])].join('\n'))), /Incomplete/)
            assert.throws(() => parseIntelHex(new Uint8Array([0x44, 0x66, 0x75, 0x53, 0x65, 0x01])), /Not an Intel HEX/)
        })

        it('refuses to make one image of regions that are far apart', () => {
            const far = [base, hexLine(0, 0, [1]), hexLine(0x04, 0, [0x90, 0x00]), hexLine(0, 0, [2]), eof].join('\n')
            assert.throws(() => hexToBin(new TextEncoder().encode(far)), /more than one memory area/)
        })

        it('only hands the ST-Link drive an image that starts at the start of flash', () => {
            const ok = [base, hexLine(0, 0, [1, 2]), eof].join('\n')
            assert.deepStrictEqual([...stlinkBin(new TextEncoder().encode(ok)).data], [1, 2])
            const offset = [base, hexLine(0, 0x8000, [1, 2]), eof].join('\n')
            assert.throws(() => stlinkBin(new TextEncoder().encode(offset)), /not at the start of flash/)
        })
    })

    describe('DfuSe file (.dfu)', () => {
        it('reads the elements with their addresses, in file order', () => {
            const a = new Uint8Array(3000).fill(0x11)
            const b = new Uint8Array(5000).fill(0x22)
            const elements = parseDfuFile(makeDfu([{ address: 0x08000000, data: a }, { address: 0x08020000, data: b }]))
            assert.deepStrictEqual(elements.map(e => e.address), [0x08000000, 0x08020000])
            assert.deepStrictEqual(elements.map(e => e.data.length), [3000, 5000])
            assert.strictEqual(elements[1].data[4999], 0x22)
        })

        it('computes the DFU CRC (CRC-32 without the final inversion)', () => {
            // CRC-32 of "123456789" is 0xCBF43926; the DFU variant is its complement.
            assert.strictEqual(dfuCrc(new TextEncoder().encode('123456789')), (~0xcbf43926) >>> 0)
        })

        it('rejects anything that is not an intact DfuSe file', () => {
            const good = makeDfu([{ address: 0x08000000, data: new Uint8Array(100) }])
            const broken = (change) => { const copy = good.slice(); change(copy); return copy }

            assert.throws(() => parseDfuFile(new Uint8Array(4)), /Not a DfuSe/)
            assert.throws(() => parseDfuFile(new TextEncoder().encode(':020000040800F2\n'.repeat(4))), /Not a DfuSe/)
            assert.throws(() => parseDfuFile(good.subarray(0, good.length - 20)), /truncated/)
            assert.throws(() => parseDfuFile(broken(f => { f[f.length - 8] = 0x58 })), /suffix/)
            assert.throws(() => parseDfuFile(broken(f => { f[300] ^= 0xff })), /CRC/)
            assert.throws(() => parseDfuFile(makeDfu([{ address: 0x08000000, data: new Uint8Array(100) }],
                { elementSizeDelta: 50 })), /malformed element/)
            assert.throws(() => parseDfuFile(makeDfu([])), /no firmware/)
        })
    })

    describe('STM32 DFU flashing (against a simulated bootloader)', () => {
        it('asks for the ST bootloader only', () => {
            assert.deepStrictEqual(DFU_FILTERS, [{ vendorId: 0x0483, productId: 0xdf11 }])
        })

        it('reads the flash layout and transfer size on connect', async () => {
            const usb = fakeBootloader()
            const device = await connectDfu(usb)
            assert.strictEqual(dfuMemoryName(device), 'Internal Flash')
            assert.strictEqual(device.transferSize, 2048)
            assert.isTrue(usb.opened)
        })

        it('falls back to reading the interface name itself when the browser gives none', async () => {
            const usb = fakeBootloader({ interfaceName: null })
            assert.strictEqual(dfuMemoryName(await connectDfu(usb)), 'Internal Flash')
        })

        it('explains a device it cannot open', async () => {
            const usb = fakeBootloader()
            usb.claimInterface = async () => { throw new Error('Access denied.') }
            let message = null
            try { await connectDfu(usb) } catch (err) { message = err.message }
            assert.match(message, /Access denied/)
            assert.match(message, /WinUSB/)
            assert.isFalse(usb.opened)
        })

        it('erases only the sectors under each element, writes them, then leaves once', async () => {
            const usb = fakeBootloader()
            const device = await connectDfu(usb)
            const file = makeDfu([
                { address: 0x08000000, data: new Uint8Array(3000).fill(0x11) },
                { address: 0x08020000, data: new Uint8Array(5000).fill(0x22) },
            ])
            const progress = []
            let erasing = 0
            await quietly(() => flashDfu(device, file, {
                onProgress: (done, total) => progress.push([done, total]),
                onErase: () => { erasing++ },
            }))

            // The 16K sector at the start and the 128K one at 0x08020000 - nothing in
            // between, where the board keeps its filesystem.
            assert.deepStrictEqual(usb.erased, [0x08000000, 0x08020000])
            assert.deepStrictEqual(usb.written.map(w => [w.address, w.length]), [
                [0x08000000, 2048], [0x08000800, 952],
                [0x08020000, 2048], [0x08020800, 2048], [0x08021000, 904],
            ])
            assert.isTrue(usb.written.slice(0, 2).every(w => w.first === 0x11))
            assert.isTrue(usb.written.slice(2).every(w => w.first === 0x22))
            // Left exactly once, at the start of flash, after everything was written.
            assert.deepStrictEqual(usb.left, [0x08000000])
            assert.isFalse(usb.opened)

            assert.isAbove(erasing, 0)
            assert.deepStrictEqual(progress[progress.length - 1], [8000, 8000])
            const done = progress.map(p => p[0])
            assert.deepStrictEqual(done, [...done].sort((x, y) => x - y), 'progress must not go backwards')
        })

        it('reports a failed write as an Error, and does not leave the bootloader', async () => {
            const usb = fakeBootloader({ failWriteAt: 0x08020800 })
            const device = await connectDfu(usb)
            const file = makeDfu([{ address: 0x08020000, data: new Uint8Array(5000) }])
            let caught = null
            try { await quietly(() => flashDfu(device, file)) } catch (err) { caught = err }
            assert.instanceOf(caught, Error)
            assert.match(caught.message, /DOWNLOAD failed/)
            assert.deepStrictEqual(usb.left, [])
        })

        it('does not touch the device for a file that is not a .dfu', async () => {
            const usb = fakeBootloader()
            const device = await connectDfu(usb)
            let caught = null
            try { await flashDfu(device, new Uint8Array(64)) } catch (err) { caught = err }
            assert.match(caught.message, /Not a DfuSe/)
            assert.deepStrictEqual([usb.erased, usb.written, usb.left], [[], [], []])
        })
    })

    describe('Arduino boards', () => {
        it('gathers the boards with Arduino\'s own DFU bootloader, and only those', () => {
            assert.deepStrictEqual(loadBoards('arduino').map(b => b.id), [
                'ARDUINO_GIGA', 'ARDUINO_NICLA_VISION', 'ARDUINO_OPTA', 'ARDUINO_PORTENTA_C33', 'ARDUINO_PORTENTA_H7',
            ])
            // Flashed like any other board of their chip, so they stay in that family.
            assert.include(loadBoards('rp2').map(b => b.id), 'ARDUINO_NANO_RP2040_CONNECT')
            assert.include(loadBoards('esp32').map(b => b.id), 'ARDUINO_NANO_ESP32')
            for (const id of loadBoards('arduino').map(b => b.id)) {
                assert.notInclude(loadBoards('stm32dfu').map(b => b.id), id)
            }
        })

        it('tells the board, and its kind of DFU, from the bootloader\'s USB id', () => {
            assert.deepInclude(arduinoBootloader(0x2341, 0x035b), { board: 'ARDUINO_PORTENTA_H7', dfuse: true })
            assert.deepInclude(arduinoBootloader(0x2341, 0x0366), { board: 'ARDUINO_GIGA', dfuse: true })
            assert.deepInclude(arduinoBootloader(0x2341, 0x035f), { board: 'ARDUINO_NICLA_VISION', dfuse: true })
            assert.deepInclude(arduinoBootloader(0x2341, 0x0364), { board: 'ARDUINO_OPTA', dfuse: true })
            assert.deepInclude(arduinoBootloader(0x35d1, 0x0364), { board: 'ARDUINO_OPTA', dfuse: true })
            assert.deepInclude(arduinoBootloader(0x2341, 0x0368), { board: 'ARDUINO_PORTENTA_C33', dfuse: false })
            assert.isNull(arduinoBootloader(0x2341, 0x025b))   // the Portenta H7 running a sketch
            assert.isNull(arduinoBootloader(0x0483, 0xdf11))
        })

        it('downloads the .dfu for the STM32 boards and the .bin for the C33', () => {
            assert.strictEqual(extFor('arduino', 'ARDUINO_GIGA'), 'dfu')
            assert.strictEqual(extFor('arduino', 'ARDUINO_PORTENTA_H7'), 'dfu')
            assert.strictEqual(extFor('arduino', 'ARDUINO_PORTENTA_C33'), 'bin')
        })

        it('has a bootloader id for every board of the family', () => {
            const boards = new Set(ARDUINO_BOOTLOADERS.map(b => b.board))
            assert.deepStrictEqual([...boards].sort(), loadBoards('arduino').map(b => b.id))
        })

        it('flashes an STM32H7 board past the bootloader sector, and leaves from the firmware address', async () => {
            // Arduino's H7 bootloader: its own 128K sector is read-only, the rest is free.
            const usb = fakeBootloader({ interfaceName: '@Internal Flash  2MB   /0x08000000/01*128Ka,15*128Kg' })
            const device = await connectDfu(usb)
            const file = makeDfu([{ address: 0x08040000, data: new Uint8Array(300000).fill(0x33) }])
            await quietly(() => flashDfu(device, file, { leaveAtFirmware: true }))

            assert.deepStrictEqual(usb.erased, [0x08040000, 0x08060000, 0x08080000])
            assert.strictEqual(usb.written[0].address, 0x08040000)
            assert.strictEqual(usb.written.reduce((sum, w) => sum + w.length, 0), 300000)
            assert.deepStrictEqual(usb.left, [0x08040000])
        })
    })

    describe('Arduino Portenta C33 (plain DFU, against a simulated bootloader)', () => {

        it('uses the transfer size the bootloader states', async () => {
            const device = await connectDfu(fakeArduinoBootloader(), { dfuse: false })
            assert.strictEqual(device.transferSize, 64)
            assert.isFalse(device.dfuse)
        })

        it('refuses to guess a transfer size the bootloader does not state', async () => {
            const usb = fakeArduinoBootloader({ transferSize: null })
            let caught = null
            try { await connectDfu(usb, { dfuse: false }) } catch (err) { caught = err }
            assert.match(caught.message, /transfer size/)
            assert.isFalse(usb.opened)
        })

        it('sends the image in numbered blocks, ends the download, then detaches once', async () => {
            const usb = fakeArduinoBootloader()
            const device = await connectDfu(usb, { dfuse: false })
            const image = Uint8Array.from({ length: 200 }, (_, i) => (i * 7 + 3) & 0xff)
            const progress = []
            await quietly(() => flashDfuBin(device, image, { onProgress: (done, total) => progress.push([done, total]) }))

            assert.deepStrictEqual(usb.blocks, [[0, 64], [1, 64], [2, 64], [3, 8]])
            assert.deepStrictEqual(usb.image, [...image])
            assert.strictEqual(usb.manifested, 1)
            assert.strictEqual(usb.detached, 1)
            assert.isFalse(usb.opened)
            assert.deepStrictEqual(progress, [[64, 200], [128, 200], [192, 200], [200, 200]])
        })

        it('stops at a block the bootloader rejects, without detaching', async () => {
            const usb = fakeArduinoBootloader({ failAtBlock: 2 })
            const device = await connectDfu(usb, { dfuse: false })
            let caught = null
            try { await flashDfuBin(device, new Uint8Array(200)) } catch (err) { caught = err }
            assert.instanceOf(caught, Error)
            assert.match(caught.message, /Download failed/)
            assert.deepStrictEqual(usb.blocks, [[0, 64], [1, 64]])
            assert.deepStrictEqual([usb.manifested, usb.detached], [0, 0])
        })

        it('keeps the two kinds of bootloader and file apart', async () => {
            const plain = await connectDfu(fakeArduinoBootloader(), { dfuse: false })
            const st = await connectDfu(fakeBootloader())
            const dfuFile = makeDfu([{ address: 0x08000000, data: new Uint8Array(100) }])
            let a = null, b = null
            try { await flashDfu(plain, dfuFile) } catch (err) { a = err }
            try { await flashDfuBin(st, new Uint8Array(100)) } catch (err) { b = err }
            assert.match(a.message, /does not take a \.dfu/)
            assert.match(b.message, /takes a \.dfu file/)
        })
    })

    describe('Board overlay (firmware from outside micropython.org)', () => {
        it('adds the W600 boards as a family of their own', () => {
            assert.deepStrictEqual(loadBoards('w600').map(b => b.id), [
                'W600_EVB_V2', 'W600_GENERIC', 'W600_THINGSTURN_TB01', 'W600_WAVGAT_AIR602', 'W600_WEMOS', 'W600_WIS600',
            ])
            assert.strictEqual(preferredBoard(loadBoards('w600')).id, 'W600_GENERIC')
            assert.strictEqual(extFor('w600', 'W600_GENERIC'), 'fls')
        })

        it('takes an overlay board\'s firmware from its own source, without the CORS proxy', () => {
            const url = 'https://raw.githubusercontent.com/robert-hh/Shared-Stuff/master/w600_firmware/wm_w600_WEMOS_W600.fls'
            assert.strictEqual(firmwareUrl('W600_WEMOS', null, 'latest', 'fls'), url)
            assert.strictEqual(firmwareFetchUrl('W600_WEMOS', null, 'latest', 'fls'), url)
            assert.strictEqual(firmwareFileName('W600_WEMOS', null, 'latest', 'fls'), 'wm_w600_WEMOS_W600.fls')
        })

        it('offers each board the versions its own source has', () => {
            assert.deepStrictEqual(releasesFor('W600_GENERIC').map(r => r.id), ['latest'])
            assert.deepStrictEqual(releasesFor('RPI_PICO').map(r => r.id), RELEASES)
            assert.strictEqual(releasesFor('RPI_PICO')[0].label, 'v1.29.0 (2026-08-24)')
        })

        it('never shadows a micropython.org board', () => {
            const indexIds = new Set(boardsIndex.map(b => b.id))
            for (const b of boardsOverlay) {
                assert.isFalse(indexIds.has(b.id), `${b.id} is already in the index`)
                assert.match(b.firmware.url, /^https:\/\//)
                assert.isAbove(b.firmware.releases.length, 0)
            }
        })
    })

    describe('WinnerMicro W600 (against a simulated bootloader)', () => {
        it('computes both flavours of CRC-16', () => {
            const check = new TextEncoder().encode('123456789')
            assert.strictEqual(crc16(check), 0x29b1)       // CRC-16/CCITT-FALSE, for command frames
            assert.strictEqual(crc16(check, 0), 0x31c3)    // CRC-16/XMODEM, for data blocks
        })

        it('frames a command: 0x21, length, CRC, then the code as 32 bits', () => {
            const crc = crc16([0x3f, 0, 0, 0])
            assert.deepStrictEqual([...w600Command(0x3f)], [0x21, 6, 0, crc & 0xff, crc >> 8, 0x3f, 0, 0, 0])
        })

        it('builds an XMODEM-1K block, padding a short one with 0x1A', () => {
            const packet = xmodemPacket(3, new Uint8Array([1, 2, 3]))
            assert.strictEqual(packet.length, 1029)
            assert.deepStrictEqual([...packet.subarray(0, 7)], [0x02, 3, 0xfc, 1, 2, 3, 0x1a])
            assert.strictEqual(packet[1026], 0x1a)
            assert.strictEqual((packet[1027] << 8) | packet[1028], crc16(packet.subarray(3, 1027), 0))
            assert.deepStrictEqual([...xmodemPacket(257, new Uint8Array(1)).subarray(1, 3)], [1, 0xfe])
        })

        it('recognises a .fls by its two image headers', () => {
            assert.isTrue(isW600Fls(makeFls(200)))
            assert.isFalse(isW600Fls(new Uint8Array(200)))
            const img = makeFls(200)
            img.fill(0, 56, 60)     // one header only: a plain .img, which the ROM bootloader refuses
            assert.isFalse(isW600Fls(img))
        })

        it('resets the board into its bootloader and reads the MAC address', async () => {
            const port = fakeW600Port()
            const link = await openW600(port)
            try {
                await enterW600Bootloader(link)
                assert.strictEqual(port.baudRate, 115200)
                assert.strictEqual(port.resets, 1)
                assert.strictEqual(await w600Mac(link), '286DCD0A1B2C')
            } finally {
                await closeW600(link)
            }
            assert.isFalse(port.opened)
        })

        it('asks for the reset button when the reset line does nothing', async function () {
            this.slow(8000)     // it has to wait out the automatic attempts first
            const port = fakeW600Port({ rtsResets: false })
            const link = await openW600(port)
            let asked = 0
            try {
                await enterW600Bootloader(link, { onNeedReset: () => { asked++; port.pushReset() } })
            } finally {
                await closeW600(link)
            }
            assert.strictEqual(asked, 1)
        })

        it('erases secboot, sends the image in 1K blocks, resets into it and closes the port', async function () {
            this.slow(5000)
            const port = fakeW600Port({ nakBlocks: [2] })
            const link = await openW600(port)
            const image = makeFls(2500)
            const progress = []
            let dtrWhileFlashing = null
            try {
                await flashW600(link, image, {
                    onProgress: (done, total) => { progress.push([done, total]); dtrWhileFlashing = port.dtr },
                })
                // Nothing left for the caller to close, and the lines are let go: DTR held
                // low would keep a board that wires it to PA0 in its bootloader.
                assert.isFalse(port.opened)
                assert.isTrue(dtrWhileFlashing)
                assert.isFalse(port.dtr)
            } finally {
                await closeW600(link)       // closing twice must be harmless
            }

            assert.strictEqual(port.badFrames, 0)
            assert.isFalse(port.secboot)
            // Secboot goes first, the flash-id query proves the ROM bootloader is there,
            // and only then the blocks - block 2 once more after being rejected.
            assert.deepStrictEqual(port.commands, [0x3f, 0x3c, 'block 1', 'block 2', 'block 3'])
            assert.deepStrictEqual(port.received.slice(0, 2500), [...image])
            assert.strictEqual(port.received.length, 3072)
            assert.isTrue(port.received.slice(2500).every(b => b === 0x1a))
            assert.deepStrictEqual(progress, [[1024, 2500], [2048, 2500], [2500, 2500]])
            assert.strictEqual(port.resets, 2)      // into the bootloader, then into the firmware
        })

        it('does not erase secboot for a file that is not a .fls', async () => {
            const port = fakeW600Port()
            const link = await openW600(port)
            let caught = null
            try {
                await flashW600(link, new Uint8Array(4096))
            } catch (err) {
                caught = err
            } finally {
                await closeW600(link)
            }
            assert.match(caught.message, /Not a W600 \.fls/)
            assert.isTrue(port.secboot)
            assert.deepStrictEqual(port.commands, [])
        })
    })

    /* Each family's firmware extension must be something loadBoards()/extFor() can
     * actually produce - catches a typo in FAMILIES before it ships. */
    describe('loadBoards (bundled index)', () => {
        it('returns boards for each family with no network access', () => {
            // A real fetch would throw under Mocha's jsdom-less Node environment just
            // as readily as it would with the network down - this only passes because
            // loadBoards() never reaches for one.
            for (const family of Object.keys(FAMILIES)) {
                const boards = loadBoards(family)
                assert.isAbove(boards.length, 0, `${family} has no boards`)
                for (const b of boards) {
                    assert.isString(b.id)
                    assert.isString(b.product)
                }
            }
        })

        it('rejects a family it does not know about', () => {
            assert.throws(() => loadBoards('not-a-real-family'), /Unknown family/)
        })
    })

    describe('FAMILIES', () => {
        it('declares a port list and an extension (or a per-board rule) for every family', () => {
            for (const [name, def] of Object.entries(FAMILIES)) {
                assert.isArray(def.ports, `${name}.ports`)
                assert.isAbove(def.ports.length, 0, `${name}.ports`)
                assert(def.ext || ['nrf52', 'arduino'].includes(name), `${name} needs an ext, or a per-board rule like nrf52's`)
            }
        })
    })

    describe('published firmware (network)', function () {
        before(async function () {
            try {
                const res = await fetch('https://micropython.org/resources/boards/index.json',
                    { cache: 'no-store', signal: AbortSignal.timeout(15000) })
                if (!res.ok) { skipSuite(this, `boards index returned HTTP ${res.status}`) }
            } catch (err) {
                skipSuite(this, `no network access: ${err.message}`)
            }
        })

        /* Guards against a mistyped date/version when RELEASES is updated: the newest
         * entry must be published for one plain board per family. Goes straight to
         * micropython.org, not through the CORS proxy - a HEAD request needs no
         * readable body, so there is nothing for the proxy to add here. */
        it('the newest release exists for a representative board of each family', async () => {
            const release = RELEASES[0]
            const probes = [
                firmwareUrl('ESP32_GENERIC', null, release, 'bin'),
                firmwareUrl('RPI_PICO', null, release, 'uf2'),
                firmwareUrl('SEEED_XIAO_NRF52', null, release, 'uf2'),
                firmwareUrl('SAMD_GENERIC_D21X18', null, release, 'uf2'),
                firmwareUrl('TEENSY40', null, release, 'bin'),
                firmwareUrl('PYBV11', null, release, 'dfu'),
                firmwareUrl('NUCLEO_WB55', null, release, 'hex'),
                firmwareUrl('ARDUINO_PORTENTA_C33', null, release, 'bin'),
                firmwareUrl('ARDUINO_GIGA', null, release, 'dfu'),
                firmwareUrl('W600_GENERIC', null, 'latest', 'fls'),
            ]
            for (const url of probes) {
                const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(15000) })
                assert.strictEqual(res.status, 200, `${url} should exist`)
            }
        })
    })
})
