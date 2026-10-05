/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Firmware selection logic for flasher.js: which MicroPython builds exist, what their
 * download URL is, and which board a connected chip most likely is. No DOM, no fetch -
 * this is the part that is worth unit testing and the part that needs to be right.
 */

import { corsProxyUrl } from '../utils.js'
import boardsIndex from './boards_index.js'
import boardsOverlay from './boards_overlay.js'

// micropython.org's boards, plus the ones only the overlay knows (see boards_overlay.js).
const ALL_BOARDS = [...boardsIndex, ...boardsOverlay]
const OVERLAY_FIRMWARE = new Map(boardsOverlay.map(b => [b.id, b.firmware]))

// micropython.org publishes no machine-readable release list (board index has no
// version/date), so the releases we offer are hard-coded here. Newest first.
// Verified against the server (2026-10-03): v1.29.0 is published for every board/variant
// below; v1.28.0 and v1.27.0 miss some boards/variants added since.
export const RELEASES = [
    '20260824-v1.29.0',
    '20260406-v1.28.0',
    '20251209-v1.27.0',
]

// What each port's install image is called, and how it reaches the device.
export const FAMILIES = {
    esp32: {
        title:  'ESP32 / ESP8266',
        ports:  ['esp32', 'esp8266'],
        ext:    'bin',
        method: 'serial',
    },
    rp2: {
        title:  'RP2040 / RP2350',
        ports:  ['rp2'],
        ext:    'uf2',
        method: 'drive',
    },
    nrf52: {
        title:  'nRF52 / nRF91 / micro:bit v1',
        ports:  ['nrf'],
        mcu:    'nrf52',
        // Boards that are not nRF52 but still use this family's drive are named here, not
        // matched by mcu: the micro:bit v1 (nRF51, DAPLink drive) and the nRF9160 DK
        // (nRF91, J-Link drive). Their .hex goes to the drive like the other .hex boards.
        // The rest of nRF51 and nRF91 (Nordic dev kits, Actinius Icarus) stay out.
        extraIds: ['MICROBIT', 'PCA10090'],
        ext:    null,       // decided per-board, see nrf52Ext()
        method: 'drive',
    },
    samd: {
        title:  'SAMD21 / SAMD51',
        ports:  ['samd'],
        ext:    'uf2',      // every board on this port publishes one, unlike nrf52
        method: 'drive',
    },
    teensy: {
        title:  'Teensy 4.0 / 4.1',
        ports:  ['mimxrt'],
        ids:    ['TEENSY40', 'TEENSY41'],   // the mimxrt port also holds many non-Teensy boards
        ext:    'bin',      // the .hex/.ehex images need the HEX parser the .bin path skips
        method: 'hid',
    },
    stm32dfu: {
        title:  'STM32 (USB DFU)',
        ports:  ['stm32'],
        accept: (id) => stm32Route(id) === 'dfu',
        ext:    'dfu',      // published for every STM32 board; there is no .bin at all
        method: 'dfu',
    },
    arduino: {
        title:  'Portenta / Giga / Nicla Vision / Opta',
        // The boards that come with Arduino's own USB DFU bootloader, whatever chip they
        // are built on - see ARDUINO_BOOTLOADERS. The Arduino boards that are flashed like
        // any other board of their chip (Nano ESP32, Nano RP2040 Connect, ...) stay in
        // that chip's family.
        ports:  ['stm32', 'renesas-ra'],
        accept: (id) => ARDUINO_BOOTLOADERS.some(b => b.board === id),
        ext:    null,       // decided per-board, see arduinoExt()
        method: 'dfu',
    },
    w600: {
        title:  'WinnerMicro W60x',
        ports:  ['w60x'],   // not a micropython.org port: these boards are all overlay entries
        ext:    'fls',
        method: 'serial',
    },
    stm32link: {
        title:  'STM32 Nucleo / Discovery',
        ports:  ['stm32'],
        accept: (id) => stm32Route(id) === 'link',
        ext:    'hex',      // what is downloaded; it reaches the drive as a .bin, see flasher/hex.js
        method: 'drive',
    },
}

// STM32 boards split by how they are programmed, going by micropython.org's deploy pages
// (read 2026-10-04). The index has no field for this, so it is decided by board id.
//
// Nucleo and Discovery kits (and the B-L... kits) carry an on-board ST-Link and are
// programmed through it; most have no USB connector wired to the target chip at all.
const STM32_STLINK_BOARD = /^NUCLEO_|DISC|_DK$|^B_L/

