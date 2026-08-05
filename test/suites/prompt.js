/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The REPL prompt is not always '>>> ': aiorepl uses '--> ', and a board is free to
 * put anything in sys.ps1. Two halves to this: readUntil() accepting a set of endings
 * rather than one (synthetic, no board), and MpRawMode learning which of them this
 * board actually uses (on the connected target).
 */

import { ctx, skip } from '../setup.js'
import { assert } from 'chai'
import { Transport } from '../../src/transports/base.js'
import { MpRawMode, withRaw, sleep, lines, toPrompt, captureOutput, REPL_PROMPTS }
    from '../board.js'

/* The real list, not a copy of it: these tests are what keeps aiorepl's '--> ' in it. */
const PROMPTS = REPL_PROMPTS

/* A Transport that is never connected to anything: the read paths under test only
   ever look at receivedData, which the tests fill in directly. */
class FakeTransport extends Transport {
    async writeBytes(_chunk) {}
}

/* Runs fn against a transport whose buffer already holds `data`. */
async function withBuffer(data, fn) {
    const port = new FakeTransport()
    const release = await port.startTransaction()
    try {
        port.receiveCallback(data)
        return await fn(port)
    } finally {
        release()
    }
}

describe('readUntil with alternative endings', () => {

    it('a single ending still reads up to and including it', async () => {
        await withBuffer('noise\r\n>>> leftover', async (port) => {
            assert.strictEqual(await port.readUntil('>>> '), 'noise\r\n>>> ')
            assert.strictEqual(port.receivedData, 'leftover')
        })
    })

    it('any one of several endings matches', async () => {
        for (const prompt of PROMPTS) {
            await withBuffer(`\r\n${prompt}`, async (port) => {
                assert.strictEqual(await port.readUntil(PROMPTS), `\r\n${prompt}`)
            })
        }
    })

    /*
     * aiorepl is the reason the list has more than one entry, and the only prompt
     * that has to be known in advance: it writes '--> ' itself and leaves sys.ps1
     * alone, so a board running it reports '>>> ' when begin() asks. Nothing on a
     * board can be asked to make up for dropping it here.
     */
    it("aiorepl's prompt is known without asking the board", async () => {
        assert.include(REPL_PROMPTS, '--> ')
        await withBuffer('\r\n--> ', async (port) => {
            assert.strictEqual(await port.readUntil(REPL_PROMPTS), '\r\n--> ')
        })
    })

    /* Scanning the list in order would read past the '--> ' to reach the '>>> ',
       swallowing everything in between - output that belongs on the terminal. */
    it('the earliest ending wins, not the first one listed', async () => {
        await withBuffer('x--> y>>> ', async (port) => {
            assert.strictEqual(await port.readUntil(PROMPTS), 'x--> ')
            assert.strictEqual(port.receivedData, 'y>>> ')
        })
    })

    it('an ending split across chunks is still found', async () => {
        const port = new FakeTransport()
        const release = await port.startTransaction()
        try {
            const pending = port.readUntil(PROMPTS, 5000)
            port.receiveCallback('\r\n--')
            await sleep(50)
            port.receiveCallback('> ')
            assert.strictEqual(await pending, '\r\n--> ')
        } finally {
            release()
        }
    })

    /* REPL_PROMPTS is seeded with the two defaults precisely so this cannot happen
       in production - an empty set matches nothing and would hang every operation. */
    it('an empty set of endings matches nothing', async () => {
        await withBuffer('\r\n>>> ', async (port) => {
            await assert.rejects(() => port.readUntil([], 100), /Timeout/)
        })
    })
})

