// ─────────────────────────────────────────────────────────────
// التوزيع التلقائي للطلبات على شباب التوصيل
//
// الخوارزمية (لكل طلب جديد):
//  1) المرشحين: كل شب مفعّل + "متاح" + ما انعرض عليه هالطلب بهالجولة
//     + حمولته (طلباته المفتوحة + العروض المعلّقة عليه) أقل من الحد (3).
//  2) الترتيب:
//     أ. الفاضيين أولاً (حمولة 0) — والأولوية للي صرلو أطول وقت بلا طلب (عدالة بالدور).
//     ب. إذا الكل مشغول: الأقل حمولة، وبعدها الأقرب (أقرب نقطة توصيل عنده لموقع
//        الطلب الجديد) — حتى ياخد الطلب اللي على طريقه. ما منجمع طلب بعيد أكتر من 4 كم.
//  3) منعرض الطلب على أول مرشح لمدة محددة (60 ثانية). إذا رفض أو ما ردّ → اللي بعده.
//  4) إذا خلصت الجولة وما حدا قبل → تنبيه للإدارة + جولة جديدة بعد دقيقتين.
//
// الحماية من التضارب (طلبين بنفس اللحظة / شبين بيقبلوا بنفس اللحظة):
//  - كل عملية توزيع تتم داخل معاملة BEGIN IMMEDIATE (قفل كتابة كامل) والتنفيذ
//    متسلسل بخيط واحد، فحمولة الشب تنحسب وفيها العرض اللي انعمل قبل لحظة.
//  - فهرس فريد بالقاعدة: الطلب ما بيكون معروض إلا على شب واحد بنفس الوقت.
//  - القبول: تحديث مشروط (الطلب لسا "جديد" وبلا شب + العرض لسا معلّق وما انتهى
//    + حمولة الشب أقل من الحد) — إذا أي شرط فشل، القبول بيرفض بدل ما يتكرر.
// ─────────────────────────────────────────────────────────────
import { db, getSettings } from './db.mjs'
import { distanceKm, log, now } from './lib.mjs'
import { notify } from './push.mjs'

const OPEN = `('assigned','buying','on_the_way')`
const MAX_BATCH_KM = 4 // أبعد مسافة بين طلبين لنجمعهم مع نفس الشب
const ROUND_PAUSE_MS = 2 * 60 * 1000
const MAX_MISSED = 3 // بعد 3 عروض بلا رد، الشب بيصير "غير متاح" تلقائياً
const CATEGORY_AR = { any: 'أي شي', restaurants: 'مطعم', supermarket: 'سوبرماركت', pharmacy: 'صيدلية', library: 'مكتبة', diesel: 'مازوت', other: 'غير ذلك', gas: 'غاز' }

const iso = (ms) => new Date(ms).toISOString()
const num = (id) => `D-${1000 + id}`

function cfg() {
  const s = getSettings()
  return {
    enabled: s.auto_dispatch === 1,
    timeoutMs: Math.max(15, s.offer_timeout_sec || 60) * 1000,
    max: Math.min(Math.max(1, s.max_orders_per_courier || 3), 10),
  }
}

