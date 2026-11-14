// المطاعم الشريكة وقوائم الأكل: الإدارة بتضيف وبتنشر، والزبون بيشوف المنشور بس
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { db, MEDIA_DIR } from './db.mjs'
import { HttpError, bad, str, readJson, send, log } from './lib.mjs'
import { saveImage } from './content.mjs'

const media = (n) => (n ? `/api/media/${n}` : null)
const toStore = (s) => ({
  id: s.id,
  name: s.name,
  category: s.category,
  description: s.description,
  logo: media(s.logo),
  cover: media(s.cover),
  published: !!s.published,
  isOpen: !!s.is_open,
  sort: s.sort,
})
const toItem = (i) => ({
  id: i.id,
  storeId: i.store_id,
  section: i.section,
  name: i.name,
  description: i.description,
  price: i.price,
  image: media(i.image),
  available: !!i.available,
  sort: i.sort,
})

// للزبون: المطاعم المنشورة مع أصنافها
export function publicStores() {
  const stores = db.prepare('SELECT * FROM stores WHERE published = 1 ORDER BY sort, id').all()
  if (!stores.length) return []
  const items = db
    .prepare(`SELECT m.* FROM menu_items m JOIN stores s ON s.id = m.store_id WHERE s.published = 1 ORDER BY m.sort, m.id`)
    .all()
  return stores.map((s) => ({ ...toStore(s), items: items.filter((i) => i.store_id === s.id).map(toItem) }))
}

/**
 * سلة من مطعم: بنحسب الأسعار من القاعدة (مو من الموبايل)
 * بترجع { storeName, lines, total, text }
 */
export function priceCart(storeId, cart) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ? AND published = 1').get(Number(storeId))
  if (!store) throw new HttpError(400, 'STORE_UNAVAILABLE', 'This restaurant is not available')
  if (!store.is_open) throw new HttpError(400, 'STORE_CLOSED', 'This restaurant is closed now')
  if (!Array.isArray(cart) || !cart.length || cart.length > 50) throw bad('CART_EMPTY', 'Your cart is empty', 'cart')
  const lines = cart.map((l) => {
    const qty = Number(l.qty)
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw bad('INVALID', 'Invalid quantity', 'cart')
    const it = db.prepare('SELECT * FROM menu_items WHERE id = ? AND store_id = ?').get(Number(l.itemId), store.id)
    if (!it || !it.available) throw new HttpError(400, 'ITEM_UNAVAILABLE', 'An item is no longer available')
    return { itemId: it.id, name: it.name, price: it.price, qty }
  })
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const text = lines.map((l) => `${l.qty} × ${l.name}`).join('\n')
  return { storeId: store.id, storeName: store.name, lines, total, text }
}

function storeFields(b, isNew) {
  const f = {}
  if (b.name !== undefined || isNew) f.name = str(b.name, 60, 'name', { required: true })
  if (b.description !== undefined) f.description = str(b.description, 200, 'description')
  if (b.category !== undefined) f.category = str(b.category, 20, 'category') || 'restaurants'
  if (b.published !== undefined) f.published = b.published ? 1 : 0
  if (b.isOpen !== undefined) f.is_open = b.isOpen ? 1 : 0
  if (b.sort !== undefined) {
    const n = Number(b.sort)
    if (!Number.isInteger(n) || Math.abs(n) > 1000) throw bad('INVALID', 'Invalid order', 'sort')
    f.sort = n
  }
  return f
}
function itemFields(b, isNew) {
  const f = {}
  if (b.name !== undefined || isNew) f.name = str(b.name, 80, 'name', { required: true })
  if (b.section !== undefined) f.section = str(b.section, 40, 'section')
  if (b.description !== undefined) f.description = str(b.description, 200, 'description')
  if (b.price !== undefined || isNew) {
    const n = Number(b.price)
    if (!Number.isInteger(n) || n < 0 || n > 100000000) throw bad('INVALID', 'Invalid price', 'price')
    f.price = n
  }
  if (b.available !== undefined) f.available = b.available ? 1 : 0
  if (b.sort !== undefined) {
    const n = Number(b.sort)
    if (!Number.isInteger(n) || Math.abs(n) > 10000) throw bad('INVALID', 'Invalid order', 'sort')
    f.sort = n
  }
  return f
}
const dropFile = (name) => (name ? rm(join(MEDIA_DIR, name), { force: true }).catch(() => {}) : null)
async function imageField(b, key, f, cur) {
  if (b[key] === null) f[key] = null
  else if (typeof b[key] === 'string' && b[key].startsWith('data:')) f[key] = await saveImage(b[key])
  if (f[key] !== undefined && cur?.[key]) await dropFile(cur[key])
}
const update = (table, id, f) => {
  const cols = Object.keys(f)
  if (cols.length) db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(f), id)
}
const insert = (table, f) => {
  const cols = Object.keys(f)
  return Number(db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(f)).lastInsertRowid)
}

