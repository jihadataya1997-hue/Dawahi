// كودات الحسم ونقاط الزبائن
import { db } from './db.mjs'
import { HttpError, bad, now, str, readJson, send, log } from './lib.mjs'

const normCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '')

const toCode = (r) => ({
  id: r.id,
  code: r.code,
  kind: r.kind,
  value: r.value,
  firstOrderOnly: !!r.first_order_only,
  maxUses: r.max_uses,
  perCustomer: r.per_customer,
  expiresAt: r.expires_at,
  active: !!r.active,
  note: r.note,
  uses: r.uses ?? 0,
  createdAt: r.created_at,
})

export function pointsConfig() {
  const s = Object.fromEntries(
    db.prepare("SELECT key, value FROM settings WHERE key IN ('points_per_order','points_free_delivery')").all().map((r) => [r.key, Number(r.value)])
  )
  return { perOrder: s.points_per_order ?? 1, forFree: s.points_free_delivery ?? 10 }
}

// حساب الحسم على أجرة التوصيل (بيرمي خطأ مفهوم إذا الكود ما بيصلح)
export function checkPromo(rawCode, customerId, fee) {
  const code = normCode(rawCode)
  if (!code) return null
  const c = db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code)
  if (!c || !c.active) throw new HttpError(400, 'PROMO_INVALID', 'This code is not valid')
  if (c.expires_at && c.expires_at < now()) throw new HttpError(400, 'PROMO_EXPIRED', 'This code has expired')
  if (c.max_uses) {
    const used = db.prepare('SELECT COUNT(*) AS n FROM promo_redemptions WHERE code_id = ?').get(c.id).n
    if (used >= c.max_uses) throw new HttpError(400, 'PROMO_USED_UP', 'This code has been used up')
  }
  const mine = db.prepare('SELECT COUNT(*) AS n FROM promo_redemptions WHERE code_id = ? AND customer_id = ?').get(c.id, customerId).n
  if (mine >= c.per_customer) throw new HttpError(400, 'PROMO_ALREADY_USED', 'You already used this code')
  if (c.first_order_only) {
    const prev = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND status != 'cancelled'").get(customerId).n
    if (prev > 0) throw new HttpError(400, 'PROMO_FIRST_ONLY', 'This code is for the first order only')
  }
  const discount = c.kind === 'free' ? fee : c.kind === 'amount' ? Math.min(fee, c.value) : Math.min(fee, Math.round((fee * Math.min(c.value, 100)) / 100))
  return { id: c.id, code: c.code, kind: c.kind, discount }
}

/**
 * بيطبّق الكود أو النقاط على الطلب قبل حفظه (جوّا نفس العملية)
 * بيرجع { fee, perk } — perk بيتخزن بتفاصيل الطلب ليبيّن للزبون وللعامل
 */
export function applyPerks(o, body, customerId) {
  const fee = o.deliveryFee
  if (body.usePoints) {
    const { forFree } = pointsConfig()
    const pts = db.prepare('SELECT points FROM customers WHERE id = ?').get(customerId)?.points || 0
    if (!forFree || pts < forFree) throw new HttpError(400, 'POINTS_NOT_ENOUGH', 'Not enough points')
    return { fee: 0, perk: { type: 'points', points: forFree, discount: fee, feeBefore: fee }, pointsUsed: forFree }
  }
  const p = checkPromo(body.promoCode, customerId, fee)
  if (!p) return { fee, perk: null }
  return { fee: fee - p.discount, perk: { type: 'promo', code: p.code, discount: p.discount, feeBefore: fee }, promoId: p.id }
}

