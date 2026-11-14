import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, ImagePlus, LoaderCircle, Plus, Store, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'
import { imageToDataUrl, inputCls, money } from './shared'

const Card = ({ children, className = '' }) => <div className={`rounded-3xl bg-white p-5 shadow-soft ${className}`}>{children}</div>
const L = ({ label, children, hint }) => (
  <label className="block">
    <span className="text-xs font-bold text-navy/60">{label}</span>
    <div className="mt-1">{children}</div>
    {hint && <span className="mt-1 block text-[11px] text-navy/40">{hint}</span>}
  </label>
)

function ImagePick({ value, onChange, label, square }) {
  const ref = useRef(null)
  const pick = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onChange(await imageToDataUrl(f, square ? 600 : 1200))
  }
  return (
    <div className="flex items-center gap-3">
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy-50 text-navy/30 ${square ? 'h-16 w-16' : 'h-16 w-28'}`}>
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={20} />}
      </span>
      <input ref={ref} type="file" accept="image/*" hidden onChange={pick} />
      <button type="button" onClick={() => ref.current?.click()} className="rounded-xl bg-navy-50 px-3 py-2 text-xs font-bold">
        {value ? 'تغيير' : label}
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">
          إزالة
        </button>
      )}
    </div>
  )
}

/** المطاعم الشريكة: تضيف المطعم وأصنافه وأسعاره، وما بيطلع للزبون إلا لما تنشره */
export default function Stores() {
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(null) // id
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setList((await adminApi('/stores')).stores)
    } catch (e) {
      setError(adminErrorText(e))
    }
  }, [])
  useEffect(() => void load(), [load])

  if (open) return <StoreDetail id={open} onBack={() => (setOpen(null), load())} />

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-extrabold">
            <UtensilsCrossed size={18} className="text-brand" /> المطاعم الشريكة
          </h2>
          <p className="mt-1 text-xs text-navy/50">أضف مطعم مع أكلاته وأسعاره. ما بيطلع بالتطبيق إلا لما تكبس "نشر"، وبيطلع لحاله بدون أي تحديث.</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-xs font-bold text-white">
          <Plus size={16} /> مطعم جديد
        </button>
      </div>
      {error && <p className="mt-3 text-xs font-bold text-rose-600">{error}</p>}
      {!list ? (
        <div className="flex justify-center py-8 text-brand">
          <LoaderCircle className="animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-navy/40">لسا ما في مطاعم. لما تتفق مع مطعم، ضيفه من هون.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {list.map((s) => (
            <li key={s.id}>
              <button onClick={() => setOpen(s.id)} className="flex w-full items-center gap-3 rounded-2xl border border-navy/10 p-3 text-start hover:border-brand">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-lime text-navy">
                  {s.logo ? <img src={s.logo} alt="" className="h-full w-full object-cover" /> : <Store size={20} />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{s.name}</b>
                  <span className="text-xs text-navy/50">{s.itemsCount} صنف</span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${s.published ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-50 text-navy/50'}`}>
                  {s.published ? 'منشور' : 'مخفي'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <StoreEditor
          initial={{ name: '', description: '', logo: null, cover: null, published: false, isOpen: true }}
          onClose={() => setCreating(false)}
          onSaved={(s) => (setCreating(false), setOpen(s.id))}
        />
      )}
    </Card>
  )
}

