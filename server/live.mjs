// المراقبة الحية: مين فاتح التطبيق هلق، الزيارات، التثبيتات، مواقع عمال التوصيل، ولقطة كاملة للوحة الإدارة
import { db } from './db.mjs'
import { bad, now, clientIp, rateLimit, readJson, send } from './lib.mjs'

const APPS = ['customer', 'driver', 'download']
const ONLINE_MS = 75 * 1000 // يعتبر "متصل" إذا وصلتنا نبضة خلال آخر 75 ثانية
const LOC_FRESH_MS = 3 * 60 * 1000 // موقع العامل يعتبر حديث لمدة 3 دقائق
const isDevice = (d) => typeof d === 'string' && /^[A-Za-z0-9_-]{16,40}$/.test(d)

// الحضور بالذاكرة فقط (ما في داعي نكتب كل نبضة بالقاعدة)
const presence = new Map() // `${app}:${device}` -> { app, at }
setInterval(() => {
  const cut = Date.now() - ONLINE_MS
  for (const [k, v] of presence) if (v.at < cut) presence.delete(k)
}, 30_000).unref()

/** يوم دمشق الحالي بصيغة YYYY-MM-DD (دمشق UTC+3 طوال السنة) */
export const damascusDay = (t = Date.now()) => new Date(t + 3 * 3600 * 1000).toISOString().slice(0, 10)
export function damascusMidnightUtc() {
  const d = new Date(Date.now() + 3 * 3600 * 1000)
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString()
}

const visitStmt = db.prepare('INSERT OR IGNORE INTO app_visits (day, device_id, app) VALUES (?, ?, ?)')
const installStmt = db.prepare('INSERT OR IGNORE INTO app_installs (device_id, app, created_at) VALUES (?, ?, ?)')

/** POST /api/presence — نبضة من أي تطبيق كل ~30 ثانية */
export async function presenceRoute(req, res) {
  rateLimit(`presence:${clientIp(req)}`, 120, 60 * 1000)
  const body = await readJson(req)
  const device = body.deviceId
  const app = body.app
  if (!isDevice(device)) throw bad('INVALID', 'bad device id', 'deviceId')
  if (!APPS.includes(app)) throw bad('INVALID', 'bad app', 'app')
  presence.set(`${app}:${device}`, { app, at: Date.now() })
  visitStmt.run(damascusDay(), device, app)
  // التطبيق مثبّت على الشاشة الرئيسية (أو انثبّت هلق)
  if ((body.installed || body.standalone) && app !== 'download') installStmt.run(device, app, now())
  return send(res, 204)
}

/** POST /api/courier/location — موقع العامل وهو متصل */
export async function courierLocation(req, res, me) {
  rateLimit(`loc:${me.id}`, 30, 60 * 1000)
  const { lat, lng, accuracy } = await readJson(req)
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw bad('INVALID', 'bad location', 'lat')
  const acc = typeof accuracy === 'number' && accuracy >= 0 ? Math.min(accuracy, 100000) : null
  db.prepare('UPDATE couriers SET lat = ?, lng = ?, loc_accuracy = ?, loc_at = ? WHERE id = ?').run(lat, lng, acc, now(), me.id)
  presence.set(`driver:courier-${me.id}`, { app: 'driver', at: Date.now() })
  return send(res, 204)
}

const countOnline = (app) => {
  const cut = Date.now() - ONLINE_MS
  let n = 0
  for (const v of presence.values()) if (v.app === app && v.at >= cut) n++
  return n
}

