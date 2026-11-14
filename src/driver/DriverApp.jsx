import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BellOff,
  BellRing,
  Check,
  Clock,
  Power,
  X,
  Download,
  Flame,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  RefreshCw,
  Share,
  ShoppingBag,
  SquarePlus,
} from 'lucide-react'
import { api, errText, getToken, photoUrl, setLoggedOutHandler, setToken } from './driverApi'
import { disablePush, enablePush, isIOS, pushState } from '../push'
import DriverMap, { colorFor } from './DriverMap'

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
const STATUS = {
  assigned: { label: 'جديد', cls: 'bg-amber-100 text-amber-800' },
  buying: { label: 'قيد الشراء', cls: 'bg-violet-100 text-violet-800' },
  on_the_way: { label: 'في الطريق', cls: 'bg-orange-100 text-orange-800' },
  delivered: { label: 'تم التسليم', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'ملغى', cls: 'bg-slate-100 text-slate-500' },
}
// العملة من إعدادات التطبيق (الليرة الجديدة)
const currency = { label: 'ل.س' }
fetch('/api/app').then((r) => r.json()).then((d) => d.currency && (currency.label = d.currency)).catch(() => {})
const money = (n) => `${new Intl.NumberFormat('ar-SY').format(n)} ${currency.label}`
const navUrl = (l) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat.toFixed(6)},${l.lng.toFixed(6)}`
const waUrl = (p) => `https://wa.me/963${p.slice(1)}`

export default function DriverApp() {
  const [loggedIn, setLoggedIn] = useState(!!getToken())
  useEffect(() => {
    setLoggedOutHandler(() => {
      setToken(null)
      setLoggedIn(false)
    })
  }, [])
  return loggedIn ? <Home onLogout={() => setLoggedIn(false)} /> : <Login onDone={() => setLoggedIn(true)} />
}

/* ───────── الدخول ───────── */

function Login({ onDone }) {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const d = await api('/login', { method: 'POST', body: { phone, pin } })
      setToken(d.token)
      onDone()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex min-h-full flex-col bg-navy">
      <div className="speed-bg pt-safe flex flex-1 flex-col items-center justify-center p-6 text-center text-white">
        <img src="/driver-192.png" alt="" className="h-20 w-20 rounded-3xl shadow-xl" />
        <h1 className="mt-4 font-brand text-3xl font-black italic text-brand">ZAPP <span className="text-white">Driver</span></h1>
        <p className="mt-1 text-sm text-white/60">تطبيق عمال التوصيل</p>
      </div>
      <form onSubmit={submit} className="pb-safe rounded-t-[2rem] bg-white p-6 pb-10">
        <label className="block text-sm font-bold">رقم الموبايل</label>
        <input
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="09xxxxxxxx"
          className="mt-2 w-full rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3.5 text-end font-en tracking-wider outline-none focus:border-brand focus:bg-white"
        />
        <label className="mt-4 block text-sm font-bold">الرمز السري (تحصل عليه من الإدارة)</label>
        <input
          type="password"
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
          className="mt-2 w-full rounded-2xl border border-navy/10 bg-navy-50 px-4 py-3.5 text-center font-en text-xl tracking-[0.5em] outline-none focus:border-brand focus:bg-white"
        />
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
        <button
          disabled={busy || phone.length < 10 || pin.length < 4}
          className="mt-6 flex w-full items-center justify-center rounded-2xl bg-brand py-4 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'دخول'}
        </button>
      </form>
    </div>
  )
}

/* ───────── صوت داخل التطبيق (لما يكون مفتوح) ───────── */
let audioCtx = null
let lastTap = 0
const unlockSound = () => {
  lastTap = Date.now()
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    audioCtx.resume()
  } catch {}
}
// محاولة تشغيل الصوت بدون لمسة (تنجح إذا المستخدم لمس التطبيق من قبل)
const unlockSoundSilently = () => {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    audioCtx.resume().catch(() => {})
  } catch {}
}
const beep = () => {
  try {
    if (!audioCtx || Date.now() - lastTap < 3000) return // ما منزمّر إذا هو للتو ضاغط (مثلاً قبل الطلب)
    ;[0, 0.3, 0.6].forEach((t) => {
      const o = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      o.frequency.value = 988
      g.gain.setValueAtTime(0.3, audioCtx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.25)
      o.connect(g).connect(audioCtx.destination)
      o.start(audioCtx.currentTime + t)
      o.stop(audioCtx.currentTime + t + 0.25)
    })
    navigator.vibrate?.([300, 100, 300])
  } catch {}
}

