// التحقق بخطوتين (TOTP, RFC 6238) لتطبيقات Google Authenticator / Microsoft Authenticator / Authy
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from './db.mjs'
import { sha256 } from './lib.mjs'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}
function base32Decode(str) {
  const clean = str.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out = []
  for (const c of clean) {
    const i = B32.indexOf(c)
    if (i < 0) continue
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function hotp(secret, counter) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const o = h[h.length - 1] & 15
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

const lastStep = new Map() // منع إعادة استعمال نفس الرمز
/** بيرجع true إذا الرمز صح (بيسمح بفرق 30 ثانية قبل/بعد) */
export function verifyTotp(secret, code, subject) {
  const c = String(code || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(c)) return false
  const step = Math.floor(Date.now() / 30000)
  for (const d of [0, -1, 1]) {
    const s = step + d
    const exp = hotp(secret, s)
    if (timingSafeEqual(Buffer.from(exp), Buffer.from(c))) {
      if (subject && (lastStep.get(subject) ?? -1) >= s) return false
      if (subject) lastStep.set(subject, s)
      return true
    }
  }
  return false
}

export const newSecret = () => base32Encode(randomBytes(20))
export const otpauthUri = (secret, label) =>
  `otpauth://totp/${encodeURIComponent(`ZAPP Admin:${label}`)}?secret=${secret}&issuer=ZAPP%20Admin&algorithm=SHA1&digits=6&period=30`

export const getMfa = (subject) => db.prepare('SELECT * FROM admin_mfa WHERE subject = ?').get(subject)

/** رموز احتياطية لمرة وحدة (إذا ضاع الموبايل) */
export function newRecoveryCodes() {
  const codes = Array.from({ length: 8 }, () => {
    const r = randomBytes(5).toString('hex').toUpperCase()
    return `${r.slice(0, 5)}-${r.slice(5)}`
  })
  return { codes, hashed: codes.map((c) => sha256(c.replace('-', ''))) }
}

/** يتحقق من رمز التطبيق أو رمز احتياطي (والاحتياطي بينحذف بعد استعماله) */
export function checkSecondFactor(subject, code) {
  const row = getMfa(subject)
  if (!row) return true
  if (verifyTotp(row.secret, code, subject)) return true
  const norm = String(code || '').toUpperCase().replace(/[^A-F0-9]/g, '')
  if (norm.length !== 10) return false
  const list = JSON.parse(row.recovery || '[]')
  const h = sha256(norm)
  const i = list.indexOf(h)
  if (i < 0) return false
  list.splice(i, 1)
  db.prepare('UPDATE admin_mfa SET recovery = ? WHERE subject = ?').run(JSON.stringify(list), subject)
  return 'recovery'
}
