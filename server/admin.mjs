// واجهة الإدارة (لوحة التحكم) — كل المسارات تحت /api/admin/
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, getSettings, UPLOADS_DIR } from './db.mjs'
import { HttpError, bad, sha256, now, str, isPhone, isPin, hashPin, clientIp, rateLimit, readJson, send, log, toOrder } from './lib.mjs'
import { hasSubscription, notify, removeSubscription, saveSubscription } from './push.mjs'
import { BACKUP_DIR, isBackupName, listBackups, runBackup } from './backup.mjs'
import { cancelOffers, courierLoad, nudge } from './dispatch.mjs'
import { contentAdminRoute } from './content.mjs'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const SESSION_DAYS = 30

// الانتقالات المسموحة بين حالات الطلب
const NEXT = {
  new: ['assigned', 'cancelled'],
  assigned: ['new', 'buying', 'on_the_way', 'cancelled'],
  buying: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}
const GROUPS = {
  open: ['new', 'assigned', 'buying', 'on_the_way'],
  done: ['delivered'],
  cancelled: ['cancelled'],
}
const SETTING_KEYS = {
  deliveryFee: 'delivery_fee',
  gasPrice: 'gas_price',
  emptyCylinder: 'empty_cylinder_price',
  stairsPerFloor: 'stairs_fee_per_floor',
}
// إعدادات التوزيع التلقائي (مع حدودها المسموحة)
const DISPATCH_KEYS = {
  autoDispatch: ['auto_dispatch', 0, 1],
  offerTimeoutSec: ['offer_timeout_sec', 15, 600],
  maxOrdersPerCourier: ['max_orders_per_courier', 1, 10],
}

function passwordMatches(input) {
  if (!ADMIN_PASSWORD || typeof input !== 'string') return false
  // مقارنة آمنة ضد هجمات التوقيت
  return timingSafeEqual(Buffer.from(sha256(input), 'hex'), Buffer.from(sha256(ADMIN_PASSWORD), 'hex'))
}

function authAdmin(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token || token.length > 200) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  const row = db.prepare('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?').get(sha256(token))
  if (!row || row.expires_at < now()) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  return row.token_hash
}

const ORDER_WITH_CUSTOMER = `
  SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
  FROM orders o JOIN customers c ON c.id = o.customer_id`

const pendingOffer = (orderId) =>
  db
    .prepare(
      `SELECT f.expires_at AS expiresAt, c.name AS courierName FROM order_offers f JOIN couriers c ON c.id = f.courier_id
       WHERE f.order_id = ? AND f.status = 'pending'`
    )
    .get(orderId) || null

const withCustomer = (r, events) => ({
  ...toOrder(r, events),
  offer: r.status === 'new' ? pendingOffer(r.id) : null,
  customer: { name: r.customer_name, phone: r.customer_phone },
  courierPhone: r.courier_phone || '',
  photo: r.photo || null,
})

function damascusMidnightUtc() {
  // دمشق UTC+3 طوال السنة
  const d = new Date(Date.now() + 3 * 3600 * 1000)
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString()
}

