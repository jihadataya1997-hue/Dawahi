// وضع المشرف داخل تطبيق السائقين: يشوف السائقين والطلبات، يحوّل الطلبات، ويعمل السائق متاح/غير متاح
// (إلغاء الطلبات بيضل للإدارة بس)
import { db } from './db.mjs'
import { HttpError, bad, now, readJson, send, log, toOrder, ratingOf } from './lib.mjs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PRIVATE_DIR } from './db.mjs'
import { courierWallet } from './wallet.mjs'
import { releasePerks } from './promo.mjs'
import { notify } from './push.mjs'
import { cancelOffers, nudge } from './dispatch.mjs'
import { liveSnapshot } from './live.mjs'
import { createCourierWithDocs } from './courierProfile.mjs'
import { recordAudit } from './audit.mjs'
import { rateLimit } from './lib.mjs'

const num = (id) => `D-${1000 + id}`
const ALERT_AFTER_MIN = 5

export async function supervisorRoute(req, res, url, me) {
  if (!me.is_supervisor) throw new HttpError(403, 'FORBIDDEN', 'Supervisor only')
  const { pathname } = url
  const m = req.method

  // المشرف بيضيف عامل توصيل جديد مع وثائقه، وبيرجعله الرمز السري ليبعته للعامل
  if (m === 'POST' && pathname === '/api/courier/sup/couriers') {
    rateLimit(`sup-add:${me.id}`, 20, 24 * 3600 * 1000)
    const body = await readJson(req)
    const c = await createCourierWithDocs(body)
    log('info', 'courier created by supervisor', { courierId: c.id, supervisorId: me.id })
    recordAudit(req, { staffId: null, name: `المشرف ${me.name}` }, 'POST', pathname, { name: c.name, phone: c.phone, vehicle: body.vehicle || '' })
    notify('admin', 0, { title: '👤 عامل توصيل جديد', body: `${me.name} أضاف ${c.name} (${c.phone})`, url: '/admin', tag: `courier-${c.id}` })
    return send(res, 201, { courier: c })
  }

  // ملف عامل التوصيل الكامل: معلوماته، وثائقه، أرقامه، الطلبات اللي إجته وشو صار فيها
  let cm = /^\/api\/courier\/sup\/couriers\/(\d{1,9})$/.exec(pathname)
  if (cm && m === 'GET') return send(res, 200, courierFile(Number(cm[1])))
  cm = /^\/api\/courier\/sup\/couriers\/(\d{1,9})\/doc\/(front|back|license)$/.exec(pathname)
  if (cm && m === 'GET') {
    const col = { front: 'id_front', back: 'id_back', license: 'license_doc' }[cm[2]]
    const name = db.prepare(`SELECT ${col} AS f FROM couriers WHERE id = ?`).get(Number(cm[1]))?.f
    if (!name) throw new HttpError(404, 'NOT_FOUND', 'Document not found')
    const buf = await readFile(join(PRIVATE_DIR, name))
    const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'Content-Length': buf.length })
    return res.end(buf)
  }

  if (m === 'GET' && pathname === '/api/courier/sup/overview') {
    const snap = liveSnapshot()
    // المشرف ما بيحتاج أرقام المبيعات
    return send(res, 200, { at: snap.at, couriers: snap.couriers, active: snap.active, waitingAlertMin: ALERT_AFTER_MIN })
  }

  // تفاصيل الطلب الكاملة (مع رقم الزبون وعنوانه) لحتى ينسخها أو يبعتها
  let dm = /^\/api\/courier\/sup\/orders\/(\d{1,12})$/.exec(pathname)
  if (dm && m === 'GET') {
    const row = db
      .prepare('SELECT o.*, c.name AS customer_name, c.phone AS customer_phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?')
      .get(Number(dm[1]))
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
    const events = db.prepare('SELECT status, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id').all(row.id)
    return send(res, 200, {
      order: { ...toOrder(row, events), customer: { name: row.customer_name, phone: row.customer_phone }, courierPhone: row.courier_phone || '' },
    })
  }

  // إلغاء طلب
  dm = /^\/api\/courier\/sup\/orders\/(\d{1,12})\/cancel$/.exec(pathname)
  if (dm && m === 'POST') {
    const id = Number(dm[1])
    const body = await readJson(req)
    const reason = String(body.reason || '').trim().slice(0, 200)
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
    if (!['new', 'assigned', 'buying', 'on_the_way'].includes(row.status)) throw new HttpError(409, 'TOO_LATE', 'Order is already finished')
    const ts = now()
    db.exec('BEGIN IMMEDIATE')
    try {
      const r = db.prepare(`UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = ?`).run(ts, id, row.status)
      if (r.changes !== 1) throw new HttpError(409, 'CHANGED', 'Order was changed, refresh')
      db.prepare('INSERT INTO order_events (order_id, status, actor, created_at) VALUES (?, ?, ?, ?)').run(id, 'cancelled', `supervisor:${me.id}`, ts)
      releasePerks(id)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    cancelOffers(id)
    log('info', 'order cancelled by supervisor', { orderId: id, supervisorId: me.id, reason })
    notify('customer', row.customer_id, {
      title: `ZAPP: انلغى الطلب ${num(id)}`,
      body: reason ? `السبب: ${reason}` : 'تواصل معنا إذا عندك أي سؤال',
      url: '/',
      tag: `order-${id}`,
    })
    if (row.courier_id) notify('courier', row.courier_id, { title: `❌ انلغى ${num(id)}`, body: `المشرف ${me.name} لغى هالطلب`, url: '/driver', tag: `order-${id}` })
    notify('admin', 0, { title: `❌ ${num(id)} انلغى`, body: `ألغاه المشرف ${me.name}${reason ? `: ${reason}` : ''}`, url: '/admin', tag: `order-${id}` })
    nudge()
    return send(res, 200, { ok: true })
  }

  // تحويل طلب لسائق تاني (قبل ما يبلّش يشتري)
  let mm = /^\/api\/courier\/sup\/orders\/(\d{1,12})\/assign$/.exec(pathname)
  if (mm && m === 'POST') {
    const id = Number(mm[1])
    const { courierId } = await readJson(req)
    const to = db.prepare('SELECT id, name, phone, active FROM couriers WHERE id = ?').get(Number(courierId))
    if (!to || !to.active) throw bad('INVALID', 'Courier not found', 'courierId')
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Order not found')
    if (!['new', 'assigned'].includes(row.status)) throw new HttpError(409, 'TOO_LATE', 'Order is already being bought')
    if (row.courier_id === to.id) return send(res, 200, { ok: true })
    const ts = now()
    db.exec('BEGIN IMMEDIATE')
    try {
      const r = db
        .prepare(
          `UPDATE orders SET status = 'assigned', courier_id = ?, courier_name = ?, courier_phone = ?, updated_at = ?
           WHERE id = ? AND status = ?`
        )
        .run(to.id, to.name, to.phone, ts, id, row.status)
      if (r.changes !== 1) throw new HttpError(409, 'CHANGED', 'Order was changed, refresh')
      db.prepare('INSERT INTO order_events (order_id, status, actor, created_at) VALUES (?, ?, ?, ?)').run(id, 'assigned', `supervisor:${me.id}`, ts)
      db.prepare('UPDATE couriers SET last_assigned_at = ? WHERE id = ?').run(ts, to.id)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    cancelOffers(id)
    log('info', 'order reassigned by supervisor', { orderId: id, supervisorId: me.id, from: row.courier_id, to: to.id })
    const summary = row.kind === 'gas' ? 'طلب غاز' : JSON.parse(row.details).items?.slice(0, 90) || 'طلب مرفق بصورة'
    notify('courier', to.id, { title: `🛵 طلب جديد إلك: ${num(id)}`, body: `من المشرف ${me.name}: ${summary}`, url: '/driver', tag: `order-${id}` })
    if (row.courier_id && row.courier_id !== to.id)
      notify('courier', row.courier_id, { title: `↩️ ${num(id)}`, body: `المشرف حوّل هالطلب لـ ${to.name}`, url: '/driver', tag: `order-${id}` })
    notify('customer', row.customer_id, { title: `ZAPP: الطلب ${num(id)}`, body: `${to.name} صار عامل التوصيل تبع طلبك`, url: '/', tag: `order-${id}` })
    nudge()
    return send(res, 200, { ok: true })
  }

  // سائق متاح / غير متاح
  mm = /^\/api\/courier\/sup\/couriers\/(\d{1,9})\/online$/.exec(pathname)
  if (mm && m === 'POST') {
    const id = Number(mm[1])
    const { online } = await readJson(req)
    const r = db.prepare('UPDATE couriers SET online = ?, missed_offers = 0 WHERE id = ? AND active = 1').run(online ? 1 : 0, id)
    if (!r.changes) throw new HttpError(404, 'NOT_FOUND', 'Courier not found')
    log('info', 'courier availability by supervisor', { courierId: id, supervisorId: me.id, online: !!online })
    if (online) nudge()
    notify('courier', id, {
      title: online ? '✅ صرت متاح' : '⏸ صرت غير متاح',
      body: `المشرف ${me.name} ${online ? 'شغّل' : 'وقّف'} استقبال الطلبات عندك`,
      url: '/driver',
      tag: 'availability',
    })
    return send(res, 200, { ok: true })
  }

  throw new HttpError(404, 'NOT_FOUND', 'Not found')
}

// تنبيه المشرفين: طلب ضل أكتر من 5 دقايق بدون ما حدا يقبله (مرة وحدة لكل طلب)
const alerted = new Set()
export function startSupervisorAlerts() {
  setInterval(() => {
    try {
      const cut = new Date(Date.now() - ALERT_AFTER_MIN * 60_000).toISOString()
      const waiting = db.prepare(`SELECT id, created_at FROM orders WHERE status = 'new' AND courier_id IS NULL AND created_at <= ?`).all(cut)
      const sups = waiting.length ? db.prepare('SELECT id FROM couriers WHERE is_supervisor = 1 AND active = 1').all() : []
      for (const o of waiting) {
        if (alerted.has(o.id)) continue
        alerted.add(o.id)
        const mins = Math.round((Date.now() - Date.parse(o.created_at)) / 60_000)
        for (const s of sups)
          notify('courier', s.id, { title: `⚠️ ${num(o.id)} بدون عامل توصيل`, body: `صرلو ${mins} دقيقة وما حدا قبله. افتح وضع المشرف وحوّله.`, url: '/driver', tag: `sup-${o.id}` })
      }
      if (alerted.size > 5000) alerted.clear()
    } catch (err) {
      log('error', 'supervisor alerts failed', { err: err.message })
    }
  }, 60_000).unref()
}

// إشعار لكل المشرفين بكل طلب جديد (للمتصفح؛ تطبيق الأندرويد بيعرف من supFeed)
export function notifySupervisors(row, customerName) {
  try {
    const sups = db.prepare('SELECT id FROM couriers WHERE is_supervisor = 1 AND active = 1').all()
    const d = JSON.parse(row.details || '{}')
    const what = row.kind === 'gas' ? `غاز (${d.qty} جرة)` : String(d.items || 'طلب مرفق بصورة').slice(0, 80)
    for (const s of sups) notify('courier', s.id, { title: `🔔 طلب جديد ${num(row.id)}`, body: `${customerName}: ${what}`, url: '/driver', tag: `sup-new-${row.id}` })
  } catch (err) {
    log('error', 'notify supervisors failed', { err: err.message })
  }
}

/** للخدمة بالخلفية (أندرويد): الطلبات الجديدة آخر نص ساعة + يلي ضلت بلا عامل */
export function supFeed() {
  const since = new Date(Date.now() - 30 * 60_000).toISOString()
  const late = new Date(Date.now() - ALERT_AFTER_MIN * 60_000).toISOString()
  return db
    .prepare(`SELECT id, kind, details, created_at, status, courier_id FROM orders WHERE created_at >= ? AND status != 'cancelled' ORDER BY id`)
    .all(since)
    .map((r) => {
      const d = JSON.parse(r.details || '{}')
      return {
        id: r.id,
        number: num(r.id),
        summary: r.kind === 'gas' ? `غاز (${d.qty} جرة)` : String(d.items || 'طلب مرفق بصورة').slice(0, 80),
        waiting: r.status === 'new' && !r.courier_id && r.created_at <= late,
      }
    })
}

/* ───────── تذكير عامل التوصيل إذا طوّل بتغيير حالة الطلب ───────── */
const STALE = {
  assigned: { key: 'remind_assigned_min', what: 'قبلت الطلب وما بلّشت تشتري', next: 'إذا بلّشت تشتري اكبس "بدأت شراء الأغراض"' },
  buying: { key: 'remind_buying_min', what: 'عم تشتري الطلب', next: 'إذا طلعت لعند الزبون اكبس "أنا في الطريق إلى الزبون"' },
  on_the_way: { key: 'remind_way_min', what: 'الطلب بالطريق', next: 'إذا سلّمته اكبس "تم تسليم الطلب"' },
}
const reminded = new Map() // `${orderId}:${status}` -> عدد التذكيرات
const pending = new Map() // courierId -> [{ id, title, body }] للتطبيق (الخدمة بالخلفية)

/** رسالة لعامل التوصيل بتطلع إشعار من الخدمة بالخلفية بأول مرة بيسأل فيها السيرفر */
export function queueCourierMessage(courierId, title, body, id = `msg-${Date.now()}`) {
  const q = pending.get(courierId) || []
  q.push({ id: `${id}-${courierId}`, title, body })
  pending.set(courierId, q.slice(-5))
}

/** للخدمة بالخلفية: التذكيرات يلي لسا ما وصلت للموبايل (بتنحذف بعد ما تنقرا) */
export function takeReminders(courierId) {
  const list = pending.get(courierId) || []
  pending.delete(courierId)
  return list
}

function checkStale() {
  const s = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE key IN ('remind_assigned_min','remind_buying_min','remind_way_min')").all().map((r) => [r.key, Number(r.value)])
  )
  const rows = db
    .prepare(
      `SELECT o.id, o.status, o.courier_id, o.courier_name,
         (SELECT MAX(e.created_at) FROM order_events e WHERE e.order_id = o.id) AS since
       FROM orders o WHERE o.status IN ('assigned','buying','on_the_way') AND o.courier_id IS NOT NULL`
    )
    .all()
  const open = new Set()
  for (const o of rows) {
    const rule = STALE[o.status]
    const limit = s[rule.key] || 0
    const k = `${o.id}:${o.status}`
    open.add(k)
    if (!limit || !o.since) continue
    const mins = Math.floor((Date.now() - Date.parse(o.since)) / 60_000)
    const due = Math.floor(mins / limit) // تذكير عند كل مضاعف للمدة، لحد 3 مرات
    const done = reminded.get(k) || 0
    if (due < 1 || due <= done || done >= 3) continue
    reminded.set(k, due)
    const title = `⏰ ${num(o.id)}: لا تنسى تحدّث حالة الطلب`
    const body = `صرلك ${mins} دقيقة و${rule.what}. ${rule.next}.`
    notify('courier', o.courier_id, { title, body, url: '/driver', tag: `stale-${o.id}` })
    const q = pending.get(o.courier_id) || []
    q.push({ id: `${k}:${due}`, title, body })
    pending.set(o.courier_id, q.slice(-5))
    log('info', 'courier reminded', { orderId: o.id, status: o.status, mins })
    // من التذكير التاني: المشرفين والإدارة بيعرفوا
    if (due >= 2) {
      const msg = { title: `⚠️ ${num(o.id)} متأخر`, body: `${o.courier_name || 'عامل التوصيل'}: صرلو ${mins} دقيقة و${rule.what}.`, url: '/driver', tag: `late-${o.id}` }
      for (const sup of db.prepare('SELECT id FROM couriers WHERE is_supervisor = 1 AND active = 1 AND id != ?').all(o.courier_id)) notify('courier', sup.id, msg)
      notify('admin', 0, { ...msg, url: '/admin' })
    }
  }
  for (const k of reminded.keys()) if (!open.has(k)) reminded.delete(k)
}
setInterval(() => {
  try {
    checkStale()
  } catch (err) {
    log('error', 'stale check failed', { err: err.message })
  }
}, 60_000).unref()

