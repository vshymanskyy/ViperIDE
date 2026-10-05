/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Thin wrapper over esptool-js: connect once (chip autodetect, bootloader entry, stub
 * upload), then flash as many times as the user wants without reconnecting.
 */

import { ESPLoader } from 'esptool-js'
import { mcuForChipName } from './firmware.js'

// esptool-js's terminal. `onLog` gets raw text, line ends and all (it writes progress with
// \r and no newline, and ends its own lines), so it must not add a newline of its own.
function makeTerminal(onLog) {
    return {
        clean: () => {},
        write: (s) => onLog && onLog(s),
        writeLine: (s) => onLog && onLog(s + '\n'),
    }
}

/*
 * Opens the ROM bootloader connection and detects the chip. `port` is a raw
 * (unopened) SerialPort - esptool-js owns opening/closing it from here on, at its own
 * baud rate, so it must not have been opened by anything else first.
 *
 * Kept at the default 115200 baud throughout: a baud change needs a working port
 * reopen/reconfigure on the OS driver, which is exactly the kind of thing that is
 * flaky on cheap USB-serial adapters - not worth it for what is, at most, a few
 * megabytes.
 */
export async function connectEsp(port, { onLog = null } = {}) {
    const loader = new ESPLoader({ port, baudrate: 115200, terminal: makeTerminal(onLog) })
    // main() returns a human-readable description ("ESP32-C5 (revision v0.0)",
    // "ESP32-S3 (QFN56) (revision v0.1)", ...) - good for the log, useless as a lookup
    // key. loader.chip.CHIP_NAME (set as a side effect of main()'s detectChip()) is the
    // bare "ESP32-C5"/"ESP32-S3" mcuForChipName actually expects.
    const chipName = await loader.main()
    return { loader, chipName, mcu: mcuForChipName(loader.chip.CHIP_NAME) }
}

/*
 * Writes one image at `offset` and resets the board to run it. Does not erase first -
 * see eraseEsp() below, now its own action (a small button next to Flash in
 * flasher.js) rather than something writeFlash did on the way.
 */
export async function flashEsp(loader, image, offset, { onProgress = null } = {}) {
    await loader.writeFlash({
        fileArray: [{ data: image, address: offset }],
        flashMode:  'keep',
        flashFreq:  'keep',
        flashSize:  'keep',
        eraseAll:   false,
        compress:   true,
        reportProgress: onProgress ? (_i, written, total) => onProgress(written, total) : undefined,
    })
    await loader.after('hard_reset')
}

/*
 * Erases the whole flash chip and writes nothing back - stale settings or filesystem
 * contents at other offsets than the ones about to be written could otherwise confuse
 * the next firmware. loader already has the terminal from connectEsp(); eraseFlash()
 * writes its own progress text ("Erasing flash (this may take a while)...") through it.
 */
export async function eraseEsp(loader) {
    await loader.eraseFlash()
}
