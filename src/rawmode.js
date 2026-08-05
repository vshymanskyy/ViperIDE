/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { sleep } from './utils.js'
import { reprStr as pyStr } from './python_utils.js'

/*
 * What a board prints when the interpreter restarts: MicroPython says
 * 'MPY: soft reboot', CircuitPython just 'soft reboot'. Anchored to a line of its own -
 * a false positive only costs one extra probe, but not none at all.
 *
 * The friendly-REPL greeting counts too. A board reset by its own button, or by
 * machine.reset() over a serial bridge that outlives it, comes back without ever
 * saying 'soft reboot' - but it always introduces itself. Ctrl-B prints the same
 * greeting on request, so whoever asks for it has to expect one back.
 */
export const SOFT_RESET_BANNER =
    /(^|[\r\n])((MPY: )?soft reboot|Type "help\(\)" for more information\.)\r?\n/

/*
 * Every prompt a board might answer with. '>>> ' is standard MicroPython, '--> '
 * is aiorepl - which prints its prompt itself and never touches sys.ps1, so it has
 * to be listed here rather than detected. begin() appends whatever else a board
 * reports in sys.ps1; the array is appended to, never replaced, so importers keep
 * seeing what has been learned since.
 */
export const REPL_PROMPTS = ['>>> ', '--> ']

/* What raw mode announces itself with, the same on every board and the one reply
   that does not depend on knowing the prompt. */
const RAW_REPL_BANNER = 'raw REPL; CTRL-B to exit\r\n'

/*
 * The one of them this board was last seen using, as opposed to the ones it might.
 * Only for drawing a prompt the app owes the terminal - a session ends by consuming
 * the real one inside its transaction, and printing '>>> ' at an aiorepl board is
 * how the terminal ends up disagreeing with the device.
 */
let activePrompt = REPL_PROMPTS[0]

export function getActivePrompt() { return activePrompt }

/*
 * The trailing part of `buf` if it has the shape of a REPL prompt: a short run of
 * characters on a line of its own that nothing has been printed after, ending in the
 * space every convention puts between the prompt and what gets typed - '>>> ', '--> ',
 * and whatever a board has put in sys.ps1. Returns null when it does not.
 *
 * Deliberately narrow. This only decides whether a board is idle enough to open a
 * session on; the prompt itself is then read from sys.ps1, which cannot be guessed at.
 */
function looksLikePrompt(buf) {
    return buf.match(/(^|[\r\n])(\S[^\r\n]{0,14} )$/)?.[2] ?? null
}

export class MpRawMode {
    constructor(port) {
        this.port = port
    }

    static async begin(port, soft_reboot=false) {
        const res = new MpRawMode(port)
        await res.enterRawRepl(soft_reboot)
        try {
            /* Which prompt this board uses is learned here rather than in a pass of
               its own: the session is already open, so the extra print costs nothing
               and end() below is the first thing that needs the answer. Not every
               port builds sys.ps1 in - without it the defaults stand. */
            const rsp = await res.exec(
                `import sys,os\ntry: print(sys.ps1)\nexcept AttributeError: pass`)
            const prompt = rsp.trim() && rsp.trim() + ' '
            if (prompt && !REPL_PROMPTS.includes(prompt)) {
                console.log(`Detected board prompt as ${prompt}`)
                REPL_PROMPTS.push(prompt)
            }
        } catch (err) {
            await res.end()
            throw err
        }
        return res
    }