/** حمولة الشب = طلباته المفتوحة + العروض المعلّقة عليه */
export function courierLoad(courierId) {
  const open = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE courier_id = ? AND status IN ${OPEN}`).get(courierId).n
  const offers = db.prepare(`SELECT COUNT(*) AS n FROM order_offers WHERE courier_id = ? AND status = 'pending'`).get(courierId).n
  return open + offers
}

function tx(fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** يختار أفضل شب لطلب معيّن (أو null) */
function pickCourier(order, max) {
  const candidates = db
    .prepare(
      `SELECT c.id, c.name, c.last_assigned_at, c.missed_offers FROM couriers c
       WHERE c.active = 1 AND c.online = 1
         AND c.id NOT IN (SELECT courier_id FROM order_offers WHERE order_id = ? AND round = ?)`
    )
    .all(order.id, order.dispatch_round)

  const here = { lat: order.lat, lng: order.lng }
  const scored = []
  for (const c of candidates) {
    const load = courierLoad(c.id)
    if (load >= max) continue
    let nearestKm = null
    if (load > 0) {
      const drops = db.prepare(`SELECT lat, lng FROM orders WHERE courier_id = ? AND status IN ${OPEN}`).all(c.id)
      for (const d of drops) {
        const km = distanceKm(here, d)
        if (nearestKm === null || km < nearestKm) nearestKm = km
      }
      // شب مشغول وطلباته بعيدة عن هالطلب → ما منحمّلو ياه
      if (nearestKm !== null && nearestKm > MAX_BATCH_KM) continue
    }
    scored.push({ ...c, load, nearestKm: nearestKm ?? 0 })
  }
  scored.sort(
    (a, b) =>
      a.load - b.load || // الفاضي أولاً، ثم الأقل حمولة
      a.nearestKm - b.nearestKm || // الأقرب لطريقه
      a.missed_offers - b.missed_offers || // اللي بيرد على العروض قبل اللي بيطنّش
      (a.last_assigned_at || '').localeCompare(b.last_assigned_at || '') // الأقدم بلا طلب (عدالة)
  )
  return scored[0] || null
}

/** يحاول يعرض طلب على الشب المناسب. ترجع true إذا انعمل عرض. */
export function dispatchOrder(orderId) {
  const { enabled, timeoutMs, max } = cfg()
  if (!enabled) return false
  let offer = null
  let exhausted = null

  tx(() => {
    const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND status = 'new' AND courier_id IS NULL`).get(orderId)
    if (!order) return
    if (order.next_dispatch_at && order.next_dispatch_at > now()) return
    if (db.prepare(`SELECT 1 FROM order_offers WHERE order_id = ? AND status = 'pending'`).get(orderId)) return

    const c = pickCourier(order, max)
    if (c) {
      const r = db
        .prepare(`INSERT INTO order_offers (order_id, courier_id, round, expires_at) VALUES (?, ?, ?, ?)`)
        .run(order.id, c.id, order.dispatch_round, iso(Date.now() + timeoutMs))
      offer = { id: Number(r.lastInsertRowid), courier: c, order }
      return
    }
    // ما في حدا مناسب هلق: جولة جديدة بعد استراحة، ومنخبّر الإدارة مرة وحدة بكل جولة
    const triedThisRound = db
      .prepare(`SELECT COUNT(*) AS n FROM order_offers WHERE order_id = ? AND round = ?`)
      .get(order.id, order.dispatch_round).n
    db.prepare(`UPDATE orders SET dispatch_round = dispatch_round + ?, next_dispatch_at = ? WHERE id = ?`).run(
      triedThisRound > 0 ? 1 : 0,
      iso(Date.now() + (triedThisRound > 0 ? ROUND_PAUSE_MS : 30_000)),
      order.id
    )
    exhausted = { order, tried: triedThisRound }
  })

  if (offer) {
    const o = offer.order
    const d = JSON.parse(o.details)
    log('info', 'offer created', { orderId: o.id, courierId: offer.courier.id, load: offer.courier.load, round: o.dispatch_round })
    notify('courier', offer.courier.id, {
      title: `🔔 طلب جديد ${num(o.id)} — ${CATEGORY_AR[o.category] || ''}`,
      body: `${o.kind === 'gas' ? `${d.qty} جرة غاز` : (d.items || 'طلب مرفق بصورة').slice(0, 80)}\nلديك ${Math.round(timeoutMs / 1000)} ثانية لقبوله`,
      url: '/driver',
      tag: `offer-${o.id}`,
    })
    return true
  }
  // تنبيه للإدارة: عند انتهاء جولة كاملة بلا قبول، أو أول مرة ما يكون في ولا شب متاح
  const fresh = exhausted && Date.now() - new Date(exhausted.order.created_at).getTime() < 40_000
  if (exhausted && (exhausted.tried > 0 || fresh)) {
    notify('admin', 0, {
      title: `⚠️ الطلب ${num(exhausted.order.id)} بدون عامل توصيل`,
      body: exhausted.tried > 0 ? 'لم يقبله أي عامل متاح. سنعيد المحاولة بعد دقيقتين، أو يمكنك تسليمه يدوياً.' : 'لا يوجد عامل توصيل متاح الآن. الطلب بالانتظار.',
      url: '/admin',
      tag: `nocourier-${exhausted.order.id}`,
    })
  }
  return false
}

