/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * flasher.html's controller: pick a board family, connect to it the one way that family
 * supports from a browser, choose a firmware build, and write it.
 *
 *   - ESP32 / ESP8266: WebSerial (or WebUSB through the polyfill), flashed with esptool-js.
 *   - Teensy 4.0 / 4.1: WebHID, straight to the board's HalfKay bootloader (flasher/teensy.js).
 *   - WinnerMicro W600: WebSerial, to the chip's own bootloader (flasher/w600.js). These
 *     boards and their firmware are not on micropython.org - see flasher/boards_overlay.js.
 *   - STM32: WebUSB, to the ST DFU bootloader (flasher/dfu.js, on top of the webdfu package).
 *   - Arduino Portenta H7 / C33, Giga, Nicla Vision, Opta: WebUSB as well, to Arduino's own
 *     DFU bootloader (same module; DfuSe on the STM32 boards, plain DFU on the C33).
 *   - RP2, nRF52 (and micro:bit v1), SAMD21/SAMD51: the device shows up as a mass-storage drive;
 *     the firmware file is written to it with the File System Access API. No driver, no
 *     protocol code - the device decides what to do with the bytes once they land on it.
 *   - STM32 Nucleo / Discovery: the same, through the drive of the on-board ST-Link, with
 *     the published .hex turned into a .bin first (flasher/hex.js).
 *
 * Either way, getting the firmware bytes needs a CORS-relaying proxy in front of
 * micropython.org (see corsProxyUrl in utils.js) - the board list itself is bundled
 * (see flasher/boards_index.js) and needs no such proxy. When the proxy is
 * unavailable, a plain download link plus a local-file picker keeps the page useful -
 * see the "Having trouble downloading?" details element, revealed on a failed fetch.
 */

import '@xterm/xterm/css/xterm.css'
import 'toastr/build/toastr.css'
import './app_common.css'
import './flasher.css'

import toastr from 'toastr'
import { serial as webSerialPolyfill } from 'web-serial-polyfill'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

import { library, dom } from '@fortawesome/fontawesome-svg-core'
import { faMicrochip, faPlug, faBolt, faTerminal, faXmark, faDownload, faBug } from '@fortawesome/free-solid-svg-icons'

import { fetchArrayBuffer, sizeFmt, report } from './utils.js'
import { QID, getCssPropertyValue } from './utils_browser.js'
import {
    FAMILIES, loadBoards, extFor, firmwareUrl, firmwareFetchUrl,
    firmwareFileName, flashOffsetFor, preferredBoard, nukeUf2Url, stlinkBoardId,
    ARDUINO_BOOTLOADERS, arduinoBootloader, releasesFor, findBuild, isOverlayBoard,
} from './flasher/firmware.js'
import { openW600, closeW600, enterW600Bootloader, w600Mac, flashW600 } from './flasher/w600.js'
import { stlinkBin } from './flasher/hex.js'
import { hasDirectoryPicker, pickDrive, writeFileToDrive } from './flasher/drive.js'
import { connectEsp, flashEsp, eraseEsp } from './flasher/esp.js'
import { hasHidApi, requestTeensy, boardIdForProduct, flashTeensy } from './flasher/teensy.js'
import {
    hasUsbApi, requestDfuDevice, connectDfu, closeDfu, dfuMemoryName, flashDfu, flashDfuBin,
    DFU_FILTERS,
} from './flasher/dfu.js'

window.analytics = { track: function() {} }

library.add(faMicrochip, faPlug, faBolt, faTerminal, faXmark, faDownload, faBug)
dom.watch()

const QSA = (x) => [...document.querySelectorAll(x)]

/*
 * The log lives in a drawer, closed by default: the connect/pick/flash flow above is
 * the interface, this is detail for when something needs explaining. It is a read-only
 * xterm.js view (no onData/key handling - matches the one in app.js minus the parts
 * that make that one interactive) rather than DOM text, so progress output from
 * esptool-js (which writes with \r and no trailing newline while it updates a percentage
 * in place) renders the way a real terminal would.
 */
const term = new Terminal({
    fontFamily: '"Hack", "Droid Sans Mono", "monospace", monospace',
    fontSize: (14 * 0.9).toFixed(1),
    theme: { background: getCssPropertyValue('--bg-color-edit') },
    convertEol: true,
    disableStdin: true,
    cursorStyle: 'bar',
    cursorBlink: false,
})
term.open(QID('xterm-log'))
const logFit = new FitAddon()
term.loadAddon(logFit)
logFit.fit()
new ResizeObserver(() => logFit.fit()).observe(QID('xterm-log'))

function log(s) {
    term.writeln(s)
}

function openLogDrawer() {
    QID('log-drawer').classList.add('open')
    logFit.fit()
}

