/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import {
    configureDiagnosticSeverities,
    getEditorDiagnostics,
    getEditorFromElement,
} from './editor.js'
import { getTabFileName } from './editor_tabs.js'
import {
    diagnosticsPanelPresentation,
    normalizeDiagnosticsFilters,
    renderDiagnosticsPanel,
} from './diagnostics_panel.js'
import { getSetting } from './settings.js'
import { collectDiagnosticEntries, renderTypecheckingStatus } from './typechecking/typechecking_status.js'
import { typechecking } from './typechecking/typechecking.js'
import { report } from './utils.js'
import { QID, QSA } from './utils_browser.js'

export function createDiagnosticsPanelController({ getPendingWork, onJump, translate }) {
    const filters = normalizeDiagnosticsFilters()

    function openEditorDiagnostics() {
        const editors = new Map()
        for (const editorElement of QSA('.editor-tab-pane .editor')) {
            const view = getEditorFromElement(editorElement)
            const path = getTabFileName(editorElement)
            if (view && path) {
                editors.set(path, { path, diagnostics: getEditorDiagnostics(view) })
            }
        }
        const openPaths = new Set(editors.keys())
        for (const diagnostic of collectDiagnosticEntries(typechecking.snapshot().diagnosticStatus)) {
            const encodedPath = diagnostic.fileName ||
                diagnostic.uri?.replace(/^file:\/\/\/workspace\//, '')
            if (!encodedPath) { continue }
            const path = '/' + encodedPath.split('/').map(decodeURIComponent).join('/')
            if (openPaths.has(path)) { continue }
            if (!editors.has(path)) {
                editors.set(path, { path, diagnostics: [] })
            }
            editors.get(path).diagnostics.push(diagnostic)
        }
        return [...editors.values()]
    }

    function update(snapshot = typechecking.snapshot()) {
        const presentation = diagnosticsPanelPresentation(openEditorDiagnostics(), filters)
        filters.file = presentation.filters.file
        renderDiagnosticsPanel({
            badgeEl: QID('diagnostics-badge'),
            fileSelectEl: QID('diagnostics-file'),
            listEl: QID('diagnostics-list'),
        }, presentation)
        const settling = getPendingWork() > 0 && snapshot.status === 'ready'
        renderTypecheckingStatus(
            QID('typecheck-tab'),
            QID('typecheck-enabled'),
            settling ? { ...snapshot, status: 'starting' } : snapshot,
            getSetting('typecheck-enabled'),
            translate('tool.problems'),
            presentation.counts,
        )
    }

    function updateEditorSeverities() {
        for (const editorElement of QSA('.editor-tab-pane .editor')) {
            const view = getEditorFromElement(editorElement)
            if (view) {
                configureDiagnosticSeverities(view, filters.severities)
            }
        }
    }

    function wire() {
        QID('diagnostics-file').addEventListener('change', event => {
            filters.file = event.target.value
            update()
        })
        QID('diagnostics-severities').addEventListener('change', () => {
            filters.severities = new Set(
                QSA('#diagnostics-severities input:checked').map(input => input.value),
            )
            updateEditorSeverities()
            update()
        })
        QID('diagnostics-list').addEventListener('click', event => {
            const item = event.target.closest('.diagnostic-item')
            if (!item) { return }
            onJump(
                item.dataset.path,
                Number(item.dataset.line),
                Number(item.dataset.character),
            ).catch(err => report('Unable to open diagnostic location', err))
        })
    }

    return {
        getSeverities: () => filters.severities,
        update,
        wire,
    }
}
