/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import toastr from 'toastr'

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

export async function fetchArrayBuffer(url) {
    const response = await fetch(url, {cache: 'no-store'})
    if (!response.ok) { throw new Error(response.status) }
    return await response.arrayBuffer()
}

export function getUserUID() {
    const localStorageKey = 'uuid';

    // Check if UUID already exists in local storage
    let uuid = localStorage.getItem(localStorageKey);
    if (uuid) {
        return uuid;
    }

    // Function to generate UUIDv4
    function generateUUIDv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0,
                  v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Generate and store new UUID
    uuid = generateUUIDv4();
    localStorage.setItem(localStorageKey, uuid);
    return uuid;
}

export function getScreenInfo() {
    function getScreenOrientation() {
        if (window.matchMedia("(orientation: portrait)").matches) {
            return "portrait";
        } else if (window.matchMedia("(orientation: landscape)").matches) {
            return "landscape";
        }
        return null;
    }

    function snapToGrid(x) {
        x = Math.round(x)
        const grid = [
            240, 320, 360, 375, 414, 480, 540, 576, 600, 640, 667, 720, 768, 800, 810, 896, 900, 980,
            1024, 1080, 1200, 1280, 1366, 1440, 1600, 1920, 2160, 2560, 3440, 3840, 4320, 5120, 7680,
        ]
        const closest = grid.reduce((prev, curr) => Math.abs(curr - x) < Math.abs(prev - x) ? curr : prev)
        return (Math.abs(closest - x) <= 3) ? closest : x
    }

    const dpr = window.devicePixelRatio || 1
    return {
        dpr: parseFloat(dpr.toFixed(2)),
        width: snapToGrid(window.screen.width),
        height: snapToGrid(window.screen.height),
        orientation: getScreenOrientation(),
    }
}

export class IdleMonitor {
    constructor(idleTimeout = 60000) {
        this.idleTimeout = idleTimeout;
        this.onIdle = () => {};
        this.onActive = () => {};
        this.idleTimer = null;
        this.isIdle = false;
        this.handleActivity = this.handleActivity.bind(this);
        this.attachEventListeners();
        this.startIdleTimer();
    }

    attachEventListeners() {
        //window.addEventListener('mousemove', this.handleActivity);
        window.addEventListener('keypress', this.handleActivity);
        window.addEventListener('scroll', this.handleActivity);
        window.addEventListener('click', this.handleActivity);
        window.addEventListener('touchstart', this.handleActivity);
        window.addEventListener('touchmove', this.handleActivity);
    }

    removeEventListeners() {
        //window.removeEventListener('mousemove', this.handleActivity);
        window.removeEventListener('keypress', this.handleActivity);
        window.removeEventListener('scroll', this.handleActivity);
        window.removeEventListener('click', this.handleActivity);
        window.removeEventListener('touchstart', this.handleActivity);
        window.removeEventListener('touchmove', this.handleActivity);
    }

    handleActivity() {
        if (this.isIdle) {
            this.isIdle = false;
            this.onActive();
        }
        this.resetIdleTimer();
    }

    startIdleTimer() {
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            this.isIdle = true;
            this.onIdle();
        }, this.idleTimeout);
    }

    resetIdleTimer() {
        clearTimeout(this.idleTimer);
        this.startIdleTimer();
    }

    stopMonitoring() {
        clearTimeout(this.idleTimer);
        this.removeEventListeners();
    }

    setIdleCallback(callback) {
        if (typeof callback === 'function') {
            this.onIdle = callback;
        }
    }

    setActiveCallback(callback) {
        if (typeof callback === 'function') {
            this.onActive = callback;
        }
    }
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

/*
 * UI Helpers
 */

const addCss = (css) => { document.head.appendChild(document.createElement("style")).innerHTML = css }
const getCssPropertyValue = (name) => getComputedStyle(document.documentElement).getPropertyValue(name)

const QSA = (x) => [...document.querySelectorAll(x)]
const QS  = document.querySelector.bind(document)
const QID = document.getElementById.bind(document)

const iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent)

export { addCss, getCssPropertyValue, QSA, QS, QID, iOS }

