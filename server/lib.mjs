// أدوات مشتركة بين واجهة الزبون وواجهة الإدارة
import { createHash } from 'node:crypto'

const MAX_BODY = 4 * 1024 * 1024 // 4MB (يشمل صورة مضغوطة)

/* ───────── أدوات مساعدة ───────── */

export class HttpError extends Error {
  constructor(status, code, message, field) {
    super(message)
    Object.assign(this, { status, code, field })
  }
}
export const bad = (code, message, field) => new HttpError(422, code, message, field)

export const sha256 = (s) => createHash('sha256').update(s).digest('hex')
export const now = () => new Date().toISOString()
export const isPhone = (p) => typeof p === 'string' && /^09\d{8}$/.test(p)
export const str = (v, max, field, { required = false } = {}) => {
  if (v == null || v === '') {
    if (required) throw bad('REQUIRED', `${field} is required`, field)
    return ''
  }
  if (typeof v !== 'string') throw bad('INVALID', `${field} must be text`, field)
  const t = v.trim()
  if (required && !t) throw bad('REQUIRED', `${field} is required`, field)
  if (t.length > max) throw bad('TOO_LONG', `${field} is too long`, field)
  return t
}

export function distanceKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function clientIp(req) {
  // Caddy يضع IP الزبون الحقيقي أول قيمة في X-Forwarded-For
  const xff = req.headers['x-forwarded-for']
  return (typeof xff === 'string' && xff.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown'
}

// حدّ بسيط لعدد الطلبات (بالذاكرة) لمنع الإساءة
export const buckets = new Map()
export function rateLimit(key, limit, windowMs) {
  const t = Date.now()
  const b = buckets.get(key)
  if (!b || t > b.reset) {
    buckets.set(key, { count: 1, reset: t + windowMs })
    return
  }
  if (++b.count > limit) throw new HttpError(429, 'RATE_LIMITED', 'Too many requests, try again later')
}
setInterval(() => {
  const t = Date.now()
  for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k)
}, 60_000).unref()

export async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BODY) throw new HttpError(413, 'TOO_LARGE', 'Request is too large')
    chunks.push(c)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Invalid JSON')
  }
}

export function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(data)
}


export function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ ts: now(), level, msg, ...extra }))
}

// شكل الطلب الذي يُرسل للتطبيق
export function toOrder(r, events) {
  return {
    id: r.id,
    number: `D-${1000 + r.id}`,
    kind: r.kind,
    status: r.status,
    category: r.category,
    details: JSON.parse(r.details),
    location: { lat: r.lat, lng: r.lng },
    address: r.address,
    floor: r.floor,
    contactPhone: r.contact_phone,
    notes: r.notes,
    hasPhoto: !!r.photo,
    deliveryFee: r.delivery_fee,
    courierName: r.courier_name || '',
    courierId: r.courier_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(events ? { events } : {}),
  }
}

// رمز الدخول (PIN) لشباب التوصيل — يُخزّن مشفّراً فقط
import { randomBytes as _rb, scryptSync, timingSafeEqual as _tse } from 'node:crypto'
export const isPin = (p) => typeof p === 'string' && /^\d{4,6}$/.test(p)
export function hashPin(pin) {
  const salt = _rb(16).toString('hex')
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`
}
export function verifyPin(pin, stored) {
  if (!isPin(pin) || typeof stored !== 'string' || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  return _tse(Buffer.from(hash, 'hex'), scryptSync(pin, salt, 32))
}

// كلمات سر فريق الإدارة (8 أحرف على الأقل) — تُخزّن مشفّرة فقط
export const isPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 100
export function hashSecret(secret) {
  const salt = _rb(16).toString('hex')
  return `${salt}:${scryptSync(secret, salt, 32).toString('hex')}`
}
export function verifySecret(secret, stored) {
  if (typeof secret !== 'string' || !secret || typeof stored !== 'string' || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  return _tse(Buffer.from(hash, 'hex'), scryptSync(secret, salt, 32))
}

// الاسم الكامل: الاسم والكنية على الأقل (كلمتان، كل كلمة حرفان أو أكثر)
export const isFullName = (n) => typeof n === 'string' && n.trim().split(/\s+/).filter((w) => w.length >= 2).length >= 2
