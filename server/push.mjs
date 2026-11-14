// التنبيهات (Web Push): تصل للموبايل حتى والتطبيق مسكّر
import webpush from 'web-push'
import { db } from './db.mjs'
import { HttpError, bad, log } from './lib.mjs'

function vapidKeys() {
  const get = (k) => db.prepare('SELECT value FROM secrets WHERE key = ?').get(k)?.value
  let pub = get('vapid_public')
  let priv = get('vapid_private')
  if (!pub || !priv) {
    // أول تشغيل: نولّد المفاتيح ونحفظها (لازم تبقى ثابتة وإلا تبطل الاشتراكات)
    const k = webpush.generateVAPIDKeys()
    db.prepare('INSERT OR REPLACE INTO secrets (key, value) VALUES (?, ?)').run('vapid_public', k.publicKey)
    db.prepare('INSERT OR REPLACE INTO secrets (key, value) VALUES (?, ?)').run('vapid_private', k.privateKey)
    ;({ publicKey: pub, privateKey: priv } = k)
    log('info', 'vapid keys generated')
  }
  return { pub, priv }
}

const { pub, priv } = vapidKeys()
webpush.setVapidDetails('https://zapp.prodev.cloud', pub, priv)
export const VAPID_PUBLIC_KEY = pub

export function saveSubscription(ownerType, ownerId, sub) {
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000)
    throw bad('INVALID', 'Invalid subscription', 'subscription')
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100)
    throw bad('INVALID', 'Invalid subscription', 'subscription')
  // نفس الجهاز ممكن يتنقّل بين حسابات: الاشتراك يتبع آخر مستخدم
  db.prepare(
    `INSERT INTO push_subscriptions (owner_type, owner_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET owner_type = excluded.owner_type, owner_id = excluded.owner_id,
       p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(ownerType, ownerId, endpoint, p256dh, auth)
}

export function removeSubscription(endpoint) {
  if (typeof endpoint !== 'string') throw new HttpError(422, 'INVALID', 'endpoint required')
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
}

export const hasSubscription = (ownerType, ownerId) =>
  !!db.prepare('SELECT 1 FROM push_subscriptions WHERE owner_type = ? AND owner_id = ?').get(ownerType, ownerId)

/**
 * يرسل تنبيه لكل أجهزة صاحب الحساب. لا يرمي أخطاء — التنبيه إضافة، ما لازم يوقف العملية الأساسية.
 * payload: { title, body, url, tag }
 */
export function notify(ownerType, ownerId, payload) {
  // تنبيهات الإدارة تصل لكل أجهزة فريق الإدارة (المالك والمشرفين)
  const subs =
    ownerType === 'admin'
      ? db.prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE owner_type = 'admin'`).all()
      : db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE owner_type = ? AND owner_id = ?').all(ownerType, ownerId)
  for (const s of subs) {
    webpush
      .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
        TTL: 6 * 3600, // إذا الموبايل مطفي، يوصل التنبيه خلال 6 ساعات
        urgency: 'high',
        topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
      })
      .then(() => log('info', 'push sent', { ownerType, ownerId, sub: s.id }))
      .catch((err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id)
          log('info', 'push subscription expired, removed', { sub: s.id })
        } else {
          log('warn', 'push failed', { ownerType, ownerId, sub: s.id, status: err.statusCode, err: String(err.body || err.message).slice(0, 200) })
        }
      })
  }
  return subs.length
}
