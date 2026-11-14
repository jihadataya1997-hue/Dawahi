import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  Bike,
  ClipboardList,
  Image,
  LayoutDashboard,
  Megaphone,
  PanelsTopLeft,
  BellOff,
  BellRing,
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
  ShieldCheck,
  Tag,
  UserPlus,
  Users,
  Zap,
  X,
} from 'lucide-react'
import { LogoMark } from '../components/Logo'
import { disablePush, enablePush, pushState, registerSW } from '../push'
import { currency, money } from './shared'
import { AppContent, Announcements, Banners, Customers, Team } from './sections'

// المستخدم الحالي وصلاحياته
export const MeContext = createContext({ perms: [] })
const useCan = () => {
  const me = useContext(MeContext)
  return (p) => me.perms.includes(p)
}
import { adminApi, adminErrorText, adminPhotoUrl, downloadBackup, getAdminToken, setAdminToken, setLoggedOutHandler } from './adminApi'

const STATUS = {
  new: { label: 'جديد، بانتظار عامل توصيل', cls: 'bg-amber-100 text-amber-800' },
  assigned: { label: 'مع عامل التوصيل', cls: 'bg-sky-100 text-sky-800' },
  buying: { label: 'قيد الشراء', cls: 'bg-violet-100 text-violet-800' },
  on_the_way: { label: 'في الطريق', cls: 'bg-orange-100 text-orange-800' },
  delivered: { label: 'تم التوصيل', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'ملغي', cls: 'bg-slate-100 text-slate-500' },
}
const CATEGORY = {
  any: 'أي محل',
  restaurants: 'مطعم',
  supermarket: 'سوبرماركت',
  pharmacy: 'صيدلية',
  library: 'مكتبة',
  diesel: 'مازوت',
  other: 'غير ذلك',
  gas: 'غاز',
}
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

// عمال التوصيل الخارجيون المحفوظون على هذا الجهاز (للاختيار السريع)
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
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const d = await adminApi('/login', { method: 'POST', body: { phone, password } })
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
            <h1 className="text-lg font-extrabold">لوحة إدارة ZAPP</h1>
            <p className="text-xs text-navy/50">للإدارة فقط</p>
          </div>
        </div>
        <label className="mt-6 block text-sm font-bold">رقم الموبايل</label>
        <input
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="09xxxxxxxx"
          className="mt-2 w-full rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3.5 text-end font-en text-sm outline-none focus:border-brand focus:bg-white"
        />
        <p className="mt-1 text-[11px] text-navy/40">المالك يترك هذا الحقل فارغاً ويدخل بكلمة السر الرئيسية</p>
        <label className="mt-4 block text-sm font-bold">كلمة السر</label>
        <input
          type="password"
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

const ALL_NAV = [
  { id: 'overview', label: 'الرئيسية', Icon: LayoutDashboard, perm: 'orders.view' },
  { id: 'orders', label: 'الطلبات', Icon: ClipboardList, perm: 'orders.view' },
  { id: 'couriers', label: 'عمال التوصيل', Icon: Bike, perm: 'couriers.manage' },
  { id: 'customers', label: 'الزبائن', Icon: Users, perm: 'customers.view' },
  { id: 'banners', label: 'الإعلانات', Icon: Image, perm: 'content.manage' },
  { id: 'announce', label: 'الإشعارات العامة', Icon: Megaphone, perm: 'content.manage' },
  { id: 'content', label: 'محتوى التطبيق', Icon: PanelsTopLeft, perm: 'content.manage' },
  { id: 'prices', label: 'الأسعار والتوزيع', Icon: Tag, perm: 'pricing.manage' },
  { id: 'team', label: 'الفريق والصلاحيات', Icon: ShieldCheck, perm: 'staff.manage' },
  { id: 'backups', label: 'النسخ الاحتياطي', Icon: Database, perm: 'backups.manage' },
]
const TITLES = Object.fromEntries(ALL_NAV.map((n) => [n.id, n.label]))