    /*
     * Whether the board is sitting at the friendly REPL: one Enter, and a short wait
     * for the prompt to come back. Nothing else is sent, so a running program is left
     * alone - the Enter it may receive on stdin is the price of asking.
     *
     * port.readUntil() cannot be used here: its deadline restarts on every byte that
     * arrives, so a program printing in a loop would keep the probe waiting forever.
     * This deadline is hard.
     */
    static async probeRepl(port, timeout=1500) {
        const release = await port.startTransaction()
        const wasEmitting = port.emit
        try {
            // The space is important, newline is not enough sometimes
            await port.write(' \r')
            const endTime = Date.now() + timeout
            /* A board at the prompt answers within a poll or two, and what comes
               back is the echo of the Enter above - ours, not the user's, so it is
               kept off the terminal. A board that keeps the probe waiting is a
               board that is running, and everything it prints belongs on the
               terminal as it arrives rather than in one lump seconds later. */
            const showFrom = Date.now() + 300
            let settling = null
            while (Date.now() < endTime) {
                /* Any prompt this board might answer with, not just the built-in
                   one: a board running aiorepl is listening, and reporting it busy
                   leaves the app waiting for a '>>> ' that is never coming. */
                if (REPL_PROMPTS.some(p => port.receivedData.includes(p))) {
                    return true
                }
                /* A prompt nobody has seen before still announces itself by shape.
                   sys.ps1 is the authority on what it says, but reading it needs a
                   raw-mode session, and opening one needs this answer first - so the
                   shape is all there is to go on: the Enter above was echoed, and
                   what trails the last newline is the board asking for another line.
                   Held to two polls, because a prompt is what a board stops on and
                   partial output is not. begin() reads sys.ps1 straight afterwards
                   and records the real value, so nothing is kept on a guess. */
                const tail = looksLikePrompt(port.receivedData)
                if (tail && tail === settling) { return true }
                settling = tail

                if (!port.emit && Date.now() > showFrom) {
                    port.emit = true
                    if (port.prevRecvCbk) { port.prevRecvCbk(port.receivedData) }
                }
                await sleep(100)
            }
            return false
        } finally {
            /* Anything shown has already reached the terminal, and the prompt the
               probe asked for is not board output: either way the buffer must not
               be handed over when the transaction ends. */
            try { await port.flushInput() } catch (_err) { /* transaction is gone */ }
            port.emit = wasEmitting
            release()
        }
    }

    /*
     * Ctrl-C, and whatever the board says on its way back to a prompt goes to the
     * terminal - all but a bare prompt, which is only the answer to our own Ctrl-C.
     *
     * Best effort, and deliberately not retried here: a board using a prompt not yet
     * known will not match any of them, and one that is busy will not answer at all.
     * Either way it is the raw-REPL banner the caller goes on to wait for that says
     * whether this worked, and that reply is the same on every board.
     */
    async interruptProgram() {
        await this.port.write('\x03')   // Ctrl-C: interrupt any running program
        try {
            const banner = await this.port.readUntil(REPL_PROMPTS, 2000)
            if (this.port.prevRecvCbk && !REPL_PROMPTS.some(p => banner === '\r\n' + p)) {
                this.port.prevRecvCbk(banner)
            }
        } catch (_err) {
            /* Unknown prompt, or still running - the banner read decides */
        }
        await this.port.flushInput()
    }

    async enterRawRepl(soft_reboot=false, timeout=20000) {
        const release = await this.port.startTransaction()
        try {
            const endTime = Date.now() + timeout
            for (;;) {
                await this.interruptProgram()
                await this.port.write('\r\x01')   // Ctrl-A: enter raw REPL
                try {
                    await this.port.readUntil(RAW_REPL_BANNER, 2000)
                    break
                } catch (err) {
                    // Expected while the board is busy; only running out of time is real
                    if (Date.now() >= endTime) {
                        throw new Error('Board is not responding', { cause: err })
                    }
                }
            }

            if (soft_reboot) {
                await this.port.write('\x04\x03') // soft reboot in raw mode
                await this.port.readUntil(RAW_REPL_BANNER)
            }

            this.end = async () => {
                try {
                    await this.port.write('\x02')     // Ctrl-B: exit raw REPL
                    await this.port.readUntil('>\r\n')
                    /* What comes back ends with the prompt the board is really
                       using - the rest is the greeting Ctrl-B prints on the way. */
                    const seen = await this.port.readUntil(REPL_PROMPTS)
                    activePrompt = REPL_PROMPTS.find(p => seen.endsWith(p)) || activePrompt
                } finally {
                    release()
                }
            }
        } catch (err) {
            release()
            //report("Cannot enter RAW mode", err)
            throw err
        }
    }

