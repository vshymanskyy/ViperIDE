/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import { assert } from 'chai'

import {
    buildDiagnosticEntries,
    diagnosticsPanelPresentation,
    filterDiagnosticEntries,
    normalizeDiagnosticsFilters,
} from '../../src/diagnostics_panel.js'

const openEditors = [{
    path: '/main.py',
    diagnostics: [
        { line: 3, character: 2, severity: 'error', message: 'Bad argument', source: 'Pyright' },
        { line: 1, character: 1, severity: 'warning', message: 'Unused import', source: 'Ruff' },
    ],
}, {
    path: '/lib/helper.py',
    diagnostics: [
        { line: 5, character: 4, severity: 'info', message: 'Type information', source: 'Pyright' },
    ],
}]

describe('diagnostics panel', () => {
    it('collects and sorts diagnostics from every open file', () => {
        const entries = buildDiagnosticEntries(openEditors)

        assert.deepEqual(entries.map(entry => [entry.path, entry.line, entry.severity]), [
            ['/lib/helper.py', 5, 'info'],
            ['/main.py', 1, 'warning'],
            ['/main.py', 3, 'error'],
        ])
    })

    it('filters by file and severity', () => {
        const entries = buildDiagnosticEntries(openEditors)
        const filtered = filterDiagnosticEntries(entries, {
            file: '/main.py',
            severities: new Set(['error']),
        })

        assert.deepEqual(filtered.map(entry => entry.message), ['Bad argument'])
        assert.isEmpty(filterDiagnosticEntries(entries, {
            file: '',
            severities: new Set(),
        }))
    })

    it('reports per-severity totals and filter-empty states', () => {
        const presentation = diagnosticsPanelPresentation(openEditors, normalizeDiagnosticsFilters())

        assert.deepEqual(presentation.counts, { error: 1, warning: 1, info: 1 })
        assert.lengthOf(presentation.files, 2)
        assert.lengthOf(presentation.filtered, 3)
        assert.strictEqual(
            diagnosticsPanelPresentation(openEditors, {
                file: '/missing.py',
                severities: new Set(['error']),
            }).emptyMessage,
            'No diagnostics match the current filters.',
        )
    })

    it('applies severity but not file filters to badge totals', () => {
        const presentation = diagnosticsPanelPresentation(openEditors, {
            file: '/main.py',
            severities: new Set(['warning', 'info']),
        })

        assert.deepEqual(presentation.counts, { error: 0, warning: 1, info: 1 })
        assert.deepEqual(presentation.filtered.map(entry => entry.message), ['Unused import'])
    })

    it('clears a file filter after that file is closed', () => {
        const filters = {
            file: '/closed.py',
            severities: new Set(['error']),
        }
        const presentation = diagnosticsPanelPresentation(openEditors, filters)

        assert.strictEqual(presentation.filters.file, '')
        assert.strictEqual(filters.file, '/closed.py', 'must not mutate the caller')
        assert.lengthOf(presentation.filtered, 1)
    })
})
