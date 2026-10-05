/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Writing a MicroPython .dfu to an STM32 over WebUSB, through the ST DFU bootloader in
 * the chip's ROM (or mboot on the Pyboard D) - what `dfu-util --alt 0 -D firmware.dfu`
 * and MicroPython's own tools/pydfu.py do. The board is in that bootloader after
 * machine.bootloader(), or a reset with BOOT0 high; it then shows up as VID 0x0483,
 * PID 0xDF11.
 *
 * The USB side (DFU requests, the DfuSe memory map, sector erase, block download) is the
 * `webdfu` package. Two things it does not do are here:
 *
 *   - Reading the .dfu file. It is a DfuSe container, not a raw image:
 *       prefix   "DfuSe", version 1, image size (everything but the suffix), target count
 *       target   "Target", alternate setting, name, size, element count      (274 bytes)
 *       element  address, size, then that many bytes
 *       suffix   device/product/vendor ids, DFU version, "UFD", length 16, CRC  (16 bytes)
 *     An F4/F7 build has two elements (0x08000000 and 0x08020000) with the board's
 *     internal filesystem in the gap between them, which is why only the sectors under
 *     each element are erased.
 *
 *   - Leaving the bootloader once, after the last element. webdfu's own "manifest" jumps
 *     to the start of whichever element it has just written, which is only right for a
 *     single-element file. pydfu.py's exit is used instead: set the address pointer to the
 *     start of flash, send a zero-length download, read the status.
 *
 * Arduino's bootloader on its STM32H7 boards (Portenta H7, Giga, Nicla Vision, Opta) is
 * built on ST's own DFU class, so it is the same DfuSe protocol under Arduino's USB ids;
 * the only difference is that the firmware lives at 0x08040000, after the bootloader,
 * and that is where Arduino's own upload leaves from (`leaveAtFirmware` below).
 *
 * The Arduino Portenta C33 is here too, and is the simpler case: its bootloader (VID
 * 0x2341, PID 0x0368, after a double-tap on reset) speaks plain DFU 1.1, the way
 * `dfu-util -a 0 -d 2341:0368 -D firmware.bin` uses it. The .bin is sent as it is, in
 * blocks numbered from 0; the bootloader works out the flash address from the block
 * number and its own (small, 64-byte) transfer size, and erases as it goes. It stays in
 * the bootloader afterwards until it gets a DFU detach request, which makes it reset
 * into the new firmware. See flashDfuBin().
 */

import webdfu from 'webdfu'

const { DFU, DFUse } = webdfu

const PREFIX_SIZE = 11
const TARGET_PREFIX_SIZE = 274
const ELEMENT_PREFIX_SIZE = 8
const SUFFIX_SIZE = 16

const FLASH_START = 0x08000000
// What pydfu.py uses, and what the ROM bootloader reports; only a fallback for a device
// whose functional descriptor cannot be read.
const DEFAULT_TRANSFER_SIZE = 2048

export const DFU_FILTERS = [{ vendorId: 0x0483, productId: 0xdf11 }]

export function hasUsbApi() {
    return typeof navigator !== 'undefined' && typeof navigator.usb !== 'undefined'
}

let crcTable = null

// The DFU suffix CRC: a standard CRC-32 without the final inversion, over every byte of
// the file except the CRC itself.
export function dfuCrc(bytes) {
    if (!crcTable) {
        crcTable = new Uint32Array(256)
        for (let n = 0; n < 256; n++) {
            let c = n
            for (let k = 0; k < 8; k++) { c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1) }
            crcTable[n] = c
        }
    }
    let crc = 0xffffffff
    for (let i = 0; i < bytes.length; i++) {
        crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
    }
    return crc >>> 0
}

function ascii(bytes, start, length) {
    return String.fromCharCode(...bytes.subarray(start, start + length))
}

/*
 * Returns the file's elements as [{ address, data }], in file order. Throws on anything
 * that is not a complete, intact DfuSe file - the local-file fallback lets the user pick
 * any file at all, and a truncated download must not be written either.
 */
