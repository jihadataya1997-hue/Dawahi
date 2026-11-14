// محتوى التطبيق: النصوص، الخدمات، الإعلانات، الإشعارات العامة، والزبائن
import { randomBytes, randomInt } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, getContent, getSettings, MEDIA_DIR } from './db.mjs'
import { HttpError, bad, now, str, isPhone, rateLimit, readJson, send, log, hashSecret } from './lib.mjs'
import { notify } from './push.mjs'

const SERVICE_IDS = ['restaurants', 'supermarket', 'gas', 'diesel', 'pharmacy', 'library']
const THEMES = ['orange', 'navy', 'green', 'sky', 'rose', 'purple']
const ACTIONS = ['none', 'order', 'gas', 'url']
const CATEGORIES = ['any', 'restaurants', 'supermarket', 'pharmacy', 'library', 'diesel', 'other']
const MAX_IMAGE = 1.5 * 1024 * 1024

const toBanner = (b) => ({
  id: b.id,
  title: b.title,
  subtitle: b.subtitle,
  badge: b.badge,
  image: b.image ? `/api/media/${b.image}` : null,
  theme: b.theme,
  placement: b.placement || 'top',
  action: b.action,
  actionValue: b.action_value,
  sort: b.sort,
  active: !!b.active,
  startsAt: b.starts_at,
  endsAt: b.ends_at,
})

function activeBanners() {
  const t = now()
  return db
    .prepare(
      `SELECT * FROM banners WHERE active = 1
         AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?)
       ORDER BY sort, id`
    )
    .all(t, t)
    .map(toBanner)
}

/* ───────── التحكم الديناميكي بالتطبيق: صيانة، ذروة، نافذة منبثقة ───────── */
const DEFAULT_CONTROLS = {
  maintenance: { enabled: false, title: 'التطبيق قيد الصيانة', message: 'نعمل على تحسين الخدمة، ونعود خلال وقت قصير.' },
  peak: { manual: false, extra: 50, label: 'أوقات الذروة', schedule: [] },
  home: { banners: true, shortcuts: true, howItWorks: true },
  popup: { enabled: false, id: 0, title: '', body: '', image: null, buttonText: '', action: 'none', actionValue: '', frequency: 'once' },
}
const POPUP_FREQ = ['once', 'daily', 'always']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function getControls() {
  let saved = {}
  try {
    saved = JSON.parse(getContent().controls || '{}')
  } catch {}
  return {
    maintenance: { ...DEFAULT_CONTROLS.maintenance, ...saved.maintenance },
    peak: { ...DEFAULT_CONTROLS.peak, ...saved.peak },
    popup: { ...DEFAULT_CONTROLS.popup, ...saved.popup },
    home: { ...DEFAULT_CONTROLS.home, ...saved.home },
  }
}

/** هل نحن الآن بوقت ذروة؟ (يدوي، أو حسب الجدول بتوقيت دمشق) */
export function peakState(peak = getControls().peak) {
  if (peak.manual) return { active: true, manual: true }
  const d = new Date(Date.now() + 3 * 3600 * 1000)
  const day = d.getUTCDay()
  const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  for (const w of peak.schedule || []) {
    if (!w.days?.includes(day)) continue
    // فترة عادية (13:00-15:00) أو بتقطع نص الليل (22:00-02:00)
    const inside = w.from <= w.to ? hm >= w.from && hm < w.to : hm >= w.from || hm < w.to
    if (inside) return { active: true, manual: false, until: w.to }
  }
  return { active: false }
}

/** أجرة التوصيل الفعلية الآن (الأساسية + زيادة الذروة) */
export function currentDeliveryFee(s = getSettings(), controls = getControls()) {
  const p = peakState(controls.peak)
  return { fee: s.delivery_fee + (p.active ? controls.peak.extra : 0), base: s.delivery_fee, peak: p, extra: p.active ? controls.peak.extra : 0 }
}