function hasSerialApi() {
    return typeof navigator.serial !== 'undefined' || typeof navigator.usb !== 'undefined'
}

function getSerialApi() {
    return typeof navigator.serial !== 'undefined' ? navigator.serial : webSerialPolyfill
}

const CONNECT_INFO = {
    esp32: {
        label:        'Connect via USB / Serial',
        instructions: 'Plug your board in via USB, then connect:',
        hint:         'Most boards enter their bootloader automatically. If connecting fails, ' +
                      'hold the BOOT/IO0 button while plugging in, then try again.',
        capable:      () => window.isSecureContext && hasSerialApi(),
        incapable:    'WebSerial/WebUSB is not available. Try Chrome or Edge.',
    },
    w600: {
        label:        'Connect via USB / Serial',
        instructions: 'Plug your board in via USB, then connect:',
        hint:         'Some boards (Wemos W600) need their reset button pushed right after connecting. ' +
                      'If the bootloader still does not answer, reset the board with PA0 connected to GND.',
        capable:      () => window.isSecureContext && hasSerialApi(),
        incapable:    'WebSerial/WebUSB is not available. Try Chrome or Edge.',
    },
    teensy: {
        label:        'Connect via USB',
        instructions: 'Press the PROGRAM button on the board to put it into its bootloader, then connect:',
        hint:         'The board must be in its bootloader - it will not show up here while running ' +
                      'MicroPython. Press PROGRAM again if it does not appear.',
        capable:      () => window.isSecureContext && hasHidApi(),
        incapable:    'WebHID is not available. Try Chrome or Edge.',
    },
    stm32dfu: {
        label:        'Connect via USB',
        instructions: 'Put the board into its DFU bootloader, then connect:',
        hint:         'Run machine.bootloader() from the REPL, or reset the board with BOOT0 connected ' +
                      'to 3V3 (on some boards, with the Boot button held). Pyboard D: hold USR through ' +
                      'a reset until the LED is white.',
        capable:      () => window.isSecureContext && hasUsbApi(),
        incapable:    'WebUSB is not available. Try Chrome or Edge.',
    },
    arduino: {
        label:        'Connect via USB',
        instructions: 'Double-tap the reset button to put the board into its bootloader, then connect:',
        hint:         'Already running MicroPython? machine.bootloader() from the REPL does the same. ' +
                      'An Opta may stay in its bootloader after flashing - press reset once.',
        capable:      () => window.isSecureContext && hasUsbApi(),
        incapable:    'WebUSB is not available. Try Chrome or Edge.',
    },
    stm32link: {
        label:        'Select the drive',
        instructions: 'Plug the board in through its ST-Link USB connector, then pick its drive:',
        hint:         'No drive appears? Older Discovery boards carry an ST-Link/V2, which has none - ' +
                      'those need a programming tool such as STM32CubeProgrammer.',
        capable:      () => hasDirectoryPicker(),
        incapable:    'Cannot write to a drive directly. Try Chrome or Edge.',
    },
    rp2: {
        label:        'Select the drive',
        instructions: 'Hold the BOOTSEL button while plugging your board in (or while resetting it), then pick its drive:',
        hint:         'Already running MicroPython? Open a REPL and run machine.bootloader() first, ' +
                      'then pick the drive that appears.',
        capable:      () => hasDirectoryPicker(),
        incapable:    'Cannot write to a drive directly. Try Chrome or Edge.',
    },
    nrf52: {
        label:        'Select the drive',
        instructions: 'Double-tap the RESET button to enter the bootloader then pick its drive.<br/>A micro:bit or ' +
                      'nRF9160 DK just needs plugging in - its drive appears.',
        hint:         'No bootloader drive appears? A debug probe (DAPLink/J-Link) needs its own ' +
                      '"drag-and-drop" mode - check your board\'s guide.',
        capable:      () => hasDirectoryPicker(),
        incapable:    'Cannot write to a drive directly. Try Chrome or Edge.',
    },
    samd: {
        label:        'Select the drive',
        instructions: 'Double-tap the RESET button to enter the bootloader, then pick its drive:',
        hint:         'Already running MicroPython? Open a REPL and run machine.bootloader() first, ' +
                      'then pick the drive that appears.',
        capable:      () => hasDirectoryPicker(),
        incapable:    'Cannot write to a drive directly. Try Chrome or Edge.',
    },
}

/*
 * Erase is its own action, independent of writing firmware - a small button next to
 * Flash (#btn-erase), not a checkbox that used to make Flash itself erase first. Only
 * esp32 (esptool's own erase_flash) and rp2 (no serial erase command exists for it - see
 * eraseRp2Flash) can actually do this; the button is hidden entirely for nrf52.
 */
const ERASE_HINT = {
    esp32: 'This erases the whole flash chip.',
    rp2:   'This erases the whole flash chip using the Pico Universal Flash Nuke tool.',
}

