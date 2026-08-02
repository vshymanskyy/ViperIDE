/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * REPL: raw mode entry/exit, exec() semantics, interrupt and reboot handling.
 */

import { ctx, skip } from '../setup.js'
import { assert } from 'chai'
import { MpRawMode, SOFT_RESET_BANNER, withRaw } from '../board.js'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/* MicroPython's REPL cooks '\n' into '\r\n' on the way out. */
const lines = (s) => s.replace(/\r\n/g, '\n').trim()

describe('REPL', () => {

    it('enters and leaves raw mode repeatedly', async () => {
        for (let i = 0; i < 3; i++) {
            const raw = await MpRawMode.begin(ctx.port)
            assert.strictEqual(lines(await raw.exec(`print(${i})`)), String(i))
            await raw.end()
        }
    })

    it('exec returns stdout', async () => {
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('hello board')`)), 'hello board')
        })
    })

    it('exec returns multi-line stdout', async () => {
        await withRaw(ctx.port, async (raw) => {
            const out = lines(await raw.exec(`
for i in range(5):
    print('line', i)
`))
            assert.strictEqual(out.split('\n').length, 5, 'line count')
            assert.strictEqual(out.split('\n')[4], 'line 4')
        })
    })

    it('exec returns empty output for silent code', async () => {
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(await raw.exec(`x = 1 + 1`), '')
        })
    })

    it('exec raises Python exceptions', async () => {
        await withRaw(ctx.port, async (raw) => {
            const err = await assert.rejects(() => raw.exec(`1/0`))
            assert.include(err.message, 'ZeroDivisionError')
            assert.include(err.message, 'Traceback')
        })
    })

    it('exec raises syntax errors', async () => {
        await withRaw(ctx.port, async (raw) => {
            const err = await assert.rejects(() => raw.exec(`def (:`))
            assert.include(err.message, 'SyntaxError')
        })
    })

    it('session survives an exception', async () => {
        await withRaw(ctx.port, async (raw) => {
            await assert.rejects(() => raw.exec(`raise ValueError('boom')`))
            assert.strictEqual(lines(await raw.exec(`print('still alive')`)), 'still alive')
        })
    })

    it('exec keeps globals across calls in one session', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.exec(`_viper_test_var = 41`)
            assert.strictEqual(lines(await raw.exec(`print(_viper_test_var + 1)`)), '42')
        })
    })

    it('a new session sees globals from the previous one', async () => {
        // Raw mode does not reset the interpreter, so this is expected - the test pins
        // the behaviour that ViperIDE relies on (imports stay warm between operations).
        await withRaw(ctx.port, raw => raw.exec(`_viper_test_var = 7`))
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print(_viper_test_var)`)), '7')
        })
    })

    it('exec handles large output', async () => {
        await withRaw(ctx.port, async (raw) => {
            const out = await raw.exec(`print('x' * 8000)`, 20000)
            assert.strictEqual(out.replace(/[\r\n]/g, '').length, 8000, 'received length')
        })
    })

    it('exec handles UTF-8 output', async () => {
        await withRaw(ctx.port, async (raw) => {
            const text = 'Привіт, 世界! 🐍'
            const out = lines(await raw.exec(`print('${text}')`))
            assert.strictEqual(out, text)
        })
    })

    it('exec handles output with quotes and backslashes', async () => {
        await withRaw(ctx.port, async (raw) => {
            const out = lines(await raw.exec(`print(repr('a\\\\b\\'c"d'))`))
            assert.strictEqual(out, `'a\\\\b\\'c"d'`)
        })
    })

    it('getDeviceInfo reports a usable device description', async () => {
        const info = await withRaw(ctx.port, raw => raw.getDeviceInfo())
        assert(info.version && info.version.length, 'version is empty')
        assert(Array.isArray(info.sys_path) && info.sys_path.length, 'sys_path is empty')
        assert(info.mpy_ver === 'py' || Number.isInteger(info.mpy_ver), `bad mpy_ver: ${info.mpy_ver}`)
        assert(info.mpy_arch === null || typeof info.mpy_arch === 'string', `bad mpy_arch: ${info.mpy_arch}`)
    })

    it('getFsStats reports plausible numbers', async () => {
        const stats = await withRaw(ctx.port, async (raw) => {
            try {
                return await raw.getFsStats(ctx.root)
            } catch (err) {
                skip(`statvfs unsupported: ${err.message.split('\n').pop().trim()}`)
            }
        })
        const [used, free, size] = stats.map(Number)
        assert(size > 0, `filesystem size is ${size}`)
        assert.strictEqual(used + free, size, 'used + free should equal size')
    })

    it('readSysInfoMD returns markdown', async () => {
        const md = await withRaw(ctx.port, raw => raw.readSysInfoMD())
        assert.include(md, '## Machine')
        assert.include(md, '## System')
    })

    it('concurrent sessions are serialized by the transport mutex', async () => {
        const results = await Promise.all([1, 2, 3, 4].map(
            n => withRaw(ctx.port, raw => raw.exec(`print(${n} * 11)`))
        ))
        assert.strictEqual(results.map(lines).join(','), '11,22,33,44')
    })

    it('friendly REPL echoes typed statements', async () => {
        const release = await ctx.port.startTransaction()
        try {
            await ctx.port.write('\x03')
            await ctx.port.readUntil('>>> ', 5000)
            await ctx.port.flushInput()
            await ctx.port.write('print(2 ** 10)\r\n')
            const echo = await ctx.port.readUntil('>>> ', 5000)
            assert.include(echo, '1024')
        } finally {
            release()
        }
    })

    it('Ctrl-C recovers a board stuck in a busy loop', async () => {
        if (!ctx.caps.interrupt) { skip('the wasm REPL cannot be interrupted while running') }

        const release = await ctx.port.startTransaction()
        try {
            await ctx.port.write('\x03')
            await ctx.port.readUntil('>>> ', 5000)
            await ctx.port.flushInput()
            await ctx.port.write('while 1: pass\r\n')
            await sleep(500)
        } finally {
            release()
        }

        // This is what ViperIDE does on every operation: interruptProgram() must break
        // the loop before raw mode can be entered.
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('recovered')`)), 'recovered')
        })
    })

    /*
     * Leaves the board running `code` at the friendly REPL - the state ViperIDE finds
     * it in when it is plugged in while a program of its own is going.
     */
    async function startAtRepl(code) {
        const release = await ctx.port.startTransaction()
        try {
            await ctx.port.write('\x03')
            await ctx.port.readUntil('>>> ', 5000)
            await ctx.port.flushInput()
            await ctx.port.write(code + '\r\n')
            await sleep(500)
        } finally {
            release()
        }
    }

    it('probeRepl sees an idle prompt', async () => {
        // Leaving raw mode puts the board back at the friendly REPL
        await withRaw(ctx.port, raw => raw.exec(`pass`))

        assert.isTrue(await MpRawMode.probeRepl(ctx.port))

        // The Enter it sent must not have left anything behind for the next session
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('still here')`)), 'still here')
        })
    })

    it('probeRepl finds no prompt while code is running', async () => {
        if (!ctx.caps.interrupt) { skip('the wasm REPL cannot run and answer at the same time') }

        await startAtRepl('while 1: pass')
        assert.isFalse(await MpRawMode.probeRepl(ctx.port))

        // Only now is the loop interrupted - probing must not have done it
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('recovered')`)), 'recovered')
        })
    })

    it('probeRepl gives up on a board printing in a loop', async () => {
        if (!ctx.caps.interrupt) { skip('the wasm REPL cannot run and answer at the same time') }

        await startAtRepl(`while 1: print('x')`)

        /* The case the probe has its own deadline for: readUntil() restarts its
           timeout on every byte, so continuous output would keep it waiting. */
        const started = Date.now()
        assert.isFalse(await MpRawMode.probeRepl(ctx.port, 500))
        assert(Date.now() - started < 5000, 'the probe waited on continuous output')

        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('recovered')`)), 'recovered')
        })
    })

    it('soft reboot resets the interpreter state', async () => {
        if (!ctx.caps.softReboot) { skip('soft reboot is not supported by this target') }

        await withRaw(ctx.port, raw => raw.exec(`_viper_reboot_marker = 1`))
        await withRaw(ctx.port, async (raw) => {
            const err = await assert.rejects(() => raw.exec(`print(_viper_reboot_marker)`))
            assert.include(err.message, 'NameError')
        }, { soft_reboot: true })
    })

    /*
     * ViperIDE has nothing but the terminal stream to tell it that the board restarted
     * under it, so the banner has to be exactly what it watches for - and the board has
     * to answer a probe once it is back. This is the sequence the app performs.
     *
     * Assumes a board that is not busy after a reboot, as the rest of the suite does:
     * one with a main.py of its own would be found busy here, which is precisely what
     * the app then reports.
     */
    it('a soft reboot announces itself and hands the board back', async () => {
        if (!ctx.caps.softReboot) { skip('soft reboot is not supported by this target') }

        // Leaving raw mode puts the board back at the friendly REPL, where Ctrl-D reboots
        await withRaw(ctx.port, raw => raw.exec(`pass`))

        let banner
        const release = await ctx.port.startTransaction()
        try {
            await ctx.port.write('\x04')
            banner = await ctx.port.readUntil('soft reboot\r\n', 10000)
        } finally {
            release()
        }
        assert.match(banner, SOFT_RESET_BANNER)

        // What the app does next: a moment for boot.py and main.py, then a probe
        await sleep(300)
        assert.isTrue(await MpRawMode.probeRepl(ctx.port, 3000))
    })

    it('exec reports a timeout when the board takes too long', async () => {
        if (!ctx.caps.asyncExec) { skip('the wasm REPL runs synchronously with the write call') }

        await withRaw(ctx.port, async (raw) => {
            await assert.rejects(() => raw.exec(`import time\ntime.sleep(2)`, 300), /Timeout/)
            // Break out of the sleep and drop whatever it left in the buffer, so raw
            // mode can be left cleanly instead of relying on the next reconnect.
            await ctx.port.write('\x03')
            await sleep(500)
            await ctx.port.flushInput()
        })
    })

    it('the board is usable again after a timeout', async () => {
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('ok')`)), 'ok')
        })
    })
})
