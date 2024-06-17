
const VIPER_IDE_VERSION = "0.2.5"

/*
 * Helpers
 */

const addCSS = (css) => { document.head.appendChild(document.createElement("style")).innerHTML = css }

const QSA = (x) => [...document.querySelectorAll(x)]
const QS  = document.querySelector.bind(document)
const QID = document.getElementById.bind(document)

const T = i18next.t.bind(i18next)

const iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent)

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

function report(title, err) {
    console.error(err, err.stack)
    toastr.error(err, title)
    analytics.track('Error', {
        "name": err.name,
        "message": err.message,
        "stack": err.stack,
    })
}

/*
 * Transports
 */

class Transport {
    constructor() {
        if (this.constructor === Transport) {
            throw new Error("Cannot instantiate abstract class Transport")
        }
        this.mutex = new Mutex()
        this.inTransaction = false
        this.receivedData = ''
        this.receiveCallback = null
        this.disconnectCallback = null
        this.writeChunk = 128
        this.emit = false
    }

    async requestAccess() {
        throw new Error("Method 'requestAccess()' must be implemented.")
    }

    async connect() {
        throw new Error("Method 'connect()' must be implemented.")
    }

    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented.")
    }

    async write(data) {
        const encoder = new TextEncoder()
        const value = encoder.encode(data)
        try {
            let offset = 0
            while (offset < value.byteLength) {
                const chunk = value.slice(offset, offset + this.writeChunk)
                await this.writeBytes(chunk)
                await sleep(5)
                offset += this.writeChunk
            }
        } catch (err) {
            report("Write error", err)
        }
    }

    onReceive(callback) {
        this.receiveCallback = callback
    }

    onDisconnect(callback) {
        this.disconnectCallback = callback
    }

    /*
     * Transaction API
     */

    async startTransaction() {
        const release = await this.mutex.acquire()
        const prevRecvCbk = this.receiveCallback
        this.inTransaction = true
        this.receivedData = ''
        this.receiveCallback = (data) => {
            this.receivedData += data
            if (this.emit && prevRecvCbk) { prevRecvCbk(data) }
        }

        document.documentElement.style.setProperty('--connected-color', 'var(--connected-active)');

        return () => {
            this.receiveCallback = prevRecvCbk
            if (prevRecvCbk) { prevRecvCbk(this.receivedData) }
            this.receivedData = null
            this.inTransaction = false

            document.documentElement.style.setProperty('--connected-color', 'var(--connected-passive)');

            release()
        }
    }

    async flushInput() {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        this.receivedData = ''
        /*while (1) {
            const { value, done } = await reader.read()
            console.log(value, done)
            if (done) { break }
            if (value.length == 0) { break }
        }*/
    }

    async readExactly(n, timeout=5000) {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        const endTime = +Date.now() + timeout
        while (timeout <= 0 || (+Date.now() < endTime)) {
            if (this.receivedData.length >= n) {
                const res = this.receivedData.substring(0, n)
                this.receivedData = this.receivedData.substring(n)
                return res
            }
            await sleep(10)
        }
        throw new Error('Timeout')
    }

    async readUntil(ending, timeout=5000) {
        if (!this.inTransaction) {
            throw new Error('Not in transaction')
        }
        const endTime = +Date.now() + timeout
        while (timeout <= 0 || (+Date.now() < endTime)) {
            const idx = this.receivedData.indexOf(ending) + ending.length
            if (idx >= ending.length) {
                const res = this.receivedData.substring(0, idx)
                this.receivedData = this.receivedData.substring(idx)
                return res
            }
            await sleep(10)
        }
        throw new Error('Timeout reached before finding the ending sequence')
    }

    async enterRawRepl(soft_reboot=false) {
        const release = await this.startTransaction()
        try {
            await this.write('\r\x03\x03')   // Ctrl-C twice: interrupt any running program
            await this.flushInput()
            await this.write('\r\x01')       // Ctrl-A: enter raw REPL
            await this.readUntil('raw REPL; CTRL-B to exit\r\n')

            if (soft_reboot) {
                await this.write('\x04\x03') // soft reboot in raw mode
                await this.readUntil('raw REPL; CTRL-B to exit\r\n')
            }

            return async () => {
                try {
                    await this.write('\x02')     // Ctrl-B: exit raw REPL
                    await this.readUntil('>\r\n')
                    const banner = await this.readUntil('>>> ')
                    //term.clear()
                    //term.write(banner)
                } finally {
                    release()
                }
            }
        } catch (err) {
            release()
            report("Cannot enter RAW mode", err)
            throw err
        }
    }
}

