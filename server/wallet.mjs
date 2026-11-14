// الحسابات ورصيد عمال التوصيل
// - كل طلب واصل: عمولة التطبيق (مثلاً 50) بتنخصم من رصيد العامل، والباقي من أجرة التوصيل إله
// - إذا الطلب عليه حسم توصيل (كود/نقاط)، التطبيق بيتحمّل الحسم: بينخصم من العمولة، وإذا زاد بيرجع للعامل
// - الرصيد السالب = مصاري لإلك عند العامل
// - إذا "نظام الرصيد" مفعّل: العامل يلي رصيده ما بيكفي ما بيوصله طلبات جديدة
import { db } from './db.mjs'
import { HttpError, bad, now, readJson, send, log } from './lib.mjs'

export function walletConfig() {
  const s = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE key IN ('commission_per_order','wallet_enabled')").all().map((r) => [r.key, Number(r.value)])
  )
  return { commission: s.commission_per_order ?? 50, enabled: !!s.wallet_enabled }
}

/** هل رصيد العامل بيكفي لطلب جديد؟ (منحسب حساب طلباته المفتوحة) */
export function hasCredit(courierId, openLoad, cfg = walletConfig()) {
  if (!cfg.enabled || cfg.commission <= 0) return true
  const b = db.prepare('SELECT balance FROM couriers WHERE id = ?').get(courierId)?.balance ?? 0
  return b - cfg.commission * openLoad >= cfg.commission
}

