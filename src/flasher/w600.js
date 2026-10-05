/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Writing a .fls image to a WinnerMicro W600 over WebSerial - what w600tool.py does:
 *
 *   1. Reset the chip (a pulse on RTS, where the board wires it to reset) and send ESC
 *      until the bootloader answers with a run of 'C' characters: it is then waiting
 *      for an XMODEM transfer.
 *   2. Erase the secondary bootloader ("secboot"). A .fls holds secboot and the firmware
 *      together, and only the ROM bootloader underneath accepts one; with secboot gone
 *      the chip restarts into that ROM bootloader.
 *   3. Send the file with XMODEM-1K (1024-byte blocks, CRC-16).
 *   4. Reset again to start the firmware, and close the port.
 *
 * Commands to the bootloader are framed as 0x21, a 16-bit length (of the checksum plus
 * the payload), a CRC-16 of the payload, then the payload, whose first four bytes are
 * the command code. All integers are little-endian.
 *
 * The speed stays at 115200 baud for the whole transfer, where w600tool.py switches to
 * 1 Mbaud: that needs the port closed and reopened, which is the unreliable part on
 * cheap USB-serial adapters (flasher/esp.js makes the same choice). An image of about
 * 750 KB takes a little over a minute this way.
 */

const BAUD_RATE = 115200

const CMD_GET_MAC = 0x38
const CMD_GET_QFID = 0x3c        // answered by the ROM bootloader only
const CMD_ERASE_SECBOOT = 0x3f

const ESC = 0x1b
const STX = 0x02                 // start of a 1024-byte XMODEM block
const EOT = 0x04
const ACK = 0x06
const NAK = 0x15
const CAN = 0x18
const XMODEM_BLOCK = 1024
const XMODEM_PAD = 0x1a
const XMODEM_RETRIES = 10

// Every W600 image header starts with this; a .fls has one at the very start and a
// second one, secboot's own, right after its 56-byte header.
const FLS_MAGIC = [0x9f, 0xff, 0xff, 0xa0]
const FLS_SECBOOT_HEADER = 56

// CRC-16 with the CCITT polynomial. The command frames start it from 0xFFFF
// (CRC-16/CCITT-FALSE), XMODEM from 0.
export function crc16(data, crc = 0xffff) {
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i] << 8
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
        }
        crc &= 0xffff
    }
    return crc
}

// A bootloader command frame for `code`, with optional payload bytes after it.
export function w600Command(code, extra = []) {
    const payload = [code & 0xff, (code >> 8) & 0xff, (code >> 16) & 0xff, (code >>> 24) & 0xff, ...extra]
    const length = payload.length + 2
    const crc = crc16(payload)
    return new Uint8Array([0x21, length & 0xff, length >> 8, crc & 0xff, crc >> 8, ...payload])
}

// One XMODEM-1K block: STX, the block number and its complement, 1024 bytes of data
// (the last block padded with 0x1A), and their CRC-16, high byte first.
export function xmodemPacket(seq, chunk) {
    const packet = new Uint8Array(3 + XMODEM_BLOCK + 2)
    packet[0] = STX
    packet[1] = seq & 0xff
    packet[2] = 0xff - (seq & 0xff)
    packet.fill(XMODEM_PAD, 3, 3 + XMODEM_BLOCK)
    packet.set(chunk, 3)
    const crc = crc16(packet.subarray(3, 3 + XMODEM_BLOCK), 0)
    packet[3 + XMODEM_BLOCK] = crc >> 8
    packet[4 + XMODEM_BLOCK] = crc & 0xff
    return packet
}