export async function adminStoresRoute(req, res, url, need) {
  const { pathname } = url
  const m = req.method
  if (!pathname.startsWith('/api/admin/stores')) return false
  need('content.manage')

  if (pathname === '/api/admin/stores') {
    if (m === 'GET') {
      const stores = db.prepare('SELECT * FROM stores ORDER BY sort, id').all()
      const counts = Object.fromEntries(db.prepare('SELECT store_id, COUNT(*) AS n FROM menu_items GROUP BY store_id').all().map((r) => [r.store_id, r.n]))
      send(res, 200, { stores: stores.map((s) => ({ ...toStore(s), itemsCount: counts[s.id] || 0 })) })
      return true
    }
    if (m === 'POST') {
      const b = await readJson(req)
      const f = storeFields(b, true)
      await imageField(b, 'logo', f)
      await imageField(b, 'cover', f)
      const id = insert('stores', f)
      log('info', 'store created', { id })
      send(res, 201, { store: toStore(db.prepare('SELECT * FROM stores WHERE id = ?').get(id)) })
      return true
    }
  }

  let mm = /^\/api\/admin\/stores\/(\d{1,9})$/.exec(pathname)
  if (mm) {
    const id = Number(mm[1])
    const cur = db.prepare('SELECT * FROM stores WHERE id = ?').get(id)
    if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Store not found')
    if (m === 'GET') {
      const items = db.prepare('SELECT * FROM menu_items WHERE store_id = ? ORDER BY sort, id').all(id).map(toItem)
      send(res, 200, { store: toStore(cur), items })
      return true
    }
    if (m === 'PATCH') {
      const b = await readJson(req)
      const f = storeFields(b, false)
      await imageField(b, 'logo', f, cur)
      await imageField(b, 'cover', f, cur)
      update('stores', id, f)
      send(res, 200, { store: toStore(db.prepare('SELECT * FROM stores WHERE id = ?').get(id)) })
      return true
    }
    if (m === 'DELETE') {
      const imgs = db.prepare('SELECT image FROM menu_items WHERE store_id = ?').all(id)
      db.prepare('DELETE FROM stores WHERE id = ?').run(id)
      await Promise.all([dropFile(cur.logo), dropFile(cur.cover), ...imgs.map((i) => dropFile(i.image))])
      send(res, 200, { ok: true })
      return true
    }
  }

  mm = /^\/api\/admin\/stores\/(\d{1,9})\/items$/.exec(pathname)
  if (mm && m === 'POST') {
    const storeId = Number(mm[1])
    if (!db.prepare('SELECT 1 FROM stores WHERE id = ?').get(storeId)) throw new HttpError(404, 'NOT_FOUND', 'Store not found')
    const b = await readJson(req)
    const f = { ...itemFields(b, true), store_id: storeId }
    await imageField(b, 'image', f)
    const id = insert('menu_items', f)
    send(res, 201, { item: toItem(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id)) })
    return true
  }
  mm = /^\/api\/admin\/stores\/(\d{1,9})\/items\/(\d{1,9})$/.exec(pathname)
  if (mm) {
    const cur = db.prepare('SELECT * FROM menu_items WHERE id = ? AND store_id = ?').get(Number(mm[2]), Number(mm[1]))
    if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Item not found')
    if (m === 'PATCH') {
      const b = await readJson(req)
      const f = itemFields(b, false)
      await imageField(b, 'image', f, cur)
      update('menu_items', cur.id, f)
      send(res, 200, { item: toItem(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(cur.id)) })
      return true
    }
    if (m === 'DELETE') {
      db.prepare('DELETE FROM menu_items WHERE id = ?').run(cur.id)
      await dropFile(cur.image)
      send(res, 200, { ok: true })
      return true
    }
  }
  return false
}
