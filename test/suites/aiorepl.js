/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * A board whose REPL is aiorepl rather than the built-in one. This is the case the
 * prompt handling exists for, and the only one that cannot be faked: aiorepl prints
 * '--> ' itself and never sets sys.ps1, so a board running it answers a sys.ps1 read
 * with '>>> ' while showing something else. Setting sys.ps1 (see prompt.js) puts the
 * prompt in the right place but leaves it detectable, which is precisely the part
 * that does not happen for real.
 *
 * Needs a board that is already running aiorepl - this suite never changes what is
 * on the other end, it only drives it. Point VIPER_TEST_TARGET at a board whose
 * main.py hands the REPL over:
 *
 *     import asyncio, aiorepl
 *     asyncio.run(aiorepl.task())
 *
 * Anything else skips. The wasm target can never qualify: it only runs Python inside
 * a write call and never hands stdin to the asyncio task, so aiorepl there prints its
 * greeting and the prompt stays '>>> '.
 *
 *   VIPER_TEST_TARGET=COM7 npx mocha --grep aiorepl
 */

import { ctx, skipSuite } from '../setup.js'
import { assert } from 'chai'
import { MpRawMode, withRaw, lines, REPL_PROMPTS } from '../board.js'

const decoder = new TextDecoder('utf-8')

const PROMPT = '--> '

/* Which REPL is answering. Ctrl-C rather than Enter: it gets a prompt back out of a
   board that is running something, and out of one that is not. */
async function atAiorepl() {
    const release = await ctx.port.startTransaction()
    try {
        await ctx.port.write('\x03')
        const at = await ctx.port.readUntil(REPL_PROMPTS, 5000)
        await ctx.port.flushInput()
        return at.endsWith(PROMPT)
    } catch (_err) {
        return false          // no prompt at all is not an aiorepl board either
    } finally {
        release()
    }
}

describe('aiorepl', () => {

    /* Plain function, not an arrow: skipSuite needs the hook context. */
    before(async function () {
        this.timeout(0)
        if (!await atAiorepl()) {
            skipSuite(this, 'this board is not running aiorepl')
        }
    })

    /*
     * The whole point. Raw mode is entered with Ctrl-A, which aiorepl implements
     * itself, but everything around it - the interrupt before, the prompt waited on
     * after - used to be a literal '>>> ' and would hang here.
     */
    it('a full raw-mode cycle runs against the aiorepl prompt', async () => {
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('under aiorepl')`)), 'under aiorepl')
        })
    })

    it('session after session keeps working', async () => {
        for (let i = 0; i < 3; i++) {
            await withRaw(ctx.port, async (raw) => {
                assert.strictEqual(lines(await raw.exec(`print(${i})`)), String(i))
            })
        }
    })

    /* Leaving raw mode has to land back on aiorepl's prompt, not on a '>>> ' that
       never comes - otherwise the session ends by timing out. */
    it('leaving raw mode lands back on the aiorepl prompt', async () => {
        await withRaw(ctx.port, raw => raw.exec(`pass`))

        const release = await ctx.port.startTransaction()
        try {
            await ctx.port.write('\r')
            assert.include(await ctx.port.readUntil(PROMPT, 5000), PROMPT)
        } finally {
            await ctx.port.flushInput()
            release()
        }
    })

    it('files can be written and read back', async () => {
        await withRaw(ctx.port, async (raw) => {
            const path = `${ctx.root}/aiorepl.txt`
            await raw.writeFile(path, 'hello from aiorepl')
            assert.strictEqual(decoder.decode(await raw.readFile(path)), 'hello from aiorepl')
        })
    })

    it('device info can be read', async () => {
        const info = await withRaw(ctx.port, raw => raw.getDeviceInfo())
        assert(info.version && info.version.length, 'version is empty')
    })

    /*
     * What decides whether the app comes up 'ready' or sits in 'busy-running': a
     * board at the aiorepl prompt is listening, and answering 'no' here leaves
     * initDeviceSession() waiting for a '>>> ' that is never coming.
     */
    it('probeRepl sees the aiorepl prompt as an idle board', async () => {
        assert.isTrue(await MpRawMode.probeRepl(ctx.port, 1500))
    })

    /* The probe must not have disturbed anything on its way past. */
    it('the board is still usable after being probed', async () => {
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual(lines(await raw.exec(`print('after probe')`)), 'after probe')
        })
    })
})