export function isW600Fls(bytes) {
    const magicAt = (pos) => FLS_MAGIC.every((b, i) => bytes[pos + i] === b)
    return bytes.length > FLS_SECBOOT_HEADER + FLS_MAGIC.length && magicAt(0) && magicAt(FLS_SECBOOT_HEADER)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/*
 * The serial port with what the protocol needs on top: everything received is
 * collected in `rx` by a reader running in the background, so a reply can be waited
 * for with a timeout, and thrown away (flushInput) before asking the next question.
 */
class W600Link {
    constructor(port) {
        this.port = port
        this.rx = []
        this.wake = null
    }

    async open() {
        await this.port.open({ baudRate: BAUD_RATE })
        this.writer = this.port.writable.getWriter()
        this.reader = this.port.readable.getReader()
        this.pump = (async () => {
            try {
                for (;;) {
                    const { value, done } = await this.reader.read()
                    if (done) { break }
                    for (const b of value) { this.rx.push(b) }
                    if (this.wake) { this.wake() }
                }
            } catch (_err) {
                // The port went away; whoever is waiting for a reply times out.
            }
        })()
    }

    async close() {
        try { await this.reader.cancel() } catch (_err) { /* already closed */ }
        await this.pump
        try { this.reader.releaseLock() } catch (_err) { /* already released */ }
        try { this.writer.releaseLock() } catch (_err) { /* already released */ }
        try { await this.port.close() } catch (_err) { /* already closed */ }
    }

    write(bytes) {
        return this.writer.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    }

    flushInput() {
        this.rx.length = 0
    }

    // Resolves when something arrives, or after `ms` at the latest.
    waitData(ms) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => { this.wake = null; resolve() }, ms)
            this.wake = () => { clearTimeout(timer); this.wake = null; resolve() }
        })
    }

    // Waits until `find(rx)` returns something other than null, and returns it; null if
    // `ms` pass first.
    async waitFor(find, ms) {
        const deadline = Date.now() + ms
        for (;;) {
            const found = find(this.rx)
            if (found !== null) { return found }
            const left = deadline - Date.now()
            if (left <= 0) { return null }
            await this.waitData(left)
        }
    }

    // Pulses reset through RTS, as w600tool.py does. Not every board wires it, and not
    // every adapter has the line, so a failure here just means "push the button".
    // DTR is held asserted, the way pyserial leaves it, except for the reset that is
    // meant to start the firmware: there it is released first, since a board that wires
    // DTR to the bootloader-select pin (PA0) would otherwise come up in its bootloader.
    async hardReset({ dataTerminalReady = true } = {}) {
        try {
            await this.port.setSignals({ dataTerminalReady, requestToSend: true })
            await sleep(100)
            await this.port.setSignals({ requestToSend: false })
        } catch (_err) {
            // No control lines on this port.
        }
    }

    // Sends ESC until the bootloader shows it is waiting for a transfer ("CCCC").
    async waitBoot(ms) {
        this.flushInput()
        const deadline = Date.now() + ms
        let tail = ''
        while (Date.now() < deadline) {
            await this.write([ESC])
            await this.waitData(10)
            tail = (tail + String.fromCharCode(...this.rx.splice(0))).slice(-16)
            if (tail.endsWith('CCCC')) { return true }
        }
        return false
    }

    async command(code, extra) {
        this.flushInput()
        await this.write(w600Command(code, extra))
    }

    // A command whose answer is a line like "MAC:286DCD0A1B2C": returns what follows
    // `tag`, or null if no such line comes within a second.
    async query(code, tag) {
        await this.command(code)
        const line = await this.waitFor((rx) => {
            const end = rx.indexOf(0x0a)
            return end < 0 ? null : String.fromCharCode(...rx.slice(0, end))
        }, 1000)
        const at = line === null ? -1 : line.toUpperCase().indexOf(tag)
        return at < 0 ? null : line.slice(at + tag.length).trim().toUpperCase()
    }
}

/*
 * Opens `port` (a raw, unopened SerialPort) and returns the link to hand to the
 * functions below. The caller closes it with closeW600().
 */
export async function openW600(port) {
    const link = new W600Link(port)
    await link.open()
    return link
}

export function closeW600(link) {
    return link.close()
}

