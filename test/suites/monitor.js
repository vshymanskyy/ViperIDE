/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * ReplMonitor: the passive watcher that tells the app a board soft-rebooted or
 * came back to the prompt. Runs on synthetic chunks - no board involved - plus
 * the transport read-abort contract, which does use the connected target.
 */

import { ctx } from '../setup.js'
import { assert } from 'chai'
import { ReplMonitor } from '../../src/repl_monitor.js'
import { sleep, toPrompt } from '../board.js'

/* Fast enough for a test, long enough to observe the wait. */
const SETTLE = 50

function makeMonitor(overrides = {}) {
    const events = { softReset: 0, promptSettled: 0 }
    const monitor = new ReplMonitor(Object.assign({
        onSoftReset: () => { events.softReset++ },
        onPromptSettled: () => { events.promptSettled++ },
        settleMs: SETTLE,
    }, overrides))
    return { monitor, events }
}

describe('ReplMonitor', () => {

    it('detects the MicroPython soft reboot banner', () => {
        const { monitor, events } = makeMonitor()
        monitor.feed('\r\nMPY: soft reboot\r\n')
        assert.strictEqual(events.softReset, 1)
    })

    it('detects the CircuitPython banner without the MPY prefix', () => {
        const { monitor, events } = makeMonitor()
        monitor.feed('\nsoft reboot\n')
        assert.strictEqual(events.softReset, 1)
    })

    it('detects a banner split across chunks', () => {
        const { monitor, events } = makeMonitor()
        monitor.feed('\r\nMPY: soft re')
        assert.strictEqual(events.softReset, 0)
        monitor.feed('boot\r\n')
        assert.strictEqual(events.softReset, 1)
    })

    it('fires once per banner, not once per following chunk', () => {
        const { monitor, events } = makeMonitor()
        monitor.feed('\r\nMPY: soft reboot\r\n')
        monitor.feed('MicroPython v1.23.0 on 2024-06-02\r\n')
        assert.strictEqual(events.softReset, 1)
    })

    it("ignores 'soft reboot' in the middle of a line", () => {
        const { monitor, events } = makeMonitor()
        monitor.feed("print('a soft reboot is coming')\r\n")
        assert.strictEqual(events.softReset, 0)
    })

    /* A board reset by its button, or over a serial bridge that outlives it, never
       says 'soft reboot' - it just introduces itself again. */
    it('detects the friendly REPL greeting', () => {
        const { monitor, events } = makeMonitor()
        monitor.feed('MicroPython v1.23.0 on 2024-06-02; ESP32 module\r\n' +
                     'Type "help()" for more information.\r\n>>> ')
        assert.strictEqual(events.softReset, 1)
    })

    it('detects a greeting that opens the stream', () => {
        const { monitor, events } = makeMonitor()
        monitor.feed('Type "help()" for more information.\r\n')
        assert.strictEqual(events.softReset, 1)
    })

    it("ignores the greeting quoted mid-line", () => {
        const { monitor, events } = makeMonitor()
        monitor.feed('>>> print(\'Type "help()" for more information.\')\r\n')
        assert.strictEqual(events.softReset, 0)
    })

    it('expectBanner swallows exactly one greeting', () => {
        const { monitor, events } = makeMonitor()
        // Ctrl-B asks for the greeting, so the one that comes back is not a restart
        monitor.expectBanner()
        monitor.feed('MicroPython v1.23.0 on 2024-06-02; ESP32 module\r\n' +
                     'Type "help()" for more information.\r\n>>> ')
        assert.strictEqual(events.softReset, 0)

        // ...but the board restarting straight afterwards still counts
        monitor.feed('\r\nMPY: soft reboot\r\n')
        assert.strictEqual(events.softReset, 1)
    })

    it('an expected banner that never arrives stops being expected', async () => {
        const { monitor, events } = makeMonitor()
        monitor.expectBanner(SETTLE)
        await sleep(SETTLE * 3)
        monitor.feed('\r\nMPY: soft reboot\r\n')
        assert.strictEqual(events.softReset, 1, 'the suppression outlived its window')
    })

    it('reports a prompt only after it settles', async () => {
        const { monitor, events } = makeMonitor()
        monitor.setWatchPrompt(true)
        monitor.feed('done\r\n>>> ')
        assert.strictEqual(events.promptSettled, 0, 'must not fire before the wait')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 1)
    })

    /* A board running aiorepl is at a prompt and waiting, exactly like one at '>>> '.
       Not recognising it leaves a busy board busy forever: the monitor is what
       promotes it once it goes quiet, and nothing else will. */
    it("reports aiorepl's prompt the same as the built-in one", async () => {
        const { monitor, events } = makeMonitor()
        monitor.setWatchPrompt(true)
        monitor.feed('done\r\n--> ')
        assert.strictEqual(events.promptSettled, 0, 'must not fire before the wait')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 1)
    })

    it("more output after aiorepl's prompt restarts the wait", async () => {
        const { monitor, events } = makeMonitor()
        monitor.setWatchPrompt(true)
        monitor.feed('--> ')
        monitor.feed('x\r\n')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 0, 'the prompt was consumed by output')
        monitor.feed('--> ')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 1)
    })

    it('a prompt scrolling past mid-output does not fire', async () => {
        const { monitor, events } = makeMonitor()
        monitor.setWatchPrompt(true)
        monitor.feed('>>> here is an echo\r\nmore output\r\n')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 0)
    })

    it('more output after a prompt restarts the wait', async () => {
        const { monitor, events } = makeMonitor()
        monitor.setWatchPrompt(true)
        monitor.feed('>>> ')
        monitor.feed('x\r\n')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 0, 'the prompt was consumed by output')
        monitor.feed('>>> ')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 1, 'the quiet prompt must still be seen')
    })

    it('does not watch for prompts unless asked to', async () => {
        const { monitor, events } = makeMonitor()
        monitor.feed('>>> ')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 0)
    })

    it('disarming cancels a wait already in progress', async () => {
        const { monitor, events } = makeMonitor()
        monitor.setWatchPrompt(true)
        monitor.feed('>>> ')
        monitor.setWatchPrompt(false)
        await sleep(SETTLE * 3)
        assert.strictEqual(events.promptSettled, 0)
    })

    it('reset() clears the tail and any pending wait', async () => {
        const { monitor, events } = makeMonitor()
        monitor.setWatchPrompt(true)
        monitor.feed('\r\nMPY: soft re')
        monitor.feed('>>> ')
        monitor.reset()
        monitor.feed('boot\r\n')
        await sleep(SETTLE * 3)
        assert.strictEqual(events.softReset, 0, 'the split banner must not survive a reset')
        assert.strictEqual(events.promptSettled, 0)
    })

    it('keeps only a bounded tail', () => {
        const { monitor } = makeMonitor({ tailSize: 64 })
        monitor.feed('x'.repeat(10000))
        assert.strictEqual(monitor.tail.length, 64)
        // A banner arriving after heavy output must still match
        const { monitor: m2, events } = makeMonitor({ tailSize: 64 })
        m2.feed('x'.repeat(10000))
        m2.feed('\r\nMPY: soft reboot\r\n')
        assert.strictEqual(events.softReset, 1)
    })
})

describe('Transport read-abort', () => {

    it('abortReads() makes a pending read throw promptly', async () => {
        const release = await ctx.port.startTransaction()
        try {
            const pending = assert.rejects(
                () => ctx.port.readUntil('\x00never\x00', 60000), /Timeout/)
            await sleep(50)
            ctx.port.abortReads()
            const started = Date.now()
            await pending
            assert(Date.now() - started < 1000, 'the read did not end promptly')
        } finally {
            await ctx.port.flushInput()
            release()
        }
    })

    it('the next transaction clears the abort and reads again', async () => {
        const release = await ctx.port.startTransaction()
        try {
            await toPrompt(ctx.port)
        } finally {
            release()
        }
    })
})
