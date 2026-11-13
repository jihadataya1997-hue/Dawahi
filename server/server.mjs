// سيرفر ضواحي — Node.js بدون مكتبات خارجية
// تشغيل: node server/server.mjs   (المنفذ PORT، مكان البيانات DATA_DIR)
import { createServer } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, getSettings, UPLOADS_DIR } from './db.mjs'

const PORT = Number(process.env.PORT || 3000)
const MAX_BODY = 4 * 1024 * 1024 // 4MB (يشمل صورة مضغوطة)
const MAX_PHOTO = 2.5 * 1024 * 1024

// منطقة الخدمة: دائرة حول ضاحية قدسيا
const SERVICE_CENTER = { lat: 33.5335, lng: 36.2235 }
const SERVICE_RADIUS_KM = 25

const CATEGORIES = ['any', 'restaurants', 'supermarket', 'pharmacy', 'library', 'diesel', 'other']
const FINAL = ['delivered', 'cancelled']

/* ───────── أدوات مساعدة ───────── */

class HttpError extends Error {
  constructor(status, code, message, field) {
    super(message)
    Object.assign(this, { status, code, field })
  }
}
const bad = (code, message, field) => new HttpError(422, code, message, field)

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const now = () => new Date().toISOString()
const isPhone = (p) => typeof p === 'string' && /^09\d{8}$/.test(p)
const str = (v, max, field, { required = false } = {}) => {
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

function distanceKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function clientIp(req) {
  // Caddy يضع IP الزبون الحقيقي أول قيمة في X-Forwarded-For
  const xff = req.headers['x-forwarded-for']
  return (typeof xff === 'string' && xff.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown'
}

// حدّ بسيط لعدد الطلبات (بالذاكرة) لمنع الإساءة
const buckets = new Map()
function rateLimit(key, limit, windowMs) {
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

async function readJson(req) {
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

function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(data)
}

/* ───────── الحسابات والجلسات ───────── */

function authenticate(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token || token.length > 200) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  const row = db
    .prepare(
      `SELECT c.id, c.name, c.phone, s.token_hash FROM sessions s
       JOIN customers c ON c.id = s.customer_id WHERE s.token_hash = ?`
    )
    .get(sha256(token))
  if (!row) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now(), row.token_hash)
  return { id: row.id, name: row.name, phone: row.phone, tokenHash: row.token_hash }
}

const publicUser = (u) => ({ id: u.id, name: u.name, phone: u.phone })

/* ───────── الطلبات ───────── */

function toOrder(r, events) {
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(events ? { events } : {}),
  }
}

