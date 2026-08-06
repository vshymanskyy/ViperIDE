/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import '@xterm/xterm/css/xterm.css'
import 'toastr/build/toastr.css'
import 'github-fork-ribbon-css/gh-fork-ribbon.css'
import './app_common.css'
import './app.css'

import toastr from 'toastr'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import { Terminal } from '@xterm/xterm'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { FitAddon } from '@xterm/addon-fit'

import { isStandalonePWA } from 'is-standalone-pwa';
import { addUpdateHandler, createNewEditor, getEditorFromElement } from './editor.js'
import { displayOpenFile, createTab, getTabFileName, getTabEditorElement } from './editor_tabs.js'
import { serial as webSerialPolyfill } from 'web-serial-polyfill'
import { WebSerial, WebBluetooth, WebSocketREPL, WebRTCTransport } from './transports/index.js'
import { MpRawMode, getActivePrompt } from './rawmode.js'
import { ReplMonitor } from './repl_monitor.js'
import { getPkgIndexes, rawInstallPkg, fetchPkgReadme } from './package_mgr.js'
import { ConnectionUID } from './connection_uid.js'
import translations from '../build/translations.json'
import { parseStackTrace, validatePython, disassembleMPY, minifyPython, prettifyPython, compilePython } from './python_utils.js'
import { createBrowserVM, SYSTEM_DIRS } from './emulator.js'
import { getSetting, onSettingChange, updateSetting } from './settings.js'
import { renderMarkdown } from './markdown.js'

import { UAParser } from 'ua-parser-js'
import * as amplitude from '@amplitude/analytics-browser'

import { splitPath, joinPath, sleep, fetchJSON, escapeCSS, sizeFmt, report } from './utils.js'
import { getUserUID, getScreenInfo, IdleMonitor, getCssPropertyValue, QSA, QS, QID, iOS,
         sanitizeHTML, indicateActivity, setupTabs,
         readDroppedFiles } from './utils_browser.js'

import { TreeView, parentDir, TREE_DRAG_TYPE } from './tree_view.js'
import * as fsCache from './fs_cache.js'
import { createZipSync } from './zip.js'

import { initControlClient } from './control_client.js'

import { library, dom } from '@fortawesome/fontawesome-svg-core'
import { faUsb, faBluetoothB } from '@fortawesome/free-brands-svg-icons'
import { faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFile, faFileCircleExclamation, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faXmark,
         faFolderOpen
       } from '@fortawesome/free-solid-svg-icons'
import { faMessage, faCircleDown } from '@fortawesome/free-regular-svg-icons'

library.add(faUsb, faBluetoothB)
library.add(faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFile, faFileCircleExclamation, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faXmark,
         faFolderOpen)
library.add(faMessage, faCircleDown)
dom.watch()

function getBuildDate() {
    return (new Date(VIPER_IDE_BUILD)).toISOString().substring(0, 19).replace('T',' ')
}

const T = i18next.t.bind(i18next)

const isLocalhost = (() => {
    const host = window.location.hostname
    return host === 'localhost' ||
           host.endsWith('.localhost') ||
           host === '127.0.0.1' ||
           host === '[::1]' ||
           host === '::1'
})()

/*
 * Device Management
 */

let editor, term, port
let editorFn = ''
let isInRunMode = false
let devInfo = null
let connType = null
let draftsRestored = false

/*
 * What the device is currently good for:
 *
 *   'disconnected'  - no device, or the user asked to let it go
 *   'busy-initial'  - just connected and not answering; it may be running code,
 *                     or it may not be a MicroPython board at all
 *   'busy-running'  - a confirmed board that is running code
 *   'ready'         - sitting at the REPL, everything enabled
 *   'reconnecting'  - the connection dropped and is being brought back
 *
 * The terminal works in every connected state; the panels that go through raw
 * mode do not, because entering raw mode interrupts whatever the board is doing.
 */
let deviceState = 'disconnected'
/* Survives a transient drop, so a reconnect does not repeat the welcome toast
   or re-open main.py over whatever the user is editing */
let sessionInitialized = false
let probeInFlight = false
let reconnectToken = 0
/* True while the user is letting the device go, so the disconnect callback that
   the teardown itself triggers is not mistaken for the device dropping out */
let intentionalDisconnect = false

const isBusyState = () => deviceState === 'busy-initial' || deviceState === 'busy-running'
const portReady = () => !!port && deviceState === 'ready'

/*
 * The only place that turns device state into UI: connection buttons, panel
 * availability, the Run/Stop button and the resets.
 *
 * Running a script from the editor is a busy board too - it just happens to be
 * busy at ViperIDE's own request - so it blocks the same panels. It is tracked
 * apart from deviceState because the session stays 'ready' throughout: the board
 * is answering, and raw mode is held rather than lost.
 */
function updateDeviceUI() {
    for (const t of ['ws', 'ble', 'usb']) {
        const btn = QID(`btn-conn-${t}`)
        const mine = (t === connType)
        btn.classList.toggle('connected', mine && (deviceState === 'ready' || isBusyState()))
        btn.classList.toggle('reconnecting', mine && deviceState === 'reconnecting')
    }

    /* Raw-mode panels are blocked while the board cannot answer. When simply
       disconnected, only the file tree is dimmed - and left clickable, since
       its placeholder doubles as a connect link. */
    const busy = isBusyState() || isInRunMode
    const panelsBlocked = busy || deviceState === 'reconnecting'
    for (const id of ['menu-files', 'menu-pkg', 'menu-tools']) {
        const el = QID(id)
        el.classList.toggle('inert', panelsBlocked || (id === 'menu-files' && deviceState === 'disconnected'))
        el.toggleAttribute('inert', panelsBlocked)
    }

    /* While anything is running, Run doubles as Stop */
    QID('btn-run-icon').classList.toggle('fa-circle-stop', busy)
    QID('btn-run-icon').classList.toggle('fa-circle-play', !busy)

    for (const id of ['btn-reset-soft', 'btn-reset-hard']) {
        QID(id).disabled = (deviceState === 'reconnecting')
    }
}

function setDeviceState(newState) {
    const prev = deviceState
    deviceState = newState
    updateDeviceUI()

    if (newState === 'busy-initial' && prev !== 'busy-initial') {
        toastr.info('You can interrupt it with ⏹ Stop,<br/>or Ctrl-C in the terminal', 'Device is busy (running code?)')
        /* The terminal is the only thing that works right now, and the hint above
           asks for a keystroke - so put the cursor where it is expected. Not on a
           phone, where taking focus means the on-screen keyboard covers the view. */
        term?.focus()
    }

    replMonitor.setWatchPrompt(isBusyState())
}

function setRunMode(on) {
    isInRunMode = on
    updateDeviceUI()
}

/*
 * The single place that ends a device session, however it went. The filesystem
 * cache forgets everything it read off the board, but open editors keep their
 * text and their backups: losing a device must not cost unsaved work.
 *
 * The file tree is deliberately left on screen rather than reset - it is the
 * last known state of the board, and every action on it already refuses to run
 * without a ready port. It is only made inert so nothing looks clickable.
 */
function teardownSession() {
    stopReconnectLoop()
    /* Whether the user gave up on it or the device is simply gone, nothing is
       being waited for any more */
    hideReconnectingToast()
    if (port) { port.abortReads() }
    port = null
    /* Cleared so the next connection re-reads it, and so anything asking who is
       attached gets an honest answer */
    devInfo = null
    connType = null
    draftsRestored = false
    sessionInitialized = false
    replMonitor.reset()
    fsCache.dropDeviceState()

    setDeviceState('disconnected')
    document.dispatchEvent(new CustomEvent("deviceDisconnected"))
}

/*
 * The notice stays up for exactly as long as it is true, and is taken down again
 * once the device is back. Announcing the reconnection on top of that would be
 * telling the same story twice, and one of the two would still be on screen.
 */
let reconnectingToast = null

function showReconnectingToast() {
    if (reconnectingToast) { return }
    reconnectingToast = toastr.warning('Connection lost, reconnecting…', undefined, {
        timeOut: 0,
        extendedTimeOut: 0,
    })
}

function hideReconnectingToast() {
    if (!reconnectingToast) { return }
    toastr.clear(reconnectingToast)
    reconnectingToast = null
}

/*
 * The connection died but the transport can bring the same device back without
 * asking anyone. Session state (devInfo, the cache, open tabs) is deliberately
 * kept: as far as the user is concerned this is a hiccup, not a goodbye.
 */
function handleTransientDrop() {
    showReconnectingToast()
    /* Frees anything stuck reading from the dead port, so its transaction ends
       and the mutex is available by the time the device is back */
    port.abortReads()
    setDeviceState('reconnecting')
    startReconnectLoop()
}

function handlePortDisconnect() {
    /* Transports can report the same death more than once; a drop that is already
       being handled - or was asked for - is not news */
    if (!port || intentionalDisconnect || deviceState === 'reconnecting') return
    if (port.canReopen) {
        handleTransientDrop()
    } else {
        toastr.warning('Device disconnected')
        teardownSession()
    }
}

async function disconnectDevice() {
    stopReconnectLoop()
    intentionalDisconnect = true
    try {
        if (port) {
            try {
                await port.disconnect()
            } catch (err) {
                console.log(err)
            }
        }
        teardownSession()
    } finally {
        intentionalDisconnect = false
    }
}

/*
 * Retries the same device every half second, forever - a board sitting in the
 * bootloader or held in reset comes back whenever it comes back. Only the user
 * stops this, by clicking the connection button. reopen() is used rather than a
 * fresh connect: it needs no permission prompt, and disconnect() is never called
 * here because WebSerial's revokes the permission itself.
 */
async function startReconnectLoop() {
    const p = port
    const token = ++reconnectToken
    while (token === reconnectToken) {
        try {
            await p.reopen()
        } catch (_err) {
            await sleep(500)
            continue
        }
        if (token !== reconnectToken) {
            /* The user let the device go while reopen was in flight */
            try { await p.disconnect() } catch (_err) { /* already gone */ }
            return
        }
        hideReconnectingToast()
        /* Out of 'reconnecting' before probing: to the init code that state means
           "a newer drop took this session over", and it would abandon it. It also
           puts the terminal back in business right away - the board decides
           between busy and ready from here. */
        setDeviceState(devInfo ? 'busy-running' : 'busy-initial')
        await initDeviceSession()
        return
    }
}

function stopReconnectLoop() {
    reconnectToken++
}

/*
 * Fed everything the terminal sees: raw-mode transactions swap the receive
 * callback away, so only free-running board output passes through here.
 */
const replMonitor = new ReplMonitor({
    onSoftReset: onSoftResetDetected,
    onPromptSettled: onPromptSettled,
})

/*
 * The board said 'soft reboot' on its own channel. boot.py and main.py have run
 * (or are still running), so the listing is suspect either way - and the board
 * may have gone busy, or come back from it.
 */