describe('REPL prompt detection', () => {

    /*
     * Puts `value` in sys.ps1 and leaves the board sitting at the new prompt. This is
     * how an aiorepl board is stood in for: the real module is in src/vm_vfs, but the
     * wasm REPL never hands stdin to the asyncio task, so aiorepl prints its greeting
     * and the prompt stays '>>> '. Setting ps1 puts the prompt where aiorepl would.
     *
     * end() reads until one of the prompts known when the session began, which the
     * assignment above has just invalidated - so this session cannot be closed
     * cleanly. That is not the case under test: the prompt is read at begin(), and
     * it is the next begin() that has to cope.
     */
    async function setPs1(value) {
        const raw = await MpRawMode.begin(ctx.port)
        await raw.exec(`import sys; sys.ps1 = ${JSON.stringify(value)}`)
        try {
            await raw.end()
        } catch (_err) {
            /* expected - see above */
        }
    }

    /* Whether this board honours sys.ps1 at all: ports built without
       MICROPY_PY_SYS_PS1_PS2 have no such attribute and keep '>>> ' regardless. */
    async function hasPs1() {
        const rsp = await withRaw(ctx.port, raw => raw.exec(
            `import sys; print(hasattr(sys, 'ps1'))`))
        return lines(rsp) === 'True'
    }

    /* A test that fails partway through must not leave the board on a prompt the
       rest of the run knows nothing about. */
    afterEach(async () => {
        try {
            await withRaw(ctx.port, raw => raw.exec(`import sys; sys.ps1 = '>>> '`))
        } catch (_err) {
            await setPs1('>>> ')
        }
    })

    it('the standard prompt needs nothing special', async () => {
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('hello')`)), 'hello')
        })
    })

    /*
     * The cycle ViperIDE performs for every board operation - enter raw mode, run
     * something, leave again - against a prompt that is not '>>> '. Both cases:
     * aiorepl's, which is known up front, and one that has to be read from sys.ps1.
     */
    for (const prompt of ['--> ', 'vp> ']) {
        it(`a board prompting with ${prompt.trim()} is driven`, async () => {
            if (!await hasPs1()) { skip('this port has no sys.ps1') }

            await setPs1(prompt)

            await withRaw(ctx.port, async (raw) => {
                assert.strictEqual(lines(await raw.exec(`print('other prompt')`)), 'other prompt')
            })

            // ...and it holds for the sessions after it, not just the first one
            await withRaw(ctx.port, async (raw) => {
                assert.strictEqual(lines(await raw.exec(`print('still driveable')`)), 'still driveable')
            })
        })
    }

    /*
     * The deadlock this has to stay clear of: probeRepl() decides whether the app
     * opens a session at all, and only a session can read sys.ps1. A board whose
     * prompt is in no list would be reported busy for ever, and boot.py setting
     * sys.ps1 is enough to do it - nothing about the board is actually running.
     */
    it('probeRepl recognises a prompt it has never seen', async () => {
        if (!await hasPs1()) { skip('this port has no sys.ps1') }

        const prompt = '!!! '
        assert.notInclude(REPL_PROMPTS, prompt, 'this test needs an unknown prompt')
        await setPs1(prompt)

        assert.isTrue(await MpRawMode.probeRepl(ctx.port),
            'an idle board with an unknown prompt was reported busy')

        // ...and the session the probe unblocks is what learns the real value
        await withRaw(ctx.port, raw => raw.exec(`pass`))
        assert.include(REPL_PROMPTS, prompt, 'the prompt was never read from sys.ps1')
    })

    /*
     * Every operation begins by interrupting the board, so whatever that interrupt
     * echoes goes to the terminal on every file list, read, write and run. The prompt
     * a board answers Ctrl-C with is the reply to a question ViperIDE asked - not
     * output the user wants to see.
     */
    it('opening a session is silent on the terminal', async () => {
        const shown = await captureOutput(ctx.port, async () => {
            await withRaw(ctx.port, raw => raw.exec(`pass`))
        })
        assert.strictEqual(shown, '', 'the interrupt echoed itself to the terminal')
    })

    /*
     * Ctrl-A is ignored by a board that is running, so a session has to interrupt
     * before it can enter raw mode. This is the path app.js takes when
     * 'interrupt-running-code' is set and the board did not answer a probe.
     */
    it('a running board is interrupted on the way into raw mode', async () => {
        if (!ctx.caps.interrupt) { skip('the wasm REPL cannot be interrupted while running') }

        const release = await ctx.port.startTransaction()
        try {
            await toPrompt(ctx.port)
            await ctx.port.write('while 1: pass\r\n\r\n')
            await sleep(500)
        } finally {
            release()
        }

        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('recovered')`)), 'recovered')
        })
    })

    /*
     * Stopping a program is not a reason to lose what it had already printed. The
     * bare prompt an idle board answers with is suppressed (above); a program's
     * output is not, however many lines of it there are.
     *
     * The loop prints flat out on purpose. Throttled with a sleep it proves nothing:
     * the Ctrl-C lands within a round trip of the transaction opening, so everything
     * printed before that was consumed by the transaction before this one, and the
     * assertion passes or fails on which test held the buffer rather than on
     * anything the interrupt does.
     */
    it('what an interrupted program printed still reaches the terminal', async () => {
        if (!ctx.caps.interrupt) { skip('the wasm REPL cannot be interrupted while running') }

        const release = await ctx.port.startTransaction()
        try {
            await toPrompt(ctx.port)
            await ctx.port.write(`while 1: print('tick')\r\n\r\n`)
            await sleep(500)
        } finally {
            release()
        }

        const shown = await captureOutput(ctx.port, async () => {
            await withRaw(ctx.port, raw => raw.exec(`pass`))
        })
        assert.include(shown, 'tick', 'the interrupted program\'s output was swallowed')
    })
})
