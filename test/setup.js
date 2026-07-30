/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Everything the suites need that is not a board helper: the options, the connected
 * target, the `ctx` they read it from, `skip()`, and the two Chai assertions a board
 * test cannot do without.
 *
 * Mocha loads this through `--require` (see .mocharc.json) before any suite, so the
 * board is connected once for the whole run and `assert` is already extended by the
 * time the first suite is imported. There is no runner of our own: `mocha --grep`,
 * `--bail`, `--reporter`, `--dry-run` and friends are the interface.
 */

import { assert, config, use } from 'chai'
import Pending from 'mocha/lib/pending.js'

import { makeVMTransport, makeSerialTransport, listSerialPorts, WebSocketREPL }
    from '../src/transports/node.mjs'
import { withRaw, rmTree, mkdirp } from './board.js'

/*
 * Options
 *
 * Mocha owns the command line, so what is left comes from the environment:
 *
 *   VIPER_TEST_TARGET     vm (default) | COM7 | /dev/ttyACM0 | ws://host:8266
 *   VIPER_TEST_PASSWORD   WebREPL password
 *   VIPER_TEST_BAUD       serial baud rate (default 115200)
 *   VIPER_TEST_ROOT       scratch directory on the board (default <fs>/viper_test)
 *   VIPER_TEST_KEEP       keep the scratch directory afterwards
 *   VIPER_TEST_OFFLINE    skip the tests that need network access
 *   VIPER_TEST_VERBOSE    let the modules under test log to the console
 */
const opts = {
    target:   process.env.VIPER_TEST_TARGET || 'vm',
    password: process.env.VIPER_TEST_PASSWORD || null,
    baud:     parseInt(process.env.VIPER_TEST_BAUD || '115200', 10),
    root:     process.env.VIPER_TEST_ROOT || null,
    keep:     !!process.env.VIPER_TEST_KEEP,
    offline:  !!process.env.VIPER_TEST_OFFLINE,
    verbose:  !!process.env.VIPER_TEST_VERBOSE,
}

/*
 * The board context
 *
 * Mocha's own per-suite context is reachable through `this`, which arrow functions do
 * not bind, so the connected board is handed to the suites through this object instead.
 * It is empty until the root hook below fills it in - read its fields inside a test or
 * hook, never at module scope.
 */
export const ctx = {
    port: null,     // the connected Transport
    dev: null,      // getDeviceInfo() of the board under test
    root: null,     // scratch directory on the board
    opts,           // the options above
    caps: {},       // what this target is able to do
}

/*
 * Skipping
 */

let currentTest = null

/*
 * Aborts the current test and reports it as pending rather than failed. Use for
 * conditions that are a property of the board/target, not a defect: a filesystem that
 * rejects a name, a missing module, an unsupported feature.
 *
 * Works from any depth, including the board helpers a test calls, which is why it does
 * not go through Mocha's `this.skip()`.
 */
export function skip(reason) {
    if (!currentTest) {
        throw new Error(`skip('${reason}') outside of a test - use skipSuite(this, reason) in a hook`)
    }
    currentTest.title += ` (${reason})`
    currentTest.pending = true
    throw new Pending(reason)
}

/*
 * Skips a whole suite from its `before` hook, which therefore has to be a plain
 * `function` and not an arrow. The reason is printed once instead of being repeated
 * on every test the hook would have set up.
 */
export function skipSuite(hookThis, reason) {
    console.log(`    (skipped: ${reason})`)
    hookThis.skip()
}

/*
 * Assertions
 *
 * Chai's assert interface, imported straight from 'chai' by the suites, with the two
 * things a board test needs that Chai has no opinion about.
 */

/* Board output is long: a truncated Python traceback or a 4000-character line says
 * nothing about why the test failed. */
config.truncateThreshold = 200

use(({ Assertion, AssertionError }) => {

    /*
     * assert.bytesEqual(actual, expected, [msg])
     *
     * A deep equal on two Uint8Arrays would print both buffers in full and leave the
     * reader to find the difference; a 2 KiB blob makes that unreadable. This reports
     * the first differing byte with the bytes around it on either side.
     */
    assert.bytesEqual = function (actual, expected, msg) {
        const a = new Uint8Array(actual)
        const b = new Uint8Array(expected)
        if (a.length !== b.length) {
            throw new AssertionError(`${msg ? msg + ': ' : ''}length mismatch: ` +
                `expected ${b.length} bytes, got ${a.length}`)
        }
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
                throw new AssertionError(`${msg ? msg + ': ' : ''}byte ${i} differs: ` +
                    `expected 0x${hex(b[i])}, got 0x${hex(a[i])}` +
                    `\n      expected around: ${hexDump(b, i)}` +
                    `\n      actual   around: ${hexDump(a, i)}`)
            }
        }
    }

    /*
     * await assert.rejects(fn, [match], [msg]) -> the error
     *
     * Chai's assert.throws is synchronous, and every board operation is a promise. The
     * error is returned so a test can go on to check it; a skip() raised inside fn is
     * passed through instead of being counted as the expected failure.
     */
    assert.rejects = async function (fn, match, msg) {
        let err = null
        try {
            await fn()
        } catch (e) {
            err = e
        }
        if (!err) {
            throw new AssertionError(msg || 'Expected an error, but the call succeeded')
        }
        if (err instanceof Pending) { throw err }
        if (match instanceof RegExp) {
            new Assertion(String(err.message), msg).to.match(match)
        } else if (match !== undefined) {
            new Assertion(String(err.message), msg).to.include(match)
        }
        return err
    }
})