const DAY_MS = 86400e3
function courierFile(id) {
  const c = db.prepare('SELECT * FROM couriers WHERE id = ?').get(id)
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Courier not found')
  const since = (days) => new Date(Date.now() - days * DAY_MS).toISOString()
  // بداية اليوم بتوقيت دمشق
  const today = new Date(new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00+03:00').toISOString()
  const delivered = (from) =>
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(o.delivery_fee), 0) AS fees FROM orders o
         WHERE o.courier_id = ? AND o.status = 'delivered' AND o.updated_at >= ?`
      )
      .get(id, from)
  const offers = (from) =>
    db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(status = 'accepted') AS accepted, SUM(status = 'declined') AS declined,
                SUM(status = 'expired') AS expired FROM order_offers WHERE courier_id = ? AND created_at >= ?`
      )
      .get(id, from)
  const rating = db
    .prepare(`SELECT ROUND(AVG(rating), 1) AS avg, COUNT(*) AS n FROM orders WHERE courier_id = ? AND rating IS NOT NULL AND rated_at >= ?`)
    .get(id, since(90))
  const cancelled = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE courier_id = ? AND status = 'cancelled' AND updated_at >= ?`).get(id, since(30)).n
  const open = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE courier_id = ? AND status IN ('assigned','buying','on_the_way')`).get(id).n
  const first = db.prepare(`SELECT MIN(updated_at) AS at FROM orders WHERE courier_id = ? AND status = 'delivered'`).get(id).at

  // آخر الطلبات اللي اشتغلها
  const orders = db
    .prepare(
      `SELECT o.*, (SELECT MIN(created_at) FROM order_events e WHERE e.order_id = o.id AND e.status = 'assigned') AS assigned_at,
              (SELECT MAX(created_at) FROM order_events e WHERE e.order_id = o.id AND e.status = 'delivered') AS delivered_at
       FROM orders o WHERE o.courier_id = ? ORDER BY o.id DESC LIMIT 40`
    )
    .all(id)
    .map((r) => {
      const d = JSON.parse(r.details || '{}')
      const mins = r.assigned_at && r.delivered_at ? Math.round((Date.parse(r.delivered_at) - Date.parse(r.assigned_at)) / 60000) : null
      return {
        id: r.id,
        number: num(r.id),
        status: r.status,
        category: r.category,
        kind: r.kind,
        what: r.kind === 'gas' ? `${d.qty || 1} جرة غاز` : (typeof d.items === 'string' ? d.items : Array.isArray(d.items) ? d.items.map((i) => i.name).join('، ') : '') || 'طلب مرفق بصورة',
        fee: r.delivery_fee,
        createdAt: r.created_at,
        deliveredAt: r.delivered_at,
        minutes: mins,
        rating: ratingOf(r),
      }
    })

  // كل العروض اللي وصلته (قبل/رفض/ما رد)
  const offerList = db
    .prepare(
      `SELECT f.order_id, f.status, f.created_at, f.responded_at, o.category, o.delivery_fee FROM order_offers f
       JOIN orders o ON o.id = f.order_id WHERE f.courier_id = ? ORDER BY f.id DESC LIMIT 40`
    )
    .all(id)
    .map((f) => ({
      orderId: f.order_id,
      number: num(f.order_id),
      status: f.status,
      category: f.category,
      fee: f.delivery_fee,
      at: f.created_at,
      seconds: f.responded_at ? Math.round((Date.parse(f.responded_at) - Date.parse(f.created_at)) / 1000) : null,
    }))

  const n = (o) => ({ total: o.total || 0, accepted: o.accepted || 0, declined: o.declined || 0, expired: o.expired || 0 })
  const o30 = n(offers(since(30)))
  const locFresh = c.loc_at && Date.parse(c.loc_at) > Date.now() - 10 * 60_000
  return {
    courier: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      active: !!c.active,
      online: !!c.online,
      supervisor: !!c.is_supervisor,
      photo: c.photo ? `/api/media/${c.photo}` : null,
      vehicle: c.vehicle,
      nationalId: c.national_id,
      homeAddress: c.home_address,
      notes: c.notes,
      docs: { front: !!c.id_front, back: !!c.id_back, license: !!c.license_doc },
      createdAt: c.created_at,
      lastSeen: c.last_seen_at,
      lastAssigned: c.last_assigned_at,
      firstDelivery: first,
      location: locFresh ? { lat: c.lat, lng: c.lng, at: c.loc_at, accuracy: c.loc_accuracy } : null,
      locationAt: c.loc_at,
      wallet: courierWallet(id),
      device: c.device ? { ...JSON.parse(c.device), at: c.device_at } : null,
    },
    stats: {
      today: delivered(today),
      week: delivered(since(7)),
      month: delivered(since(30)),
      all: delivered('0000'),
      open,
      cancelled30: cancelled,
      offers30: { ...o30, acceptRate: o30.total ? Math.round((o30.accepted / o30.total) * 100) : null },
      rating: { avg: rating.avg, count: rating.n },
    },
    orders,
    offers: offerList,
  }
}
