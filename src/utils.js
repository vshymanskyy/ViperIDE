/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

class Mutex {
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

function getUserUID() {
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

class ConnectionUID {
    constructor(uid) {
        if (!ConnectionUID.uidre.test(uid)) {
            throw new Error('Malformed Connection ID');
        }
        this.uid = uid;
    }

    value() {
        return this.uid;
    }

    static uidcs = '0W8N4Y1HP5DF9K6JM3C2XA7R';
    static uidre = new RegExp(`^([${ConnectionUID.uidcs}]{4}-)*[${ConnectionUID.uidcs}]{4}$`);
    static uidtr = {
        'B':'8',  'E':'F',  'G':'6',  'I':'1',  'L':'1',  'O':'0',  'Q':'0',  'S':'5',
    };

    static random() {
        // Generate 10 random bytes
        const hexString = Array(20)
            .fill()
            .map(() => Math.round(Math.random() * 0xF).toString(16))
            .join('');

        const rnd = BigInt(`0x${hexString}`);
        const num = ConnectionUID._base24(rnd, 16);
        return new ConnectionUID(num.slice(0, 4) + '-' + num.slice(4, 8) + '-' + num.slice(8, 12));
    }

    static parse(input) {
        // Normalize (and validate) input
        return new ConnectionUID(input.toUpperCase().split('').map(char =>
            ConnectionUID.uidtr[char] || char
        ).join(''));
    }

    static _base24(n, length) {
        const base = BigInt(24);
        let res = "";
        let prev = null;
        while (res.length < length) {
            let c = ConnectionUID.uidcs[n % base];
            if (c === prev) {
                c = ConnectionUID.uidcs[(n + BigInt(1)) % base];
            }
            prev = c;
            res += c;
            n /= base;
        }
        return res;
    }
}

function getScreenInfo() {
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

class IdleMonitor {
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

function splitPath(path) {
    const parts = path.split('/').filter(part => part !== '')
    const filename = parts.pop()
    const directoryPath = parts.join('/')
    return [ directoryPath, filename ]
}

/*
 * UI Helpers
 */

const addCss = (css) => { document.head.appendChild(document.createElement("style")).innerHTML = css }
const getCssPropertyValue = (name) => getComputedStyle(document.documentElement).getPropertyValue(name)

const QSA = (x) => [...document.querySelectorAll(x)]
const QS  = document.querySelector.bind(document)
const QID = document.getElementById.bind(document)

const T = i18next.t.bind(i18next)

const iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent)

function sanitizeHTML(s) {
    //return '<pre>' + (new Option(s)).innerHTML + '</pre>'
    return (new Option(s)).innerHTML.replace(/(?:\r\n|\r|\n)/g, '<br>').replace(/ /g, '&nbsp;')
}

function isRunningStandalone() {
    return (window.matchMedia('(display-mode: standalone)').matches);
}

function sizeFmt(size, places=1) {
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

function toggleFullScreen(elementId) {
    const element = QID(elementId)
    if (!document.fullscreenElement) {
        element.requestFullscreen().catch(err => {
            report('Error enabling full-screen mode', err)
        })
    } else {
        document.exitFullscreen()
    }
}

let activityTimeout = -1;

// Function to indicate activity
function indicateActivity() {
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

function setupTabs(containerNode) {
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

function report(title, err) {
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

