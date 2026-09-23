/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import { assert } from 'chai'

import {
    readDevicePythonWorkspace,
    shouldMirrorDevicePythonWorkspace,
    syncDevicePythonWorkspace,
} from '../../../src/typechecking/typechecking_workspace.js'

describe('device type-checking workspace', () => {
    it('mirrors only when type checking and whole-workspace analysis are enabled', () => {
        assert.isTrue(shouldMirrorDevicePythonWorkspace(true, 'workspace'))
        assert.isFalse(shouldMirrorDevicePythonWorkspace(false, 'workspace'))
        assert.isFalse(shouldMirrorDevicePythonWorkspace(true, 'openFilesOnly'))
        assert.isFalse(shouldMirrorDevicePythonWorkspace(false, 'openFilesOnly'))
    })

    it('does not read or replace the workspace when mirroring is disabled', async () => {
        const cached = { 'cached.py': 'cached = True' }
        let reads = 0
        let replacements = 0
        const options = {
            enabled: false,
            scope: 'workspace',
            raw: {},
            fsCache: {
                knownPaths: () => ['/main.py'],
                get: () => ({ isDir: false }),
                readFile: async () => {
                    reads++
                    return 'updated = True'
                },
            },
            isSpecialPath: () => false,
            replaceWorkspace: files => {
                replacements++
                Object.assign(cached, files)
            },
        }

        assert.deepEqual(await syncDevicePythonWorkspace(options), {
            mirrored: false,
            files: {},
            errors: [],
        })
        assert.deepEqual(await syncDevicePythonWorkspace({
            ...options,
            enabled: true,
            scope: 'openFilesOnly',
        }), {
            mirrored: false,
            files: {},
            errors: [],
        })
        assert.strictEqual(reads, 0)
        assert.strictEqual(replacements, 0)
        assert.deepEqual(cached, { 'cached.py': 'cached = True' })
    })

    it('reads and replaces the workspace when whole-workspace analysis is enabled', async () => {
        const replacements = []
        const result = await syncDevicePythonWorkspace({
            enabled: true,
            scope: 'workspace',
            raw: {},
            fsCache: {
                knownPaths: () => ['/main.py'],
                get: () => ({ isDir: false }),
                readFile: async () => 'answer = 42',
            },
            isSpecialPath: () => false,
            replaceWorkspace: (files, options) => replacements.push({ files, options }),
        })

        assert.deepEqual(result, {
            mirrored: true,
            files: { '/main.py': 'answer = 42' },
            errors: [],
        })
        assert.deepEqual(replacements, [{
            files: { '/main.py': 'answer = 42' },
            options: { preservePaths: [] },
        }])
    })

    it('reads every regular Python file and reports unreadable or invalid files', async () => {
        const reads = []
        const entries = {
            '/main.py': { isDir: false },
            '/lib/foo.py': { isDir: false },
            '/folder.py': { isDir: true },
            '/proc/runtime.py': { isDir: false },
            '/README.md': { isDir: false },
            '/invalid.py': { isDir: false },
            '/missing.py': { isDir: false },
        }
        const contents = {
            '/main.py': new TextEncoder().encode('from lib.foo import foo'),
            '/lib/foo.py': 'foo = 1',
            '/invalid.py': new Uint8Array([0xff]),
        }
        const fsCache = {
            knownPaths: () => Object.keys(entries),
            get: path => entries[path],
            readFile: async (_raw, path) => {
                reads.push(path)
                if (path === '/missing.py') { throw new Error('read failed') }
                return contents[path]
            },
        }

        const result = await readDevicePythonWorkspace(
            {},
            fsCache,
            path => path.startsWith('/proc/'),
        )

        assert.deepEqual(result.files, {
            '/main.py': 'from lib.foo import foo',
            '/lib/foo.py': 'foo = 1',
        })
        assert.deepEqual(reads, ['/main.py', '/lib/foo.py', '/invalid.py', '/missing.py'])
        assert.deepEqual(result.errors.map(({ path }) => path), ['/invalid.py', '/missing.py'])
        assert.match(result.errors[1].error.message, /read failed/)
    })
})
