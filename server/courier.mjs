// واجهة تطبيق شب التوصيل — كل المسارات تحت /api/courier/
import { awardPoints } from './promo.mjs'
import { courierLocation } from './live.mjs'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, getSettings, UPLOADS_DIR } from './db.mjs'
import { HttpError, sha256, now, clientIp, rateLimit, readJson, send, log, toOrder, verifyPin } from './lib.mjs'
import { hasSubscription, notify, removeSubscription, saveSubscription } from './push.mjs'
import { acceptOffer, courierLoad, declineOffer, nudge } from './dispatch.mjs'

// الشب يقدر يحرّك الطلب للأمام فقط
const NEXT = {
  assigned: ['buying', 'on_the_way'],
  buying: ['on_the_way'],
  on_the_way: ['delivered'],
}
const STATUS_AR = {
  buying: 'عامل التوصيل يشتري أغراضك الآن',
  on_the_way: 'طلبك في الطريق إليك',
  delivered: 'تم توصيل طلبك',
}

function authCourier(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token || token.length > 200) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  const row = db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.active, c.online, s.token_hash FROM courier_sessions s
       JOIN couriers c ON c.id = s.courier_id WHERE s.token_hash = ?`
    )
    .get(sha256(token))
  if (!row || !row.active) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  return row
}

const forCourier = (r) => ({
  ...toOrder(r),
  customer: { name: r.customer_name },
  hasPhoto: !!r.photo,
  photo: r.photo || null,
})

const Q = `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id`

// محرك الطرقات (OSRM على نفس السيرفر) — المسار الفعلي على الطرق
const OSRM_URL = process.env.OSRM_URL || 'http://dawahi-osrm:5000'
async function roadLeg(a, b) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
  try {
    const r = await fetch(
      `${OSRM_URL}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&steps=false`,
      { signal: ctrl.signal }
    )
    const d = await r.json()
    const route = d.routes?.[0]
    if (d.code !== 'Ok' || !route) throw new Error(d.code || 'no route')
    // GeoJSON بيرجع [lng, lat] — منقلبها لـ [lat, lng] للخريطة
    return { road: true, distanceKm: route.distance / 1000, minutes: route.duration / 60, path: route.geometry.coordinates.map(([x, y]) => [y, x]) }
  } catch {
    // إذا محرك الطرقات ما ردّ: خط مستقيم كبديل
    return { road: false, path: [[a.lat, a.lng], [b.lat, b.lng]] }
  } finally {
    clearTimeout(t)
  }
}
const validPoint = (p) => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180

export async function courierRoute(req, res, url) {
  const { pathname } = url
  const m = req.method

  if (m === 'POST' && pathname === '/api/courier/login') {
    rateLimit(`courier-login:${clientIp(req)}`, 8, 15 * 60 * 1000)
    const body = await readJson(req)
    const phone = String(body.phone || '').replace(/\s/g, '')
    const pin = String(body.pin || '')
    const c = db.prepare('SELECT id, name, phone, pin_hash, active FROM couriers WHERE phone = ?').get(phone)
    if (!c || !c.active || !verifyPin(pin, c.pin_hash)) {
      log('warn', 'courier login failed', { ip: clientIp(req) })
      throw new HttpError(401, 'WRONG_LOGIN', 'Wrong phone or PIN')
    }
    const token = randomBytes(32).toString('base64url')
    db.prepare('INSERT INTO courier_sessions (token_hash, courier_id) VALUES (?, ?)').run(sha256(token), c.id)
    log('info', 'courier login', { courierId: c.id })
    return send(res, 200, { token, courier: { id: c.id, name: c.name, phone: c.phone } })
  }

  const me = authCourier(req)

  if (m === 'GET' && pathname === '/api/courier/me') {
    return send(res, 200, {
      courier: { id: me.id, name: me.name, phone: me.phone, online: !!me.online },
      push: hasSubscription('courier', me.id),
      load: courierLoad(me.id),
      max: getSettings().max_orders_per_courier,
    })
  }

  // موقع العامل للمراقبة الحية
  if (m === 'POST' && pathname === '/api/courier/location') return courierLocation(req, res, me)

  // متاح / غير متاح لاستقبال الطلبات
  if (m === 'POST' && pathname === '/api/courier/online') {
    const { online } = await readJson(req)
    db.prepare('UPDATE couriers SET online = ?, missed_offers = 0 WHERE id = ?').run(online ? 1 : 0, me.id)
    log('info', 'courier availability', { courierId: me.id, online: !!online })
    if (online) nudge()
    return send(res, 200, { online: !!online })
  }

  // العروض: طلبات معروضة عليه بانتظار قبوله
  if (m === 'GET' && pathname === '/api/courier/offers') {
    const rows = db
      .prepare(
        `SELECT f.id AS offer_id, f.expires_at, o.* FROM order_offers f JOIN orders o ON o.id = f.order_id
         WHERE f.courier_id = ? AND f.status = 'pending' AND f.expires_at > ? ORDER BY f.id`
      )
      .all(me.id, now())
    return send(res, 200, {
      serverTime: now(),
      offers: rows.map((r) => {
        const o = toOrder(r)
        // قبل القبول: ما منعطي رقم الزبون ولا عنوانه التفصيلي
        return {
          offerId: r.offer_id,
          expiresAt: r.expires_at,
          order: { id: o.id, number: o.number, kind: o.kind, category: o.category, details: o.details, location: o.location, floor: o.floor, hasPhoto: o.hasPhoto, createdAt: o.createdAt },
        }
      }),
    })
  }
  let om = /^\/api\/courier\/offers\/(\d{1,12})\/(accept|decline)$/.exec(pathname)
  if (om && m === 'POST') {
    if (om[2] === 'decline') {
      declineOffer(Number(om[1]), me)
      return send(res, 200, { ok: true })
    }
    const r = acceptOffer(Number(om[1]), me)
    if (r.error) {
      const msg = { NOT_FOUND: 'Offer not found', OFFER_GONE: 'Order was taken', OFFER_EXPIRED: 'Offer expired', TOO_MANY: 'You have too many orders' }[r.error]
      throw new HttpError(r.error === 'NOT_FOUND' ? 404 : 409, r.error, msg)
    }
    return send(res, 200, { orderId: r.orderId })
  }

  if (m === 'POST' && pathname === '/api/courier/logout') {
    db.prepare('DELETE FROM courier_sessions WHERE token_hash = ?').run(me.token_hash)
    if (!db.prepare('SELECT 1 FROM courier_sessions WHERE courier_id = ?').get(me.id))
      db.prepare('UPDATE couriers SET online = 0 WHERE id = ?').run(me.id)
    return send(res, 204)
  }

  if (pathname === '/api/courier/push') {
    const body = await readJson(req)
    if (m === 'POST') {
      saveSubscription('courier', me.id, body.subscription)
      return send(res, 200, { ok: true })
    }
    if (m === 'DELETE') {
      removeSubscription(body.endpoint)
      return send(res, 204)
    }
  }

  if (m === 'POST' && pathname === '/api/courier/push/test') {
    const n = notify('courier', me.id, {
      title: 'ZAPP: تجربة الإشعارات ✅',
      body: 'الإشعارات تعمل. سيصلك إشعار مثل هذا مع كل طلب جديد.',
      url: '/driver',
      tag: 'test',
    })
    return send(res, 200, { devices: n })
  }

  // المسار على الطرقات بين نقاط متتالية (موقع العامل ثم محطات التوصيل)
  if (m === 'POST' && pathname === '/api/courier/route') {
    rateLimit(`route:${me.id}`, 60, 60 * 1000)
    const { points } = await readJson(req)
    if (!Array.isArray(points) || points.length < 2 || points.length > 8 || !points.every(validPoint))
      throw new HttpError(422, 'INVALID', 'points must be 2-8 locations')
    const pts = points.map((p) => ({ lat: +p.lat, lng: +p.lng }))
    const legs = await Promise.all(pts.slice(1).map((p, i) => roadLeg(pts[i], p)))
    return send(res, 200, { legs })
  }

  if (m === 'GET' && pathname === '/api/courier/orders') {
    const group = url.searchParams.get('group') === 'done' ? 'done' : 'active'
    const rows =
      group === 'active'
        ? db.prepare(`${Q} WHERE o.courier_id = ? AND o.status IN ('assigned','buying','on_the_way') ORDER BY o.id`).all(me.id)
        : db.prepare(`${Q} WHERE o.courier_id = ? AND o.status IN ('delivered','cancelled') ORDER BY o.id DESC LIMIT 30`).all(me.id)
    return send(res, 200, { orders: rows.map(forCourier) })
  }

  let mm = /^\/api\/courier\/orders\/(\d{1,12})\/status$/.exec(pathname)
  if (mm && m === 'POST') {
    const id = Number(mm[1])
    const { status: to } = await readJson(req)
    const row = db.prepare('SELECT * FROM orders WHERE id = ? AND courier_id = ?').get(id, me.id)
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
    if (!NEXT[row.status]?.includes(to)) throw new HttpError(409, 'BAD_TRANSITION', `Cannot move from ${row.status} to ${to}`)
    const ts = now()
    db.exec('BEGIN IMMEDIATE')
    try {
      const r = db
        .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ? AND courier_id = ?')
        .run(to, ts, id, row.status, me.id)
      if (r.changes !== 1) throw new HttpError(409, 'CHANGED', 'Order was changed, refresh')
      db.prepare('INSERT INTO order_events (order_id, status, actor, created_at) VALUES (?, ?, ?, ?)').run(
        id, to, `courier:${me.id}`, ts)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    log('info', 'order status changed by courier', { orderId: id, courierId: me.id, from: row.status, to })
    notify('customer', row.customer_id, {
      title: `ZAPP: الطلب D-${1000 + id}`,
      body: STATUS_AR[to],
      url: '/',
      tag: `order-${id}`,
    })
    if (to === 'delivered') nudge() // صار عندو مكان لطلب جديد
    if (to === 'delivered') awardPoints(id)
    if (to === 'delivered')
      notify('admin', 0, { title: `✅ تم توصيل D-${1000 + id}`, body: `بواسطة ${me.name}`, url: '/admin', tag: `order-${id}` })
    return send(res, 200, { order: forCourier(db.prepare(`${Q} WHERE o.id = ?`).get(id)) })
  }

  mm = /^\/api\/courier\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp))$/.exec(pathname)
  if (mm && m === 'GET') {
    const own = db.prepare('SELECT 1 FROM orders WHERE photo = ? AND courier_id = ?').get(mm[1], me.id)
    if (!own) throw new HttpError(404, 'NOT_FOUND', 'Not found')
    const buf = await readFile(join(UPLOADS_DIR, mm[1]))
    res.writeHead(200, { 'content-type': mm[1].endsWith('.png') ? 'image/png' : mm[1].endsWith('.webp') ? 'image/webp' : 'image/jpeg', 'cache-control': 'private, max-age=86400' })
    return res.end(buf)
  }

  throw new HttpError(404, 'NOT_FOUND', 'Not found')
}

