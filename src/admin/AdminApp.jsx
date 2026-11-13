import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ClipboardCopy,
  Database,
  Download,
  Send,
  Flame,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  ShoppingBag,
  Tag,
  X,
} from 'lucide-react'
import { LogoMark } from '../components/Logo'
import { adminApi, adminErrorText, adminPhotoUrl, downloadBackup, getAdminToken, setAdminToken, setLoggedOutHandler } from './adminApi'

const STATUS = {
  new: { label: 'جديد — بانتظار شب', cls: 'bg-amber-100 text-amber-800' },
  assigned: { label: 'مع الشب', cls: 'bg-sky-100 text-sky-800' },
  buying: { label: 'عم يشتري', cls: 'bg-violet-100 text-violet-800' },
  on_the_way: { label: 'بالطريق', cls: 'bg-orange-100 text-orange-800' },
  delivered: { label: 'تم التوصيل', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'ملغي', cls: 'bg-slate-100 text-slate-500' },
}
const CATEGORY = {
  any: 'أي شي',
  restaurants: 'مطعم',
  supermarket: 'سوبرماركت',
  pharmacy: 'صيدلية',
  library: 'مكتبة',
  diesel: 'مازوت',
  other: 'غير ذلك',
  gas: 'غاز',
}
const money = (n) => `${new Intl.NumberFormat('ar-SY').format(n)} ل.س`
const mapsUrl = (l) => `https://maps.google.com/?q=${l.lat.toFixed(6)},${l.lng.toFixed(6)}`
const waUrl = (phone, text = '') => `https://wa.me/963${phone.slice(1)}${text ? `?text=${encodeURIComponent(text)}` : ''}`
const timeAgo = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} د`
  const h = Math.round(m / 60)
  if (h < 24) return `قبل ${h} س`
  return new Date(iso).toLocaleDateString('ar-SY', { day: 'numeric', month: 'short' })
}

// الشباب المحفوظين على هذا الجهاز (للاختيار السريع)
const COURIERS_KEY = 'dawahi.couriers'
const loadCouriers = () => {
  try {
    return JSON.parse(localStorage.getItem(COURIERS_KEY)) || []
  } catch {
    return []
  }
}
const rememberCourier = (name, phone) => {
  if (!name) return
  const list = [{ name, phone }, ...loadCouriers().filter((c) => c.name !== name)].slice(0, 8)
  try {
    localStorage.setItem(COURIERS_KEY, JSON.stringify(list))
  } catch {}
}

/* ───────── التطبيق ───────── */

export default function AdminApp() {
  const [loggedIn, setLoggedIn] = useState(!!getAdminToken())
  useEffect(() => {
    setLoggedOutHandler(() => {
      setAdminToken(null)
      setLoggedIn(false)
    })
  }, [])
  return loggedIn ? <Dashboard onLogout={() => setLoggedIn(false)} /> : <Login onDone={() => setLoggedIn(true)} />
}

function Login({ onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const d = await adminApi('/login', { method: 'POST', body: { password } })
      setAdminToken(d.token)
      unlockSound()
      onDone()
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex min-h-full items-center justify-center bg-navy p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-float">
        <div className="flex items-center gap-3">
          <LogoMark className="h-12 w-12" />
          <div>
            <h1 className="text-lg font-extrabold">لوحة تحكم ضواحي</h1>
            <p className="text-xs text-navy/50">للإدارة فقط</p>
          </div>
        </div>
        <label className="mt-6 block text-sm font-bold">كلمة السر</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3.5 text-sm outline-none focus:border-brand focus:bg-white"
        />
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
        <button
          disabled={busy || !password}
          className="mt-5 flex w-full items-center justify-center rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'دخول'}
        </button>
      </form>
    </div>
  )
}

/* ───────── تنبيه صوتي للطلب الجديد ───────── */
let audioCtx = null
function unlockSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    audioCtx.resume()
  } catch {}
}
function beep() {
  try {
    if (!audioCtx) return
    ;[0, 0.25, 0.5].forEach((t) => {
      const o = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.25, audioCtx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2)
      o.connect(g).connect(audioCtx.destination)
      o.start(audioCtx.currentTime + t)
      o.stop(audioCtx.currentTime + t + 0.2)
    })
    navigator.vibrate?.([200, 100, 200])
  } catch {}
}

function Dashboard({ onLogout }) {
  const [tab, setTab] = useState('open')
  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const lastMaxId = useRef(0)

  const load = useCallback(async () => {
    if (tab === 'prices' || tab === 'backups') return
    try {
      const [o, s] = await Promise.all([adminApi(`/orders?group=${tab}`), adminApi('/stats')])
      setOrders(o.orders)
      setStats(s)
      setError('')
      // تنبيه إذا وصل طلب جديد
      const maxId = Math.max(0, ...o.orders.filter((x) => x.status === 'new').map((x) => x.id))
      if (lastMaxId.current && maxId > lastMaxId.current) beep()
      if (maxId > lastMaxId.current) lastMaxId.current = maxId
      document.title = s.waiting ? `(${s.waiting}) طلب جديد — ضواحي` : 'لوحة تحكم ضواحي'
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    setLoading(true)
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  const logout = async () => {
    await adminApi('/logout', { method: 'POST' }).catch(() => {})
    setAdminToken(null)
    onLogout()
  }

  const onUpdated = (o) => {
    setSelected(o)
    load()
  }

  return (
    <div className="mx-auto min-h-full max-w-3xl pb-10" onClick={unlockSound}>
      <header className="pt-safe sticky top-0 z-20 bg-navy px-4 pb-4 pt-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <LogoMark className="h-10 w-10" />
          <div className="flex-1">
            <h1 className="font-extrabold">لوحة تحكم ضواحي</h1>
            <p className="text-[11px] text-white/50">تتحدث تلقائياً كل 10 ثوانٍ</p>
          </div>
          <button onClick={load} aria-label="تحديث" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <RefreshCw size={18} />
          </button>
          <button onClick={logout} aria-label="خروج" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <LogOut size={18} className="-scale-x-100" />
          </button>
        </div>
        {stats && (
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <Stat label="بانتظار شب" value={stats.waiting} highlight={stats.waiting > 0} />
            <Stat label="مفتوحة" value={stats.open} />
            <Stat label="طلبات اليوم" value={stats.today.total} />
            <Stat label="وصلت اليوم" value={stats.today.delivered} />
          </div>
        )}
        <nav className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            ['open', 'المفتوحة'],
            ['done', 'تم التوصيل'],
            ['cancelled', 'الملغاة'],
            ['prices', 'الأسعار'],
            ['backups', 'النسخ الاحتياطي'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${tab === id ? 'bg-brand text-white' : 'bg-white/10 text-white/70'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="p-4">
        {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-sm font-bold text-rose-600">{error}</p>}
        {tab === 'prices' ? (
          <Prices />
        ) : tab === 'backups' ? (
          <Backups />
        ) : loading ? (
          <div className="flex justify-center pt-16 text-brand">
            <LoaderCircle size={32} className="animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <p className="pt-16 text-center text-sm text-navy/40">لا يوجد طلبات هنا</p>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} onOpen={() => setSelected(o)} />
            ))}
          </ul>
        )}
      </main>

      {selected && <OrderDetail orderId={selected.id} onClose={() => setSelected(null)} onUpdated={onUpdated} />}
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl px-1 py-2 ${highlight ? 'bg-brand animate-pulse' : 'bg-white/10'}`}>
      <div className="text-xl font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-[10px] text-white/70">{label}</div>
    </div>
  )
}

