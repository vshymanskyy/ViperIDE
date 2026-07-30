/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

/*
 * A .zip writer that returns an (uncompressed) archive as a single Uint8Array.
 * Libraries like littlezipper and client-zip only expose an async API, which 
 * cannot be used in the context of a synchronous `onDragStart`.
 *
 * Only what a folder download needs is implemented: stored entries, no zip64, no
 * comments, no permissions. Directories are entries whose name ends in '/' with
 * no data. This module has no imports, so it loads under the test harness as-is.
 */

const encoder = new TextEncoder()

const LOCAL_SIG   = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG    = 0x06054b50
const STORED      = 0             /* compression method: none */
const UTF8_NAMES  = 0x0800        /* general purpose bit 11: names are UTF-8 */
const VERSION     = 20            /* 2.0: all that stored entries require */
const DOS_DIR     = 0x10          /* MS-DOS directory attribute */

const MAX_ENTRIES = 0xffff        /* above this the count needs zip64 */
const MAX_SIZE    = 0xffffffff    /* and so does any offset or length past 4 GiB */

let crcTable = null

function crc32(bytes) {
    if (!crcTable) {
        crcTable = new Int32Array(256)
        for (let n = 0; n < 256; n++) {
            let c = n
            for (let k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1) }
            crcTable[n] = c
        }
    }
    let crc = -1
    for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff]
    }
    return (crc ^ -1) >>> 0
}

/* Builds the archive of `files`, each { path, data } with data a Uint8Array -
   empty, and a path ending in '/', for a directory entry. `when` is the
   modification time recorded for every entry. */
export function createZipSync(files, when = new Date()) {
    if (files.length > MAX_ENTRIES) { throw new Error('Too many files to archive') }

    const names = files.map((f) => encoder.encode(f.path))
    const datas = files.map((f) => f.data || new Uint8Array(0))

    let total = 22                                  /* the end-of-central-directory record */
    for (let i = 0; i < files.length; i++) {
        total += 30 + 46 + 2 * names[i].length + datas[i].length
    }
    if (total > MAX_SIZE) { throw new Error('Archive is too large') }

    const out = new Uint8Array(total)
    const view = new DataView(out.buffer)
    let at = 0
    const u16 = (v) => { view.setUint16(at, v, true); at += 2 }
    const u32 = (v) => { view.setUint32(at, v, true); at += 4 }
    const raw = (b) => { out.set(b, at); at += b.length }

    /* MS-DOS timestamp: two seconds of resolution, and no year before 1980 */
    const time = ((when.getSeconds() / 2) | 0) | (when.getMinutes() << 5) | (when.getHours() << 11)
    const date = when.getDate() | ((when.getMonth() + 1) << 5) | ((when.getFullYear() - 1980) << 9)

    const offsets = []
    const crcs = []
    for (let i = 0; i < files.length; i++) {
        const name = names[i], data = datas[i]
        offsets[i] = at
        crcs[i] = crc32(data)
        u32(LOCAL_SIG); u16(VERSION); u16(UTF8_NAMES); u16(STORED)
        u16(time); u16(date)
        u32(crcs[i]); u32(data.length); u32(data.length)     /* stored: both sizes are the same */
        u16(name.length); u16(0)
        raw(name); raw(data)
    }

    const centralAt = at
    for (let i = 0; i < files.length; i++) {
        const name = names[i], data = datas[i]
        const isDir = files[i].path.endsWith('/')
        u32(CENTRAL_SIG); u16(VERSION); u16(VERSION); u16(UTF8_NAMES); u16(STORED)
        u16(time); u16(date)
        u32(crcs[i]); u32(data.length); u32(data.length)
        u16(name.length); u16(0); u16(0)                     /* no extra field, no comment */
        u16(0); u16(0); u32(isDir ? DOS_DIR : 0)             /* disk, internal and external attributes */
        u32(offsets[i])
        raw(name)
    }

    const centralSize = at - centralAt        /* before the record below moves `at` along */
    u32(EOCD_SIG); u16(0); u16(0)                            /* a single-disk archive */
    u16(files.length); u16(files.length)
    u32(centralSize); u32(centralAt); u16(0)
    return out
}
