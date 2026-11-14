// سيرفر ضواحي — Node.js بدون مكتبات خارجية
// تشغيل: node server/server.mjs   (المنفذ PORT، مكان البيانات DATA_DIR)
import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, getSettings, UPLOADS_DIR } from './db.mjs'
import { HttpError, bad, sha256, now, isPhone, isFullName, str, distanceKm, clientIp, rateLimit, readJson, send, log, hashSecret, verifySecret } from './lib.mjs'
import { adminRoute } from './admin.mjs'
import { presenceRoute } from './live.mjs'
import { addressesRoute } from './addresses.mjs'
import { removeNativeToken, saveNativeToken } from './fcm.mjs'
const NOISY = new Set(['/api/presence', '/api/courier/location', '/api/admin/live'])
import { toOrder } from './lib.mjs'
import { priceCart, publicStores } from './stores.mjs'
import { applyPerks, recordPerks, releasePerks, customerPromoRoute } from './promo.mjs'
import { scheduleBackups } from './backup.mjs'
import { courierRoute } from './courier.mjs'
import { assertOrderingOpen, currentDeliveryFee, listAnnouncements, publicApp, serveMedia } from './content.mjs'
import { cancelOffers, dispatchOrder, startDispatcher } from './dispatch.mjs'
import { VAPID_PUBLIC_KEY, notify, removeSubscription, saveSubscription } from './push.mjs'

const PORT = Number(process.env.PORT || 3000)
const MAX_PHOTO = 2.5 * 1024 * 1024

// منطقة الخدمة: دائرة حول ضاحية قدسيا
const SERVICE_CENTER = { lat: 33.5335, lng: 36.2235 }
const SERVICE_RADIUS_KM = 25

const CATEGORIES = ['any', 'restaurants', 'supermarket', 'pharmacy', 'library', 'diesel', 'other']
const FINAL = ['delivered', 'cancelled']

/* ───────── الحسابات والجلسات ───────── */