/*
 * Accordion steps: hidden (not reached yet) / collapsed (done - header + one-line recap
 * only) / open (full body). `recap` is left alone when omitted, so toggling a step open
 * again (see the header click handler below) does not blank out what it last said.
 */
function setStep(id, { hidden = false, collapsed = false, recap = null } = {}) {
    const el = QID(id)
    el.classList.toggle('hidden', hidden)
    el.classList.toggle('collapsed', collapsed)
    if (recap !== null) { el.querySelector('.step-recap').textContent = recap }
}

const state = {
    family: null,
    boards: [],
    board:  null,
    port:   null,   // ESP: raw SerialPort
    loader: null,   // ESP: esptool-js ESPLoader, connected
    mcu:    null,   // ESP: detected chip's mcu, if known
    dir:    null,   // drive families: picked directory handle
    hid:    null,   // teensy: picked WebHID device
    dfu:    null,   // stm32dfu, arduino: opened DFU device (see connectDfu)
    w600:   null,   // w600: open serial link (see openW600)
    requested: null, // the build asked for in the URL, { family, board, variant }
    requestedRelease: null,   // the release asked for in the URL, until the user picks one
}

function selectFamily(family) {
    state.family = family
    state.board = null
    state.mcu = null
    state.dir = null
    state.hid = null
    closeEspPort()   // not awaited - switching family must not block the UI on it
    closeDfuDevice()
    closeW600Port()

    for (const btn of QSA('.family-btn')) {
        btn.classList.toggle('selected', btn.dataset.family === family)
    }

    const info = CONNECT_INFO[family]
    QID('connect-instructions').innerHTML = info.instructions
    QID('connect-hint').textContent = info.hint
    QID('btn-connect-label').textContent = info.label
    const capable = info.capable()
    QID('btn-connect').disabled = !capable
    if (!capable) { log(info.incapable) }

    // Hide the whole "Erase flash: [Erase]" line as one unit, not just the button - the
    // label in front of it is no less specific to a family that can erase than the
    // button itself is.
    QID('erase-controls').classList.toggle('hidden', !ERASE_HINT[family])
    QID('btn-erase').title = ERASE_HINT[family] || ''

    setStep('step-family', { collapsed: true, recap: FAMILIES[family].title })
    // The family's own icon, a copy of the one on its card (an <img>, or the <svg> that
    // Font Awesome has swapped its <i> for), in front of the title.
    const icon = QSA('.family-btn').find(btn => btn.dataset.family === family)?.querySelector('img, svg, i')
    if (icon) { QID('step-family').querySelector('.step-recap').prepend(icon.cloneNode(true)) }
    // Nothing to connect with here, but the firmware is still worth having: the connect
    // step is skipped, saying why in its recap, and the choice of file follows with a
    // download button right below it and no Flash step.
    setStep('step-connect', capable ? { hidden: false } : { collapsed: true, recap: info.incapable })
    QID('step-connect').classList.toggle('warning', !capable)
    setStep('step-firmware', { hidden: true })
    setStep('step-flash', { hidden: true })
    setStep('step-done', { hidden: true })
    if (!capable) { showFirmwareStep(loadBoards(family), { canFlash: false }) }
}

async function showFirmwareStep(boards, { autoBoard = null, canFlash = true } = {}) {
    state.boards = boards
    const sel = QID('sel-board')
    sel.innerHTML = ''
    for (const b of boards) {
        const opt = document.createElement('option')
        opt.value = b.id
        opt.textContent = `${b.product} - ${b.vendor} (${b.id})`
        sel.appendChild(opt)
    }
    // A build asked for in the URL (?build=...) beats whatever the connection suggests -
    // but only if it is among the boards on offer: a connected ESP32-S3 is not offered
    // the plain ESP32 builds, and a link must not talk the user into the wrong chip.
    const asked = state.requested && boards.find(b => b.id === state.requested.board.id)
    const preselect = asked || autoBoard || preferredBoard(boards)
    if (preselect) { sel.value = preselect.id }

    onBoardChange()
    if (asked && state.requested.variant) {
        QID('sel-variant').value = state.requested.variant
        updateDownloadLink()
    }
    setStep('step-firmware', { hidden: false })
    // Without a way to flash (this browser cannot connect, or "skip connecting") there is
    // no Flash step at all: a plain download button under the form is all that is left,
    // and the "having trouble downloading" fallback would be the wrong thing to say.
    setStep('step-flash', { hidden: !canFlash })
    QID('download-direct').classList.toggle('hidden', canFlash)
    // A fresh attempt at this step - reconnecting after erasing, or just picking a
    // different board - is not a fresh success yet; step-done only reappears once flash()
    // actually finishes one.
    setStep('step-done', { hidden: true })
    // Fresh attempt, fresh state: hide the fallback again even if a previous board/family
    // had revealed it.
    hideFallback()
}