// بعد حفظ الطلب: تسجيل استعمال الكود أو خصم النقاط
export function recordPerks(orderId, customerId, applied) {
  if (applied.promoId)
    db.prepare('INSERT INTO promo_redemptions (code_id, customer_id, order_id, discount) VALUES (?, ?, ?, ?)').run(
      applied.promoId, customerId, orderId, applied.perk.discount)
  if (applied.pointsUsed) {
    const r = db.prepare('UPDATE customers SET points = points - ? WHERE id = ? AND points >= ?').run(applied.pointsUsed, customerId, applied.pointsUsed)
    if (!r.changes) throw new HttpError(400, 'POINTS_NOT_ENOUGH', 'Not enough points')
    db.prepare('UPDATE orders SET points_used = ? WHERE id = ?').run(applied.pointsUsed, orderId)
  }
}

// طلب انلغى: الكود بيرجع صالح والنقاط بترجع
export function releasePerks(orderId) {
  try {
    db.prepare('DELETE FROM promo_redemptions WHERE order_id = ?').run(orderId)
    const o = db.prepare('SELECT customer_id, points_used FROM orders WHERE id = ?').get(orderId)
    if (o?.points_used) {
      db.prepare('UPDATE orders SET points_used = 0 WHERE id = ?').run(orderId)
      db.prepare('UPDATE customers SET points = points + ? WHERE id = ?').run(o.points_used, o.customer_id)
    }
  } catch (err) {
    log('error', 'release perks failed', { orderId, err: err.message })
  }
}

// طلب وصل: الزبون بياخد نقاط (مرة وحدة لكل طلب)
export function awardPoints(orderId) {
  try {
    const { perOrder } = pointsConfig()
    if (!perOrder) return
    const r = db.prepare("UPDATE orders SET points_awarded = ? WHERE id = ? AND points_awarded = 0 AND status = 'delivered'").run(perOrder, orderId)
    if (!r.changes) return
    db.prepare('UPDATE customers SET points = points + ? WHERE id = (SELECT customer_id FROM orders WHERE id = ?)').run(perOrder, orderId)
  } catch (err) {
    log('error', 'award points failed', { orderId, err: err.message })
  }
}

// الزبون: نقاطي + فحص كود قبل الطلب
export async function customerPromoRoute(req, res, url, user) {
  const { pathname } = url
  if (req.method === 'GET' && pathname === '/api/points') {
    const pts = db.prepare('SELECT points FROM customers WHERE id = ?').get(user.id)?.points || 0
    const cfg = pointsConfig()
    send(res, 200, { points: pts, perOrder: cfg.perOrder, forFree: cfg.forFree })
    return true
  }
  if (req.method === 'POST' && pathname === '/api/promo/check') {
    const body = await readJson(req)
    const fee = Math.max(0, Number(body.fee) || 0)
    const p = checkPromo(body.code, user.id, fee)
    if (!p) throw bad('PROMO_INVALID', 'Enter a code', 'code')
    send(res, 200, { code: p.code, kind: p.kind, discount: p.discount })
    return true
  }
  return false
}

// الإدارة: إنشاء وتعديل الكودات + إعدادات النقاط
function codeFields(b, isNew) {
  const f = {}
  if (b.code !== undefined || isNew) {
    const code = normCode(b.code)
    if (!/^[A-Z0-9؀-ۿ_-]{3,20}$/.test(code)) throw bad('INVALID', 'Code must be 3-20 letters or numbers', 'code')
    f.code = code
  }
  if (b.kind !== undefined || isNew) {
    if (!['free', 'amount', 'percent'].includes(b.kind)) throw bad('INVALID', 'Unknown type', 'kind')
    f.kind = b.kind
  }
  if (b.value !== undefined) {
    const v = Number(b.value)
    if (!Number.isInteger(v) || v < 0 || v > 100000000) throw bad('INVALID', 'Invalid value', 'value')
    f.value = v
  }
  if (b.firstOrderOnly !== undefined) f.first_order_only = b.firstOrderOnly ? 1 : 0
  if (b.maxUses !== undefined) {
    const v = Number(b.maxUses)
    if (!Number.isInteger(v) || v < 0 || v > 1000000) throw bad('INVALID', 'Invalid max uses', 'maxUses')
    f.max_uses = v
  }
  if (b.perCustomer !== undefined) {
    const v = Number(b.perCustomer)
    if (!Number.isInteger(v) || v < 1 || v > 1000) throw bad('INVALID', 'Invalid per customer', 'perCustomer')
    f.per_customer = v
  }
  if (b.expiresAt !== undefined) {
    if (b.expiresAt && Number.isNaN(Date.parse(b.expiresAt))) throw bad('INVALID', 'Invalid date', 'expiresAt')
    f.expires_at = b.expiresAt ? new Date(b.expiresAt).toISOString() : null
  }
  if (b.active !== undefined) f.active = b.active ? 1 : 0
  if (b.note !== undefined) f.note = str(b.note, 120, 'note')
  return f
}