function summaryOf(o) {
  if (o.kind === 'gas') {
    return `${o.details.qty} جرة — ${o.details.gasType === 'buy' ? 'شراء جرة جديدة' : 'تبديل'}${
      !o.details.elevator && o.floor ? ` — طابق ${o.floor} بدون مصعد` : ''
    }`
  }
  return o.details.items || (o.hasPhoto ? '📷 الطلب بالصورة' : '')
}

function OrderRow({ order: o, onOpen }) {
  const st = STATUS[o.status]
  return (
    <li>
      <button
        onClick={onOpen}
        className={`w-full rounded-3xl bg-white p-4 text-start shadow-soft active:scale-[0.99] ${
          o.status === 'new' ? 'ring-2 ring-amber-400' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
            {o.kind === 'gas' ? <Flame size={20} /> : <ShoppingBag size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-extrabold">
              <span className="font-en">{o.number}</span>
              <span className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[10px] font-bold text-navy/60">{CATEGORY[o.category]}</span>
            </p>
            <p className="truncate text-xs text-navy/60">
              {o.customer.name} • {timeAgo(o.createdAt)}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
        </div>
        <p className="mt-3 line-clamp-2 whitespace-pre-line text-sm text-navy/80">{summaryOf(o)}</p>
        {o.courierName && <p className="mt-2 text-xs font-bold text-sky-700">🛵 {o.courierName}</p>}
      </button>
    </li>
  )
}

/* ───────── تفاصيل الطلب ───────── */

function orderText(o) {
  const lines = [
    `طلب ${o.number} — ${CATEGORY[o.category]}`,
    `الزبون: ${o.customer.name} — ${o.contactPhone}`,
  ]
  if (o.kind === 'gas') lines.push(`الطلب: ${summaryOf(o)}`, `التقدير: ${money(o.details.estimate)}`)
  else {
    if (o.details.storeMode === 'specific' && o.details.storeName) lines.push(`المحل: ${o.details.storeName}`)
    if (o.details.items) lines.push(`الطلب:\n${o.details.items}`)
  }
  if (o.floor) lines.push(`الطابق: ${o.floor}`)
  if (o.address) lines.push(`العنوان: ${o.address}`)
  if (o.notes) lines.push(`ملاحظة: ${o.notes}`)
  lines.push(`الموقع: ${mapsUrl(o.location)}`)
  return lines.join('\n')
}

function OrderDetail({ orderId, onClose, onUpdated }) {
  const [o, setO] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [courier, setCourier] = useState('')
  const [courierPhone, setCourierPhone] = useState('')
  const [saved] = useState(loadCouriers)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    let url
    adminApi(`/orders/${orderId}`)
      .then(async (d) => {
        setO(d.order)
        setCourier(d.order.courierName || '')
        setCourierPhone(d.order.courierPhone || '')
        if (d.order.photo) {
          url = await adminPhotoUrl(d.order.photo).catch(() => null)
          setPhoto(url)
        }
      })
      .catch((err) => setError(adminErrorText(err)))
    return () => url && URL.revokeObjectURL(url)
  }, [orderId])

  const move = async (status) => {
    setBusy(status)
    setError('')
    try {
      const d = await adminApi(`/orders/${o.id}/status`, {
        method: 'POST',
        body: { status, courierName: courier, courierPhone },
      })
      if (status === 'assigned') rememberCourier(courier, courierPhone)
      const fresh = await adminApi(`/orders/${o.id}`).catch(() => null)
      setO((prev) => ({ ...prev, ...(fresh ? fresh.order : d.order) }))
      setConfirmCancel(false)
      onUpdated(d.order)
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy('')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(orderText(o))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-navy/60 animate-fade-in" onClick={onClose}>
      <div
        className="scrollbar-hide mt-10 w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-5 pb-10 animate-sheet-up sm:my-10 sm:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-en text-xl font-extrabold">{o?.number || '...'}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>

        {!o ? (
          error ? (
            <p className="mt-6 text-center text-sm text-rose-600">{error}</p>
          ) : (
            <div className="flex justify-center py-16 text-brand">
              <LoaderCircle size={28} className="animate-spin" />
            </div>
          )
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-1 font-bold ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
              <span className="rounded-full bg-navy-50 px-2.5 py-1 font-bold">{CATEGORY[o.category]}</span>
              <span className="text-navy/50">{new Date(o.createdAt).toLocaleString('ar-SY')}</span>
            </div>

            {/* الزبون */}
            <section className="mt-5 rounded-3xl bg-navy-50 p-4">
              <p className="text-xs text-navy/50">الزبون</p>
              <p className="mt-0.5 font-extrabold">{o.customer.name}</p>
              <p dir="ltr" className="text-end font-en text-sm text-navy/70">{o.contactPhone}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={`tel:${o.contactPhone}`} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-bold">
                  <Phone size={16} className="text-brand" /> اتصال
                </a>
                <a href={waUrl(o.contactPhone)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-bold">
                  <MessageCircle size={16} className="text-emerald-600" /> واتساب
                </a>
              </div>
            </section>

            {/* الطلب */}
            <section className="mt-4">
              <p className="text-xs font-bold text-navy/50">الطلب</p>
              {o.kind === 'gas' ? (
                <div className="mt-1 rounded-3xl border border-navy/10 p-4 text-sm">
                  <p className="font-bold">{summaryOf(o)}</p>
                  <p className="mt-2 text-navy/60">
                    التقدير وقت الطلب: <b className="text-brand">{money(o.details.estimate)}</b>
                  </p>
                </div>
              ) : (
                <div className="mt-1 rounded-3xl border border-navy/10 p-4">
                  {o.details.storeMode === 'specific' && o.details.storeName && (
                    <p className="mb-2 text-xs font-bold text-brand">المحل: {o.details.storeName}</p>
                  )}
                  {o.details.items && <p className="whitespace-pre-line text-sm leading-relaxed">{o.details.items}</p>}
                  {photo && (
                    <a href={photo} target="_blank" rel="noreferrer">
                      <img src={photo} alt="صورة الطلب" className="mt-3 max-h-72 rounded-2xl object-contain" />
                    </a>
                  )}
                </div>
              )}
              {o.notes && <p className="mt-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">📝 {o.notes}</p>}
            </section>

            {/* العنوان */}
            <section className="mt-4">
              <p className="text-xs font-bold text-navy/50">العنوان</p>
              <a
                href={mapsUrl(o.location)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex items-center gap-3 rounded-3xl border border-navy/10 p-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                  <MapPin size={20} />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-bold">افتح الموقع على الخريطة</span>
                  <span className="block text-xs text-navy/60">
                    {[o.address, o.floor ? `طابق ${o.floor}` : 'أرضي'].filter(Boolean).join(' — ')}
                  </span>
                </span>
                <ChevronLeft size={18} className="text-navy/30" />
              </a>
            </section>

            {/^09\d{8}$/.test(courierPhone) && (
              <a
                href={waUrl(courierPhone, orderText(o))}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-sm font-extrabold text-white"
              >
                <Send size={16} className="-scale-x-100" /> إرسال الطلب لـ {courier || 'الشب'} على واتساب
              </a>
            )}
            <button
              onClick={copy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy/15 py-3 text-sm font-bold"
            >
              {copied ? <Check size={16} className="text-emerald-600" /> : <ClipboardCopy size={16} />}
              {copied ? 'تم النسخ — الصقه للشب على واتساب' : 'نسخ تفاصيل الطلب لإرسالها للشب'}
            </button>

            {/* تغيير الحالة */}
            {!['delivered', 'cancelled'].includes(o.status) && (
              <section className="mt-5 rounded-3xl bg-navy p-4 text-white">
                <p className="text-xs text-white/60">تغيير حالة الطلب</p>
                {o.status === 'new' && (
                  <>
                    {saved.length > 0 && (
                      <div className="scrollbar-hide mt-3 flex gap-2 overflow-x-auto">
                        {saved.map((c) => (
                          <button
                            key={c.name}
                            onClick={() => {
                              setCourier(c.name)
                              setCourierPhone(c.phone || '')
                            }}
                            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                              courier === c.name ? 'bg-brand' : 'bg-white/10 text-white/80'
                            }`}
                          >
                            🛵 {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <input
                        value={courier}
                        onChange={(e) => setCourier(e.target.value)}
                        placeholder="اسم الشب"
                        className="min-w-0 rounded-2xl bg-white/10 px-4 py-3 text-sm outline-none placeholder:text-white/40 focus:bg-white/20"
                      />
                      <input
                        value={courierPhone}
                        onChange={(e) => setCourierPhone(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="رقمه 09xxxxxxxx"
                        inputMode="numeric"
                        dir="ltr"
                        className="min-w-0 rounded-2xl bg-white/10 px-4 py-3 text-end font-en text-sm outline-none placeholder:text-white/40 focus:bg-white/20"
                      />
                    </div>
                  </>
                )}
                {o.status !== 'new' && o.courierName && (
                  <p className="mt-2 text-sm font-bold">
                    🛵 {o.courierName}
                    {o.courierPhone && <span dir="ltr" className="ms-2 font-en text-white/60">{o.courierPhone}</span>}
                  </p>
                )}
                <div className="mt-3 grid gap-2">
                  {o.status === 'new' && <Action onClick={() => move('assigned')} busy={busy === 'assigned'} label="تسليم الطلب للشب" />}
                  {o.status === 'assigned' && o.kind === 'custom' && (
                    <Action onClick={() => move('buying')} busy={busy === 'buying'} label="الشب عم يشتري الأغراض" />
                  )}
                  {(o.status === 'assigned' || o.status === 'buying') && (
                    <Action onClick={() => move('on_the_way')} busy={busy === 'on_the_way'} label="الشب بالطريق للزبون" />
                  )}
                  {o.status === 'on_the_way' && (
                    <Action onClick={() => move('delivered')} busy={busy === 'delivered'} label="تم التوصيل ✓" green />
                  )}
                  {o.status === 'assigned' && (
                    <button onClick={() => move('new')} className="py-2 text-xs font-bold text-white/60">
                      إرجاع الطلب لـ "بانتظار شب"
                    </button>
                  )}
                  {confirmCancel ? (
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmCancel(false)} className="flex-1 rounded-2xl bg-white/10 py-3 text-sm font-bold">
                        لا
                      </button>
                      <button onClick={() => move('cancelled')} className="flex-1 rounded-2xl bg-rose-600 py-3 text-sm font-bold">
                        {busy === 'cancelled' ? <LoaderCircle size={16} className="mx-auto animate-spin" /> : 'نعم، ألغِ الطلب'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmCancel(true)} className="py-2 text-xs font-bold text-rose-300">
                      إلغاء الطلب
                    </button>
                  )}
                </div>
                {error && <p className="mt-2 rounded-xl bg-rose-500/20 px-3 py-2 text-center text-xs font-bold">{error}</p>}
              </section>
            )}

            {/* السجل */}
            {o.events && (
              <section className="mt-5">
                <p className="text-xs font-bold text-navy/50">سجل الطلب</p>
                <ol className="mt-2 space-y-1.5 border-s-2 border-navy/10 ps-4">
                  {o.events.map((e, i) => (
                    <li key={i} className="text-xs">
                      <b>{STATUS[e.status]?.label}</b>{' '}
                      <span className="text-navy/50">
                        — {new Date(e.at).toLocaleTimeString('ar-SY', { hour: 'numeric', minute: '2-digit' })}
                        {e.actor === 'admin' ? ' (الإدارة)' : ' (الزبون)'}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Action({ onClick, busy, label, green }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold disabled:opacity-70 ${
        green ? 'bg-emerald-500' : 'bg-brand'
      }`}
    >
      {busy ? <LoaderCircle size={18} className="animate-spin" /> : label}
    </button>
  )
}

/* ───────── الأسعار ───────── */

const PRICE_FIELDS = [
  ['deliveryFee', 'أجرة التوصيل (ثابتة)', 'تُضاف على كل طلب'],
  ['gasPrice', 'سعر تعبئة جرة الغاز', 'سعر السوق الحالي'],
  ['emptyCylinder', 'ثمن جرة فارغة جديدة', 'عند اختيار "شراء جرة جديدة"'],
  ['stairsPerFloor', 'رسم الدرج لكل طابق', 'لكل جرة، إذا ما في مصعد'],
]

function Prices() {
  const [values, setValues] = useState(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi('/settings')
      .then((d) => setValues(Object.fromEntries(Object.entries(d.pricing).map(([k, v]) => [k, String(v)]))))
      .catch((err) => setError(adminErrorText(err)))
  }, [])

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const pricing = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]))
      await adminApi('/settings', { method: 'PUT', body: { pricing } })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (!values)
    return error ? (
      <p className="text-center text-sm text-rose-600">{error}</p>
    ) : (
      <div className="flex justify-center pt-16 text-brand">
        <LoaderCircle size={32} className="animate-spin" />
      </div>
    )

  return (
    <div className="rounded-3xl bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 font-extrabold">
        <Tag size={18} className="text-brand" /> الأسعار
      </h2>
      <p className="mt-1 text-xs text-navy/50">التعديل يظهر عند الزبائن فوراً، ولا يغيّر الطلبات القديمة.</p>
      <div className="mt-5 space-y-4">
        {PRICE_FIELDS.map(([key, label, hint]) => (
          <label key={key} className="block">
            <span className="text-sm font-bold">{label}</span>
            <span className="block text-[11px] text-navy/40">{hint}</span>
            <div className="mt-2 flex items-center rounded-2xl border border-navy/10 bg-navy-50 focus-within:border-brand focus-within:bg-white">
              <input
                inputMode="numeric"
                dir="ltr"
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value.replace(/\D/g, '') })}
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-end font-en text-base font-bold outline-none"
              />
              <span className="pe-4 text-xs text-navy/50">ل.س</span>
            </div>
          </label>
        ))}
      </div>
      {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
      <button
        onClick={save}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-70"
      >
        {busy ? <LoaderCircle size={18} className="animate-spin" /> : saved ? <><Check size={18} /> تم الحفظ</> : 'حفظ الأسعار'}
      </button>
    </div>
  )
}


/* ───────── النسخ الاحتياطي ───────── */

function Backups() {
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi('/backups')
      .then((d) => setList(d.backups))
      .catch((err) => setError(adminErrorText(err)))
  }, [])

  const backupNow = async () => {
    setBusy('now')
    setError('')
    try {
      setList((await adminApi('/backups', { method: 'POST' })).backups)
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy('')
    }
  }

  const download = async (name) => {
    setBusy(name)
    setError('')
    try {
      await downloadBackup(name)
    } catch {
      setError('ما قدرنا ننزّل النسخة، جرّب مرة ثانية')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 font-extrabold">
        <Database size={18} className="text-brand" /> النسخ الاحتياطي
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-navy/50">
        نسخة تلقائية كل يوم من الطلبات والزبائن والأسعار، تُحفظ على السيرفر لمدة 14 يوماً. نزّل نسخة على جهازك من وقت
        لآخر لتكون عندك نسخة خارج السيرفر.
      </p>
      <button
        onClick={backupNow}
        disabled={!!busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-navy py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy === 'now' ? <LoaderCircle size={16} className="animate-spin" /> : 'خذ نسخة الآن'}
      </button>
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
      {!list ? (
        <div className="flex justify-center py-8 text-brand">
          <LoaderCircle size={24} className="animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-navy/40">لا يوجد نسخ بعد — أول نسخة تُؤخذ تلقائياً خلال ساعة</p>
      ) : (
        <ul className="mt-4 divide-y divide-navy/5">
          {list.map((b) => (
            <li key={b.name} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-en text-sm font-bold">{b.name.replace('dawahi-', '').replace('.db', '')}</span>
                <span className="text-[11px] text-navy/40">{Math.max(1, Math.round(b.size / 1024))} KB</span>
              </span>
              <button
                onClick={() => download(b.name)}
                disabled={!!busy}
                className="flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand disabled:opacity-60"
              >
                {busy === b.name ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
                تنزيل
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