    async exec(cmd, timeout=5000, emit=false) {
        await this.port.readUntil('>')
        await this.port.write(cmd)
        await this.port.write('\x04')         // Ctrl-D: execute
        const status = await this.port.readExactly(2, timeout)
        if (status != 'OK') {
            throw new Error(status)
        }
        this.port.emit = emit
        if (emit) {
            this.port.prevRecvCbk(this.port.receivedData)
        }
        const res = (await this.port.readUntil('\x04', timeout)).slice(0, -1)
        const err = (await this.port.readUntil('\x04', timeout)).slice(0, -1)

        if (err.length) {
            throw new Error(err)
        }

        return res
    }

    async readFile(fn) {
        const rsp = await this.exec(`
try:
 import binascii
 h=lambda x: binascii.hexlify(x).decode()
 h(b'')
except:
 h=lambda b: ''.join('{:02x}'.format(byte) for byte in b)
with open(${pyStr(fn)},'rb') as f:
 while 1:
  b=f.read(64)
  if not b:break
  print(h(b),end='')
`)
        if (rsp.length) {
            return new Uint8Array(rsp.match(/../g).map(h=>parseInt(h,16)))
        } else {
            return new Uint8Array()
        }
    }

    async writeFile(fn, data, chunk_size=128, direct=false) {
        console.log(`Writing ${fn}`)
        if (typeof data === 'string' || data instanceof String) {
            const encoder = new TextEncoder('utf-8')
            data = new Uint8Array(Array.from(encoder.encode(data)))
        }
        function hexlify(data) {
            return [...new Uint8Array(data)]
                .map(x => x.toString(16).padStart(2, '0'))
                .join('')
        }
        function repr(arr) {
            arr = new Uint8Array(arr)
            let result = "b'";
            for (let byte of arr) {
                if (byte >= 32 && byte <= 126) { // Printable ASCII range
                    if (byte === 92 || byte === 39) { // Escape backslash and single quote
                        result += '\\' + String.fromCharCode(byte);
                    } else {
                        result += String.fromCharCode(byte);
                    }
                } else {
                    result += '\\x' + byte.toString(16).padStart(2, '0');
                }
            }
            result += "'";
            return result;
        }
        const dest = direct ? fn : '.viper.tmp'
        await this.exec(`
try:
 import binascii
 h=binascii.unhexlify
 h('')
except:
 h=lambda s: bytes(int(s[i:i+2], 16) for i in range(0, len(s), 2))
f=open(${pyStr(dest)},'wb')
w=lambda d: f.write(h(d))
o=f.write
`)

        // Split into chunks and send
        for (let i = 0; i < data.byteLength; i += chunk_size) {
            const chunk = data.slice(i, i + chunk_size)
            const cmdHex = "w('" + hexlify(chunk) + "')"
            const cmdRepr = "o(" + repr(chunk) + ")"
            // Use the optimal command
            if (cmdHex.length < cmdRepr.length) {
                await this.exec(cmdHex)
            } else {
                await this.exec(cmdRepr)
            }
        }
        if (direct) {
            await this.exec(`f.close()`)
        } else {
            await this.exec(`f.close()
try: os.remove(${pyStr(fn)})
except: pass
os.rename(${pyStr(dest)},${pyStr(fn)})
`)
        }
    }

    async getDeviceInfo() {
        const rsp = await this.exec(`
try: u=os.uname()
except: u=('','','','',sys.platform)
try: import machine; id=machine.unique_id()
except: id=b''
try: v=sys.version.split(';')[1].strip()
except: v='MicroPython '+u[2]
mpy=getattr(sys.implementation, '_mpy', 0)
sp=':'.join(sys.path)
d=[u[4],id.hex(),u[2],u[0],v,(mpy>>10)&0x0F,mpy&0xFF,(mpy>>8)&3,sp]
print('|'.join(str(x) for x in d))
`)
        let [machine, uid, release, sysname, version, mpy_arch, mpy_ver, mpy_sub, sys_path] = rsp.trim().split('|')
        sys_path = sys_path.split(':')
        // See https://docs.micropython.org/en/latest/reference/mpyfiles.html
        try {
            mpy_arch = [null, 'x86', 'x64', 'armv6', 'armv6m', 'armv7m', 'armv7em', 'armv7emsp', 'armv7emdp', 'xtensa', 'xtensawin', 'rv32imc', 'rv64imc'][mpy_arch]
        } catch (_err) {
            mpy_arch = null
        }
        mpy_ver = parseInt(mpy_ver, 10)
        mpy_sub = parseInt(mpy_sub, 10)
        if (!mpy_ver) { mpy_ver = 'py' }
        return { machine, uid, release, sysname, version, mpy_arch, mpy_ver, mpy_sub, sys_path }
    }