// Not flashable by any route here: the LEGO hubs ship LEGO's bootloader and firmware
// that a plain flash would overwrite, and the Espruino Pico's page defers to Espruino's
// tools.
export const STM32_UNSUPPORTED = new Set([
    'LEGO_HUB_NO6', 'LEGO_HUB_NO7',
    'ESPRUINO_PICO',
])

/*
 * Arduino's USB DFU bootloaders (entered with a double-tap on reset), one USB id per
 * board, so the device the user picks says exactly which board it is. Two kinds:
 *   - the STM32H7 boards speak ST's DfuSe and take the .dfu, the way Arduino's own
 *     upload does it (`dfu-util -a0 --dfuse-address=0x08040000:leave`);
 *   - the Portenta C33 (Renesas RA6M5) speaks plain DFU and takes the .bin
 *     (`dfu-util -a 0 -d 2341:0368 -D firmware.bin`).
 * Ids are from Arduino's boards.txt (ArduinoCore-mbed, ArduinoCore-renesas) and agree
 * with the ids in the suffix of each published .dfu - micropython.org's deploy pages for
 * the Giga and the Nicla Vision repeat the Portenta H7's 2341:035b, which is not theirs.
 * 35d1 is the Finder-branded Opta.
 */
export const ARDUINO_BOOTLOADERS = [
    { vendorId: 0x2341, productId: 0x035b, board: 'ARDUINO_PORTENTA_H7',  dfuse: true },
    { vendorId: 0x2341, productId: 0x0366, board: 'ARDUINO_GIGA',         dfuse: true },
    { vendorId: 0x2341, productId: 0x035f, board: 'ARDUINO_NICLA_VISION', dfuse: true },
    { vendorId: 0x2341, productId: 0x0364, board: 'ARDUINO_OPTA',         dfuse: true },
    { vendorId: 0x35d1, productId: 0x0364, board: 'ARDUINO_OPTA',         dfuse: true },
    { vendorId: 0x2341, productId: 0x0368, board: 'ARDUINO_PORTENTA_C33', dfuse: false },
]

export function arduinoBootloader(vendorId, productId) {
    return ARDUINO_BOOTLOADERS.find(b => b.vendorId === vendorId && b.productId === productId) || null
}

export function arduinoExt(boardId) {
    const entry = ARDUINO_BOOTLOADERS.find(b => b.board === boardId)
    return entry && !entry.dfuse ? 'bin' : 'dfu'
}

// 'dfu' (the ST DFU bootloader over USB), 'link' (the on-board ST-Link), 'arduino'
// (Arduino's bootloader, see above), or null.
export function stm32Route(boardId) {
    if (STM32_UNSUPPORTED.has(boardId)) { return null }
    if (ARDUINO_BOOTLOADERS.some(b => b.board === boardId)) { return 'arduino' }
    return STM32_STLINK_BOARD.test(boardId) ? 'link' : 'dfu'
}

// The board an ST-Link drive belongs to, by the four-digit code in its MBED.HTM (see
// parseStlinkDrive in drive.js). The codes are mbed platform ids, taken from pyOCD's
// board_ids.py (2026-10-04) for the boards in the index; 0839 is checked on a real board.
// Neighbouring variants with their own code (NUCLEO-L452RE-P, 0829) are left unmapped.
const STLINK_BOARD_BY_CODE = {
    '0710': 'NUCLEO_L152RE',   '0720': 'NUCLEO_F401RE',   '0740': 'NUCLEO_F411RE',
    '0741': 'STM32F411DISC',   '0742': 'NUCLEO_F413ZH',   '0750': 'NUCLEO_F091RC',
    '0760': 'NUCLEO_L073RZ',   '0764': 'B_L475E_IOT01A',  '0765': 'NUCLEO_L476RG',
    '0770': 'NUCLEO_L432KC',   '0777': 'NUCLEO_F446RE',   '0782': 'NUCLEO_L4A6ZG',
    '0788': 'STM32F469DISC',   '0795': 'STM32F429DISC',   '0796': 'NUCLEO_F429ZI',
    '0797': 'NUCLEO_F439ZI',   '0812': 'NUCLEO_F722ZE',   '0813': 'NUCLEO_H743ZI',
    '0814': 'STM32H747I_DISCO', '0815': 'STM32F7DISC',    '0816': 'NUCLEO_F746ZG',
    '0817': 'STM32F769DISC',   '0818': 'NUCLEO_F767ZI',   '0820': 'STM32L476DISC',
    '0821': 'NUCLEO_L452RE',   '0822': 'STM32L496GDISC',  '0826': 'NUCLEO_F412ZG',
    '0830': 'STM32F4DISC',     '0833': 'B_L072Z_LRWAN1',  '0836': 'NUCLEO_H743ZI2',
    '0839': 'NUCLEO_WB55',     '0841': 'NUCLEO_G474RE',   '0842': 'NUCLEO_H753ZI',
    '0859': 'STM32H7B3I_DK',   '0860': 'NUCLEO_H7A3ZI_Q', '0866': 'NUCLEO_WL55',
    '0871': 'NUCLEO_H723ZG',   '0872': 'NUCLEO_G0B1RE',   '0877': 'NUCLEO_U5A5ZJ_Q',
    '0878': 'NUCLEO_H563ZI',   '0879': 'NUCLEO_F756ZG',
}