/*
 * USB / Serial
 */

class WebSerial extends Transport {
    constructor(serial=null) {
        super()
        this.port = null
        this.reader = null
        this.writer = null
        if (serial) {
            this.serial = serial
        } else {
            if (typeof navigator.serial === 'undefined') {
                throw new Error('WebSerial not available')
            }
            this.serial = navigator.serial
        }
    }

    async requestAccess() {
        this.port = await this.serial.requestPort()
    }

    async connect() {
        await this.port.open({ baudRate: 115200 })

        this.reader = this.port.readable.getReader()
        this.writer = this.port.writable.getWriter()

        this.listen()
    }

    async disconnect() {
        await this.reader.cancel()
        await this.port.close()
    }

    async writeBytes(data) {
        await this.writer.write(data)
    }

    async listen() {
        const decoder = new TextDecoder()
        try {
            while (true) {
                const { value, done } = await this.reader.read()
                if (done) break
                if (this.receiveCallback) {
                    this.receiveCallback(decoder.decode(value))
                }
            }
        } catch (error) {
            if (this.disconnectCallback) {
                this.disconnectCallback()
            }
        }
    }
}

/*
 * Bluetooth
 */

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_TX_LIMIT = 241

const ADA_NUS_SERVICE = 'adaf0001-4369-7263-7569-74507974686e'
const ADA_NUS_TX = 'adaf0002-4369-7263-7569-74507974686e'
const ADA_NUS_RX = 'adaf0003-4369-7263-7569-74507974686e'
const ADA_VER = 'adaf0100-4669-6c65-5472-616e73666572'
const ADA_FT = 'adaf0200-4669-6c65-5472-616e73666572'
const ADA_NUS_TX_LIMIT = 20

class WebBluetooth extends Transport {
    constructor() {
        super()
        this.device = null
        this.server = null
        this.service = null
        this.rx = null
        this.tx = null
        this.tx_limit = 20
        if (typeof navigator.bluetooth === 'undefined') {
            throw new Error('WebBluetooth not available')
        }
    }

    async requestAccess() {
        this.device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [NUS_SERVICE] },
                { namePrefix: 'mpy-' },
                { services: [ 0xfebb ] },
                { namePrefix: 'CIRCUITPY' },
            ],
            //acceptAllDevices: true,
            optionalServices: [NUS_SERVICE, ADA_NUS_SERVICE, 0xfebb],
        })

        this.device.addEventListener("gattserverdisconnected", () => {
            if (this.disconnectCallback) {
                this.disconnectCallback()
            }
        })
    }

    async connect() {
        this.server = await this.device.gatt.connect()
        this.service = null

        const services = await this.server.getPrimaryServices()
        for (let service of services) {
            if (service.uuid === NUS_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(NUS_RX)
                this.tx = await service.getCharacteristic(NUS_TX)
                this.tx_limit = NUS_TX_LIMIT
            } else if (service.uuid === ADA_NUS_SERVICE) {
                this.service = service
                this.rx = await service.getCharacteristic(ADA_NUS_RX)
                this.tx = await service.getCharacteristic(ADA_NUS_TX)
                this.tx_limit = ADA_NUS_TX_LIMIT

                // Check version
                const ada_fts = await this.server.getPrimaryService(0xfebb)
                const versionChar = await ada_fts.getCharacteristic(ADA_VER)
                const version = (await versionChar.readValue()).getUint32(0, true)
                if (version != 4) {
                    throw new Error(`Unsupported version: ${version}`)
                }

                // Register file transfer char
                const ft = await ada_fts.getCharacteristic(ADA_FT)
                //ft.removeEventListener('characteristicvaluechanged', () => {})
                ft.addEventListener('characteristicvaluechanged', () => {})
                await ft.startNotifications()
            }

            if (this.service) {
                await this.rx.startNotifications()
                this.rx.addEventListener('characteristicvaluechanged', this.handleNotifications.bind(this))
                return    
            }
        }

        throw new Error('No compatible NUS service found')
    }

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
    }

    async writeBytes(data) {
        //await this.tx.writeValueWithoutResponse(data)
        await this.tx.writeValue(data)
    }

    handleNotifications(event) {
        const decoder = new TextDecoder()
        const value = event.target.value
        if (this.receiveCallback) {
            this.receiveCallback(decoder.decode(value))
        }
    }
}

