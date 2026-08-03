/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Helpers that do not need a browser. This module has no imports and touches no globals
 * beyond the ones Node also has, so anything built on top of it - the transports, the
 * package manager - can be loaded and tested outside a page. Everything that needs a
 * window, a document or a toast lives in utils_browser.js.
 */

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export class Mutex {
    constructor() {
        this._lock = Promise.resolve()
    }

    acquire() {
        let release
        const lock = new Promise(resolve => release = resolve)
        const acquire = this._lock.then(() => release)
        this._lock = this._lock.then(() => lock)
        return acquire
    }
}

export async function fetchJSON(url) {
    const response = await fetch(url, {cache: 'no-store'})
    if (!response.ok) { throw new Error(response.status) }
    return await response.json()
}

export async function fetchText(url) {
    const response = await fetch(url, {cache: 'no-store'})
    if (!response.ok) { throw new Error(response.status) }
    return await response.text()
}

export async function fetchArrayBuffer(url) {
    const response = await fetch(url, {cache: 'no-store'})
    if (!response.ok) { throw new Error(response.status) }
    return await response.arrayBuffer()
}

export function splitPath(path) {
    const parts = path.split('/').filter(part => part !== '')
    const filename = parts.pop()
    const directoryPath = parts.join('/')
    return [ directoryPath, filename ]
}

// Joins a device directory with a relative name, tolerating a trailing slash on
// the directory and a leading one on the name.
export function joinPath(dir, name) {
    dir = String(dir || '/').replace(/\/+$/, '')
    name = String(name).replace(/^\/+/, '')
    return `${dir}/${name}`
}

// Escapes text for safe interpolation into HTML text nodes or attribute values.
// Unlike sanitizeHTML(), this does not alter whitespace, so the result round-trips
// exactly through the HTML parser (needed when the value is later looked up, e.g. via data-* attributes).
export function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// Escapes text for use inside a double-quoted string of a CSS selector,
// e.g. QS(`[data-fn="${escapeCSS(fn)}"]`). File names may contain quotes,
// backslashes, control or non-ASCII characters, which otherwise break
// selector parsing (or silently fail to match in some engines).
export function escapeCSS(s) {
    return String(s).replace(/["\\]|[^\x20-\x7e]/gu,
        (c) => (c === '"' || c === '\\') ? '\\' + c
                                         : '\\' + c.codePointAt(0).toString(16) + ' ')
}

export function sizeFmt(size, places=1) {
    if (size == null) { return "unknown" }
    const suffixes = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let i = 0
    while (size > 1024 && i < suffixes.length - 1) {
        i++
        size /= 1024
    }
    // Check if the size is in bytes and omit decimals in that case
    if (i === 0) {
        return `${size}${suffixes[i]}`
    } else {
        return `${(size).toFixed(places)}${suffixes[i]}`
    }
}

/*
 * Error handling
 */

let errorReporter = null

/*
 * How an error should surface depends on where the code runs: the app raises a toast and
 * tells analytics, a Node test run only has the console. Whoever knows installs the
 * reporter (utils_browser.js does it for the app); everything else just calls report().
 */
export function setErrorReporter(callback) {
    errorReporter = callback
}

export function report(title, err) {
    console.error(title, err, err && err.stack)
    if (errorReporter) { errorReporter(title, err) }
}