async function onSoftResetDetected() {
    fsCache.deviceMayHaveChanged()
    _rerenderFileTree()

    if (probeInFlight || !port || isInRunMode || port.inTransaction) return
    probeInFlight = true
    try {
        /* A moment for main.py to either finish or settle into running */
        await sleep(300)
        if (!port || deviceState === 'reconnecting' || isInRunMode || port.inTransaction) return
        const responding = await MpRawMode.probeRepl(port)
        /* The probe queues behind whatever else holds the transport, so it can answer
           long after it was asked - and about a board that has moved on since. Most of
           all it can answer in the middle of a run that started while it waited: a
           board the app itself is driving must never be reported busy, or the Run
           button is left showing Stop with nothing to ever take it back. */
        if (!port || deviceState === 'reconnecting' || isInRunMode) return
        if (responding) {
            if (isBusyState()) { await completeDeviceInit() }
        } else {
            setDeviceState(devInfo ? 'busy-running' : 'busy-initial')
        }
    } finally {
        probeInFlight = false
    }
}

/*
 * A busy board showed a prompt and then stayed quiet on it: the program exited,
 * or the user interrupted it. One cheap probe confirms it is really listening -
 * a false alarm costs the program a single Enter on stdin.
 */
async function onPromptSettled() {
    if (probeInFlight || !port || !isBusyState() || isInRunMode || port.inTransaction) return
    probeInFlight = true
    try {
        const responding = await MpRawMode.probeRepl(port, 1500)
        if (responding && port && deviceState !== 'reconnecting' && !isInRunMode && isBusyState()) {
            await completeDeviceInit()
        }
    } finally {
        probeInFlight = false
    }
}

let defaultWsURL = 'ws://192.168.1.123:8266'
let defaultWsPass = ''

async function prepareNewPort(type) {
    let new_port;
    analytics.track('Device Start Connection', { connection: type })

    if (type === 'ws') {
        let url
        if (typeof window.webrepl_url === 'undefined' || window.webrepl_url == '') {
            url = prompt('Enter WebREPL device address.\nSupported protocols: ws wss rtc', defaultWsURL)
            if (!url) { return }
            defaultWsURL = url

            if (url.startsWith('http://')) { url = url.slice(7) }
            if (url.startsWith('https://')) { url = url.slice(8) }
            if (!url.includes('://')) { url = 'ws://' + url }

            if (window.location.protocol === 'https:' && url.startsWith('ws://')) {
                /* Navigate to device, which should automatically reload and ask for WebREPL password */
                window.location.assign(url.replace('ws://', 'http://'))
                return
            }
        } else {
            url = window.webrepl_url
            defaultWsURL = url
            window.webrepl_url = ''
        }

        if (url.startsWith('ws://') || url.startsWith('wss://')) {
            try {
                // Special handling of URLs like
                // wss://blynk.cloud/stream/qe7FBr7Sj.../Terminal
                const info = URL.parse(url)
                if (info.host.includes('blynk') && info.pathname.startsWith('/stream/')) {
                    const [_, _path, token, ds] = info.pathname.split('/')
                    const blynkAuthPattern = /^[A-Za-z0-9\-_]{32}$/;
                    if (blynkAuthPattern.test(token)) {
                        url = `wss://${info.host}:443/msgforwarder?deviceToken=${token}&dataStreamName=${ds}`
                    }
                }
            } catch (_err) {
                // all ok
            }

            new_port = new WebSocketREPL(url)
            new_port.onPasswordRequest(async () => {
                /* A board that rebooted asks again, and a dialog nobody opened would
                   be a strange way to find out. The board says if it is wrong. */
                if (deviceState === 'reconnecting' && defaultWsPass) { return defaultWsPass }
                const pass = prompt('WebREPL password:', defaultWsPass)
                if (pass == null) { return }
                if (pass.length < 4) {
                    toastr.error('Password is too short')
                    return
                }
                defaultWsPass = pass
                return pass
            })
        } else if (url.startsWith('rtc://')) {
            const id = ConnectionUID.parse(url.replace('rtc://', ''))
            new_port = new WebRTCTransport(id.value())
        } else if (url.startsWith('vm://')) {
            new_port = createBrowserVM()
            analytics.track('Run MPY VM')
        } else {
            toastr.error('Unknown link type')
        }
    } else if (type === 'ble') {
        if (iOS) {
            toastr.error('WebBluetooth is not available on iOS')
            return
        }
        if (!window.isSecureContext) {
            toastr.error('WebBluetooth cannot be accessed with unsecure connection')
            return
        }
        if (typeof navigator.bluetooth === 'undefined') {
            toastr.error('Try Chrome, Edge, Opera, Brave', 'WebBluetooth is not supported')
            return
        }
        new_port = new WebBluetooth()
    } else if (type === 'usb') {
        if (iOS) {
            toastr.error('WebSerial is not available on iOS')
            return
        }
        if (!window.isSecureContext) {
            toastr.error('WebSerial cannot be accessed with unsecure connection')
            return
        }
        if (typeof navigator.serial === 'undefined' && typeof navigator.usb === 'undefined') {
            toastr.error('Try Chrome, Edge, Opera, Brave', 'WebSerial and WebUSB are not supported')
            return
        }
        if (typeof navigator.serial === 'undefined' || getSetting('force-serial-poly')) {
            console.log('Using WebUSB instead of WebSerial')
            new_port = new WebSerial(webSerialPolyfill)
        } else {
            new_port = new WebSerial()
        }
    } else {
        toastr.error('Unknown connection type')
        return
    }

    try {
        await new_port.requestAccess()
    } catch (_err) {
        return
    }
    return new_port
}

function wirePort(new_port) {
    new_port.onActivity(indicateActivity)
    new_port.onReceive((data) => {
        term.write(data)
        replMonitor.feed(data)
    })
    new_port.onDisconnect(handlePortDisconnect)
}

export async function connectDevice(type) {
    if (port) {
        const msg = (deviceState === 'reconnecting') ? 'Stop reconnecting and disconnect?'
                                                     : 'Disconnect current device?'
        if (!confirm(msg)) { return }
        await disconnectDevice()
        return
    }

    const new_port = await prepareNewPort(type)
    if (!new_port) { return }
    // Connect new port
    try {
        await new_port.connect()
    } catch (err) {
        report('Cannot connect', err)
        return
    }

    port = new_port
    connType = type
    wirePort(port)

    analytics.track('Device Port Connected', Object.assign({ connection: type }, await port.getInfo()))

    await initDeviceSession()
}

/*
 * Shared by the initial connection and every successful reconnect: ask - without
 * disturbing anything - whether the board is listening, and either bring the
 * session fully up or settle into a busy state for the ReplMonitor to resolve
 * once a prompt shows up. Interrupting a board that did not answer is opt-in.
 */
async function initDeviceSession() {
    let responding = false
    try {
        responding = await MpRawMode.probeRepl(port)
    } catch (_err) {
        /* A probe that failed outright gets the same answer as one that timed out */
    }
    if (!port || deviceState === 'reconnecting') return

    if (responding || getSetting('interrupt-running-code')) {
        await completeDeviceInit()
    } else {
        setDeviceState(devInfo ? 'busy-running' : 'busy-initial')
    }
}

/*
 * Brings a listening board all the way up: raw mode (which interrupts whatever
 * may still be running), device info, file tree. The first pass of a session
 * additionally greets the user and auto-opens main.py - a reconnect, or a busy
 * board waking up, skips the ceremony and lands straight back in 'ready'.
 */
async function completeDeviceInit() {
    // TODO: detect WDT and disable it temporarily
    const firstTime = !sessionInitialized
    let ok = false
    let raw = null
    try {
        raw = await MpRawMode.begin(port)
        await _raw_ensureDevInfo(raw)

        if (firstTime) {
            toastr.success(sanitizeHTML(devInfo.machine + '\n' + devInfo.version), 'Device connected')
            analytics.track('Device Connected', devInfo)
            console.log('Device info', devInfo)
        }

        /* An install link that had no board to act on when it arrived - either
           it opened the app, or it was handed to a window that was sitting
           with nothing connected. Cleared either way, so it fires once */
        if (window.pkg_install_url) {
            const pkg = window.pkg_install_url
            window.pkg_install_url = null
            await _raw_installPkg(raw, pkg)
            analytics.track('Quick Install Completed', { url: pkg })
        }

        await _raw_updateFileTree(raw)

        if (firstTime) {
            if        (fsCache.has('/main.py')) {
                await _raw_loadFile(raw, '/main.py')
            } else if (fsCache.has('/code.py')) {
                await _raw_loadFile(raw, '/code.py')
            }
        }
        sessionInitialized = true
        ok = true
    } catch (err) {
        if (deviceState === 'reconnecting') {
            /* The port dropped out from under the init - the reconnect already
               owns the story, an error toast on top would only confuse */
        } else if (err.message.includes('Timeout') || err.message.includes('not responding')) {
            report('Device is not responding', new Error(`Ensure that:\n- You're using a recent version of MicroPython\n- The correct device is selected`))
        } else {
            report('Error reading device info', err)
        }
    } finally {
        if (raw) {
            try { await raw.end() } catch (_err) { /* device may have disconnected */ }
        }
    }

    if (!port || deviceState === 'reconnecting') return

    if (ok) {
        if (firstTime) {
            document.dispatchEvent(new CustomEvent("deviceConnected", {detail: {port: port}}))
        }
        /* Print banner. TODO: optimize
           Ctrl-B answers with the same greeting a board gives after restarting,
           so the monitor is told to expect one rather than read it as news. */
        replMonitor.expectBanner()
        await port.write('\x02')
        setDeviceState('ready')
    } else {
        setDeviceState(devInfo ? 'busy-running' : 'busy-initial')
    }
}

/*
 * File Management
 */

/* Which files are open outlives a re-render, so it is kept here rather than
   scraped back out of the DOM: collapsing a folder rebuilds the whole tree.
   Whether a file is changed or conflicted is the cache's to answer. */
const openFiles = new Set()
let selectedFn = null

export async function refreshFileTree() {
    if (!portReady()) return;
    const raw = await MpRawMode.begin(port)
    try {
        await _raw_updateFileTree(raw)
    } finally {
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }
}

export async function createNewFile(path) {
    if (!portReady()) return;
    const fn = prompt(`Creating new file inside ${path}\n` +
                      `Please enter the name.\n` +
                      `\n` +
                      `Use "/" to create folders along the way:\n` +
                      `  folder/myfile.py   - a file in a new folder\n` +
                      `  folder/            - just the folder`)
    if (fn == null || fn == '') return
    const raw = await MpRawMode.begin(port)
    try {
        if (fn.endsWith('/')) {
            const full = joinPath(path, fn.slice(0, -1))
            await raw.makePath(full)
            fileTreeView.expand(full)
        } else {
            const full = joinPath(path, fn)
            if (fn.includes('/')) {
                // Ensure path exists
                const [dirname, _] = splitPath(full)
                await raw.makePath(dirname)
            }
            await raw.touchFile(full)
            // Known to be empty, and this is what puts it in the listing
            fsCache.noteWrite(full, new Uint8Array(0))
            fileTreeView.expand(parentDir(full))
            await _raw_loadFile(raw, full)
        }
        await _raw_updateFileTree(raw)
    } finally {
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }
}

