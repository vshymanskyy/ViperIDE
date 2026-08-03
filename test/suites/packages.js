/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Package installation (mip) through the real src/package_mgr.js.
 *
 * Installs are redirected into the scratch directory by handing the package manager a
 * device descriptor whose sys.path points there, so the board's own /lib is never
 * touched. The board-side sys.path is extended to match, so installed packages can
 * actually be imported.
 */

import { ctx, skip, skipSuite } from '../setup.js'
import { assert } from 'chai'
import { withRaw, statPath, exists, listNames, listTree, mkdirp, rmTree, pyPath } from '../board.js'
import * as pm from '../../src/package_mgr.js'

const decoder = new TextDecoder('utf-8')

let libPath = null  // scratch "lib" the packages are installed into
let dev = null      // device descriptor handed to rawInstallPkg

/* Runs fn in a raw session that can import from the scratch lib. */
async function withLib(port, fn) {
    return await withRaw(port, async (raw) => {
        await raw.exec(`
if ${pyPath(libPath)} not in sys.path:
    sys.path.append(${pyPath(libPath)})
`)
        return await fn(raw)
    })
}

async function installed(raw) {
    return (await listTree(raw, libPath)).map(e => e.path.slice(libPath.length + 1)).sort()
}

/* Serves `routes` (url -> body) for the duration of fn, so a package that exists
 * nowhere can still be resolved through the real rewriting. Anything not listed -
 * the package indexes themselves - goes to the network as usual. */
async function withFetchStub(routes, fn) {
    const realFetch = globalThis.fetch
    globalThis.fetch = async (url, opts) => {
        const body = routes[String(url)]
        if (body === undefined) { return await realFetch(url, opts) }
        return new Response(body, { status: 200 })
    }
    try {
        return await fn()
    } finally {
        globalThis.fetch = realFetch
    }
}

