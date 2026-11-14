// ملف عامل التوصيل: المعلومات والوثائق الثبوتية (الإدارة بس بتشوف الوثائق)
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { db, MEDIA_DIR, PRIVATE_DIR } from './db.mjs'
import { HttpError, str, readJson, send, log } from './lib.mjs'
import { saveImage } from './content.mjs'

const DOCS = { front: 'id_front', back: 'id_back', license: 'license_doc' }

const profile = (c) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  photo: c.photo ? `/api/media/${c.photo}` : null,
  vehicle: c.vehicle,
  nationalId: c.national_id,
  homeAddress: c.home_address,
  notes: c.notes,
  docs: Object.fromEntries(Object.entries(DOCS).map(([k, col]) => [k, !!c[col]])),
})

// للزبون: اللي بيلزمه يعرفه عن عامل التوصيل تبع طلبه
export function courierPublic(courierId) {
  if (!courierId) return null
  const c = db.prepare('SELECT photo, vehicle FROM couriers WHERE id = ?').get(courierId)
  return c ? { photo: c.photo ? `/api/media/${c.photo}` : null, vehicle: c.vehicle } : null
}

export async function courierProfileRoute(req, res, url, need) {
  const { pathname } = url
  const m = req.method
  let mm = /^\/api\/admin\/couriers\/(\d{1,9})\/profile$/.exec(pathname)
  if (mm) {
    need('couriers.manage')
    const id = Number(mm[1])
    const c = db.prepare('SELECT * FROM couriers WHERE id = ?').get(id)
    if (!c) throw new HttpError(404, 'NOT_FOUND', 'Courier not found')
    if (m === 'GET') {
      send(res, 200, { profile: profile(c) })
      return true
    }
    if (m === 'PATCH') {
      const b = await readJson(req)
      const f = {}
      if (b.vehicle !== undefined) f.vehicle = str(b.vehicle, 80, 'vehicle')
      if (b.nationalId !== undefined) f.national_id = str(b.nationalId, 30, 'nationalId')
      if (b.homeAddress !== undefined) f.home_address = str(b.homeAddress, 200, 'homeAddress')
      if (b.notes !== undefined) f.notes = str(b.notes, 500, 'notes')
      const old = []
      if (b.photo !== undefined) {
        f.photo = b.photo ? await saveImage(b.photo) : null
        if (c.photo) old.push(join(MEDIA_DIR, c.photo))
      }
      for (const [k, col] of Object.entries(DOCS)) {
        if (b.docs?.[k] === undefined) continue
        f[col] = b.docs[k] ? await saveImage(b.docs[k], PRIVATE_DIR) : null
        if (c[col]) old.push(join(PRIVATE_DIR, c[col]))
      }
      const cols = Object.keys(f)
      if (cols.length) db.prepare(`UPDATE couriers SET ${cols.map((x) => `${x} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(f), id)
      await Promise.all(old.map((p) => rm(p, { force: true }).catch(() => {})))
      log('info', 'courier profile updated', { courierId: id, fields: cols })
      send(res, 200, { profile: profile(db.prepare('SELECT * FROM couriers WHERE id = ?').get(id)) })
      return true
    }
  }
  mm = /^\/api\/admin\/couriers\/(\d{1,9})\/doc\/(front|back|license)$/.exec(pathname)
  if (mm && m === 'GET') {
    need('couriers.manage')
    const c = db.prepare('SELECT * FROM couriers WHERE id = ?').get(Number(mm[1]))
    const name = c?.[DOCS[mm[2]]]
    if (!name) throw new HttpError(404, 'NOT_FOUND', 'Document not found')
    const buf = await readFile(join(PRIVATE_DIR, name))
    const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'Content-Length': buf.length })
    res.end(buf)
    return true
  }
  return false
}