export async function removeFile(path) {
    if (!portReady()) return;
    if (!confirm(`Remove ${path}?`)) return
    const raw = await MpRawMode.begin(port)
    try {
        await raw.removeFile(path)
        fsCache.removed(path)
        document.dispatchEvent(new CustomEvent("fileRemoved", {detail: {path: path}}))
        await _raw_updateFileTree(raw)
    } finally {
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }
}

export async function removeDir(path) {
    if (!portReady()) return;
    const inside = fsCache.countUnder(path)
    if (!confirm(inside ? `Remove ${path} and the ${inside} item(s) inside it?`
                        : `Remove ${path}?`)) return
    const raw = await MpRawMode.begin(port)
    try {
        await raw.removeTree(path)
        fsCache.removedTree(path)
        document.dispatchEvent(new CustomEvent("dirRemoved", {detail: {path: path}}))
        await _raw_updateFileTree(raw)
    } finally {
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }
}

/* Moves a file or folder into another folder of the same device */
export async function moveToDir(src, dstDir) {
    if (!portReady()) return;
    const [_dirname, name] = splitPath(src)
    const dst = joinPath(dstDir, name)
    if (dst === src) return
    await _movePath(src, dst, dstDir)
}

const fileExt = (name) => {
    const i = name.lastIndexOf('.')
    return (i > 0) ? name.slice(i) : ''
}

/* Renames a file or folder in place. A name containing "/" moves it into
   (or creates) another folder along the way - allowed, but confirmed, since
   it is easy to type by accident while editing a name in place. */
export async function renamePath(src, newName) {
    if (!portReady()) return;
    const [dirname, oldName] = splitPath(src)
    if (newName === oldName) return

    const makesPath = newName.includes('/')
    if (makesPath) {
        if (!confirm(`"${newName}" contains "/", so this will move it into another folder ` +
                     `(created if it does not exist yet).\n\nContinue?`)) return
    }

    if (!fsCache.get(src)?.isDir) {
        const base = newName.includes('/') ? newName.slice(newName.lastIndexOf('/') + 1) : newName
        const oldExt = fileExt(oldName), newExt = fileExt(base)
        if (newExt !== oldExt) {
            if (!confirm(`This changes the file extension from "${oldExt || '(none)'}" to "${newExt || '(none)'}".\n\nContinue?`)) return
        }
    }

    const dst = joinPath(dirname, newName)
    const [dstDir, _dstName] = splitPath(dst)
    await _movePath(src, dst, dstDir, { makesPath })
}

async function _movePath(src, dst, dstDir, { makesPath = false } = {}) {
    if (fsCache.has(dst)) {
        toastr.error(`${dst} already exists`)
        return
    }
    const raw = await MpRawMode.begin(port)
    try {
        if (makesPath) { await raw.makePath(dstDir) }
        await raw.movePath(src, dst)
        // Ahead of the event, so both listeners see an already-migrated cache
        fsCache.renamed(src, dst)
        document.dispatchEvent(new CustomEvent("fileRenamed", {detail: {old: src, new: dst}}))
        fileTreeView.expand(dstDir)
        await _raw_updateFileTree(raw)
    } catch (err) {
        report('Cannot move', err)
    } finally {
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }
}

/* Uploads files (and folders, where the browser exposes them) dropped onto the
   file tree from the desktop */
async function uploadDroppedFiles(dataTransfer, dstDir) {
    const dropped = await readDroppedFiles(dataTransfer)
    if (!dropped.length) return
    if (!portReady()) {
        toastr.info('Connect your device first')
        return
    }

    const items = dropped.map(item => Object.assign({}, item, { path: joinPath(dstDir, item.path) }))
    const files = items.filter(item => !item.dir)
    const clashes = files.filter(item => fsCache.has(item.path))
    if (clashes.length && !confirm(`${clashes.length} of ${files.length} file(s) already exist in ${dstDir}.\nOverwrite?`)) return

    toastr.info(`Uploading ${files.length} file(s)...`)
    let uploaded = 0
    const raw = await MpRawMode.begin(port)
    try {
        for (const item of items) {
            if (item.dir) {
                await raw.makePath(item.path)
                continue
            }
            const [dirname, _] = splitPath(item.path)
            if (dirname) { await raw.makePath(dirname) }
            await raw.writeFile(item.path, new Uint8Array(await item.file.arrayBuffer()))
            /* Deliberately not cached: telling the cache the path changed is
               what makes the refresh below notice, so a file that is open in an
               editor gets reloaded (or flagged) instead of quietly diverging. */
            fsCache.invalidate(item.path)
            uploaded++
        }
        toastr.success(`Uploaded ${uploaded} file(s)`)
        analytics.track('Files Uploaded', { count: uploaded })
    } catch (err) {
        report('Upload failed', err)
    } finally {
        // A failed batch still leaves files on the device, so always refresh
        try {
            fileTreeView.expand(dstDir)
            await _raw_updateFileTree(raw)
        } catch (_err) {
            // Device is gone; a stale tree is the least of the problems
        }
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }
}

/*
 * Drag-out downloads.
 *
 * Chromium hands a dragged item to the OS by fetching the URL advertised in the
 * drag's DownloadURL entry. That URL has to be fetchable without this page's
 * help - the download runs in the browser process and never reaches a service
 * worker - so the only workable target is a blob: URL, which means the bytes
 * must already be in the browser when dragstart returns.
 *
 * Reading them takes a round trip to the device, which cannot happen inside
 * dragstart. So a drag arms the download and, unless the file was already read
 * (opening a file in the editor fills the same cache for free), it is the next
 * drag that carries the file out. A folder comes out as a .zip, since a drag
 * can only carry one file; packing it is not a round trip, so a folder whose
 * every file is already cached is zipped on the spot, inside dragstart.
 *
 * Firefox and Safari ignore DownloadURL, so there the drag simply does nothing.
 */

const downloadsInFlight = new Map()     // path -> Promise

// DownloadURL is a Chromium-only convention. Elsewhere there is nothing to hand
// the file to, so there is no point reading it off the device.
const canDragOut = (navigator.userAgentData && navigator.userAgentData.brands)
    ? navigator.userAgentData.brands.some(b => /Chromium/i.test(b.brand))
    : /Chrom(e|ium)|Edg\/|OPR\//.test(navigator.userAgent)

function downloadName(path) {
    const name = path.split('/').pop()
    if (!isDirPath(path)) return name
    if (path === '/') {
        // The root has no name of its own to give the archive
        const now = new Date();
        const pad = n => String(n).padStart(2, "0");

        const t =
            `${String(now.getFullYear()).slice(-2)}` +
            `${pad(now.getMonth() + 1)}` +
            `${pad(now.getDate())}-` +
            `${pad(now.getHours())}` +
            `${pad(now.getMinutes())}` +
            `${pad(now.getSeconds())}`;
        if (devInfo?.uid) {
            return `viperide-${devInfo.uid}-${t}.zip`
        } else if (devInfo.machine === "webassembly") {
            return `viperide-vm-${t}.zip`
        } else {
            return `viperide-${devInfo.machine}-${t}.zip`
        }
    } else {
        return `${name}.zip`
    }
}

function downloadType(path) {
    return isDirPath(path) ? 'application/zip' : 'application/octet-stream'
}

/* Hands the browser a URL for bytes the cache already holds, so a file the IDE
   has read or written for any reason can be dragged out without a second read */
function stageDownload(path) {
    if (fsCache.stagedFor(path)) return
    const bytes = fsCache.peek(path)
    if (!bytes) return
    stageBytes(path, bytes, fsCache.currentGeneration())
}

function stageBytes(path, bytes, gen) {
    const type = downloadType(path)
    fsCache.stage(path, {
        url: URL.createObjectURL(new Blob([bytes], { type })),
        name: downloadName(path),
        type,
        gen,
    })
}

function prepareDownload(node) {
    if (fsCache.stagedFor(node.path)) return Promise.resolve()
    if (downloadsInFlight.has(node.path)) return downloadsInFlight.get(node.path)
    if (!portReady()) return Promise.reject(new Error('No device connected'))

    const task = (async () => {
        // A refresh landing while the bytes are on the wire makes them useless,
        // however fresh the result looks by the time it arrives
        const gen = fsCache.currentGeneration()
        const raw = await MpRawMode.begin(port)
        try {
            stageBytes(node.path, await _raw_readForDownload(raw, node), gen)
        } finally {
            downloadsInFlight.delete(node.path)
            try { await raw.end() } catch (_err) { /* device may have disconnected */ }
        }
    })()
    downloadsInFlight.set(node.path, task)
    return task
}

/* What packing a folder involves: one entry per descendant, named relative to
   the folder's parent, so the folder itself is the top-level entry in the zip.
   Dragging out the root packs the filesystem with no wrapping folder. `file` is
   the path to read the entry's bytes from, or null for a directory entry. */