async function savePhoto(dataUrl) {
  if (dataUrl == null || dataUrl === '') return null
  const m = typeof dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw bad('INVALID', 'photo must be a JPEG, PNG or WebP image', 'photo')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > MAX_PHOTO) throw bad('TOO_LARGE', 'photo is too large', 'photo')
  const name = `${randomBytes(16).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
  await writeFile(join(UPLOADS_DIR, name), buf)
  return name
}

function validateOrder(body, user) {
  const kind = body.kind
  if (!['custom', 'gas'].includes(kind)) throw bad('INVALID', 'kind must be custom or gas', 'kind')

  const clientKey = str(body.clientKey, 64, 'clientKey', { required: true })
  const loc = body.location || {}
  const lat = Number(loc.lat)
  const lng = Number(loc.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw bad('LOCATION_REQUIRED', 'Pick your location on the map', 'location')
  if (distanceKm(SERVICE_CENTER, { lat, lng }) > SERVICE_RADIUS_KM)
    throw bad('OUT_OF_AREA', 'This location is outside our service area', 'location')

  const floor = Number(body.floor ?? 0)
  if (!Number.isInteger(floor) || floor < 0 || floor > 30) throw bad('INVALID', 'floor is invalid', 'floor')
  const contactPhone = body.contactPhone ? String(body.contactPhone).replace(/\s/g, '') : user.phone
  if (!isPhone(contactPhone)) throw bad('INVALID_PHONE', 'Phone must start with 09 and be 10 digits', 'contactPhone')

  const s = getSettings()
  const base = {
    kind,
    clientKey,
    lat,
    lng,
    floor,
    contactPhone,
    address: str(body.address, 300, 'address'),
    notes: str(body.notes, 500, 'notes'),
    deliveryFee: s.delivery_fee,
  }

  if (kind === 'custom') {
    const category = CATEGORIES.includes(body.category) ? body.category : 'any'
    const items = str(body.items, 2000, 'items')
    if (!items && !body.photo) throw bad('ITEMS_REQUIRED', 'Write your order or attach a photo', 'items')
    const storeMode = body.storeMode === 'specific' ? 'specific' : 'any'
    const storeName = storeMode === 'specific' ? str(body.storeName, 120, 'storeName') : ''
    return { ...base, category, details: { items, storeMode, storeName } }
  }

  // gas
  const qty = Number(body.qty)
  if (![1, 2].includes(qty)) throw bad('INVALID', 'qty must be 1 or 2', 'qty')
  const gasType = body.gasType === 'buy' ? 'buy' : 'swap'
  const elevator = body.elevator !== false
  const stairsFloors = elevator ? 0 : floor
  // نحفظ الأسعار وقت الطلب حتى لو تغيّرت لاحقاً
  const prices = {
    gasPrice: s.gas_price,
    emptyCylinderPrice: gasType === 'buy' ? s.empty_cylinder_price : 0,
    stairsFee: s.stairs_fee_per_floor * stairsFloors * qty,
  }
  const estimate = base.deliveryFee + prices.gasPrice * qty + prices.emptyCylinderPrice * qty + prices.stairsFee
  return { ...base, category: 'gas', details: { qty, gasType, elevator, prices, estimate } }
}

async function createOrder(req, res, user) {
  rateLimit(`order:${user.id}`, 20, 60 * 60 * 1000)
  const body = await readJson(req)
  const o = validateOrder(body, user)

  // نفس الطلب أُرسل قبل؟ نرجّع الموجود بدل ما نكرره
  const existing = db.prepare('SELECT * FROM orders WHERE customer_id = ? AND client_key = ?').get(user.id, o.clientKey)
  if (existing) return send(res, 200, { order: toOrder(existing) })

  const photo = o.kind === 'custom' ? await savePhoto(body.photo) : null
  const ts = now()
  db.exec('BEGIN IMMEDIATE')
  let row
  try {
    const r = db
      .prepare(
        `INSERT INTO orders (customer_id, client_key, kind, category, details, lat, lng, address, floor,
                             contact_phone, notes, photo, delivery_fee, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(user.id, o.clientKey, o.kind, o.category, JSON.stringify(o.details), o.lat, o.lng, o.address, o.floor,
        o.contactPhone, o.notes, photo, o.deliveryFee, ts, ts)
    db.prepare(`INSERT INTO order_events (order_id, status, actor, created_at) VALUES (?, 'new', ?, ?)`).run(
      r.lastInsertRowid, `customer:${user.id}`, ts)
    row = db.prepare('SELECT * FROM orders WHERE id = ?').get(r.lastInsertRowid)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log('info', 'order created', { orderId: row.id, customerId: user.id, kind: row.kind })
  send(res, 201, { order: toOrder(row) })
}

function listOrders(res, user, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 100)
  const rows = db
    .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT ?')
    .all(user.id, limit)
  send(res, 200, { orders: rows.map((r) => toOrder(r)) })
}

function getOrder(res, user, id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ?').get(id, user.id)
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
  const events = db
    .prepare('SELECT status, created_at AS at FROM order_events WHERE order_id = ? ORDER BY id')
    .all(row.id)
  send(res, 200, { order: toOrder(row, events) })
}

