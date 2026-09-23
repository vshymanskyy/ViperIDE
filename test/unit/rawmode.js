/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import { assert } from 'chai'

import { MpRawMode } from '../../src/rawmode.js'

describe('MpRawMode device information', () => {
    it('returns the MicroPython platform and optional build identifier', async () => {
        const raw = new MpRawMode(null)
        raw.exec = async () =>
            'Raspberry Pi Pico2 with RP2350|abc123|1.28.0|rp2|MicroPython 1.28.0|rp2|' +
            'RPI_PICO2|5|6|3|:/lib|micropython|1.28.0|rp2|RPI_PICO2||RP2350\n'

        assert.deepInclude(await raw.getDeviceInfo(), {
            family: 'micropython',
            firmware_version: '1.28.0',
            port: 'rp2',
            board_id: 'RPI_PICO2',
            cpu: 'RP2350',
            platform: 'rp2',
            build: 'RPI_PICO2',
            mpy_arch: 'armv7m',
            mpy_ver: 6,
            mpy_sub: 3,
        })
    })

    it('uses an empty build identifier when the device does not provide one', async () => {
        const raw = new MpRawMode(null)
        raw.exec = async () =>
            'WebAssembly|abc123|1.28.0|webassembly|MicroPython 1.28.0|webassembly||0|0|0|:.frozen:/lib\n'

        const info = await raw.getDeviceInfo()

        assert.strictEqual(info.platform, 'webassembly')
        assert.strictEqual(info.build, '')
        assert.strictEqual(info.family, 'micropython')
        assert.strictEqual(info.firmware_version, '1.28.0')
        assert.strictEqual(info.port, 'webassembly')
        assert.strictEqual(info.board_id, '')
    })
})