/** الشب قبل العرض — ترجع الطلب أو ترمي خطأ مفهوم */
export function acceptOffer(offerId, courier) {
  const { max } = cfg()
  const result = tx(() => {
    const off = db.prepare(`SELECT * FROM order_offers WHERE id = ? AND courier_id = ?`).get(offerId, courier.id)
    if (!off) return { error: 'NOT_FOUND' }
    if (off.status !== 'pending') return { error: 'OFFER_GONE' }
    if (off.expires_at <= now()) return { error: 'OFFER_EXPIRED' }
    // الحمولة بدون هالعرض نفسه
    const open = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE courier_id = ? AND status IN ${OPEN}`).get(courier.id).n
    if (open >= max) return { error: 'TOO_MANY' }
    const ts = now()
    const r = db
      .prepare(
        `UPDATE orders SET status = 'assigned', courier_id = ?, courier_name = ?, courier_phone = ?, updated_at = ?
         WHERE id = ? AND status = 'new' AND courier_id IS NULL`
      )
      .run(courier.id, courier.name, courier.phone, ts, off.order_id)
    if (r.changes !== 1) {
      db.prepare(`UPDATE order_offers SET status = 'cancelled', responded_at = ? WHERE id = ?`).run(ts, off.id)
      return { error: 'OFFER_GONE' }
    }
    db.prepare(`UPDATE order_offers SET status = 'accepted', responded_at = ? WHERE id = ?`).run(ts, off.id)
    db.prepare(`UPDATE couriers SET last_assigned_at = ?, missed_offers = 0 WHERE id = ?`).run(ts, courier.id)
    db.prepare(`INSERT INTO order_events (order_id, status, actor, created_at) VALUES (?, 'assigned', ?, ?)`).run(
      off.order_id, `courier:${courier.id}`, ts)
    return { orderId: off.order_id }
  })
  if (result.error) return result
  const o = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(result.orderId)
  log('info', 'offer accepted', { orderId: result.orderId, courierId: courier.id })
  notify('customer', o.customer_id, { title: `ضواحي: الطلب ${num(result.orderId)}`, body: `${courier.name} استلم طلبك وسيتواصل معك قريباً`, url: '/', tag: `order-${result.orderId}` })
  return result
}

export function declineOffer(offerId, courier) {
  const off = tx(() => {
    const off = db.prepare(`SELECT * FROM order_offers WHERE id = ? AND courier_id = ? AND status = 'pending'`).get(offerId, courier.id)
    if (!off) return null
    db.prepare(`UPDATE order_offers SET status = 'declined', responded_at = ? WHERE id = ?`).run(now(), off.id)
    db.prepare(`UPDATE couriers SET missed_offers = 0 WHERE id = ?`).run(courier.id)
    return off
  })
  if (off) {
    log('info', 'offer declined', { orderId: off.order_id, courierId: courier.id })
    dispatchOrder(off.order_id) // فوراً للشب اللي بعده
  }
  return !!off
}

/** يلغي أي عرض معلّق على طلب (لما ينلغي الطلب أو الإدارة تسلّمه يدوياً) */
export function cancelOffers(orderId) {
  const pending = db.prepare(`SELECT id, courier_id FROM order_offers WHERE order_id = ? AND status = 'pending'`).all(orderId)
  if (!pending.length) return
  db.prepare(`UPDATE order_offers SET status = 'cancelled', responded_at = ? WHERE order_id = ? AND status = 'pending'`).run(now(), orderId)
  for (const p of pending)
    notify('courier', p.courier_id, { title: `❌ ${num(orderId)}`, body: 'لم يعد هذا الطلب متاحاً', url: '/driver', tag: `offer-${orderId}` })
}

/** دورة كل 5 ثوانٍ: ننهي العروض المنتهية، ونوزّع الطلبات المنتظرة بالترتيب (الأقدم أولاً) */
let ticking = false
export function tick() {
  if (ticking) return
  ticking = true
  try {
    const expired = db.prepare(`SELECT id, order_id, courier_id FROM order_offers WHERE status = 'pending' AND expires_at <= ?`).all(now())
    for (const e of expired) {
      const changed = tx(() => {
        const r = db.prepare(`UPDATE order_offers SET status = 'expired', responded_at = ? WHERE id = ? AND status = 'pending'`).run(now(), e.id)
        if (r.changes !== 1) return false
        db.prepare(`UPDATE couriers SET missed_offers = missed_offers + 1 WHERE id = ?`).run(e.courier_id)
        const c = db.prepare(`SELECT missed_offers FROM couriers WHERE id = ?`).get(e.courier_id)
        if (c.missed_offers >= MAX_MISSED) {
          db.prepare(`UPDATE couriers SET online = 0, missed_offers = 0 WHERE id = ?`).run(e.courier_id)
          return 'offline'
        }
        return true
      })
      if (!changed) continue
      log('info', 'offer expired', { orderId: e.order_id, courierId: e.courier_id })
      if (changed === 'offline') {
        log('info', 'courier set offline after missed offers', { courierId: e.courier_id })
        notify('courier', e.courier_id, {
          title: 'تم إيقاف استقبال الطلبات مؤقتاً',
          body: `لم ترد على ${MAX_MISSED} طلبات متتالية. افتح التطبيق وفعّل "متاح" عندما تكون جاهزاً.`,
          url: '/driver',
          tag: 'offline',
        })
      }
    }
    if (!cfg().enabled) return
    const waiting = db
      .prepare(
        `SELECT id FROM orders o WHERE status = 'new' AND courier_id IS NULL
           AND (next_dispatch_at IS NULL OR next_dispatch_at <= ?)
           AND NOT EXISTS (SELECT 1 FROM order_offers f WHERE f.order_id = o.id AND f.status = 'pending')
         ORDER BY id`
      )
      .all(now())
    for (const w of waiting) dispatchOrder(w.id)
  } catch (err) {
    log('error', 'dispatch tick failed', { err: err?.stack || String(err) })
  } finally {
    ticking = false
  }
}

export function startDispatcher() {
  setInterval(tick, 5000).unref()
}

/**
 * لما يصير في مكان جديد (شب صار متاح، أو خلّص طلب): نلغي فترة الانتظار عن الطلبات
 * المعلّقة ونوزّع فوراً بدل ما ننطر الدورة الجاية
 */
export const nudge = () =>
  setImmediate(() => {
    try {
      db.prepare(`UPDATE orders SET next_dispatch_at = NULL WHERE status = 'new' AND courier_id IS NULL`).run()
    } catch {}
    tick()
  })