/*
 * WebSocket
 */

class WebSocketREPL extends Transport {
    constructor(url, pass) {
        super()
        if (!url) {
            throw new Error("WebSocket URL is required")
        }
        this.url = url
        this.pass = pass
        this.socket = null
    }

    async requestAccess() {
    }

    async connect() {
        function _conn(url) {
            return new Promise(function(resolve, reject) {
                const ws = new WebSocket(url)
                ws.onopen = function() { resolve(ws) }
                ws.onerror = function(err) { reject(err) }
            })
        }
        this.socket = await _conn(this.url)
        this.socket.binaryType = 'arraybuffer'
        this.socket.onmessage = (event) => {
            if (this.receiveCallback) {
                this.receiveCallback(event.data)
            }
        }

        this.socket.onclose = () => {
            if (this.disconnectCallback) {
                this.disconnectCallback()
            }
        }

        const release = await this.startTransaction()
        try {
            await this.readUntil('Password:')
            await this.write(this.pass + '\n')
            await this.readUntil('\n') // skip echo
            const rsp = (await this.readUntil('\n')).trim()
            if (rsp == "WebREPL connected") {
                // All good!
            } else if (rsp == "Access denied") {
                throw new Error("Invalid password")
            } else {
                throw new Error(rsp)
            }
        } finally {
            release()
        }
    }

    async disconnect() {
        if (this.socket) {
            this.socket.close()
        }
    }

    async write(value) {
        if (!this.socket) { return; }
        try {
            let offset = 0
            while (offset < value.length) {
                const chunk = value.slice(offset, offset + this.writeChunk)
                this.socket.send(chunk)
                offset += this.writeChunk
                if (offset < value.length) {
                    await sleep(150)
                }
            }
        } catch (err) {
            report("Write error", err)
        }
    }
}

/*
 * MP Remote
 */

