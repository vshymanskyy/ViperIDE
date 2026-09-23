/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import { assert } from 'chai'

import {
    catalogTypecheckingRuntimeConfig,
    formatStubLabel,
    formatStubSpecifier,
    normalizeTypecheckingBoard,
    normalizeTypecheckingMode,
    normalizeTypecheckingScope,
    parseStubPackageSpecifier,
    resolveTypecheckingBoard,
    simpleStubVersion,
    typecheckingAutodetectFallback,
    typecheckingBoardOptions,
    typecheckingStubPreferences,
    typecheckingRuntimeConfig,
} from '../../../src/typechecking/typechecking_settings.js'

describe('type-checking settings', () => {
    it('normalizes persisted modes and board overrides', () => {
        assert.strictEqual(normalizeTypecheckingMode('strict'), 'strict')
        assert.strictEqual(normalizeTypecheckingMode(undefined), 'standard')
        assert.strictEqual(normalizeTypecheckingMode('invalid'), 'standard')
        assert.strictEqual(normalizeTypecheckingScope('openFilesOnly'), 'openFilesOnly')
        assert.strictEqual(normalizeTypecheckingScope('workspace'), 'workspace')
        assert.strictEqual(normalizeTypecheckingScope(undefined), 'openFilesOnly')
        assert.strictEqual(normalizeTypecheckingScope('invalid'), 'openFilesOnly')
        assert.strictEqual(normalizeTypecheckingBoard('rp2'), 'rp2')
        assert.strictEqual(normalizeTypecheckingBoard('invalid'), 'auto')
    })

    it('lists only consumer stub bundles with simple versions', () => {
        const options = typecheckingBoardOptions({
            boards: [
                { id: 'stdlib', package_version: '1.28.0.post6' },
                { id: 'esp32', package_version: '1.28.0.post4' },
                { id: 'rp2', package_version: '1.28.0.post1' },
                { id: 'circuitpython', package_version: '10.2.1' },
                { id: 'cpython', package_version: '' },
            ],
        })

        assert.deepEqual(options, [
            { id: 'esp32', label: 'MP ESP32 (v1.28.0)' },
            { id: 'rp2', label: 'MP RP2 (v1.28.0)' },
            { id: 'circuitpython', label: 'CircuitPython (v10.2.1)' },
        ])
        assert.strictEqual(simpleStubVersion('1.28.0.post12'), 'v1.28.0')
        assert.strictEqual(simpleStubVersion(''), '')
    })

    it('uses active cached versions in board labels and parses install requests', () => {
        const options = typecheckingBoardOptions({
            boards: [{
                id: 'esp32',
                package: 'micropython-esp32-stubs',
                package_version: '1.27.0.post1',
            }],
        }, [{
            packageName: 'micropython-esp32-stubs',
            version: '1.28.0.post4',
            active: true,
        }])

        assert.deepEqual(options, [{ id: 'esp32', label: 'MP ESP32 (v1.28.0)' }])
        assert.deepEqual(parseStubPackageSpecifier('MicroPython_ESP32_Stubs==1.28.0.post4'), {
            packageName: 'micropython-esp32-stubs',
            versionSpecifier: '==1.28.0.post4',
        })
        assert.deepEqual(parseStubPackageSpecifier('types-requests~=2.32'), {
            packageName: 'types-requests',
            versionSpecifier: '~=2.32',
        })
        assert.strictEqual(formatStubSpecifier('types-requests', '2.32.4'), 'types-requests==2.32.4')
        assert.strictEqual(formatStubSpecifier('types-requests'), 'types-requests')
        assert.strictEqual(formatStubLabel('types-requests', '2.32.4'), 'types-requests@2.32.4')
        assert.strictEqual(formatStubLabel('types-requests'), 'types-requests')
        assert.throws(() => parseStubPackageSpecifier('package latest'), /Invalid/)
    })

    it('uses the connected platform only when the board setting is automatic', () => {
        assert.strictEqual(resolveTypecheckingBoard('auto', { platform: 'rp2' }), 'rp2')
        assert.strictEqual(resolveTypecheckingBoard('esp32', { platform: 'rp2' }), 'esp32')
        assert.isUndefined(resolveTypecheckingBoard('auto', null))
    })

    it('builds the worker configuration from persisted settings', () => {
        assert.deepEqual(typecheckingRuntimeConfig({
            mode: 'strict',
            scope: 'openFilesOnly',
            board: 'rp2',
            devInfo: { platform: 'esp32' },
            extraPaths: ['/workspace/lib'],
        }), {
            typeCheckingMode: 'strict',
            diagnosticMode: 'openFilesOnly',
            boardId: 'rp2',
            extraPaths: ['/workspace/lib'],
            typeshedPath: '/typeshed-micropython',
        })
    })

    it('always selects the MicroPython stdlib stubs over the CPython typeshed', () => {
        for (const board of ['auto', 'rp2', 'esp32']) {
            const config = typecheckingRuntimeConfig({ mode: 'standard', board })
            assert.strictEqual(config.typeshedPath, '/typeshed-micropython')
        }
    })

    it('builds runtime configuration from a published catalog package', () => {
        assert.deepEqual(catalogTypecheckingRuntimeConfig({
            mode: 'strict',
            scope: 'workspace',
            family: 'micropython',
            port: 'esp32',
            stubPackage: {
                packageName: 'micropython-esp32-esp32-generic-c3-stubs',
                version: '1.28.0.post2',
            },
            extraPaths: ['/workspace/lib'],
        }), {
            typeCheckingMode: 'strict',
            diagnosticMode: 'workspace',
            boardId: 'esp32',
            boardStubPackage: {
                packageName: 'micropython-esp32-esp32-generic-c3-stubs',
                version: '1.28.0.post2',
                fallbackToBundled: true,
            },
            extraPaths: ['/workspace/lib'],
            typeshedPath: '/typeshed-micropython',
        })
    })

    it('matches connected firmware metadata to an exact catalog target', () => {
        const packages = [
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'esp32', board: 'GENERIC' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'esp32', board: 'ESP32_GENERIC_C3' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'RPI_PICO_W' },
        ]

        assert.deepEqual(typecheckingStubPreferences({
            family: 'micropython',
            version: '1.28.0-preview.4',
            port: 'esp32',
            board_id: 'esp32-generic-c3',
        }, packages, '1.28.0'), {
            family: 'micropython',
            version: '1.28.0',
            port: 'esp32',
            board: 'ESP32_GENERIC_C3',
        })
    })

    it('falls back from a board variant to its longest catalog base board', () => {
        const packages = [
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'GENERIC' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'PIMORONI' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'PIMORONI_PICOLIPO' },
        ]

        assert.strictEqual(typecheckingStubPreferences({
            firmware_version: '1.28.0',
            port: 'rp2',
            board_id: 'PIMORONI_PICOLIPO-FLASH_16M',
        }, packages, '1.28.0').board, 'PIMORONI_PICOLIPO')
    })

    it('preserves exact variants and falls back to generic when no base board exists', () => {
        const packages = [
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'GENERIC' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'PIMORONI_PICOLIPO' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'PIMORONI_PICOLIPO-FLASH_16M' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'RPI_PICO_W' },
        ]

        const resolveBoard = board_id => typecheckingStubPreferences({
            firmware_version: '1.28.0', port: 'rp2', board_id,
        }, packages, '1.28.0').board

        assert.strictEqual(resolveBoard('PIMORONI_PICOLIPO-FLASH_16M'), 'PIMORONI_PICOLIPO-FLASH_16M')
        assert.strictEqual(resolveBoard('UNKNOWN_BOARD-FLASH_16M'), 'GENERIC')
        assert.strictEqual(resolveBoard('RPI_PICO_W'), 'RPI_PICO_W')
    })

    it('falls back to the catalog default version and generic board', () => {
        const packages = [
            { family: 'micropython', runtimeVersions: ['1.27.0'], port: 'esp32', board: 'GENERIC' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'esp32', board: 'GENERIC' },
        ]

        assert.deepEqual(typecheckingStubPreferences({
            version: '1.29.0',
            platform: 'esp32',
            build: 'CUSTOM_BOARD',
        }, packages, '1.28.0'), {
            family: 'micropython',
            version: '1.28.0',
            port: 'esp32',
            board: 'GENERIC',
        })
    })

    it('prefers a catalog release from the connected firmware series', () => {
        const packages = [
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'rp2', board: 'GENERIC' },
            { family: 'micropython', runtimeVersions: ['1.27.0'], port: 'rp2', board: 'GENERIC' },
        ]

        assert.strictEqual(typecheckingStubPreferences({
            version: '1.28.1',
            port: 'rp2',
        }, packages, '1.27.0').version, '1.28.0')
    })

    it('preserves the detected port when its exact firmware release is unavailable', () => {
        const packages = [
            { family: 'micropython', runtimeVersions: ['1.27.0'], port: 'esp32', board: 'GENERIC' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'webassembly', board: 'GENERIC' },
        ]

        assert.deepEqual(typecheckingStubPreferences({
            firmware_version: '1.27.0',
            port: 'webassembly',
        }, packages, '1.28.0'), {
            family: 'micropython',
            version: '1.28.0',
            port: 'webassembly',
            board: 'GENERIC',
        })
    })

    it('uses generic same-port stubs with an informational notice for an unknown board', () => {
        const packages = [
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'esp32', board: 'GENERIC' },
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'esp32', board: 'ESP32_GENERIC_C3' },
        ]
        const devInfo = {
            firmware_version: '1.28.0',
            port: 'esp32',
            board_id: 'ESP32_GENERIC_C2',
        }
        const preferences = typecheckingStubPreferences(devInfo, packages, '1.28.0')

        assert.deepEqual(preferences, {
            family: 'micropython', version: '1.28.0', port: 'esp32', board: 'GENERIC',
        })
        assert.deepEqual(typecheckingAutodetectFallback(devInfo, preferences), {
            level: 'info',
            message: 'No board-specific stubs match "ESP32_GENERIC_C2". Using generic esp32 stubs.',
        })
    })

    it('warns that an uncatalogued port needs manual selection', () => {
        const packages = [
            { family: 'micropython', runtimeVersions: ['1.28.0'], port: 'esp32', board: 'GENERIC' },
        ]
        const devInfo = { firmware_version: '1.28.0', port: 'dabao' }
        const preferences = typecheckingStubPreferences(devInfo, packages, '1.28.0')

        assert.strictEqual(preferences.port, '')
        assert.deepEqual(typecheckingAutodetectFallback(devInfo, preferences), {
            level: 'warning',
            message: 'Failed to autoselect type stubs for port "dabao". Disable Autodetect to select stubs manually.',
        })
    })
})