function authenticate(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token || token.length > 200) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  const row = db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.blocked, c.must_set_password, c.password_hash, s.token_hash FROM sessions s
       JOIN customers c ON c.id = s.customer_id WHERE s.token_hash = ?`
    )
    .get(sha256(token))
  if (!row) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  if (row.blocked) throw new HttpError(403, 'BLOCKED', 'This account is suspended')
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now(), row.token_hash)
  return { id: row.id, name: row.name, phone: row.phone, must_set_password: row.must_set_password, password_hash: row.password_hash, tokenHash: row.token_hash }
}

const publicUser = (u) => ({ id: u.id, name: u.name, phone: u.phone, mustSetPassword: !!u.must_set_password || u.password_hash === null })
const isCustomerPassword = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 100
function newSession(customerId) {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token_hash, customer_id) VALUES (?, ?)').run(sha256(token), customerId)
  return token
}

/* ───────── الطلبات ───────── */


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
  // التطبيق بالصيانة أو الخدمة متوقفة مؤقتاً؟
  const category = kind === 'gas' ? 'gas' : CATEGORIES.includes(body.category) ? body.category : 'any'
  assertOrderingOpen(category)
  const fee = currentDeliveryFee(s)
  const base = {
    kind,
    clientKey,
    lat,
    lng,
    floor,
    contactPhone,
    address: str(body.address, 300, 'address'),
    notes: str(body.notes, 500, 'notes'),
    deliveryFee: fee.fee,
    peakExtra: fee.extra,
  }

  // طلب من مطعم شريك: الأصناف والأسعار من القائمة
  if (kind === 'custom' && body.storeId) {
    const c = priceCart(body.storeId, body.cart)
    const extra = str(body.items, 500, 'items')
    return {
      ...base,
      category: 'restaurants',
      details: {
        items: extra ? `${c.text}\n— ${extra}` : c.text,
        storeMode: 'specific',
        storeName: c.storeName,
        storeId: c.storeId,
        cart: c.lines,
        itemsTotal: c.total,
        ...(base.peakExtra ? { peakExtra: base.peakExtra } : {}),
      },
    }
  }

  if (kind === 'custom') {
    const category = CATEGORIES.includes(body.category) ? body.category : 'any'
    const items = str(body.items, 2000, 'items')
    if (!items && !body.photo) throw bad('ITEMS_REQUIRED', 'Write your order or attach a photo', 'items')
    const storeMode = body.storeMode === 'specific' ? 'specific' : 'any'
    const storeName = storeMode === 'specific' ? str(body.storeName, 120, 'storeName') : ''
    return { ...base, category, details: { items, storeMode, storeName, ...(base.peakExtra ? { peakExtra: base.peakExtra } : {}) } }
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
  // سعر ما حددته الإدارة (صفر) → بيتحدد وقت التوصيل
  const priceUnknown = !prices.gasPrice || (gasType === 'buy' && !prices.emptyCylinderPrice) || (stairsFloors > 0 && !s.stairs_fee_per_floor)
  return { ...base, category: 'gas', details: { qty, gasType, elevator, prices, estimate, ...(priceUnknown ? { priceUnknown: true } : {}), ...(base.peakExtra ? { peakExtra: base.peakExtra } : {}) } }
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
    // كود حسم أو نقاط → بتنزل من أجرة التوصيل
    const perks = applyPerks(o, body, user.id)
    if (perks.perk) {
      o.details.perk = perks.perk
      if (o.kind === 'gas') o.details.estimate -= o.deliveryFee - perks.fee
      o.deliveryFee = perks.fee
    }
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
    recordPerks(Number(r.lastInsertRowid), user.id, perks)
    row = db.prepare('SELECT * FROM orders WHERE id = ?').get(r.lastInsertRowid)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log('info', 'order created', { orderId: row.id, customerId: user.id, kind: row.kind })
  notify('admin', 0, {
    title: `🔔 طلب جديد D-${1000 + row.id}`,
    body: `${user.name}: ${o.kind === 'gas' ? `غاز (${o.details.qty} جرة)` : (o.details.items || 'طلب مرفق بصورة').slice(0, 80)}`,
    url: '/admin',
    tag: `order-${row.id}`,
  })
  send(res, 201, { order: toOrder(row) })
  // توزيع فوري على أنسب شب
  setImmediate(() => {
    try {
      dispatchOrder(row.id)
    } catch (err) {
      log('error', 'dispatch failed', { orderId: row.id, err: err?.stack || String(err) })
    }
  })
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
    releasePerks(row.id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  cancelOffers(row.id)
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

  // حساب جديد: الاسم الكامل + الرقم + كلمة سر. الرقم ما بيتسجّل مرتين
  if (m === 'POST' && pathname === '/api/auth/register') {
    rateLimit(`register:${clientIp(req)}`, 8, 60 * 60 * 1000)
    const body = await readJson(req)
    const name = str(body.name, 60, 'name', { required: true }).replace(/\s+/g, ' ')
    if (!isFullName(name)) throw bad('FULL_NAME', 'Please enter your full name (first and last name)', 'name')
    const phone = String(body.phone || '').replace(/\s/g, '')
    if (!isPhone(phone)) throw bad('INVALID_PHONE', 'Phone must start with 09 and be 10 digits', 'phone')
    if (!isCustomerPassword(body.password)) throw bad('WEAK_PASSWORD', 'Password must be at least 6 characters', 'password')
    if (db.prepare('SELECT 1 FROM customers WHERE phone = ?').get(phone))
      throw new HttpError(409, 'PHONE_TAKEN', 'This phone is already registered, please sign in')
    const ts = now()
    const r = db
      .prepare('INSERT INTO customers (phone, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(phone, name, hashSecret(body.password), ts, ts)
    const customer = db.prepare('SELECT id, name, phone, must_set_password FROM customers WHERE id = ?').get(r.lastInsertRowid)
    log('info', 'register', { customerId: customer.id })
    return send(res, 200, { token: newSession(customer.id), user: publicUser(customer) })
  }

  // تسجيل الدخول: الرقم + كلمة السر
  if (m === 'POST' && pathname === '/api/auth/login') {
    rateLimit(`login:${clientIp(req)}`, 15, 10 * 60 * 1000)
    const body = await readJson(req)
    const phone = String(body.phone || '').replace(/\s/g, '')
    if (!isPhone(phone)) throw bad('INVALID_PHONE', 'Phone must start with 09 and be 10 digits', 'phone')
    rateLimit(`login-phone:${phone}`, 8, 15 * 60 * 1000)
    const c = db.prepare('SELECT id, name, phone, blocked, password_hash, must_set_password FROM customers WHERE phone = ?').get(phone)
    if (!c) throw new HttpError(404, 'NOT_REGISTERED', 'No account with this phone, please register')
    if (c.blocked) throw new HttpError(403, 'BLOCKED', 'This account is suspended')
    if (c.password_hash) {
      if (!verifySecret(String(body.password || ''), c.password_hash)) throw new HttpError(400, 'WRONG_PASSWORD', 'Wrong password')
    } else {
      // حساب قديم من قبل كلمات السر: بيفوت هالمرة وبيطلب منه يحط كلمة سر فوراً
      db.prepare('UPDATE customers SET must_set_password = 1 WHERE id = ?').run(c.id)
      c.must_set_password = 1
    }
    log('info', 'login', { customerId: c.id })
    return send(res, 200, { token: newSession(c.id), user: publicUser(c) })
  }

  // نبضة الحضور من التطبيقات (بدون تسجيل دخول)
  if (m === 'POST' && pathname === '/api/presence') return presenceRoute(req, res)

  if (m === 'GET' && pathname === '/api/push/key') return send(res, 200, { key: VAPID_PUBLIC_KEY })

  // إعدادات التطبيق العامة: النصوص، الخدمات، الإعلانات، الأسعار، العملة
  if (m === 'GET' && pathname === '/api/app') return send(res, 200, publicApp())
  const media = /^\/api\/media\/([^/]+)$/.exec(pathname)
  if (media && m === 'GET') return serveMedia(res, media[1])

  // تطبيق شب التوصيل — له تسجيل دخول خاص
  if (pathname.startsWith('/api/courier/')) return courierRoute(req, res, url)

  // واجهة الإدارة (لوحة التحكم) — لها تسجيل دخول خاص
  if (pathname.startsWith('/api/admin/')) return adminRoute(req, res, url)

  // كل ما بعد هذا يحتاج تسجيل دخول
  const user = authenticate(req)

  if (m === 'GET' && pathname === '/api/me') return send(res, 200, { user: publicUser(user) })

  // المطاعم الشريكة المنشورة (فاضية لحين ما الإدارة تنشر مطعم)
  if (m === 'GET' && pathname === '/api/stores') return send(res, 200, { stores: publicStores() })

  // النقاط وفحص كود الحسم
  if (await customerPromoRoute(req, res, url, user)) return

  // عناوين الزبون المحفوظة
  if (pathname === '/api/addresses' || pathname.startsWith('/api/addresses/')) return addressesRoute(req, res, url, user)

  // صندوق الإشعارات العامة داخل التطبيق
  if (m === 'GET' && pathname === '/api/announcements') return send(res, 200, { announcements: listAnnouncements() })

  if (m === 'PATCH' && pathname === '/api/me') {
    const body = await readJson(req)
    const name = str(body.name, 60, 'name', { required: true }).replace(/\s+/g, ' ')
    if (!isFullName(name)) throw bad('FULL_NAME', 'Please enter your full name (first and last name)', 'name')
    db.prepare('UPDATE customers SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), user.id)
    return send(res, 200, { user: { ...publicUser(user), name } })
  }

  // تنبيهات الزبون (تغيّر حالة طلبه)
  if (pathname === '/api/push') {
    const body = await readJson(req)
    if (m === 'POST') {
      saveSubscription('customer', user.id, body.subscription)
      return send(res, 200, { ok: true })
    }
    if (m === 'DELETE') {
      removeSubscription(body.endpoint)
      return send(res, 204)
    }
  }

  // تطبيق الأندرويد: رمز جهاز Firebase
  if (pathname === '/api/push/native') {
    const body = await readJson(req)
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!/^[\w:.-]{20,4096}$/.test(token)) throw bad('INVALID', 'Invalid device token', 'token')
    if (m === 'POST') {
      saveNativeToken('customer', user.id, token)
      return send(res, 200, { ok: true })
    }
    if (m === 'DELETE') {
      removeNativeToken(token)
      return send(res, 204)
    }
  }

  // تغيير كلمة السر (أو وضعها أول مرة / بعد كلمة مؤقتة من الدعم)
  if (m === 'POST' && pathname === '/api/auth/password') {
    rateLimit(`pass:${user.id}`, 8, 15 * 60 * 1000)
    const body = await readJson(req)
    if (!isCustomerPassword(body.next)) throw bad('WEAK_PASSWORD', 'Password must be at least 6 characters', 'next')
    if (!user.must_set_password && user.password_hash && !verifySecret(String(body.current || ''), user.password_hash))
      throw new HttpError(400, 'WRONG_PASSWORD', 'Current password is wrong')
    db.prepare('UPDATE customers SET password_hash = ?, must_set_password = 0, updated_at = ? WHERE id = ?').run(hashSecret(body.next), now(), user.id)
    // باقي الأجهزة بتطلع من الحساب
    db.prepare('DELETE FROM sessions WHERE customer_id = ? AND token_hash != ?').run(user.id, user.tokenHash)
    return send(res, 200, { user: publicUser({ ...user, must_set_password: 0, password_hash: 'set' }) })
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
    // النبضات المتكررة (الحضور، المواقع، لقطة المراقبة) ما منسجّلها إلا إذا فشلت أو بطئت
    const ms = Date.now() - started
    if (!(NOISY.has(url.pathname) && res.statusCode < 400 && ms < 500))
      log('info', 'request', { reqId, method: req.method, path: url.pathname, status: res.statusCode, ms })
  }
})

server.requestTimeout = 30_000
server.listen(PORT, () => log('info', 'dawahi api listening', { port: PORT }))
scheduleBackups()
startDispatcher()

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