export async function adminRoute(req, res, url) {
  const { pathname } = url
  const m = req.method

  if (m === 'POST' && pathname === '/api/admin/login') {
    rateLimit(`admin-login:${clientIp(req)}`, 5, 15 * 60 * 1000)
    if (!ADMIN_PASSWORD) throw new HttpError(503, 'NOT_CONFIGURED', 'Admin password is not set on the server')
    const body = await readJson(req)
    if (!passwordMatches(body.password)) {
      log('warn', 'admin login failed', { ip: clientIp(req) })
      throw new HttpError(401, 'WRONG_PASSWORD', 'Wrong password')
    }
    const token = randomBytes(32).toString('base64url')
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()
    db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now())
    db.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').run(sha256(token), expires)
    log('info', 'admin login', { ip: clientIp(req) })
    return send(res, 200, { token })
  }

  const sessionHash = authAdmin(req)

  if (m === 'POST' && pathname === '/api/admin/logout') {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sessionHash)
    return send(res, 204)
  }

  if (m === 'GET' && pathname === '/api/admin/stats') {
    const since = damascusMidnightUtc()
    const today = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(status = 'delivered') AS delivered,
                SUM(status = 'cancelled') AS cancelled
         FROM orders WHERE created_at >= ?`
      )
      .get(since)
    const open = db
      .prepare(`SELECT COUNT(*) AS n FROM orders WHERE status IN ('new','assigned','buying','on_the_way')`)
      .get().n
    const waiting = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'new'`).get().n
    const customers = db.prepare('SELECT COUNT(*) AS n FROM customers').get().n
    return send(res, 200, {
      today: { total: today.total, delivered: today.delivered || 0, cancelled: today.cancelled || 0 },
      open,
      waiting,
      customers,
    })
  }

  if (m === 'GET' && pathname === '/api/admin/orders') {
    const group = GROUPS[url.searchParams.get('group')] ? url.searchParams.get('group') : 'open'
    const statuses = GROUPS[group]
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 200)
    const rows = db
      .prepare(
        `${ORDER_WITH_CUSTOMER} WHERE o.status IN (${statuses.map(() => '?').join(',')})
         ORDER BY ${group === 'open' ? 'o.id ASC' : 'o.id DESC'} LIMIT ?`
      )
      .all(...statuses, limit)
    return send(res, 200, { orders: rows.map((r) => withCustomer(r)) })
  }

  let mm = /^\/api\/admin\/orders\/(\d{1,12})$/.exec(pathname)
  if (mm && m === 'GET') {
    const row = db.prepare(`${ORDER_WITH_CUSTOMER} WHERE o.id = ?`).get(Number(mm[1]))
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
    const events = db
      .prepare('SELECT status, actor, created_at AS at FROM order_events WHERE order_id = ? ORDER BY id')
      .all(row.id)
    return send(res, 200, { order: withCustomer(row, events) })
  }

  mm = /^\/api\/admin\/orders\/(\d{1,12})\/status$/.exec(pathname)
  if (mm && m === 'POST') {
    const id = Number(mm[1])
    const body = await readJson(req)
    const to = body.status
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
    if (!NEXT[row.status]?.includes(to))
      throw new HttpError(409, 'BAD_TRANSITION', `Cannot move from ${row.status} to ${to}`)
    // تسليم لشب مسجّل بالتطبيق (courierId) أو لشب خارجي بالاسم والرقم فقط (واتساب)
    let courierId = row.courier_id
    let registered = null
    if (body.courierId !== undefined) {
      courierId = body.courierId === null ? null : Number(body.courierId)
      if (courierId !== null) {
        registered = db.prepare('SELECT id, name, phone FROM couriers WHERE id = ? AND active = 1').get(courierId)
        if (!registered) throw bad('INVALID', 'Courier not found', 'courierId')
      }
    }
    const courier = registered ? registered.name : body.courierName !== undefined ? str(body.courierName, 60, 'courierName') : row.courier_name
    if (to === 'assigned' && !courier) throw bad('COURIER_REQUIRED', 'Write the courier name', 'courierName')
    let courierPhone = row.courier_phone
    if (registered) courierPhone = registered.phone
    else if (body.courierPhone !== undefined) {
      courierPhone = String(body.courierPhone || '').replace(/\s/g, '')
      if (courierPhone && !isPhone(courierPhone)) throw bad('INVALID_PHONE', 'Courier phone must be 09xxxxxxxx', 'courierPhone')
    }
    const ts = now()
    db.exec('BEGIN IMMEDIATE')
    try {
      // الشرط على الحالة القديمة يمنع تعارض تعديلين بنفس اللحظة
      const r = db
        .prepare(
          `UPDATE orders SET status = ?, courier_name = ?, courier_phone = ?, courier_id = ?, updated_at = ?
           WHERE id = ? AND status = ?`
        )
        .run(to, to === 'new' ? '' : courier, to === 'new' ? '' : courierPhone, to === 'new' ? null : courierId, ts, id, row.status)
      if (r.changes !== 1) throw new HttpError(409, 'CHANGED', 'Order was changed, refresh and try again')
      db.prepare('INSERT INTO order_events (order_id, status, actor, created_at) VALUES (?, ?, ?, ?)').run(
        id, to, 'admin', ts)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    log('info', 'order status changed', { orderId: id, from: row.status, to })
    // الإدارة تدخّلت: نلغي أي عرض معلّق، وإذا رجع الطلب "جديد" منعيد توزيعه
    if (to !== 'new') cancelOffers(id)
    if (to === 'assigned' && courierId) db.prepare('UPDATE couriers SET last_assigned_at = ? WHERE id = ?').run(ts, courierId)
    if (to === 'new' || to === 'delivered' || to === 'cancelled') nudge()
    const num = `D-${1000 + id}`
    if (to === 'assigned' && courierId) {
      notify('courier', courierId, {
        title: `🛵 طلب جديد لك: ${num}`,
        body: row.kind === 'gas' ? 'طلب غاز' : JSON.parse(row.details).items?.slice(0, 90) || 'طلب مرفق بصورة',
        url: '/driver',
        tag: `order-${id}`,
      })
    }
    // إذا انسحب الطلب من شب أو انلغى، نخبّره
    if ((to === 'new' || to === 'cancelled') && row.courier_id) {
      notify('courier', row.courier_id, { title: `❌ ${num}`, body: to === 'cancelled' ? 'تم إلغاء الطلب' : 'أُعيد الطلب إلى الإدارة', url: '/driver', tag: `order-${id}` })
    }
    const customerMsg = { assigned: 'عامل التوصيل استلم طلبك', buying: 'عامل التوصيل يشتري أغراضك الآن', on_the_way: 'طلبك في الطريق إليك', delivered: 'تم توصيل طلبك، شكراً لك', cancelled: 'تم إلغاء طلبك' }[to]
    if (customerMsg) notify('customer', row.customer_id, { title: `ضواحي: الطلب ${num}`, body: customerMsg, url: '/', tag: `order-${id}` })
    const updated = db.prepare(`${ORDER_WITH_CUSTOMER} WHERE o.id = ?`).get(id)
    return send(res, 200, { order: withCustomer(updated) })
  }

  mm = /^\/api\/admin\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp))$/.exec(pathname)
  if (mm && m === 'GET') {
    const buf = await readFile(join(UPLOADS_DIR, mm[1]))
    const type = mm[1].endsWith('.png') ? 'image/png' : mm[1].endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=86400' })
    return res.end(buf)
  }

  // شباب التوصيل
  if (pathname === '/api/admin/couriers') {
    if (m === 'GET') {
      const rows = db
        .prepare(
          `SELECT c.id, c.name, c.phone, c.active, c.online, c.created_at AS createdAt,
             (SELECT COUNT(*) FROM orders o WHERE o.courier_id = c.id AND o.status IN ('assigned','buying','on_the_way')) AS openOrders,
             EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.owner_type = 'courier' AND p.owner_id = c.id) AS push
           FROM couriers c ORDER BY c.active DESC, c.name`
        )
        .all()
      return send(res, 200, { couriers: rows.map((r) => ({ ...r, active: !!r.active, online: !!r.online, push: !!r.push })) })
    }
    if (m === 'POST') {
      const body = await readJson(req)
      const name = str(body.name, 60, 'name', { required: true })
      const phone = String(body.phone || '').replace(/\s/g, '')
      if (!isPhone(phone)) throw bad('INVALID_PHONE', 'Phone must be 09xxxxxxxx', 'phone')
      if (!isPin(String(body.pin || ''))) throw bad('INVALID_PIN', 'PIN must be 4-6 digits', 'pin')
      if (db.prepare('SELECT 1 FROM couriers WHERE phone = ?').get(phone)) throw new HttpError(409, 'PHONE_TAKEN', 'Phone already used')
      const r = db.prepare('INSERT INTO couriers (name, phone, pin_hash) VALUES (?, ?, ?)').run(name, phone, hashPin(String(body.pin)))
      log('info', 'courier created', { courierId: Number(r.lastInsertRowid) })
      return send(res, 201, { courier: { id: Number(r.lastInsertRowid), name, phone, active: true } })
    }
  }
  mm = /^\/api\/admin\/couriers\/(\d{1,9})$/.exec(pathname)
  if (mm && m === 'PATCH') {
    const id = Number(mm[1])
    const c = db.prepare('SELECT * FROM couriers WHERE id = ?').get(id)
    if (!c) throw new HttpError(404, 'NOT_FOUND', 'Courier not found')
    const body = await readJson(req)
    if (body.name !== undefined) db.prepare('UPDATE couriers SET name = ? WHERE id = ?').run(str(body.name, 60, 'name', { required: true }), id)
    if (body.pin !== undefined) {
      if (!isPin(String(body.pin))) throw bad('INVALID_PIN', 'PIN must be 4-6 digits', 'pin')
      db.prepare('UPDATE couriers SET pin_hash = ? WHERE id = ?').run(hashPin(String(body.pin)), id)
      db.prepare('DELETE FROM courier_sessions WHERE courier_id = ?').run(id) // تسجيل خروج من كل الأجهزة
    }
    if (body.online !== undefined) {
      db.prepare('UPDATE couriers SET online = ?, missed_offers = 0 WHERE id = ?').run(body.online ? 1 : 0, id)
      if (body.online) nudge()
    }
    if (body.active !== undefined) {
      db.prepare('UPDATE couriers SET active = ?, online = CASE WHEN ? = 0 THEN 0 ELSE online END WHERE id = ?').run(body.active ? 1 : 0, body.active ? 1 : 0, id)
      if (!body.active) db.prepare('DELETE FROM courier_sessions WHERE courier_id = ?').run(id)
    }
    log('info', 'courier updated', { courierId: id, fields: Object.keys(body) })
    const u = db.prepare('SELECT id, name, phone, active, online FROM couriers WHERE id = ?').get(id)
    return send(res, 200, { courier: { ...u, active: !!u.active, online: !!u.online, load: courierLoad(id) } })
  }

  // تنبيهات المدير (طلب جديد)
  if (pathname === '/api/admin/push') {
    const body = await readJson(req)
    if (m === 'POST') {
      saveSubscription('admin', 0, body.subscription)
      return send(res, 200, { ok: true })
    }
    if (m === 'DELETE') {
      removeSubscription(body.endpoint)
      return send(res, 204)
    }
  }
  if (m === 'GET' && pathname === '/api/admin/push') return send(res, 200, { enabled: hasSubscription('admin', 0) })
  if (m === 'POST' && pathname === '/api/admin/push/test') {
    const n = notify('admin', 0, { title: 'ضواحي: تجربة الإشعارات ✅', body: 'سيصلك إشعار مثل هذا مع كل طلب جديد.', url: '/admin', tag: 'test' })
    return send(res, 200, { devices: n })
  }

  // النسخ الاحتياطية: عرض، أخذ نسخة الآن، تنزيل
  if (pathname === '/api/admin/backups') {
    if (m === 'GET') return send(res, 200, { backups: await listBackups() })
    if (m === 'POST') {
      await runBackup({ force: true })
      return send(res, 200, { backups: await listBackups() })
    }
  }
  mm = /^\/api\/admin\/backups\/([^/]+)$/.exec(pathname)
  if (mm && m === 'GET') {
    if (!isBackupName(mm[1])) throw new HttpError(404, 'NOT_FOUND', 'Not found')
    const buf = await readFile(join(BACKUP_DIR, mm[1]))
    log('info', 'backup downloaded', { name: mm[1], ip: clientIp(req) })
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${mm[1]}"`,
      'cache-control': 'no-store',
    })
    return res.end(buf)
  }

  if (pathname === '/api/admin/dispatch') {
    const read = () => {
      const s = getSettings()
      return Object.fromEntries(Object.entries(DISPATCH_KEYS).map(([k, [dbKey]]) => [k, s[dbKey]]))
    }
    if (m === 'GET') return send(res, 200, { dispatch: read() })
    if (m === 'PUT') {
      const body = await readJson(req)
      const p = body.dispatch || {}
      for (const [k, [dbKey, min, maxV]] of Object.entries(DISPATCH_KEYS)) {
        if (p[k] === undefined) continue
        const v = Number(p[k])
        if (!Number.isInteger(v) || v < min || v > maxV) throw bad('INVALID', `${k} must be between ${min} and ${maxV}`, k)
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(v), dbKey)
      }
      log('info', 'dispatch settings updated', p)
      nudge()
      return send(res, 200, { dispatch: read() })
    }
  }

  if (pathname === '/api/admin/settings') {
    if (m === 'GET') {
      const s = getSettings()
      return send(res, 200, {
        pricing: Object.fromEntries(Object.entries(SETTING_KEYS).map(([k, dbKey]) => [k, s[dbKey]])),
      })
    }
    if (m === 'PUT') {
      const body = await readJson(req)
      const p = body.pricing || {}
      const updates = []
      for (const [k, dbKey] of Object.entries(SETTING_KEYS)) {
        if (p[k] === undefined) continue
        const v = Number(p[k])
        if (!Number.isInteger(v) || v < 0 || v > 100_000_000) throw bad('INVALID', `${k} must be a whole number`, k)
        updates.push([dbKey, String(v)])
      }
      db.exec('BEGIN')
      try {
        for (const [key, value] of updates) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
      log('info', 'prices updated', { keys: updates.map((u) => u[0]) })
      const s = getSettings()
      return send(res, 200, {
        pricing: Object.fromEntries(Object.entries(SETTING_KEYS).map(([k, dbKey]) => [k, s[dbKey]])),
      })
    }
  }

  if (await contentAdminRoute(req, res, url)) return

  throw new HttpError(404, 'NOT_FOUND', 'Not found')
}
