/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Writing a firmware file onto a mass-storage bootloader drive (RP2's RPI-RP2/RP2350,
 * an nRF52 UF2 bootloader, or a DAPLink/J-Link/ST-Link debug-probe drive). They are all
 * the same operation from the browser's side - the device decides what to do with
 * the bytes - so this is deliberately just "write a file to a picked directory".
 */

// INFO_UF2.TXT (every UF2 bootloader exposes one) looks like:
//   UF2 Bootloader v3.0
//   Model: Raspberry Pi RP2
//   Board-ID: RPI-RP2
// Returns { model, boardId } with whatever was found; both are null if the text
// doesn't look like an INFO_UF2.TXT at all.
export function parseInfoUf2(text) {
    const model = text.match(/^Model:\s*(.+)$/m)?.[1]?.trim() ?? null
    const boardId = text.match(/^Board-ID:\s*(.+)$/m)?.[1]?.trim() ?? null
    return { model, boardId }
}

/*
 * DAPLink (the micro:bit's and most debug probes' drive) has a DETAILS.TXT instead, e.g.
 *   Interface Version: 0249
 *   URL: https://microbit.org/device/?id=9900&v=0249
 * The micro:bit's own id in that URL says which version it is: 9900 is v1, 9904 is v2.
 * Any other micro:bit id is reported as plain "micro:bit", not guessed at.
 * Returns { model, boardId } in the same shape as parseInfoUf2.
 */
export function parseDaplinkDetails(text) {
    const url = text.match(/^URL:\s*(.+)$/m)?.[1]?.trim() ?? ''
    const version = text.match(/^Interface Version:\s*(.+)$/m)?.[1]?.trim() ?? null
    const microbitId = url.match(/microbit\.org\/device\/\?id=(\d+)/)?.[1] ?? null
    const model = microbitId === '9900' ? 'micro:bit v1'
        : microbitId === '9904' ? 'micro:bit v2'
        : microbitId ? 'micro:bit'
        : 'DAPLink'
    return { model, boardId: version ? `Interface ${version}` : null }
}

export function hasDirectoryPicker() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

async function readDriveText(dir, name) {
    try {
        const fh = await dir.getFileHandle(name)
        return await (await fh.getFile()).text()
    } catch (_err) {
        return null   // not there, or the drive is already gone
    }
}

/*
 * SEGGER's J-Link MSD drive (the on-board probe of Nordic DKs) has a README.TXT that
 * starts "SEGGER J-Link MSD volume." It names the probe, not the board: the same drive
 * comes from the nRF52 DKs and the nRF9160 DK alike, so boardId is always null.
 */
export function parseJlinkReadme(text) {
    return /SEGGER J-Link/i.test(text) ? { model: 'SEGGER J-Link', boardId: null } : null
}

/*
 * The ST-Link drive of a Nucleo or Discovery board (NODE_..., DIS_...) also has a
 * DETAILS.TXT, but a two-line one that only describes the probe:
 *   Version: 0221
 *   Build:   Sep 18 2018 11:09:21
 * What names the board is MBED.HTM next to it, a redirect to
 * http://mbed.org/device/?code=08390221103168772F75F173 - the first four digits of that
 * code are the board (0839 is the NUCLEO-WB55RG, see STLINK_BOARD_BY_CODE in firmware.js).
 * Returns null for a DETAILS.TXT that is not an ST-Link's, else { model, boardId } with
 * the four-digit code as boardId (null when there is no MBED.HTM to take it from).
 */
export function parseStlinkDrive(details, mbedHtm) {
    if (!/^Version:\s*\d+/m.test(details) || !/^Build:/m.test(details)) { return null }
    const code = (mbedHtm || '').match(/[?&]code=([0-9A-Fa-f]{4})/)?.[1] ?? null
    return { model: 'ST-Link', boardId: code }
}

/*
 * Lets the user pick the bootloader drive, reading its INFO_UF2.TXT (UF2 bootloaders),
 * DETAILS.TXT (DAPLink, ST-Link) or README.TXT (J-Link) back if present. info is null
 * when none is there - still a valid pick, just with nothing to show.
 */
export async function pickDrive() {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'viperide-flasher' })
    let info = null
    const infoUf2 = await readDriveText(dir, 'INFO_UF2.TXT')
    if (infoUf2 !== null) {
        info = parseInfoUf2(infoUf2)
    } else {
        const details = await readDriveText(dir, 'DETAILS.TXT')
        if (details !== null) {
            info = parseStlinkDrive(details, null)
                ? parseStlinkDrive(details, await readDriveText(dir, 'MBED.HTM'))
                : parseDaplinkDetails(details)
        } else {
            const readme = await readDriveText(dir, 'README.TXT')
            if (readme !== null) { info = parseJlinkReadme(readme) }
        }
    }
    return { dir, info }
}

/*
 * Writes `data` as `filename` into the picked directory. A UF2 bootloader reboots and
 * unmounts as soon as it has seen enough of the file - often before close() gets an
 * answer - so a failing close() after a successful write() is the expected ending, not
 * a failure, and is swallowed here.
 *
 * The browser does not write `filename` directly: it writes a `<filename>.crswap` next to
 * it and renames that on close(). Programmers that go by the data rather than the name
 * are fine with this. Replaying that sequence by hand on an ST-Link/V2-1 drive (empty
 * target, data into the swap file, rename) flashed the board.
 */
export async function writeFileToDrive(dir, filename, data) {
    const fh = await dir.getFileHandle(filename, { create: true })
    const writable = await fh.createWritable()
    await writable.write(data)
    try {
        await writable.close()
    } catch (_err) {
        // The drive is very possibly already gone - see above.
    }
}