function hideFallback() {
    QID('fallback-details').classList.add('hidden')
}

/* The manual-download fallback stays out of the page entirely - not collapsible, not
 * user-toggleable - until there is a reason for it: a failed automatic download, or no
 * Flash button at all (the "skip connecting" path above). */
function revealFallback() {
    QID('fallback-details').classList.remove('hidden')
}

function currentBoard() {
    const id = QID('sel-board').value
    return state.boards.find(b => b.id === id) || null
}

function updateBoardImage(board) {
    const img = QID('board-img')
    const file = board && board.images && board.images[0]
    // A plain <img> needs no CORS; without a picture (none listed, or none on the server)
    // a faint chip stands in.
    const placeholder = () => {
        img.classList.add('placeholder')
        img.onerror = null
        img.src = img.dataset.placeholder
    }
    if (!file) { return placeholder() }
    img.classList.remove('placeholder')
    img.onerror = placeholder
    img.src = `https://micropython.org/resources/micropython-media/boards/${encodeURIComponent(board.id)}/${encodeURIComponent(file)}`
}

function onBoardChange() {
    const board = currentBoard()
    updateBoardImage(board)
    const variantSel = QID('sel-variant')
    variantSel.innerHTML = ''
    const variants = (board && board.variants) || {}
    const hasVariants = Object.keys(variants).length > 0
    QID('label-variant').classList.toggle('hidden', !hasVariants)
    variantSel.classList.toggle('hidden', !hasVariants)
    if (hasVariants) {
        const std = document.createElement('option')
        std.value = ''
        std.textContent = 'Standard'
        variantSel.appendChild(std)
        for (const [key, title] of Object.entries(variants)) {
            const opt = document.createElement('option')
            opt.value = key
            opt.textContent = title
            variantSel.appendChild(opt)
        }
    }

    // The versions on offer are the board's own: micropython.org's releases for most,
    // something else for an overlay board. A version already chosen is kept when the
    // newly selected board has it too.
    const relSel = QID('sel-release')
    const chosen = relSel.value
    relSel.innerHTML = ''
    const releases = board ? releasesFor(board.id) : []
    for (const { id, label } of releases) {
        const opt = document.createElement('option')
        opt.value = id
        opt.textContent = label
        relSel.appendChild(opt)
    }
    if (releases.some(r => r.id === chosen)) { relSel.value = chosen }

    // A release asked for in the URL (?release=...) is offered even when it is not one
    // the page knows - micropython.org may well have it - until the user picks one
    // themselves. An overlay board has no versions to choose between, so it is left out.
    if (board && state.requestedRelease && !isOverlayBoard(board.id)) {
        if (!releases.some(r => r.id === state.requestedRelease)) {
            const opt = document.createElement('option')
            opt.value = state.requestedRelease
            opt.textContent = state.requestedRelease
            relSel.appendChild(opt)
        }
        relSel.value = state.requestedRelease
    }

    updateDownloadLink()
}

function updateDownloadLink() {
    const board = currentBoard()
    if (!board) { return }
    const variant = QID('sel-variant').value || null
    const release = QID('sel-release').value
    const ext = extFor(state.family, board.id)
    const link = QID('link-download')
    link.href = firmwareUrl(board.id, variant, release, ext)
    link.textContent = `Download ${firmwareFileName(board.id, variant, release, ext)}`
    const direct = QID('btn-download')
    direct.href = link.href
    QID('btn-download-label').textContent = firmwareFileName(board.id, variant, release, ext)
}

/*
 * Closes whatever ESP connection is currently open (or half-open - a port that failed
 * partway through connecting leaves state.port set without state.loader, same as a
 * fully connected one leaves both). A WebSerial port cannot be opened a second time
 * while still open elsewhere, so this runs before every new connection attempt - the
 * browser's own port picker is happy to hand back the very port this page already has.
 */
async function closeEspPort() {
    if (state.loader) {
        try { await state.loader.transport.disconnect() } catch (_err) { /* already gone */ }
    } else if (state.port) {
        try { await state.port.close() } catch (_err) { /* already closed, or never opened */ }
    }
    state.port = null
    state.loader = null
}

