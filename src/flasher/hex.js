/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Intel HEX to a flat binary image, for the one programmer that needs it: the ST-Link
 * drive on Nucleo and Discovery boards. micropython.org publishes a .hex for them and no
 * .bin, and the .hex is nearly three times the size of the firmware it describes - more
 * than the drive's whole (virtual) capacity of about 1 MB, so it cannot even be copied
 * there. The same firmware as a .bin fits.
 */

const MAX_IMAGE_SIZE = 16 * 1024 * 1024

// Where the ST-Link drive writes a .bin: the start of the STM32's internal flash.
export const STM32_FLASH_BASE = 0x08000000

/*
 * Returns the data records of an Intel HEX file as [{ address, data }], adjacent records
 * joined into one region, in address order. Throws on a malformed line or a checksum
 * mismatch.
 */
export function parseIntelHex(bytes) {
    const text = new TextDecoder('latin1').decode(bytes)
    const records = []
    let base = 0
    let ended = false
    let lineNo = 0
    for (const raw of text.split(/\r?\n/)) {
        lineNo++
        const line = raw.trim()
        if (!line || ended) { continue }
        if (!/^:([0-9a-fA-F]{2}){5,}$/.test(line)) {
            throw new Error(`Not an Intel HEX file (line ${lineNo})`)
        }
        const rec = new Uint8Array((line.length - 1) / 2)
        for (let i = 0; i < rec.length; i++) { rec[i] = parseInt(line.substr(1 + i * 2, 2), 16) }
        const count = rec[0]
        if (rec.length !== count + 5 || rec.reduce((sum, b) => sum + b, 0) & 0xff) {
            throw new Error(`Corrupted Intel HEX file (line ${lineNo})`)
        }
        const offset = (rec[1] << 8) | rec[2]
        const payload = rec.subarray(4, 4 + count)
        switch (rec[3]) {
            case 0x00: records.push({ address: base + offset, data: payload }); break
            case 0x01: ended = true; break
            case 0x02: base = ((payload[0] << 8) | payload[1]) * 16; break
            case 0x04: base = ((payload[0] << 8) | payload[1]) * 65536; break
            default: break   // start address records (03, 05) carry no data
        }
    }
    if (!ended || records.length === 0) {
        throw new Error('Incomplete Intel HEX file')
    }

    records.sort((a, b) => a.address - b.address)
    const regions = []
    for (const rec of records) {
        const last = regions[regions.length - 1]
        if (last && last.address + last.length === rec.address) {
            last.parts.push(rec.data)
            last.length += rec.data.length
        } else {
            regions.push({ address: rec.address, length: rec.data.length, parts: [rec.data] })
        }
    }
    return regions.map(({ address, length, parts }) => {
        const data = new Uint8Array(length)
        let pos = 0
        for (const part of parts) { data.set(part, pos); pos += part.length }
        return { address, data }
    })
}

/*
 * One image starting at the lowest address, with any gap between regions filled with
 * 0xFF (what erased flash reads as). Returns { address, data, regions }; `regions` is
 * how many separate pieces the .hex had - more than one means the gap is being
 * overwritten too.
 */
export function hexToBin(bytes) {
    const regions = parseIntelHex(bytes)
    const address = regions[0].address
    const last = regions[regions.length - 1]
    const size = last.address + last.data.length - address
    // A .hex can also address memory far from the main flash (an external chip, option
    // bytes); one flat image cannot span that, and would be mostly padding if it tried.
    if (size > MAX_IMAGE_SIZE) {
        throw new Error('This .hex covers more than one memory area and cannot be written as one image')
    }
    const data = new Uint8Array(size).fill(0xff)
    for (const region of regions) { data.set(region.data, region.address - address) }
    return { address, data, regions: regions.length }
}

/*
 * hexToBin() for the ST-Link drive, which has no way to be told an address: it writes a
 * .bin at STM32_FLASH_BASE, so an image that starts anywhere else would land in the
 * wrong place and is refused here.
 */
export function stlinkBin(bytes) {
    const bin = hexToBin(bytes)
    if (bin.address !== STM32_FLASH_BASE) {
        throw new Error(`This firmware starts at 0x${bin.address.toString(16)}, not at the start of flash, ` +
            'and cannot be written through the ST-Link drive')
    }
    return bin
}