describe('Packages', () => {

    /* A plain function, not an arrow: skipping a whole suite goes through Mocha's own
     * `this.skip()`, which needs the hook context. */
    before(async function () {
        if (!ctx.caps.network) { skipSuite(this, 'VIPER_TEST_OFFLINE') }

        let unreachable = null
        try {
            const res = await fetch('https://micropython.org/pi/v2/index.json',
                { cache: 'no-store', signal: AbortSignal.timeout(15000) })
            if (!res.ok) { unreachable = `package index returned HTTP ${res.status}` }
        } catch (err) {
            unreachable = `no network access: ${err.message}`
        }
        if (unreachable) { skipSuite(this, unreachable) }

        libPath = `${ctx.root}/lib`
        // rawInstallPkg picks the first sys.path entry ending in /lib.
        dev = { ...ctx.dev, sys_path: [libPath] }
        await withRaw(ctx.port, raw => mkdirp(raw, libPath))
    })

    after(async () => {
        if (ctx.opts.keep || !libPath) { return }
        await withRaw(ctx.port, raw => rmTree(raw, libPath))
    })

    it('package indexes load', async () => {
        const indexes = await pm.getPkgIndexes()
        assert(indexes.length >= 2, `expected at least 2 indexes, got ${indexes.length}`)
        for (const idx of indexes) {
            assert(idx.index.packages.length > 0, `index ${idx.name} is empty`)
            for (const pkg of idx.index.packages) {
                assert(pkg.name, `index ${idx.name} has a package without a name`)
                assert(pkg.version, `${idx.name}/${pkg.name} has no version`)
            }
        }
    })

    it('findPkg locates a micropython-lib package', async () => {
        const [index, pkg] = await pm.findPkg('base64')
        assert(pkg, 'base64 not found in any index')
        assert.strictEqual(pkg.name, 'base64')
        assert.strictEqual(index.name, 'micropython-lib')
    })

    it('findPkg returns null for an unknown name', async () => {
        const [, pkg] = await pm.findPkg('this-package-does-not-exist-zzz')
        assert.strictEqual(pkg, null)
    })

    it('getPkgInfo describes an indexed package without a device', async () => {
        const [pkg_info, pkg_json] = await pm.getPkgInfo('viper-tools')
        assert(pkg_info, 'viper-tools could not be resolved')
        assert(pkg_info.urls?.length, 'viper-tools lists no urls')
        assert.include(pkg_json, 'viper-tools/package.json')
    })

    it('getPkgInfo yields nothing for a package that needs the board', async () => {
        // micropython-lib (index v2) serves a different package.json per MPY ABI
        const [pkg_info] = await pm.getPkgInfo('base64')
        assert.strictEqual(pkg_info, null)
    })

    it('fetchPkgReadme resolves the readme against the package.json', async () => {
        const readme = await withFetchStub({
            'https://raw.githubusercontent.com/acme/demo/HEAD/package.json':
                '{"name":"demo","version":"1.0","readme":"docs/readme.md"}',
            'https://raw.githubusercontent.com/acme/demo/HEAD/docs/readme.md': '# Demo',
        }, () => pm.fetchPkgReadme('github:acme/demo'))

        assert.strictEqual(readme.name, 'demo')
        assert.strictEqual(readme.text, '# Demo')
        // Where it came from, which is what the links inside it are relative to
        assert.strictEqual(readme.url, 'https://raw.githubusercontent.com/acme/demo/HEAD/docs/readme.md')
    })

    it('fetchPkgReadme follows the requested version', async () => {
        const readme = await withFetchStub({
            'https://raw.githubusercontent.com/acme/demo/v2/package.json':
                '{"name":"demo","version":"2.0","readme":"readme.md"}',
            'https://raw.githubusercontent.com/acme/demo/v2/readme.md': '# Demo v2',
        }, () => pm.fetchPkgReadme('github:acme/demo@v2'))

        assert.strictEqual(readme.text, '# Demo v2')
        assert.strictEqual(readme.url, 'https://raw.githubusercontent.com/acme/demo/v2/readme.md')
        assert.strictEqual(readme.version, 'v2')
    })

    it('rewriteDocUrl places what a readme points at', () => {
        const origin = { base: 'https://raw.githubusercontent.com/acme/demo/v2/docs/readme.md', branch: 'v2' }
        const cases = [
            // Relative to the document, which is what a readme in a repository writes
            ['img/shot.png',  'https://raw.githubusercontent.com/acme/demo/v2/docs/img/shot.png'],
            // `..` is left in place: it is the URL parser that collapses it, at fetch time
            ['../logo.png',   'https://raw.githubusercontent.com/acme/demo/v2/docs/../logo.png'],
            // The same shorthands package.json accepts
            ['github:acme/demo/logo.png', 'https://raw.githubusercontent.com/acme/demo/v2/logo.png'],
            // A GitHub page showing a file, rather than the file
            ['https://github.com/acme/demo/blob/main/GUIDE.md',
             'https://raw.githubusercontent.com/acme/demo/v2/GUIDE.md'],
            // Left alone: already absolute, or not a location at all
            ['https://img.shields.io/badge.svg', 'https://img.shields.io/badge.svg'],
            ['data:image/png;base64,iVBORw0K',   'data:image/png;base64,iVBORw0K'],
            ['mailto:nobody@example.com',        'mailto:nobody@example.com'],
            ['#usage',                           '#usage'],
        ]
        for (const [url, expected] of cases) {
            assert.strictEqual(pm.rewriteDocUrl(url, origin), expected, `rewriting ${url}`)
        }
    })

    it('rewriteDocUrl leaves a relative link alone when there is nowhere to place it', () => {
        assert.strictEqual(pm.rewriteDocUrl('img/shot.png', {}), 'img/shot.png')
    })

    it('installs a package from micropython-lib as source', async () => {
        await withLib(ctx.port, async (raw) => {
            await pm.rawInstallPkg(raw, 'base64', { dev, prefer_source: true })

            const files = await installed(raw)
            assert.include(files.join(' '), 'base64.py', `installed: ${files.join(', ')}`)

            const src = decoder.decode(await raw.readFile(`${libPath}/base64.py`))
            assert.include(src, 'b64encode', 'base64.py does not look like the real module')
        })
    })

    it('the installed package imports and runs on the board', async () => {
        await withLib(ctx.port, async (raw) => {
            const out = await raw.exec(`
import base64
print(base64.b64encode(b'ViperIDE').decode())
`, 20000)
            assert.strictEqual(out.trim(), 'VmlwZXJJREU=')
        })
    })

    it('installs a package with a nested module directory', async () => {
        await withLib(ctx.port, async (raw) => {
            await pm.rawInstallPkg(raw, 'unittest-discover', { dev, prefer_source: true })
            assert.strictEqual((await statPath(raw, `${libPath}/unittest`))?.type, 'd',
                'unittest package directory was not created')
            assert(await exists(raw, `${libPath}/unittest/__init__.py`),
                'unittest/__init__.py is missing')
        })
    })

    it('installs precompiled .mpy when source is not preferred', async () => {
        if (dev.mpy_ver !== 6) { skip(`board reports mpy v${dev.mpy_ver}, index only serves v6`) }
        await withLib(ctx.port, async (raw) => {
            await pm.rawInstallPkg(raw, 'iperf3', { dev, prefer_source: false })
            assert(await exists(raw, `${libPath}/iperf3.mpy`),
                `iperf3.mpy missing; lib holds ${(await installed(raw)).join(', ')}`)

            const data = await raw.readFile(`${libPath}/iperf3.mpy`)
            assert.strictEqual(data[0], 0x4d, 'mpy magic byte')
            assert.strictEqual(data[1], 6, 'mpy version byte')
        })
    })

    it('installs from the featured (v3.viper-ide) index', async () => {
        await withLib(ctx.port, async (raw) => {
            await pm.rawInstallPkg(raw, 'viper-tools', { dev, prefer_source: true })
            const names = await listNames(raw, libPath)
            for (const expected of ['web_repl.py', 'ble_nus.py']) {
                assert(names.includes(expected), `${expected} missing; lib holds ${names.join(', ')}`)
            }
        })
    })

    it('installs straight from a github: url', async () => {
        await withLib(ctx.port, async (raw) => {
            await pm.rawInstallPkg(raw,
                'github:vshymanskyy/ViperIDE/packages/viper-tools/ws_client.py',
                { dev, prefer_source: true })
            assert(await exists(raw, `${libPath}/ws_client.py`), 'ws_client.py was not installed')
        })
    })

    it('resolves dependencies', async () => {
        const pkg_info = {
            version: '1.0',
            urls: [['viper_dep_root.py', 'github:vshymanskyy/ViperIDE/packages/viper-tools/ble_repl.py']],
            deps: ['pathlib', ['hmac', 'latest']],   // string form and [name, version] form
        }
        await withLib(ctx.port, async (raw) => {
            await pm.rawInstallPkg(raw, 'viper-dep-test', { dev, pkg_info, prefer_source: true })
            const files = (await installed(raw)).join(' ')
            assert.include(files, 'viper_dep_root.py', 'the package itself')
            assert(/pathlib\.(py|mpy)/.test(files), `dependency pathlib missing; lib holds ${files}`)
            assert(/hmac\.(py|mpy)/.test(files), `dependency hmac missing; lib holds ${files}`)
        })
    })

    it('reinstalling over an existing package succeeds', async () => {
        await withLib(ctx.port, async (raw) => {
            const before = (await statPath(raw, `${libPath}/base64.py`))?.size
            await pm.rawInstallPkg(raw, 'base64', { dev, prefer_source: true })
            assert.strictEqual((await statPath(raw, `${libPath}/base64.py`))?.size, before,
                'reinstall changed the file size')
        })
    })

    it('installing an unknown package fails cleanly', async () => {
        await withLib(ctx.port, async (raw) => {
            const err = await assert.rejects(
                () => pm.rawInstallPkg(raw, 'this-package-name-does-not-exist-zzz', { dev }))
            assert.include(err.message, 'Cannot find')
        })
    })

    it('installing a package from wrong url fails cleanly', async () => {
        await withLib(ctx.port, async (raw) => {
            const err = await assert.rejects(
                () => pm.rawInstallPkg(raw, 'https://this-url-does-not-exist-zzz', { dev }))
            assert.include(err.message, 'fetch failed')
        })
    })

    it('installing without a lib directory on sys.path fails cleanly', async () => {
        await withLib(ctx.port, async (raw) => {
            const err = await assert.rejects(
                () => pm.rawInstallPkg(raw, 'base64', { dev: { ...dev, sys_path: ['', '.frozen'] } }))
            assert.include(err.message, 'lib')
        })
    })

    it('the board filesystem is consistent after the installs', async () => {
        await withLib(ctx.port, async (raw) => {
            for (const entry of await listTree(raw, libPath)) {
                if (entry.type !== 'f') { continue }
                const data = await raw.readFile(entry.path)
                assert.strictEqual(data.length, entry.size, `size mismatch for ${entry.path}`)
            }
        })
    })
})