async function connectEsp32() {
    await closeEspPort()
    const serialApi = getSerialApi()
    let port
    try {
        port = await serialApi.requestPort()
    } catch (_err) {
        return   // user cancelled the picker
    }
    // Set as soon as it exists, not only on success: if connectEsp() below throws after
    // having opened the port, the next closeEspPort() still needs to find it here to
    // close it - the alternative is a port this page can never reach again until reload.
    state.port = port
    QID('btn-connect').disabled = true
    log('Connecting...')
    try {
        const { loader, chipName, mcu } = await connectEsp(port, { onLog: (text) => term.write(text) })
        state.loader = loader
        state.mcu = mcu
        log(`Detected chip: ${chipName}`)
        setStep('step-connect', { collapsed: true, recap: chipName })
        const boards = loadBoards('esp32')
        const filtered = mcu ? boards.filter(b => b.mcu === mcu) : boards
        await showFirmwareStep(filtered.length ? filtered : boards)
    } catch (err) {
        report('Cannot connect', err)
    } finally {
        QID('btn-connect').disabled = false
    }
}

// Like closeEspPort(): a serial port this page still holds open cannot be opened again.
async function closeW600Port() {
    const link = state.w600
    state.w600 = null
    if (link) { await closeW600(link) }
}

function askForW600Reset() {
    const msg = 'Push the reset button on the board now...'
    log(msg)
    toastr.info(msg)
}

// The bootloader says nothing about the board around the chip, so there is nothing to
// preselect beyond the generic build.
async function connectW600() {
    await closeW600Port()
    let port
    try {
        port = await getSerialApi().requestPort()
    } catch (_err) {
        return   // user cancelled the picker
    }
    QID('btn-connect').disabled = true
    log('Connecting...')
    try {
        state.w600 = await openW600(port)
        await enterW600Bootloader(state.w600, { onNeedReset: askForW600Reset })
        const mac = await w600Mac(state.w600)
        log(`W600 bootloader is ready${mac ? ` (MAC ${mac})` : ''}.`)
        setStep('step-connect', { collapsed: true, recap: mac ? `W600 (${mac})` : 'W600' })
        await showFirmwareStep(loadBoards('w600'))
    } catch (err) {
        await closeW600Port()
        report('Cannot connect', err)
    } finally {
        QID('btn-connect').disabled = false
    }
}

// INFO_UF2.TXT's Board-ID/Model are not the index's `id` - just a vendor-chosen string -
// so this is a best-effort hint, not a reliable match. The board <select> is always the
// real source of truth; the user confirms (or overrides) whatever this preselects.
function guessDriveBoard(boards, info) {
    if (!info) { return null }
    const text = `${info.model || ''} ${info.boardId || ''}`.toLowerCase()
    if (state.family === 'rp2') {
        if (text.includes('2350')) { return boards.find(b => b.id === 'RPI_PICO2') }
        if (text.includes('rp2')) { return boards.find(b => b.id === 'RPI_PICO') }
    } else if (state.family === 'nrf52') {
        if (text.includes('xiao')) { return boards.find(b => b.id === 'SEEED_XIAO_NRF52') }
        if (text.includes('micro:bit v1')) { return boards.find(b => b.id === 'MICROBIT') }
    } else if (state.family === 'samd') {
        // Model: "Wio Terminal", Board-ID: "SAMD51P19A-WioTerminal-v0" - check both
        // spellings rather than normalizing away the space/hyphen difference for one board.
        if (text.includes('wioterminal') || text.includes('wio terminal')) {
            return boards.find(b => b.id === 'SEEED_WIO_TERMINAL')
        }
    } else if (state.family === 'stm32link') {
        // Unlike the others this is not a guess: the ST-Link drive carries a board code.
        return boards.find(b => b.id === stlinkBoardId(info.boardId)) || null
    }
    return null
}

async function connectDrive() {
    let picked
    try {
        picked = await pickDrive()
    } catch (_err) {
        return   // user cancelled the picker
    }
    // Only micro:bit v1 takes this firmware - a v2 (or any other micro:bit) is refused
    // before the drive is kept, so Flash cannot be reached for it.
    if (picked.info && /^micro:bit/.test(picked.info.model) && picked.info.model !== 'micro:bit v1') {
        const msg = `This is a ${picked.info.model}. MicroPython provides firmware only for the micro:bit v1.`
        log(msg)
        toastr.error(msg)
        // An earlier, valid pick may still have its later steps showing - drop them too,
        // so nothing can flash to the refused drive.
        state.dir = null
        setStep('step-firmware', { hidden: true })
        setStep('step-flash', { hidden: true })
        setStep('step-done', { hidden: true })
        return
    }
    state.dir = picked.dir
    let recap
    if (picked.info && picked.info.model === 'SEGGER J-Link') {
        // A J-Link drive is the same whichever Nordic DK it sits on - the board list
        // below is the only thing that says which one this is.
        log('J-Link drive detected. It does not name its board - check that the Board list matches yours.')
    }
    if (picked.info) {
        recap = picked.info.model || picked.info.boardId || 'Drive selected'
        // Show both when both are known: the model reads better, the Board-ID is the
        // literal string guessDriveBoard() below is about to match against.
        if (picked.info.model && picked.info.boardId) { recap += ` (${picked.info.boardId})` }
        log(`Detected drive: ${picked.info.model || '?'} (${picked.info.boardId || '?'})`)
    } else {
        recap = 'Drive selected'
        log('Drive selected (no INFO_UF2.TXT or DETAILS.TXT found there - this might not be a bootloader drive).')
    }
    const boards = loadBoards(state.family)
    const autoBoard = guessDriveBoard(boards, picked.info)
    if (state.family === 'stm32link') {
        if (autoBoard) {
            recap = autoBoard.product
            log(`Board code ${picked.info.boardId}: ${autoBoard.product}.`)
        } else if (picked.info && picked.info.model === 'ST-Link') {
            log(`Board code ${picked.info.boardId || '?'} is not a board MicroPython publishes firmware for - ` +
                'check that the Board list has yours before flashing.')
        } else {
            log('This does not look like an ST-Link drive - check that the Board list matches your board.')
        }
    }
    setStep('step-connect', { collapsed: true, recap })
    await showFirmwareStep(boards, { autoBoard })
}