function zipEntries(node) {
    const entries = []
    const base = parentDir(node.path)
    const strip = (base === '/') ? 1 : base.length + 1
    const pack = (n) => {
        const name = n.path.slice(strip)
        if (n.children) {
            if (name) { entries.push({ path: name.replace(/\/*$/, '/'), file: null }) }
            // /dev, /proc and /sys are not files and would only fail to read
            for (const child of n.children) {
                if (!child.virtual) { pack(child) }
            }
        } else {
            entries.push({ path: name, file: n.path })
        }
    }
    pack(node)
    return entries
}

async function _raw_readForDownload(raw, node) {
    if (!node.children) {
        return await fsCache.readFile(raw, node.path)
    }
    const entries = []
    for (const { path, file } of zipEntries(node)) {
        entries.push({ path, data: file ? await fsCache.readFile(raw, file) : new Uint8Array(0) })
    }
    return createZipSync(entries)
}

/* The folder equivalent of stageDownload(): if every file below it is in the
   cache - they were opened, or the folder was dragged out before - the zip can
   be built here and now, and this very drag carries the folder out. */
function stageFolderFromCache(node) {
    const entries = []
    for (const { path, file } of zipEntries(node)) {
        if (!file) { entries.push({ path, data: new Uint8Array(0) }); continue }
        const bytes = fsCache.peek(file)
        if (!bytes) return                       // a device read it is, then
        entries.push({ path, data: bytes })
    }
    stageBytes(node.path, createZipSync(entries), fsCache.currentGeneration())
}

function fileTreeDragStart(node, dataTransfer) {
    if (!canDragOut || node.virtual) return      // nothing on the device to hand out
    if (!fsCache.stagedFor(node.path)) {
        if (node.children) { stageFolderFromCache(node) } else { stageDownload(node.path) }
    }
    // Still nothing to offer: a drag that leaves the window arms the next one,
    // so a plain move inside the tree never pays for a read it does not need.
    const entry = fsCache.stagedFor(node.path)
    if (!entry) return
    // A colon would be read as the end of the file name
    dataTransfer.setData('DownloadURL', `${entry.type}:${entry.name.replace(/:/g, '_')}:${entry.url}`)
    dataTransfer.effectAllowed = 'copyMove'
}

/* Called when a drag left the window and came back with nothing - the one
   moment where it is worth explaining that the file is not ready yet. */
function fileTreeDragMissed(node) {
    if (!canDragOut || node.virtual) return
    if (fsCache.stagedFor(node.path)) return    // it was handed over, or Chrome refused it
    const name = downloadName(node.path)
    toastr.info(`Reading ${name} from the device...`)
    prepareDownload(node).then(
        () => {
            analytics.track('File Prepared For Download', { dir: !!node.children })
            toastr.success(`${name} is ready - drag it out again to save it`)
        },
        (err) => report(`Cannot read ${name}`, err)
    )
}

async function execReplNoFollow(cmd) {
    await port.write('\r\x03\x03')
    //await port.flushInput()
    //await port.write('\x05')            // Ctrl-E: enter paste mode
    await port.write(cmd + '\r\n')
    //await port.write('\x04')            // Ctrl-D: execute
}

/* /proc, /dev and /sys are windows into the running system, not storage: they
   cannot be edited, moved, deleted, or packed into a download. */
const isSpecialPath = (path) => SYSTEM_DIRS.has('/' + path.split('/')[1])

/* The root is a folder that no walk reports as a node of its own */
const isDirPath = (path) => (path === '/') || !!fsCache.get(path)?.isDir

function fileIcon(name) {
    const fnuc = name.toUpperCase()
    if (fnuc.endsWith('.MPY')) {
        return 'fa-solid fa-cube'
    } else if (['.CRT', '.PEM', '.DER', '.CER', '.PFX', '.P12'].some(x => fnuc.endsWith(x))) {
        return 'fa-solid fa-certificate'
    } else if (fnuc === '???') {
        return 'fa-solid fa-file-circle-exclamation'
    } else {
        return 'fa-solid fa-file'
    }
}

function isSelectedFile(path) {
    return (path === selectedFn) ||
           [editorFn, `/${editorFn}`, `/flash/${editorFn}`].includes(path)
}

/* The last walk, kept so markers that change without the filesystem being
   re-read can be shown without paying for another walk */
let lastFsTree = null
let lastFsStats = [null, null, null]

function _rerenderFileTree() {
    if (lastFsTree) { _updateFileTree(lastFsTree, lastFsStats) }
}

function _updateFileTree(fs_tree, fs_stats)
{
    lastFsTree = fs_tree
    lastFsStats = fs_stats
    let [fs_used, _fs_free, fs_size] = fs_stats;

    function sorted(content) {
        // Natural sort by name
        if (QID('use-natural-sort').checked) {
            const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
            content.sort((a,b) => collator.compare(a.name, b.name))
        }

        // Stable-sort folders first
        content.sort((a,b) => (('content' in a)?0:1) - (('content' in b)?0:1))

        return content
    }

    function dirNode(n) {
        const special = isSpecialPath(n.path)
        return {
            name: n.name,
            path: n.path,
            icon: 'fa-solid fa-folder',
            iconOpen: 'fa-solid fa-folder-open',
            virtual: special,
            collapsed: special,
            drag: !special,
            drop: !special,
            rename: !special,
            actions: special ? [] : [
                { action: 'create', title: 'Create', icon: 'fa-solid fa-plus' },
                { action: 'remove-dir', title: 'Remove', icon: 'fa-solid fa-xmark' },
            ],
            children: treeNodes(n.content),
        }
    }

    function fileNode(n) {
        if (isSpecialPath(n.path)) {
            return { name: n.name, path: n.path, icon: 'fa-solid fa-gear', virtual: true, drop: false, rename: false }
        }
        const classes = []
        if (isSelectedFile(n.path)) { classes.push('selected') }
        if (openFiles.has(n.path)) { classes.push('open') }
        if (fsCache.isDirty(n.path)) { classes.push('changed') }
        if (fsCache.isConflicted(n.path)) { classes.push('conflict') }
        return {
            name: n.name,
            path: n.path,
            size: n.size,
            icon: fileIcon(n.name),
            classes,
            drag: true,
            action: 'open',
            data: { fn: n.path },
            meta: sizeFmt(n.size),
            actions: [
                { action: 'remove-file', title: 'Remove', icon: 'fa-solid fa-xmark' },
            ],
        }
    }

    function treeNodes(content) {
        return sorted(content).map((n) => ('content' in n) ? dirNode(n) : fileNode(n))
    }

    /* Something wrote to the device without going through us - a script, a
       reboot, a paste at the REPL - so what is shown may already be out of date */
    const listingStale = fsCache.isListingStale()

    const root = {
        name: '/',
        path: '/',
        icon: 'fa-solid fa-folder',
        iconOpen: 'fa-solid fa-folder-open',
        // Draggable so the whole filesystem can be pulled out as one archive,
        // but there is nowhere to move it to
        drag: true,
        move: false,
        meta: `${T('files.used')} ${sizeFmt(fs_used,0)} / ${sizeFmt(fs_size,0)}`,
        actions: [
            { action: 'create',  title: 'Create',  icon: 'fa-solid fa-plus' },
            { action: 'refresh', title: 'Refresh', icon: `fa-solid fa-arrows-rotate${listingStale ? ' fs-stale' : ''}` },
        ],
        children: treeNodes(fs_tree),
    }

    if (getSetting("advanced-mode")) {
        root.children.push({
            name: 'sysinfo.md',
            path: '~sysinfo.md',
            icon: 'fa-regular fa-message',
            action: 'open',
            data: { fn: '~sysinfo.md' },
            meta: 'virtual',
            virtual: true,           // generated on the fly, not a file on the device
            rename: false,
        })
    }

    fileTreeView.setNodes([root])
}

const fileTreeView = new TreeView(QID('menu-file-tree'), {
    onAction(action, node) {
        if (!node) return
        switch (action) {
            case 'refresh':     refreshFileTree(); break
            case 'create':      createNewFile(node.path); break
            case 'remove-dir':  removeDir(node.path); break
            case 'remove-file': removeFile(node.path); break
            case 'open':        fileClick(node.path); break
        }
    },
    onMove: moveToDir,
    onDropFiles: uploadDroppedFiles,
    onDragStart: fileTreeDragStart,
    onDragMissed: fileTreeDragMissed,
    onRename: (node, newName) => renamePath(node.path, newName),
})

/* A move renames every path below it, so the markers and the currently open
   file have to follow along. */
document.addEventListener("fileRenamed", (event) => {
    const { old: oldFn, new: newFn } = event.detail
    const renamed = (fn) => (fn === oldFn) ? newFn
                          : fn.startsWith(oldFn + '/') ? newFn + fn.slice(oldFn.length)
                          : fn
    for (const fn of [...openFiles]) {
        if (renamed(fn) !== fn) {
            openFiles.delete(fn)
            openFiles.add(renamed(fn))
        }
    }
    editorFn = renamed(editorFn)
    if (selectedFn) { selectedFn = renamed(selectedFn) }
})

/* Dropping a file anywhere outside the tree would make the browser navigate to
   it, silently discarding whatever is open in the IDE. Dropping a dragged tree
   item back into the page would start a pointless download of it. Run in the
   capture phase so embedded editors cannot consume the event first. */
for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (ev) => {
        if (ev.defaultPrevented || !ev.dataTransfer) return
        if (QID('menu-file-tree').contains(ev.target)) return
        const types = Array.from(ev.dataTransfer.types)
        const lowerTypes = types.map(t => t.toLowerCase())
        if (!types.includes('Files') &&
            !lowerTypes.includes(TREE_DRAG_TYPE) &&
            !lowerTypes.includes('downloadurl')) return
        ev.preventDefault()
        ev.stopPropagation()
        if (type === 'dragover') { ev.dataTransfer.dropEffect = 'none' }
    }, { capture: true })
}

/*
 * Every path that changes something on the device ends up here, which makes this
 * the one place that has to notice a file changing underneath an open editor:
 * the cache diffs the new listing against the previous one and says what moved.
 */
async function _raw_updateFileTree(raw) {
    try {
        await _raw_ensureDevInfo(raw)
    } catch (err) {
        // A device that will not say who it is can still have its files listed
        console.log('Cannot read device info', err)
    }

    let fs_stats = [null, null, null];
    try {
        fs_stats = await raw.getFsStats()
    } catch (err) {
        console.log(err)
    }

    const fs_tree = await raw.walkFs()
    const delta = fsCache.reconcileListing(fs_tree, isSpecialPath)

    _updateFileTree(fs_tree, fs_stats);

    await _raw_reconcileOpenTabs(raw, delta)
    await _raw_restoreDrafts(raw)
    return delta
}

/*
 * The device is only asked who it is once per connection. It cannot be asked
 * before raw mode works, which is why this is not simply part of connecting: on a
 * board that was busy when it was plugged in, the first time we know raw mode
 * works is after the running code ended or was interrupted by hand.
 */
async function _raw_ensureDevInfo(raw) {
    if (devInfo) {
        return devInfo
    }
    devInfo = Object.assign(await raw.getDeviceInfo(), { connection: connType })
    port?.setDeviceInfo(devInfo)
    const { ambiguous } = fsCache.setDevice(devInfo, connType)
    console.log(`Unsaved-file backups are ${ambiguous ? 'shared by boards like this one' : 'per board'}`)
    return devInfo
}

export function fileTreeSelect(fn) {
    selectedFn = fn
    for (const el of QSA('#menu-file-tree .name')) {
        el.classList.remove('selected')
    }
    // The file might be a meta/unsaved one, with no row of its own
    fileTreeRow(fn)?.classList.add('selected')
}

/* The clickable name element of a file row, which carries its markers */
function fileTreeRow(fn) {
    return QS(`#menu-file-tree [data-fn="${escapeCSS(fn)}"]`)
}

/* Toggles a row marker. Only 'open' is tracked here - whether a file is changed
   or conflicted is answered by the cache when the tree is rebuilt. */
function markFile(fn, marker, on) {
    if (marker === 'open') {
        if (on) { openFiles.add(fn) } else { openFiles.delete(fn) }
    }
    fileTreeRow(fn)?.classList.toggle(marker, on)
}

/* Publishes a change in dirtiness to everything that shows it: the tree row and
   the tab. Both used to keep their own idea of it and could disagree. */
function setDirty(fn, dirty) {
    markFile(fn, 'changed', dirty)
    document.dispatchEvent(new CustomEvent("fileDirtyChanged", {detail: {fn, dirty}}))
    if (!fsCache.persistenceEnabled()) { warnBackupsDisabled() }
}

function setConflict(fn, conflicted) {
    fsCache.setConflict(fn, conflicted)
    markFile(fn, 'conflict', conflicted)
    document.dispatchEvent(new CustomEvent("fileConflict", {detail: {fn, conflicted}}))
}

let backupsWarned = false
function warnBackupsDisabled() {
    if (backupsWarned) return
    backupsWarned = true
    toastr.warning('Unsaved changes are no longer backed up. Browser storage is full or unavailable.')
}

/* Coalesces a burst of calls into one, running on both the leading and the
   trailing edge: the leading edge keeps a marker responsive, while the trailing
   edge is what catches the end of continuous typing. */
function makeCoalesced(ms) {
    let timer = null, latest = null
    return (fn) => {
        latest = fn
        if (timer) { clearTimeout(timer) } else { fn() }
        timer = setTimeout(() => { timer = null; latest() }, ms)
    }
}

export async function fileClick(fn) {
    if (!portReady()) return;

    const raw = await MpRawMode.begin(port)
    try {
        await _raw_loadFile(raw, fn)
    } finally {
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }

    fileTreeSelect(fn)
}

export async function pyMinify() {
    if (!editorFn.endsWith('.py')) {
        toastr.info(`Please open a Python file`)
        return
    }

    const input = editor.state.doc.toString()
    const res = await minifyPython(input)

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: res }
    })

    analytics.track('Run Python-Minify')
    toastr.info(`Minified ${input.length} to ${res.length}`)
}

export async function pyPrettify() {
    if (!editorFn.endsWith('.py')) {
        toastr.info(`Please open a Python file`)
        return
    }

    const res = await prettifyPython(editor.state.doc.toString())

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: res }
    })

    analytics.track('Run Ruff Format')
}