const LIST = `SELECT p.*, (SELECT COUNT(*) FROM promo_redemptions r WHERE r.code_id = p.id) AS uses FROM promo_codes p`

export async function adminPromoRoute(req, res, url, need) {
  const { pathname } = url
  const m = req.method
  if (!pathname.startsWith('/api/admin/promos') && pathname !== '/api/admin/points') return false
  need('pricing.manage')
  if (pathname === '/api/admin/points') {
    if (m === 'GET') {
      const top = db.prepare('SELECT id, name, phone, points FROM customers WHERE points > 0 ORDER BY points DESC LIMIT 20').all()
      send(res, 200, { ...pointsConfig(), top })
      return true
    }
    if (m === 'PUT') {
      const b = await readJson(req)
      const set = (k, v, lo, hi) => {
        const n = Number(v)
        if (!Number.isInteger(n) || n < lo || n > hi) throw bad('INVALID', 'Invalid number', k)
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(n))
      }
      if (b.perOrder !== undefined) set('points_per_order', b.perOrder, 0, 100)
      if (b.forFree !== undefined) set('points_free_delivery', b.forFree, 0, 1000)
      send(res, 200, pointsConfig())
      return true
    }
  }
  if (pathname === '/api/admin/promos') {
    if (m === 'GET') {
      send(res, 200, { promos: db.prepare(`${LIST} ORDER BY p.id DESC`).all().map(toCode) })
      return true
    }
    if (m === 'POST') {
      const f = codeFields(await readJson(req), true)
      if (db.prepare('SELECT 1 FROM promo_codes WHERE code = ?').get(f.code)) throw new HttpError(409, 'CODE_TAKEN', 'This code already exists')
      const cols = Object.keys(f)
      const r = db.prepare(`INSERT INTO promo_codes (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(f))
      log('info', 'promo created', { id: Number(r.lastInsertRowid) })
      send(res, 201, { promo: toCode(db.prepare(`${LIST} WHERE p.id = ?`).get(r.lastInsertRowid)) })
      return true
    }
  }
  const mm = /^\/api\/admin\/promos\/(\d{1,9})$/.exec(pathname)
  if (mm) {
    const id = Number(mm[1])
    if (!db.prepare('SELECT 1 FROM promo_codes WHERE id = ?').get(id)) throw new HttpError(404, 'NOT_FOUND', 'Code not found')
    if (m === 'PATCH') {
      const f = codeFields(await readJson(req), false)
      if (f.code && db.prepare('SELECT 1 FROM promo_codes WHERE code = ? AND id != ?').get(f.code, id)) throw new HttpError(409, 'CODE_TAKEN', 'This code already exists')
      const cols = Object.keys(f)
      if (cols.length) db.prepare(`UPDATE promo_codes SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(f), id)
      send(res, 200, { promo: toCode(db.prepare(`${LIST} WHERE p.id = ?`).get(id)) })
      return true
    }
    if (m === 'DELETE') {
      db.prepare('DELETE FROM promo_codes WHERE id = ?').run(id)
      send(res, 200, { ok: true })
      return true
    }
  }
  return false
}