// The HalfKay device has no name worth showing - its product id says which Teensy it is,
// and that picks the board the same way guessDriveBoard() does for drives.
async function connectTeensy() {
    let device
    try {
        device = await requestTeensy()
    } catch (_err) {
        return   // user cancelled the picker
    }
    if (!device) { return }
    state.hid = device
    const boards = loadBoards('teensy')
    const board = boards.find(b => b.id === boardIdForProduct(device.productId)) || null
    log(`Detected ${board ? board.product : 'Teensy'} in its bootloader (product id 0x${device.productId.toString(16).padStart(4, '0')}).`)
    setStep('step-connect', { collapsed: true, recap: board ? board.product : 'Board selected' })
    await showFirmwareStep(boards, { autoBoard: board })
}

// Like closeEspPort(): a USB device this page still holds open cannot be opened again.
async function closeDfuDevice() {
    const device = state.dfu
    state.dfu = null
    if (device) { await closeDfu(device) }
}

// The families flashed through a USB DFU bootloader, and which devices to ask the
// browser for (see flasher/dfu.js).
const DFU_FILTERS_BY_FAMILY = {
    stm32dfu: DFU_FILTERS,
    arduino:  ARDUINO_BOOTLOADERS.map(({ vendorId, productId }) => ({ vendorId, productId })),
}

async function connectUsbDfu() {
    const family = state.family
    await closeDfuDevice()
    let usbDevice
    try {
        usbDevice = await requestDfuDevice(DFU_FILTERS_BY_FAMILY[family])
    } catch (_err) {
        return   // user cancelled the picker
    }
    QID('btn-connect').disabled = true
    try {
        // An Arduino bootloader's USB id says which board it is, and with that which
        // flavour of DFU it speaks. The ST bootloader is DfuSe, and the same on every board.
        const arduino = family === 'arduino' ? arduinoBootloader(usbDevice.vendorId, usbDevice.productId) : null
        if (family === 'arduino' && !arduino) { throw new Error('This is not an Arduino bootloader this page knows') }
        state.dfu = await connectDfu(usbDevice, { dfuse: arduino ? arduino.dfuse : true })
        let boards = loadBoards(family)
        let name = usbDevice.productName || 'STM32 bootloader'
        if (arduino) {
            // Only that one board's firmware is offered: the others would be the wrong
            // chip or the wrong pinout.
            boards = boards.filter(b => b.id === arduino.board)
            name = boards[0].product
            log(`Connected to the ${name} bootloader.`)
        } else {
            log(`Connected to ${name} (${dfuMemoryName(state.dfu) || 'flash'}).`)
            log('The bootloader does not name its board - check that the Board list matches yours.')
        }
        setStep('step-connect', { collapsed: true, recap: name })
        await showFirmwareStep(boards)
    } catch (err) {
        report('Cannot connect', err)
    } finally {
        QID('btn-connect').disabled = false
    }
}

async function connect() {
    if (state.family === 'esp32') {
        await connectEsp32()
    } else if (state.family === 'w600') {
        await connectW600()
    } else if (state.family === 'teensy') {
        await connectTeensy()
    } else if (DFU_FILTERS_BY_FAMILY[state.family]) {
        await connectUsbDfu()
    } else {
        await connectDrive()
    }
}

async function loadFirmwareBytes(board, variant, release, ext) {
    const localFile = QID('file-local').files[0]
    if (localFile) {
        log(`Using local file ${localFile.name} (${sizeFmt(localFile.size)})`)
        return new Uint8Array(await localFile.arrayBuffer())
    }
    log('Downloading firmware...')
    const data = new Uint8Array(await fetchArrayBuffer(firmwareFetchUrl(board.id, variant, release, ext)))
    log(`Downloaded ${sizeFmt(data.length)}`)
    return data
}

