/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The synchronous .zip writer used to hand a dragged folder to the browser.
 *
 * src/zip.js has no imports, so like src/fs_cache.js it loads under Node as-is.
 * Nothing here touches a board. The archives are read back with the small parser
 * below rather than compared byte for byte, so the tests say what a reader has to
 * find and not what this particular writer happens to emit.
 */

import { assert } from 'chai'
import { createZipSync } from '../../src/zip.js'

const enc = new TextEncoder()
const dec = new TextDecoder()

/* Reads back an archive of stored entries, checking every structural claim it
   makes about itself on the way: signatures, the offsets and lengths in the
   end-of-directory record, and each central entry against its local header. */
function readZip(zip) {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    const u16 = (at) => view.getUint16(at, true)
    const u32 = (at) => view.getUint32(at, true)

    const eocd = zip.length - 22
    assert(eocd >= 0, 'archive is too short to hold an end-of-directory record')
    assert.strictEqual(u32(eocd), 0x06054b50, 'end-of-directory signature')
    assert.strictEqual(u16(eocd + 20), 0, 'archive comment length')
    const count = u16(eocd + 10)
    assert.strictEqual(u16(eocd + 8), count, 'entries on this disk match the total')
    const size = u32(eocd + 12)
    const start = u32(eocd + 16)
    assert.strictEqual(start + size, eocd, 'the central directory ends where its record begins')

    const entries = []
    let at = start
    for (let i = 0; i < count; i++) {
        assert.strictEqual(u32(at), 0x02014b50, `central signature of entry ${i}`)
        const flags = u16(at + 8)
        const method = u16(at + 10)
        const crc = u32(at + 16)
        const packed = u32(at + 20)
        const size = u32(at + 24)
        const nameLen = u16(at + 28)
        const extraLen = u16(at + 30)
        const commentLen = u16(at + 32)
        const attrs = u32(at + 38)
        const local = u32(at + 42)
        const name = dec.decode(zip.subarray(at + 46, at + 46 + nameLen))
        at += 46 + nameLen + extraLen + commentLen

        assert.strictEqual(method, 0, `entry ${name} is stored`)
        assert.strictEqual(packed, size, `entry ${name} packs to its own length`)

        assert.strictEqual(u32(local), 0x04034b50, `local signature of entry ${name}`)
        assert.strictEqual(u16(local + 8), method, `local method of ${name}`)
        assert.strictEqual(u32(local + 14), crc, `local crc of ${name}`)
        assert.strictEqual(u32(local + 18), packed, `local packed size of ${name}`)
        assert.strictEqual(u32(local + 22), size, `local size of ${name}`)
        assert.strictEqual(u16(local + 26), nameLen, `local name length of ${name}`)
        const body = local + 30 + nameLen + u16(local + 28)
        assert.strictEqual(dec.decode(zip.subarray(local + 30, local + 30 + nameLen)), name, 'local name')

        entries.push({
            name, crc, flags, attrs,
            data: zip.subarray(body, body + size),
            time: u16(local + 10), date: u16(local + 12),
        })
    }
    assert.strictEqual(at, eocd, 'the central directory is exactly as long as it claims')
    return entries
}

/* Known-good CRC-32 values, so the checksums are checked against the standard
   and not against this writer's own table. */
const CRC = {
    '': 0x00000000,
    'hello': 0x3610a686,
    'The quick brown fox jumps over the lazy dog': 0x414fa339,
}

const WHEN = new Date(2024, 4, 17, 13, 45, 30)      // 2024-05-17 13:45:30

describe('Zip writer', () => {

    it('files and folders read back as they were written', () => {
        const zip = createZipSync([
            { path: 'proj/', data: new Uint8Array(0) },
            { path: 'proj/main.py', data: enc.encode('hello') },
            { path: 'proj/lib/', data: new Uint8Array(0) },
            { path: 'proj/lib/empty.txt', data: new Uint8Array(0) },
        ], WHEN)

        const entries = readZip(zip)
        assert.strictEqual(entries.map(e => e.name).join(' '), 'proj/ proj/main.py proj/lib/ proj/lib/empty.txt')
        assert.bytesEqual(entries[1].data, enc.encode('hello'), 'file body')
        assert.strictEqual(entries[0].data.length, 0, 'a folder entry carries no data')
        assert.strictEqual(entries[3].data.length, 0, 'an empty file carries no data')
    })

    it('checksums match the standard CRC-32', () => {
        const zip = createZipSync([
            { path: 'a', data: enc.encode('hello') },
            { path: 'b', data: enc.encode('The quick brown fox jumps over the lazy dog') },
            { path: 'c', data: new Uint8Array(0) },
        ], WHEN)

        const entries = readZip(zip)
        assert.strictEqual(entries[0].crc, CRC['hello'], 'crc of "hello"')
        assert.strictEqual(entries[1].crc, CRC['The quick brown fox jumps over the lazy dog'], 'crc of the pangram')
        assert.strictEqual(entries[2].crc, CRC[''], 'crc of nothing')
    })

    it('binary data survives byte for byte', () => {
        const data = new Uint8Array(64 * 1024 + 7)
        for (let i = 0; i < data.length; i++) { data[i] = (i * 7) & 0xff }
        const entries = readZip(createZipSync([{ path: 'blob.bin', data }], WHEN))
        assert.bytesEqual(entries[0].data, data, 'blob')
    })

    it('names are UTF-8 and flagged as such', () => {
        const name = 'proj/ümläut 你好.txt'
        const entries = readZip(createZipSync([{ path: name, data: enc.encode('hello') }], WHEN))
        assert.strictEqual(entries[0].name, name, 'name round-trips')
        assert(entries[0].flags & 0x0800, 'the UTF-8 name flag is set')
    })

    it('folder entries carry the directory attribute', () => {
        const entries = readZip(createZipSync([
            { path: 'lib/', data: new Uint8Array(0) },
            { path: 'lib/a.py', data: enc.encode('hello') },
        ], WHEN))
        assert.strictEqual(entries[0].attrs & 0x10, 0x10, 'folder')
        assert.strictEqual(entries[1].attrs & 0x10, 0, 'file')
    })

    it('the modification time is recorded in MS-DOS form', () => {
        const [entry] = readZip(createZipSync([{ path: 'a', data: new Uint8Array(0) }], WHEN))
        assert.strictEqual(entry.time & 0x1f, 15, 'seconds, in units of two')
        assert.strictEqual((entry.time >> 5) & 0x3f, 45, 'minutes')
        assert.strictEqual(entry.time >> 11, 13, 'hours')
        assert.strictEqual(entry.date & 0x1f, 17, 'day')
        assert.strictEqual((entry.date >> 5) & 0x0f, 5, 'month')
        assert.strictEqual(entry.date >> 9, 2024 - 1980, 'year, from 1980')
    })

    it('an empty archive is a bare end-of-directory record', () => {
        const zip = createZipSync([], WHEN)
        assert.strictEqual(zip.length, 22)
        assert.strictEqual(readZip(zip).length, 0, 'no entries')
    })

    it('an archive too large for the format is refused', async () => {
        const files = []
        for (let i = 0; i <= 0xffff; i++) { files.push({ path: `f${i}`, data: new Uint8Array(0) }) }
        await assert.rejects(() => createZipSync(files, WHEN), /Too many files/)
    })
})
