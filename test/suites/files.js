/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * File operations: text and binary round-trips, directories, listings, error paths.
 */

import { ctx, skip } from '../setup.js'
import { assert } from 'chai'
import { withRaw, statPath, exists, listNames, listTree, mkdirp, rmTree } from '../board.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

const bytes = (s) => encoder.encode(s)

/* Writes with the shipped writeFile(), reads back with the shipped readFile(), and
 * cross-checks the on-device size with an independent stat. */
async function roundTrip(raw, path, data, { chunk = 128, direct = false } = {}) {
    const expected = (typeof data === 'string') ? bytes(data) : new Uint8Array(data)
    await raw.writeFile(path, data, chunk, direct)

    const st = await statPath(raw, path)
    assert(st, `${path} does not exist after writeFile`)
    assert.strictEqual(st.type, 'f', `${path} is not a regular file`)
    assert.strictEqual(st.size, expected.length, `on-device size of ${path}`)

    assert.bytesEqual(await raw.readFile(path), expected, `content of ${path}`)
    return expected
}

function flattenWalk(nodes, prefix = '') {
    const out = []
    for (const node of nodes) {
        const path = `${prefix}/${node.name}`
        if ('content' in node) {
            out.push(...flattenWalk(node.content, path))
        } else {
            out.push({ path, size: node.size })
        }
    }
    return out
}

describe('Files / text', () => {

    let dir
    before(async () => {
        dir = `${ctx.root}/text`
        await withRaw(ctx.port, raw => mkdirp(raw, dir))
    })

    it('ascii round-trip', async () => {
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/plain.py`, "print('hello')\n"))
    })

    it('empty file', async () => {
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/empty.txt`, ''))
    })

    it('no trailing newline', async () => {
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/notrail.txt`, 'last line without newline'))
    })

    it('CRLF and lone CR are preserved verbatim', async () => {
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/crlf.txt`, 'a\r\nb\rc\nd\n\r\n'))
    })

    it('utf-8 content', async () => {
        const text = 'Привіт, 世界!\nEmoji: 🐍🚀✨\nCombining: e\u0301\nRTL: مرحبا\n'
        await withRaw(ctx.port, async (raw) => {
            const expected = await roundTrip(raw, `${dir}/utf8.txt`, text)
            assert.strictEqual(decoder.decode(expected), text, 'decoded text')
        })
    })

    it('python source with quotes, backslashes and triple quotes', async () => {
        const src = [
            `s = 'single' + "double"`,
            `t = """triple\nquoted"""`,
            `p = 'C:\\\\Users\\\\test'`,
            `r = r'\\x04 raw'`,
            `# comment with \u0004 and \u0001 escapes written literally`,
            ``,
        ].join('\n')
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/tricky.py`, src))
    })

    it('very long single line', async () => {
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/longline.txt`, 'A'.repeat(4000)))
    })

    it('overwriting with shorter content truncates', async () => {
        const path = `${dir}/shrink.txt`
        await withRaw(ctx.port, async (raw) => {
            await roundTrip(raw, path, 'X'.repeat(500))
            await roundTrip(raw, path, 'short')
        })
    })
})

