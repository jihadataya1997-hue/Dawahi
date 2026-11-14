// عناوين الزبون المحفوظة (البيت، الشغل…) — حتى ما يحدد موقعه كل مرة
import { db } from './db.mjs'
import { HttpError, bad, now, str, rateLimit, readJson, send } from './lib.mjs'

const MAX = 10

const toAddress = (r) => ({
  id: r.id,
  label: r.label,
  location: { lat: r.lat, lng: r.lng },
  details: r.details,
  floor: r.floor,
  elevator: !!r.elevator,
  isDefault: !!r.is_default,
})

const list = (customerId) =>
  db
    .prepare('SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, updated_at DESC')
    .all(customerId)
    .map(toAddress)

function fields(b, partial) {
  const f = {}
  if (b.label !== undefined || !partial) f.label = str(b.label, 30, 'label', { required: true })
  if (b.location !== undefined || !partial) {
    const lat = Number(b.location?.lat)
    const lng = Number(b.location?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      throw bad('LOCATION_REQUIRED', 'Pick your location on the map', 'location')
    f.lat = lat
    f.lng = lng
  }
  if (b.details !== undefined) f.details = str(b.details, 300, 'details')
  if (b.floor !== undefined) {
    const n = Number(b.floor)
    if (!Number.isInteger(n) || n < 0 || n > 30) throw bad('INVALID', 'floor is invalid', 'floor')
    f.floor = n
  }
  if (b.elevator !== undefined) f.elevator = b.elevator ? 1 : 0
  return f
}

// عنوان واحد بس افتراضي لكل زبون
function setDefault(customerId, id) {
  db.prepare('UPDATE customer_addresses SET is_default = (id = ?) WHERE customer_id = ?').run(id, customerId)
}

export async function addressesRoute(req, res, url, user) {
  const m = req.method
  const { pathname } = url

  if (pathname === '/api/addresses') {
    if (m === 'GET') return send(res, 200, { addresses: list(user.id) })
    if (m === 'POST') {
      rateLimit(`addr:${user.id}`, 30, 60 * 60 * 1000)
      const b = await readJson(req)
      const f = fields(b, false)
      const count = db.prepare('SELECT COUNT(*) AS n FROM customer_addresses WHERE customer_id = ?').get(user.id).n
      if (count >= MAX) throw bad('TOO_MANY', `You can save up to ${MAX} addresses`)
      const ts = now()
      db.exec('BEGIN IMMEDIATE')
      try {
        const r = db
          .prepare(
            `INSERT INTO customer_addresses (customer_id, label, lat, lng, details, floor, elevator, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(user.id, f.label, f.lat, f.lng, f.details ?? '', f.floor ?? 0, f.elevator ?? 1, ts, ts)
        if (count === 0 || b.makeDefault) setDefault(user.id, Number(r.lastInsertRowid))
        db.exec('COMMIT')
        const row = db.prepare('SELECT * FROM customer_addresses WHERE id = ?').get(r.lastInsertRowid)
        return send(res, 201, { address: toAddress(row), addresses: list(user.id) })
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    }
  }

  const mm = /^\/api\/addresses\/(\d{1,12})$/.exec(pathname)
  if (mm) {
    const id = Number(mm[1])
    // كل زبون بيشوف ويعدّل عناوينه هو بس
    const cur = db.prepare('SELECT * FROM customer_addresses WHERE id = ? AND customer_id = ?').get(id, user.id)
    if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Address not found')
    if (m === 'PATCH') {
      const b = await readJson(req)
      const f = fields(b, true)
      if (Object.keys(f).length)
        db.prepare(`UPDATE customer_addresses SET ${Object.keys(f).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
          ...Object.values(f),
          now(),
          id
        )
      if (b.makeDefault) setDefault(user.id, id)
      return send(res, 200, { addresses: list(user.id) })
    }
    if (m === 'DELETE') {
      db.prepare('DELETE FROM customer_addresses WHERE id = ?').run(id)
      if (cur.is_default) {
        const next = db.prepare('SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1').get(user.id)
        if (next) setDefault(user.id, next.id)
      }
      return send(res, 200, { addresses: list(user.id) })
    }
  }
  throw new HttpError(404, 'NOT_FOUND', 'Not found')
}
