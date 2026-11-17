// سجل نشاط الفريق: كل تعديل بلوحة الإدارة (مين، شو، إيمتى، ومن وين)
import { db } from './db.mjs'
import { clientIp, now, log } from './lib.mjs'

const STATUS_AR = { new: 'جديد', assigned: 'تم التعيين', buying: 'قيد الشراء', on_the_way: 'في الطريق', delivered: 'تم التسليم', cancelled: 'ملغي' }
const SECRET_KEY = /pass|secret|code|token|otp|pin|recovery/i
const BLOB_KEY = /image|photo|file|data|doc/i

const courierName = (id) => db.prepare('SELECT name FROM couriers WHERE id = ?').get(id)?.name
const customerName = (id) => db.prepare('SELECT name FROM customers WHERE id = ?').get(id)?.name
const staffName = (id) => db.prepare('SELECT name FROM staff WHERE id = ?').get(id)?.name
const orderNo = (id) => `D-${1000 + Number(id)}`
const named = (label, n) => (n ? `${label} «${n}»` : label)

// [method, regex, (match, body) => وصف بالعربي]
const RULES = [
  ['POST', /^\/api\/courier\/sup\/couriers$/, (_, b) => named('إضافة عامل توصيل مع وثائقه (من تطبيق المشرف)', b.name)],
  ['POST', /^\/api\/courier\/sup\/orders\/(\d+)\/status$/, (m, b) => `المشرف غيّر حالة الطلب ${orderNo(m[1])} إلى «${STATUS_AR[b.status] || b.status}»`],
  ['POST', /^\/api\/admin\/orders\/new$/, (_, b) => `إدخال طلب للزبون ${b.name || ''} (${b.phone || ''})`],
  ['POST', /^\/api\/admin\/orders\/delete$/, (_, b) => `حذف طلبات نهائياً: ${(b.ids || []).map(orderNo).join('، ')}`],
  [null, /^\/api\/admin\/orders\/(\d+)\/status$/, (m, b) => `تغيير حالة الطلب ${orderNo(m[1])} إلى «${STATUS_AR[b.status] || b.status}»${b.reason ? ` (السبب: ${b.reason})` : ''}`],
  [null, /^\/api\/admin\/orders\/(\d+)$/, (m) => `تعديل الطلب ${orderNo(m[1])}`],
  ['POST', /^\/api\/admin\/couriers$/, (_, b) => named('إضافة عامل توصيل', b.name)],
  ['DELETE', /^\/api\/admin\/couriers\/(\d+)$/, (m) => named('حذف عامل توصيل', courierName(m[1]))],
  [null, /^\/api\/admin\/couriers\/(\d+)$/, (m, b) => {
    const n = courierName(m[1])
    if (b.active === false) return named('إيقاف عامل التوصيل', n)
    if (b.active === true) return named('تفعيل عامل التوصيل', n)
    if (b.pin) return named('تغيير الرمز السري لعامل التوصيل', n)
    if (b.online !== undefined) return named(b.online ? 'تشغيل عامل التوصيل (متاح)' : 'إيقاف عامل التوصيل (غير متاح)', n)
    if (b.supervisor !== undefined) return named(b.supervisor ? 'تعيين عامل التوصيل مشرفاً' : 'إلغاء إشراف عامل التوصيل', n)
    return named('تعديل بيانات عامل التوصيل', n)
  }],
  ['POST', /^\/api\/admin\/couriers\/(\d+)\/topup$/, (m, b) => `${Number(b.amount) < 0 ? 'خصم من' : 'شحن'} رصيد ${named('عامل التوصيل', courierName(m[1]))}: ${Math.abs(Number(b.amount) || 0)}${b.note ? ` (${b.note})` : ''}`],
  [null, /^\/api\/admin\/couriers\/(\d+)\/profile$/, (m) => named('تعديل ملف عامل التوصيل', courierName(m[1]))],
  [null, /^\/api\/admin\/couriers\/(\d+)\/doc\/(\w+)$/, (m) => named('تعديل وثائق عامل التوصيل', courierName(m[1]))],
  ['POST', /^\/api\/admin\/customers\/(\d+)\/temp-password$/, (m) => named('إعطاء كلمة سر مؤقتة للزبون', customerName(m[1]))],
  [null, /^\/api\/admin\/customers\/(\d+)$/, (m, b) => {
    const n = customerName(m[1])
    if (b.blocked === true) return named('إيقاف الزبون', n)
    if (b.blocked === false) return named('إلغاء إيقاف الزبون', n)
    return named('تعديل الزبون', n)
  }],
  [null, /^\/api\/admin\/settings$/, () => 'تعديل الأسعار والإعدادات'],
  [null, /^\/api\/admin\/dispatch$/, () => 'تعديل إعدادات التوزيع التلقائي'],
  [null, /^\/api\/admin\/controls$/, (_, b) => {
    const parts = { maintenance: 'الصيانة', peak: 'وقت الذروة', zones: 'المناطق البعيدة', popup: 'النافذة المنبثقة', services: 'الخدمات', home: 'الصفحة الرئيسية' }
    const k = Object.keys(b).map((x) => parts[x] || x)
    return `تعديل التحكم بالتطبيق${k.length ? `: ${k.join('، ')}` : ''}`
  }],
  [null, /^\/api\/admin\/accounts\/settings$/, () => 'تعديل إعدادات الحسابات والعمولة'],
  ['POST', /^\/api\/admin\/promos$/, (_, b) => `إضافة كود حسم ${b.code || ''}`],
  ['DELETE', /^\/api\/admin\/promos\/(\d+)$/, () => 'حذف كود حسم'],
  [null, /^\/api\/admin\/promos\/(\d+)$/, () => 'تعديل كود حسم'],
  [null, /^\/api\/admin\/orders\/(\d+)\/transfer$/, (m, b) => `تحويل الطلب ${orderNo(m[1])} لعامل التوصيل ${courierName(b.courierId) || ''}`],
  [null, /^\/api\/admin\/points$/, () => 'تعديل إعدادات النقاط وأول طلب ببلاش'],
  ['POST', /^\/api\/admin\/banners$/, () => 'إضافة إعلان'],
  ['DELETE', /^\/api\/admin\/banners\/(\d+)$/, () => 'حذف إعلان'],
  [null, /^\/api\/admin\/banners\/(\d+)$/, () => 'تعديل إعلان'],
  ['POST', /^\/api\/admin\/announcements$/, (_, b) => `إرسال إشعار عام${b.title ? `: «${b.title}»` : ''}`],
  ['DELETE', /^\/api\/admin\/announcements\/(\d+)$/, () => 'حذف إشعار عام'],
  [null, /^\/api\/admin\/content$/, () => 'تعديل محتوى التطبيق'],
  [null, /^\/api\/admin\/stores/, (_, b, method) => (method === 'DELETE' ? 'حذف مطعم شريك' : named('تعديل المطاعم الشريكة', b.name))],
  ['POST', /^\/api\/admin\/staff$/, (_, b) => named('إضافة موظف', b.name)],
  ['DELETE', /^\/api\/admin\/staff\/(\d+)\/mfa$/, (m) => named('إعادة تعيين التحقق بخطوتين للموظف', staffName(m[1]))],
  ['DELETE', /^\/api\/admin\/staff\/(\d+)$/, (m) => named('حذف موظف', staffName(m[1]))],
  [null, /^\/api\/admin\/staff\/(\d+)$/, (m, b) => named(b.password ? 'تغيير كلمة سر الموظف' : 'تعديل الموظف', staffName(m[1]) || b.name)],
  ['POST', /^\/api\/admin\/roles$/, (_, b) => named('إضافة دور', b.name)],
  ['DELETE', /^\/api\/admin\/roles\/(\d+)$/, () => 'حذف دور'],
  [null, /^\/api\/admin\/roles\/(\d+)$/, (_, b) => named('تعديل صلاحيات دور', b.name)],
  [null, /^\/api\/admin\/staff-mfa-policy$/, (_, b) => (b.required ? 'فرض التحقق بخطوتين على الفريق' : 'إلغاء فرض التحقق بخطوتين')],
  [null, /^\/api\/admin\/username$/, () => 'تغيير اسم المستخدم'],
  [null, /^\/api\/admin\/password$/, () => 'تغيير كلمة السر'],
  [null, /^\/api\/admin\/mfa\/enable$/, () => 'تفعيل التحقق بخطوتين'],
  [null, /^\/api\/admin\/mfa\/disable$/, () => 'إيقاف التحقق بخطوتين'],
  ['POST', /^\/api\/admin\/backups$/, () => 'أخذ نسخة احتياطية'],
  [null, /^\/api\/admin\/backups\//, (_, __, method) => (method === 'DELETE' ? 'حذف نسخة احتياطية' : 'استرجاع/تعديل نسخة احتياطية')],
  ['POST', /^\/api\/admin\/push\/test$/, () => 'تجربة إشعار'],
]

// طلبات ما بتنسجّل (ما بتغيّر شي أو بتتكرر كتير)
const SKIP = new Set(['/api/admin/login', '/api/admin/login/mfa', '/api/admin/logout', '/api/admin/push', '/api/admin/mfa/setup'])

export function shouldAudit(method, path) {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && !SKIP.has(path)
}

function describe(method, path, body) {
  for (const [m, re, fn] of RULES) {
    if (m && m !== method) continue
    const mm = re.exec(path)
    if (mm) {
      try {
        return fn(mm, body || {}, method)
      } catch {
        break
      }
    }
  }
  return `${method} ${path.replace('/api/admin/', '')}`
}

// منشيل كلمات السر والصور من التفاصيل
function clean(v, depth = 0) {
  if (depth > 4) return '…'
  if (Array.isArray(v)) return v.slice(0, 30).map((x) => clean(x, depth + 1))
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, x] of Object.entries(v)) {
      if (SECRET_KEY.test(k)) out[k] = '•••'
      else if (BLOB_KEY.test(k) && typeof x === 'string' && x.length > 200) out[k] = '[ملف]'
      else out[k] = clean(x, depth + 1)
    }
    return out
  }
  if (typeof v === 'string' && v.length > 300) return v.slice(0, 300) + '…'
  return v
}

