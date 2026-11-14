// واجهة الإدارة (لوحة التحكم) — كل المسارات تحت /api/admin/
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, getSettings, UPLOADS_DIR } from './db.mjs'
import { HttpError, bad, sha256, now, str, isPhone, isPin, hashPin, isPassword, hashSecret, verifySecret, clientIp, rateLimit, readJson, send, log, toOrder } from './lib.mjs'
import { hasSubscription, notify, removeSubscription, saveSubscription } from './push.mjs'
import { BACKUP_DIR, isBackupName, listBackups, runBackup } from './backup.mjs'
import { cancelOffers, courierLoad, nudge } from './dispatch.mjs'
import { contentAdminRoute } from './content.mjs'
import { adminStoresRoute } from './stores.mjs'
import { adminPromoRoute, awardPoints, releasePerks } from './promo.mjs'
import { liveSnapshot } from './live.mjs'

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
function cleanPerms(list) {
  if (!Array.isArray(list)) throw bad('INVALID', 'permissions must be a list', 'permissions')
  return [...new Set(list.filter((p) => ALL_PERMS.includes(p)))]
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

// كلمة سر المالك: إذا غيّرها من اللوحة بتنحفظ مشفّرة بالقاعدة، وإلا منستعمل الأصلية من السيرفر
const ownerHash = () => db.prepare("SELECT value FROM secrets WHERE key = 'owner_password'").get()?.value || null

function passwordMatches(input) {
  if (typeof input !== 'string') return false
  const h = ownerHash()
  if (h) return verifySecret(input, h)
  if (!ADMIN_PASSWORD) return false
  // مقارنة آمنة ضد هجمات التوقيت
  return timingSafeEqual(Buffer.from(sha256(input), 'hex'), Buffer.from(sha256(ADMIN_PASSWORD), 'hex'))
}

// كل الصلاحيات المتاحة (الأدوار تُبنى منها)
export const PERMISSIONS = {
  'orders.view': 'عرض الطلبات',
  'orders.manage': 'إدارة الطلبات (تسليم، تغيير الحالة، إلغاء)',
  'couriers.manage': 'إدارة عمال التوصيل',
  'customers.view': 'عرض الزبائن',
  'customers.manage': 'إيقاف الزبائن',
  'content.manage': 'الإعلانات والإشعارات ومحتوى التطبيق',
  'pricing.manage': 'الأسعار والتوزيع التلقائي',
  'backups.manage': 'النسخ الاحتياطي',
  'staff.manage': 'إدارة الفريق والصلاحيات',
}
const ALL_PERMS = Object.keys(PERMISSIONS)

/** يتحقق من الجلسة ويرجع هوية المستخدم وصلاحياته */
function authAdmin(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token || token.length > 200) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  const row = db
    .prepare(
      `SELECT s.token_hash, s.expires_at, s.staff_id, st.name, st.active, r.name AS role, r.permissions
       FROM admin_sessions s LEFT JOIN staff st ON st.id = s.staff_id LEFT JOIN roles r ON r.id = st.role_id
       WHERE s.token_hash = ?`
    )
    .get(sha256(token))
  if (!row || row.expires_at < now()) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  if (row.staff_id === null) return { hash: row.token_hash, staffId: null, name: 'المالك', role: 'مالك', isOwner: true, perms: ALL_PERMS }
  if (!row.active) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in')
  return { hash: row.token_hash, staffId: row.staff_id, name: row.name, role: row.role, isOwner: false, perms: JSON.parse(row.permissions) }
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
    rateLimit(`admin-login:${clientIp(req)}`, 8, 15 * 60 * 1000)
    const body = await readJson(req)
    const phone = String(body.phone || '').replace(/\s/g, '')
    let staffId = null
    if (phone) {
      // دخول عضو بالفريق: رقم الموبايل + كلمة السر
      const st = db.prepare('SELECT id, password_hash, active FROM staff WHERE phone = ?').get(phone)
      if (!st || !st.active || !verifySecret(body.password, st.password_hash)) {
        log('warn', 'staff login failed', { ip: clientIp(req) })
        throw new HttpError(401, 'WRONG_PASSWORD', 'Wrong phone or password')
      }
      staffId = st.id
      db.prepare('UPDATE staff SET last_login_at = ? WHERE id = ?').run(now(), st.id)
    } else {
      // دخول المالك بكلمة السر الرئيسية
      if (!ADMIN_PASSWORD && !ownerHash()) throw new HttpError(503, 'NOT_CONFIGURED', 'Admin password is not set on the server')
      if (!passwordMatches(body.password)) {
        log('warn', 'admin login failed', { ip: clientIp(req) })
        throw new HttpError(401, 'WRONG_PASSWORD', 'Wrong password')
      }
    }
    const token = randomBytes(32).toString('base64url')
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()
    db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now())
    db.prepare('INSERT INTO admin_sessions (token_hash, expires_at, staff_id) VALUES (?, ?, ?)').run(sha256(token), expires, staffId)
    log('info', 'admin login', { ip: clientIp(req), staffId })
    return send(res, 200, { token })
  }

  const me = authAdmin(req)
  const sessionHash = me.hash
  // يرمي خطأ إذا المستخدم ما عنده أي من الصلاحيات المطلوبة
  const need = (...perms) => {
    if (!perms.some((p) => me.perms.includes(p))) throw new HttpError(403, 'FORBIDDEN', 'You do not have permission')
  }
  const actor = me.isOwner ? 'admin' : `staff:${me.staffId}`

  if (m === 'GET' && pathname === '/api/admin/me') {
    return send(res, 200, { me: { name: me.name, role: me.role, isOwner: me.isOwner, perms: me.perms }, permissions: PERMISSIONS })
  }

  // تغيير كلمة السر (المالك أو أي موظف لحسابه هو)
  if (m === 'POST' && pathname === '/api/admin/password') {
    rateLimit(`admin-pass:${sessionHash}`, 6, 15 * 60 * 1000)
    const { current, next, logoutOthers } = await readJson(req)
    if (!isPassword(next)) throw bad('WEAK_PASSWORD', 'Password must be at least 8 characters', 'next')
    if (me.isOwner) {
      if (!passwordMatches(current)) throw new HttpError(400, 'WRONG_CURRENT', 'Current password is wrong')
      db.prepare("INSERT OR REPLACE INTO secrets (key, value) VALUES ('owner_password', ?)").run(hashSecret(next))
      if (logoutOthers !== false)
        db.prepare('DELETE FROM admin_sessions WHERE staff_id IS NULL AND token_hash != ?').run(sessionHash)
    } else {
      const st = db.prepare('SELECT password_hash FROM staff WHERE id = ?').get(me.staffId)
      if (!st || !verifySecret(current, st.password_hash)) throw new HttpError(400, 'WRONG_CURRENT', 'Current password is wrong')
      db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?').run(hashSecret(next), me.staffId)
      if (logoutOthers !== false)
        db.prepare('DELETE FROM admin_sessions WHERE staff_id = ? AND token_hash != ?').run(me.staffId, sessionHash)
    }
    log('info', 'admin password changed', { staffId: me.staffId })
    return send(res, 200, { ok: true })
  }

  if (m === 'POST' && pathname === '/api/admin/logout') {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sessionHash)
    return send(res, 204)
  }

  // ───── الفريق والأدوار ─────
  if (pathname === '/api/admin/roles') {
    need('staff.manage')
    if (m === 'GET') {
      const rows = db
        .prepare('SELECT r.id, r.name, r.permissions, r.is_system AS isSystem, (SELECT COUNT(*) FROM staff s WHERE s.role_id = r.id) AS members FROM roles r ORDER BY r.id')
        .all()
      return send(res, 200, { roles: rows.map((r) => ({ ...r, permissions: JSON.parse(r.permissions), isSystem: !!r.isSystem })), permissions: PERMISSIONS })
    }
    if (m === 'POST') {
      const body = await readJson(req)
      const name = str(body.name, 40, 'name', { required: true })
      const perms = cleanPerms(body.permissions)
      if (db.prepare('SELECT 1 FROM roles WHERE name = ?').get(name)) throw new HttpError(409, 'NAME_TAKEN', 'Role name exists')
      const r = db.prepare('INSERT INTO roles (name, permissions) VALUES (?, ?)').run(name, JSON.stringify(perms))
      log('info', 'role created', { roleId: Number(r.lastInsertRowid) })
      return send(res, 201, { id: Number(r.lastInsertRowid) })
    }
  }
  let rm_ = /^\/api\/admin\/roles\/(\d{1,9})$/.exec(pathname)
  if (rm_) {
    need('staff.manage')
    const id = Number(rm_[1])
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id)
    if (!role) throw new HttpError(404, 'NOT_FOUND', 'Role not found')
    if (m === 'PATCH') {
      const body = await readJson(req)
      if (body.name !== undefined) db.prepare('UPDATE roles SET name = ? WHERE id = ?').run(str(body.name, 40, 'name', { required: true }), id)
      if (body.permissions !== undefined) db.prepare('UPDATE roles SET permissions = ? WHERE id = ?').run(JSON.stringify(cleanPerms(body.permissions)), id)
      log('info', 'role updated', { roleId: id })
      return send(res, 200, { ok: true })
    }
    if (m === 'DELETE') {
      if (db.prepare('SELECT 1 FROM staff WHERE role_id = ?').get(id)) throw new HttpError(409, 'ROLE_IN_USE', 'Role has members')
      db.prepare('DELETE FROM roles WHERE id = ?').run(id)
      return send(res, 204)
    }
  }
  if (pathname === '/api/admin/staff') {
    need('staff.manage')
    if (m === 'GET') {
      const rows = db
        .prepare(
          `SELECT s.id, s.name, s.phone, s.active, s.role_id AS roleId, r.name AS role, s.last_login_at AS lastLoginAt,
             EXISTS (SELECT 1 FROM couriers c WHERE c.phone = s.phone AND c.active = 1) AS isCourier
           FROM staff s JOIN roles r ON r.id = s.role_id ORDER BY s.active DESC, s.name`
        )
        .all()
      return send(res, 200, { staff: rows.map((r) => ({ ...r, active: !!r.active, isCourier: !!r.isCourier })) })
    }
    if (m === 'POST') {
      const body = await readJson(req)
      const name = str(body.name, 60, 'name', { required: true })
      const phone = String(body.phone || '').replace(/\s/g, '')
      if (!isPhone(phone)) throw bad('INVALID_PHONE', 'Phone must be 09xxxxxxxx', 'phone')
      if (!isPassword(body.password)) throw bad('WEAK_PASSWORD', 'Password must be at least 8 characters', 'password')
      if (!db.prepare('SELECT 1 FROM roles WHERE id = ?').get(Number(body.roleId))) throw bad('INVALID', 'Unknown role', 'roleId')
      if (db.prepare('SELECT 1 FROM staff WHERE phone = ?').get(phone)) throw new HttpError(409, 'PHONE_TAKEN', 'Phone already used')
      const r = db
        .prepare('INSERT INTO staff (name, phone, password_hash, role_id) VALUES (?, ?, ?, ?)')
        .run(name, phone, hashSecret(body.password), Number(body.roleId))
      log('info', 'staff created', { staffId: Number(r.lastInsertRowid) })
      return send(res, 201, { id: Number(r.lastInsertRowid) })
    }
  }
  rm_ = /^\/api\/admin\/staff\/(\d{1,9})$/.exec(pathname)
  if (rm_ && m === 'PATCH') {
    need('staff.manage')
    const id = Number(rm_[1])
    if (!db.prepare('SELECT 1 FROM staff WHERE id = ?').get(id)) throw new HttpError(404, 'NOT_FOUND', 'Staff not found')
    const body = await readJson(req)
    if (body.name !== undefined) db.prepare('UPDATE staff SET name = ? WHERE id = ?').run(str(body.name, 60, 'name', { required: true }), id)
    if (body.roleId !== undefined) {
      if (!db.prepare('SELECT 1 FROM roles WHERE id = ?').get(Number(body.roleId))) throw bad('INVALID', 'Unknown role', 'roleId')
      db.prepare('UPDATE staff SET role_id = ? WHERE id = ?').run(Number(body.roleId), id)
    }
    if (body.password !== undefined) {
      if (!isPassword(body.password)) throw bad('WEAK_PASSWORD', 'Password must be at least 8 characters', 'password')
      db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?').run(hashSecret(body.password), id)
      db.prepare('DELETE FROM admin_sessions WHERE staff_id = ?').run(id)
    }
    if (body.active !== undefined) {
      db.prepare('UPDATE staff SET active = ? WHERE id = ?').run(body.active ? 1 : 0, id)
      if (!body.active) db.prepare('DELETE FROM admin_sessions WHERE staff_id = ?').run(id)
    }
    log('info', 'staff updated', { staffId: id, fields: Object.keys(body).filter((k) => k !== 'password') })
    return send(res, 200, { ok: true })
  }

  // لقطة المراقبة الحية (اللوحة تطلبها كل ثانيتين)
  if (m === 'GET' && pathname === '/api/admin/live') {
    need('orders.view')
    return send(res, 200, liveSnapshot())
  }

  if (m === 'GET' && pathname === '/api/admin/stats') {
    need('orders.view')
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
    need('orders.view')
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
    need('orders.view')
    const row = db.prepare(`${ORDER_WITH_CUSTOMER} WHERE o.id = ?`).get(Number(mm[1]))
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
    const events = db
      .prepare('SELECT status, actor, created_at AS at FROM order_events WHERE order_id = ? ORDER BY id')
      .all(row.id)
    return send(res, 200, { order: withCustomer(row, events) })
  }

  mm = /^\/api\/admin\/orders\/(\d{1,12})\/status$/.exec(pathname)
  if (mm && m === 'POST') {
    need('orders.manage')
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
        id, to, actor, ts)
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
    if (to === 'delivered') awardPoints(id)
    if (to === 'cancelled') releasePerks(id)
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
    if (customerMsg) notify('customer', row.customer_id, { title: `ZAPP: الطلب ${num}`, body: customerMsg, url: '/', tag: `order-${id}` })
    const updated = db.prepare(`${ORDER_WITH_CUSTOMER} WHERE o.id = ?`).get(id)
    return send(res, 200, { order: withCustomer(updated) })
  }

  mm = /^\/api\/admin\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp))$/.exec(pathname)
  if (mm && m === 'GET') {
    need('orders.view')
    const buf = await readFile(join(UPLOADS_DIR, mm[1]))
    const type = mm[1].endsWith('.png') ? 'image/png' : mm[1].endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=86400' })
    return res.end(buf)
  }

  // شباب التوصيل
  if (pathname === '/api/admin/couriers') {
    need(m === 'GET' ? 'orders.manage' : 'couriers.manage', 'couriers.manage')
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
    need('couriers.manage')
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
      saveSubscription('admin', me.staffId ?? 0, body.subscription)
      return send(res, 200, { ok: true })
    }
    if (m === 'DELETE') {
      removeSubscription(body.endpoint)
      return send(res, 204)
    }
  }
  if (m === 'GET' && pathname === '/api/admin/push') return send(res, 200, { enabled: hasSubscription('admin', me.staffId ?? 0) })
  if (m === 'POST' && pathname === '/api/admin/push/test') {
    const n = notify('admin', 0, { title: 'ZAPP: تجربة الإشعارات ✅', body: 'سيصلك إشعار مثل هذا مع كل طلب جديد.', url: '/admin', tag: 'test' })
    return send(res, 200, { devices: n })
  }

  // النسخ الاحتياطية: عرض، أخذ نسخة الآن، تنزيل
  if (pathname === '/api/admin/backups' || pathname.startsWith('/api/admin/backups/')) need('backups.manage')
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
    need('pricing.manage')
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
    need('pricing.manage')
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

  if (await contentAdminRoute(req, res, url, need)) return
  if (await adminPromoRoute(req, res, url, need)) return
  if (await adminStoresRoute(req, res, url, need)) return

  throw new HttpError(404, 'NOT_FOUND', 'Not found')
}