/*
 * Gets the bootloader waiting for a transfer: is it already, does a reset through RTS
 * do it, and if not, `onNeedReset()` is the moment to tell the user to push the
 * button - they then have 15 seconds.
 */
export async function enterW600Bootloader(link, { onNeedReset = () => {} } = {}) {
    if (await link.waitBoot(500)) { return }
    await link.hardReset()
    if (await link.waitBoot(3000)) { return }
    onNeedReset()
    if (await link.waitBoot(15000)) { return }
    throw new Error('The W600 bootloader is not responding')
}

// The chip's MAC address as 12 hex digits, or null. Both bootloaders answer this.
export function w600Mac(link) {
    return link.query(CMD_GET_MAC, 'MAC:')
}

// Only the ROM bootloader knows this command, which is how it is told from secboot.
async function inRomBootloader(link) {
    return (await link.query(CMD_GET_QFID, 'FID:')) !== null
}

async function xmodemSend(link, data, onProgress) {
    await sleep(200)
    link.flushInput()
    // The receiver asks for a CRC-mode transfer by sending 'C'.
    const start = await link.waitFor((rx) => {
        const at = rx.findIndex(b => b === 0x43 || b === CAN)
        return at < 0 ? null : rx[at]
    }, 10000)
    if (start !== 0x43) { throw new Error('The bootloader is not ready to receive the firmware') }

    const reply = async (ms) => {
        const byte = await link.waitFor((rx) => {
            const at = rx.findIndex(b => b === ACK || b === NAK || b === CAN)
            return at < 0 ? null : rx[at]
        }, ms)
        return byte
    }
    const send = async (bytes, what) => {
        for (let attempt = 0; attempt < XMODEM_RETRIES; attempt++) {
            link.flushInput()
            await link.write(bytes)
            const answer = await reply(2000)
            if (answer === ACK) { return }
            if (answer === CAN) { throw new Error(`The bootloader cancelled the transfer at ${what}`) }
        }
        throw new Error(`The bootloader did not accept ${what}`)
    }

    let seq = 1
    for (let sent = 0; sent < data.length; sent += XMODEM_BLOCK, seq++) {
        await send(xmodemPacket(seq, data.subarray(sent, sent + XMODEM_BLOCK)), `block ${seq}`)
        onProgress(Math.min(sent + XMODEM_BLOCK, data.length), data.length)
    }
    await send([EOT], 'the end of the transfer')
}

/*
 * Writes a .fls image through `link` (from openW600), then resets the board into it
 * and closes the port. If it throws, the link is left open so the flash can be retried.
 * `onProgress(written, total)` is called after each block is accepted;
 * `onNeedReset()` as in enterW600Bootloader().
 */
export async function flashW600(link, data, { onProgress = () => {}, onLog = () => {}, onNeedReset = () => {} } = {}) {
    // Checked before secboot is erased: after that, a .fls is the only thing the chip
    // will take, so nothing else may be the reason to erase it.
    if (!isW600Fls(data)) { throw new Error('Not a W600 .fls firmware image') }

    await enterW600Bootloader(link, { onNeedReset })

    onLog('Erasing the secondary bootloader...')
    await link.command(CMD_ERASE_SECBOOT)
    await link.waitBoot(15000)
    if (!await inRomBootloader(link)) {
        throw new Error('Could not get to the ROM bootloader. Reset the board with PA0 connected to GND, then try again.')
    }

    onLog(`Sending ${data.length} bytes...`)
    await xmodemSend(link, data, onProgress)

    // "run user code..." is the bootloader's last word; it is only waited for so the
    // reset below does not cut it short.
    await link.waitFor(rx => (String.fromCharCode(...rx).includes('run user code') ? true : null), 2000)
    // Reset into the firmware with both control lines let go, then give the port back:
    // the board is running now, and whatever talks to it next (ViperIDE itself) needs
    // the port free. Flashing again starts from a new connection.
    await link.hardReset({ dataTerminalReady: false })
    await link.close()
}
