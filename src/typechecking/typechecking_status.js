/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

/**
 * Flatten Pyright's per-editor `diagnosticStatus` map into a deduplicated list
 * used by the Pyright status summary.
 *
 * Every open editor's map entry carries a full workspace-wide diagnostics
 * snapshot (see TypecheckingService#setWorkspaceDiagnosticStatus), so the same
 * diagnostic normally appears once per open document. The diagnostics panel
 * separately reads CodeMirror's merged lint state so it can also include Ruff
 * and mpy-cross results.
 *
 * @param {Map<string, object[]>} diagnosticStatus Snapshot of
 *   `TypecheckingService#diagnosticStatus`.
 * @returns {object[]} Deduplicated diagnostic entries, each carrying at least
 *   `uri`, `line`, `character`, `message`, and `severity`.
 */
export function collectDiagnosticEntries(diagnosticStatus) {
  const entries = []
  const seen = new Set()
  for (const [documentUri, diagnostics] of diagnosticStatus?.entries?.() || []) {
    for (const diagnostic of diagnostics) {
      const uri = diagnostic.uri || documentUri
      const key = [
        uri,
        diagnostic.line,
        diagnostic.character,
        diagnostic.message,
        diagnostic.severity,
      ].join('\0')
      if (seen.has(key)) { continue }
      seen.add(key)
      entries.push({ ...diagnostic, uri })
    }
  }
  return entries
}

/**
 * Build an actionable runtime source/fallback detail string for status tooltips.
 *
 * @param {object} snapshot TypecheckingSnapshot.
 * @returns {string} Detail suffix (includes leading space) or empty string.
 */
function runtimeStatusDetail(snapshot) {
  const source = snapshot.runtimeSource
  if (!source || source === 'bundled') { return '' }
  const fallbacks = snapshot.runtimeFallbacks || []
  const rejected = fallbacks.length
    ? ` (${fallbacks.length} incompatible runtime${fallbacks.length === 1 ? '' : 's'} skipped)`
    : ''
  if (source === 'last-known-good') {
    return ` Runtime: cached last-known-good.${rejected}`
  }
  return ` Runtime: ${source}.${rejected}`
}

/**
 * @param {object} snapshot TypecheckingSnapshot.
 * @param {boolean} enabled Whether type checking is enabled.
 * @param {{error: number, warning: number, info: number}} [counts] Visible problem counts,
 *   owned by the diagnostics panel so the tab and its badge cannot disagree.
 */
export function typecheckingStatusPresentation(snapshot, enabled, counts = { error: 0, warning: 0, info: 0 }) {
  const state = enabled ? snapshot.status : 'disabled'
  const board = snapshot.selectedStubBundle?.id || snapshot.selectedStubBundle || 'standard'
  const mode = snapshot.typeCheckingMode || 'standard'

  switch (state) {
    case 'starting':
      return {
        state,
        label: 'Type check: Starting',
        title: 'Pyright is starting.',
        busy: true,
      }
    case 'switching':
      return {
        state,
        label: 'Type check: Switching',
        title: 'Pyright is loading type information for the connected device.',
        busy: true,
      }
    case 'ready': {
      const plural = (value, noun) => `${value} ${noun}${value === 1 ? '' : 's'}`
      const summary = `${plural(counts.error, 'error')}, ${plural(counts.warning, 'warning')}, ` +
            `${counts.info} info`
      const runtimeDetail = runtimeStatusDetail(snapshot)
      return {
        state,
        label: `Type check: ${counts.error ? plural(counts.error, 'error') : 'Ready'}`,
        title: `Pyright is ready in ${mode} mode with ${board} stubs. ${summary}.${runtimeDetail}`,
        busy: false,
        runtimeSource: snapshot.runtimeSource || null,
      }
    }
    case 'error':
      return {
        state,
        label: 'Type check: Error',
        title: `Pyright failed: ${snapshot.error?.message || snapshot.error || 'Unknown error'}. ` +
                'Disable and enable type checking in Settings to retry.' +
                runtimeStatusDetail(snapshot),
        busy: false,
        runtimeSource: snapshot.runtimeSource || null,
      }
    case 'disposed':
      return {
        state,
        label: 'Type check: Closed',
        title: 'Pyright has been closed.',
        busy: true,
      }
    default:
      return {
        state: 'disabled',
        label: 'Type check: Off',
        title: 'Pyright is disabled in Settings.',
        busy: false,
      }
  }
}

export function renderTypecheckingStatus(statusElement, checkbox, snapshot, enabled, problemsLabel = 'Problems', counts) {
  const presentation = typecheckingStatusPresentation(snapshot, enabled, counts)
  statusElement.dataset.state = presentation.state
  statusElement.title = presentation.title
  statusElement.setAttribute('aria-label', `${problemsLabel}: ${presentation.title}`)
  statusElement.setAttribute('aria-busy', String(presentation.busy))
  checkbox.disabled = presentation.busy
  return presentation
}