function cancelOrder(res, user, id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ?').get(id, user.id)
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
  if (row.status === 'cancelled') return send(res, 200, { order: toOrder(row) })
  // الزبون يقدر يلغي فقط قبل ما يستلمه شب التوصيل
  if (row.status !== 'new') throw new HttpError(409, 'CANNOT_CANCEL', 'Order is already being handled')
  const ts = now()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'new'`).run(ts, row.id)
    db.prepare(`INSERT INTO order_events (order_id, status, actor, created_at) VALUES (?, 'cancelled', ?, ?)`).run(
      row.id, `customer:${user.id}`, ts)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log('info', 'order cancelled', { orderId: row.id, customerId: user.id })
  send(res, 200, { order: toOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(row.id)) })
}

async function getPhoto(res, user, name) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) throw new HttpError(404, 'NOT_FOUND', 'Not found')
  const own = db.prepare('SELECT 1 FROM orders WHERE photo = ? AND customer_id = ?').get(name, user.id)
  if (!own) throw new HttpError(404, 'NOT_FOUND', 'Not found')
  const buf = await readFile(join(UPLOADS_DIR, name))
  const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=86400' })
  res.end(buf)
}

/* ───────── التوجيه ───────── */

async function route(req, res, url) {
  const { pathname } = url
  const m = req.method

  if (m === 'GET' && pathname === '/api/health') {
    db.prepare('SELECT 1').get() // يتأكد أن القاعدة تعمل
    return send(res, 200, { ok: true })
  }

  if (m === 'GET' && pathname === '/api/config') {
    const s = getSettings()
    return send(res, 200, {
      pricing: {
        deliveryFee: s.delivery_fee,
        gasPrice: s.gas_price,
        emptyCylinder: s.empty_cylinder_price,
        stairsPerFloor: s.stairs_fee_per_floor,
      },
      serviceArea: { center: SERVICE_CENTER, radiusKm: SERVICE_RADIUS_KM },
    })
  }

  if (m === 'POST' && pathname === '/api/auth/login') {
    rateLimit(`login:${clientIp(req)}`, 10, 10 * 60 * 1000)
    const body = await readJson(req)
    const name = str(body.name, 60, 'name', { required: true })
    const phone = String(body.phone || '').replace(/\s/g, '')
    if (!isPhone(phone)) throw bad('INVALID_PHONE', 'Phone must start with 09 and be 10 digits', 'phone')
    // ⚠️ مؤقتاً بدون رمز تحقق — الخطوة القادمة: رمز عبر واتساب/SMS قبل إصدار الجلسة
    const ts = now()
    db.prepare(
      `INSERT INTO customers (phone, name, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
    ).run(phone, name, ts, ts)
    const customer = db.prepare('SELECT id, name, phone FROM customers WHERE phone = ?').get(phone)
    const token = randomBytes(32).toString('base64url')
    db.prepare('INSERT INTO sessions (token_hash, customer_id) VALUES (?, ?)').run(sha256(token), customer.id)
    log('info', 'login', { customerId: customer.id })
    return send(res, 200, { token, user: publicUser(customer) })
  }

  // كل ما بعد هذا يحتاج تسجيل دخول
  const user = authenticate(req)

  if (m === 'GET' && pathname === '/api/me') return send(res, 200, { user: publicUser(user) })

  if (m === 'PATCH' && pathname === '/api/me') {
    const body = await readJson(req)
    const name = str(body.name, 60, 'name', { required: true })
    db.prepare('UPDATE customers SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), user.id)
    return send(res, 200, { user: { ...publicUser(user), name } })
  }

  if (m === 'POST' && pathname === '/api/auth/logout') {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(user.tokenHash)
    return send(res, 204)
  }

  if (pathname === '/api/orders') {
    if (m === 'POST') return createOrder(req, res, user)
    if (m === 'GET') return listOrders(res, user, url)
  }

  let mm = /^\/api\/orders\/(\d{1,12})$/.exec(pathname)
  if (mm && m === 'GET') return getOrder(res, user, Number(mm[1]))
  mm = /^\/api\/orders\/(\d{1,12})\/cancel$/.exec(pathname)
  if (mm && m === 'POST') return cancelOrder(res, user, Number(mm[1]))
  mm = /^\/api\/uploads\/([^/]+)$/.exec(pathname)
  if (mm && m === 'GET') return getPhoto(res, user, mm[1])

  throw new HttpError(404, 'NOT_FOUND', 'Not found')
}

function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ ts: now(), level, msg, ...extra }))
}

const server = createServer(async (req, res) => {
  const started = Date.now()
  const reqId = randomUUID().slice(0, 8)
  const url = new URL(req.url, 'http://local')
  try {
    await route(req, res, url)
  } catch (err) {
    if (err instanceof HttpError) {
      send(res, err.status, { error: { code: err.code, message: err.message, field: err.field } })
    } else if (err?.code === 'ENOENT') {
      send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
    } else {
      log('error', 'unhandled error', { reqId, path: url.pathname, err: err?.stack || String(err) })
      send(res, 500, { error: { code: 'INTERNAL', message: 'Something went wrong', reqId } })
    }
  } finally {
    log('info', 'request', { reqId, method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - started })
  }
})

server.requestTimeout = 30_000
server.listen(PORT, () => log('info', 'dawahi api listening', { port: PORT }))

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log('info', 'shutting down', { sig })
    server.close(() => {
      db.close()
      process.exit(0)
    })
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
