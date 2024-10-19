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

import { addUpdateHandler, createNewEditor, getEditorFromElement } from './editor.js'
import { displayOpenFile, createTab } from './editor_tabs.js'
import { serial as webSerialPolyfill } from 'web-serial-polyfill'
import { WebSerial, WebBluetooth, WebSocketREPL, WebRTCTransport } from './transports.js'
import { MpRawMode } from './rawmode.js'
import { getPkgIndexes, rawInstallPkg } from './package_mgr.js'
import { ConnectionUID } from './connection_uid.js'
import translations from '../build/translations.json'
import { parseStackTrace, validatePython, disassembleMPY, minifyPython, prettifyPython } from './python_utils.js'
import { MicroPythonWASM } from './emulator.js'

import { marked } from 'marked'
import { UAParser } from 'ua-parser-js'

import { splitPath, sleep, fetchJSON, getUserUID, getScreenInfo, IdleMonitor,
         getCssPropertyValue, QSA, QS, QID, iOS, sanitizeHTML, isRunningStandalone,
         sizeFmt, indicateActivity, setupTabs, report } from './utils.js'

import { library, dom } from '@fortawesome/fontawesome-svg-core'
import { faUsb, faBluetoothB } from '@fortawesome/free-brands-svg-icons'
import { faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFile, faFileCircleExclamation, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faXmark
       } from '@fortawesome/free-solid-svg-icons'
import { faMessage, faCircleDown } from '@fortawesome/free-regular-svg-icons'

library.add(faUsb, faBluetoothB)
library.add(faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFile, faFileCircleExclamation, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faXmark)
library.add(faMessage, faCircleDown)
dom.watch()

function getBuildDate() {
    return (new Date(VIPER_IDE_BUILD)).toISOString().substring(0, 19).replace('T',' ')
}

const T = i18next.t.bind(i18next)

/*
 * Device Management
 */

let editor, term, port
let editorFn = ''
let isInRunMode = false
let devInfo = null

