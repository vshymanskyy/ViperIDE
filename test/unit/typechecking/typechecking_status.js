/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import { assert } from 'chai'

import {
    renderTypecheckingStatus,
    typecheckingStatusPresentation,
} from '../../../src/typechecking/typechecking_status.js'

function snapshot(status, options = {}) {
    return {
        status,
        error: options.error || null,
        selectedStubBundle: options.stubBundle || null,
        typeCheckingMode: options.typeCheckingMode || 'standard',
        diagnosticStatus: options.diagnosticStatus || new Map(),
        runtimeSource: options.runtimeSource || null,
        runtimeId: options.runtimeId || null,
        runtimeManifest: options.runtimeManifest || null,
        runtimeFallbacks: options.runtimeFallbacks || [],
    }
}

function control() {
    return {
        dataset: {},
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value },
    }
}

describe('type-checking status UI', () => {
    it('describes ready, busy, error, and disabled states', () => {
        const readyPresentation = typecheckingStatusPresentation(
            snapshot('ready', {
                stubBundle: { id: 'esp32' },
                typeCheckingMode: 'strict',
            }),
            true,
            { error: 1, warning: 0, info: 0 },
        )
        assert.deepInclude(readyPresentation, {
            state: 'ready',
            label: 'Type check: 1 error',
            busy: false,
        })
        assert.include(readyPresentation.title, '1 error, 0 warnings, 0 info')
        assert.include(typecheckingStatusPresentation(
            snapshot('ready', { stubBundle: { id: 'esp32' }, typeCheckingMode: 'strict' }),
            true,
        ).title, 'strict mode with esp32 stubs')
        assert.deepInclude(typecheckingStatusPresentation(snapshot('starting'), true), {
            state: 'starting',
            label: 'Type check: Starting',
            busy: true,
        })
        assert.include(
            typecheckingStatusPresentation(snapshot('error', { error: new Error('worker failed') }), true).title,
            'worker failed',
        )
        assert.deepInclude(typecheckingStatusPresentation(snapshot('ready'), false), {
            state: 'disabled',
            label: 'Type check: Off',
            busy: false,
        })
    })

    it('renders accessible state and locks controls during transitions', () => {
        const statusElement = control()
        const checkbox = control()

        const rendered = renderTypecheckingStatus(
            statusElement,
            checkbox,
            snapshot('switching'),
            true,
        )

        assert.strictEqual(rendered.state, 'switching')
        assert.strictEqual(statusElement.dataset.state, 'switching')
        assert.strictEqual(statusElement.attributes['aria-busy'], 'true')
        assert.match(statusElement.attributes['aria-label'], /^Problems: .*connected device/)
        assert.isTrue(checkbox.disabled)
    })

    it('surfaces runtime source and fallback detail in ready state', () => {
        const remoteReady = typecheckingStatusPresentation(
            snapshot('ready', { runtimeSource: 'remote', runtimeFallbacks: [] }),
            true,
        )
        assert.strictEqual(remoteReady.runtimeSource, 'remote')
        assert.include(remoteReady.title, 'Runtime: remote.')

        const lkgReady = typecheckingStatusPresentation(
            snapshot('ready', {
                runtimeSource: 'last-known-good',
                runtimeFallbacks: [{ reason: 'incompatible' }],
            }),
            true,
        )
        assert.strictEqual(lkgReady.runtimeSource, 'last-known-good')
        assert.include(lkgReady.title, 'Runtime: cached last-known-good.')
        assert.include(lkgReady.title, '1 incompatible runtime skipped')
    })

    it('omits runtime detail for bundled-only startup', () => {
        const bundled = typecheckingStatusPresentation(
            snapshot('ready', { runtimeSource: 'bundled' }),
            true,
        )
        assert.notInclude(bundled.title, 'Runtime:')
    })

    it('includes runtime fallback detail in error state', () => {
        const errored = typecheckingStatusPresentation(
            snapshot('error', {
                error: new Error('incompatible'),
                runtimeSource: 'last-known-good',
                runtimeFallbacks: [{ reason: 'a' }, { reason: 'b' }],
            }),
            true,
        )
        assert.include(errored.title, '2 incompatible runtimes skipped')
        assert.strictEqual(errored.runtimeSource, 'last-known-good')
    })
})