/** لقطة كاملة للوحة المراقبة الحية */
export function liveSnapshot() {
  const since = damascusMidnightUtc()
  const day = damascusDay()

  const t = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'delivered'), 0) AS delivered,
              COALESCE(SUM(status = 'cancelled'), 0) AS cancelled,
              COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee END), 0) AS fees,
              COALESCE(SUM(CASE WHEN status = 'delivered' AND kind = 'gas'
                                THEN json_extract(details, '$.estimate') - delivery_fee END), 0) AS gas
       FROM orders WHERE created_at >= ?`
    )
    .get(since)

  // الطلبات حسب الساعة (بتوقيت دمشق)
  const hourly = Array(24).fill(0)
  for (const r of db
    .prepare(
      `SELECT CAST(strftime('%H', created_at, '+3 hours') AS INTEGER) AS h, COUNT(*) AS n
       FROM orders WHERE created_at >= ? GROUP BY h`
    )
    .all(since))
    hourly[r.h] = r.n

  const visits = db
    .prepare(
      `SELECT COUNT(DISTINCT device_id) AS visitors,
              COUNT(DISTINCT CASE WHEN app = 'download' THEN device_id END) AS downloadPage
       FROM app_visits WHERE day = ? AND app IN ('customer','download')`
    )
    .get(day)
  const installs = db
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= ?), 0) AS today FROM app_installs WHERE app = 'customer'`)
    .get(since)

  const active = db
    .prepare(
      `SELECT o.id, o.kind, o.status, o.category, o.details, o.lat, o.lng, o.address, o.courier_id, o.courier_name,
              o.created_at, o.updated_at, c.name AS customer_name, c.phone AS customer_phone,
              (SELECT f.expires_at FROM order_offers f WHERE f.order_id = o.id AND f.status = 'pending') AS offer_expires,
              (SELECT cc.name FROM order_offers f JOIN couriers cc ON cc.id = f.courier_id
                WHERE f.order_id = o.id AND f.status = 'pending') AS offer_to,
              (SELECT e.created_at FROM order_events e WHERE e.order_id = o.id ORDER BY e.id DESC LIMIT 1) AS status_at
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status IN ('new','assigned','buying','on_the_way') ORDER BY o.id ASC LIMIT 200`
    )
    .all()
    .map((r) => {
      const d = JSON.parse(r.details)
      return {
        id: r.id,
        number: `D-${1000 + r.id}`,
        kind: r.kind,
        status: r.status,
        category: r.category,
        summary: r.kind === 'gas' ? `غاز · ${d.qty} جرة` : String(d.items || 'طلب مرفق بصورة').slice(0, 90),
        location: { lat: r.lat, lng: r.lng },
        address: r.address,
        customer: { name: r.customer_name, phone: r.customer_phone },
        courierId: r.courier_id ?? null,
        courierName: r.courier_name || '',
        offer: r.offer_expires ? { to: r.offer_to, expiresAt: r.offer_expires } : null,
        createdAt: r.created_at,
        statusAt: r.status_at || r.updated_at,
      }
    })

  const load = new Map()
  for (const o of active) if (o.courierId) load.set(o.courierId, (load.get(o.courierId) || 0) + 1)
  const freshCut = Date.now() - LOC_FRESH_MS
  const couriers = db
    .prepare('SELECT id, name, phone, online, lat, lng, loc_at FROM couriers WHERE active = 1 ORDER BY name')
    .all()
    .map((c) => {
      const n = load.get(c.id) || 0
      const fresh = c.loc_at && Date.parse(c.loc_at) >= freshCut
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        state: !c.online ? 'offline' : n > 0 ? 'busy' : 'free',
        orders: n,
        location: c.lat != null ? { lat: c.lat, lng: c.lng, at: c.loc_at, fresh: !!fresh } : null,
      }
    })

  return {
    at: now(),
    online: { customers: countOnline('customer'), drivers: couriers.filter((c) => c.state !== 'offline').length, downloadPage: countOnline('download') },
    today: {
      orders: t.total,
      delivered: t.delivered,
      cancelled: t.cancelled,
      deliveryFees: t.fees,
      gasSales: Math.max(0, Math.round(t.gas)),
      visitors: visits.visitors,
      downloadPageVisitors: visits.downloadPage,
      installs: installs.today,
      hourly,
    },
    installsTotal: installs.total,
    customersTotal: db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,
    couriers,
    active,
  }
}