export const STLINK_BOARD_CODES = Object.keys(STLINK_BOARD_BY_CODE)

export function stlinkBoardId(code) {
    return STLINK_BOARD_BY_CODE[code] || null
}

// The board index does not say which nRF52 boards publish a .uf2 (most publish only
// .hex + .bin for a DAPLink/J-Link debug probe). Checked against the download pages
// (2026-10-03): these are the only ones that do.
const NRF52_UF2_BOARDS = new Set(['SEEED_XIAO_NRF52'])

export function nrf52Ext(boardId) {
    return NRF52_UF2_BOARDS.has(boardId) ? 'uf2' : 'hex'
}

export function extFor(family, boardId) {
    if (family === 'nrf52') { return nrf52Ext(boardId) }
    if (family === 'arduino') { return arduinoExt(boardId) }
    return FAMILIES[family].ext
}

/*
 * Keeps only the (vendored) boards that belong to `family`. Synchronous - there is
 * nothing to fetch - but kept callable with `await` since every call site already
 * does, from when this fetched boards/index.json live.
 */
export function loadBoards(family) {
    const def = FAMILIES[family]
    if (!def) { throw new Error(`Unknown family: ${family}`) }
    return ALL_BOARDS.filter(b => def.ports.includes(b.port)
            && (def.ids ? def.ids.includes(b.id)
                : (!def.mcu || b.mcu === def.mcu || (def.extraIds || []).includes(b.id)))
            && (!def.accept || def.accept(b.id)))
        .sort((a, b) => a.id.localeCompare(b.id))
}

// True for a board from the overlay: one whose firmware does not come from micropython.org.
export function isOverlayBoard(boardId) {
    return OVERLAY_FIRMWARE.has(boardId)
}

/*
 * The versions a board's firmware can be had in, newest first, as [{ id, label }]:
 * RELEASES for a micropython.org board, whatever its overlay entry lists for the others.
 */
export function releasesFor(boardId) {
    const overlay = OVERLAY_FIRMWARE.get(boardId)
    if (overlay) { return overlay.releases }
    return RELEASES.map((id) => {
        const m = id.match(/^(\d{4})(\d{2})(\d{2})-(v[\d.]+)$/)
        return { id, label: m ? `${m[4]} (${m[1]}-${m[2]}-${m[3]})` : id }
    })
}

// A board with variants publishes one firmware file per variant, named
// `<id>-<variant>-<release>.<ext>`, plus a plain `<id>-<release>.<ext>` for the default.
// An overlay board's file is called whatever its source calls it.
export function firmwareFileName(boardId, variant, release, ext) {
    const overlay = OVERLAY_FIRMWARE.get(boardId)
    if (overlay) { return overlay.url.split('/').pop() }
    const v = variant ? `-${variant}` : ''
    return `${boardId}${v}-${release}.${ext}`
}

export function firmwareUrl(boardId, variant, release, ext) {
    const overlay = OVERLAY_FIRMWARE.get(boardId)
    if (overlay) { return overlay.url }
    return `https://micropython.org/resources/firmware/${firmwareFileName(boardId, variant, release, ext)}`
}

// Through the CORS proxy: what fetch() needs to be able to read the response body
// cross-origin. The plain micropython.org URL (see firmwareUrl above) still works for
// a direct, non-fetch download - e.g. a plain <a href> - since only reading the response
// in JS requires CORS, not the browser's own navigation/download. An overlay board
// whose host sends CORS headers itself is fetched directly.
export function firmwareFetchUrl(boardId, variant, release, ext) {
    const overlay = OVERLAY_FIRMWARE.get(boardId)
    if (overlay && overlay.cors) { return overlay.url }
    return corsProxyUrl(firmwareUrl(boardId, variant, release, ext))
}