/* Saves the source as usual, then cross-compiles the same content and stores
   the resulting .mpy alongside it - two writes, so the source on the device
   always matches what was compiled. */
export async function saveAndCompile() {
    if (!portReady()) return;
    if (!editor) return;
    if (!editorFn.endsWith('.py')) {
        toastr.info(`Please open a Python file`)
        return
    }

    const savedFn = editorFn
    const savedText = editor.state.doc.toString()

    await saveCurrentFile()

    const mpy = await compilePython(savedFn, savedText, devInfo)
    const mpyFn = savedFn.replace(/\.py$/, '.mpy')

    const raw = await MpRawMode.begin(port)
    try {
        await fsCache.writeFile(raw, mpyFn, mpy)
        await _raw_updateFileTree(raw)
    } finally {
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }

    analytics.track('File Compiled')
    toastr.success(`Compiled to ${mpyFn}`)
}

/*
 * Disassembles the currently open file in place, without writing anything to the
 * device or to the file being edited. A `.py` file is cross-compiled first; a
 * `.mpy` file shown in the hex viewer is already compiled and is disassembled
 * as-is.
 */
export async function showDisassembly() {
    let fn, dis

    if (editor && editorFn.endsWith('.py')) {
        fn = editorFn
        const mpy = await compilePython(fn, editor.state.doc.toString(), devInfo)
        dis = await disassembleMPY(mpy)
    } else if (!editor && editorFn.endsWith('.mpy')) {
        fn = editorFn
        let bytes = fsCache.peek(fn)
        if (!bytes) {
            if (!portReady()) {
                toastr.warning('Device disconnected')
                return
            }
            const raw = await MpRawMode.begin(port)
            try {
                bytes = await fsCache.readFile(raw, fn)
            } finally {
                try { await raw.end() } catch (_err) { /* device may have disconnected */ }
            }
        }
        dis = await disassembleMPY(bytes)
    } else {
        toastr.info(`Please open a Python or .mpy file`)
        return
    }
    analytics.track('Run MPY Disassembler')

    // ".mpy.dis" is what createNewEditor() recognizes for syntax highlighting
    const disFn = (fn.endsWith('.mpy') ? fn : fn.replace(/\.py$/, '.mpy')) + '.dis'
    if (displayOpenFile(disFn)) {
        const view = getEditorFromElement(getTabEditorElement(disFn))
        if (view) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: dis } })
        }
        fsCache.rebaseView(disFn, dis)
        return
    }

    const editorElement = createTab(disFn)
    editor = await createNewEditor(editorElement, disFn, dis, {
        wordWrap: getSetting('use-word-wrap'),
        devInfo,
        readOnly: true,
    })
    fsCache.openView(disFn, { baseline: dis, kind: 'text', readOnly: true })
    document.dispatchEvent(new CustomEvent("editorLoaded", {detail: {editor: editor, fn: disFn}}))
    editorFn = disFn
    autoHideSideMenu()
}

async function _raw_loadFile(raw, fn) {
    let content
    if (fn == '~sysinfo.md') {
        content = await raw.readSysInfoMD()
        if (displayOpenFile(fn)) {
            _reloadView(fn, content)
            autoHideSideMenu()
            return
        }
    } else if (displayOpenFile(fn)) {
        console.debug(`File ${fn} already opened. Switched to tab`)
        autoHideSideMenu()
        return
    } else {
        content = await fsCache.readFile(raw, fn)
        // The file is on the wire anyway; keep it ready to be dragged out
        stageDownload(fn)
        content = decodeText(content) ?? content
    }
    await _loadContent(fn, content, createTab(fn))
}

/*
 * Brings open editors back in line after files changed underneath them - an
 * upload, a package install, a script, or a write over the MCP bridge.
 *
 * A buffer with unsaved edits is never touched and never prompted about. It is
 * flagged instead, and the user resolves it by saving (their version wins) or by
 * closing and reopening the file (the device version wins). A dialog here would
 * be worse than useless: the MCP bridge answers confirm() with yes for the
 * duration of a call, so an agent writing a file would silently destroy the
 * edits it collided with.
 */
async function _raw_reconcileOpenTabs(raw, delta) {
    const gone = new Set(delta.gone)
    const reloaded = [], conflicted = []

    for (const fn of [...delta.changed, ...delta.gone]) {
        if (!fsCache.kindOf(fn)) continue           // not open, so nothing to bring in line
        if (fsCache.isDirty(fn) || gone.has(fn)) { conflicted.push(fn); continue }
        try {
            _reloadView(fn, await fsCache.readFile(raw, fn))
            reloaded.push(fn)
        } catch (_err) {
            conflicted.push(fn)                    // cannot be read now; leave the buffer alone
        }
    }

    if (reloaded.length) {
        toastr.info(`Reloaded ${reloaded.length} open file(s) from the device`)
    }
    for (const fn of conflicted) { setConflict(fn, true) }
    if (conflicted.length) {
        toastr.warning(sanitizeHTML(conflicted.join('\n')),
                       'Changed on the device - your unsaved edits were kept')
    }
}

/* Replaces what a tab is showing with what is now on the device. Only ever
   called for a buffer with nothing to lose. */
function _reloadView(fn, bytes) {
    const editorElement = getTabEditorElement(fn)
    if (!editorElement) return
    const kind = fsCache.kindOf(fn)

    if (kind === 'hex') {
        hexViewer(bytes.buffer, editorElement)
        fsCache.rebaseView(fn, '')
        return
    }

    const text = decodeText(bytes)
    if (text === null) {
        // It used to be text and is now binary: the view is the wrong shape for it
        setConflict(fn, true)
        return
    }

    if (kind === 'markdown') {
        /* Only ever a file read off the device, so its links stay live */
        editorElement.innerHTML = renderMarkdown(text)
        fsCache.rebaseView(fn, text)
        return
    }

    const view = getEditorFromElement(editorElement)
    if (!view) return
    let shown = text
    if (fn.endsWith('.json') && getSetting('expand-minify-json')) {
        try {
            shown = JSON.stringify(JSON.parse(text), null, 2)
        } catch (_err) {
            // Malformed on the device; show it as it is
        }
    }
    // Replacing the whole document would otherwise jump the view to the top
    const cursor = view.state.selection.main.head
    view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: shown },
        selection: { anchor: Math.min(cursor, shown.length) },
    })
    fsCache.rebaseView(fn, shown)
    // The dispatch above counts as a document change, so say plainly it is clean
    setDirty(fn, false)
}

/*
 * Reopens what was left unsaved when the browser was last closed. Nothing is
 * written to the device: the files come back as tabs with unsaved changes, so
 * saving or discarding them stays the user's decision.
 */
async function _raw_restoreDrafts(raw) {
    if (draftsRestored) return
    draftsRestored = true

    const drafts = fsCache.takeRestorableDrafts()
    if (!drafts.length) return

    /* Devices that report no unique id share a bucket with every device like them,
       so the work may not be from this one. */
    if (fsCache.isAmbiguousBucket()) {
        const when = new Date(Math.max(...drafts.map(d => d.ts || 0))).toLocaleString()
        const what = drafts.map(d => `  ${d.path}`).join('\n')
        if (!confirm(`${drafts.length} unsaved file(s) from ${when}:\n\n${what}\n\n` +
                     `This device does not report a unique id, so these may belong to ` +
                     `another ${fsCache.bucketLabel() || 'device'} like it.\n\nRestore them?`)) {
            return
        }
    }

    let restored = 0
    for (const draft of drafts) {
        try {
            if (!displayOpenFile(draft.path)) {
                try {
                    await _raw_loadFile(raw, draft.path)
                } catch (_err) {
                    // Gone from the device; saving it later puts it back
                    await _loadContent(draft.path, '', createTab(draft.path))
                }
            }
            // Against the baseline just established: an identical draft is moot,
            // and setDraft drops the backup for it
            if (!fsCache.setDraft(draft.path, draft.text)) { continue }

            const view = getEditorFromElement(getTabEditorElement(draft.path))
            if (!view) continue
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: draft.text } })
            setDirty(draft.path, true)
            restored++
        } catch (err) {
            console.log(`Cannot restore ${draft.path}`, err)
        }
    }
    if (restored) {
        toastr.info(`Restored ${restored} unsaved file(s) from your last session`)
        analytics.track('Drafts Restored', { count: restored })
    }
}

/* Device bytes as text, or null if they are not valid UTF-8 and so have to be
   treated as binary. */
function decodeText(bytes) {
    if (typeof bytes === 'string') { return bytes }
    try {
        return (new TextDecoder('utf-8', { fatal: true })).decode(bytes)
    } catch (_err) {
        return null
    }
}

async function _loadContent(fn, content, editorElement, { external=null } = {}) {
    /* The name the tab carries, which is what the cache is keyed on. Disassembly
       renames `fn` below, and a move renames the tab later, so neither the
       original argument nor the editor's own name can be relied on. */
    const tabFn = fn
    const willDisasm = fn.endsWith('.mpy') && QID('advanced-mode').checked

    if (content instanceof Uint8Array && !willDisasm) {
        hexViewer(content.buffer, editorElement)
        fsCache.openView(tabFn, { baseline: '', kind: 'hex', readOnly: true })
        editor = null
    } else if (fn.endsWith('.md') && getSetting('render-markdown')) {
        editorElement.innerHTML = renderMarkdown(content, { external })
        fsCache.openView(tabFn, { baseline: content, kind: 'markdown', readOnly: true })
        editor = null
    } else {
        let readOnly = false
        if (fn.endsWith('.json') && getSetting('expand-minify-json')) {
            try {
                // Prettify JSON
                content = JSON.stringify(JSON.parse(content), null, 2)
            } catch (_err) {
                toastr.warning('JSON is malformed')
            }
        } else if (willDisasm) {
            content = await disassembleMPY(content)
            fn = fn + '.dis'
            readOnly = true
            analytics.track('Run MPY Disassembler')
        }

        editorElement.innerHTML = '' // Clear existing content
        editor = await createNewEditor(editorElement, fn, content, {
            wordWrap: getSetting('use-word-wrap'),
            devInfo,
            readOnly,
        })
        /* The text as handed to the editor, which is not the bytes on the device
           for prettified JSON or a disassembly. Comparing against this is what
           makes an undo clear the marker again. */
        fsCache.openView(tabFn, { baseline: content, kind: 'text', readOnly })
        document.dispatchEvent(new CustomEvent("editorLoaded", {detail: {editor: editor, fn: fn}}))

        const scheduleSync = makeCoalesced(1000)
        addUpdateHandler(editor, (update) => {
            if (!update.docChanged) return
            // The tab knows the current name; this one goes stale on a move
            const key = getTabFileName(editorElement) || tabFn
            scheduleSync(() => setDirty(key, fsCache.setDraft(key, update.state.doc.toString())))
        })

        editorFn = fn
    }
    autoHideSideMenu()
}