function hex(b) { return b.toString(16).padStart(2, '0') }

function hexDump(arr, at, span = 6) {
    const from = Math.max(0, at - span)
    const to = Math.min(arr.length, at + span + 1)
    return [...arr.slice(from, to)].map(hex).join(' ')
}

/*
 * The target
 */

/* The target names itself: 'vm', a WebREPL url, or a serial device path. */
async function connect(target) {
    let port
    if (target === 'vm') {
        port = await makeVMTransport()
    } else if (target.startsWith('ws://') || target.startsWith('wss://')) {
        port = new WebSocketREPL(target)
        port.onPasswordRequest(() => opts.password)
    } else {
        port = await makeSerialTransport(target, opts.baud)
    }
    await port.requestAccess()
    await port.connect()
    return port
}

/* Boards that mount their user filesystem elsewhere (STM32 -> /flash) must not be
 * written to at '/'. Derive the writable prefix the same way package_mgr.js does. */
function fsPrefix(devInfo) {
    const sp = devInfo.sys_path || []
    if (sp.includes('/flash') || sp.includes('/flash/lib')) { return '/flash' }
    return ''
}

/* A board that is not there is an operator error, not a stack trace: say what failed
 * and, for a serial target, what is actually plugged in. */
async function connectOrExplain(target) {
    try {
        return await connect(target)
    } catch (err) {
        // A failed WebSocket handshake rejects with an event object rather than an Error.
        const why = err.message || (err.type === 'error' ? `WebSocket to ${target} failed` : String(err))
        let hint = ''
        if (target !== 'vm' && !target.startsWith('ws')) {
            try {
                const ports = await listSerialPorts()
                hint = `\nAvailable ports: ${ports.map(p => p.path).join(', ') || '(none)'}`
            } catch (_err) { /* serialport itself is what failed */ }
        }
        throw new Error(`Cannot connect to ${target}: ${why}${hint}`, { cause: err })
    }
}

/*
 * Root hooks
 */

/* The modules under test log progress with console.log/debug (e.g. writeFile). Capture
 * it while a test runs so the report stays readable; VIPER_TEST_VERBOSE passes it
 * through. The reporters are unaffected: Mocha keeps its own reference to console.log. */
let restoreLogs = null

export const mochaHooks = {

    async beforeAll() {
        this.timeout(0)
        ctx.port = await connectOrExplain(opts.target)

        const dev = ctx.dev = await withRaw(ctx.port, raw => raw.getDeviceInfo())
        ctx.root = opts.root || `${fsPrefix(dev)}/viper_test`
        ctx.caps = {
            network: !opts.offline,
            // The wasm REPL runs Python on the same thread that feeds it input, so a
            // busy loop cannot be broken with Ctrl-C - see src/emulator.js.
            interrupt: opts.target !== 'vm',
            softReboot: opts.target !== 'vm',
            // On a real board execution continues after we stop writing; the wasm build
            // finishes the statement inside replProcessCharWithAsyncify().
            asyncExec: opts.target !== 'vm',
        }

        console.log(`Target: ${opts.target}`)
        console.log(`Board:  ${dev.machine || '(unknown)'}`)
        console.log(`Info:   ${dev.version}, mpy v${dev.mpy_ver}.${dev.mpy_sub} ${dev.mpy_arch || '(no arch)'}`)
        console.log(`Path:   ${dev.sys_path.join(':')}`)
        console.log(`Scratch: ${ctx.root}`)

        await withRaw(ctx.port, async (raw) => {
            await rmTree(raw, ctx.root)
            await mkdirp(raw, ctx.root)
        })
    },

    async afterAll() {
        this.timeout(0)
        if (!ctx.port) { return }
        try {
            if (opts.keep) {
                console.log(`Left ${ctx.root} on the board (VIPER_TEST_KEEP)`)
            } else if (ctx.root) {
                await withRaw(ctx.port, raw => rmTree(raw, ctx.root))
            }
        } catch (err) {
            console.error(`Cleanup of ${ctx.root} failed: ${err.message}`)
        }
        try {
            await ctx.port.disconnect()
        } catch (_err) { /* the board may already be gone */ }
        ctx.port = null
    },

    beforeEach() {
        currentTest = this.currentTest
        if (opts.verbose) { return }
        const saved = { log: console.log, debug: console.debug }
        console.log = () => {}
        console.debug = () => {}
        restoreLogs = () => { console.log = saved.log; console.debug = saved.debug }
    },

    afterEach() {
        if (restoreLogs) { restoreLogs(); restoreLogs = null }
        currentTest = null
    },
}