/*
 * Puts the Flash button into its busy look for the duration of `fn` - disabled, and
 * doubling as its own progress bar (a fill behind its own label/icon, see #btn-flash in
 * flasher.css): `--progress` for a real byte count, or a moving stripe (.indeterminate)
 * when there is no midpoint to report. Restored afterwards regardless of outcome.
 */
async function withFlashButton(indeterminate, fn) {
    const btn = QID('btn-flash')
    const label = QID('btn-flash-label')
    btn.disabled = true
    btn.classList.add('flashing')
    btn.classList.toggle('indeterminate', indeterminate)
    btn.style.setProperty('--progress', '0%')
    try {
        await fn(btn, label)
    } finally {
        btn.disabled = false
        btn.classList.remove('flashing', 'indeterminate')
        label.textContent = 'Flash'
    }
}

/*
 * RP2 has no serial "erase flash" reachable from the drive method - only a UF2 that
 * erases the chip itself (nukeUf2Url() - vendored, see firmware.js). The board reboots
 * back into the bootloader once it is done; in testing, the same directory handle
 * (state.dir) is still good for the real firmware afterwards - no need to send the user
 * back to "Select the drive" and make them pick it again.
 */
async function eraseRp2Flash() {
    const data = new Uint8Array(await fetchArrayBuffer(nukeUf2Url()))
    await writeFileToDrive(state.dir, 'universal_flash_nuke.uf2', data)
    log('Erased. The board reboots back into the bootloader - click Flash once it has.')
}

/* Erasing is destructive and, unlike flashing, has no "it's fine, just flash it again"
 * undo - confirm before either path actually touches the board. */
async function eraseFlash() {
    if (!confirm(`${ERASE_HINT[state.family]}\n\nThe operation cannot be undone.`)) { return }
    const btn = QID('btn-erase')
    const label = QID('btn-erase-label')
    btn.disabled = true
    label.textContent = 'Erasing...'
    try {
        if (state.family === 'esp32') {
            await eraseEsp(state.loader)
            log('Flash erased.')
        } else {
            await eraseRp2Flash()
        }
        toastr.success('Erase done')
    } catch (err) {
        report('Erase failed', err)
    } finally {
        btn.disabled = false
        label.textContent = 'Erase'
    }
}

async function flash() {
    const board = currentBoard()
    if (!board) { return }

    const variant = QID('sel-variant').value || null
    const release = QID('sel-release').value
    const ext = extFor(state.family, board.id)

    // Only the families that can report a page/byte count get a filling progress bar; the
    // rest show the moving stripe.
    const reportsProgress = ['esp32', 'w600', 'teensy', 'stm32dfu', 'arduino'].includes(state.family)
    await withFlashButton(!reportsProgress, async (btn, label) => {
        let data
        try {
            label.textContent = 'Downloading...'
            data = await loadFirmwareBytes(board, variant, release, ext)
        } catch (err) {
            report('Download failed', err)
            log('Automatic download failed (the CORS proxy may be unavailable).')
            revealFallback()
            return
        }

        const onProgress = (written, total) => {
            const pct = Math.round(written / total * 100)
            btn.style.setProperty('--progress', `${pct}%`)
            label.textContent = `Flashing... ${pct}%`
        }

        try {
            if (state.family === 'esp32') {
                label.textContent = 'Flashing...'
                if (!state.loader) { throw new Error('The serial port is closed - connect the board again.') }
                await flashEsp(state.loader, data, flashOffsetFor(board), { onProgress })
                // The board has been reset into the firmware; give the port back, so
                // ViperIDE or another tool can open it. Flashing again starts from Connect.
                await closeEspPort()
                log('Done! The board has been reset into the new firmware and the port is closed.')
            } else if (state.family === 'w600') {
                if (!state.w600) { throw new Error('The serial port is closed - connect the board again.') }
                label.textContent = 'Preparing...'
                await flashW600(state.w600, data, { onProgress, onLog: log, onNeedReset: askForW600Reset })
                // Flashing ends with the board reset and the port closed, so flashing
                // again starts from Connect.
                state.w600 = null
                log('Done! The board has been reset into the new firmware and the port is closed - ' +
                    'push its reset button if it has not started.')
                // Not every board wires the reset line, so the automatic reset above may
                // have done nothing - say so, where it will be seen.
                toastr.info('If the board does not start, push its reset button.')
            } else if (state.family === 'teensy') {
                label.textContent = 'Flashing...'
                await flashTeensy(state.hid, data, { onProgress, onLog: log })
                log('Done! The board is rebooting into the new firmware.')
            } else if (DFU_FILTERS_BY_FAMILY[state.family]) {
                if (!state.dfu) { throw new Error('The board has left its bootloader - connect it again.') }
                label.textContent = 'Flashing...'
                if (state.dfu.dfuse) {
                    await flashDfu(state.dfu, data, {
                        onProgress,
                        onErase: () => { label.textContent = 'Erasing...' },
                        onLog: log,
                        leaveAtFirmware: state.family === 'arduino',
                    })
                } else {
                    await flashDfuBin(state.dfu, data, { onProgress, onLog: log })
                }
                // Flashing ends with the board leaving the bootloader, so this USB device
                // is gone; flashing again starts from Connect.
                state.dfu = null
                log('Done! The board is rebooting into the new firmware.')
            } else {
                label.textContent = 'Writing...'
                let filename = firmwareFileName(board.id, variant, release, ext)
                if (state.family === 'stm32link') {
                    // The .hex does not fit on the ST-Link drive; the same firmware as a
                    // .bin does. See flasher/hex.js.
                    const bin = stlinkBin(data)
                    data = bin.data
                    filename = filename.replace(/\.hex$/, '.bin')
                    log(`Converted the .hex to a ${sizeFmt(data.length)} .bin for the ST-Link drive.`)
                    // Destructive in a way a plain reflash is not, so it is asked, like
                    // Erase - and only now, since it takes the downloaded file to know.
                    if (bin.regions > 1 && !confirm(
                        'This firmware leaves a gap for the board\'s internal filesystem. ' +
                        'Writing it through the ST-Link drive erases the files stored there.\n\n' +
                        'The operation cannot be undone. Continue?')) {
                        log('Flashing cancelled - nothing was written.')
                        return
                    }
                }
                await writeFileToDrive(state.dir, filename, data)
                log(`Wrote ${filename} to the drive. The board should reboot into the new firmware shortly.`)
            }
            toastr.success('Flashed successfully')
            setStep('step-flash', { collapsed: true, recap: 'Done' })
            setStep('step-done', { hidden: false })
        } catch (err) {
            report('Flash failed', err)
        }
    })
}