export async function saveCurrentFile() {
    if (!portReady()) return;
    if (!editor) return;

    if (editor.state.readOnly) {
        toastr.warning("File is read only")
        return
    }

    /* Pinned before anything is awaited: refreshing the tree can open tabs -
       restoring a backup does exactly that - which moves editorFn along with the
       active tab. Everything below is about the file as it was when Save ran. */
    const savedFn = editorFn
    const savedText = editor.state.doc.toString()

    let content = savedText
    if (savedFn.endsWith('.json') && getSetting('expand-minify-json')) {
        try {
            // Minify JSON
            content = JSON.stringify(JSON.parse(content))
        } catch (_error) {
            toastr.error('JSON is malformed')
            return
        }
    } else if (savedFn.endsWith('.py')) {
        const backtrace = await validatePython(savedFn, savedText, devInfo)
        if (backtrace) {
            console.log(backtrace)
            toastr.warning(sanitizeHTML(backtrace.summary), backtrace.type)
        }
    }

    const raw = await MpRawMode.begin(port)
    try {
        /* The one write that goes through the cache rather than around it. It
           records the new size too, so the refresh below finds nothing changed
           and does not offer to reload the file over what was just written. */
        await fsCache.writeFile(raw, savedFn, content)
        // The buffer, not `content`: for JSON the two differ by the minifying
        fsCache.rebaseView(savedFn, savedText)
        stageDownload(savedFn)
        await _raw_updateFileTree(raw)
    } finally {
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
    }
    // Success
    analytics.track('File Saved')
    toastr.success('File Saved')

    document.dispatchEvent(new CustomEvent("fileSaved", {detail: {fn: savedFn}}))
    setDirty(savedFn, false)
    setConflict(savedFn, false)
}

/* The tab shown when nothing else is open: at startup, and again once the last
   tab is closed. It has no file behind it on the device, so it is never saved
   and never reconciled against a board. */
async function openWelcomeTab() {
    const fn = 'ViperIDE.md'
    const content = `
# ViperIDE - MicroPython Web IDE

[![GitHub Repo stars](https://img.shields.io/github/stars/vshymanskyy/ViperIDE?style=flat-square&color=green)](https://github.com/vshymanskyy/ViperIDE/stargazers) 
[![GitHub issues](https://img.shields.io/github/issues-raw/vshymanskyy/ViperIDE?style=flat-square&label=issues&color=green)](https://github.com/vshymanskyy/ViperIDE/issues) 
[![GitHub license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](https://github.com/vshymanskyy/ViperIDE) 
[![Support vshymanskyy](https://img.shields.io/static/v1?style=flat-square&label=support&message=%E2%9D%A4&color=%23fe8e86)](https://gist.github.com/vshymanskyy/840e6fa41ea6b028b91b333b6e4542ed) 

Connect your device and start creating! 🤖👨‍💻🕹️

> No device?  
> 👉 Open a [virtual device](${VIPER_IDE_BASE_URL}/?vm=1) and explore some examples.

## More about ViperIDE

- [README](https://github.com/vshymanskyy/ViperIDE/blob/main/README.md)
- [Features and device support](https://github.com/vshymanskyy/ViperIDE/blob/main/docs/Features.md)
- [Documentation](https://github.com/vshymanskyy/ViperIDE/tree/main/docs)
- [Discussions](https://github.com/orgs/micropython/discussions?discussions_q=ViperIDE)
- [![StandWithUkraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://github.com/vshymanskyy/StandWithUkraine/blob/main/docs/README.md) 

`
    await _loadContent(fn, content, createTab(fn))
}

export function clearTerminal() {
    term.clear()
}

/*
 * Something ran on the device and may have written anything, so everything read
 * off it is now suspect. Re-walking here would mean a second raw-mode handshake
 * and a full recursive listing right as the prompt comes back, so by default the
 * tree is only marked stale and the next refresh sorts it out.
 */
async function deviceRanCode({ mayRefresh = false } = {}) {
    fsCache.deviceMayHaveChanged()
    /* Not after a reset: the device is on its way back up and would not answer */
    if (mayRefresh && getSetting('refresh-after-run')) {
        try {
            await refreshFileTree()
            return
        } catch (err) {
            console.log('Cannot refresh after run', err)
        }
    }
    _rerenderFileTree()
}

export async function reboot(mode = 'hard') {
    /* Deliberately allowed while busy - a soft reset is one way out of it -
       but not while the port itself is gone */
    if (!port || deviceState === 'reconnecting') return;

    const release = await port.startTransaction()
    try {
        if (mode === 'soft') {
            await port.write('\r\x03\x03\x04')
        } else if (mode === 'hard') {
            await execReplNoFollow('import machine; machine.reset()')
        } else if (mode === 'bootloader') {
            await execReplNoFollow('import machine; machine.bootloader()')
        }
    } finally {
        release()
    }
    // A reset re-runs boot.py and main.py, which can write anything
    await deviceRanCode()
}

export async function runCurrentFile() {
    if (!port || deviceState === 'reconnecting') return;

    if (isInRunMode || isBusyState()) {
        /* Ctrl-C twice: interrupt any running program. When busy, the ReplMonitor
           notices the prompt coming back and finishes the wake-up. */
        await port.write('\r\x03\x03')
        return
    }

    if (!editorFn.endsWith('.py')) {
        toastr.error(`${editorFn} file is not executable`)
        return
    }

    term.write('\r\n')

    const soft_reboot = getSetting('auto-soft-reset')
    const timeout = -1
    /* Run mode is entered before the session is opened rather than after: with
       'soft-reset before run' the setup is the longest and noisiest part of a run -
       an interrupt, a reboot, a banner - and everything watching the terminal has to
       know that traffic is the app's own. */
    setRunMode(true)
    let raw
    try {
        raw = await MpRawMode.begin(port, soft_reboot)
    } catch (err) {
        setRunMode(false)
        throw err
    }
    try {
        const emit = true
        await sleep(10)
        await raw.exec(editor.state.doc.toString(), timeout, emit)
    } catch (err) {
        if (err.message.includes('KeyboardInterrupt')) {
            // Interrupted manually
        } else {
            const backtrace = parseStackTrace(err.message)
            if (backtrace) {
                console.log(backtrace)
            }
            toastr.error(sanitizeHTML(backtrace.summary), backtrace.type)
            return
        }
    } finally {
        port.emit = false
        try { await raw.end() } catch (_err) { /* device may have disconnected */ }
        setRunMode(false)
        term.write('\r\n' + getActivePrompt())
        await deviceRanCode({ mayRefresh: true })
        /* The run drove the board through raw mode and back out to a prompt, so it is
           listening - whatever decided otherwise while it was in flight was reading
           the app's own traffic. Undone here because the only other way out of a busy
           state is fresh terminal traffic for the monitor to notice, and a board
           sitting quietly at a prompt produces none: it would take the user pressing
           Stop, on a board that was never running anything. */
        if (port && deviceState !== 'reconnecting' && isBusyState()) {
            await completeDeviceInit()
        }
    }
    // Success
    analytics.track('Script Run')
}

/*
 * Package Management
 */

export async function loadAllPkgIndexes() {
    const nodes = []
    for (const index of await getPkgIndexes()) {
        nodes.push({ type: 'separator', name: index.name })

        const byName = new Map()
        for (const pkg of index.index.packages) {
            const keywords = pkg.keywords ? pkg.keywords.split(',').map(x => x.trim()) : [];
            if (keywords.includes('__hidden__')) {
                continue
            }
            byName.set(pkg.name, {
                name: pkg.name,
                // Indexes may list the same package name, so the key is qualified
                path: `${index.name}/${pkg.name}`,
                pkg: pkg.name,
                icon: 'fa-solid fa-cube',
                suffix: keywords.includes('native')
                    ? ' <i class="fa-solid fa-gauge-high" title="Efficient native module"></i>' : '', // TODO: add tooltip for this icon
                actions: [
                    { action: 'install', title: `Install ${pkg.name}`, label: pkg.version, icon: 'fa-regular fa-circle-down' },
                ],
            })
        }

        // A package named `foo-bar` is a sub-package of `foo`, when that exists
        for (const [name, node] of byName) {
            let parent = null
            for (let base = name; base.includes('-'); ) {
                base = base.split('-').slice(0, -1).join('-')
                if (byName.has(base)) { parent = byName.get(base); break }
            }
            if (parent) {
                parent.children = parent.children || []
                parent.children.push(node)
            } else {
                nodes.push(node)
            }
        }
    }
    pkgTreeView.setNodes(nodes)
}

const pkgTreeView = new TreeView(QID('menu-pkg-list'), {
    onAction(action, node) {
        if (action === 'install' && node) { installPkg(node.pkg) }
    },
})

async function _raw_installPkg(raw, pkg, { version=null } = {}) {
    analytics.track('Package Install', { name: pkg })
    toastr.info(`Installing ${pkg}...`)
    const dev_info = await _raw_ensureDevInfo(raw)
    const pkg_info = await rawInstallPkg(raw, pkg, {
        version,
        dev: dev_info,
        prefer_source: getSetting('install-package-source'),
    })
    if (pkg_info.version) {
        toastr.success(`Installed ${pkg_info.name}@${pkg_info.version}`)
    } else {
        toastr.success(`Installed ${pkg_info.name}`)
    }
}

export async function installPkg(pkg, { version=null } = {}) {
    if (!portReady()) {
        toastr.info('Connect yout device first')
        return false
    }
    const raw = await MpRawMode.begin(port)
    try {
        await _raw_installPkg(raw, pkg, { version })
        await _raw_updateFileTree(raw)
        return true
    } catch (err) {
        report('Installing failed', err)
        return false
    } finally {
        await raw.end()
    }
}

/*
 * The readme an install link points at, opened as a tab so the package can be
 * read while the install itself waits for a device. Nothing here touches a
 * board, and a package without a readme opens nothing.
 *
 * The tab is named after the package so it cannot collide with the welcome tab,
 * which is also a README.md with no file behind it. It is loaded as external
 * content: the document comes from whoever published the package, so its links
 * are made inert, and what it points at is resolved against where it came from.
 */
async function openPkgReadmeTab(pkg) {
    const readme = await fetchPkgReadme(pkg)
    if (!readme) { return }
    const fn = `${readme.name}/README.md`
    if (displayOpenFile(fn)) { return }
    await _loadContent(fn, readme.text, createTab(fn),
                       { external: { url: readme.url, version: readme.version } })
}

/*
 * A ?install= link. It arrives either as the URL this window was opened with,
 * or - once the PWA is installed and handles its own links - as a launch handed
 * to a window that is already running. A board that is already up installs
 * right away; otherwise the package is parked for completeDeviceInit() to pick
 * up as soon as something connects.
 */