export function parseDfuFile(bytes) {
    if (bytes.length < PREFIX_SIZE + SUFFIX_SIZE || ascii(bytes, 0, 5) !== 'DfuSe') {
        throw new Error('Not a DfuSe (.dfu) firmware file')
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes[5] !== 1) {
        throw new Error(`Unsupported .dfu file version ${bytes[5]}`)
    }
    const imageSize = view.getUint32(6, true)
    if (imageSize !== bytes.length - SUFFIX_SIZE) {
        throw new Error('The .dfu file is truncated or has trailing data')
    }
    const suffix = bytes.length - SUFFIX_SIZE
    if (ascii(bytes, suffix + 8, 3) !== 'UFD' || bytes[suffix + 11] !== SUFFIX_SIZE) {
        throw new Error('The .dfu file has no valid DFU suffix')
    }
    if (dfuCrc(bytes.subarray(0, bytes.length - 4)) !== view.getUint32(bytes.length - 4, true)) {
        throw new Error('The .dfu file is corrupted (CRC mismatch)')
    }

    const elements = []
    let pos = PREFIX_SIZE
    for (let t = 0; t < bytes[10]; t++) {
        if (pos + TARGET_PREFIX_SIZE > suffix || ascii(bytes, pos, 6) !== 'Target') {
            throw new Error('The .dfu file has a malformed target')
        }
        const count = view.getUint32(pos + 270, true)
        pos += TARGET_PREFIX_SIZE
        for (let e = 0; e < count; e++) {
            if (pos + ELEMENT_PREFIX_SIZE > suffix) {
                throw new Error('The .dfu file has a malformed element')
            }
            const address = view.getUint32(pos, true)
            const size = view.getUint32(pos + 4, true)
            pos += ELEMENT_PREFIX_SIZE
            if (pos + size > suffix) {
                throw new Error('The .dfu file has a malformed element')
            }
            elements.push({ address, data: bytes.subarray(pos, pos + size) })
            pos += size
        }
    }
    if (elements.length === 0) {
        throw new Error('The .dfu file contains no firmware')
    }
    return elements
}

// webdfu rejects with plain strings in places; everything that leaves this module is an
// Error, so report() has a message to show.
function asError(err) {
    return err instanceof Error ? err : new Error(String(err))
}

// The page picker, for the ST bootloader unless told otherwise. Rejects if the user
// cancels it.
export function requestDfuDevice(filters = DFU_FILTERS) {
    return navigator.usb.requestDevice({ filters })
}

// The transfer size from the bootloader's DFU functional descriptor, or null.
async function readTransferSize(device) {
    try {
        const config = DFU.parseConfigurationDescriptor(await device.readConfigurationDescriptor(0))
        const functional = config.descriptors.find(d => d.bDescriptorType === 0x21 && d.wTransferSize)
        return functional ? functional.wTransferSize : null
    } catch (_err) {
        return null
    }
}

/*
 * Opens the bootloader's flash interface (alternate setting 0, the one `dfu-util --alt 0`
 * selects) and returns it ready for flashDfu() - or, with `dfuse: false`, for
 * flashDfuBin(). Opening is done here, at connect time, so a missing driver shows up
 * before the user has chosen a firmware.
 */
export async function connectDfu(usbDevice, { dfuse = true } = {}) {
    const settings = DFU.findDeviceDfuInterfaces(usbDevice).find(s => s.alternate.alternateSetting === 0)
    if (!settings) {
        throw new Error('This device has no DFU interface')
    }
    let device
    try {
        await usbDevice.open()
        // Chrome does not always fill in the interface name, and for DfuSe it is not a
        // label: it is the memory map ("@Internal Flash /0x08000000/04*016Kg,...") that
        // says which sectors exist and which may be erased.
        if (dfuse && !settings.name) {
            if (usbDevice.configuration === null) { await usbDevice.selectConfiguration(1) }
            const names = await new DFU.Device(usbDevice, settings).readInterfaceNames()
            settings.name = names[settings.configuration.configurationValue][settings.interface.interfaceNumber][0]
        }
        device = dfuse ? new DFUse.Device(usbDevice, settings) : new DFU.Device(usbDevice, settings)
        await device.open()
    } catch (err) {
        try { await usbDevice.close() } catch (_err) { /* never opened */ }
        throw new Error(`Cannot open the bootloader's USB interface (${asError(err).message}). ` +
            'On Windows it needs a WinUSB driver for this device, which Zadig can install' +
            (dfuse ? ' (STM32CubeProgrammer brings one too).' : '.'),
            { cause: err })
    }
    device.logDebug = () => {}
    device.dfuse = dfuse
    device.transferSize = await readTransferSize(device)
    if (dfuse && (!device.memoryInfo || device.memoryInfo.segments.length === 0)) {
        await closeDfu(device)
        throw new Error('The bootloader did not report its flash layout')
    }
    // Plain DFU has no addresses: where a block lands is its number times this size, so
    // there is no safe value to assume when the bootloader does not state one.
    if (!dfuse && !device.transferSize) {
        await closeDfu(device)
        throw new Error('The bootloader did not report its transfer size')
    }
    if (!device.transferSize) { device.transferSize = DEFAULT_TRANSFER_SIZE }
    return device
}

export async function closeDfu(device) {
    try { await device.device_.close() } catch (_err) { /* already gone */ }
}

// The name of the memory the bootloader offers, e.g. "Internal Flash".
export function dfuMemoryName(device) {
    return (device.memoryInfo && device.memoryInfo.name) || null
}

/*
 * Writes a .dfu file's elements to the board behind `device` (from connectDfu), then
 * makes it leave the bootloader. `onErase()` is called while sectors are being erased,
 * `onProgress(written, total)` as the bytes of all elements together go out.
 *
 * The leave request carries an address. The ST ROM jumps to it, and gets the start of
 * flash, as pydfu.py does. With `leaveAtFirmware` it is the lowest address the file
 * writes to instead, which is what Arduino's upload sends to its bootloader (that one
 * resets whatever the address is).
 */
