// أقسام لوحة الإدارة: الزبائن، الإعلانات، الإشعارات العامة، محتوى التطبيق
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  LoaderCircle,
  Megaphone,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  Send,
  Trash2,
  X,
  KeyRound,
} from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'
import { imageToDataUrl, inputCls } from './shared'

const Card = ({ children, className = '' }) => <div className={`rounded-3xl bg-white p-5 shadow-soft ${className}`}>{children}</div>
const Spinner = () => (
  <div className="flex justify-center py-10 text-brand">
    <LoaderCircle className="animate-spin" />
  </div>
)
const Err = ({ children }) =>
  children ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{children}</p> : null
const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="text-sm font-bold">{label}</span>
    {hint && <span className="block text-[11px] text-navy/40">{hint}</span>}
    <div className="mt-1.5">{children}</div>
  </label>
)
function SaveButton({ busy, saved, children = 'حفظ', ...p }) {
  return (
    <button
      {...p}
      disabled={busy || p.disabled}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-extrabold text-white disabled:opacity-60"
    >
      {busy ? <LoaderCircle size={18} className="animate-spin" /> : saved ? <><Check size={18} /> تم الحفظ</> : children}
    </button>
  )
}
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-SY', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

/* ───────── الزبائن ───────── */

export function Customers() {
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(0)
  const load = useCallback(async (query) => {
    try {
      setData(await adminApi(`/customers?q=${encodeURIComponent(query)}`))
      setError('')
    } catch (err) {
      setError(adminErrorText(err))
    }
  }, [])
  useEffect(() => {
    const t = setTimeout(() => load(q), 300)
    return () => clearTimeout(t)
  }, [q, load])

  const toggleBlock = async (c) => {
    setBusy(c.id)
    try {
      await adminApi(`/customers/${c.id}`, { method: 'PATCH', body: { blocked: !c.blocked } })
      await load(q)
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy(0)
    }
  }

  const [temp, setTemp] = useState(null)
  const tempPassword = async (c) => {
    if (!window.confirm(`إعطاء ${c.name} كلمة سر مؤقتة؟ رح يطلع من حسابه وبيفوت بالكلمة الجديدة وبيغيّرها.`)) return
    setBusy(c.id)
    try {
      setTemp(await adminApi(`/customers/${c.id}/temp-password`, { method: 'POST' }))
      await load(q)
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy(0)
    }
  }

  return (
    <Card>
      {temp && (
        <div className="mb-4 rounded-2xl border border-lime bg-lime/20 p-4 text-sm">
          <p className="font-extrabold">كلمة السر المؤقتة لـ {temp.name}</p>
          <p dir="ltr" className="mt-2 text-center font-en text-3xl font-black tracking-[0.3em]">{temp.temp}</p>
          <div className="mt-3 flex gap-2">
            <a
              href={`https://wa.me/963${temp.phone.slice(1)}?text=${encodeURIComponent(`أهلاً ${temp.name}،\nكلمة السر المؤقتة لحسابك بتطبيق ZAPP: ${temp.temp}\nفوت بالرقم ${temp.phone} وهالكلمة، والتطبيق رح يطلب منك تحط كلمة سر جديدة.`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-xl bg-emerald-600 py-2 text-center text-xs font-bold text-white"
            >
              ابعتها عالواتساب
            </a>
            <button onClick={() => setTemp(null)} className="rounded-xl bg-white px-4 py-2 text-xs font-bold">
              تم
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-navy/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم" className={`${inputCls} ps-9`} />
        </div>
        {data && <span className="text-xs text-navy/50">المجموع: {data.total} زبون</span>}
      </div>
      <Err>{error}</Err>
      {!data ? (
        <Spinner />
      ) : data.customers.length === 0 ? (
        <p className="py-10 text-center text-sm text-navy/40">لا يوجد زبائن مطابقون</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-navy/10 text-start text-xs text-navy/50">
                <th className="py-2 text-start font-bold">الزبون</th>
                <th className="py-2 text-start font-bold">الطلبات</th>
                <th className="py-2 text-start font-bold">آخر طلب</th>
                <th className="py-2 text-start font-bold">الإشعارات</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.customers.map((c) => (
                <tr key={c.id} className={`border-b border-navy/5 ${c.blocked ? 'opacity-50' : ''}`}>
                  <td className="py-3">
                    <p className="font-bold">
                      {c.name} {c.blocked && <span className="rounded bg-rose-100 px-1.5 text-[10px] text-rose-700">موقوف</span>}
                      {!c.hasPassword && <span className="ms-1 rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">بدون كلمة سر</span>}
                    </p>
                    <p dir="ltr" className="text-end font-en text-xs text-navy/50 rtl:text-start">
                      {c.phone}
                    </p>
                  </td>
                  <td className="py-3">
                    {c.orders} <span className="text-xs text-navy/40">({c.delivered} تم توصيلها)</span>
                  </td>
                  <td className="py-3 text-xs text-navy/60">{c.lastOrderAt ? fmtDate(c.lastOrderAt) : 'لا يوجد'}</td>
                  <td className="py-3 text-xs">{c.push ? 'مفعّلة' : <span className="text-navy/40">غير مفعّلة</span>}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-1.5">
                      <a href={`tel:${c.phone}`} aria-label="اتصال" className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50">
                        <Phone size={14} />
                      </a>
                      <a
                        href={`https://wa.me/963${c.phone.slice(1)}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="واتساب"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-emerald-600"
                      >
                        <MessageCircle size={14} />
                      </a>
                      <button
                        onClick={() => tempPassword(c)}
                        disabled={busy === c.id}
                        className="flex h-8 items-center gap-1 rounded-lg bg-navy-50 px-2.5 text-xs font-bold"
                      >
                        <KeyRound size={14} /> كلمة مؤقتة
                      </button>
                      <button
                        onClick={() => toggleBlock(c)}
                        disabled={busy === c.id}
                        className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold ${c.blocked ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}
                      >
                        {busy === c.id ? <LoaderCircle size={14} className="animate-spin" /> : <Ban size={14} />}
                        {c.blocked ? 'إلغاء الإيقاف' : 'إيقاف'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/* ───────── الإعلانات ───────── */

const THEMES = {
  orange: { label: 'بنفسجي ZAPP', cls: 'bg-brand' },
  navy: { label: 'كحلي', cls: 'bg-navy' },
  green: { label: 'أخضر', cls: 'bg-[#13805C]' },
  sky: { label: 'أزرق', cls: 'bg-[#1F6FD1]' },
  rose: { label: 'وردي', cls: 'bg-[#D63C64]' },
  purple: { label: 'بنفسجي', cls: 'bg-[#6A49D8]' },
}
const ACTIONS = {
  none: 'بدون إجراء',
  order: 'يفتح طلباً جديداً',
  gas: 'يفتح طلب الغاز',
  url: 'يفتح رابطاً خارجياً',
}
const CATS = { any: 'أي محل', restaurants: 'مطعم', supermarket: 'سوبرماركت', pharmacy: 'صيدلية', library: 'مكتبة', diesel: 'مازوت', other: 'غير ذلك' }
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 16) : '')
const fromLocal = (v) => (v ? new Date(`${v}:00+03:00`).toISOString() : null)

function BannerPreview({ b }) {
  return (
    <div className={`relative flex h-40 w-full overflow-hidden rounded-3xl text-white ${THEMES[b.theme]?.cls || THEMES.orange.cls}`}>
      {b.imagePreview || b.image ? (
        <>
          <img src={b.imagePreview || b.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-l from-black/70 via-black/40 to-transparent" />
        </>
      ) : (
        <span className="pointer-events-none absolute -bottom-12 -end-10 h-44 w-44 rounded-full bg-white/10" />
      )}
      <span className="relative flex max-w-[78%] flex-col justify-center p-5">
        {b.badge && <span className="mb-2 w-fit rounded-full bg-white/25 px-2.5 py-0.5 text-[11px] font-bold">{b.badge}</span>}
        <span className="text-lg font-extrabold leading-snug">{b.title || 'عنوان الإعلان'}</span>
        {b.subtitle && <span className="mt-1 text-xs text-white/90">{b.subtitle}</span>}
      </span>
    </div>
  )
}

function BannerEditor({ initial, onClose, onSaved }) {
  const [b, setB] = useState(
    initial || { title: '', subtitle: '', badge: '', theme: 'navy', placement: 'top', action: 'order', actionValue: 'any', active: true, startsAt: null, endsAt: null }
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const set = (p) => setB((x) => ({ ...x, ...p }))

  const pickImage = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const dataUrl = await imageToDataUrl(f)
      set({ newImage: dataUrl, imagePreview: dataUrl, removeImage: false })
    } catch {
      setError('تعذّر قراءة الصورة')
    }
  }

  const save = async () => {
    setBusy(true)
    setError('')
    const body = {
      title: b.title,
      subtitle: b.subtitle,
      badge: b.badge,
      theme: b.theme,
      placement: b.placement || 'top',
      action: b.action,
      actionValue: b.action === 'none' || b.action === 'gas' ? '' : b.actionValue,
      active: b.active,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      ...(b.newImage ? { image: b.newImage } : b.removeImage ? { image: null } : {}),
    }
    try {
      if (initial?.id) await adminApi(`/banners/${initial.id}`, { method: 'PATCH', body })
      else await adminApi('/banners', { method: 'POST', body })
      onSaved()
    } catch (err) {
      setError(err.code === 'INVALID' ? err.message.replace('Link must start with https://', 'الرابط يجب أن يبدأ بـ https://') : adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-navy/60 p-4 animate-fade-in" onClick={onClose}>
      <div className="my-auto w-full max-w-2xl rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{initial?.id ? 'تعديل الإعلان' : 'إعلان جديد'}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>

        <p className="mt-4 text-xs font-bold text-navy/50">معاينة كما يظهر في التطبيق</p>
        <div className="mt-2 max-w-sm">
          <BannerPreview b={b.removeImage ? { ...b, image: null, imagePreview: null } : b} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="العنوان">
            <input value={b.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} className={inputCls} />
          </Field>
          <Field label="الشارة (اختياري)" hint="كلمة قصيرة مثل: جديد، خصم">
            <input value={b.badge} maxLength={20} onChange={(e) => set({ badge: e.target.value })} className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="النص الفرعي (اختياري)">
              <input value={b.subtitle} maxLength={140} onChange={(e) => set({ subtitle: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <Field label="مكان الإعلان">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['top', 'فوق (تحت صندوق الطلب)'],
                ['mid', 'بنص الصفحة'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set({ placement: id })}
                  className={`rounded-xl px-3 py-2.5 text-xs font-bold ${(b.placement || 'top') === id ? 'bg-brand text-white' : 'bg-navy-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="اللون">
            <div className="flex flex-wrap gap-2">
              {Object.entries(THEMES).map(([id, t]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set({ theme: id })}
                  aria-label={t.label}
                  title={t.label}
                  className={`h-9 w-9 rounded-full ${t.cls} ${b.theme === id ? 'ring-4 ring-brand/40 ring-offset-2' : ''}`}
                />
              ))}
            </div>
          </Field>
          <Field label="صورة (اختياري)" hint="يظهر النص فوق الصورة">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-xl bg-navy-50 px-3 py-2.5 text-xs font-bold">
                <ImagePlus size={16} /> {b.image || b.imagePreview ? 'تغيير الصورة' : 'رفع صورة'}
              </button>
              {(b.image || b.imagePreview) && !b.removeImage && (
                <button
                  type="button"
                  onClick={() => set({ removeImage: true, newImage: null, imagePreview: null })}
                  className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-600"
                >
                  حذف الصورة
                </button>
              )}
            </div>
          </Field>

          <Field label="عند الضغط على الإعلان">
            <select value={b.action} onChange={(e) => set({ action: e.target.value, actionValue: e.target.value === 'order' ? 'any' : '' })} className={inputCls}>
              {Object.entries(ACTIONS).map(([id, l]) => (
                <option key={id} value={id}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {b.action === 'order' && (
            <Field label="نوع المحل">
              <select value={b.actionValue} onChange={(e) => set({ actionValue: e.target.value })} className={inputCls}>
                {Object.entries(CATS).map(([id, l]) => (
                  <option key={id} value={id}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {b.action === 'url' && (
            <Field label="الرابط">
              <input dir="ltr" value={b.actionValue} placeholder="https://" onChange={(e) => set({ actionValue: e.target.value })} className={inputCls} />
            </Field>
          )}

          <Field label="يبدأ الظهور (اختياري)" hint="اتركه فارغاً ليظهر فوراً">
            <input type="datetime-local" value={toLocal(b.startsAt)} onChange={(e) => set({ startsAt: fromLocal(e.target.value) })} className={inputCls} />
          </Field>
          <Field label="ينتهي الظهور (اختياري)" hint="اتركه فارغاً ليبقى دائماً">
            <input type="datetime-local" value={toLocal(b.endsAt)} onChange={(e) => set({ endsAt: fromLocal(e.target.value) })} className={inputCls} />
          </Field>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={b.active} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4 accent-[#4B1FE0]" />
          الإعلان ظاهر للزبائن
        </label>
        <Err>{error}</Err>
        <div className="mt-5">
          <SaveButton busy={busy} onClick={save} disabled={!b.title.trim()}>
            {initial?.id ? 'حفظ التعديلات' : 'نشر الإعلان'}
          </SaveButton>
        </div>
      </div>
    </div>
  )
}

export function Banners() {
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null) // null | {} | banner
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(0)
  const load = useCallback(() => {
    adminApi('/banners')
      .then((d) => setList(d.banners))
      .catch((err) => setError(adminErrorText(err)))
  }, [])
  useEffect(load, [load])

  const patch = async (b, body) => {
    setBusy(b.id)
    try {
      await adminApi(`/banners/${b.id}`, { method: 'PATCH', body })
      load()
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy(0)
    }
  }
  const remove = async (b) => {
    if (!window.confirm?.(`حذف الإعلان "${b.title}"؟`)) return
    setBusy(b.id)
    try {
      await adminApi(`/banners/${b.id}`, { method: 'DELETE' })
      load()
    } finally {
      setBusy(0)
    }
  }
  // تبديل الترتيب مع الإعلان المجاور
  const move = async (i, dir) => {
    const a = list[i]
    const b = list[i + dir]
    if (!b) return
    setBusy(a.id)
    try {
      await adminApi(`/banners/${a.id}`, { method: 'PATCH', body: { sort: i + dir } })
      await adminApi(`/banners/${b.id}`, { method: 'PATCH', body: { sort: i } })
      for (const [k, x] of list.entries()) if (x.sort !== k && x.id !== a.id && x.id !== b.id) await adminApi(`/banners/${x.id}`, { method: 'PATCH', body: { sort: k } })
      load()
    } finally {
      setBusy(0)
    }
  }

  const now = new Date().toISOString()
  const statusOf = (b) =>
    !b.active ? ['مخفي', 'bg-slate-100 text-slate-600'] : b.endsAt && b.endsAt <= now ? ['منتهي', 'bg-rose-100 text-rose-700'] : b.startsAt && b.startsAt > now ? ['مجدول', 'bg-amber-100 text-amber-800'] : ['ظاهر الآن', 'bg-emerald-100 text-emerald-700']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy/60">الإعلانات تظهر كسلايدر أعلى الصفحة الرئيسية في تطبيق الزبون، وتتنقّل تلقائياً.</p>
        <button onClick={() => setEditing({})} className="flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-extrabold text-white">
          <Plus size={18} /> إعلان جديد
        </button>
      </div>
      <Err>{error}</Err>
      {!list ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-navy/40">لا توجد إعلانات بعد</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((b, i) => {
            const [st, cls] = statusOf(b)
            return (
              <Card key={b.id} className="p-3">
                <BannerPreview b={b} />
                <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{st}</span>
                  <span className="text-[11px] text-navy/50">{ACTIONS[b.action]}</span>
                  {b.endsAt && <span className="text-[11px] text-navy/50">حتى {fmtDate(b.endsAt)}</span>}
                  <div className="ms-auto flex gap-1">
                    <IconBtn label="أعلى" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp size={14} />
                    </IconBtn>
                    <IconBtn label="أسفل" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                      <ArrowDown size={14} />
                    </IconBtn>
                    <IconBtn label={b.active ? 'إخفاء' : 'إظهار'} onClick={() => patch(b, { active: !b.active })}>
                      {b.active ? <EyeOff size={14} /> : <Eye size={14} />}
                    </IconBtn>
                    <IconBtn label="تعديل" onClick={() => setEditing(b)}>
                      <Pencil size={14} />
                    </IconBtn>
                    <IconBtn label="حذف" danger onClick={() => remove(b)}>
                      {busy === b.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </IconBtn>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {editing && (
        <BannerEditor
          initial={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function IconBtn({ children, label, danger, ...p }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-30 ${danger ? 'bg-rose-50 text-rose-600' : 'bg-navy-50'}`}
    >
      {children}
    </button>
  )
}

/* ───────── الإشعارات العامة ───────── */

export function Announcements() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ title: '', body: '' })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(() => {
    adminApi('/announcements')
      .then(setData)
      .catch((err) => setError(adminErrorText(err)))
  }, [])
  useEffect(load, [load])

  const send = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await adminApi('/announcements', { method: 'POST', body: form })
      setResult(`تم الإرسال إلى ${r.customers} زبون مفعّل الإشعارات، وسيظهر لبقية الزبائن داخل التطبيق.`)
      setForm({ title: '', body: '' })
      setConfirm(false)
      load()
    } catch (err) {
      setError(err.code === 'RATE_LIMITED' ? 'وصلت إلى الحد المسموح (10 إشعارات في الساعة)' : adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id) => {
    await adminApi(`/announcements/${id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <h2 className="flex items-center gap-2 font-extrabold">
          <Megaphone size={18} className="text-brand" /> إرسال إشعار لكل الزبائن
        </h2>
        {data && (
          <p className="mt-1 text-xs text-navy/50">
            يصل إشعاراً على الموبايل إلى {data.reach} زبون من أصل {data.customers}، ويظهر للجميع في صندوق الإشعارات داخل التطبيق.
          </p>
        )}
        <div className="mt-4 space-y-3">
          <Field label="العنوان">
            <input value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: توصيل مجاني يوم الجمعة" className={inputCls} />
          </Field>
          <Field label="النص (اختياري)">
            <textarea
              rows={3}
              maxLength={300}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className={`${inputCls} resize-none`}
            />
          </Field>
        </div>

        {/* معاينة كما يظهر على الموبايل */}
        {form.title && (
          <div className="mt-4 rounded-2xl bg-navy-50 p-3">
            <p className="text-[11px] text-navy/40">معاينة الإشعار</p>
            <div className="mt-2 flex gap-3 rounded-xl bg-white p-3 shadow-sm">
              <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{form.title}</p>
                {form.body && <p className="line-clamp-2 text-xs text-navy/60">{form.body}</p>}
              </div>
            </div>
          </div>
        )}
        <Err>{error}</Err>
        {result && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-700">{result}</p>}
        <div className="mt-4">
          {confirm ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirm(false)} className="flex-1 rounded-2xl bg-navy-50 py-3 text-sm font-bold">
                تراجع
              </button>
              <button onClick={send} disabled={busy} className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-extrabold text-white">
                {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'تأكيد الإرسال للجميع'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setResult('')
                setConfirm(true)
              }}
              disabled={!form.title.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              <Send size={16} className="-scale-x-100" /> إرسال
            </button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-extrabold">الإشعارات السابقة</h2>
        {!data ? (
          <Spinner />
        ) : data.announcements.length === 0 ? (
          <p className="py-8 text-center text-sm text-navy/40">لم يُرسل أي إشعار بعد</p>
        ) : (
          <ul className="mt-3 divide-y divide-navy/5">
            {data.announcements.map((a) => (
              <li key={a.id} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{a.title}</p>
                  {a.body && <p className="line-clamp-2 text-xs text-navy/60">{a.body}</p>}
                  <p className="mt-1 text-[11px] text-navy/40">
                    {fmtDate(a.createdAt)}، وصل إلى {a.sentCount} زبون
                  </p>
                </div>
                <IconBtn label="حذف من صندوق الإشعارات" danger onClick={() => remove(a.id)}>
                  <Trash2 size={14} />
                </IconBtn>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ───────── محتوى التطبيق ───────── */

const SERVICE_NAMES = { restaurants: 'مطاعم', supermarket: 'سوبرماركت', gas: 'غاز', diesel: 'مازوت', pharmacy: 'صيدلية', library: 'مكتبات' }

export function AppContent() {
  const [c, setC] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    adminApi('/content')
      .then((d) => setC(d.content))
      .catch((err) => setError(adminErrorText(err)))
  }, [])
  const set = (p) => setC((x) => ({ ...x, ...p }))
  const setSvc = (i, p) => set({ services: c.services.map((s, k) => (k === i ? { ...s, ...p } : s)) })
  const moveSvc = (i, dir) => {
    const list = [...c.services]
    ;[list[i], list[i + dir]] = [list[i + dir], list[i]]
    set({ services: list })
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await adminApi('/content', { method: 'PUT', body: c })
      setC(d.content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.code === 'INVALID_PHONE' ? 'رقم الدعم يبدأ بـ 09 ويتكوّن من 10 أرقام' : adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (!c) return error ? <Err>{error}</Err> : <Spinner />

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="font-extrabold">النصوص والمعلومات العامة</h2>
        <div className="mt-4 space-y-4">
          <Field label="اسم المنطقة" hint="يظهر أعلى التطبيق بجانب «التوصيل إلى»">
            <input value={c.areaName} maxLength={40} onChange={(e) => set({ areaName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="رمز العملة" hint="يظهر بجانب كل الأسعار، مثل: ل.س أو ل.س.ج">
            <input value={c.currency} maxLength={12} onChange={(e) => set({ currency: e.target.value })} className={inputCls} />
          </Field>
          <Field label="عنوان البطاقة الرئيسية">
            <input value={c.heroTitle} maxLength={60} onChange={(e) => set({ heroTitle: e.target.value })} className={inputCls} />
          </Field>
          <Field label="النص تحت العنوان">
            <textarea rows={2} maxLength={140} value={c.heroSub} onChange={(e) => set({ heroSub: e.target.value })} className={`${inputCls} resize-none`} />
          </Field>
          <Field label="رقم واتساب الدعم" hint="يظهر للزبون في صفحة «حسابي». اتركه فارغاً لإخفائه">
            <input
              dir="ltr"
              inputMode="numeric"
              value={c.supportPhone}
              placeholder="09xxxxxxxx"
              onChange={(e) => set({ supportPhone: e.target.value.replace(/\D/g, '') })}
              className={`${inputCls} text-end font-en`}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-extrabold">الخدمات في الصفحة الرئيسية</h2>
        <p className="mt-1 text-xs text-navy/50">فعّل أو أخفِ أي خدمة، وعدّل اسمها، ورتّبها.</p>
        <ul className="mt-4 space-y-2">
          {c.services.map((s, i) => (
            <li key={s.id} className={`rounded-2xl border p-3 ${s.enabled ? 'border-navy/10' : 'border-dashed border-navy/15 opacity-60'}`}>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => setSvc(i, { enabled: e.target.checked })} className="h-4 w-4 accent-[#4B1FE0]" />
                  {SERVICE_NAMES[s.id]}
                </label>
                <div className="ms-auto flex gap-1">
                  <IconBtn label="أعلى" onClick={() => moveSvc(i, -1)} disabled={i === 0}>
                    <ArrowUp size={14} />
                  </IconBtn>
                  <IconBtn label="أسفل" onClick={() => moveSvc(i, 1)} disabled={i === c.services.length - 1}>
                    <ArrowDown size={14} />
                  </IconBtn>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input value={s.label} maxLength={20} onChange={(e) => setSvc(i, { label: e.target.value })} placeholder="الاسم الكامل" className={inputCls} />
                <input value={s.sub} maxLength={24} onChange={(e) => setSvc(i, { sub: e.target.value })} placeholder="وصف قصير" className={inputCls} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="lg:col-span-2">
        <Err>{error}</Err>
        <SaveButton busy={busy} saved={saved} onClick={save}>
          حفظ ونشر في التطبيق
        </SaveButton>
        <p className="mt-2 text-center text-[11px] text-navy/40">تظهر التعديلات للزبائن عند فتح التطبيق التالي.</p>
      </div>
    </div>
  )
}

/* ───────── الفريق والصلاحيات ───────── */

export function Team() {
  const [staff, setStaff] = useState(null)
  const [roles, setRoles] = useState(null)
  const [perms, setPerms] = useState({})
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', password: '', roleId: '' })
  const [busy, setBusy] = useState('')
  const [editingRole, setEditingRole] = useState(null) // {id?, name, permissions}
  const [pwFor, setPwFor] = useState(null)
  const [newPw, setNewPw] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([adminApi('/staff'), adminApi('/roles')])
      setStaff(s.staff)
      setRoles(r.roles)
      setPerms(r.permissions)
      setForm((f) => (f.roleId ? f : { ...f, roleId: String(r.roles[0]?.id || '') }))
    } catch (err) {
      setError(adminErrorText(err))
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const run = async (key, fn) => {
    setBusy(key)
    setError('')
    try {
      await fn()
      await load()
      return true
    } catch (err) {
      setError(adminErrorText(err))
      return false
    } finally {
      setBusy('')
    }
  }

  const addStaff = (e) => {
    e.preventDefault()
    run('add', () => adminApi('/staff', { method: 'POST', body: { ...form, roleId: Number(form.roleId) } })).then(
      (ok) => ok && setForm({ name: '', phone: '', password: '', roleId: form.roleId })
    )
  }
  const saveRole = () =>
    run('role', () =>
      editingRole.id
        ? adminApi(`/roles/${editingRole.id}`, { method: 'PATCH', body: { name: editingRole.name, permissions: editingRole.permissions } })
        : adminApi('/roles', { method: 'POST', body: { name: editingRole.name, permissions: editingRole.permissions } })
    ).then((ok) => ok && setEditingRole(null))

  if (!staff || !roles) return error ? <Err>{error}</Err> : <Spinner />

  return (
    <div className="space-y-4">
      <Err>{error}</Err>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 font-extrabold">
            <UserPlus size={18} className="text-brand" /> إضافة حساب للفريق
          </h2>
          <p className="mt-1 text-xs text-navy/50">
            يدخل صاحب الحساب إلى لوحة الإدارة برقم موبايله وكلمة السر، ويرى فقط الأقسام المسموحة لدوره. يمكن للمشرف أن يكون عامل توصيل أيضاً بحساب
            منفصل في تطبيق العمال.
          </p>
          <form onSubmit={addStaff} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم الكامل" className={inputCls} />
              <input
                dir="ltr"
                inputMode="numeric"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
                placeholder="09xxxxxxxx"
                className={`${inputCls} text-end font-en`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="كلمة السر (8 أحرف على الأقل)"
                className={inputCls}
              />
              <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className={inputCls}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <SaveButton busy={busy === 'add'} disabled={!form.name || form.phone.length !== 10 || form.password.length < 8}>
              إضافة الحساب
            </SaveButton>
          </form>
        </Card>

        <Card>
          <h2 className="font-extrabold">الحسابات</h2>
          {staff.length === 0 ? (
            <p className="py-8 text-center text-sm text-navy/40">لا توجد حسابات بعد. أنت تدخل كمالك بكلمة السر الرئيسية.</p>
          ) : (
            <ul className="mt-3 divide-y divide-navy/5">
              {staff.map((m) => (
                <li key={m.id} className={`py-3 ${m.active ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {m.name} {m.isCourier && <span className="rounded bg-sky-100 px-1.5 text-[10px] text-sky-700">عامل توصيل أيضاً</span>}
                      </p>
                      <p className="text-[11px] text-navy/50">
                        <span dir="ltr" className="font-en">{m.phone}</span>
                        {m.lastLoginAt ? `، آخر دخول ${fmtDate(m.lastLoginAt)}` : '، لم يدخل بعد'}
                      </p>
                    </div>
                    <select
                      value={m.roleId}
                      onChange={(e) => run(`r${m.id}`, () => adminApi(`/staff/${m.id}`, { method: 'PATCH', body: { roleId: Number(e.target.value) } }))}
                      className="rounded-lg border border-navy/10 bg-navy-50 px-2 py-1.5 text-xs font-bold"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pwFor === m.id ? (
                      <>
                        <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="كلمة سر جديدة" className={`${inputCls} max-w-[200px] py-1.5`} />
                        <button
                          onClick={() => run(`p${m.id}`, () => adminApi(`/staff/${m.id}`, { method: 'PATCH', body: { password: newPw } })).then((ok) => ok && (setPwFor(null), setNewPw('')))}
                          disabled={newPw.length < 8}
                          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          حفظ
                        </button>
                        <button onClick={() => setPwFor(null)} className="rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold">
                          تراجع
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setPwFor(m.id)} className="rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-bold">
                        تغيير كلمة السر
                      </button>
                    )}
                    <button
                      onClick={() => run(`a${m.id}`, () => adminApi(`/staff/${m.id}`, { method: 'PATCH', body: { active: !m.active } }))}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${m.active ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}
                    >
                      {m.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                    </button>
                    {busy.endsWith(String(m.id)) && busy !== 'add' && <LoaderCircle size={16} className="animate-spin text-brand" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-extrabold">
            <ShieldCheck size={18} className="text-brand" /> الأدوار والصلاحيات
          </h2>
          <button onClick={() => setEditingRole({ name: '', permissions: [] })} className="flex items-center gap-1 rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white">
            <Plus size={14} /> دور جديد
          </button>
        </div>
        <p className="mt-1 text-xs text-navy/50">المالك يملك كل الصلاحيات دائماً. أنشئ أدواراً جديدة عندما يكبر فريقك، مثل «مدير فرع».</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-navy/10 text-navy/50">
                <th className="py-2 text-start font-bold">الصلاحية</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-2 py-2 font-bold">
                    <button onClick={() => setEditingRole({ ...r })} className="inline-flex items-center gap-1 hover:text-brand">
                      {r.name} <Pencil size={11} />
                    </button>
                    <span className="block font-normal text-navy/40">{r.members} حساب</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(perms).map(([key, label]) => (
                <tr key={key} className="border-b border-navy/5">
                  <td className="py-2.5">{label}</td>
                  {roles.map((r) => (
                    <td key={r.id} className="px-2 py-2.5 text-center">
                      {r.permissions.includes(key) ? <Check size={16} className="inline text-emerald-600" /> : <span className="text-navy/20">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4 animate-fade-in" onClick={() => setEditingRole(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold">{editingRole.id ? 'تعديل الدور' : 'دور جديد'}</h2>
              <button onClick={() => setEditingRole(null)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4">
              <Field label="اسم الدور">
                <input value={editingRole.name} maxLength={40} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <p className="mt-4 text-sm font-bold">الصلاحيات</p>
            <ul className="mt-2 space-y-2">
              {Object.entries(perms).map(([key, label]) => (
                <li key={key}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editingRole.permissions.includes(key)}
                      onChange={(e) =>
                        setEditingRole({
                          ...editingRole,
                          permissions: e.target.checked ? [...editingRole.permissions, key] : editingRole.permissions.filter((p) => p !== key),
                        })
                      }
                      className="h-4 w-4 accent-[#4B1FE0]"
                    />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex gap-2">
              {editingRole.id && !editingRole.members && (
                <button
                  onClick={() => run('del', () => adminApi(`/roles/${editingRole.id}`, { method: 'DELETE' })).then((ok) => ok && setEditingRole(null))}
                  className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600"
                >
                  حذف
                </button>
              )}
              <div className="flex-1">
                <SaveButton busy={busy === 'role'} onClick={saveRole} disabled={!editingRole.name.trim()}>
                  حفظ الدور
                </SaveButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