/** حالة كل خدمة: on شغّالة، paused متوقفة مؤقتاً (تظهر باهتة)، hidden مخفية */
export const serviceState = (svc) => (!svc ? 'on' : svc.enabled === false ? 'hidden' : svc.paused ? 'paused' : 'on')

/** يمنع الطلب إذا التطبيق بالصيانة أو الخدمة متوقفة */
export function assertOrderingOpen(category) {
  const ctl = getControls()
  if (ctl.maintenance.enabled) throw new HttpError(503, 'MAINTENANCE', ctl.maintenance.message || 'The app is under maintenance')
  const svc = getContent().services.find((x) => x.id === category)
  const st = serviceState(svc)
  if (st !== 'on') throw new HttpError(409, 'SERVICE_PAUSED', svc?.pauseNote || 'This service is paused for now')
}

/** إعدادات التطبيق العامة (بدون تسجيل دخول) */
export function publicApp() {
  const c = getContent()
  const s = getSettings()
  const ctl = getControls()
  const fee = currentDeliveryFee(s, ctl)
  const popup = ctl.popup
  return {
    texts: { areaName: c.area_name, heroTitle: c.hero_title, heroSub: c.hero_sub, supportPhone: c.support_phone },
    currency: c.currency_label,
    services: c.services
      .filter((x) => serviceState(x) !== 'hidden')
      .map((x) => ({ ...x, paused: serviceState(x) === 'paused', pauseNote: x.pauseNote || '' })),
    banners: activeBanners(),
    home: ctl.home,
    maintenance: ctl.maintenance.enabled ? { title: ctl.maintenance.title, message: ctl.maintenance.message } : null,
    peak: fee.peak.active ? { extra: fee.extra, label: ctl.peak.label, until: fee.peak.until || null } : null,
    popup: popup.enabled && popup.title
      ? {
          id: popup.id,
          title: popup.title,
          body: popup.body,
          image: popup.image ? `/api/media/${popup.image}` : null,
          buttonText: popup.buttonText,
          action: popup.action,
          actionValue: popup.actionValue,
          frequency: popup.frequency,
        }
      : null,
    pricing: {
      deliveryFee: fee.fee,
      baseDeliveryFee: fee.base,
      gasPrice: s.gas_price,
      emptyCylinder: s.empty_cylinder_price,
      stairsPerFloor: s.stairs_fee_per_floor,
    },
  }
}

export async function serveMedia(res, name) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) throw new HttpError(404, 'NOT_FOUND', 'Not found')
  const buf = await readFile(join(MEDIA_DIR, name))
  const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' })
  res.end(buf)
}

export function listAnnouncements(limit = 20) {
  return db
    .prepare('SELECT id, title, body, created_at AS createdAt FROM announcements ORDER BY id DESC LIMIT ?')
    .all(limit)
}

