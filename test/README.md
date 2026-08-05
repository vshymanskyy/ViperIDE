# Board interaction test suite

A [Mocha](https://mochajs.org) + [Chai](https://www.chaijs.com) suite that drives a
MicroPython/CircuitPython board
through **the same code ViperIDE ships** - `src/rawmode.js`, `src/transports/` and
`src/package_mgr.js` are loaded from `src/`, not reimplemented here (see
[How it works](#how-it-works)).

```bash
npm test                                          # MicroPython WASM, no hardware required
VIPER_TEST_TARGET=COM7 npm test                   # serial board (Windows)
VIPER_TEST_TARGET=/dev/ttyACM0 npm test           # serial board (Linux/macOS)
VIPER_TEST_TARGET=ws://192.168.1.5:8266 VIPER_TEST_PASSWORD=secret npm test
```

`npm test` is plain `mocha`: `.mocharc.json` in the repository root points it at
`test/suites/` and at `test/setup.js`, whose root hooks connect the board once for
the whole run. There is no runner of our own, so the Mocha command line is the interface:

```bash
npx mocha --grep "Files / text"            # only the matching suites/tests
npx mocha --bail --reporter dot            # stop at the first failure
npx mocha --dry-run                        # list the tests without a board
npx mocha --watch
```

## Targets

The target names itself in `VIPER_TEST_TARGET`:

| Target   | How to select                        | Notes |
|----------|--------------------------------------|-------|
| `vm`     | the default                          | The `@micropython/micropython-webassembly-pyscript` build ViperIDE uses as its virtual device. Runs anywhere, no board needed. |
| serial   | `COM7`, `/dev/ttyACM0`               | Needs `npm install --no-save serialport`; the copy under `mcp/node_modules` is used if present. |
| WebREPL  | `ws://host:8266`                     | Uses Node's built-in `WebSocket`, no extra package. Works against `mcp/src/serial-bridge.js` too. |

## Options

Mocha owns the command line, so what is left comes from the environment:

```
VIPER_TEST_TARGET     vm (default) | COM7 | /dev/ttyACM0 | ws://host:8266
VIPER_TEST_PASSWORD   WebREPL password
VIPER_TEST_BAUD       serial baud rate (default 115200)
VIPER_TEST_ROOT       scratch directory on the board (default <fs>/viper_test)
VIPER_TEST_KEEP       keep the scratch directory on the board afterwards
VIPER_TEST_OFFLINE    skip the tests that need network access
VIPER_TEST_VERBOSE    show console output from the modules under test
```

Everything the suite creates lives under a single scratch directory (`/viper_test`, or
`/flash/viper_test` on boards that mount their filesystem there). It is removed before
and after the run. Package installs are redirected into `<root>/lib` by handing the
package manager a device descriptor whose `sys.path` points there - **the board's own
`/lib` is never written to.**

## Suites

- **REPL** - raw mode entry/exit, `exec()` stdout/exception/timeout handling, large and
  UTF-8 output, globals across sessions, transport mutex under concurrent sessions,
  Ctrl-C recovery from a busy loop, soft reboot, `getDeviceInfo`/`getFsStats`.
- **Files / text** - ASCII, empty, no trailing newline, CRLF and lone CR, UTF-8, Python
  sources full of quotes and backslashes, 4000-character lines, truncating overwrites.
- **Files / binary** - all 256 byte values, raw-REPL control bytes (`0x01`–`0x05`) as
  *content*, pseudo-random blobs, sizes straddling the 128-byte chunk boundary, `.mpy`
  headers, `direct` writes, and the atomic-write temp file being cleaned up.
- **Files / directories** - `makePath` nesting and idempotency, `touchFile`, `removeFile`
  / `removeDir` including the non-empty and wrong-type cases, `removeTree` on a populated
  subtree, `movePath` for files and whole directories including the clobber refusal,
  `walkFs` paths and sizes.
- **Files / errors** - missing files and directories, and that the session survives them.
- **Files / names** - 20 awkward file names (quotes, backslashes, shell metacharacters,
  dotfiles, trailing dots, Cyrillic, CJK, emoji, combining accents, RTL, 100 characters),
  plus quoted and unicode *directory* names, and case-collision behaviour.
- **Files / hostile names** - names containing characters `pyStr()` does not escape.
- **Packages** - index loading, `findPkg`, source and precompiled `.mpy` installs from
  micropython-lib, nested module directories, the `v3.viper-ide` featured index, direct
  `github:` URLs, dependency resolution (both `"name"` and `["name", "ver"]` forms),
  reinstalls, and the error paths.

A test that cannot run because of a board limitation rather than a defect calls
`skip(reason)` and is reported as **pending**, with the reason appended to its title —
e.g. a filesystem that refuses a name, or a port without `statvfs`. `skip()` works from
any depth, including the board helpers a test calls; a `before` hook that has to skip its
whole suite uses `skipSuite(this, reason)` instead. Only mismatches (a name that comes
back altered, content that does not round-trip) fail.

## How it works

The point of this suite is to exercise the *real* ViperIDE code that talks to a board, so
every module under test is imported straight from `src/` - nothing here re-implements or
rewrites one. That works because the browser-only half of the code is kept in its own
modules: `src/utils.js` has no imports at all and `src/utils_browser.js` holds everything
that needs a page. Anything a suite imports has to stay on the portable side of that line.

Transports are split under `src/transports/`. The base class and the WebREPL transport are
shared with the browser; `src/transports/node.mjs` is the barrel this suite connects
through, adding the serial and wasm-VM transports that only exist under Node.

## Layout

```
test/
  setup.js            options, the target, ctx, skip(), the Chai extensions, root hooks
  board.js            escaping-proof board-side helpers used to set up and verify tests
  suites/*.js         the tests
```

`.mocharc.json`, in the repository root next to `package.json`, is what ties them
together: it is the only thing that has to name `setup.js`.

`board.js` deliberately does not reuse `MpRawMode`'s path handling: paths go to the
device as byte lists and names come back hex-encoded, so a test can tell "the board
cannot store this name" apart from "ViperIDE mangled it". Verifying a write with the
same escaping that performed it would make the *Files / names* suites tautological - it
is what let them catch `pyStr()` mangling a control character.

## Writing a test

Suites are plain Mocha `describe`/`it`, with the connected board in the `ctx` object that
the root hooks fill in. Read its fields inside a test or hook, never at module scope —
Mocha's own per-suite context is not an option here, because arrow functions do not bind
`this`.

```js
import { ctx, skip } from '../setup.js'
import { assert } from 'chai'
import { withRaw } from '../board.js'

describe('My suite', () => {
    let dir
    before(async () => {
        dir = `${ctx.root}/mine`                    // ctx.root is the scratch directory
        await withRaw(ctx.port, raw => raw.makePath(dir))
    })

    it('does something to the board', async () => {
        if (!ctx.caps.softReboot) { skip('not supported by this target') }
        await withRaw(ctx.port, async (raw) => {
            assert.strictEqual((await raw.exec(`print(1 + 1)`)).trim(), '2')
        })
    })
})
```

`assert` is [Chai's assert interface](https://www.chaijs.com/api/assert/) as it comes.
`setup.js` adds two assertions to it before any suite is loaded, because Chai has no
opinion about either:

- `assert.bytesEqual(actual, expected, [msg])` - compares two byte arrays and names the
  first byte that differs, with the bytes around it, instead of printing both buffers.
- `await assert.rejects(fn, [match], [msg])` - Chai's `assert.throws` is synchronous, and
  every board operation is a promise. Returns the error, so a test can keep checking it.

A new file under `suites/` needs no registration: `.mocharc.json` picks it up.
