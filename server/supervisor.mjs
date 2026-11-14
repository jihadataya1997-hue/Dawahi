// وضع المشرف داخل تطبيق السائقين: يشوف السائقين والطلبات، يحوّل الطلبات، ويعمل السائق متاح/غير متاح
// (إلغاء الطلبات بيضل للإدارة بس)
import { db } from './db.mjs'
import { HttpError, bad, now, readJson, send, log } from './lib.mjs'
import { notify } from './push.mjs'
import { cancelOffers, nudge } from './dispatch.mjs'
import { liveSnapshot } from './live.mjs'

const num = (id) => `D-${1000 + id}`
const ALERT_AFTER_MIN = 5

export async function supervisorRoute(req, res, url, me) {
  if (!me.is_supervisor) throw new HttpError(403, 'FORBIDDEN', 'Supervisor only')
  const { pathname } = url
  const m = req.method

  if (m === 'GET' && pathname === '/api/courier/sup/overview') {
    const snap = liveSnapshot()
    // المشرف ما بيحتاج أرقام المبيعات
    return send(res, 200, { at: snap.at, couriers: snap.couriers, active: snap.active, waitingAlertMin: ALERT_AFTER_MIN })
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
