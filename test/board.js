/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Board-side helpers used to set up and verify tests.
 *
 * These deliberately do NOT reuse MpRawMode's path handling: paths are passed to the
 * device as byte lists and names are read back hex-encoded, so a test can tell the
 * difference between "the board cannot store this name" and "ViperIDE mangled it".
 */

import { MpRawMode } from '../src/rawmode.js'

const encoder = new TextEncoder()

/* A Python expression evaluating to `s`, with no escaping involved. */
export function pyPath(s) {
    return `bytes([${[...encoder.encode(s)].join(',')}]).decode()`
}

function hexToStr(hex) {
    const bytes = new Uint8Array(hex.match(/../g)?.map(h => parseInt(h, 16)) || [])
    return new TextDecoder('utf-8').decode(bytes)
}

/* Opens a raw REPL session, runs fn, and always leaves the board back at the friendly
 * REPL - the same begin/end cycle ViperIDE performs for every board operation. */
export async function withRaw(port, fn, { soft_reboot = false } = {}) {
    const raw = await MpRawMode.begin(port, soft_reboot)
    try {
        return await fn(raw)
    } finally {
        try {
            await raw.end()
        } catch (err) {
            console.error('  [warn] leaving raw mode failed:', err.message)
        }
    }
}

export async function statPath(raw, path) {
    const rsp = await raw.exec(`
try:
 s=os.stat(${pyPath(path)})
 print(('d' if s[0] & 0x4000 else 'f')+'|'+str(s[6]))
except OSError:
 print('-')
`)
    const out = rsp.trim()
    if (out === '-') { return null }
    const [type, size] = out.split('|')
    return { type, size: parseInt(size, 10) }
}

export async function exists(raw, path) {
    return (await statPath(raw, path)) !== null
}

/* Directory entries, hex-encoded so that names containing '|', newlines or control
 * characters survive the transport intact. */
export async function listNames(raw, dir) {
    const rsp = await raw.exec(`
for n in os.listdir(${pyPath(dir)}):
 print(''.join('%02x' % b for b in n.encode()))
`)
    return rsp.split('\n').map(l => l.trim()).filter(l => l).map(hexToStr)
}

export async function mkdirp(raw, path) {
    await raw.exec(`
p=''
for d in ${pyPath(path)}.split('/'):
 if not d: continue
 p += '/'+d
 try: os.mkdir(p)
 except OSError: pass
`)
}

export async function rmTree(raw, path) {
    await raw.exec(`
def _rm(p):
 try: s=os.stat(p)
 except OSError: return
 if s[0] & 0x4000:
  for n in os.listdir(p):
   _rm(p+'/'+n)
  os.rmdir(p)
 else:
  os.remove(p)
_rm(${pyPath(path)})
`, 30000)
}

/* Flat recursive listing of a subtree: [{ path, type, size }] */
export async function listTree(raw, path) {
    const rsp = await raw.exec(`
def _w(p):
 try: l=os.listdir(p)
 except OSError: return
 for n in l:
  fn=p+'/'+n
  try: s=os.stat(fn)
  except OSError: continue
  t='d' if s[0] & 0x4000 else 'f'
  print(t+'|'+str(s[6])+'|'+''.join('%02x' % b for b in fn.encode()))
  if t=='d': _w(fn)
_w(${pyPath(path)})
`, 30000)
    return rsp.split('\n').map(l => l.trim()).filter(l => l).map(line => {
        const [type, size, hex] = line.split('|')
        return { type, size: parseInt(size, 10), path: hexToStr(hex) }
    })
}

export { MpRawMode }