// رنين متواصل (مثل المكالمة) طالما في طلب معروض ولم يُرد عليه
function ringOnce() {
  try {
    if (!audioCtx) return
    const t0 = audioCtx.currentTime
    ;[0, 0.18, 0.36, 0.9, 1.08, 1.26].forEach((t, i) => {
      const o = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      o.type = 'square'
      o.frequency.value = i % 2 ? 1320 : 990
      g.gain.setValueAtTime(0.0001, t0 + t)
      g.gain.exponentialRampToValueAtTime(0.35, t0 + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.16)
      o.connect(g).connect(audioCtx.destination)
      o.start(t0 + t)
      o.stop(t0 + t + 0.17)
    })
    navigator.vibrate?.([400, 150, 400, 150, 400])
  } catch {}
}

// إبقاء الشاشة مضاءة طالما العامل "متاح" والتطبيق مفتوح
function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock = null
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen')
      } catch {}
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
    }
  }, [enabled])
}

/* ───────── الرئيسية ───────── */

function Home({ onLogout }) {
  const [me, setMe] = useState(null)
  const [tab, setTab] = useState('active')
  const [focusId, setFocusId] = useState(null)
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')
  const seen = useRef(null)

  const loadOrders = useCallback(async () => {
    try {
      const d = await api(`/orders?group=${tab === 'done' ? 'done' : 'active'}`)
      setOrders(d.orders)
      setError('')
      if (tab !== 'done') {
        const ids = new Set(d.orders.map((o) => o.id))
        if (seen.current && [...ids].some((id) => !seen.current.has(id))) beep()
        seen.current = ids
      }
    } catch (err) {
      setError(errText(err))
    }
  }, [tab])

  const [load, setLoad] = useState(0)
  const [max, setMax] = useState(3)
  const refreshMe = useCallback(() => {
    api('/me')
      .then((d) => {
        setMe(d.courier)
        setLoad(d.load)
        setMax(d.max || 3)
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    refreshMe()
    const id = setInterval(() => document.visibilityState === 'visible' && refreshMe(), 20000)
    return () => clearInterval(id)
  }, [refreshMe])

  useEffect(() => {
    setOrders(null)
    loadOrders()
    const id = setInterval(() => document.visibilityState === 'visible' && loadOrders(), 15000)
    const onVis = () => document.visibilityState === 'visible' && loadOrders()
    const onMsg = (e) => e.data?.type === 'refresh' && loadOrders()
    document.addEventListener('visibilitychange', onVis)
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      navigator.serviceWorker?.removeEventListener('message', onMsg)
    }
  }, [loadOrders])

  useWakeLock(!!me?.online)
  const load_ = loadOrders
  const logout = async () => {
    await disablePush((endpoint) => api('/push', { method: 'DELETE', body: { endpoint } })).catch(() => {})
    await api('/logout', { method: 'POST' }).catch(() => {})
    setToken(null)
    onLogout()
  }

  return (
    <div className="mx-auto min-h-full max-w-md pb-10" onClick={unlockSound}>
      <header className="speed-bg pt-safe sticky top-0 z-20 rounded-b-[2rem] bg-navy px-4 pb-5 pt-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <img src="/driver-192.png" alt="" className="h-11 w-11 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/50">مرحباً</p>
            <p className="truncate font-extrabold">{me?.name || '...'}</p>
          </div>
          <button onClick={loadOrders} aria-label="تحديث" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <RefreshCw size={18} />
          </button>
          <button onClick={logout} aria-label="خروج" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <LogOut size={18} className="-scale-x-100" />
          </button>
        </div>
        <nav className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-white/10 p-1">
          {[
            ['active', 'طلباتي'],
            ['map', 'الخريطة'],
            ['done', 'المنتهية'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setFocusId(null)
                setTab(id)
              }}
              className={`rounded-xl py-2.5 text-sm font-bold ${tab === id ? 'bg-brand text-white' : 'text-white/70'}`}
            >
              {label}
              {id === 'active' && tab !== 'done' && orders?.length ? ` (${orders.length})` : ''}
            </button>
          ))}
        </nav>
      </header>

      <main className="space-y-4 p-4">
        {tab !== 'map' && (
          <>
            <NotificationsCard />
            <InstallCard />
            {me && <AvailabilityCard me={me} load={load} max={max} onChange={refreshMe} />}
          </>
        )}
        {me?.online && (
          <Offers
            onAccepted={() => {
              setTab('active')
              load_()
              refreshMe()
            }}
          />
        )}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-sm font-bold text-rose-600">{error}</p>}
        {!orders ? (
          <div className="flex justify-center pt-12 text-brand">
            <LoaderCircle size={30} className="animate-spin" />
          </div>
        ) : tab === 'map' && orders.length ? (
          <DriverMap orders={orders} focusId={focusId} />
        ) : orders.length === 0 ? (
          <div className="pt-10 text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-3xl">🛵</span>
            <p className="mt-4 font-extrabold">{tab === 'done' ? 'لا توجد طلبات منتهية' : 'لا توجد طلبات معك الآن'}</p>
            {tab !== 'done' && <p className="mt-1 text-sm text-navy/50">عند وصول طلب جديد لك سيصلك إشعار</p>}
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              color={tab === 'active' && orders.length > 1 ? colorFor(orders, o.id) : null}
              onShowMap={() => {
                setFocusId(o.id)
                setTab('map')
              }}
              onChanged={() => {
                loadOrders()
                refreshMe()
              }}
            />
          ))
        )}
      </main>
    </div>
  )
}