QID('btn-log-toggle').addEventListener('click', openLogDrawer)
QID('btn-log-close').addEventListener('click', () => QID('log-drawer').classList.remove('open'))

for (const btn of QSA('.family-btn')) {
    btn.addEventListener('click', () => selectFamily(btn.dataset.family))
}
QID('btn-connect').addEventListener('click', connect)
QID('btn-flash').addEventListener('click', flash)
QID('btn-erase').addEventListener('click', eraseFlash)
QID('sel-board').addEventListener('change', onBoardChange)
QID('sel-variant').addEventListener('change', updateDownloadLink)
QID('sel-release').addEventListener('change', () => {
    state.requestedRelease = null   // the user's own choice from here on
    updateDownloadLink()
})
QID('link-manual').addEventListener('click', async (ev) => {
    ev.preventDefault()
    if (!state.family) { return }
    setStep('step-connect', { collapsed: true, recap: 'Skipped' })
    await showFirmwareStep(loadBoards(state.family), { canFlash: false })
})

/*
 * ?build=ESP32_GENERIC_S3 (or a board id with a variant, ESP32_GENERIC-SPIRAM_OCT, as
 * sys.implementation._build reports it): skips the family step by selecting the family
 * that board belongs to, and has the firmware step open on that board. Connecting is
 * still the user's to do - the browser only lets a page ask for a device on a click.
 */
const urlParams = new URLSearchParams(window.location.search)
const requestedBuild = urlParams.get('build')

// ?release=20260824-v1.29.0: the release is used as given, known or not. It ends up in a
// file name in a URL, so only what a release name is made of is accepted.
const requestedRelease = (urlParams.get('release') || '').trim()
if (requestedRelease) {
    if (/^[\w.-]+$/.test(requestedRelease)) {
        state.requestedRelease = requestedRelease
    } else {
        log(`Ignoring the release in the URL: ${requestedRelease}`)
        toastr.warning(`Invalid release "${requestedRelease}"`)
    }
}

if (requestedBuild) {
    state.requested = findBuild(requestedBuild)
    if (state.requested) {
        log(`Build ${requestedBuild} requested: ${state.requested.board.product} (${FAMILIES[state.requested.family].title}).`)
        selectFamily(state.requested.family)
    } else {
        log(`Unknown build in the URL: ${requestedBuild}`)
        toastr.warning(`Unknown build "${requestedBuild}"`)
    }
}

// Collapsed or not, any step can be opened back up by its own header - the way back
// to change an earlier choice. Forward progress (the setStep calls above) is what rolls
// a finished step up in the first place; this only ever opens, never closes, a step.
for (const header of QSA('.step-header')) {
    header.addEventListener('click', () => {
        header.closest('.step').classList.remove('collapsed')
    })
}