async function startQuickInstall(pkg) {
    /* Already queued and waiting for a board - a second link for the same
       package has nothing to add, and re-toasting would only nag */
    if (window.pkg_install_url === pkg) { return }

    /* Parked before anything that can fail, so a link is never lost to a
       readme fetch or an analytics call going wrong */
    const ready = portReady()
    if (!ready) {
        window.pkg_install_url = pkg
        toastr.info('Warning: your files may be overwritten!', `Connect your device to install ${pkg}`)
    }

    analytics.track('Quick Install Opened', { id: pkg })
    /* Deliberately not awaited: a slow, missing or malformed readme must not
       hold up connecting to the device, which is what the link is really for */
    openPkgReadmeTab(pkg).catch(err => { console.log('Cannot load package readme', err) })

    if (ready && await installPkg(pkg)) {
        analytics.track('Quick Install Completed', { url: pkg })
    }
}

/*
 * What a link means to a window that is already open. Only ?install= is acted
 * on: the connection params (?wss=, ?rtc=, ?vm=) would tear down whatever the
 * session is already talking to, which is not what following a link should do.
 */
async function handleLaunchUrl(targetUrl) {
    let params
    try {
        params = new URL(targetUrl, window.location.href).searchParams
    } catch (err) {
        report('Cannot handle link', err)
        return
    }
    const pkg = params.get('install')
    if (pkg) {
        await startQuickInstall(pkg)
    }
}

/* Flipped once the startup path below has had its look at location.search */
let startupSettled = false

/*
 * The manifest asks for 'focus-existing', so a link followed while ViperIDE is
 * open focuses this window and delivers the URL here instead of reloading it.
 *
 * The launch that opened the window in the first place is delivered here too,
 * and the startup path has already acted on that one. The two are told apart
 * by when they arrive - the creating launch is queued before the page runs a
 * line of script, so it lands while startup is still in progress. Comparing it
 * against location.href would not do: following the same link twice is a real
 * launch that must still install, and in a window opened by that very link the
 * URLs are identical.
 */
function initLaunchHandler() {
    if (!('launchQueue' in window)) {
        console.log('Launch handler not supported')
        return
    }
    window.launchQueue.setConsumer((launchParams) => {
        const target = launchParams && launchParams.targetURL
        console.log('Launched with', target, startupSettled ? '' : '(startup, handled by page load)')
        if (!target || !startupSettled) { return }
        handleLaunchUrl(target).catch(err => { report('Cannot handle link', err) })
    })
}

export async function installPkgFromUrl() {
    if (!portReady()) {
        toastr.info('Connect yout device first')
        return
    }
    const url = prompt('Enter package name or URL:')
    if (url) {
        await installPkg(url)
    }
}

/*
 * UI helpers
 */

const fileTree = QID('side-menu')
const overlay = QID('overlay')

export function toggleSideMenu() {
    if (window.innerWidth <= 768) {
        fileTree.classList.remove('hidden')
        fileTree.classList.toggle('show')
    } else {
        fileTree.classList.remove('show')
        fileTree.classList.toggle('hidden')
    }

    if (fileTree.classList.contains('show') && !fileTree.classList.contains('hidden')) {
        overlay.classList.add('show')
    } else {
        overlay.classList.remove('show')
    }
}

export function autoHideSideMenu() {
    if (window.innerWidth <= 768) {
        fileTree.classList.remove('show')
        overlay.classList.remove('show')
    }
}

function hexViewer(arrayBuffer, targetElement) {
    const containerDiv = document.createElement('div')
    containerDiv.className = 'hexed-viewer monospace'

    const dataView = new DataView(arrayBuffer)
    const numBytes = dataView.byteLength

    function toHex(n) {
        return ('00' + n.toString(16)).slice(-2)
    }

    function toPrintableAscii(n) {
        return (n >= 32 && n <= 126) ? String.fromCharCode(n) : '.'
    }

    for (let offset = 0; offset < numBytes; offset += 16) {
        const hexLine = document.createElement('div')
        hexLine.className = 'hexed-line'

        const addressSpan = document.createElement('span')
        addressSpan.className = 'hexed-address'
        addressSpan.textContent = offset.toString(16).padStart(8, '0')

        const hexPartSpan = document.createElement('span')
        hexPartSpan.className = 'hexed-hex-part'
        let hexPart = ''
        let asciiPart = ''

        for (let i = 0; i < 16; i++) {
            if (offset + i < numBytes) {
                const byte = dataView.getUint8(offset + i)
                hexPart += toHex(byte) + ' '
                asciiPart += toPrintableAscii(byte)
            } else {
                hexPart += '   '
                asciiPart += ' '
            }
            if (i === 7) hexPart += ' '
        }

        hexPartSpan.textContent = hexPart.slice(0, -1)

        const asciiPartSpan = document.createElement('span')
        asciiPartSpan.className = 'hexed-ascii-part'
        asciiPartSpan.textContent = asciiPart

        hexLine.appendChild(addressSpan)
        hexLine.appendChild(hexPartSpan)
        hexLine.appendChild(asciiPartSpan)
        containerDiv.appendChild(hexLine)
    }

    targetElement.innerHTML = ''  // Clear any existing content
    targetElement.appendChild(containerDiv)
}


/*
 * Initialization
 */

if (!document.fullscreenEnabled) {
    QID('app-expand').style.display = 'none'
    QID('term-expand').style.display = 'none'
}

if (isStandalonePWA()) {
    QID('app-expand').style.display = 'none'
}

/* iOS: Disable auto-zoom on contenteditable */
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    document
      .querySelector("[name=viewport]")
      .setAttribute("content","width=device-width, initial-scale=1, maximum-scale=1");
}

export function toggleFullScreen(elementId) {
    const element = QID(elementId)
    if (!document.fullscreenElement) {
        element.requestFullscreen().catch(err => {
            report('Error enabling full-screen mode', err)
        })
    } else {
        document.exitFullscreen()
    }
}

export function applyTranslation() {
    try {
        // sanity check
        if (!i18next.exists('example.hello')) {
            throw new Error('No translation')
        }

        document.body.dir = i18next.dir()

        let metaKey = "Ctrl"
        if (navigator.platform.indexOf("Mac") == 0) {
            metaKey = "Cmd"
        }
        QID('btn-save').setAttribute('title',     T('tool.save') + ` [${metaKey}+S]`)
        QID('btn-run').setAttribute('title',      T('tool.run') + ' [F5]')
        QID('py-prettify').setAttribute('title',      '[Alt+Shift+F]')
        QID('py-minify').setAttribute('title',        '[Alt+Shift+M]')
        QID('py-save-compile').setAttribute('title',  `[${metaKey}+Shift+S]`)
        QID('py-disassemble').setAttribute('title',   '[Alt+Shift+D]')
        QID('btn-conn-ws').setAttribute('title',  T('tool.conn.ws'))
        QID('btn-conn-ble').setAttribute('title', T('tool.conn.ble'))
        QID('btn-conn-usb').setAttribute('title', T('tool.conn.usb'))
        QID('term-clear').setAttribute('title',   T('tool.clear'))
        QID('tab-term').innerText = T('tool.terminal')

        QSA('#app-expand, #term-expand').forEach(el => {
            el.setAttribute('title', T('tool.fullscreen'))
        })

        QS('#menu-file-title').innerText = T('menu.file-mgr')
        QS('#menu-pkg-title').innerText = T('menu.package-mgr')
        QS('#menu-settings-title').innerText = T('menu.settings')

        try {
            QID('no-files').innerText = T('files.no-files')
        } catch (_err) {
            window.console.warn(`No ${i18next.language} translation for 'files.no-files'`)
        }

        QS('#menu-line-conn').innerText = T('settings.conn')
        QS('#menu-line-editor').innerText = T('settings.editor')
        QS('#menu-line-other').innerText = T('settings.other')

        QS('label[for=interrupt-running-code]').innerText = T('settings.interrupt-running-code')
        QS('label[for=force-serial-poly]').innerText = T('settings.force-serial-poly')
        QS('label[for=install-package-source]').innerText = T('settings.install-package-source')
        QS('label[for=expand-minify-json]').innerText = T('settings.expand-minify-json')
        QS('label[for=use-word-wrap]').innerText = T('settings.use-word-wrap')
        QS('label[for=render-markdown]').innerText = T('settings.render-markdown')
        QS('label[for=refresh-after-run]').innerText = T('settings.refresh-after-run')
        QS('label[for=auto-soft-reset]').innerText = T('settings.auto-soft-reset')
        QS('label[for=use-natural-sort]').innerText = T('settings.use-natural-sort')

        QS('label[for=lang]').innerText = T('settings.lang')
        QS('label[for=zoom]').innerText = T('settings.zoom')

        QS('#about-cta').innerHTML = T('about.cta')
        QS('#report-bug').innerHTML = T('about.report-bug')
    } catch (err) {
        report("Error", err)
    }

    QSA('a[id=gh-star]').forEach(el => {
        el.setAttribute('href', 'https://github.com/vshymanskyy/ViperIDE')
        el.setAttribute('target', '_blank')
        el.classList.add('link')
    })

    QSA('a[id=gh-issues]').forEach(el => {
        el.setAttribute('href', 'https://github.com/vshymanskyy/ViperIDE/issues')
        el.setAttribute('target', '_blank')
        el.classList.add('link')
    })
}

const offlineReadyMessage = 'VIPER_IDE_OFFLINE_CACHE_READY'
let offlineReadyToastShown = false

function showOfflineReadyToast(version) {
    if (offlineReadyToastShown) return
    offlineReadyToastShown = true
    toastr.success(`ViperIDE ${version} can now be opened and used even if your device is offline or in airplane mode`, "Ready to be used offline")
}