export function recordAudit(req, actor, method, path, body) {
  try {
    let detail = JSON.stringify(clean(body || {}))
    if (detail.length > 4000) detail = detail.slice(0, 4000)
    db.prepare(
      'INSERT INTO admin_audit (at, staff_id, actor, method, path, action, detail, ip) VALUES (?,?,?,?,?,?,?,?)'
    ).run(now(), actor.staffId ?? null, actor.name || 'المالك', method, path, describe(method, path, body), detail === '{}' ? null : detail, clientIp(req))
  } catch (err) {
    log('error', 'audit write failed', { path, err: String(err) })
  }
}

export function listAudit(url) {
  const q = url.searchParams
  const limit = Math.min(Math.max(Number(q.get('limit')) || 100, 1), 300)
  const where = []
  const args = []
  const before = Number(q.get('before'))
  if (before > 0) (where.push('id < ?'), args.push(before))
  const staff = q.get('staff')
  if (staff === 'owner') where.push("staff_id IS NULL AND actor = 'المالك'")
  else if (staff?.startsWith('name:')) (where.push('staff_id IS NULL AND actor = ?'), args.push(staff.slice(5, 80)))
  else if (/^\d+$/.test(staff || '')) (where.push('staff_id = ?'), args.push(Number(staff)))
  const text = (q.get('q') || '').trim().slice(0, 60)
  if (text) (where.push('(action LIKE ? OR detail LIKE ?)'), args.push(`%${text}%`, `%${text}%`))
  const rows = db
    .prepare(`SELECT * FROM admin_audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`)
    .all(...args, limit)
  const people = db.prepare('SELECT DISTINCT staff_id AS id, actor AS name FROM admin_audit ORDER BY actor').all()
  return {
    items: rows.map((r) => ({ id: r.id, at: r.at, staffId: r.staff_id, actor: r.actor, action: r.action, detail: r.detail ? JSON.parse(r.detail) : null, ip: r.ip })),
    people: people.map((p) => ({ id: p.id !== null ? p.id : p.name === 'المالك' ? 'owner' : `name:${p.name}`, name: p.name })),
    more: rows.length === limit,
  }
}
