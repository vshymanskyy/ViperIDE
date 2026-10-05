import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'

// Not encryption - just enough to defeat automatic scanning.
export function generateBlob(text) {
  const KEY_LEN = 8
  const key = randomBytes(KEY_LEN)
  const data = Buffer.from(text, 'utf8')
  const out = Buffer.alloc(KEY_LEN + data.length)
  key.copy(out)
  for (let i = 0; i < data.length; i++) {
    out[KEY_LEN + i] = data[i] ^ key[i % KEY_LEN]
  }
  return out.toString('base64')
}