function sizeFmt(size, places=1) {
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

let editor, term, port
let editorFn = ""
let isInRunMode = false

async function disconnectDevice() {
    if (port) {
        try {
            await port.disconnect()
        } catch (err) {}
        port = null
    }

    for (const t of ["ws", "ble", "usb"]) {
        QID(`btn-conn-${t}`).classList.remove('connected')
    }
}

async function connectDevice(type) {
    if (type === 'ws') {
        let url
        if (typeof webrepl_url === 'undefined' || webrepl_url == '') {
            url = prompt('WebREPL device address:', '192.168.1.123:8266')
            if (!url) return;

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
        }
        const pass = prompt('WebREPL password:')
        if (pass == null) { return }
        if (pass.length < 4) {
            toastr.error('Password is too short')
            return
        }
        await disconnectDevice()
        port = new WebSocketREPL(url, pass)
    } else if (type === 'ble') {
        if (iOS) {
            toastr.error('WebBluetooth is not available on iOS')
            return;
        }
        if (window.location.protocol === "http:") {
            toastr.error('WebBluetooth cannot be accessed with unsecure connection')
            return;
        }

        if (typeof navigator.bluetooth === 'undefined') {
            toastr.error('Chrome browser is needed (or Edge, Opera, Chromium, etc.)')
            return;
        }

        await disconnectDevice()
        port = new WebBluetooth()
    } else if (type === 'usb') {
        if (iOS) {
            toastr.error('WebSerial is not available on iOS')
            return;
        }
        if (window.location.protocol === "http:") {
            toastr.error('WebSerial cannot be accessed with unsecure connection')
            return;
        }

        if (typeof navigator.serial === 'undefined' && typeof navigator.usb === 'undefined') {
            toastr.error('Chrome browser is needed (or Edge, Opera, Chromium, etc.)')
            return;
        }

        await disconnectDevice()
        if (typeof navigator.serial === 'undefined' || QID('force-serial-poly').checked) {
            console.log('Using WebSerial polyfill')
            port = new WebSerial(webSerialPolyfill)
        } else {
            port = new WebSerial()
        }
    } else {
        toastr.error('Unknown connection type')
        return
    }

    try {
        await port.requestAccess()
    } catch {
        port = null
        return
    }

    try {
        await port.connect()
    } catch (err) {
        port = null
        report('Cannot connect', err)
        return
    }

    port.onReceive((data) => {
        term.write(data)
    })

    port.onDisconnect(() => {
        QID(`btn-conn-${type}`).classList.remove('connected')
        toastr.warning('Device disconnected')
        port = null
        //connectDevice(type)
    })

    toastr.success('Device connected')

    QID(`btn-conn-${type}`).classList.add('connected')

    if (QID('interrupt-device').checked) {
        // TODO: detect WDT and disable it temporarily

        try {
            const files = await fetchFileList()
            if        (files.filter(x => x.name === 'main.py').length) {
                await readFileIntoEditor('main.py')
            } else if (files.filter(x => x.name === 'code.py').length) {
                await readFileIntoEditor('code.py')
            }

            const info = await readDeviceInfo()
            // Print banner. TODO: optimize
            await port.write('\x02')

            info['connection'] = type
            analytics.track('Device Connected', info)
        } catch (err) {
            report('Error reading board info', err)
        }
    } else {
        analytics.track('Device Connected')
    }
}

function splitPath(path) {
    const parts = path.split('/').filter(part => part !== '')
    const filename = parts.pop()
    const directoryPath = parts.join('/')
    return [ directoryPath, filename ]
}

async function createNewFile(path) {
    const fn = prompt(`Creating new file inside ${path}\nPlease enter the name:`)
    if (fn == null || fn == "") return

    if (fn.endsWith("/")) {
        const full = path + fn.slice(0, -1)
        await makePath(full)
    } else {
        const full = path + fn
        if (fn.includes('/')) {
            // Ensure path exists
            const [dirname, _] = splitPath(full)
            await makePath(dirname)
        }
        await execRawRepl(`
f=open('${full}','wb')
f.close()
`)
        await readFileIntoEditor(full)
    }
    await fetchFileList()
}

async function removeFile(path) {
    if (!confirm(`Remove ${path}?`)) return
    await execRawRepl(`
import os
try:
 os.remove('${path}')
except OSError as e:
 if e.args[0] == 39:
  raise Exception('Directory not empty')
 else:
  raise
`)
    await fetchFileList()
}

async function removeDir(path) {
    if (!confirm(`Remove ${path}?`)) return
    await execRawRepl(`
import os
try:
 os.rmdir('${path}')
except OSError as e:
 if e.args[0] == 39:
  raise Exception('Directory not empty')
 else:
  raise
`)
    await fetchFileList()
}

async function makePath(path) {
    await execRawRepl(`
import os
p = ''
for d in '${path}'.split('/'):
    p += '/' + d if p else d
    try: os.mkdir(p)
    except OSError as e:
        if e.args[0] != 17: raise
`)
}

async function execCmd(cmd, timeout=5000, emit=false) {
    await port.readUntil('>')
    await port.write(cmd)
    await port.write('\x04')         // Ctrl-D: execute
    const status = await port.readExactly(2)
    if (status != 'OK') {
        throw new Error('Cannot exec command:' + status)
    }
    port.emit = emit
    if (emit) {
        term.write(port.receivedData)
    }
    const res = (await port.readUntil('\x04', timeout)).slice(0, -1)
    const err = (await port.readUntil('\x04', timeout)).slice(0, -1)

    if (err.length) {
        throw new Error('Cannot exec command: ' + err)
    }

    return res
}

async function execRawRepl(cmd, soft_reboot=false) {
    const exitRaw = await port.enterRawRepl(soft_reboot)
    try {
        return await execCmd(cmd)
    } catch (err) {
        report("Execution failed", err)
    } finally {
        await exitRaw()
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

    const fileTree = QID('menu-file-tree')

    let files
    try {
        files = await execRawRepl(`
import os
def walk(p):
 for n in os.listdir(p):
  fn=p+n
  s=os.stat(fn)
  if s[0] & 0x4000 == 0:
   print('f:'+fn+':'+str(s[6]))
  elif n not in ('.','..'):
   print('d:'+fn+':'+str(s[6]))
   walk(fn+'/')
walk('')
`)
    } catch (err) {
        files = await execRawRepl(`
import os
for n in os.listdir():
 s=os.stat(n)
 if s[0] & 0x4000 == 0:
  print('f:'+n+':'+str(s[6]))
`)
    }

    let [fs_used, fs_free, fs_size] = [0,0,0];
    try {
        let stats = await execRawRepl(`
import os
s = os.statvfs("/")
fs = s[1] * s[2]
ff = s[3] * s[0]
fu = fs - ff
print('%s:%s:%s' % (fu, ff, fs))
`);
        [fs_used, fs_free, fs_size] = stats.trim().split(':')
    } catch (err) {
    }

    // Build file tree
    let result = []
    for (const line of files.split('\n')) {
        if (line === '') continue
        let current = result
        let [type, fullpath, size] = line.trim().split(':')
        let path = fullpath.split('/')
        let file
        if (type == 'f') {
            file = path.pop()
        }
        for (const segment of path) {
            if (segment === '') continue
            let next = current.filter(x => x.name === segment && "content" in x)
            if (next.length) {
                current = next[0].content
            } else {
                prev = current
                current = []
                prev.push({ name: segment, path: path.join('/'), content: current })
            }
        }
        if (type == 'f') {
            current.push({ name: file, path: fullpath, size: parseInt(size, 10) })
        }
    }

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
    fileTree.innerHTML = `<div>
        <span class="folder name"><i class="fa-solid fa-folder fa-fw"></i> /</span>
        <a href="#" class="menu-action" onclick="createNewFile('/')"><i class="fa-solid fa-plus"></i></a>
        <span class="menu-action">${T('files.used')} ${sizeFmt(fs_used,0)} / ${sizeFmt(fs_size,0)}</span>
    </div>`
    function traverse(node, depth) {
        const offset = "&emsp;".repeat(depth)
        for (const n of sorted(node)) {
            if ("content" in n) {
                fileTree.insertAdjacentHTML('beforeend', `<div>
                    <span class="folder name">${offset}<i class="fa-solid fa-folder fa-fw"></i> ${n.name}</span>
                    <a href="#" class="menu-action" onclick="removeDir('${n.path}')"><i class="fa-solid fa-xmark"></i></a>
                    <a href="#" class="menu-action" onclick="createNewFile('${n.path}/')"><i class="fa-solid fa-plus"></i></a>
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
                    <a href="#" class="name" onclick="fileClick('${n.path}')">${offset}${icon} ${n.name}</a>
                    <a href="#" class="menu-action" onclick="removeFile('${n.path}')"><i class="fa-solid fa-xmark"></i></a>
                    <span class="menu-action">${sizeFmt(n.size)}</span>
                </div>`)
            }
        }
    }
    traverse(result, 1)

    fileTree.insertAdjacentHTML('beforeend', `<div>
        <a href="#" class="name" onclick="fileClick('~sysinfo.md')"><i class="fa-regular fa-message fa-fw"></i> sysinfo.md</a>
        <span class="menu-action">virtual</span>
    </div>`)

    return result
}

async function fileClick(fn) {
    const e = window.event.target || window.event.srcElement;

    for (const el of document.getElementsByClassName("name")){
        el.classList.remove('selected')
    }

    await readFileIntoEditor(fn)

    e.classList.add('selected')
}

function toHex(data){
    if (typeof data === 'string' || data instanceof String) {
        const encoder = new TextEncoder('utf-8')
        data = Array.from(encoder.encode(data))
    }
    return [...new Uint8Array(data)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('')
}

async function readFile(fn) {
    const content = await execRawRepl(`
try:
 import binascii
 h=lambda x: binascii.hexlify(x).decode()
 h(b'')
except:
 h=lambda b: ''.join('{:02x}'.format(byte) for byte in b)
with open('${fn}','rb') as f:
 while 1:
  b=f.read(255)
  if not b:break
  print(h(b),end='')
`)
    if (content.length) {
        return new Uint8Array(content.match(/../g).map(h=>parseInt(h,16)))
    } else {
        return new Uint8Array()
    }
}

async function writeFile(fn, data, chunk_size=128) {
    const exitRaw = await port.enterRawRepl()
    try {
        await execCmd(`
import os
try:
 import binascii
 h=binascii.unhexlify
 h('')
except:
 h=lambda s: bytes(int(s[i:i+2], 16) for i in range(0, len(s), 2))
f=open('.viper.tmp','wb')
def w(d):
 f.write(h(d))
`)

        // Split into chunks and send
        const hexData = toHex(data)
        for (let i = 0; i < hexData.length; i += chunk_size) {
            const chunk = hexData.slice(i, i + chunk_size)
            await execCmd("w('" + chunk + "')")
        }

        await execCmd(`f.close()
try: os.remove('${fn}')
except: pass
os.rename('.viper.tmp','${fn}')
`)
    } finally {
        await exitRaw()
    }
}

async function readDeviceInfo() {
    const  rsp = await execRawRepl(`
import sys,os
u=os.uname()
v=sys.version.split(';')[1].strip()
print('|'.join([u.machine,u.release,u.sysname,v]))
`)
    const [machine, release, sysname, version] = rsp.trim().split('|')
    return { machine, release, sysname, version }
}

async function readFileIntoEditor(fn) {
    let content
    let isBinary = false
    if (fn == "~sysinfo.md") {
        content = await execRawRepl(`
import sys,os,gc
gc.collect()
mu = gc.mem_alloc()
mf = gc.mem_free()
ms = mu + mf
uname=os.uname()
p=print
def size_fmt(size):
 suffixes = ['B','KiB','MiB','GiB','TiB']
 i = 0
 while size > 1024 and i < len(suffixes)-1:
  i += 1
  size //= 1024
 return "%d%s" % (size, suffixes[i])
p('## Machine')
p('- Name: \`'+uname.machine+'\`')
try:
 gc.collect()
 import microcontroller as uc
 p('- CPU: \`%s @ %s MHz\`' % (sys.platform, uc.cpu.frequency // 1_000_000))
 p('- UID: \`%s\`' % (uc.cpu.uid.hex(),))
 p('- Temp.: \`%s °C\`' % (uc.cpu.temperature,))
 p('- Voltage: \`%s V\`' % (uc.cpu.voltage,))
except:
 try:
  gc.collect()
  import machine
  p('- CPU: \`%s @ %s MHz\`' % (sys.platform, machine.freq() // 1_000_000))
 except:
  p('- CPU: \`'+sys.platform+'\`')
p()
p('## System')
p('- Version: \`'+sys.version.split(";")[1].strip()+'\`')
if ms:
 p('- Memory use:  \`%s / %s, free: %d%%\`' % (size_fmt(mu), size_fmt(ms), (mf * 100) // ms))
`)
    } else {
        content = await readFile(fn)
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
    await writeFile(editorFn, content)
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
    const exitRaw = await port.enterRawRepl(soft_reboot)
    try {
        btnRunIconClass.remove('fa-circle-play')
        btnRunIconClass.add('fa-circle-stop')
        isInRunMode = true
        const emit = true
        await execCmd(editor.getValue(), timeout, emit)
        analytics.track('Script Run')
    } catch (err) {
        if (err.message.includes("KeyboardInterrupt")) {
            analytics.track('Script Run')
        } else {
            report("Execution failed", err)
        }
    } finally {
        btnRunIconClass.remove('fa-circle-stop')
        btnRunIconClass.add('fa-circle-play')
        isInRunMode = false
        port.emit = false
        await exitRaw()
        term.write('\r\n>>> ')
    }
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
        <a href="#" class="menu-action" onclick="installReplTools()">0.1.0 <i class="fa-regular fa-circle-down"></i></a>
    </div>`)
    pkgList.insertAdjacentHTML('beforeend', `<div class="title-lines">micropython-lib</div>`)
    for (const pkg of mipindex.packages) {
        pkgList.insertAdjacentHTML('beforeend', `<div>
            <span><i class="fa-solid fa-cube fa-fw"></i> ${pkg.name}</span>
            <a href="#" class="menu-action" onclick="installPkg('${index_url}', '${pkg.name}')">${pkg.version} <i class="fa-regular fa-circle-down"></i></a>
        </div>`)
    }
}

async function installPkg(index_url, pkg, version='latest', pkg_info=null) {
    if (!port) return;

    try {
        const sys = JSON.parse(await execRawRepl(`
import sys,json
mpy=getattr(sys.implementation, '_mpy', 0) & 0xFF
print(json.dumps({'mpy':mpy,'path':sys.path}))
`))

        if (!sys.mpy) { sys.mpy = "py" }

        // Find `lib` filder in sys.path
        const lib_path = sys.path.find(x => x.endsWith('/lib'))
        if (!lib_path) {
            toastr.error(`"lib" folder not found in sys.path`)
            return
        }

        if (!pkg_info) {
            const pkg_info_rsp = await fetch(rewriteUrl(`${index_url}/package/${sys.mpy}/${pkg}/${version}.json`))
            pkg_info = await pkg_info_rsp.json()
        }

        if ("hashes" in pkg_info) {
            for (const [fn, hash, ..._] of pkg_info.hashes) {
                const file_rsp = await fetch(rewriteUrl(`${index_url}/file/${hash.slice(0,2)}/${hash}`))
                const content = await file_rsp.arrayBuffer()
                const target_file = `${lib_path}/${fn}`

                // Ensure path exists
                const [dirname, _] = splitPath(target_file)
                await makePath(dirname)

                await writeFile(target_file, content)
            }
        }

        if ("urls" in pkg_info) {
            for (const [fn, url, ..._] of pkg_info.urls) {
                const file_rsp = await fetch(rewriteUrl(url))
                const content = await file_rsp.arrayBuffer()
                const target_file = `${lib_path}/${fn}`

                // Ensure path exists
                const [dirname, _] = splitPath(target_file)
                await makePath(dirname)

                await writeFile(target_file, content)
            }
        }

        if ("deps" in pkg_info) {
            for (const [dep_pkg, dep_ver, ..._] of pkg_info.deps) {
                await installPkg(index_url, dep_pkg, dep_ver)
            }
        }
        toastr.success(`Installed ${pkg}@${pkg_info.version} to ${lib_path}`)
    } catch (err) {
        report('Installing failed', err)
    }
}

async function installReplTools() {
    await installPkg(null, "viper-tools", "latest", {
        v: 1,
        version: "0.1.0",
        urls: [
            ["web_repl.py", "github:vshymanskyy/ViperIDE/mpy_repl/web_repl.py"],
            ["ble_repl.py", "github:vshymanskyy/ViperIDE/mpy_repl/ble_repl.py"],
            ["ble_nus.py",  "github:vshymanskyy/ViperIDE/mpy_repl/ble_nus.py"],
        ]
    })
}

/*
 * UI helpers
 */

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

function setupTabs(containerNode) {
    const tabs = containerNode.querySelectorAll('.tab')
    const tabContents = containerNode.querySelectorAll('.tab-content')

    tabs.forEach(tab => {
        tab.setAttribute('href', '#')
        tab.addEventListener('click', () => {
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
        })
    })
}

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
    containerDiv.className = 'hexed-viewer'

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

function isRunningStandalone() {
    return (window.matchMedia('(display-mode: standalone)').matches);
}

if (isRunningStandalone()) {
    // This code will be executed if PWA app is running standalone
}

if (navigator.appVersion.indexOf("Win") >= 0) {
    document.body.classList.add('windows')
} else if (navigator.appVersion.indexOf("Mac") >= 0) {
    document.body.classList.add('macos')
} else {
    document.body.classList.add('linux')
}

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
        extraKeys: {
            "F5": (cm) => runCurrentFile(),
            "Ctrl-S": (cm) => saveCurrentFile(),
        }
    })
}

function applyTranslation() {
    try {
        // sanity check
        if (!i18next.exists('example.hello')) return;

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

        QID('no-files').innerText = T('files.no-files')

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

        QS('#about-cta').innerHTML = T('about.cta')
        QS('#report-bug').innerHTML = T('about.report-bug')

        QSA("a[id=gh-star]").forEach(el => {
            el.setAttribute("href", "https://github.com/vshymanskyy/ViperIDE")
            el.setAttribute("target", "_blank")
        })

        QSA("a[id=gh-issues]").forEach(el => {
            el.setAttribute("href", "https://github.com/vshymanskyy/ViperIDE/issues")
            el.setAttribute("target", "_blank")
        })
    } catch (err) {}
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

(async () => {
    /*window.addEventListener('error', (e) => {
        toastr.error(e, "Error")
    })
    window.addEventListener('unhandledrejection', (e) => {
        toastr.error(e.reason, "Unhandled Rejection")
    })*/

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

# Print each letter with a different color
print("=" * 32)
for i, char in enumerate(text):
    color = colors[i % len(colors)]
    print(color + char, end="")
print(reset)
print("=" * 32)

# Count 1 to 10
for i in range(10):
    time.sleep(1)
    print(i + 1, "", end="")
print()
`)

    const xtermTheme = {
        foreground: '#F8F8F8',
        background: '#272822',
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

    setTimeout(() => {
        document.body.classList.add('loaded')
    }, 100)

    if (typeof webrepl_url !== 'undefined') {
        await sleep(500)
        await connectDevice('ws')
    }

    analytics.identify(getUserUID())
    const ua = new UAParser()
    const s = window.screen
    const dpr = window.devicePixelRatio
    let tz
    try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (e) {
        tz = new Date().getTimezoneOffset()
    }
    analytics.track('Visited', {
        browser: ua.getBrowser().name,
        browser_version: ua.getBrowser().version,
        os: ua.getOS().name,
        os_version: ua.getOS().version,
        cpu: ua.getCPU().architecture,
        pwa: isRunningStandalone(),
        referrer: document.referrer,
        screen: (parseInt(s.width*dpr) + "x" + parseInt(s.height*dpr)),
        lang: currentLang,
    })
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
    startY = e.clientY || e.touches[0].clientY
    startHeight = parseInt(document.defaultView.getComputedStyle(QID('terminal-container')).height, 10)
    document.documentElement.addEventListener('mousemove', doDrag, false)
    document.documentElement.addEventListener('touchmove', doDrag, false)
    document.documentElement.addEventListener('mouseup', stopDrag, false)
    document.documentElement.addEventListener('touchend', stopDrag, false)
}

function doDrag(e) {
    const clientY = e.clientY || e.touches[0].clientY
    const terminalContainer = QID('terminal-container')
    terminalContainer.style.height = (startHeight - (clientY - startY)) + 'px'
}

function stopDrag() {
    document.documentElement.removeEventListener('mousemove', doDrag, false)
    document.documentElement.removeEventListener('touchmove', doDrag, false)
    document.documentElement.removeEventListener('mouseup', stopDrag, false)
    document.documentElement.removeEventListener('touchend', stopDrag, false)
}