function Dashboard({ onLogout }) {
  const [me, setMe] = useState(null)
  useEffect(() => {
    adminApi('/me')
      .then((d) => setMe(d.me))
      .catch(() => {})
  }, [])
  if (!me)
    return (
      <div className="flex min-h-full items-center justify-center text-brand">
        <LoaderCircle size={32} className="animate-spin" />
      </div>
    )
  return (
    <MeContext.Provider value={me}>
      <Shell me={me} onLogout={onLogout} />
    </MeContext.Provider>
  )
}

function Shell({ me, onLogout }) {
  const NAV = ALL_NAV.filter((n) => me.perms.includes(n.perm))
  const [section, setSection] = useState(() => (NAV.some((n) => `#${n.id}` === location.hash) ? location.hash.slice(1) : NAV[0]?.id || 'overview'))
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)
  const lastWaiting = useRef(null)

  // العملة الحالية من إعدادات التطبيق
  useEffect(() => {
    fetch('/api/app')
      .then((r) => r.json())
      .then((d) => d.currency && (currency.label = d.currency))
      .catch(() => {})
  }, [])

  // الإحصائيات + تنبيه صوتي عند وصول طلب جديد (كل 10 ثوانٍ)
  const loadStats = useCallback(async () => {
    if (!me.perms.includes('orders.view')) return
    try {
      const s = await adminApi('/stats')
      if (lastWaiting.current !== null && s.waiting > lastWaiting.current) beep()
      lastWaiting.current = s.waiting
      setStats(s)
      document.title = s.waiting ? `(${s.waiting}) طلب جديد | ZAPP` : 'لوحة إدارة ZAPP'
    } catch {}
  }, [me])
  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 10000)
    return () => clearInterval(id)
  }, [loadStats])

  const go = (id) => {
    setSection(id)
    history.replaceState(null, '', `#${id}`)
    window.scrollTo({ top: 0 })
  }
  const logout = async () => {
    await adminApi('/logout', { method: 'POST' }).catch(() => {})
    setAdminToken(null)
    onLogout()
  }

  return (
    <div className="min-h-full bg-[#F3F5F9] lg:flex" onClick={unlockSound}>
      {/* القائمة الجانبية (كمبيوتر) */}
      <aside className="speed-bg sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy p-4 text-white lg:flex">
        <div className="flex items-center gap-3 px-2 py-2">
          <LogoMark className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate font-extrabold leading-tight">{me.name}</p>
            <p className="text-[11px] text-white/50">{me.role}</p>
          </div>
        </div>
        <nav className="mt-6 flex-1 space-y-1 overflow-y-auto">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-bold transition ${
                section === id ? 'bg-brand text-white' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {id === 'orders' && stats?.waiting > 0 && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-brand">{stats.waiting}</span>
              )}
            </button>
          ))}
        </nav>
        <button onClick={logout} className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-white/60 hover:bg-white/10">
          <LogOut size={18} className="-scale-x-100" /> تسجيل الخروج
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        {/* الشريط العلوي */}
        <header className="pt-safe sticky top-0 z-20 bg-navy text-white lg:bg-white lg:text-navy lg:shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <LogoMark className="h-9 w-9 lg:hidden" />
            <h1 className="flex-1 text-lg font-extrabold">{TITLES[section]}</h1>
            <AdminBell />
            <button onClick={logout} aria-label="تسجيل الخروج" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 lg:hidden">
              <LogOut size={18} className="-scale-x-100" />
            </button>
          </div>
          {/* القائمة (موبايل) */}
          <nav className="scrollbar-hide flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
            {NAV.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${section === id ? 'bg-brand text-white' : 'bg-white/10 text-white/70'}`}
              >
                {label}
                {id === 'orders' && stats?.waiting > 0 ? ` (${stats.waiting})` : ''}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-5xl p-4 pb-16 lg:p-8">
          {section === 'overview' && <Overview stats={stats} onGo={go} onOpenOrder={setSelected} />}
          {section === 'orders' && <OrdersBoard onOpen={setSelected} />}
          {section === 'couriers' && <Couriers />}
          {section === 'customers' && <Customers />}
          {section === 'banners' && <Banners />}
          {section === 'announce' && <Announcements />}
          {section === 'content' && <AppContent />}
          {section === 'prices' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <DispatchSettings />
              <Prices />
            </div>
          )}
          {section === 'backups' && <Backups />}
          {section === 'team' && <Team />}
          {!NAV.length && <p className="pt-16 text-center text-sm text-navy/50">لا توجد صلاحيات لحسابك بعد. تواصل مع المالك.</p>}
        </main>
      </div>

      {selected && (
        <OrderDetail
          orderId={selected.id}
          onClose={() => setSelected(null)}
          onUpdated={(o) => {
            setSelected(o)
            loadStats()
          }}
        />
      )}
    </div>
  )
}

/* ───────── الرئيسية: نظرة سريعة ───────── */

function Overview({ stats, onGo, onOpenOrder }) {
  const [open, setOpen] = useState(null)
  const [couriers, setCouriers] = useState(null)
  useEffect(() => {
    const load = () => {
      adminApi('/orders?group=open').then((d) => setOpen(d.orders)).catch(() => {})
      adminApi('/couriers').then((d) => setCouriers(d.couriers.filter((c) => c.active))).catch(() => setCouriers([]))
    }
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [])
  const online = couriers?.filter((c) => c.online).length ?? '…'
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigStat label="بانتظار عامل توصيل" value={stats?.waiting ?? '…'} tone={stats?.waiting > 0 ? 'alert' : 'plain'} onClick={() => onGo('orders')} />
        <BigStat label="طلبات مفتوحة" value={stats?.open ?? '…'} onClick={() => onGo('orders')} />
        <BigStat label="طلبات اليوم" value={stats?.today.total ?? '…'} sub={stats ? `${stats.today.delivered} تم توصيلها` : ''} />
        <BigStat label="عمال متاحون الآن" value={online} sub={couriers ? `من أصل ${couriers.length}` : ''} onClick={() => onGo('couriers')} />
      </div>

      <section className="rounded-3xl bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">الطلبات المفتوحة</h2>
          <button onClick={() => onGo('orders')} className="text-xs font-bold text-brand">
            كل الطلبات
          </button>
        </div>
        {!open ? (
          <div className="flex justify-center py-8 text-brand">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : open.length === 0 ? (
          <p className="py-8 text-center text-sm text-navy/40">لا توجد طلبات مفتوحة الآن</p>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {open.slice(0, 6).map((o) => (
              <OrderRow key={o.id} order={o} onOpen={() => onOpenOrder(o)} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Shortcut Icon={Image} title="الإعلانات" sub="السلايدر أعلى التطبيق" onClick={() => onGo('banners')} />
        <Shortcut Icon={Megaphone} title="إرسال إشعار" sub="لكل الزبائن" onClick={() => onGo('announce')} />
        <Shortcut Icon={Tag} title="الأسعار" sub="التوصيل والغاز" onClick={() => onGo('prices')} />
      </div>
      {stats && <p className="text-center text-xs text-navy/40">عدد الزبائن المسجلين: {stats.customers}</p>}
    </div>
  )
}

function BigStat({ label, value, sub, tone = 'plain', onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-3xl p-4 text-start shadow-soft transition ${tone === 'alert' ? 'bg-brand text-white' : 'bg-white'} ${onClick ? 'active:scale-[0.98]' : ''}`}
    >
      <p className={`text-xs font-bold ${tone === 'alert' ? 'text-white/85' : 'text-navy/50'}`}>{label}</p>
      <p className="mt-1 font-en text-3xl font-extrabold">{value}</p>
      {sub && <p className={`text-[11px] ${tone === 'alert' ? 'text-white/80' : 'text-navy/40'}`}>{sub}</p>}
    </button>
  )
}

