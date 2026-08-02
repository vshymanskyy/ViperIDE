/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Renders a JS string as a single-quoted Python string literal, so it can be safely
// spliced into generated Python source (filenames/paths may contain ' or \).
function pyStr(s) {  // reprStr
  //const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  const quote = "'";
  const NONPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;
  let out = quote;
  for (const ch of String(s)) {
    if (ch === '\\') out += '\\\\';
    else if (ch === quote) out += '\\' + quote;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch !== ' ' && NONPRINTABLE.test(ch)) {
      const cp = ch.codePointAt(0);
      if (cp < 0x100) out += '\\x' + cp.toString(16).padStart(2, '0');
      else if (cp < 0x10000) out += '\\u' + cp.toString(16).padStart(4, '0');
      else out += '\\U' + cp.toString(16).padStart(8, '0');
    } else out += ch;
  }
  return out + quote;
}

/*
 * What a board prints when the interpreter restarts: MicroPython says
 * 'MPY: soft reboot', CircuitPython just 'soft reboot'. Anchored to a line of its own -
 * a false positive only costs one extra probe, but not none at all.
 */
export const SOFT_RESET_BANNER = /(^|[\r\n])(MPY: )?soft reboot\r?\n/

export class MpRawMode {
    constructor(port) {
        this.port = port
    }

    static async begin(port, soft_reboot=false) {
        const res = new MpRawMode(port)
        await res.enterRawRepl(soft_reboot)
        try {
            await res.exec(`import sys,os`)
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
    static async probeRepl(port, timeout=3000) {
        const release = await port.startTransaction()
        try {
            // The space is important, newline is not enough sometimes
            await port.write(' \r')
            const endTime = Date.now() + timeout
            while (Date.now() < endTime) {
                if (port.receivedData.includes('>>> ')) {
                    await port.flushInput()   // the prompt we asked for is not board output
                    return true
                }
                await sleep(100)
            }
            /* Whatever the program printed meanwhile is deliberately left in the
               buffer: the transaction hands it to the terminal on release, so the
               user sees it - and a prompt that arrived just too late still gets
               noticed downstream. */
            return false
        } finally {
            release()
        }
    }

    async interruptProgram(timeout=20000) {
        const endTime = Date.now() + timeout
        while (timeout <= 0 || (Date.now() < endTime)) {
            await this.port.write('\x03')   // Ctrl-C: interrupt any running program
            try {
                let banner = await this.port.readUntil('>>> ', 2000)
                if (this.port.prevRecvCbk && banner != '\r\n>>> ') {
                    this.port.prevRecvCbk(banner)
                }
                await this.port.flushInput()
                return
            } catch (err) {
                // Per-retry readUntil timeouts are expected while the device is busy.
                // Only the final outer-timeout throw below is a real error surfaced to the user.
                console.debug('interruptProgram retry:', err.message)
            }
        }
        throw new Error('Board is not responding')
    }

    async enterRawRepl(soft_reboot=false) {
        const release = await this.port.startTransaction()
        try {
            await this.interruptProgram()

            await this.port.write('\r\x01')       // Ctrl-A: enter raw REPL
            await this.port.readUntil('raw REPL; CTRL-B to exit\r\n')

            if (soft_reboot) {
                await this.port.write('\x04\x03') // soft reboot in raw mode
                await this.port.readUntil('raw REPL; CTRL-B to exit\r\n')
            }

            this.end = async () => {
                try {
                    await this.port.write('\x02')     // Ctrl-B: exit raw REPL
                    await this.port.readUntil('>\r\n')
                    await this.port.readUntil('>>> ')
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