/* ───────── متاح / غير متاح ───────── */

function AvailabilityCard({ me, load, max, onChange }) {
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try {
      await api('/online', { method: 'POST', body: { online: !me.online } })
      onChange()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex w-full items-center gap-3 rounded-3xl p-4 text-start shadow-soft transition ${
        me.online ? 'bg-emerald-500 text-white' : 'bg-white'
      }`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${me.online ? 'bg-white/20' : 'bg-navy-50 text-navy/40'}`}>
        {busy ? <LoaderCircle size={22} className="animate-spin" /> : <Power size={22} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold">{me.online ? 'أنت متاح لاستقبال الطلبات' : 'أنت غير متاح حالياً'}</span>
        <span className={`block text-xs ${me.online ? 'text-white/85' : 'text-navy/50'}`}>
          {me.online ? `معك ${load} من ${max} طلبات، اضغط للتوقف` : 'اضغط لتبدأ استقبال الطلبات'}
        </span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full ${me.online ? 'bg-white/30' : 'bg-navy/15'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${me.online ? 'start-6' : 'start-1'}`} />
      </span>
    </button>
  )
}

/* ───────── العروض: طلبات بانتظار قبولك ───────── */

function Offers({ onAccepted }) {
  const [offers, setOffers] = useState([])
  const [skew, setSkew] = useState(0) // فرق ساعة الموبايل عن السيرفر
  const [, force] = useState(0)
  const known = useRef(new Set())

  const loadOffers = useCallback(async () => {
    try {
      const d = await api('/offers')
      setSkew(new Date(d.serverTime).getTime() - Date.now())
      setOffers(d.offers)
      if (d.offers.some((o) => !known.current.has(o.offerId))) beep()
      known.current = new Set(d.offers.map((o) => o.offerId))
    } catch {}
  }, [])

  useEffect(() => {
    loadOffers()
    const poll = setInterval(() => document.visibilityState === 'visible' && loadOffers(), 4000)
    const clock = setInterval(() => force((x) => x + 1), 1000)
    const onVis = () => document.visibilityState === 'visible' && loadOffers()
    const onMsg = (e) => e.data?.type === 'refresh' && loadOffers()
    document.addEventListener('visibilitychange', onVis)
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => {
      clearInterval(poll)
      clearInterval(clock)
      document.removeEventListener('visibilitychange', onVis)
      navigator.serviceWorker?.removeEventListener('message', onMsg)
    }
  }, [loadOffers])

  const live = offers.filter((o) => new Date(o.expiresAt).getTime() - (Date.now() + skew) > 0)
  const ringing = live.length > 0
  const [soundBlocked, setSoundBlocked] = useState(false)
  useEffect(() => {
    if (!ringing) return
    unlockSoundSilently()
    setSoundBlocked(!audioCtx || audioCtx.state !== 'running')
    ringOnce()
    const id = setInterval(ringOnce, 2200)
    return () => clearInterval(id)
  }, [ringing])
  if (!live.length) return null
  return (
    <div className="space-y-3">
      {soundBlocked && (
        <button
          onClick={() => {
            unlockSound()
            setSoundBlocked(false)
            ringOnce()
          }}
          className="w-full rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800"
        >
          اضغط هنا لتفعيل صوت الرنين
        </button>
      )}
      {live.map((o) => (
        <OfferCard
          key={o.offerId}
          offer={o}
          secondsLeft={Math.ceil((new Date(o.expiresAt).getTime() - (Date.now() + skew)) / 1000)}
          onDone={(accepted) => {
            setOffers((list) => list.filter((x) => x.offerId !== o.offerId))
            if (accepted) onAccepted()
            else loadOffers()
          }}
        />
      ))}
    </div>
  )
}

function OfferCard({ offer, secondsLeft, onDone }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const o = offer.order
  const respond = async (action) => {
    setBusy(action)
    setError('')
    try {
      await api(`/offers/${offer.offerId}/${action}`, { method: 'POST' })
      onDone(action === 'accept')
    } catch (err) {
      const msg = { OFFER_GONE: 'أُسند الطلب لعامل آخر', OFFER_EXPIRED: 'انتهى وقت القبول', TOO_MANY: 'معك الحد الأقصى من الطلبات، أنهِ أحدها أولاً' }[err.code]
      setError(msg || errText(err))
      setTimeout(() => onDone(false), 1500)
    } finally {
      setBusy('')
    }
  }
  return (
    <article className="overflow-hidden rounded-3xl bg-navy text-white shadow-float ring-4 ring-brand animate-fade-in">
      <div className="flex items-center gap-3 bg-brand px-4 py-3">
        <span className="text-lg">🔔</span>
        <span className="flex-1 font-extrabold">طلب جديد لك: {o.number}</span>
        <span className="flex items-center gap-1 rounded-full bg-navy/30 px-2.5 py-1 font-en text-sm font-bold">
          <Clock size={14} /> {secondsLeft}
        </span>
      </div>
      <div className="p-4">
        <p className="text-xs font-bold text-brand">
          {CATEGORY[o.category]}
          {o.kind === 'custom' && (o.details.storeMode === 'specific' && o.details.storeName ? `، من ${o.details.storeName}` : '، من أقرب محل')}
        </p>
        <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm">
          {o.kind === 'gas'
            ? `${o.details.qty} جرة، ${o.details.gasType === 'buy' ? 'شراء جرة جديدة' : 'تبديل'}${o.floor ? `، الطابق ${o.floor}${o.details.elevator ? '' : ' بدون مصعد'}` : ''}`
            : o.details.items || 'طلب مرفق بصورة'}
        </p>
        {error && <p className="mt-2 rounded-xl bg-rose-500/30 px-3 py-2 text-center text-xs font-bold">{error}</p>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => respond('decline')}
            disabled={!!busy}
            className="flex items-center justify-center gap-1 rounded-2xl bg-white/10 py-3.5 text-sm font-bold disabled:opacity-60"
          >
            {busy === 'decline' ? <LoaderCircle size={16} className="animate-spin" /> : <><X size={16} /> رفض</>}
          </button>
          <button
            onClick={() => respond('accept')}
            disabled={!!busy}
            className="col-span-2 btn-zap flex items-center justify-center gap-2 bg-emerald-500 py-3.5 text-sm font-extrabold disabled:opacity-60"
          >
            {busy === 'accept' ? <LoaderCircle size={18} className="animate-spin" /> : <><Check size={18} /> قبول الطلب</>}
          </button>
        </div>
      </div>
    </article>
  )
}

/* ───────── بطاقة تفعيل التنبيهات ───────── */

function NotificationsCard() {
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    pushState().then(setState)
  }, [])

  const enable = async () => {
    setBusy(true)
    setMsg('')
    try {
      await enablePush((subscription) => api('/push', { method: 'POST', body: { subscription } }))
      setState('enabled')
      await api('/push/test', { method: 'POST' })
      setMsg('أرسلنا لك إشعاراً تجريبياً، يُفترض أن يصلك الآن')
    } catch (err) {
      if (err.message === 'denied') setState('denied')
      else setMsg('تعذّر التفعيل، حاول مرة أخرى')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      await api('/push/test', { method: 'POST' })
      setMsg('أرسلنا إشعاراً تجريبياً. أغلق التطبيق وتأكد من وصوله')
    } catch {
      setMsg('تعذّر إرسال الإشعار التجريبي')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return null

  if (state === 'enabled')
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3">
        <BellRing size={20} className="shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-800">الإشعارات مفعّلة</p>
          <p className="text-[11px] text-emerald-700/80">{msg || 'يصلك إشعار حتى والتطبيق مغلق'}</p>
        </div>
        <button onClick={test} disabled={busy} className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-700">
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : 'جرّب'}
        </button>
      </div>
    )

  return (
    <div className="rounded-3xl bg-brand p-5 text-white shadow-float">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
          <BellOff size={24} />
        </span>
        <div>
          <p className="font-extrabold">الإشعارات غير مفعّلة</p>
          <p className="text-xs text-white/90">بدونها لن تعرف بالطلبات الجديدة إلا عند فتح التطبيق</p>
        </div>
      </div>

      {state === 'off' && (
        <button
          onClick={enable}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-navy py-3.5 text-sm font-extrabold"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : <><BellRing size={18} /> فعّل الإشعارات</>}
        </button>
      )}

      {state === 'ios-install' && (
        <ol className="mt-4 space-y-2 rounded-2xl bg-white/15 p-4 text-sm">
          <li>على الآيفون يجب إضافة التطبيق إلى الشاشة الرئيسية أولاً:</li>
          <li className="flex items-center gap-2">
            ١. اضغط زر المشاركة <Share size={16} />
          </li>
          <li className="flex items-center gap-2">
            ٢. اختر "إضافة إلى الشاشة الرئيسية" <SquarePlus size={16} />
          </li>
          <li>٣. افتح التطبيق من الأيقونة الجديدة وفعّل الإشعارات</li>
        </ol>
      )}

      {state === 'denied' && (
        <p className="mt-4 rounded-2xl bg-white/15 p-4 text-sm leading-relaxed">
          الإشعارات مرفوضة سابقاً. لتفعيلها افتح إعدادات المتصفح، ثم إعدادات المواقع، ثم الإشعارات، واسمح لموقع
          <b className="font-en"> dawahi.prodev.cloud</b>، ثم عُد إلى التطبيق.
        </p>
      )}

      {state === 'unsupported' && (
        <p className="mt-4 rounded-2xl bg-white/15 p-4 text-sm leading-relaxed">
          هذا المتصفح لا يدعم الإشعارات. افتح التطبيق في <b>Chrome</b> على أندرويد{isIOS() ? ' أو في Safari على الآيفون' : ''}.
        </p>
      )}
      {msg && <p className="mt-3 text-center text-xs">{msg}</p>}
    </div>
  )
}

/* ───────── زر تثبيت التطبيق (أندرويد) ───────── */

function InstallCard() {
  const [prompt, setPrompt] = useState(null)
  useEffect(() => {
    const h = (e) => {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  if (!prompt) return null
  return (
    <button
      onClick={async () => {
        prompt.prompt()
        await prompt.userChoice.catch(() => {})
        setPrompt(null)
      }}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-start shadow-soft"
    >
      <Download size={20} className="text-brand" />
      <span className="flex-1 text-sm font-bold">ثبّت التطبيق على موبايلك</span>
      <span className="rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-white">تثبيت</span>
    </button>
  )
}

/* ───────── بطاقة الطلب ───────── */

function OrderCard({ order: o, color, onChanged, onShowMap }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [confirmDone, setConfirmDone] = useState(false)
  const active = ['assigned', 'buying', 'on_the_way'].includes(o.status)

  useEffect(() => {
    let url
    if (o.photo && active) photoUrl(o.photo).then((u) => setPhoto((url = u))).catch(() => {})
    return () => url && URL.revokeObjectURL(url)
  }, [o.photo, active])

  const move = async (status) => {
    setBusy(status)
    setError('')
    try {
      await api(`/orders/${o.id}/status`, { method: 'POST', body: { status } })
      setConfirmDone(false)
      onChanged()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <article className={`rounded-3xl bg-white p-4 shadow-soft ${o.status === 'assigned' ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color ? 'text-white' : 'bg-brand-50 text-brand'}`}
          style={color ? { background: color } : undefined}
        >
          {o.kind === 'gas' ? <Flame size={20} /> : <ShoppingBag size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="num-zap text-sm">{o.number}</p>
          <p className="text-xs text-navy/60">
            {CATEGORY[o.category]} • {o.customer.name}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
      </div>

      {/* شو المطلوب */}
      <div className="mt-3 rounded-2xl bg-navy-50 p-3">
        {o.kind === 'gas' ? (
          <>
            <p className="text-sm font-bold">
              {o.details.qty} جرة — {o.details.gasType === 'buy' ? 'شراء جرة جديدة' : 'تبديل (لدى الزبون جرة فارغة)'}
            </p>
            <p className="mt-1 text-xs text-navy/60">
              {o.floor ? `الطابق ${o.floor}، ${o.details.elevator ? 'يوجد مصعد' : 'بدون مصعد'}` : 'أرضي'}
            </p>
            <p className="mt-1 text-xs text-navy/60">التكلفة التقديرية للزبون: {money(o.details.estimate)}</p>
          </>
        ) : (
          <>
            <p className="mb-1 text-xs font-bold text-brand">
              {o.details.storeMode === 'specific' && o.details.storeName ? `من: ${o.details.storeName}` : 'من أقرب محل مناسب'}
            </p>
            {o.details.items && <p className="whitespace-pre-line text-sm leading-relaxed">{o.details.items}</p>}
            {photo && (
              <a href={photo} target="_blank" rel="noreferrer">
                <img src={photo} alt="صورة الطلب" className="mt-2 max-h-60 rounded-xl object-contain" />
              </a>
            )}
          </>
        )}
        {o.notes && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-800">📝 {o.notes}</p>}
      </div>

      {active && (
        <>
          {/* العنوان */}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-navy/70">
            <MapPin size={14} className="mt-0.5 shrink-0 text-brand" />
            {[o.address, o.floor ? `طابق ${o.floor}` : 'أرضي'].filter(Boolean).join(' — ')}
          </p>

          {/* أزرار سريعة */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <a href={`tel:${o.contactPhone}`} className="flex flex-col items-center gap-1 rounded-2xl bg-navy-50 py-3 text-xs font-bold">
              <Phone size={18} className="text-brand" /> اتصال
            </a>
            <a href={waUrl(o.contactPhone)} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-2xl bg-navy-50 py-3 text-xs font-bold">
              <MessageCircle size={18} className="text-emerald-600" /> واتساب
            </a>
            <button onClick={onShowMap} className="flex flex-col items-center gap-1 rounded-2xl bg-brand py-3 text-xs font-bold text-white">
              <MapPin size={18} /> على الخريطة
            </button>
          </div>

          {/* تغيير الحالة */}
          <div className="mt-3 grid gap-2">
            {o.status === 'assigned' && o.kind === 'custom' && (
              <Big onClick={() => move('buying')} busy={busy === 'buying'} label="بدأت شراء الأغراض" />
            )}
            {(o.status === 'assigned' || o.status === 'buying') && (
              <Big onClick={() => move('on_the_way')} busy={busy === 'on_the_way'} label="أنا في الطريق إلى الزبون" />
            )}
            {o.status === 'on_the_way' &&
              (confirmDone ? (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDone(false)} className="flex-1 rounded-2xl bg-navy-50 py-3.5 text-sm font-bold">
                    ليس بعد
                  </button>
                  <Big onClick={() => move('delivered')} busy={busy === 'delivered'} label="نعم، تم التسليم" green className="flex-[2]" />
                </div>
              ) : (
                <Big onClick={() => setConfirmDone(true)} label="تم تسليم الطلب" green />
              ))}
          </div>
          {error && <p className="mt-2 text-center text-xs font-bold text-rose-600">{error}</p>}
        </>
      )}
    </article>
  )
}

function Big({ onClick, busy, label, green, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold text-white disabled:opacity-70 ${
        green ? 'bg-emerald-500' : 'bg-navy'
      } ${className}`}
    >
      {busy ? <LoaderCircle size={18} className="animate-spin" /> : label}
    </button>
  )
}