/*
 * RP2 has no serial "erase flash" command reachable from the drive method - the only
 * way to wipe it from a browser is to drop a UF2 that does the erasing itself. This one
 * (BSD-3-Clause, github.com/Gadgetoid/pico-universal-flash-nuke v1.1.0) erases the whole
 * external flash chip, whatever its size, then reboots straight back into the
 * bootloader. In testing, the directory handle flasher.js already holds is still good
 * afterwards - no need to make the user pick the drive again before writing the real
 * firmware (see eraseRp2Flash in flasher.js).
 *
 * Vendored into assets/ (copied into build/assets/ like every other static asset - see
 * build.py) rather than fetched from GitHub at runtime: 28KB that never changes is not
 * worth a CORS-proxy round trip, or being unavailable whenever that proxy is.
 */
export function nukeUf2Url() {
    return `${VIPER_IDE_BASE_URL}/assets/universal_flash_nuke.uf2`
}

// ESP32/ESP8266 bootloader offset for the application image. Per-board
// `deploy_options.flash_offset` wins; this is the fallback by mcu (matches
// micropython's makeimg.py / esptool defaults).
const ESP_FLASH_OFFSET_BY_MCU = {
    esp8266:  0x0000,
    esp32:    0x1000,
    esp32s2:  0x1000,
    esp32s3:  0x0000,
    esp32c2:  0x0000,
    esp32c3:  0x0000,
    esp32c5:  0x2000,
    esp32c6:  0x0000,
    esp32h2:  0x0000,
    esp32p4:  0x2000,
}

export function flashOffsetFor(board) {
    const configured = board.deploy_options && board.deploy_options.flash_offset
    if (configured !== undefined) {
        return typeof configured === 'string' ? parseInt(configured, 16) : configured
    }
    return ESP_FLASH_OFFSET_BY_MCU[board.mcu] ?? 0x1000
}

/*
 * Matches the board a running MicroPython reports itself as (sys.implementation._build,
 * e.g. "ESP32_GENERIC_S3-SPIRAM_OCT") against the index, so re-flashing the same device
 * preselects the same board + variant it already has.
 */
export function matchBuildId(build, boards) {
    if (!build) { return null }
    for (const b of boards) {
        if (build === b.id) { return { board: b, variant: null } }
        for (const variant of Object.keys(b.variants || {})) {
            if (build === `${b.id}-${variant}`) { return { board: b, variant } }
        }
    }
    return null
}

/*
 * Finds a build by name across all families: { family, board, variant } for `build`
 * written as a board id ("RPI_PICO") or an id with a variant ("ESP32_GENERIC-SPIRAM"),
 * the way sys.implementation._build and micropython.org name them; null if there is
 * none. Exact names win, but case is forgiven since this is typed into URLs.
 */
export function findBuild(build) {
    if (!build) { return null }
    for (const exact of [true, false]) {
        const norm = exact ? (s) => s : (s) => s.toLowerCase()
        const wanted = norm(build)
        for (const family of Object.keys(FAMILIES)) {
            for (const board of loadBoards(family)) {
                if (norm(board.id) === wanted) { return { family, board, variant: null } }
                for (const variant of Object.keys(board.variants || {})) {
                    if (norm(`${board.id}-${variant}`) === wanted) { return { family, board, variant } }
                }
            }
        }
    }
    return null
}

// esptool-js chip names (ESPLoader.chip.CHIP_NAME, e.g. "ESP32-S3") to the index's `mcu`.
const ESPTOOL_CHIP_TO_MCU = {
    'ESP32':    'esp32',
    'ESP32-S2': 'esp32s2',
    'ESP32-S3': 'esp32s3',
    'ESP32-C2': 'esp32c2',
    'ESP32-C3': 'esp32c3',
    'ESP32-C5': 'esp32c5',
    'ESP32-C6': 'esp32c6',
    'ESP32-H2': 'esp32h2',
    'ESP32-P4': 'esp32p4',
    'ESP8266':  'esp8266',
}

export function mcuForChipName(chipName) {
    return ESPTOOL_CHIP_TO_MCU[chipName] || null
}

// Preselect the vendor-neutral "GENERIC" build for a freshly detected chip - almost
// always the right choice, and always a safe starting point. Matches ESP32_GENERIC as
// well as the per-chip variants (ESP32_GENERIC_S3, ESP32_GENERIC_C3, ...).
export function preferredBoard(boards) {
    return boards.find(b => /_GENERIC(_|$)/.test(b.id)) || boards[0] || null
}
