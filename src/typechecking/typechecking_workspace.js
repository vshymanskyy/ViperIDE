/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

function decodePython(bytes) {
  if (typeof bytes === 'string') { return bytes }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/**
 * @param {boolean} enabled Whether type checking is enabled.
 * @param {string} scope Effective diagnostic scope.
 * @returns {boolean} Whether the whole device Python workspace should be mirrored.
 */
export function shouldMirrorDevicePythonWorkspace(enabled, scope) {
  return enabled === true && scope === 'workspace'
}

/**
 * Read and reconcile device Python files when workspace diagnostics are enabled.
 *
 * Unreadable files are preserved in the service's prior mirror.
 *
 * @param {object} options Integration dependencies and settings.
 * @returns {Promise<{mirrored: boolean, files: Record<string, string>, errors: object[]}>}
 */
export async function syncDevicePythonWorkspace({
  enabled,
  scope,
  raw,
  fsCache,
  isSpecialPath,
  replaceWorkspace,
}) {
  if (!shouldMirrorDevicePythonWorkspace(enabled, scope)) {
    return { mirrored: false, files: {}, errors: [] }
  }
  if (typeof replaceWorkspace !== 'function') {
    throw new TypeError('Device workspace sync requires replaceWorkspace')
  }
  const workspace = await readDevicePythonWorkspace(raw, fsCache, isSpecialPath)
  replaceWorkspace(workspace.files, {
    preservePaths: workspace.errors.map(({ path }) => path),
  })
  return { mirrored: true, ...workspace }
}

/**
 * Read regular `.py` files known to the device filesystem cache.
 *
 * Reads remain sequential because raw-mode commands cannot overlap.
 *
 * @param {object} raw Device raw-mode connection.
 * @param {object} fsCache Device filesystem cache.
 * @param {(path: string) => boolean} isSpecialPath Special-path predicate.
 * @returns {Promise<{files: Record<string, string>, errors: Array<{path: string, error: Error}>}>}
 */
export async function readDevicePythonWorkspace(raw, fsCache, isSpecialPath) {
  const files = {}
  const errors = []

  // Raw-mode commands are serialized, so device reads must remain sequential.
  for (const path of fsCache.knownPaths()) {
    const entry = fsCache.get(path)
    if (!path.endsWith('.py') || entry?.isDir || isSpecialPath(path)) { continue }
    try {
      files[path] = decodePython(await fsCache.readFile(raw, path))
    } catch (error) {
      errors.push({ path, error })
    }
  }

  return { files, errors }
}