export async function saveImage(dataUrl) {
  const m = typeof dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw bad('INVALID', 'Image must be JPEG, PNG or WebP', 'image')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > MAX_IMAGE) throw bad('TOO_LARGE', 'Image is too large', 'image')
  const name = `${randomBytes(16).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
  await writeFile(join(MEDIA_DIR, name), buf)
  return name
}

function bannerFields(body, current = {}) {
  const f = {}
  if (body.title !== undefined || !current.id) f.title = str(body.title, 80, 'title', { required: true })
  if (body.subtitle !== undefined) f.subtitle = str(body.subtitle, 140, 'subtitle')
  if (body.badge !== undefined) f.badge = str(body.badge, 20, 'badge')
  if (body.theme !== undefined) {
    if (!THEMES.includes(body.theme)) throw bad('INVALID', 'Unknown theme', 'theme')
    f.theme = body.theme
  }
  if (body.placement !== undefined) {
    if (!['top', 'mid'].includes(body.placement)) throw bad('INVALID', 'Unknown placement', 'placement')
    f.placement = body.placement
  }
  if (body.action !== undefined) {
    if (!ACTIONS.includes(body.action)) throw bad('INVALID', 'Unknown action', 'action')
    f.action = body.action
  }
  if (body.actionValue !== undefined) {
    const action = f.action ?? current.action ?? 'none'
    const v = str(body.actionValue, 300, 'actionValue')
    if (action === 'url' && v && !/^https:\/\/\S+$/.test(v)) throw bad('INVALID', 'Link must start with https://', 'actionValue')
    if (action === 'order' && v && !CATEGORIES.includes(v)) throw bad('INVALID', 'Unknown category', 'actionValue')
    f.action_value = v
  }
  if (body.sort !== undefined) {
    const n = Number(body.sort)
    if (!Number.isInteger(n) || Math.abs(n) > 1000) throw bad('INVALID', 'Invalid order', 'sort')
    f.sort = n
  }
  if (body.active !== undefined) f.active = body.active ? 1 : 0
  for (const k of ['startsAt', 'endsAt']) {
    if (body[k] === undefined) continue
    const col = k === 'startsAt' ? 'starts_at' : 'ends_at'
    if (body[k] === null || body[k] === '') f[col] = null
    else {
      const d = new Date(body[k])
      if (Number.isNaN(d.getTime())) throw bad('INVALID', 'Invalid date', k)
      f[col] = d.toISOString()
    }
  }
  return f
}

function controlsView() {
  const ctl = getControls()
  const fee = currentDeliveryFee(getSettings(), ctl)
  return {
    controls: { ...ctl, popup: { ...ctl.popup, image: ctl.popup.image ? `/api/media/${ctl.popup.image}` : null } },
    services: getContent().services.map((x) => ({ id: x.id, label: x.label, state: serviceState(x), pauseNote: x.pauseNote || '' })),
    fee: { now: fee.fee, base: fee.base, peakActive: fee.peak.active, until: fee.peak.until || null },
  }
}

function adminContentView() {
  const c = getContent()
  return {
    areaName: c.area_name,
    currency: c.currency_label,
    heroTitle: c.hero_title,
    heroSub: c.hero_sub,
    supportPhone: c.support_phone,
    services: c.services,
  }
}

/** مسارات الإدارة الخاصة بالمحتوى — ترجع true إذا عالجت الطلب */
export async function contentAdminRoute(req, res, url, need) {
  const { pathname } = url
  const m = req.method
  if (/^\/api\/admin\/(content|banners|announcements)/.test(pathname)) need('content.manage')
  if (pathname === '/api/admin/controls' && req.method === 'GET') need('orders.view')
  if (pathname.startsWith('/api/admin/customers')) need(m === 'GET' ? 'customers.view' : 'customers.manage')

  // نصوص التطبيق + الخدمات + العملة + رقم الدعم
  if (pathname === '/api/admin/content') {
    if (m === 'GET') {
      send(res, 200, { content: adminContentView() })
      return true
    }
    if (m === 'PUT') {
      const b = await readJson(req)
      const set = (k, v) => db.prepare('INSERT INTO content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v)
      if (b.areaName !== undefined) set('area_name', str(b.areaName, 40, 'areaName', { required: true }))
      if (b.currency !== undefined) set('currency_label', str(b.currency, 12, 'currency', { required: true }))
      if (b.heroTitle !== undefined) set('hero_title', str(b.heroTitle, 60, 'heroTitle', { required: true }))
      if (b.heroSub !== undefined) set('hero_sub', str(b.heroSub, 140, 'heroSub'))
      if (b.supportPhone !== undefined) {
        const p = String(b.supportPhone || '').replace(/\s/g, '')
        if (p && !isPhone(p)) throw bad('INVALID_PHONE', 'Phone must be 09xxxxxxxx', 'supportPhone')
        set('support_phone', p)
      }
      if (b.services !== undefined) {
        if (!Array.isArray(b.services)) throw bad('INVALID', 'services must be a list', 'services')
        const seen = new Set()
        const clean = b.services.map((s) => {
          if (!SERVICE_IDS.includes(s.id) || seen.has(s.id)) throw bad('INVALID', 'Unknown service', 'services')
          seen.add(s.id)
          const prev = getContent().services.find((x) => x.id === s.id) || {}
          return {
            id: s.id,
            enabled: !!s.enabled,
            label: str(s.label, 20, 'label', { required: true }),
            sub: str(s.sub, 24, 'sub'),
            // حالة الإيقاف المؤقت تتعدل من شاشة "التحكم بالتطبيق"، ومنحافظ عليها هون
            paused: s.paused !== undefined ? !!s.paused : !!prev.paused,
            pauseNote: s.pauseNote !== undefined ? str(s.pauseNote, 120, 'pauseNote') : prev.pauseNote || '',
          }
        })
        set('services', JSON.stringify(clean))
      }
      log('info', 'content updated', { keys: Object.keys(b) })
      send(res, 200, { content: adminContentView() })
      return true
    }
  }

  // التحكم بالتطبيق: الصيانة، الأقسام، الذروة، النافذة المنبثقة
  if (pathname === '/api/admin/controls') {
    if (m === 'GET') {
      send(res, 200, controlsView())
      return true
    }
    if (m === 'PUT') {
      const b = await readJson(req)
      const ctl = getControls()
      const set = (k, v) => db.prepare('INSERT INTO content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v)

      if (b.maintenance !== undefined) {
        need('content.manage')
        ctl.maintenance = {
          enabled: !!b.maintenance.enabled,
          title: str(b.maintenance.title, 60, 'title') || DEFAULT_CONTROLS.maintenance.title,
          message: str(b.maintenance.message, 300, 'message') || DEFAULT_CONTROLS.maintenance.message,
        }
      }
      if (b.peak !== undefined) {
        need('pricing.manage')
        const extra = Number(b.peak.extra)
        if (!Number.isInteger(extra) || extra < 0 || extra > 1000000) throw bad('INVALID', 'Invalid peak amount', 'extra')
        if (!Array.isArray(b.peak.schedule) || b.peak.schedule.length > 20) throw bad('INVALID', 'Invalid schedule', 'schedule')
        const schedule = b.peak.schedule.map((w) => {
          const days = [...new Set((w.days || []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort()
          if (!days.length) throw bad('INVALID', 'Pick at least one day', 'schedule')
          if (!TIME_RE.test(w.from) || !TIME_RE.test(w.to) || w.from === w.to) throw bad('INVALID', 'Invalid time', 'schedule')
          return { days, from: w.from, to: w.to }
        })
        ctl.peak = { manual: !!b.peak.manual, extra, label: str(b.peak.label, 30, 'label') || 'أوقات الذروة', schedule }
      }
      if (b.popup !== undefined) {
        need('content.manage')
        const p = b.popup
        const action = ACTIONS.includes(p.action) ? p.action : 'none'
        const actionValue = str(p.actionValue, 300, 'actionValue')
        if (action === 'url' && !/^https:\/\/\S+$/.test(actionValue)) throw bad('INVALID', 'Link must start with https://', 'actionValue')
        let image = ctl.popup.image
        if (p.image === null) image = null
        else if (typeof p.image === 'string' && p.image.startsWith('data:')) image = await saveImage(p.image)
        if (image !== ctl.popup.image && ctl.popup.image) await rm(join(MEDIA_DIR, ctl.popup.image), { force: true })
        const enabled = !!p.enabled
        if (enabled && !str(p.title, 80, 'title')) throw bad('INVALID', 'Title is required', 'title')
        ctl.popup = {
          enabled,
          // رقم جديد كل ما انحفظت نافذة مفعّلة → بتطلع للزبائن من جديد
          id: p.showAgain || (enabled && !ctl.popup.enabled) ? Date.now() : ctl.popup.id || Date.now(),
          title: str(p.title, 80, 'title'),
          body: str(p.body, 400, 'body'),
          image,
          buttonText: str(p.buttonText, 30, 'buttonText'),
          action,
          actionValue,
          frequency: POPUP_FREQ.includes(p.frequency) ? p.frequency : 'once',
        }
      }
      if (b.home !== undefined) {
        need('content.manage')
        ctl.home = Object.fromEntries(Object.keys(DEFAULT_CONTROLS.home).map((k) => [k, b.home[k] !== false]))
      }
      if (b.services !== undefined) {
        need('content.manage')
        if (!Array.isArray(b.services)) throw bad('INVALID', 'services must be a list', 'services')
        const list = getContent().services
        for (const u of b.services) {
          const svc = list.find((x) => x.id === u.id)
          if (!svc) throw bad('INVALID', 'Unknown service', 'services')
          const st = ['on', 'paused', 'hidden'].includes(u.state) ? u.state : 'on'
          svc.enabled = st !== 'hidden'
          svc.paused = st === 'paused'
          svc.pauseNote = str(u.pauseNote, 120, 'pauseNote')
        }
        set('services', JSON.stringify(list))
      }
      set('controls', JSON.stringify(ctl))
      log('info', 'app controls updated', { keys: Object.keys(b), maintenance: ctl.maintenance.enabled })
      send(res, 200, controlsView())
      return true
    }
  }

  // الإعلانات
  if (pathname === '/api/admin/banners') {
    if (m === 'GET') {
      send(res, 200, { banners: db.prepare('SELECT * FROM banners ORDER BY sort, id').all().map(toBanner) })
      return true
    }
    if (m === 'POST') {
      const body = await readJson(req)
      const f = bannerFields(body)
      if (body.image) f.image = await saveImage(body.image)
      const cols = Object.keys(f)
      const r = db.prepare(`INSERT INTO banners (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(f))
      log('info', 'banner created', { id: Number(r.lastInsertRowid) })
      send(res, 201, { banner: toBanner(db.prepare('SELECT * FROM banners WHERE id = ?').get(r.lastInsertRowid)) })
      return true
    }
  }
  let mm = /^\/api\/admin\/banners\/(\d{1,9})$/.exec(pathname)
  if (mm) {
    const id = Number(mm[1])
    const cur = db.prepare('SELECT * FROM banners WHERE id = ?').get(id)
    if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Banner not found')
    if (m === 'PATCH') {
      const body = await readJson(req)
      const f = bannerFields(body, cur)
      if (body.image === null) f.image = null
      else if (body.image) f.image = await saveImage(body.image)
      if (Object.keys(f).length) {
        db.prepare(`UPDATE banners SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(f), id)
      }
      if (f.image !== undefined && cur.image) await rm(join(MEDIA_DIR, cur.image), { force: true })
      send(res, 200, { banner: toBanner(db.prepare('SELECT * FROM banners WHERE id = ?').get(id)) })
      return true
    }
    if (m === 'DELETE') {
      db.prepare('DELETE FROM banners WHERE id = ?').run(id)
      if (cur.image) await rm(join(MEDIA_DIR, cur.image), { force: true })
      log('info', 'banner deleted', { id })
      send(res, 204)
      return true
    }
  }

  // إشعار عام لكل الزبائن
  if (pathname === '/api/admin/announcements') {
    if (m === 'GET') {
      send(res, 200, {
        announcements: db.prepare('SELECT id, title, body, sent_count AS sentCount, created_at AS createdAt FROM announcements ORDER BY id DESC LIMIT 50').all(),
        reach: db.prepare(
          `SELECT COUNT(DISTINCT p.owner_id) AS n FROM push_subscriptions p JOIN customers c ON c.id = p.owner_id
           WHERE p.owner_type = 'customer' AND c.blocked = 0`
        ).get().n,
        customers: db.prepare('SELECT COUNT(*) AS n FROM customers WHERE blocked = 0').get().n,
      })
      return true
    }
    if (m === 'POST') {
      rateLimit('broadcast', 10, 60 * 60 * 1000)
      const body = await readJson(req)
      const title = str(body.title, 80, 'title', { required: true })
      const text = str(body.body, 300, 'body')
      const r = db.prepare('INSERT INTO announcements (title, body, created_at) VALUES (?, ?, ?)').run(title, text, now())
      const ids = db
        .prepare(
          `SELECT DISTINCT p.owner_id AS id FROM push_subscriptions p JOIN customers c ON c.id = p.owner_id
           WHERE p.owner_type = 'customer' AND c.blocked = 0`
        )
        .all()
      let devices = 0
      for (const { id } of ids) devices += notify('customer', id, { title, body: text, url: '/?inbox=1', tag: `ann-${r.lastInsertRowid}` })
      db.prepare('UPDATE announcements SET sent_count = ? WHERE id = ?').run(ids.length, r.lastInsertRowid)
      log('info', 'announcement sent', { id: Number(r.lastInsertRowid), customers: ids.length, devices })
      send(res, 201, { id: Number(r.lastInsertRowid), customers: ids.length })
      return true
    }
  }
  mm = /^\/api\/admin\/announcements\/(\d{1,9})$/.exec(pathname)
  if (mm && m === 'DELETE') {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(Number(mm[1]))
    send(res, 204)
    return true
  }

  // الزبائن
  if (m === 'GET' && pathname === '/api/admin/customers') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 40)
    const like = `%${q.replace(/[%_]/g, '')}%`
    const rows = db
      .prepare(
        `SELECT c.id, c.name, c.phone, c.blocked, c.created_at AS createdAt, (c.password_hash IS NOT NULL) AS hasPassword,
           COUNT(o.id) AS orders,
           SUM(o.status = 'delivered') AS delivered,
           MAX(o.created_at) AS lastOrderAt,
           EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.owner_type = 'customer' AND p.owner_id = c.id) AS push
         FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
         WHERE (? = '' OR c.name LIKE ? OR c.phone LIKE ?)
         GROUP BY c.id ORDER BY COALESCE(MAX(o.created_at), c.created_at) DESC LIMIT 200`
      )
      .all(q, like, like)
    send(res, 200, {
      customers: rows.map((r) => ({ ...r, blocked: !!r.blocked, push: !!r.push, hasPassword: !!r.hasPassword, delivered: r.delivered || 0 })),
      total: db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,
    })
    return true
  }
  // كلمة سر مؤقتة سهلة للزبون اللي نسي كلمته (بيغيّرها أول ما يفوت)
  mm = /^\/api\/admin\/customers\/(\d{1,12})\/temp-password$/.exec(pathname)
  if (mm && m === 'POST') {
    const id = Number(mm[1])
    const c = db.prepare('SELECT id, name, phone FROM customers WHERE id = ?').get(id)
    if (!c) throw new HttpError(404, 'NOT_FOUND', 'Customer not found')
    const temp = String(100000 + randomInt(900000))
    db.prepare('UPDATE customers SET password_hash = ?, must_set_password = 1, updated_at = ? WHERE id = ?').run(hashSecret(temp), now(), id)
    db.prepare('DELETE FROM sessions WHERE customer_id = ?').run(id)
    log('info', 'customer temp password', { customerId: id })
    send(res, 200, { temp, name: c.name, phone: c.phone })
    return true
  }
  mm = /^\/api\/admin\/customers\/(\d{1,12})$/.exec(pathname)
  if (mm && m === 'PATCH') {
    const id = Number(mm[1])
    const body = await readJson(req)
    if (body.blocked === undefined) throw bad('INVALID', 'Nothing to change')
    const r = db.prepare('UPDATE customers SET blocked = ?, updated_at = ? WHERE id = ?').run(body.blocked ? 1 : 0, now(), id)
    if (!r.changes) throw new HttpError(404, 'NOT_FOUND', 'Customer not found')
    if (body.blocked) db.prepare('DELETE FROM sessions WHERE customer_id = ?').run(id)
    log('info', 'customer updated', { customerId: id, blocked: !!body.blocked })
    send(res, 200, { ok: true })
    return true
  }

  return false
}