    async touchFile(fn) {
        await this.exec(`
f=open(${pyStr(fn)},'wb')
f.close()
`)
    }

    async makePath(path) {
        // TODO: remove error code 20 once it is fixed in wasm port
        await this.exec(`
p=''
for d in ${pyStr(path)}.split('/'):
 if not d: continue
 p += '/'+d
 try: os.mkdir(p)
 except OSError as e:
  if e.args[0] not in (17, 20): raise
`)
    }

    async removeFile(path) {
        await this.exec(`
try:
 os.remove(${pyStr(path)})
except OSError as e:
 if e.args[0] == 39:
  raise Exception('Directory not empty')
 else:
  raise
`)
    }

    async removeDir(path) {
        await this.exec(`
try:
 os.rmdir(${pyStr(path)})
except OSError as e:
 if e.args[0] == 39:
  raise Exception('Directory not empty')
 else:
  raise
`)
    }

    /* Removes a file, or a directory with everything inside it */
    async removeTree(path) {
        await this.exec(`
def rmtree(p):
 try: s=os.stat(p)
 except OSError: return
 if s[0] & 0x4000:
  for n in os.listdir(p):
   if n in ('.','..'): continue
   rmtree(p+'/'+n)
  os.rmdir(p)
 else:
  os.remove(p)
rmtree(${pyStr(path)})
`)
    }

    /* Renames a file or directory. Refuses to clobber an existing destination:
       os.rename() silently replaces files on some ports and fails on others. */
    async movePath(src, dst) {
        await this.exec(`
try:
 os.stat(${pyStr(dst)})
 x=1
except OSError:
 x=0
if x: raise Exception('Already exists: '+${pyStr(dst)})
os.rename(${pyStr(src)},${pyStr(dst)})
`)
    }

    async getFsStats(path='/') {
        const rsp = await this.exec(`
s = os.statvfs(${pyStr(path)})
fs = s[1] * s[2]
ff = s[3] * s[0]
fu = fs - ff
print('%s|%s|%s'%(fu,ff,fs))
`)
        // fs_used, fs_free, fs_size
        return rsp.trim().split('|')
    }

    async walkFs() {
        const rsp = await this.exec(`
def walk(p):
 for n in os.listdir(p if p else '/'):
  fn=p+'/'+n
  try: s=os.stat(fn)
  except: s=(0,)*7
  try:
   if s[0] & 0x4000 == 0:
    print('f|'+fn+'|'+str(s[6]))
   elif n not in ('.','..'):
    print('d|'+fn+'|'+str(s[6]))
    walk(fn)
  except:
   print('f|'+p+'/???|'+str(s[6]))
walk('')
`)

        let result = []
        // Build file tree
        for (const line of rsp.split('\n')) {
            if (line === '') continue
            let current = result
            let [type, fullpath, size] = line.trim().split('|')
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
                    const prev = current
                    current = []
                    prev.push({ name: segment, path: path.join('/'), content: current })
                }
            }
            if (type == 'f') {
                current.push({ name: file, path: fullpath, size: parseInt(size, 10) })
            }
        }
        return result
    }

    async readSysInfoMD() {
        return await this.exec(`
import gc
gc.collect()
mu = gc.mem_alloc()
mf = gc.mem_free()
ms = mu + mf
try: name=os.uname().machine
except: name=sys.implementation._machine
p=print
def size_fmt(size):
 suffixes = ['B','KiB','MiB','GiB','TiB']
 i = 0
 while size > 1024 and i < len(suffixes)-1:
  i += 1
  size //= 1024
 return "%d%s" % (size, suffixes[i])
p('## Machine')
p('- Name: \`'+name+'\`')
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
    }
}
