/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Writing a MicroPython .bin to a Teensy 4.0 / 4.1 over WebHID, talking to the PJRC
 * HalfKay bootloader directly. The board is in that bootloader whenever its PROGRAM
 * button has been pressed (it then shows up as VID 0x16C0, PID 0x0478 / 0x0479 instead
 * of a serial port).
 *
 * HalfKay wire format, as used here:
 *   - One 1024-byte flash page goes in one 1088-byte output report (report ID 0).
 *   - Bytes 0-2 of the report: the page's address, little-endian, as an offset from the
 *     start of flash (0x60000000 on the i.MX RT, so the first page is offset 0).
 *   - Bytes 3-63 are unused; the page data starts at byte 64.
 *   - Address bytes 0xFF 0xFF 0xFF end the session: the board reboots into the firmware.
 *
 * Only the .bin image is handled. The Teensy .hex/.ehex split (main flash + RAM loader)
 * is not needed for a plain MicroPython build.
 */

const PAGE_SIZE = 1024
const HEADER_SIZE = 64
const REPORT_SIZE = HEADER_SIZE + PAGE_SIZE
const SEND_RETRIES = 5
// The first page write makes the bootloader erase, which takes a while; the device stops
// answering until it is done. Later pages only need a small gap between reports.
const ERASE_DELAY_MS = 1500
const PAGE_DELAY_MS = 5

const BOARD_ID_BY_PRODUCT = {
    0x0478: 'TEENSY40',
    0x0479: 'TEENSY41',
}

export const TEENSY_FILTERS = Object.keys(BOARD_ID_BY_PRODUCT).map(productId => ({
    vendorId: 0x16c0,
    productId: Number(productId),
}))

export function hasHidApi() {
    return typeof navigator !== 'undefined' && typeof navigator.hid !== 'undefined'
}

// The bundled board id ('TEENSY40' / 'TEENSY41') for a HalfKay device's USB product id,
// or null for anything else.
export function boardIdForProduct(productId) {
    return BOARD_ID_BY_PRODUCT[productId] || null
}

/*
 * Splits a .bin into 1024-byte pages, each tagged with its offset from the start of
 * flash. The last page is padded with 0xFF. Pages that are entirely 0xFF are skipped,
 * except the first one: an erased flash already reads 0xFF there, and the first write is
 * what triggers the bootloader's erase.
 */
export function teensyPages(data) {
    const pages = []
    for (let offset = 0; offset < data.length; offset += PAGE_SIZE) {
        const page = new Uint8Array(PAGE_SIZE)
        page.fill(0xff)
        page.set(data.subarray(offset, offset + PAGE_SIZE))
        if (pages.length > 0 && page.every(b => b === 0xff)) { continue }
        pages.push({ address: offset, data: page })
    }
    return pages
}

export function teensyPageReport(address, page) {
    const report = new Uint8Array(REPORT_SIZE)
    report[0] = address & 0xff
    report[1] = (address >> 8) & 0xff
    report[2] = (address >> 16) & 0xff
    report.set(page, HEADER_SIZE)
    return report
}

export function teensyRebootReport() {
    const report = new Uint8Array(REPORT_SIZE)
    report.fill(0xff, 0, 3)
    return report
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendWithRetries(device, report) {
    let lastErr
    for (let attempt = 0; attempt < SEND_RETRIES; attempt++) {
        try {
            await device.sendReport(0, report)
            return
        } catch (err) {
            lastErr = err
            await sleep(100)
        }
    }
    throw lastErr
}

// The page picker: returns the chosen HIDDevice, or null if the user cancelled.
export async function requestTeensy() {
    const devices = await navigator.hid.requestDevice({ filters: TEENSY_FILTERS })
    return devices[0] || null
}

/*
 * Writes `data` (a .bin) to the board behind `device`, then reboots it into the new
 * firmware. `onProgress(done, total)` is called after each page is accepted.
 */
export async function flashTeensy(device, data, { onProgress = () => {}, onLog = () => {} } = {}) {
    const pages = teensyPages(data)
    if (!device.opened) { await device.open() }
    try {
        for (let i = 0; i < pages.length; i++) {
            const { address, data: page } = pages[i]
            await sendWithRetries(device, teensyPageReport(address, page))
            onProgress(i + 1, pages.length)
            await sleep(i === 0 ? ERASE_DELAY_MS : PAGE_DELAY_MS)
        }
        onLog(`Wrote ${pages.length} pages. Rebooting the board...`)
        // The board reboots on this report and may drop the HID link before the OS
        // reports the write as complete, so a failure here is not an error.
        try {
            await device.sendReport(0, teensyRebootReport())
        } catch (_err) {
            // Already rebooting.
        }
    } finally {
        await device.close().catch(() => {})
    }
}