export function sanitizeHTML(s) {
    //return '<pre>' + (new Option(s)).innerHTML + '</pre>'
    return (new Option(s)).innerHTML.replace(/(?:\r\n|\r|\n)/g, '<br>').replace(/ /g, '&nbsp;')
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

/*
 * Flattens a drop into a list of { path, file } entries, where path is relative
 * to the drop target. Dropped folders are walked recursively; they appear as
 * { path, dir: true } before their contents, so empty ones survive the upload.
 *
 * webkitGetAsEntry() is only valid while the drop event is being dispatched, so
 * the entry list is captured synchronously before the first await.
 */
export function readDroppedFiles(dataTransfer) {
    const entries = []
    const collected = []

    for (const item of Array.from(dataTransfer.items || [])) {
        if (item.kind !== 'file') continue
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
        if (entry) {
            entries.push(entry)
        } else {
            const file = item.getAsFile()
            if (file) { collected.push({ path: file.name, file }) }
        }
    }

    if (!entries.length && !collected.length) {
        for (const file of Array.from(dataTransfer.files || [])) {
            collected.push({ path: file.name, file })
        }
    }

    if (!entries.length) {
        return Promise.resolve(collected)
    }

    return (async () => {
        for (const entry of entries) {
            await walkFileEntry(entry, '', collected)
        }
        return collected
    })()
}

async function walkFileEntry(entry, prefix, out) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isFile) {
        out.push({ path, file: await new Promise((res, rej) => entry.file(res, rej)) })
    } else if (entry.isDirectory) {
        out.push({ path, dir: true })
        const reader = entry.createReader()
        const children = []
        // readEntries() yields the directory in batches and signals the end with
        // an empty one; the whole listing has to be drained before recursing.
        for (;;) {
            const batch = await new Promise((res, rej) => reader.readEntries(res, rej))
            if (!batch.length) break
            children.push(...batch)
        }
        for (const child of children) {
            await walkFileEntry(child, path, out)
        }
    }
}

export function isRunningStandalone() {
    return (window.matchMedia('(display-mode: standalone)').matches);
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

let activityTimeout = -1;

// Function to indicate activity
export function indicateActivity() {
    // Clear any existing timeout to reset the inactivity timer
    if (activityTimeout !== -1) {
        clearTimeout(activityTimeout);
    }

    // Set the connected color to active if not already set
    if (activityTimeout === -1) {
        document.documentElement.style.setProperty('--connected-color', 'var(--connected-active)');
    }

    // Change the color to passive after some inactivity
    activityTimeout = setTimeout(() => {
        // Set the connected color to passive
        document.documentElement.style.setProperty('--connected-color', 'var(--connected-passive)');
        activityTimeout = -1;
    }, 100);
}

export function setupTabs(containerNode) {
    const tabs = containerNode.querySelectorAll('.tab')
    const tabContents = containerNode.querySelectorAll('.tab-content')

    tabs.forEach(tab => {
        tab.setAttribute('href', '#')
        tab.addEventListener('click', (ev) => {
            ev.preventDefault()
            const targetId = tab.getAttribute('data-target')

            tabs.forEach(t => t.classList.remove('active'))
            tab.classList.add('active')

            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.add('active')
                } else {
                    content.classList.remove('active')
                }
            })
            return false
        })
    })
}

if (navigator.appVersion.indexOf("Win") >= 0) {
    document.body.classList.add('windows')
} else if (navigator.appVersion.indexOf("Mac") >= 0) {
    document.body.classList.add('macos')
} else {
    document.body.classList.add('linux')
}

/*
 * Error handling
 */

export function report(title, err) {
    console.error(err, err.stack)
    toastr.error(sanitizeHTML(err.message), title)
    analytics.track('Error', {
        title: title,
        name: err.name,
        message: err.message,
        stack: err.stack,
    })
}

window.addEventListener('error', (e) => {
    if (e instanceof ErrorEvent && e.message.includes('ResizeObserver')) {
        // skip
    } else {
        report("Error", e)
    }
});

window.addEventListener('unhandledrejection', (ev) => {
    report("Error", new Error(ev.reason))
    ev.preventDefault()
});