(async () => {
    const urlParams = new URLSearchParams(window.location.search)

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === offlineReadyMessage) {
                showOfflineReadyToast(event.data?.version)
            }
        })
        try {
            await navigator.serviceWorker.register('./app_worker.js');
        } catch (err) {
            report("Unable to register service worker", err)
        }
    }

    await i18next.use(LanguageDetector).init({
        fallbackLng: 'en',
        //debug: true,
        resources: translations,
    })

    const currentLang = i18next.resolvedLanguage || 'en';

    updateSetting('lang', currentLang)
    onSettingChange('lang', async function(newValue) {
        await i18next.changeLanguage(newValue)
        applyTranslation()
    })

    if (isLocalhost) {
        window.analytics = {
            track: function() {},
            identify: function() {},
        }
    } else {
        amplitude.init('ee23cab1415ee70b31a694db17aebcb8', {
            autocapture: false
        })

        window.analytics = {
            track: (eventName, properties) => amplitude.track(eventName, properties),
            identify: (userId, traits) => {
                amplitude.setUserId(userId)
                if (traits) {
                    const id = new amplitude.Identify()
                    for (const [key, value] of Object.entries(traits)) {
                        id.set(key, value)
                    }
                    amplitude.identify(id)
                }
            }
        }

        try {
            const ua = new UAParser()
            const scr = getScreenInfo()

            let tz
            try {
                tz = Intl.DateTimeFormat().resolvedOptions().timeZone
            } catch (_e) {
                tz = (new Date()).getTimezoneOffset()
            }

            const userUID = getUserUID()

            analytics.identify(userUID, {
                version: VIPER_IDE_VERSION,
                build: getBuildDate(),
                browser: ua.getBrowser().name,
                browser_version: ua.getBrowser().version,
                os: ua.getOS().name,
                os_version: ua.getOS().version,
                cpu: ua.getCPU().architecture,
                pwa: isStandalonePWA(),
                screen: scr.width + 'x' + scr.height,
                orientation: scr.orientation,
                dpr: scr.dpr,
                dpi: QID('dpi-ruler').offsetHeight,
                lang: currentLang,
                //location: geo.latitude + ',' + geo.longitude,
                //continent: geo.continent,
                //country: geo.countryName,
                //region: geo.regionName,
                //city: geo.cityName,
                tz: tz,
            })

            analytics.track('Visit', {
                url: window.location.href,
                referrer: document.referrer,
            })

            const idleMonitor = new IdleMonitor(3*60*1000)

            idleMonitor.setIdleCallback(() => {
                analytics.track('User Idle')
            })

            idleMonitor.setActiveCallback(() => {
                analytics.track('User Active')
            })

        } catch (_err) {
            // analytics user enrichment failed; base tracking via amplitude still active
        }
    }

    onSettingChange('zoom', function(newValue) {
        const size = 14 * parseFloat(newValue)
        document.documentElement.style.setProperty('--font-size', (size).toFixed(1) + 'px')
        term.options.fontSize = (size * 0.9).toFixed(1)
    })

    initLaunchHandler()
    applyTranslation()


    setupTabs(QID('side-menu'))
    setupTabs(QID('terminal-container'))

    toastr.options.preventDuplicates = true;

    if (!urlParams.get('vm')) {
        await openWelcomeTab()
    }

    const xtermTheme = {
        foreground: '#F8F8F8',
        background: getCssPropertyValue('--bg-color-edit'),
        selection: '#5DA5D533',
        black: '#1E1E1D',
        brightBlack: '#262625',
        red: '#CE5C5C',
        brightRed: '#FF7272',
        green: '#5BCC5B',
        brightGreen: '#72FF72',
        yellow: '#CCCC5B',
        brightYellow: '#FFFF72',
        blue: '#5D5DD3',
        brightBlue: '#7279FF',
        magenta: '#BC5ED1',
        brightMagenta: '#E572FF',
        cyan: '#5DA5D5',
        brightCyan: '#72F0FF',
        white: '#F8F8F8',
        brightWhite: '#FFFFFF'
    }

    term = new Terminal({
        fontFamily: '"Hack", "Droid Sans Mono", "monospace", monospace',
        fontSize: (14 * 0.9).toFixed(1),
        theme: xtermTheme,
        cursorBlink: true,
        convertEol: true,
        allowProposedApi: true,
    })
    term.open(QID('xterm'))
    /* Returning false makes xterm skip both its key handling and the
       preventDefault that comes with it, so the browser's native copy/paste
       runs instead - xterm itself listens for those events and fills the
       clipboard from the selection / feeds pasted text to the device. */
    term.attachCustomKeyEventHandler((ev) => {
        if (ev.type !== 'keydown') return true
        // ctrlKey for Windows/Linux, metaKey for Mac
        if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return true
        if (ev.code === 'KeyV') {
            return false
        }
        if (ev.code === 'KeyC' && !ev.shiftKey && term.hasSelection()) {
            /* Dropping the selection afterwards keeps Ctrl+C usable as an
               interrupt: pressing it again goes straight to the device */
            setTimeout(() => { term.clearSelection() }, 0)
            return false
        }
        return true
    })
    term.onData(async (data) => {
        /* Typing into a port that is being brought back would only produce
           write-error toasts */
        if (!port || deviceState === 'reconnecting') return;
        if (isInRunMode) {
            // Allow injecting input in run mode
            await port.write(data)
        } else {
            /* Submitting a line at the REPL can write files just as easily as
               running a script can, and there is no way to tell from here
               whether it did. Plain typing only fills the board's line buffer,
               so waiting for the newline keeps the cache useful. */
            if (/[\r\n]/.test(data)) {
                const wasStale = fsCache.isListingStale()
                fsCache.deviceMayHaveChanged()
                if (!wasStale) { _rerenderFileTree() }
            }
            const release = await port.mutex.acquire()
            try {
                await port.write(data)
            } finally {
                release()
            }
        }
    })

    // set zoom level in newly created terminal
    updateSetting('zoom', getSetting('zoom'))

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddon.fit()

    term.loadAddon(new WebLinksAddon())

    addEventListener('resize', (_event) => {
        fitAddon.fit()
    })

    new ResizeObserver(() => {
        fitAddon.fit()
    }).observe(QID('xterm'))

    window.addEventListener('keydown', (ev) => {
        // ctrlKey for Windows/Linux, metaKey for Mac
        if (ev.ctrlKey || ev.metaKey) {
            if (ev.shiftKey) {
                if (ev.code == 'KeyS') {
                    saveAndCompile()
                } else {
                    return
                }
            } else if (ev.code == 'KeyS') {
                saveCurrentFile()
            } else if (ev.code == 'KeyD') {
                reboot('soft')
            } else {
                return
            }
        } else if (ev.altKey && ev.shiftKey) {
            // Alt+Shift, not Ctrl/Cmd: avoids both CodeMirror's own Mod-Shift-*
            // keymap (eg. Mod-Shift-M opens the lint panel) and browser-reserved
            // Ctrl/Cmd+Shift+* shortcuts
            if (ev.code == 'KeyF') {
                pyPrettify()
            } else if (ev.code == 'KeyM') {
                pyMinify()
            } else if (ev.code == 'KeyD') {
                showDisassembly()
            } else {
                return
            }
        } else if (ev.code == 'F5') {
            runCurrentFile()
        } else {
            return
        }
        ev.preventDefault()
    })

    document.addEventListener("tabActivated", (event) => {
        fileTreeSelect(event.detail.fn)
        editor = getEditorFromElement(event.detail.editorElement)
        editorFn = event.detail.fn
        markFile(event.detail.fn, 'open', true)
    })
    document.addEventListener("tabClosed", (event) => {
        markFile(event.detail.fn, 'open', false)
        markFile(event.detail.fn, 'changed', false)
        markFile(event.detail.fn, 'conflict', false)
        /* Closing already asked about discarding unsaved changes, so the backup
           has to go with them */
        fsCache.closeView(event.detail.fn)
    })
    /* Closing the last tab would leave the editor area blank and `editor`
       pointing at a view that is no longer in the document */
    document.addEventListener("allTabsClosed", (_event) => {
        openWelcomeTab()
    })

    setTimeout(() => {
        document.body.classList.add('loaded')
    }, 100)

    let urlID
    if ((urlID = urlParams.get('wss'))) {
        try {
            const connID = ConnectionUID.parse(urlID).value()
            window.webrepl_url = 'wss://hub.viper-ide.org/relay/' + connID
        } catch (err) {
            report('Cannot connect', err)
        }
    } else if ((urlID = urlParams.get('rtc'))) {
        try {
            const connID = ConnectionUID.parse(urlID).value()
            window.webrepl_url = 'rtc://' + connID
        } catch (err) {
            report('Cannot connect', err)
        }
    } else if ((urlID = urlParams.get('vm'))) {
        window.webrepl_url = 'vm://' + urlID
    }

    if ((urlID = urlParams.get('install'))) {
        try {
            await startQuickInstall(urlID)
        } catch (err) {
            report('Quick install failed', err)
        }
    }

    /* location.search has been acted on, so anything the launch queue hands
       over from here on is a link followed into this already-running window */
    startupSettled = true

    if (typeof webrepl_url !== 'undefined') {
        await sleep(100)
        await connectDevice('ws')
    }

    // MCP control client: enabled when served by the MCP server (?mcp=1)
    if (urlParams.has('mcp')) {
        initControlClient({
            connectDevice, disconnectDevice, createNewFile,
            removeFile, removeDir, fileClick, saveCurrentFile, runCurrentFile,
            reboot, clearTerminal, installPkg, MpRawMode, refreshFileTree,
            getPort: () => port,
            getEditor: () => editor,
            getEditorFn: () => editorFn,
            getTerm: () => term,
            getDevInfo: () => devInfo,
            isRunning: () => isInRunMode,
        })
    }

})();

/*
 * App Updater
 */

let lastUpdateCheck = 0;

async function checkForUpdates() {
    const now = new Date()
    if (now - lastUpdateCheck < 60*60*1000) {
        return
    }
    lastUpdateCheck = now

    const current_version = VIPER_IDE_VERSION
    QID('viper-ide-version').innerHTML = current_version
    QID('viper-ide-build').innerText = 'build ' + getBuildDate()

    let manifest;
    try {
        manifest = await fetchJSON(`${VIPER_IDE_BASE_URL}/manifest.json`)
    } catch {
        return
    }
    if (current_version.localeCompare(manifest.version, undefined, {numeric: true, sensitivity: "base"}) < 0) {
        toastr.info("New version available.<br/>Refresh the page to update.", `ViperIDE ${manifest.version}`)
        QID('viper-ide-version').innerHTML = `${current_version} (<a href="javascript:app.updateApp()">update</a>)`

        // Automatically show about page
        QS('a[data-target="menu-about"]').click()

        if (window.innerWidth <= 768) {
            fileTree.classList.add('show')
            overlay.classList.add('show')
        } else {
            fileTree.classList.remove('hidden')
        }
    }
}

export function updateApp() {
    window.location.reload()
}

window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
        //console.log('APP resumed')
        checkForUpdates()
    }
})

checkForUpdates()

/*
 * Splitter
 */

let startY, startHeight

export function initDrag(e) {
    if (typeof e.clientY !== 'undefined') {
        startY = e.clientY
    } else if (typeof e.touches !== 'undefined') {
        startY = e.touches[0].clientY
    } else {
        return
    }
    startHeight = parseInt(document.defaultView.getComputedStyle(QID('terminal-container')).height, 10)
    document.documentElement.addEventListener('mousemove', doDrag, false)
    document.documentElement.addEventListener('touchmove', doDrag, false)
    document.documentElement.addEventListener('mouseup', stopDrag, false)
    document.documentElement.addEventListener('touchend', stopDrag, false)
}

function doDrag(e) {
    let clientY
    if (typeof e.clientY !== 'undefined') {
        clientY = e.clientY
    } else if (typeof e.touches !== 'undefined') {
        clientY = e.touches[0].clientY
    } else {
        return
    }
    const terminalContainer = QID('terminal-container')
    const height = (startHeight - (clientY - startY))
    terminalContainer.style.height = Math.max(height, 50) + 'px'
}

function stopDrag() {
    document.documentElement.removeEventListener('mousemove', doDrag, false)
    document.documentElement.removeEventListener('touchmove', doDrag, false)
    document.documentElement.removeEventListener('mouseup', stopDrag, false)
    document.documentElement.removeEventListener('touchend', stopDrag, false)
}
