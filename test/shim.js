/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Loads ViperIDE browser modules under Node.
 *
 * The goal of this test suite is to exercise the *real* ViperIDE code that talks to a
 * board, not a re-implementation of it that can silently drift. `src/rawmode.js` has no
 * imports and loads as-is, but `src/package_mgr.js` pulls in
 * `src/utils.js`, which imports toastr and touches window/document at module scope.
 *
 * Rather than duplicating that module here, we read the source, strip its import
 * statements, and prepend Node equivalents of the names they provided. The import count
 * is asserted, so a new import in src/ fails loudly instead of producing an undefined
 * global at runtime.
 */

import { readFile } from 'node:fs/promises'

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* Any remaining ES import after stripping. Matches on the quoted specifier, so the
 * Python snippets embedded in ViperIDE sources ("import gc") are never mistaken for one. */
const LEFTOVER_IMPORT_RE = /^[ \t]*import\b[^\n]*?['"][^'"\n]+['"][^\n]*$/m

/*
 * Replaces the listed imports of `relPath` with `preamble`, then loads the result as an
 * ES module. Fails if a listed import is gone or an unhandled one appears, so drift in
 * src/ surfaces as a clear error instead of an undefined name at call time.
 */
async function loadShimmed(relPath, preamble, specifiers) {
    let body = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8')

    for (const spec of specifiers) {
        const re = new RegExp(`^[ \\t]*import\\s[^\\n]*from\\s*['"]${escapeRe(spec)}['"];?[ \\t]*$`, 'm')
        if (!re.test(body)) {
            throw new Error(`${relPath}: no longer imports '${spec}' - update test/lib/shim.js`)
        }
        body = body.replace(re, '')
    }

    const leftover = body.match(LEFTOVER_IMPORT_RE)
    if (leftover) {
        throw new Error(`${relPath}: unhandled import '${leftover[0].trim()}'` +
                        ` - add a Node equivalent in test/lib/shim.js`)
    }

    const source = `// shimmed from ${relPath}\n${preamble}\n${body}`
    return import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source))
}

/* Node equivalents of the three helpers `src/package_mgr.js` takes from `src/utils.js`.
 * Kept byte-identical in behaviour to the originals - they are trivial and not what this
 * suite is testing. */
const UTILS_SHIM = `
async function fetchJSON(url) {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) { throw new Error(response.status) }
    return await response.json()
}

async function fetchArrayBuffer(url) {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) { throw new Error(response.status) }
    return await response.arrayBuffer()
}

function splitPath(path) {
    const parts = path.split('/').filter(part => part !== '')
    const filename = parts.pop()
    const directoryPath = parts.join('/')
    return [ directoryPath, filename ]
}
`

let _pkgMgr = null

/* The real package manager. mpy-cross runs as a browser wasm bundle, so compilePython()
 * always throws here - package_mgr.js treats that as "install the .py source instead",
 * which is exactly the `prefer_source` path. Precompiled .mpy files served by an index
 * (micropython-lib v2) are still installed as .mpy, so that path stays covered. */
export async function loadPackageMgr() {
    if (_pkgMgr) { return _pkgMgr }
    _pkgMgr = await loadShimmed('src/package_mgr.js', `${UTILS_SHIM}
async function compilePython(_filename, _content, _devInfo) {
    throw new Error('mpy-cross is not available under Node')
}
`, ['./utils.js', './python_utils.js'])
    return _pkgMgr
}