export async function flashDfu(device, bytes, {
    onProgress = () => {}, onErase = () => {}, onLog = () => {}, leaveAtFirmware = false,
} = {}) {
    if (!device.dfuse) { throw new Error('This bootloader does not take a .dfu file') }
    const elements = parseDfuFile(bytes)
    const total = elements.reduce((sum, el) => sum + el.data.length, 0)
    let writtenBefore = 0
    let erasing = false

    // webdfu reports erase and write progress through the same callback; its own log
    // lines are what tell the two apart.
    device.logInfo = (msg) => {
        if (/^Erasing/.test(msg)) { erasing = true }
        if (/^Copying/.test(msg)) { erasing = false }
    }
    device.logWarning = onLog
    device.logError = onLog
    device.logProgress = (done) => {
        if (erasing) { onErase() } else { onProgress(writtenBefore + done, total) }
    }

    try {
        const status = await device.getStatus()
        if (status.state === DFU.dfuERROR) {
            await device.clearStatus()
        } else if (status.state !== DFU.dfuIDLE) {
            await device.abortToIdle()
        }

        for (const { address, data } of elements) {
            onLog(`Writing ${data.length} bytes at 0x${address.toString(16).padStart(8, '0')}`)
            device.startAddress = address
            await device.do_download(device.transferSize, data, false)
            writtenBefore += data.length
        }
        const leaveAddress = leaveAtFirmware ? Math.min(...elements.map(el => el.address)) : FLASH_START
        await device.dfuseCommand(DFUse.SET_ADDRESS, leaveAddress, 4)
        await device.download(new ArrayBuffer(0), 0)
    } catch (err) {
        throw asError(err)
    }
    // Reading the status is what makes the bootloader act on the zero-length download.
    // It resets instead of answering, so a failure here is the expected ending.
    try {
        await device.getStatus()
    } catch (_err) {
        // Already rebooting.
    }
    await closeDfu(device)
}

const POLL_DEADLINE_MS = 30000

/*
 * Reads the DFU status until `done(state)` or an error state, waiting only as long as
 * the bootloader asks to. webdfu's own poll always goes through a timer, even for a
 * wait of zero; with the thousands of small blocks a plain-DFU image takes, a browser
 * that slows timers down in a background tab would stretch a flash from seconds to hours.
 */
async function pollStatus(device, done) {
    const deadline = Date.now() + POLL_DEADLINE_MS
    for (;;) {
        const status = await device.getStatus()
        if (done(status.state) || status.state === DFU.dfuERROR) { return status }
        if (Date.now() > deadline) { throw new Error('The bootloader stopped responding') }
        if (status.pollTimeout > 0) { await new Promise(resolve => setTimeout(resolve, status.pollTimeout)) }
    }
}

/*
 * Writes a raw .bin through a plain DFU 1.1 bootloader (connectDfu with `dfuse: false`):
 * the blocks in order, a zero-length one to end the download, a wait for the bootloader
 * to finish writing, then a detach request so it resets into the firmware.
 * `onProgress(written, total)` is called after each block is accepted.
 */
export async function flashDfuBin(device, bytes, { onProgress = () => {}, onLog = () => {} } = {}) {
    if (device.dfuse) { throw new Error('This bootloader takes a .dfu file, not a raw image') }
    if (bytes.length === 0) { throw new Error('The firmware file is empty') }
    const size = device.transferSize
    // The block number is a 16-bit field of the request.
    if (Math.ceil(bytes.length / size) > 0xffff) {
        throw new Error('The firmware file is too large for this bootloader')
    }
    const failed = (what, status) => new Error(`${what} failed (DFU state ${status.state}, status ${status.status})`)

    try {
        const status = await device.getStatus()
        if (status.state === DFU.dfuERROR) {
            await device.clearStatus()
        } else if (status.state !== DFU.dfuIDLE) {
            await device.abortToIdle()
        }

        onLog(`Writing ${bytes.length} bytes in ${size}-byte blocks`)
        let block = 0
        for (let sent = 0; sent < bytes.length; sent += size, block++) {
            await device.download(bytes.slice(sent, sent + size), block)
            const st = await pollStatus(device, s => s === DFU.dfuDNLOAD_IDLE)
            if (st.state !== DFU.dfuDNLOAD_IDLE || st.status !== DFU.STATUS_OK) { throw failed('Download', st) }
            onProgress(Math.min(sent + size, bytes.length), bytes.length)
        }
        await device.download(new ArrayBuffer(0), block)
        const st = await pollStatus(device, s => s === DFU.dfuIDLE || s === DFU.dfuMANIFEST_WAIT_RESET)
        if (st.state === DFU.dfuERROR || st.status !== DFU.STATUS_OK) { throw failed('Finishing the download', st) }
    } catch (err) {
        throw asError(err)
    }
    // The bootloader resets on this request and may not answer it.
    try {
        await device.detach()
    } catch (_err) {
        // Already rebooting.
    }
    await closeDfu(device)
}