function addEntry(courierId, kind, amount, { orderId = null, note = '', actor = '' } = {}) {
  db.prepare('UPDATE couriers SET balance = balance + ? WHERE id = ?').run(amount, courierId)
  const after = db.prepare('SELECT balance FROM couriers WHERE id = ?').get(courierId).balance
  db.prepare(
    'INSERT INTO courier_ledger (courier_id, kind, amount, order_id, note, actor, balance_after) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(courierId, kind, amount, orderId, note, actor, after)
  return after
}

/** طلب وصل: خصم العمولة مرة وحدة بس */
export function chargeCommission(orderId) {
  try {
    const o = db.prepare("SELECT id, courier_id, delivery_fee, details FROM orders WHERE id = ? AND status = 'delivered'").get(orderId)
    if (!o?.courier_id) return
    if (db.prepare("SELECT 1 FROM courier_ledger WHERE order_id = ? AND kind = 'commission'").get(orderId)) return
    const { commission } = walletConfig()
    const perk = JSON.parse(o.details || '{}').perk
    const discount = perk ? Math.max(0, (perk.feeBefore ?? o.delivery_fee) - o.delivery_fee) : 0
    const charge = commission - discount // ممكن يطلع سالب = التطبيق بيدفع للعامل فرق الحسم
    if (!charge) return
    db.exec('SAVEPOINT commission')
    try {
      addEntry(o.courier_id, 'commission', -charge, {
        orderId,
        note: discount ? `عمولة ${commission} - حسم ${discount}` : `عمولة الطلب`,
      })
      db.exec('RELEASE commission')
    } catch (err) {
      db.exec('ROLLBACK TO commission')
      db.exec('RELEASE commission')
      throw err
    }
  } catch (err) {
    log('error', 'commission failed', { orderId, err: err.message })
  }
}

// للعامل بتطبيقه
export function courierWallet(courierId) {
  const cfg = walletConfig()
  const balance = db.prepare('SELECT balance FROM couriers WHERE id = ?').get(courierId)?.balance ?? 0
  return {
    enabled: cfg.enabled,
    commission: cfg.commission,
    balance,
    ordersLeft: cfg.commission > 0 ? Math.max(0, Math.floor(balance / cfg.commission)) : null,
  }
}

const dayStartUtc = (day) => new Date(`${day}T00:00:00+03:00`).toISOString()
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')

export async function adminWalletRoute(req, res, url, need, me) {
  const { pathname } = url
  const m = req.method

  if (pathname === '/api/admin/accounts' && m === 'GET') {
    need('accounts.manage')
    const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)
    const from = isDay(url.searchParams.get('from')) ? url.searchParams.get('from') : today
    const to = isDay(url.searchParams.get('to')) ? url.searchParams.get('to') : from
    if (to < from) throw bad('INVALID', 'Invalid range', 'to')
    const a = dayStartUtc(from)
    const b = new Date(Date.parse(dayStartUtc(to)) + 86400e3).toISOString()
    const cfg = walletConfig()

    // الطلبات الواصلة بالفترة (حسب وقت التسليم)
    const delivered = db
      .prepare(
        `SELECT o.id, o.courier_id, o.delivery_fee, o.details
         FROM orders o JOIN order_events e ON e.order_id = o.id AND e.status = 'delivered'
         WHERE o.status = 'delivered' AND e.created_at >= ? AND e.created_at < ?`
      )
      .all(a, b)
    const per = new Map()
    let fees = 0
    let discounts = 0
    for (const o of delivered) {
      const perk = JSON.parse(o.details || '{}').perk
      const disc = perk ? Math.max(0, (perk.feeBefore ?? o.delivery_fee) - o.delivery_fee) : 0
      fees += o.delivery_fee
      discounts += disc
      const r = per.get(o.courier_id) || { delivered: 0, fees: 0 }
      r.delivered++
      r.fees += o.delivery_fee
      per.set(o.courier_id, r)
    }
    // العمولات والشحن من الدفتر بالفترة
    const ledger = db
      .prepare(`SELECT courier_id, kind, SUM(amount) AS s FROM courier_ledger WHERE created_at >= ? AND created_at < ? GROUP BY courier_id, kind`)
      .all(a, b)
    const led = new Map()
    for (const l of ledger) {
      const r = led.get(l.courier_id) || { commission: 0, topup: 0, adjust: 0 }
      r[l.kind] = l.s
      led.set(l.courier_id, r)
    }
    const couriers = db
      .prepare('SELECT id, name, phone, balance, active FROM couriers ORDER BY active DESC, name')
      .all()
      .map((c) => {
        const p = per.get(c.id) || { delivered: 0, fees: 0 }
        const l = led.get(c.id) || { commission: 0, topup: 0, adjust: 0 }
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          active: !!c.active,
          delivered: p.delivered,
          fees: p.fees,
          commission: -l.commission, // موجب = للتطبيق
          topups: l.topup,
          balance: c.balance,
          canWork: !cfg.enabled || c.balance >= cfg.commission,
        }
      })
      .filter((c) => c.active || c.delivered || c.balance)
    const commissionTotal = couriers.reduce((s, c) => s + c.commission, 0)
    send(res, 200, {
      from,
      to,
      config: cfg,
      totals: {
        orders: delivered.length,
        fees,
        discounts,
        commission: commissionTotal,
        couriersShare: fees - commissionTotal,
        topups: couriers.reduce((s, c) => s + c.topups, 0),
        owed: couriers.reduce((s, c) => s + (c.balance < 0 ? -c.balance : 0), 0),
      },
      couriers,
    })
    return true
  }

  if (pathname === '/api/admin/accounts/settings' && m === 'PUT') {
    need('accounts.manage')
    const body = await readJson(req)
    const put = (k, v) =>
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v))
    if (body.commission !== undefined) {
      const n = Number(body.commission)
      if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw bad('INVALID', 'Invalid commission', 'commission')
      put('commission_per_order', n)
    }
    if (body.enabled !== undefined) put('wallet_enabled', body.enabled ? 1 : 0)
    log('info', 'wallet settings', { by: me.name, ...walletConfig() })
    send(res, 200, { config: walletConfig() })
    return true
  }

  let mm = /^\/api\/admin\/couriers\/(\d{1,9})\/topup$/.exec(pathname)
  if (mm && m === 'POST') {
    need('accounts.manage')
    const id = Number(mm[1])
    if (!db.prepare('SELECT 1 FROM couriers WHERE id = ?').get(id)) throw new HttpError(404, 'NOT_FOUND', 'Courier not found')
    const body = await readJson(req)
    const amount = Number(body.amount)
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100_000_000) throw bad('INVALID', 'Invalid amount', 'amount')
    const note = String(body.note || '').trim().slice(0, 120)
    const kind = amount > 0 && !body.adjust ? 'topup' : 'adjust'
    db.exec('BEGIN IMMEDIATE')
    let after
    try {
      after = addEntry(id, kind, amount, { note, actor: me.name })
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    log('info', 'courier topup', { courierId: id, amount, kind, by: me.name })
    send(res, 200, { balance: after })
    return true
  }

  mm = /^\/api\/admin\/couriers\/(\d{1,9})\/ledger$/.exec(pathname)
  if (mm && m === 'GET') {
    need('accounts.manage')
    const rows = db
      .prepare(
        `SELECT l.id, l.kind, l.amount, l.note, l.actor, l.balance_after AS balanceAfter, l.created_at AS createdAt, l.order_id AS orderId
         FROM courier_ledger l WHERE l.courier_id = ? ORDER BY l.id DESC LIMIT 100`
      )
      .all(Number(mm[1]))
    send(res, 200, { entries: rows.map((r) => ({ ...r, number: r.orderId ? `D-${1000 + r.orderId}` : null })) })
    return true
  }
  return false
}
