/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

const VIPER_IDE_VERSION = "0.3.5"

function getBuildDate() {
    if (window.VIPER_IDE_BUILD) {
        return (new Date(window.VIPER_IDE_BUILD)).toISOString().substr(0, 19).replace('T',' ')
    } else {
        return "unknown"
    }
}

/*
 * Device Management
 */

let editor, term, port
let editorFn = ""
let isInRunMode = false

async function disconnectDevice() {
    if (port) {
        try {
            await port.disconnect()
        } catch (err) {
            console.log(err)
        }
        port = null
    }

    for (const t of ["ws", "ble", "usb"]) {
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
        if (typeof webrepl_url === 'undefined' || webrepl_url == '') {
            url = prompt('Enter WebREPL device address.\nSupported protocols: ws wss rtc', defaultWsURL)
            if (!url) { return }
            defaultWsURL = url

            if (url.startsWith("http://")) { url = url.slice(7) }
            if (url.startsWith("https://")) { url = url.slice(8) }
            if (!url.includes("://")) { url = "ws://" + url }

            if (window.location.protocol === "https:" && url.startsWith("ws://")) {
                /* Navigate to device, which should automatically reload and ask for WebREPL password */
                window.location.assign(url.replace("ws://", "http://"))
                return
            }
        } else {
            url = webrepl_url
            defaultWsURL = webrepl_url
            webrepl_url = ''
        }

        if (url.startsWith('ws://') || url.startsWith('wss://')) {
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
        } else {
            toastr.error('Unknown link type')
        }
    } else if (type === 'ble') {
        if (iOS) {
            toastr.error('WebBluetooth is not available on iOS')
            return
        }
        if (window.location.protocol === "http:") {
            toastr.error('WebBluetooth cannot be accessed with unsecure connection')
            return
        }
        if (typeof navigator.bluetooth === 'undefined') {
            toastr.error('Chrome browser is needed (or Edge, Opera, Chromium, etc.)')
            return
        }
        new_port = new WebBluetooth()
    } else if (type === 'usb') {
        if (iOS) {
            toastr.error('WebSerial is not available on iOS')
            return
        }
        if (window.location.protocol === "http:") {
            toastr.error('WebSerial cannot be accessed with unsecure connection')
            return
        }
        if (typeof navigator.serial === 'undefined' && typeof navigator.usb === 'undefined') {
            toastr.error('Chrome browser is needed (or Edge, Opera, Chromium, etc.)')
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
    } catch {
        return
    }
    return new_port
}

async function connectDevice(type) {
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
            const devinfo = await raw.getDeviceInfo()
            Object.assign(devinfo, { connection: type })

            toastr.success(sanitizeHTML(devinfo.machine + '\n' + devinfo.version), 'Device connected')
            analytics.track('Device Connected', devinfo)
            console.log('Device info', devinfo)

            const files = await _raw_updateFileList(raw)
            if        (files.filter(x => x.name === 'main.py').length) {
                await _raw_loadFile(raw, 'main.py')
            } else if (files.filter(x => x.name === 'code.py').length) {
                await _raw_loadFile(raw, 'code.py')
            }
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

async function createNewFile(path) {
    if (!port) return;
    const fn = prompt(`Creating new file inside ${path}\nPlease enter the name:`)
    if (fn == null || fn == "") return
    const raw = await MpRawMode.begin(port)
    try {
        if (fn.endsWith("/")) {
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
        await _raw_updateFileList(raw)
    } finally {
        await raw.end()
    }
}

async function removeFile(path) {
    if (!port) return;
    if (!confirm(`Remove ${path}?`)) return
    const raw = await MpRawMode.begin(port)
    try {
        await raw.removeFile(path)
        await _raw_updateFileList(raw)
    } finally {
        await raw.end()
    }
}

async function removeDir(path) {
    if (!port) return;
    if (!confirm(`Remove ${path}?`)) return
    const raw = await MpRawMode.begin(port)
    try {
        await raw.removeDir(path)
        await _raw_updateFileList(raw)
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

async function fetchFileList() {
    if (!port) return;
    const raw = await MpRawMode.begin(port)
    try {
        await _raw_updateFileList(raw)
    } finally {
        await raw.end()
    }
}

async function _raw_updateFileList(raw) {
    let [fs_used, fs_free, fs_size] = [null, null, null];
    try {
        [fs_used, fs_free, fs_size] = await raw.getFsStats()
    } catch (err) {
        console.log(err)
    }

    const result = await raw.walkFs()

    function sorted(content) {
        // Natural sort by name
        if (QID('use-natural-sort').checked) {
            const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
            content.sort((a,b) => collator.compare(a.name, b.name))
        }

        // Stable-sort folders first
        content.sort((a,b) => (("content" in a)?0:1) - (("content" in b)?0:1))

        return content
    }

    // Traverse file tree
    const fileTree = QID('menu-file-tree')
    fileTree.innerHTML = `<div>
        <span class="folder name"><i class="fa-solid fa-folder fa-fw"></i> /</span>
        <a href="#" class="menu-action" onclick="createNewFile('/');return false;"><i class="fa-solid fa-plus"></i></a>
        <span class="menu-action">${T('files.used')} ${sizeFmt(fs_used,0)} / ${sizeFmt(fs_size,0)}</span>
    </div>`
    function traverse(node, depth) {
        const offset = "&emsp;".repeat(depth)
        for (const n of sorted(node)) {
            if ("content" in n) {
                fileTree.insertAdjacentHTML('beforeend', `<div>
                    <span class="folder name">${offset}<i class="fa-solid fa-folder fa-fw"></i> ${n.name}</span>
                    <a href="#" class="menu-action" onclick="removeDir('${n.path}');return false;"><i class="fa-solid fa-xmark"></i></a>
                    <a href="#" class="menu-action" onclick="createNewFile('${n.path}/');return false;"><i class="fa-solid fa-plus"></i></a>
                </div>`)
                traverse(n.content, depth+1)
            } else {
                /* TODO ••• */
                let icon;
                if (n.name.endsWith('.mpy')) {
                    icon = '<i class="fa-solid fa-cube fa-fw"></i>'
                } else {
                    icon = '<i class="fa-regular fa-file fa-fw"></i>'
                }
                fileTree.insertAdjacentHTML('beforeend', `<div>
                    <a href="#" class="name" onclick="fileClick('${n.path}');return false;">${offset}${icon} ${n.name}</a>
                    <a href="#" class="menu-action" onclick="removeFile('${n.path}');return false;"><i class="fa-solid fa-xmark"></i></a>
                    <span class="menu-action">${sizeFmt(n.size)}</span>
                </div>`)
            }
        }
    }
    traverse(result, 1)

    fileTree.insertAdjacentHTML('beforeend', `<div>
        <a href="#" class="name" onclick="fileClick('~sysinfo.md');return false;"><i class="fa-regular fa-message fa-fw"></i> sysinfo.md</a>
        <span class="menu-action">virtual</span>
    </div>`)

    return result
}

async function fileClick(fn) {
    if (!port) return;

    const e = window.event.target || window.event.srcElement;

    for (const el of document.getElementsByClassName("name")){
        el.classList.remove('selected')
    }

    const raw = await MpRawMode.begin(port)
    try {
        await _raw_loadFile(raw, fn)
    } finally {
        await raw.end()
    }

    e.classList.add('selected')
}

async function _raw_loadFile(raw, fn) {
    let content
    let isBinary = false
    if (fn == "~sysinfo.md") {
        content = await raw.readSysInfoMD()
    } else {
        content = await raw.readFile(fn)
        try {
            content = (new TextDecoder('utf-8', { fatal: true })).decode(content)
        } catch (err) {
            isBinary = true
        }
    }

    const editorElement = QID('editor')

    if (isBinary) {
        hexViewer(content.buffer, editorElement)
        editor = null
    } else if (fn.endsWith('.md') && QID('render-markdown').checked) {
        editorElement.innerHTML = `<div class="marked-viewer">` + marked.marked(content) + `</div>`
        editor = null
    } else {
        if (!editor) {
            editorElement.innerHTML = '' // Clear existing content
            createCodeMirror()
        }
        editor.setValue('')

        if (fn.endsWith('.py')) {
            editor.setOption('mode', { name: 'python', version: 3, singleLineStringErrors: false })
        } else if (fn.endsWith('.json')) {
            editor.setOption('mode', { name: 'application/ld+json' })

            if (QID('expand-minify-json').checked) {
                try {
                    // Prettify JSON
                    content = JSON.stringify(JSON.parse(content), null, 2)
                } catch (err) {
                    toastr.warning('JSON is malformed')
                }
            }
        } else if (fn.endsWith('.pem')) {
            editor.setOption('mode', 'pem')
        } else if (fn.endsWith('.ini') || fn.endsWith('.inf') ) {
            editor.setOption('mode', 'ini')
        } else if (fn.endsWith('.toml')) {
            editor.setOption('mode', 'toml')
        } else if (fn.endsWith('.md')) {
            editor.setOption('mode', 'markdown')
        } else {
            editor.setOption('mode', 'text')
        }

        editor.setValue(content)
        editorFn = fn
    }
    autoHideSideMenu()
    editorElement.scrollTop = 0
}

async function saveCurrentFile() {
    if (!port) return;

    let content = editor.getValue()
    if (editorFn.endsWith(".json") && QID('expand-minify-json').checked) {
        try {
            // Minify JSON
            content = JSON.stringify(JSON.parse(content))
        } catch (error) {
            toastr.error('JSON is malformed')
            return
        }
    }
    const raw = await MpRawMode.begin(port)
    try {
        await raw.writeFile(editorFn, content)
    } finally {
        await raw.end()
    }
    // Success
    analytics.track('File Saved')
    toastr.success('File Saved')
}

async function reboot(mode = "hard") {
    if (!port) return;

    const release = await port.startTransaction()
    try {
        if (mode === "soft") {
            await port.write('\r\x03\x03\x04')
        } else if (mode === "hard") {
            await execReplNoFollow("import machine; machine.reset()")
        } else if (mode === "bootloader") {
            await execReplNoFollow("import machine; machine.bootloader()")
        }
    } finally {
        release()
    }
}

async function runCurrentFile() {
    if (!port) return;

    if (isInRunMode) {
        await port.write('\r\x03\x03')   // Ctrl-C twice: interrupt any running program
        return
    }

    if (!editorFn.endsWith(".py")) {
        toastr.error(`${editorFn} file is not executable`)
        return
    }

    term.write('\r\n')

    const btnRunIconClass = QID("btn-run-icon").classList

    const soft_reboot = false
    const timeout = -1
    const raw = await MpRawMode.begin(port, soft_reboot)
    try {
        btnRunIconClass.remove('fa-circle-play')
        btnRunIconClass.add('fa-circle-stop')
        isInRunMode = true
        const emit = true
        await raw.exec(editor.getValue(), timeout, emit)
    } catch (err) {
        if (err.message.includes("KeyboardInterrupt")) {
            // Interrupted manually
        } else {
            toastr.error(sanitizeHTML(err.message), "Script Failed")
            return
        }
    } finally {
        port.emit = false
        await raw.end()
        btnRunIconClass.remove('fa-circle-stop')
        btnRunIconClass.add('fa-circle-play')
        isInRunMode = false
        term.write('\r\n>>> ')
    }
    // Success
    analytics.track('Script Run')
}

/*
 * Package Management
 */

let loadedPackages = false

const MIP_INDEXES = [
    'https://micropython.org/pi/v2'
]

async function loadAllPkgIndexes() {
    if (!loadedPackages) {
        for (const index of MIP_INDEXES) {
            try {
                await fetchPkgList(index)
            } catch {}
        }
        loadedPackages = true
    }
}

function rewriteUrl(url, branch='HEAD') {
    if (url.startsWith("github:")) {
        url = url.slice(7).split("/")
        url = "https://raw.githubusercontent.com/" + url[0] + "/" + url[1] + "/" + branch + "/" + url.slice(2).join("/")
    } else if (url.startsWith("gitlab:")) {
        url = url.slice(7).split("/")
        url = "https://gitlab.com/" + url[0] + "/" + url[1] + "/-/raw/" + branch + "/" + url.slice(2).join("/")
    }
    return url
}

async function fetchPkgList(index_url) {
    const index_rsp = await fetch(rewriteUrl(`${index_url}/index.json`))
    const mipindex = await index_rsp.json()

    const pkgList = QID('menu-pkg-list')
    pkgList.innerHTML = ""

    pkgList.insertAdjacentHTML('beforeend', `<div class="title-lines">viper-ide</div>`)
    pkgList.insertAdjacentHTML('beforeend', `<div>
        <span><i class="fa-solid fa-cube fa-fw"></i> viper-tools</span>
        <a href="#" class="menu-action" onclick="installReplTools();return false;">${viper_tools_pkg.version} <i class="fa-regular fa-circle-down"></i></a>
    </div>`)
    pkgList.insertAdjacentHTML('beforeend', `<div class="title-lines">micropython-lib</div>`)
    for (const pkg of mipindex.packages) {
        pkgList.insertAdjacentHTML('beforeend', `<div>
            <span><i class="fa-solid fa-cube fa-fw"></i> ${pkg.name}</span>
            <a href="#" class="menu-action" onclick="installPkg('${index_url}','${pkg.name}');return false;">${pkg.version} <i class="fa-regular fa-circle-down"></i></a>
        </div>`)
    }
}

async function _raw_installPkg(raw, index_url, pkg, version='latest', pkg_info=null) {
    analytics.track('Package Install', { name: pkg })
    toastr.info(`Installing ${pkg}...`)
    try {
        const devinfo = await raw.getDeviceInfo()
        const mpy_ver = devinfo.mpy_ver
        // Find the first `lib` folder in sys.path
        const lib_path = devinfo.sys_path.find(x => x.endsWith('/lib'))
        if (!lib_path) {
            toastr.error(`"lib" folder not found in sys.path`)
            return
        }

        if (!pkg_info) {
            const pkg_info_rsp = await fetch(rewriteUrl(`${index_url}/package/${mpy_ver}/${pkg}/${version}.json`))
            pkg_info = await pkg_info_rsp.json()
        }

        if ("hashes" in pkg_info) {
            for (const [fn, hash, ..._] of pkg_info.hashes) {
                const file_rsp = await fetch(rewriteUrl(`${index_url}/file/${hash.slice(0,2)}/${hash}`))
                const content = await file_rsp.arrayBuffer()
                const target_file = `${lib_path}/${fn}`

                // Ensure path exists
                const [dirname, _] = splitPath(target_file)
                await raw.makePath(dirname)

                await raw.writeFile(target_file, content, 128, true)
            }
        }

        if ("urls" in pkg_info) {
            for (const [fn, url, ..._] of pkg_info.urls) {
                const file_rsp = await fetch(rewriteUrl(url))
                const content = await file_rsp.arrayBuffer()
                const target_file = `${lib_path}/${fn}`

                // Ensure path exists
                const [dirname, _] = splitPath(target_file)
                await raw.makePath(dirname)

                await raw.writeFile(target_file, content, 128, true)
            }
        }

        if ("deps" in pkg_info) {
            for (const [dep_pkg, dep_ver, ..._] of pkg_info.deps) {
                await _raw_installPkg(raw, index_url, dep_pkg, dep_ver)
            }
        }
        toastr.success(`Installed ${pkg}@${pkg_info.version} to ${lib_path}`)
    } catch (err) {
        report('Installing failed', err)
    }
}

async function installPkg(index_url, pkg, version='latest', pkg_info=null) {
    if (!port) return;
    const raw = await MpRawMode.begin(port)
    try {
        await _raw_installPkg(raw, index_url, pkg, version, pkg_info)
    } finally {
        await raw.end()
    }
}

const viper_tools_pkg = {
    v: 1,
    version: "0.1.1",
    urls: [
        ["web_repl.py",   "github:vshymanskyy/ViperIDE/packages/viper-tools/web_repl.py"],
        ["ble_repl.py",   "github:vshymanskyy/ViperIDE/packages/viper-tools/ble_repl.py"],
        ["ble_nus.py",    "github:vshymanskyy/ViperIDE/packages/viper-tools/ble_nus.py"],
        ["ws_client.py",  "github:vshymanskyy/ViperIDE/packages/viper-tools/ws_client.py"],
        ["wss_repl.py",   "github:vshymanskyy/ViperIDE/packages/viper-tools/wss_repl.py"],
    ]
}

async function installReplTools() {
    await installPkg(null, "viper-tools", "latest", viper_tools_pkg)
}

/*
 * UI helpers
 */

const fileTree = QID('side-menu')
const overlay = QID('overlay')

function toggleSideMenu() {
    if (window.innerWidth <= 768) {
        fileTree.classList.remove('hidden')
        fileTree.classList.toggle('show')
        overlay.classList.toggle('show')
    } else {
        overlay.classList.toggle('show')
        fileTree.classList.remove('show')
        fileTree.classList.toggle('hidden')
    }
}

function autoHideSideMenu() {
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

CodeMirror.defineSimpleMode('pem', {
    start: [
        {regex: /-----BEGIN CERTIFICATE-----/, token: 'keyword', next: 'middle'},
        {regex: /[^-]+/, token: 'comment'}
    ],
    middle: [
        {regex: /[A-Za-z0-9+/=]+/, token: 'variable'},
        {regex: /-----END CERTIFICATE-----/, token: 'keyword', next: 'start'},
        {regex: /[^-]+/, token: 'comment'}
    ],
    end: [
        {regex: /.+/, token: 'comment'}
    ],
    // The meta property contains global information about the mode
    meta: {
        lineComment: '#'
    }
})

CodeMirror.defineSimpleMode('ini', {
    start: [
        {regex: /\/\/.*/,       token: 'comment'},
        {regex: /\#.*/,         token: 'comment'},
        {regex: /\;.*/,         token: 'comment'},
        {regex: /\[[^\]]+\]/,   token: 'keyword'},
        {regex: /[^\s\=\,]+/,   token: 'variable', next: 'property'}
    ],
    property: [
        {regex: /\=/,   token: 'def', next: 'value'},
        {regex: /.*/,   token: null,  next: 'start'}
    ],
    value: [
        {regex: /true|false/i,          token: 'atom',   next: 'start'},
        {regex: /[-+]?0x[a-fA-F0-9]+$/, token: 'number', next: 'start'},
        {regex: /[-+]?\d+$/,            token: 'number', next: 'start'},
        {regex: /.*/,                   token: 'string', next: 'start'}
    ]
});

function updateWordWrapping() {
    editor.setOption('lineWrapping', QID('use-word-wrap').checked)
}

function createCodeMirror() {
    editor = CodeMirror(QID('editor'), {
        theme: 'monokai',
        lineNumbers: true,
        lineWrapping: QID('use-word-wrap').checked,
        indentUnit: 4,
        matchBrackets: true,
    })
}

function applyTranslation() {
    try {
        // sanity check
        if (!i18next.exists('example.hello')) {
            throw new Error('No translation')
        }

        document.body.dir = i18next.dir()

        QID('btn-save').setAttribute('title',     T('tool.save') + " [Ctrl+S]")
        QID('btn-run').setAttribute('title',      T('tool.run') + " [F5]")
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
        } catch (err) {}

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
    } catch (err) {}

    QSA("a[id=gh-star]").forEach(el => {
        el.setAttribute("href", "https://github.com/vshymanskyy/ViperIDE")
        el.setAttribute("target", "_blank")
        el.classList.add("link")
    })

    QSA("a[id=gh-issues]").forEach(el => {
        el.setAttribute("href", "https://github.com/vshymanskyy/ViperIDE/issues")
        el.setAttribute("target", "_blank")
        el.classList.add("link")
    })
}

(async () => {
    let lang_res
    try {
        lang_res = require("translations.json")
    } catch (err) {
        lang_res = {}
    }
    await i18next.use(i18nextBrowserLanguageDetector).init({
        fallbackLng: 'en',
        //debug: true,
        resources: lang_res,
    })

    const currentLang = i18next.resolvedLanguage || "en";

    const lang_sel = QID('lang')
    lang_sel.value = currentLang
    lang_sel.addEventListener('change', async function() {
        await i18next.changeLanguage(this.value)
        applyTranslation()
    })

    const zoom_sel = QID('zoom')
    zoom_sel.value = "1.00"
    zoom_sel.addEventListener('change', async function() {
        const size = (14 * parseFloat(this.value)).toFixed(1)
        document.documentElement.style.setProperty('--font-size', size + 'px')
        term.options.fontSize = size
    })

    applyTranslation()


    setupTabs(QID('side-menu'))
    setupTabs(QID('terminal-container'))

    toastr.options.preventDuplicates = true;

    createCodeMirror()
    editorFn = "test.py"
    editor.setValue(`
# ViperIDE - MicroPython Web IDE

import time

colors = [
    "\\033[31m", "\\033[32m", "\\033[33m", "\\033[34m",
    "\\033[35m", "\\033[36m", "\\033[37m",
]
reset = "\\033[0m"

text = "  ${T('example.hello', 'Привіт')} MicroPython! 𓆙"

# ${T('example.comment-colors', 'Print each letter with a different color')}
print("=" * 32)
for i, char in enumerate(text):
    color = colors[i % len(colors)]
    print(color + char, end="")
print(reset)
print("=" * 32)

# ${T('example.comment-count', 'Count 1 to 10')}
for i in range(10):
    time.sleep(1)
    print(i + 1, "", end="")
print()
`)

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
        fontFamily: '"Droid Sans Mono", "monospace", monospace',
        fontSize: 14,
        theme: xtermTheme,
        cursorBlink: true,
        //convertEol: true,
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

    const fitAddon = new FitAddon.FitAddon()
    term.loadAddon(fitAddon)
    fitAddon.fit()

    term.loadAddon(new WebLinksAddon.WebLinksAddon())

    addEventListener('resize', (event) => {
        fitAddon.fit()
        if (editor) editor.refresh()
    })

    new ResizeObserver(() => {
        fitAddon.fit()
        if (editor) editor.refresh()
    }).observe(QID('xterm'))

    window.addEventListener('keydown', (ev) => {
        if (ev.code == "F5" && !ev.ctrlKey) {
            runCurrentFile()
        } else if (ev.code == "KeyS" && ev.ctrlKey) {
            saveCurrentFile()
        } else {
            return
        }
        ev.preventDefault()
    })

    try {
        if (typeof window.analytics.track === 'undefined') {
            throw new Error()
        }

        const ua = new UAParser()
        const geo = await (await fetch('https://freeipapi.com/api/json', {cache: "no-store"})).json()
        const scr = getScreenInfo()

        let tz
        try {
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        } catch (e) {
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

    } catch (err) {
        window.analytics = {
            track: function() {}
        }
    }

    setTimeout(() => {
        document.body.classList.add('loaded')
    }, 100)

    const urlParams = new URLSearchParams(window.location.search)
    const wssID = urlParams.get('wss')
    if (wssID) {
        try {
            const connID = ConnectionUID.parse(wssID).value()
            window.webrepl_url = 'wss://hub.viper-ide.org/relay/' + connID
        } catch (err) {
            report('Cannot connect', err)
        }
    }
    const rtcID = urlParams.get('rtc')
    if (rtcID) {
        try {
            const connID = ConnectionUID.parse(rtcID).value()
            window.webrepl_url = 'rtc://' + connID
        } catch (err) {
            report('Cannot connect', err)
        }
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

    QID('viper-ide-version').innerHTML = VIPER_IDE_VERSION
    QID('viper-ide-build').innerText = "build " + getBuildDate()

    const manifest_rsp = await fetch('https://viper-ide.org/manifest.json', {cache: "no-store"})
    manifest = await manifest_rsp.json()
    if (manifest.version !== VIPER_IDE_VERSION) {
        toastr.info(`New ViperIDE version ${manifest.version} is available`)
        QID('viper-ide-version').innerHTML = `${VIPER_IDE_VERSION} (<a href="javascript:updateApp()">update</a>)`

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

function updateApp() {
    window.location.reload()
}

window.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
        console.log("APP resumed")
        checkForUpdates()
    }
})

checkForUpdates()

/*
 * Splitter
 */

let startY, startHeight

function initDrag(e) {
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
