// واجهة الإدارة (لوحة التحكم) — كل المسارات تحت /api/admin/
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, getSettings, UPLOADS_DIR } from './db.mjs'
import { HttpError, bad, sha256, now, str, clientIp, rateLimit, readJson, send, log, toOrder } from './lib.mjs'

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

const withCustomer = (r, events) => ({
  ...toOrder(r, events),
  customer: { name: r.customer_name, phone: r.customer_phone },
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
    const courier = body.courierName !== undefined ? str(body.courierName, 60, 'courierName') : row.courier_name
    if (to === 'assigned' && !courier) throw bad('COURIER_REQUIRED', 'Write the courier name', 'courierName')
    const ts = now()
    db.exec('BEGIN IMMEDIATE')
    try {
      // الشرط على الحالة القديمة يمنع تعارض تعديلين بنفس اللحظة
      const r = db
        .prepare('UPDATE orders SET status = ?, courier_name = ?, updated_at = ? WHERE id = ? AND status = ?')
        .run(to, to === 'new' ? '' : courier, ts, id, row.status)
      if (r.changes !== 1) throw new HttpError(409, 'CHANGED', 'Order was changed, refresh and try again')
      db.prepare('INSERT INTO order_events (order_id, status, actor, created_at) VALUES (?, ?, ?, ?)').run(
        id, to, 'admin', ts)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    log('info', 'order status changed', { orderId: id, from: row.status, to })
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

  throw new HttpError(404, 'NOT_FOUND', 'Not found')
}