async function disconnectDevice() {
    if (port) {
        try {
            await port.disconnect()
        } catch (err) {
            console.log(err)
        }
        port = null
    }

    for (const t of ['ws', 'ble', 'usb']) {
        QID(`btn-conn-${t}`).classList.remove('connected')
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
            new_port = new MicroPythonWASM()
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
        if (typeof navigator.serial === 'undefined' || QID('force-serial-poly').checked) {
            console.log('Using WebSerial polyfill')
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

export async function connectDevice(type) {
    if (port) {
        if (!confirm('Disconnect current device?')) { return }
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

    port.onActivity(indicateActivity)

    port.onReceive((data) => {
        term.write(data)
    })

    port.onDisconnect(() => {
        QID(`btn-conn-${type}`).classList.remove('connected')
        toastr.warning('Device disconnected')
        port = null
        //connectDevice(type)
    })

    QID(`btn-conn-${type}`).classList.add('connected')

    analytics.track('Device Port Connected', Object.assign({ connection: type }, await port.getInfo()))

    if (QID('interrupt-device').checked) {
        // TODO: detect WDT and disable it temporarily

        const raw = await MpRawMode.begin(port)
        try {
            devInfo = await raw.getDeviceInfo()
            Object.assign(devInfo, { connection: type })

            toastr.success(sanitizeHTML(devInfo.machine + '\n' + devInfo.version), 'Device connected')
            analytics.track('Device Connected', devInfo)
            console.log('Device info', devInfo)

            if (window.pkg_install_url) {
                await _raw_installPkg(raw, window.pkg_install_url)
                window.pkg_install_url = null
            }

            let fs_stats = [null, null, null];
            try {
                fs_stats = await raw.getFsStats()
            } catch (err) {
                console.log(err)
            }

            const fs_tree = await raw.walkFs()

            _updateFileTree(fs_tree, fs_stats);

            if        (fs_tree.filter(x => x.path === '/main.py').length) {
                await _raw_loadFile(raw, '/main.py')
            } else if (fs_tree.filter(x => x.path === '/code.py').length) {
                await _raw_loadFile(raw, '/code.py')
            }
            document.dispatchEvent(new CustomEvent("deviceConnected", {detail: {port: port}}))

        } catch (err) {
            if (err.message.includes('Timeout')) {
                report('Device is not responding', new Error(`Ensure that:\n- You're using a recent version of MicroPython\n- The correct device is selected`))
            } else {
                report('Error reading board info', err)
            }
        } finally {
            await raw.end()
        }
        // Print banner. TODO: optimize
        await port.write('\x02')
    } else {
        toastr.success('Device connected')
        analytics.track('Device Connected')
    }
}

/*
 * File Management
 */

export async function refreshFileTree() {
    if (!port) return;
    const raw = await MpRawMode.begin(port)
    try {
        await _raw_updateFileTree(raw)
    } finally {
        await raw.end()
    }
}

export async function createNewFile(path) {
    if (!port) return;
    const fn = prompt(`Creating new file inside ${path}\nPlease enter the name:`)
    if (fn == null || fn == '') return
    const raw = await MpRawMode.begin(port)
    try {
        if (fn.endsWith('/')) {
            const full = path + fn.slice(0, -1)
            await raw.makePath(full)
        } else {
            const full = path + fn
            if (fn.includes('/')) {
                // Ensure path exists
                const [dirname, _] = splitPath(full)
                await raw.makePath(dirname)
            }
            await raw.touchFile(full)
            await _raw_loadFile(raw, full)
        }
        await _raw_updateFileTree(raw)
    } finally {
        await raw.end()
    }
}

export async function removeFile(path) {
    if (!port) return;
    if (!confirm(`Remove ${path}?`)) return
    const raw = await MpRawMode.begin(port)
    try {
        await raw.removeFile(path)
        await _raw_updateFileTree(raw)
        document.dispatchEvent(new CustomEvent("fileRemoved", {detail: {path: path}}))
    } finally {
        await raw.end()
    }
}

export async function removeDir(path) {
    if (!port) return;
    if (!confirm(`Remove ${path}?`)) return
    const raw = await MpRawMode.begin(port)
    try {
        await raw.removeDir(path)
        await _raw_updateFileTree(raw)
        document.dispatchEvent(new CustomEvent("dirRemoved", {detail: {path: path}}))
    } finally {
        await raw.end()
    }
}

async function execReplNoFollow(cmd) {
    await port.write('\r\x03\x03')
    //await port.flushInput()
    //await port.write('\x05')            // Ctrl-E: enter paste mode
    await port.write(cmd + '\r\n')
    //await port.write('\x04')            // Ctrl-D: execute
}

function _updateFileTree(fs_tree, fs_stats)
{
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

    const changed_files = []
    QSA("#menu-file-tree .changed").forEach((file) => {
        changed_files.push(file.dataset.fn)
    })
    const open_files = []
    QSA("#menu-file-tree .open").forEach((file) => {
        open_files.push(file.dataset.fn)
    })

    // Traverse file tree
    const fileTree = QID('menu-file-tree')
    fileTree.innerHTML = `<div>
        <span class="folder name"><i class="fa-solid fa-folder fa-fw"></i> /</span>
        <a href="#" class="menu-action" title="Refresh" onclick="app.refreshFileTree();return false;"><i class="fa-solid fa-arrows-rotate fa-fw"></i></a>
        <a href="#" class="menu-action" title="Create" onclick="app.createNewFile('/');return false;"><i class="fa-solid fa-plus fa-fw"></i></a>
        <span class="menu-action">${T('files.used')} ${sizeFmt(fs_used,0)} / ${sizeFmt(fs_size,0)}</span>
    </div>`
    function traverse(node, depth) {
        const offset = '&emsp;'.repeat(depth)
        for (const n of sorted(node)) {
            if ('content' in n) {
                fileTree.insertAdjacentHTML('beforeend', `<div>
                    ${offset}<span class="folder name"><i class="fa-solid fa-folder fa-fw"></i> ${n.name}</span>
                    <a href="#" class="menu-action" title="Remove" onclick="app.removeDir('${n.path}');return false;"><i class="fa-solid fa-xmark fa-fw"></i></a>
                    <a href="#" class="menu-action" title="Create" onclick="app.createNewFile('${n.path}/');return false;"><i class="fa-solid fa-plus fa-fw"></i></a>
                </div>`)
                traverse(n.content, depth+1)
            } else {
                /* TODO ••• */
                let icon;
                const fnuc = n.name.toUpperCase();
                if (fnuc.endsWith('.MPY')) {
                    icon = '<i class="fa-solid fa-cube fa-fw"></i>'
                } else if (['.CRT', '.PEM', '.DER', '.CER', '.PFX', '.P12'].some(x => fnuc.endsWith(x))) {
                    icon = '<i class="fa-solid fa-certificate fa-fw"></i>'
                } else if (fnuc === '???') {
                    icon = '<i class="fa-solid fa-file-circle-exclamation fa-fw"></i>'
                } else {
                    icon = '<i class="fa-solid fa-file fa-fw"></i>'
                }
                let sel = ([editorFn, `/${editorFn}`, `/flash/${editorFn}`].includes(n.path)) ? 'selected' : ''
                if (n.path.startsWith("/proc/") || n.path.startsWith("/dev/")) {
                    icon = '<i class="fa-solid fa-gear fa-fw"></i>'
                    fileTree.insertAdjacentHTML('beforeend', `<div>
                        ${offset}<span>${icon} ${n.name}&nbsp;</span>
                    </div>`)
                } else {
                    fileTree.insertAdjacentHTML('beforeend', `<div>
                        ${offset}<a href="#" class="name ${sel}" data-fn="${n.path}" onclick="app.fileClick('${n.path}');return false;">${icon} ${n.name}&nbsp;</a>
                        <a href="#" class="menu-action" title="Remove" onclick="app.removeFile('${n.path}');return false;"><i class="fa-solid fa-xmark fa-fw"></i></a>
                        <span class="menu-action">${sizeFmt(n.size)}</span>
                    </div>`)
                }
            }
        }
    }
    traverse(fs_tree, 1)

    for (let fn of changed_files) {
        QS(`#menu-file-tree [data-fn="${fn}"]`).classList.add("changed")
    }
    for (let fn of open_files) {
        QS(`#menu-file-tree [data-fn="${fn}"]`).classList.add("open")
    }

    if (QID('advanced-mode').checked) {
        fileTree.insertAdjacentHTML('beforeend', `<div>
            <a href="#" class="name" onclick="app.fileClick('~sysinfo.md');return false;"><i class="fa-regular fa-message fa-fw"></i> sysinfo.md&nbsp;</a>
            <span class="menu-action">virtual</span>
        </div>`)
    }

}

async function _raw_updateFileTree(raw) {
    let fs_stats = [null, null, null];
    try {
        fs_stats = await raw.getFsStats()
    } catch (err) {
        console.log(err)
    }

    const fs_tree = await raw.walkFs()

    _updateFileTree(fs_tree, fs_stats);
}

export function fileTreeSelect(fn) {
    for (const el of document.getElementsByClassName('name')) {
        el.classList.remove('selected')
    }
    const fileElement = QS(`#menu-file-tree [data-fn="${fn}"]`)
    if (!fileElement) {
        // might be a meta/unsaved file
        return
    }
    fileElement.classList.add('selected')
}

export async function fileClick(fn) {
    if (!port) return;

    const raw = await MpRawMode.begin(port)
    try {
        await _raw_loadFile(raw, fn)
    } finally {
        await raw.end()
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
}

async function _raw_loadFile(raw, fn) {
    let content
    if (fn == '~sysinfo.md') {
        content = await raw.readSysInfoMD()
    } else if (displayOpenFile(fn)) {
        console.debug(`File ${fn} already opened. Switched to tab`)
        autoHideSideMenu()
        return
    } else {
        content = await raw.readFile(fn)
        try {
            content = (new TextDecoder('utf-8', { fatal: true })).decode(content)
        } catch (err) {
            toastr.error(`Unable to load file: ${err}`)
        }
    }
    await _loadContent(fn, content, createTab(fn))
}

async function _loadContent(fn, content, editorElement) {
    const willDisasm = fn.endsWith('.mpy') && QID('advanced-mode').checked

    if (content instanceof Uint8Array && !willDisasm) {
        hexViewer(content.buffer, editorElement)
        editor = null
    } else if (fn.endsWith('.md') && QID('render-markdown').checked) {
        editorElement.innerHTML = `<div class="marked-viewer">` + marked(content) + `</div>`
        editor = null
    } else {
        let readOnly = false
        if (fn.endsWith('.json') && QID('expand-minify-json').checked) {
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
        }

        editorElement.innerHTML = '' // Clear existing content
        editor = await createNewEditor(editorElement, fn, content, {
            wordWrap: QID('use-word-wrap').checked,
            devInfo,
            readOnly,
        })
        document.dispatchEvent(new CustomEvent("editorLoaded", {detail: {editor: editor, fn: fn}}))
        addUpdateHandler(editor, (update) => {
            if (update.docChanged) {
                QS(`#menu-file-tree [data-fn="${fn}"]`).classList.add("changed")
            }
        })

        editorFn = fn
    }
    autoHideSideMenu()
}

export async function saveCurrentFile() {
    if (!port) return;
    if (!editor) return;

    if (editor.state.readOnly) {
        toastr.warning("File is read only")
        return
    }

    if (editorFn == "Untitled") {
        const fn = prompt(`Creating new file inside /\nPlease enter the name:`)
        if (fn == null || fn == '') return
        editorFn = fn
        document.dispatchEvent(new CustomEvent("fileRenamed", {detail: {old: "Untitled", new: fn}}))
    }

    let content = editor.state.doc.toString()
    if (editorFn.endsWith('.json') && QID('expand-minify-json').checked) {
        try {
            // Minify JSON
            content = JSON.stringify(JSON.parse(content))
        } catch (_error) {
            toastr.error('JSON is malformed')
            return
        }
    } else if (editorFn.endsWith('.py')) {
        const content = editor.state.doc.toString()
        const backtrace = await validatePython(editorFn, content)
        if (backtrace) {
            console.log(backtrace)
            toastr.warning(sanitizeHTML(backtrace.summary), backtrace.type)
        }
    }
    const raw = await MpRawMode.begin(port)
    try {
        await raw.writeFile(editorFn, content)
        await _raw_updateFileTree(raw)
    } finally {
        await raw.end()
    }
    // Success
    analytics.track('File Saved')
    toastr.success('File Saved')

    document.dispatchEvent(new CustomEvent("fileSaved", {detail: {fn: editorFn}}))
    QS(`#menu-file-tree [data-fn="${editorFn}"]`).classList.remove("changed")
}

export function clearTerminal() {
    term.clear()
}

export async function reboot(mode = 'hard') {
    if (!port) return;

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
}

export async function runCurrentFile() {
    if (!port) return;

    if (isInRunMode) {
        await port.write('\r\x03\x03')   // Ctrl-C twice: interrupt any running program
        return
    }

    if (!editorFn.endsWith('.py')) {
        toastr.error(`${editorFn} file is not executable`)
        return
    }

    term.write('\r\n')

    const soft_reboot = false
    const timeout = -1
    const raw = await MpRawMode.begin(port, soft_reboot)
    try {
        QID('btn-run-icon').classList.replace('fa-circle-play', 'fa-circle-stop')
        isInRunMode = true
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
        await raw.end()
        QID('btn-run-icon').classList.replace('fa-circle-stop', 'fa-circle-play')
        isInRunMode = false
        term.write('\r\n>>> ')
    }
    // Success
    analytics.track('Script Run')
}

/*
 * Package Management
 */

export async function loadAllPkgIndexes() {
    const pkgList = QID('menu-pkg-list')
    pkgList.innerHTML = ''
    for (const i of await getPkgIndexes()) {
        pkgList.insertAdjacentHTML('beforeend', `<div class="title-lines">${i.name}</div>`)
        for (const pkg of i.index.packages) {
            let offset = ''
            let icon = ''
            if (pkg.name.includes('-')) {
                const parent = pkg.name.split('-').slice(0, -1).join('-')
                const exists = i.index.packages.some(pkg => (pkg.name === parent))
                if (exists) {
                    offset = '&emsp;'
                }
            }
            const keywords = pkg.keywords ? pkg.keywords.split(',').map(x => x.trim()) : [];
            if (keywords.includes('__hidden__')) {
                continue
            }
            if (keywords.includes('native')) {
                icon = ' <i class="fa-solid fa-gauge-high" title="Efficient native module"></i>'
            }
            pkgList.insertAdjacentHTML('beforeend', `<div>
                ${offset}<span><i class="fa-solid fa-cube fa-fw"></i> ${pkg.name}${icon}</span>
                <a href="#" class="menu-action" onclick="app.installPkg('${pkg.name}');return false;">${pkg.version} <i class="fa-regular fa-circle-down"></i></a>
            </div>`)
        }
    }
}

async function _raw_installPkg(raw, pkg, { version=null } = {}) {
    analytics.track('Package Install', { name: pkg })
    toastr.info(`Installing ${pkg}...`)
    const dev_info = await raw.getDeviceInfo()
    const pkg_info = await rawInstallPkg(raw, pkg, {
        version,
        dev: dev_info,
        prefer_source: QID('install-package-source').checked,
    })
    if (pkg_info.version) {
        toastr.success(`Installed ${pkg_info.name}@${pkg_info.version}`)
    } else {
        toastr.success(`Installed ${pkg_info.name}`)
    }
}

export async function installPkg(pkg, { version=null } = {}) {
    if (!port) {
        toastr.info('Connect yout board first')
        return
    }
    const raw = await MpRawMode.begin(port)
    try {
        await _raw_installPkg(raw, pkg, { version })
        await _raw_updateFileTree(raw)
    } catch (err) {
        report('Installing failed', err)
    } finally {
        await raw.end()
    }
}

export async function installPkgFromUrl() {
    if (!port) {
        toastr.info('Connect yout board first')
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

        QS('label[for=interrupt-device]').innerText = T('settings.interrupt-device')
        QS('label[for=force-serial-poly]').innerText = T('settings.force-serial-poly')
        QS('label[for=expand-minify-json]').innerText = T('settings.expand-minify-json')
        QS('label[for=use-word-wrap]').innerText = T('settings.use-word-wrap')
        QS('label[for=render-markdown]').innerText = T('settings.render-markdown')
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

(async () => {

    if ('serviceWorker' in navigator) {
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

    const lang_sel = QID('lang')
    lang_sel.value = currentLang
    lang_sel.addEventListener('change', async function() {
        await i18next.changeLanguage(this.value)
        applyTranslation()
    })

    try {
        if (typeof window.analytics.track === 'undefined') {
            throw new Error()
        }

        const ua = new UAParser()
        const geo = await fetchJSON('https://freeipapi.com/api/json')
        const scr = getScreenInfo()

        let tz
        try {
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        } catch (_e) {
            tz = (new Date()).getTimezoneOffset()
        }

        //console.log(geo)
        //console.log(ua.getResult())
        //console.log(scr)

        const userUID = getUserUID()

        analytics.identify(userUID, {
            email: userUID.split('-').pop() + '@vip.er',
            version: VIPER_IDE_VERSION,
            build: getBuildDate(),
            browser: ua.getBrowser().name,
            browser_version: ua.getBrowser().version,
            os: ua.getOS().name,
            os_version: ua.getOS().version,
            cpu: ua.getCPU().architecture,
            pwa: isRunningStandalone(),
            screen: scr.width + 'x' + scr.height,
            orientation: scr.orientation,
            dpr: scr.dpr,
            dpi: QID('dpi-ruler').offsetHeight,
            lang: currentLang,
            location: geo.latitude + ',' + geo.longitude,
            continent: geo.continent,
            country: geo.countryName,
            region: geo.regionName,
            city: geo.cityName,
            tz: tz,
        })

        analytics.track('Visit', {
            url: window.location.href,
            referrer: document.referrer,
        })

        const idleMonitor = new IdleMonitor(3*60*1000);

        idleMonitor.setIdleCallback(() => {
            analytics.track('User Idle')
        })

        idleMonitor.setActiveCallback(() => {
            analytics.track('User Active')
        })

    } catch (_err) {
        window.analytics = {
            track: function() {}
        }
    }

    const zoom_sel = QID('zoom')
    zoom_sel.value = '1.00'
    zoom_sel.addEventListener('change', async function() {
        const size = 14 * parseFloat(this.value)
        document.documentElement.style.setProperty('--font-size', (size).toFixed(1) + 'px')
        term.options.fontSize = (size * 0.9).toFixed(1)
    })

    applyTranslation()


    setupTabs(QID('side-menu'))
    setupTabs(QID('terminal-container'))

    toastr.options.preventDuplicates = true;

    const fn = 'test.py'
    const content = `
# ViperIDE - MicroPython Web IDE
# Read more: https://github.com/vshymanskyy/ViperIDE

# Connect your device and start creating! 🤖👨‍💻🕹️

# You can also open a virtual device and explore some examples:
# https://viper-ide.org?vm=1
`
    await _loadContent(fn, content, createTab(fn))

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
    term.onData(async (data) => {
        if (!port) return;
        if (isInRunMode) {
            // Allow injecting input in run mode
            await port.write(data)
        } else {
            const release = await port.mutex.acquire()
            try {
                await port.write(data)
            } finally {
                release()
            }
        }
    })

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
            if (ev.code == 'KeyS') {
                saveCurrentFile()
            } else if (ev.code == 'KeyD') {
                reboot('soft')
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
        const fileElement = QS(`#menu-file-tree [data-fn="${event.detail.fn}"]`)
        if (fileElement) {
            fileElement.classList.add("open")
        }
    })
    document.addEventListener("tabClosed", (event) => {
        const fileElement = QS(`#menu-file-tree [data-fn="${event.detail.fn}"]`)
        if (fileElement) {
            fileElement.classList.remove("open")
            fileElement.classList.remove("changed")
        }
    })

    setTimeout(() => {
        document.body.classList.add('loaded')
    }, 100)

    const urlParams = new URLSearchParams(window.location.search)
    let urlID = null
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
        window.pkg_install_url = urlID
        toastr.info('Warning: your files may be overwritten!', `Connect your board to install ${urlID}`)
    }

    if (typeof webrepl_url !== 'undefined') {
        await sleep(100)
        await connectDevice('ws')
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
        manifest = await fetchJSON('https://viper-ide.org/manifest.json')
    } catch {
        return
    }
    if (current_version.localeCompare(manifest.version, undefined, {numeric: true, sensitivity: "base"}) < 0) {
        toastr.info(`New ViperIDE version ${manifest.version} is available`)
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
