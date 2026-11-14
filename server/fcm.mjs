// إشعارات تطبيق الأندرويد (Firebase Cloud Messaging) — بتشتغل بس إذا ملف حساب الخدمة موجود على السيرفر
import { createSign } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { db, DATA_DIR } from './db.mjs'
import { log } from './lib.mjs'

const KEY_FILE = join(DATA_DIR, 'fcm-service-account.json')
let account = null
function loadAccount() {
  if (account) return account
  if (!existsSync(KEY_FILE)) return null
  try {
    const a = JSON.parse(readFileSync(KEY_FILE, 'utf8'))
    if (a.client_email && a.private_key && a.project_id) account = a
  } catch (err) {
    log('warn', 'fcm key file invalid', { err: String(err) })
  }
  return account
}
export const fcmEnabled = () => !!loadAccount()

const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url')
let cached = { token: null, exp: 0 }
async function accessToken() {
  const a = loadAccount()
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token
  const now = Math.floor(Date.now() / 1000)
  const head = b64u({ alg: 'RS256', typ: 'JWT' })
  const body = b64u({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(a.private_key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(`oauth ${res.status} ${JSON.stringify(d).slice(0, 200)}`)
  cached = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 }
  return cached.token
}

export function saveNativeToken(ownerType, ownerId, token) {
  db.prepare(
    `INSERT INTO native_push_tokens (token, owner_type, owner_id, platform, updated_at) VALUES (?, ?, ?, 'android', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(token) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id, updated_at = excluded.updated_at`
  ).run(token, ownerType, ownerId)
}
export const removeNativeToken = (token) => db.prepare('DELETE FROM native_push_tokens WHERE token = ?').run(token)
export const hasNativeToken = (ownerType, ownerId) =>
  !!db.prepare('SELECT 1 FROM native_push_tokens WHERE owner_type = ? AND owner_id = ?').get(ownerType, ownerId)

/** يرسل لكل أجهزة الأندرويد تبع صاحب الحساب. ما بيرمي أخطاء */
export function notifyNative(ownerType, ownerId, payload) {
  const a = loadAccount()
  if (!a) return 0
  const rows = db.prepare('SELECT token FROM native_push_tokens WHERE owner_type = ? AND owner_id = ?').all(ownerType, ownerId)
  for (const { token } of rows) {
    accessToken()
      .then((at) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body || '' },
              data: { url: payload.url || '/', tag: payload.tag || '' },
              android: { priority: 'HIGH', ttl: '21600s', notification: { channel_id: 'zapp_orders', tag: payload.tag || undefined, color: '#4B1FE0' } },
            },
          }),
        })
      )
      .then(async (res) => {
        if (res.ok) return log('info', 'fcm sent', { ownerType, ownerId })
        const t = await res.text()
        if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(t)) {
          removeNativeToken(token)
          log('info', 'fcm token removed', { ownerType, ownerId })
        } else log('warn', 'fcm failed', { status: res.status, body: t.slice(0, 200) })
      })
      .catch((err) => log('warn', 'fcm error', { err: String(err).slice(0, 200) }))
  }
  return rows.length
}