function Shortcut({ Icon, title, sub, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-3xl bg-white p-4 text-start shadow-soft active:scale-[0.98]">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand">
        <Icon size={20} />
      </span>
      <span>
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="block text-xs text-navy/50">{sub}</span>
      </span>
    </button>
  )
}

/* ───────── الطلبات ───────── */

function OrdersBoard({ onOpen }) {
  const [tab, setTab] = useState('open')
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setOrders((await adminApi(`/orders?group=${tab}`)).orders)
      setError('')
    } catch (err) {
      setError(adminErrorText(err))
    }
  }, [tab])
  useEffect(() => {
    setOrders(null)
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])
  return (
    <div>
      <div className="flex gap-2">
        {[
          ['open', 'المفتوحة'],
          ['done', 'تم توصيلها'],
          ['cancelled', 'الملغاة'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${tab === id ? 'bg-navy text-white' : 'bg-white text-navy/60 shadow-soft'}`}
          >
            {label}
          </button>
        ))}
        <button onClick={load} aria-label="تحديث" className="ms-auto flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-soft">
          <RefreshCw size={16} />
        </button>
      </div>
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-sm font-bold text-rose-600">{error}</p>}
      {!orders ? (
        <div className="flex justify-center pt-16 text-brand">
          <LoaderCircle size={32} className="animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <p className="pt-16 text-center text-sm text-navy/40">لا توجد طلبات هنا</p>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={() => onOpen(o)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function summaryOf(o) {
  if (o.kind === 'gas') {
    return `${o.details.qty} جرة — ${o.details.gasType === 'buy' ? 'شراء جرة جديدة' : 'تبديل'}${
      !o.details.elevator && o.floor ? ` ، الطابق ${o.floor} بدون مصعد` : ''
    }`
  }
  return o.details.items || (o.hasPhoto ? 'طلب مرفق بصورة' : '')
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
              <span className="num-zap">{o.number}</span>
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
        {o.offer && (
          <p className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-700">
            <Zap size={13} /> معروض على {o.offer.courierName}، بانتظار قبوله
          </p>
        )}
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
  const can = useCan()
  const [o, setO] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [courier, setCourier] = useState('')
  const [courierPhone, setCourierPhone] = useState('')
  const [saved] = useState(loadCouriers)
  const [registered, setRegistered] = useState([])
  const [courierId, setCourierId] = useState(null)
  useEffect(() => {
    if (!can('orders.manage')) return
    adminApi('/couriers')
      .then((d) => setRegistered(d.couriers.filter((c) => c.active)))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
        body: courierId ? { status, courierId } : { status, courierName: courier, courierPhone, courierId: null },
      })
      if (status === 'assigned' && !courierId) rememberCourier(courier, courierPhone)
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
          <h2 className="num-zap text-xl">{o?.number || '...'}</h2>
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
                <Send size={16} className="-scale-x-100" /> إرسال الطلب إلى {courier || 'عامل التوصيل'} عبر واتساب
              </a>
            )}
            <button
              onClick={copy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy/15 py-3 text-sm font-bold"
            >
              {copied ? <Check size={16} className="text-emerald-600" /> : <ClipboardCopy size={16} />}
              {copied ? 'تم النسخ، الصقه في محادثة واتساب' : 'نسخ تفاصيل الطلب'}
            </button>

            {/* تغيير الحالة */}
            {!['delivered', 'cancelled'].includes(o.status) && can('orders.manage') && (
              <section className="mt-5 rounded-3xl bg-navy p-4 text-white">
                <p className="text-xs text-white/60">تغيير حالة الطلب</p>
                {o.status === 'new' && o.offer && (
                  <p className="mt-2 rounded-xl bg-amber-500/20 px-3 py-2 text-xs">
                    التوزيع التلقائي يعرض الطلب الآن على <b>{o.offer.courierName}</b>. إذا سلّمته يدوياً يُلغى العرض.
                  </p>
                )}
                {o.status === 'new' && registered.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-[11px] text-white/50">عمال التوصيل في التطبيق (يصلهم إشعار):</p>
                    <div className="flex flex-wrap gap-2">
                      {registered.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCourierId(courierId === c.id ? null : c.id)
                            setCourier(c.name)
                            setCourierPhone(c.phone)
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                            courierId === c.id ? 'bg-brand' : 'bg-white/10 text-white/80'
                          }`}
                        >
                          <span className={`me-1 inline-block h-2 w-2 rounded-full ${c.online ? 'bg-emerald-400' : 'bg-white/30'}`} />
                          {c.name} ({c.openOrders}/3)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {o.status === 'new' && !courierId && (
                  <>
                    <p className="mt-3 text-[11px] text-white/50">أو عامل توصيل من خارج التطبيق (عبر واتساب):</p>
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
                        placeholder="اسم عامل التوصيل"
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
                  {o.status === 'new' && <Action onClick={() => move('assigned')} busy={busy === 'assigned'} label="تسليم الطلب لعامل التوصيل" />}
                  {o.status === 'assigned' && o.kind === 'custom' && (
                    <Action onClick={() => move('buying')} busy={busy === 'buying'} label="بدأ شراء الأغراض" />
                  )}
                  {(o.status === 'assigned' || o.status === 'buying') && (
                    <Action onClick={() => move('on_the_way')} busy={busy === 'on_the_way'} label="في الطريق إلى الزبون" />
                  )}
                  {o.status === 'on_the_way' && (
                    <Action onClick={() => move('delivered')} busy={busy === 'delivered'} label="تم التوصيل ✓" green />
                  )}
                  {o.status === 'assigned' && (
                    <button onClick={() => move('new')} className="py-2 text-xs font-bold text-white/60">
                      إعادة الطلب إلى قائمة الانتظار
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
                        {e.actor === 'admin' || e.actor.startsWith('staff') ? ' (الإدارة)' : e.actor.startsWith('courier') ? ' (عامل التوصيل)' : ' (الزبون)'}
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
              <span className="pe-4 text-xs text-navy/50">{currency.label}</span>
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
      setError('تعذّر تنزيل النسخة، حاول مرة أخرى')
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
        نسخة تلقائية يومية من الطلبات والزبائن والأسعار، تُحفظ على السيرفر لمدة 14 يوماً. نزّل نسخة إلى جهازك بين حين وآخر
        لتحتفظ بنسخة خارج السيرفر.
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
        <p className="py-8 text-center text-sm text-navy/40">لا توجد نسخ بعد، وستُؤخذ أول نسخة تلقائياً خلال ساعة</p>
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

/* ───────── تنبيهات المدير (طلب جديد حتى واللوحة مسكّرة) ───────── */

function AdminBell() {
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    registerSW()
      .catch(() => {})
      .finally(() => pushState().then(setState))
  }, [])
  const toggle = async () => {
    setBusy(true)
    try {
      if (state === 'enabled') {
        await disablePush((endpoint) => adminApi('/push', { method: 'DELETE', body: { endpoint } }))
        setState('off')
      } else if (state === 'off') {
        await enablePush((subscription) => adminApi('/push', { method: 'POST', body: { subscription } }))
        setState('enabled')
        await adminApi('/push/test', { method: 'POST' }).catch(() => {})
      } else if (state === 'denied') {
        alertBox('الإشعارات مرفوضة في المتصفح. افتح إعدادات الموقع واسمح بالإشعارات.')
      } else if (state === 'ios-install') {
        alertBox('على الآيفون: أضف اللوحة إلى الشاشة الرئيسية (زر المشاركة ثم إضافة إلى الشاشة الرئيسية) وافتحها من هناك.')
      } else {
        alertBox('هذا المتصفح لا يدعم الإشعارات. استخدم Chrome.')
      }
    } catch (err) {
      if (err.message === 'denied') setState('denied')
    } finally {
      setBusy(false)
    }
  }
  if (state === 'loading') return null
  const on = state === 'enabled'
  return (
    <button
      onClick={toggle}
      aria-label="التنبيهات"
      title={on ? 'الإشعارات مفعّلة' : 'فعّل إشعارات الطلبات الجديدة'}
      className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${on ? 'bg-emerald-500' : 'bg-brand animate-pulse'}`}
    >
      {busy ? <LoaderCircle size={16} className="animate-spin" /> : on ? <BellRing size={16} /> : <BellOff size={16} />}
      <span className="hidden sm:inline">{on ? 'الإشعارات مفعّلة' : 'فعّل الإشعارات'}</span>
    </button>
  )
}

// رسالة بسيطة بدل alert (بعض المتصفحات بتمنعه)
function alertBox(text) {
  const el = document.createElement('div')
  el.className = 'fixed inset-x-4 top-4 z-[100] rounded-2xl bg-navy p-4 text-sm text-white shadow-float'
  el.textContent = text
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 6000)
}

/* ───────── عمال التوصيل ───────── */

function Couriers() {
  const [list, setList] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', pin: '' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  const load = useCallback(() => {
    adminApi('/couriers')
      .then((d) => setList(d.couriers))
      .catch((err) => setError(adminErrorText(err)))
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const add = async (e) => {
    e.preventDefault()
    setBusy('add')
    setError('')
    try {
      await adminApi('/couriers', { method: 'POST', body: form })
      setCreated({ ...form })
      setForm({ name: '', phone: '', pin: '' })
      load()
    } catch (err) {
      setError(
        { PHONE_TAKEN: 'هذا الرقم مسجّل لعامل توصيل آخر', INVALID_PIN: 'الرمز من 4 إلى 6 أرقام', INVALID_PHONE: 'الرقم يبدأ بـ 09 ويتكوّن من 10 أرقام' }[err.code] ||
          adminErrorText(err)
      )
    } finally {
      setBusy('')
    }
  }

  const patch = async (c, body) => {
    setBusy(`c${c.id}`)
    try {
      await adminApi(`/couriers/${c.id}`, { method: 'PATCH', body })
      load()
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy('')
    }
  }

  const resetPin = (c) => {
    const pin = String(Math.floor(1000 + Math.random() * 9000))
    patch(c, { pin }).then(() => setCreated({ name: c.name, phone: c.phone, pin }))
  }

  const share = (c) =>
    `https://wa.me/963${c.phone.slice(1)}?text=${encodeURIComponent(
      `أهلاً ${c.name}،\nهذه بيانات حسابك في تطبيق عمال التوصيل لدى ZAPP:\nالرابط: https://zapp.prodev.cloud/driver\nالرقم: ${c.phone}\nالرمز: ${c.pin}\n\nافتح الرابط في Chrome، وثبّت التطبيق، ثم فعّل الإشعارات.`
    )}`

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="rounded-3xl bg-white p-5 shadow-soft">
        <h2 className="flex items-center gap-2 font-extrabold">
          <UserPlus size={18} className="text-brand" /> إضافة عامل توصيل
        </h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="الاسم الكامل"
            className="rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3 text-sm outline-none focus:border-brand focus:bg-white"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
            placeholder="09xxxxxxxx"
            inputMode="numeric"
            dir="ltr"
            className="rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3 text-end font-en text-sm outline-none focus:border-brand focus:bg-white"
          />
          <input
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            placeholder="رمز سري (4 أرقام)"
            inputMode="numeric"
            dir="ltr"
            className="rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3 text-end font-en text-sm outline-none focus:border-brand focus:bg-white"
          />
        </div>
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
        <button
          disabled={busy === 'add' || !form.name || form.phone.length !== 10 || form.pin.length < 4}
          className="mt-4 flex w-full items-center justify-center rounded-2xl bg-brand py-3 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {busy === 'add' ? <LoaderCircle size={18} className="animate-spin" /> : 'إضافة'}
        </button>
      </form>

      {created && (
        <div className="rounded-3xl bg-emerald-50 p-4 text-sm">
          <p className="font-bold text-emerald-800">
            حساب {created.name} جاهز، والرمز: <span className="font-en">{created.pin}</span>
          </p>
          <a
            href={share(created)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 font-bold text-white"
          >
            <Send size={16} className="-scale-x-100" /> أرسل له الرابط والرمز عبر واتساب
          </a>
        </div>
      )}

      <div className="rounded-3xl bg-white p-5 shadow-soft">
        <h2 className="flex items-center gap-2 font-extrabold">
          <Users size={18} className="text-brand" /> عمال التوصيل
        </h2>
        {!list ? (
          <div className="flex justify-center py-8 text-brand">
            <LoaderCircle size={24} className="animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-navy/40">لا يوجد عمال توصيل مسجلون بعد</p>
        ) : (
          <ul className="mt-3 divide-y divide-navy/5">
            {list.map((c) => (
              <li key={c.id} className={`py-3 ${c.active ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${c.online && c.active ? 'bg-emerald-500' : 'bg-navy/20'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {c.name} <span className="text-xs font-normal text-navy/50">({c.openOrders} طلبات مفتوحة)</span>
                    </p>
                    <p className="text-[11px] text-navy/50">
                      <span dir="ltr" className="font-en">{c.phone}</span> • {c.online ? 'متاح' : 'غير متاح'} •{' '}
                      {c.push ? 'الإشعارات مفعّلة' : 'الإشعارات غير مفعّلة'}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 ps-6">
                  {c.active && (
                    <button onClick={() => patch(c, { online: !c.online })} className="rounded-xl bg-navy-50 px-3 py-1.5 text-xs font-bold">
                      {c.online ? 'جعله غير متاح' : 'جعله متاحاً'}
                    </button>
                  )}
                  <button onClick={() => resetPin(c)} className="rounded-xl bg-navy-50 px-3 py-1.5 text-xs font-bold">
                    رمز جديد
                  </button>
                  <button
                    onClick={() => patch(c, { active: !c.active })}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold ${c.active ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}
                  >
                    {c.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                  </button>
                  {busy === `c${c.id}` && <LoaderCircle size={16} className="animate-spin text-brand" />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ───────── إعدادات التوزيع التلقائي ───────── */

function DispatchSettings() {
  const [v, setV] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    adminApi('/dispatch')
      .then((d) => setV(d.dispatch))
      .catch((err) => setError(adminErrorText(err)))
  }, [])
  const save = async (next) => {
    setBusy(true)
    setError('')
    try {
      const d = await adminApi('/dispatch', { method: 'PUT', body: { dispatch: next } })
      setV(d.dispatch)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }
  if (!v) return error ? <p className="text-center text-sm text-rose-600">{error}</p> : null
  const on = v.autoDispatch === 1
  return (
    <div className="rounded-3xl bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 font-extrabold">
        <Zap size={18} className="text-brand" /> التوزيع التلقائي
      </h2>
      <button
        onClick={() => save({ autoDispatch: on ? 0 : 1 })}
        disabled={busy}
        className={`mt-4 flex w-full items-center gap-3 rounded-2xl p-4 text-start ${on ? 'bg-emerald-500 text-white' : 'bg-navy-50'}`}
      >
        <span className="flex-1">
          <span className="block font-bold">{on ? 'مفعّل' : 'متوقف، وتُوزَّع الطلبات يدوياً'}</span>
          <span className={`block text-xs ${on ? 'text-white/85' : 'text-navy/50'}`}>
            يُعرض كل طلب على أول عامل توصيل متفرغ، وإن لم يقبله ينتقل إلى التالي. وإذا كان الجميع مشغولين، يُعرض على الأقرب إلى طريقه.
          </span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full ${on ? 'bg-white/30' : 'bg-navy/15'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'start-6' : 'start-1'}`} />
        </span>
      </button>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold">وقت القبول (ثانية)</span>
          <input
            inputMode="numeric"
            dir="ltr"
            value={v.offerTimeoutSec}
            onChange={(e) => setV({ ...v, offerTimeoutSec: e.target.value.replace(/\D/g, '') })}
            className="mt-1 w-full rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3 text-end font-en font-bold outline-none focus:border-brand focus:bg-white"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold">الحد الأقصى للطلبات مع العامل</span>
          <input
            inputMode="numeric"
            dir="ltr"
            value={v.maxOrdersPerCourier}
            onChange={(e) => setV({ ...v, maxOrdersPerCourier: e.target.value.replace(/\D/g, '') })}
            className="mt-1 w-full rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3 text-end font-en font-bold outline-none focus:border-brand focus:bg-white"
          />
        </label>
      </div>
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
      <button
        onClick={() => save({ offerTimeoutSec: Number(v.offerTimeoutSec), maxOrdersPerCourier: Number(v.maxOrdersPerCourier) })}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-navy py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : saved ? <><Check size={16} /> تم الحفظ</> : 'حفظ إعدادات التوزيع'}
      </button>
    </div>
  )
}