describe('Files / binary', () => {

    let dir
    before(async () => {
        dir = `${ctx.root}/bin`
        await withRaw(ctx.port, raw => mkdirp(raw, dir))
    })

    it('all 256 byte values', async () => {
        const data = new Uint8Array(256)
        for (let i = 0; i < 256; i++) { data[i] = i }
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/all_bytes.bin`, data))
    })

    it('raw-REPL control bytes in file content', async () => {
        // 0x01..0x05 are the raw REPL's own control codes; they must survive as data.
        const pattern = [0x04, 0x01, 0x02, 0x03, 0x05, 0x0d, 0x0a, 0x00]
        const data = new Uint8Array(512)
        for (let i = 0; i < data.length; i++) { data[i] = pattern[i % pattern.length] }
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/ctrl.bin`, data))
    })

    it('pseudo-random 2 KiB blob', async () => {
        const data = new Uint8Array(2048)
        let seed = 0x2545f491
        for (let i = 0; i < data.length; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff
            data[i] = (seed >> 16) & 0xff
        }
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/random.bin`, data))
    })

    it('sizes around the chunk boundary', async () => {
        await withRaw(ctx.port, async (raw) => {
            for (const size of [1, 127, 128, 129, 255, 256, 257]) {
                const data = new Uint8Array(size).fill(0xab)
                await roundTrip(raw, `${dir}/chunk_${size}.bin`, data)
            }
        })
    })

    it('mpy-like header is stored byte-exact', async () => {
        const data = new Uint8Array([0x4d, 0x06, 0x00, 0x1f, 0x20, 0x00, 0x00, 0x00, 0xff, 0x80, 0x04])
        await withRaw(ctx.port, raw => roundTrip(raw, `${dir}/module.mpy`, data))
    })

    it('direct write bypasses the temp file', async () => {
        const data = new Uint8Array([1, 2, 3, 4, 5])
        await withRaw(ctx.port, async (raw) => {
            await roundTrip(raw, `${dir}/direct.bin`, data, { direct: true })
        })
    })

    it('atomic write leaves no .viper.tmp behind', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.writeFile(`${dir}/atomic.bin`, new Uint8Array([9, 9, 9]))
            assert(!(await exists(raw, '/.viper.tmp')), '/.viper.tmp was left on the board')
            assert(!(await exists(raw, '.viper.tmp')), '.viper.tmp was left in the working directory')
        })
    })
})

describe('Files / directories', () => {

    let dir
    before(async () => {
        dir = `${ctx.root}/dirs`
        await withRaw(ctx.port, raw => mkdirp(raw, dir))
    })

    it('makePath creates nested directories', async () => {
        const deep = `${dir}/a/b/c`
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(deep)
            for (const p of [`${dir}/a`, `${dir}/a/b`, deep]) {
                assert.strictEqual((await statPath(raw, p))?.type, 'd', `${p} should be a directory`)
            }
        })
    })

    it('makePath is idempotent', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(`${dir}/a/b/c`)
            await raw.makePath(`${dir}/a/b/c`)
            assert.strictEqual((await statPath(raw, `${dir}/a/b/c`))?.type, 'd')
        })
    })

    it('touchFile creates an empty file', async () => {
        const path = `${dir}/touched.txt`
        await withRaw(ctx.port, async (raw) => {
            await raw.touchFile(path)
            assert.strictEqual((await statPath(raw, path))?.size, 0)
        })
    })

    it('touchFile truncates an existing file', async () => {
        const path = `${dir}/truncate_me.txt`
        await withRaw(ctx.port, async (raw) => {
            await raw.writeFile(path, 'some content')
            await raw.touchFile(path)
            assert.strictEqual((await statPath(raw, path))?.size, 0)
        })
    })

    it('files can be written into nested directories', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(`${dir}/a/b/c`)
            await roundTrip(raw, `${dir}/a/b/c/deep.txt`, 'deep')
        })
    })

    it('listdir reports the created entries', async () => {
        await withRaw(ctx.port, async (raw) => {
            const names = await listNames(raw, `${dir}/a/b`)
            assert(names.includes('c'), `expected 'c' in ${JSON.stringify(names)}`)
        })
    })

    it('removeFile deletes a file', async () => {
        const path = `${dir}/to_remove.txt`
        await withRaw(ctx.port, async (raw) => {
            await raw.writeFile(path, 'bye')
            await raw.removeFile(path)
            assert(!(await exists(raw, path)), 'file still exists')
        })
    })

    it('removeDir deletes an empty directory', async () => {
        const path = `${dir}/empty_dir`
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(path)
            await raw.removeDir(path)
            assert(!(await exists(raw, path)), 'directory still exists')
        })
    })

    it('removeDir refuses a non-empty directory', async () => {
        const path = `${dir}/full_dir`
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(path)
            await raw.writeFile(`${path}/f.txt`, 'x')
            const err = await assert.rejects(() => raw.removeDir(path))
            assertMatchesDirNotEmpty(err)
            assert(await exists(raw, `${path}/f.txt`), 'contents were removed anyway')
        })
    })

    it('removeFile refuses a directory', async () => {
        const path = `${dir}/a`
        await withRaw(ctx.port, async (raw) => {
            await assert.rejects(() => raw.removeFile(path))
            assert.strictEqual((await statPath(raw, path))?.type, 'd', 'directory survived')
        })
    })

    it('removeTree deletes a directory with everything inside it', async () => {
        const path = `${dir}/tree`
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(`${path}/sub/deeper`)
            await raw.writeFile(`${path}/top.txt`, 'x')
            await raw.writeFile(`${path}/sub/mid.txt`, 'y')
            await raw.writeFile(`${path}/sub/deeper/leaf.bin`, new Uint8Array([1, 2, 3]))
            await raw.removeTree(path)
            assert(!(await exists(raw, path)), 'directory still exists')
        })
    })

    it('removeTree deletes a plain file', async () => {
        const path = `${dir}/lonely.txt`
        await withRaw(ctx.port, async (raw) => {
            await raw.writeFile(path, 'x')
            await raw.removeTree(path)
            assert(!(await exists(raw, path)), 'file still exists')
        })
    })

    it('removeTree ignores a missing path', async () => {
        await withRaw(ctx.port, raw => raw.removeTree(`${dir}/never_existed`))
    })

    it('movePath renames a file within a directory', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.writeFile(`${dir}/before.txt`, 'content')
            await raw.movePath(`${dir}/before.txt`, `${dir}/after.txt`)
            assert(!(await exists(raw, `${dir}/before.txt`)), 'source still exists')
            assert.strictEqual(decoder.decode(await raw.readFile(`${dir}/after.txt`)), 'content')
        })
    })

    it('movePath moves a file into another directory', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(`${dir}/target`)
            await raw.writeFile(`${dir}/travel.txt`, 'moved')
            await raw.movePath(`${dir}/travel.txt`, `${dir}/target/travel.txt`)
            assert((await listNames(raw, `${dir}/target`)).includes('travel.txt'), 'file did not arrive')
            assert.strictEqual(decoder.decode(await raw.readFile(`${dir}/target/travel.txt`)), 'moved')
        })
    })

    it('movePath moves a directory with its contents', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(`${dir}/movable/inner`)
            await raw.writeFile(`${dir}/movable/inner/file.txt`, 'nested')
            await raw.makePath(`${dir}/dest`)
            await raw.movePath(`${dir}/movable`, `${dir}/dest/movable`)
            assert(!(await exists(raw, `${dir}/movable`)), 'source directory still exists')
            assert.strictEqual(decoder.decode(await raw.readFile(`${dir}/dest/movable/inner/file.txt`)), 'nested')
        })
    })

    it('movePath refuses to overwrite an existing destination', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.writeFile(`${dir}/keep.txt`, 'keep me')
            await raw.writeFile(`${dir}/other.txt`, 'other')
            const err = await assert.rejects(() => raw.movePath(`${dir}/other.txt`, `${dir}/keep.txt`))
            assert.include(err.message, 'Already exists')
            assert.strictEqual(decoder.decode(await raw.readFile(`${dir}/keep.txt`)), 'keep me')
            assert(await exists(raw, `${dir}/other.txt`), 'source was removed anyway')
        })
    })

    it('walkFs reports the test tree with correct sizes', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.makePath(`${ctx.root}/walk`)
            await raw.writeFile(`${ctx.root}/walk/one.txt`, 'a'.repeat(10))
            await raw.makePath(`${ctx.root}/walk/sub`)
            await raw.writeFile(`${ctx.root}/walk/sub/two.txt`, 'b'.repeat(20))

            const files = flattenWalk(await raw.walkFs())
            const one = files.find(f => f.path === `${ctx.root}/walk/one.txt`)
            const two = files.find(f => f.path === `${ctx.root}/walk/sub/two.txt`)
            assert(one, `one.txt missing from walkFs; got ${files.length} files`)
            assert(two, `sub/two.txt missing from walkFs; got ${files.length} files`)
            assert.strictEqual(one.size, 10, 'size of one.txt')
            assert.strictEqual(two.size, 20, 'size of sub/two.txt')
        })
    })

    it('listTree matches what was written', async () => {
        await withRaw(ctx.port, async (raw) => {
            const tree = await listTree(raw, `${ctx.root}/walk`)
            const paths = tree.map(e => e.path).sort()
            assert.strictEqual(paths.join(','), [
                `${ctx.root}/walk/one.txt`, `${ctx.root}/walk/sub`, `${ctx.root}/walk/sub/two.txt`,
            ].sort().join(','))
        })
    })
})

describe('Files / errors', () => {

    it('reading a missing file fails', async () => {
        await withRaw(ctx.port, async (raw) => {
            const err = await assert.rejects(() => raw.readFile(`${ctx.root}/does_not_exist.txt`))
            assert.include(err.message, 'OSError')
        })
    })

    it('removing a missing file fails', async () => {
        await withRaw(ctx.port, async (raw) => {
            await assert.rejects(() => raw.removeFile(`${ctx.root}/does_not_exist.txt`))
        })
    })

    it('removing a missing directory fails', async () => {
        await withRaw(ctx.port, async (raw) => {
            await assert.rejects(() => raw.removeDir(`${ctx.root}/no_such_dir`))
        })
    })

    it('writing into a missing directory fails', async () => {
        await withRaw(ctx.port, async (raw) => {
            await assert.rejects(() => raw.writeFile(`${ctx.root}/no_such_dir/f.txt`, 'x'))
        })
    })

    it('the session still works after a failed operation', async () => {
        await withRaw(ctx.port, raw => roundTrip(raw, `${ctx.root}/after_error.txt`, 'fine'))
    })
})

/*
 * Names that exercise the Python-literal escaping in src/rawmode.js (pyStr) and the
 * board's own filesystem limits. A name the filesystem refuses outright is reported as
 * skipped; a name that is accepted but comes back altered is a failure.
 */

const NAMES = [
    ['spaces',              'two words.txt'],
    ['single quote',        "it's here.txt"],
    ['double quote',        'say "hi".txt'],
    ['backslash',           'back\\slash.txt'],
    ['both quotes',         `mix'and"match.txt`],
    ['percent',             '100%_done.txt'],
    ['hash and query',      'a#b?c=d.txt'],
    ['shell metachars',     'a;b&c$d.txt'],
    ['braces and brackets', '${x}[y](z).txt'],
    ['star and colon',      'a*b:c.txt'],
    ['leading dash',        '-rf.txt'],
    ['dotfile',             '.hidden'],
    ['many dots',           'a.b.c.tar.gz'],
    ['trailing dot',        'trailing.'],
    ['cyrillic',            'привіт.txt'],
    ['cjk',                 '文件名.txt'],
    ['emoji',               '🐍-snake.txt'],
    ['combining accent',    'e\u0301clair.txt'],
    ['rtl',                 'مرحبا.txt'],
    ['long name',           'l'.repeat(100) + '.txt'],
]

/* Names containing characters that pyStr() does not escape. These are the interesting
 * ones: a tab or a control byte spliced into generated Python can desync the raw REPL. */
const HOSTILE_NAMES = [
    ['tab',           'tab\there.txt'],
    ['newline',       'two\nlines.txt'],
    ['control char',  'ctrl\x01char.txt'],
]

const FS_REJECTED = /OSError|EINVAL|ENAMETOOLONG|EPERM|\[Errno/

async function nameRoundTrip(raw, dir, name) {
    const path = `${dir}/${name}`
    const data = bytes(`payload for ${name.replace(/[^\x20-\x7e]/g, '?')}`)

    try {
        await raw.writeFile(path, data)
    } catch (err) {
        if (FS_REJECTED.test(err.message)) {
            skip(`board rejected the name: ${err.message.split('\n').pop().trim()}`)
        }
        // Not a filesystem refusal - the name broke the raw REPL protocol itself.
        throw new Error(`writeFile(${JSON.stringify(name)}) failed with a non-OSError, ` +
                        `which means the generated Python or the raw REPL stream was corrupted: ` +
                        `${JSON.stringify(err.message)}`, { cause: err })
    }

    const names = await listNames(raw, dir)
    assert(names.includes(name),
        `listdir does not contain the name as written\n      wrote:  ${JSON.stringify(name)}\n      found:  ${JSON.stringify(names)}`)

    assert.bytesEqual(await raw.readFile(path), data, 'content')

    await raw.removeFile(path)
    assert(!(await exists(raw, path)), 'file still present after removeFile')
}

describe('Files / names', () => {

    let dir
    before(async () => {
        dir = `${ctx.root}/names`
        await withRaw(ctx.port, raw => mkdirp(raw, dir))
    })

    for (const [label, name] of NAMES) {
        it(`file name with ${label}`, async () => {
            await withRaw(ctx.port, raw => nameRoundTrip(raw, dir, name))
        })
    }

    it('directory name with a quote holds a file', async () => {
        const sub = `${dir}/dir's "name"`
        await withRaw(ctx.port, async (raw) => {
            try {
                await raw.makePath(sub)
            } catch (err) {
                if (FS_REJECTED.test(err.message)) { skip('board rejected the directory name') }
                throw err
            }
            await roundTrip(raw, `${sub}/inside.txt`, 'nested under a quoted directory')
            assert((await listNames(raw, dir)).includes(`dir's "name"`), 'directory name changed')
            await rmTree(raw, sub)
        })
    })

    it('directory name with unicode holds a file', async () => {
        const sub = `${dir}/тека-📁`
        await withRaw(ctx.port, async (raw) => {
            try {
                await raw.makePath(sub)
            } catch (err) {
                if (FS_REJECTED.test(err.message)) { skip('board rejected the directory name') }
                throw err
            }
            await roundTrip(raw, `${sub}/inside.txt`, 'nested under a unicode directory')
            await rmTree(raw, sub)
        })
    })

    it('names that differ only by case coexist or collide consistently', async () => {
        await withRaw(ctx.port, async (raw) => {
            await raw.writeFile(`${dir}/Case.txt`, 'upper')
            await raw.writeFile(`${dir}/case.txt`, 'lower')
            const names = (await listNames(raw, dir)).filter(n => n.toLowerCase() === 'case.txt')
            if (names.length === 1) {
                // Case-insensitive filesystem: the second write must have replaced the first.
                assert.strictEqual(decoder.decode(await raw.readFile(`${dir}/${names[0]}`)), 'lower')
            } else {
                assert.strictEqual(names.length, 2, 'expected either 1 (case-insensitive) or 2 entries')
                assert.strictEqual(decoder.decode(await raw.readFile(`${dir}/Case.txt`)), 'upper')
                assert.strictEqual(decoder.decode(await raw.readFile(`${dir}/case.txt`)), 'lower')
            }
            await rmTree(raw, `${dir}/Case.txt`)
            await rmTree(raw, `${dir}/case.txt`)
        })
    })
})

describe('Files / hostile names', () => {

    let dir
    before(async () => {
        dir = `${ctx.root}/hostile`
        await withRaw(ctx.port, raw => mkdirp(raw, dir))
    })

    for (const [label, name] of HOSTILE_NAMES) {
        it(`file name with ${label}`, async () => {
            await withRaw(ctx.port, raw => nameRoundTrip(raw, dir, name))
        })
    }

    it('the board is still usable after hostile names', async () => {
        await withRaw(ctx.port, raw => roundTrip(raw, `${ctx.root}/after_hostile.txt`, 'still here'))
    })
})

function assertMatchesDirNotEmpty(err) {
    if (!/Directory not empty|EACCES|OSError/.test(err.message)) {
        throw new Error(`expected a "directory not empty" error, got: ${err.message.split('\n').pop()}`)
    }
}
