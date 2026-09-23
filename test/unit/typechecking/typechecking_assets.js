/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import { assert } from 'chai'

import { TypecheckingAssets } from '../../../src/typechecking/typechecking_assets.js'

const manifest = {
    default: 'test-board',
    boards: [
        {
            id: 'test-board',
            file: 'stubs-test-board.zip',
            package: 'test-board-stubs',
            package_version: '1.28.0.post1',
        },
        { id: 'no-stubs', file: null, package: 'No Stubs' },
    ],
}
const viperToolsStubs = {
    url: 'https://example.test/assets/viper-tools-stubs/' +
        'viper_tools_stubs-0.1.2.0-py3-none-any.whl',
    size: 6269,
    sha256: '406e48b0033590622a06a5aa4c37b3982840d6cfb89a5c6d26d0462f7105c0b6',
}

function response({ json, bytes, status = 200 }) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => json,
        arrayBuffer: async () => bytes,
    }
}

async function rejects(promise, match) {
    let error
    try {
        await promise
    } catch (caught) {
        error = caught
    }
    assert.instanceOf(error, Error, 'expected promise to reject')
    assert.match(error.message, match)
}

describe('TypecheckingAssets', () => {
    it('binds the default browser fetch implementation to the global object', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = async function(url) {
            assert.strictEqual(this, globalThis)
            assert.match(url, /stubs-manifest\.json$/)
            return response({ json: manifest })
        }

        try {
            const assets = new TypecheckingAssets()
            assert.strictEqual(await assets.loadManifest(), manifest)
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('loads the manifest and defers the selected fallback archive to the worker', async () => {
        const requests = []
        const assets = new TypecheckingAssets({
            packageBase: 'https://example.test/assets/pyright-worker/',
            fetch: async url => {
                requests.push(url)
                return response({ json: manifest })
            },
        })

        const runtime = await assets.prepare()

        assert.strictEqual(
            runtime.workerUrl,
            'https://example.test/assets/pyright-worker/dist/pyright_worker.js',
        )
        assert.isUndefined(runtime.boardStubs)
        assert.strictEqual(
            runtime.boardStubsUrl,
            'https://example.test/assets/pyright-worker/assets/stubs-test-board.zip',
        )
        assert.isUndefined(runtime.boardStubPackage)
        assert.strictEqual(runtime.stubBundle.id, 'test-board')
        assert.lengthOf(requests, 1)
        assert.strictEqual(
            requests[0],
            'https://example.test/assets/pyright-worker/assets/stubs-manifest.json',
        )
    })

    it('uses one same-origin worker URL and caches package metadata', async () => {
        let fetchCalls = 0
        const assets = new TypecheckingAssets({
            fetch: async url => {
                fetchCalls++
                return url.endsWith('stubs-manifest.json')
                    ? response({ json: manifest })
                    : response({ bytes: new ArrayBuffer(1) })
            },
        })

        const first = await assets.prepare('test-board')
        const second = await assets.prepare('test-board')

        assert.strictEqual(first.workerUrl, second.workerUrl)
        assert.match(first.workerUrl, /assets\/pyright-worker\/dist\/pyright_worker\.js$/)
        assert.strictEqual(fetchCalls, 1)
    })

    it('uses false for a manifest entry without a stub archive', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
        })

        const runtime = await assets.prepare('no-stubs')

        assert.isFalse(runtime.boardStubs)
        assert.strictEqual(runtime.stubBundle.id, 'no-stubs')
    })

    it('forwards a selected published package while retaining the bundled fallback', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
        })

        const runtime = await assets.prepare({
            boardId: 'test-board',
            boardStubPackage: {
                packageName: 'micropython-test-board-stubs',
                version: '1.28.0.post2',
                fallbackToBundled: true,
            },
        })

        assert.deepEqual(runtime.boardStubPackage, {
            packageName: 'micropython-test-board-stubs',
            version: '1.28.0.post2',
            fallbackToBundled: true,
        })
        assert.match(runtime.boardStubsUrl, /stubs-test-board\.zip$/)
    })

    it('uses the bundled archive for an exact package and version match', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
        })

        const runtime = await assets.prepare({
            boardId: 'test-board',
            boardStubPackage: {
                packageName: 'test_board.stubs',
                version: '1.28.0.post1',
                fallbackToBundled: true,
            },
        })

        assert.isUndefined(runtime.boardStubPackage)
        assert.match(runtime.boardStubsUrl, /stubs-test-board\.zip$/)
    })

    it('uses the bundled archive for a catalog wildcard version specifier', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
        })

        const runtime = await assets.prepare({
            boardId: 'test-board',
            boardStubPackage: {
                packageName: 'test_board.stubs',
                version: '1.28.0.*',
                fallbackToBundled: true,
            },
        })

        assert.isUndefined(runtime.boardStubPackage)
        assert.match(runtime.boardStubsUrl, /stubs-test-board\.zip$/)
    })

    it('keeps a published package when the wildcard line does not match the bundle', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
        })

        const runtime = await assets.prepare({
            boardId: 'test-board',
            boardStubPackage: {
                packageName: 'test_board.stubs',
                version: '1.29.0.*',
                fallbackToBundled: true,
            },
        })

        assert.equal(runtime.boardStubPackage.version, '1.29.0.*')
    })

    it('adds the verified Viper tools wheel independently from board stubs', async () => {
        const assets = new TypecheckingAssets({
            packageBase: 'https://example.test/assets/pyright-worker/',
            viperToolsStubs,
            fetch: async () => response({ json: manifest }),
        })

        const runtime = await assets.prepare({ boardId: 'test-board', viperToolsStubs: true })

        assert.match(runtime.boardStubsUrl, /stubs-test-board\.zip$/)
        assert.deepEqual(runtime.extraStubArchives, [{
            packageName: 'viper-tools-stubs',
            archive: {
                ...viperToolsStubs,
                size: 6269,
                allowedOrigins: ['https://example.test'],
            },
        }])
    })

    it('omits or explicitly replaces the bundled Viper tools overlay', async () => {
        const requests = []
        const assets = new TypecheckingAssets({
            fetch: async url => {
                requests.push(url)
                return response({ json: manifest })
            },
        })

        const disabled = await assets.prepare({ viperToolsStubs: false })
        assert.deepEqual(disabled.extraStubArchives, [])
        assert.lengthOf(requests, 1)

        const replacement = {
            packageName: 'viper_tools.stubs',
            archive: { data: new ArrayBuffer(1), size: 1, sha256: 'a'.repeat(64) },
        }
        const overridden = await assets.prepare({
            viperToolsStubs: true,
            extraStubArchives: [replacement],
        })
        assert.deepEqual(overridden.extraStubArchives, [replacement])

        const removed = await assets.prepare({
            viperToolsStubs: false,
            extraStubArchives: overridden.extraStubArchives,
        })
        assert.deepEqual(removed.extraStubArchives, [])
    })

    it('uses the default fallback archive for a catalog-only board ID', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
        })

        const runtime = await assets.prepare({
            boardId: 'esp8266',
            boardStubPackage: {
                packageName: 'micropython-esp8266-stubs',
                version: '1.28.0.post1',
                fallbackToBundled: true,
            },
        })

        assert.strictEqual(runtime.stubBundle.id, 'esp8266')
        assert.match(runtime.boardStubsUrl, /stubs-test-board\.zip$/)
        assert.strictEqual(runtime.boardStubPackage.packageName, 'micropython-esp8266-stubs')
    })

    it('reports unknown boards and failed asset responses', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
        })
        await rejects(assets.prepare('unknown'), /Unknown type-checking stub bundle/)

        const failed = new TypecheckingAssets({
            fetch: async () => response({ status: 503 }),
        })
        await rejects(failed.prepare(), /stub manifest: HTTP 503/)
    })

    it('omits runtime manifest options when explicitly disabled', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
            runtimeManifestUrl: null,
        })

        const runtime = await assets.prepare()

        assert.isUndefined(runtime.runtimeManifestUrl)
        assert.isUndefined(runtime.runtimeAllowedOrigins)
        assert.isUndefined(runtime.runtimeCacheName)
        assert.isUndefined(runtime.runtimeStorageKey)
    })

    it('includes runtime manifest options when a URL is configured', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
            runtimeManifestUrl: 'https://cdn.example.test/runtime-manifest.json',
            runtimeAllowedOrigins: ['https://cdn.example.test'],
        })

        const runtime = await assets.prepare()

        assert.strictEqual(runtime.runtimeManifestUrl, 'https://cdn.example.test/runtime-manifest.json')
        assert.deepEqual(runtime.runtimeAllowedOrigins, ['https://cdn.example.test'])
        assert.strictEqual(runtime.runtimeCacheName, 'viperide-pyright-runtime')
        assert.strictEqual(runtime.runtimeStorageKey, 'viperide-pyright-runtime-lkg')
        // workerUrl is always present as bundled fallback
        assert.match(runtime.workerUrl, /pyright_worker\.js$/)
    })

    it('allows overriding cache name and storage key', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
            runtimeManifestUrl: 'https://cdn.example.test/runtime-manifest.json',
            runtimeCacheName: 'custom-cache',
            runtimeStorageKey: 'custom-lkg',
        })

        const runtime = await assets.prepare()

        assert.strictEqual(runtime.runtimeCacheName, 'custom-cache')
        assert.strictEqual(runtime.runtimeStorageKey, 'custom-lkg')
    })

    it('enables manifest loading by default for the deployed production assets', async () => {
        const assets = new TypecheckingAssets({
            fetch: async () => response({ json: manifest }),
        })

        const runtime = await assets.prepare()

        assert.isString(runtime.runtimeManifestUrl)
        assert.match(runtime.runtimeManifestUrl, /assets\/runtime-manifest\.json$/)
        assert.isUndefined(runtime.runtimeAllowedOrigins)
        assert.strictEqual(runtime.runtimeCacheName, 'viperide-pyright-runtime')
        assert.strictEqual(runtime.runtimeStorageKey, 'viperide-pyright-runtime-lkg')
        // workerUrl is always present as bundled fallback
        assert.match(runtime.workerUrl, /pyright_worker\.js$/)
    })
})