function StoreEditor({ initial, onClose, onSaved }) {
  const [s, setS] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (x) => setS((v) => ({ ...v, ...x }))
  const save = async () => {
    setBusy(true)
    const body = { name: s.name, description: s.description, published: s.published, isOpen: s.isOpen }
    if (s.logo !== initial.logo) body.logo = s.logo
    if (s.cover !== initial.cover) body.cover = s.cover
    try {
      const d = initial.id ? await adminApi(`/stores/${initial.id}`, { method: 'PATCH', body }) : await adminApi('/stores', { method: 'POST', body })
      onSaved(d.store)
    } catch (e) {
      setError(adminErrorText(e))
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-navy/60 p-4" onClick={onClose}>
      <div className="my-auto w-full max-w-lg space-y-4 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{initial.id ? 'تعديل المطعم' : 'مطعم جديد'}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>
        <L label="اسم المطعم">
          <input value={s.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
        </L>
        <L label="وصف قصير (اختياري)" hint="مثال: شاورما وفروج، فتح لل 12 بالليل">
          <input value={s.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} className={inputCls} />
        </L>
        <L label="الشعار">
          <ImagePick square value={s.logo} onChange={(logo) => set({ logo })} label="رفع شعار" />
        </L>
        <L label="صورة الغلاف">
          <ImagePick value={s.cover} onChange={(cover) => set({ cover })} label="رفع صورة" />
        </L>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-3 text-sm font-bold">
            <input type="checkbox" checked={s.isOpen} onChange={(e) => set({ isOpen: e.target.checked })} /> فاتح هلق
          </label>
          <label className="flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-3 text-sm font-bold">
            <input type="checkbox" checked={s.published} onChange={(e) => set({ published: e.target.checked })} /> منشور بالتطبيق
          </label>
        </div>
        {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        <button onClick={save} disabled={busy || !s.name.trim()} className="flex w-full items-center justify-center rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-50">
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'حفظ'}
        </button>
      </div>
    </div>
  )
}

function StoreDetail({ id, onBack }) {
  const [d, setD] = useState(null)
  const [editStore, setEditStore] = useState(false)
  const [item, setItem] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setD(await adminApi(`/stores/${id}`))
    } catch (e) {
      setError(adminErrorText(e))
    }
  }, [id])
  useEffect(() => void load(), [load])

  if (!d)
    return (
      <div className="flex justify-center py-10 text-brand">
        <LoaderCircle className="animate-spin" />
      </div>
    )
  const { store, items } = d
  const togglePublish = async () => {
    await adminApi(`/stores/${id}`, { method: 'PATCH', body: { published: !store.published } }).catch((e) => setError(adminErrorText(e)))
    load()
  }
  const toggleAvail = async (it) => {
    await adminApi(`/stores/${id}/items/${it.id}`, { method: 'PATCH', body: { available: !it.available } }).catch((e) => setError(adminErrorText(e)))
    load()
  }
  const removeItem = async (it) => {
    if (!window.confirm(`حذف "${it.name}"؟`)) return
    await adminApi(`/stores/${id}/items/${it.id}`, { method: 'DELETE' }).catch((e) => setError(adminErrorText(e)))
    load()
  }
  const removeStore = async () => {
    if (!window.confirm(`حذف ${store.name} مع كل أصنافه؟`)) return
    await adminApi(`/stores/${id}`, { method: 'DELETE' })
    onBack()
  }
  const sections = [...new Set(items.map((i) => i.section).filter(Boolean))]

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-brand">
        <ArrowRight size={16} /> كل المطاعم
      </button>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-lime text-navy">
            {store.logo ? <img src={store.logo} alt="" className="h-full w-full object-cover" /> : <Store size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black">{store.name}</h2>
            <p className="text-xs text-navy/50">{store.description || 'بدون وصف'} · {store.isOpen ? 'فاتح' : 'مسكّر'}</p>
          </div>
          <button onClick={() => setEditStore(true)} className="rounded-xl bg-navy-50 px-3 py-2 text-xs font-bold">
            تعديل
          </button>
          <button
            onClick={togglePublish}
            className={`rounded-xl px-3.5 py-2 text-xs font-black ${store.published ? 'bg-rose-50 text-rose-600' : 'bg-emerald-600 text-white'}`}
          >
            {store.published ? 'إخفاء من التطبيق' : 'نشر بالتطبيق'}
          </button>
        </div>
        {!store.published && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">المطعم مخفي. زبط القائمة وبعدين اكبس "نشر بالتطبيق".</p>}
        {error && <p className="mt-3 text-xs font-bold text-rose-600">{error}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold">القائمة ({items.length} صنف)</h3>
          <button
            onClick={() => setItem({ section: sections[0] || '', name: '', description: '', price: '', image: null, available: true })}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white"
          >
            <Plus size={15} /> صنف جديد
          </button>
        </div>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-navy/40">ضيف أول صنف، مثلاً: سندويشة شاورما · 15,000</p>
        ) : (
          <ul className="mt-3 divide-y divide-navy/5">
            {items.map((it) => (
              <li key={it.id} className={`flex items-center gap-3 py-2.5 ${it.available ? '' : 'opacity-50'}`}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy-50 text-navy/30">
                  {it.image ? <img src={it.image} alt="" className="h-full w-full object-cover" /> : <UtensilsCrossed size={16} />}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <b className="block truncate">{it.name}</b>
                  <span className="text-xs text-navy/50">
                    {it.section && `${it.section} · `}
                    <b className="text-brand">{money(it.price)}</b>
                  </span>
                </span>
                <button onClick={() => toggleAvail(it)} className="rounded-lg bg-navy-50 px-2 py-1.5 text-[11px] font-bold">
                  {it.available ? 'متوفر' : 'خلصان'}
                </button>
                <button onClick={() => setItem(it)} className="rounded-lg bg-navy-50 px-2 py-1.5 text-[11px] font-bold">
                  تعديل
                </button>
                <button onClick={() => removeItem(it)} aria-label="حذف" className="rounded-lg bg-rose-50 p-1.5 text-rose-600">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <button onClick={removeStore} className="text-xs font-bold text-rose-600">
        حذف المطعم نهائياً
      </button>

      {editStore && <StoreEditor initial={store} onClose={() => setEditStore(false)} onSaved={() => (setEditStore(false), load())} />}
      {item && <ItemEditor storeId={id} initial={item} sections={sections} onClose={() => setItem(null)} onSaved={() => (setItem(null), load())} />}
    </div>
  )
}

function ItemEditor({ storeId, initial, sections, onClose, onSaved }) {
  const [it, setIt] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (x) => setIt((v) => ({ ...v, ...x }))
  const save = async () => {
    setBusy(true)
    const body = { section: it.section, name: it.name, description: it.description, price: Number(String(it.price).replace(/\D/g, '')), available: it.available }
    if (it.image !== initial.image) body.image = it.image
    try {
      if (initial.id) await adminApi(`/stores/${storeId}/items/${initial.id}`, { method: 'PATCH', body })
      else await adminApi(`/stores/${storeId}/items`, { method: 'POST', body })
      onSaved()
    } catch (e) {
      setError(e.code === 'INVALID' ? 'تأكد من الاسم والسعر' : adminErrorText(e))
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-navy/60 p-4" onClick={onClose}>
      <div className="my-auto w-full max-w-lg space-y-4 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{initial.id ? 'تعديل الصنف' : 'صنف جديد'}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <L label="اسم الصنف">
            <input value={it.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          </L>
          <L label="السعر (ل.س)">
            <input inputMode="numeric" value={it.price} onChange={(e) => set({ price: e.target.value.replace(/\D/g, '') })} className={inputCls} />
          </L>
          <L label="القسم (اختياري)" hint="مثال: سندويشات، وجبات، مشروبات">
            <input list="menu-sections" value={it.section} maxLength={40} onChange={(e) => set({ section: e.target.value })} className={inputCls} />
            <datalist id="menu-sections">
              {sections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </L>
          <L label="وصف (اختياري)">
            <input value={it.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} className={inputCls} />
          </L>
        </div>
        <L label="صورة (اختياري)">
          <ImagePick square value={it.image} onChange={(image) => set({ image })} label="رفع صورة" />
        </L>
        {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        <button onClick={save} disabled={busy || !it.name.trim() || it.price === ''} className="flex w-full items-center justify-center rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-50">
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'حفظ'}
        </button>
      </div>
    </div>
  )
}
