import UpdateNotice from '../components/UpdateNotice'
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
  Star,
} from 'lucide-react'
import { api, errText, getToken, photoUrl, setLoggedOutHandler, setToken } from './driverApi'
import { disablePush, enablePush, isIOS, pushState } from '../push'
import { nativePlugin } from '../native'
import DriverMap, { colorFor } from './DriverMap'
import Supervisor from './Supervisor'

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
const money = (n) => `${new Intl.NumberFormat('en-US').format(n)} ${currency.label}`
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
        <h1 className="mt-4 font-brand text-3xl font-black italic text-lime">ZAPP <span className="text-white">Driver</span></h1>
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
    loadRing()
  } catch {}
}
// محاولة تشغيل الصوت بدون لمسة (تنجح إذا المستخدم لمس التطبيق من قبل)
const unlockSoundSilently = () => {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    audioCtx.resume().catch(() => {})
  } catch {}
}
// طلب جديد: الرنّة نفسها بتشتغل من قسم العروض، هون بس هزّة خفيفة
const beep = () => {
  if (Date.now() - lastTap < 3000) return
  navigator.vibrate?.([300, 100, 300])
}

// رنين متواصل (مثل المكالمة) طالما في طلب معروض ولم يُرد عليه
// رنّة ZAPP (نفس صوت تطبيق الأندرويد): منحمّلها مرة وحدة ومنشغّلها من الذاكرة
let ringBuffer = null
let ringLoading = null
function loadRing() {
  if (ringBuffer || ringLoading || !audioCtx) return ringLoading
  ringLoading = fetch('/sounds/zapp-ring.mp3')
    .then((r) => r.arrayBuffer())
    .then((b) => new Promise((ok, no) => audioCtx.decodeAudioData(b, ok, no)))
    .then((buf) => (ringBuffer = buf))
    .catch(() => (ringLoading = null))
  return ringLoading
}
function playRing(volume = 1) {
  if (!audioCtx || !ringBuffer) return false
  const src = audioCtx.createBufferSource()
  const g = audioCtx.createGain()
  g.gain.value = volume
  src.buffer = ringBuffer
  src.connect(g).connect(audioCtx.destination)
  src.start()
  return true
}
function ringOnce() {
  try {
    if (!audioCtx) return
    loadRing()
    if (!playRing()) return
    navigator.vibrate?.([600, 200, 600, 200, 600])
  } catch {}
}

// إبقاء الشاشة مضاءة طالما العامل "متاح" والتطبيق مفتوح
// يرسل موقع العامل كل ~5 ثواني طالما هو متاح (للمراقبة وتتبّع الزبون)
function useShareLocation(enabled) {
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return
    let last = 0
    let latest = null
    const push = () => {
      if (!latest || Date.now() - last < 5000) return
      last = Date.now()
      const { latitude: lat, longitude: lng, accuracy } = latest.coords
      api('/location', { method: 'POST', body: { lat, lng, accuracy } }).catch(() => {})
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        latest = p
        push()
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    )
    // حتى لو ما تحرّك، منعيد إرسال آخر موقع كل 20 ثانية لنعرف إنه لسا متصل
    const tick = setInterval(push, 20000)
    return () => {
      navigator.geolocation.clearWatch(watch)
      clearInterval(tick)
    }
  }, [enabled])
}

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
    return api('/me')
      .then((d) => {
        setMe({ ...d.courier, wallet: d.wallet, rating: d.rating })
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

  const zapp = nativePlugin('ZappDriver') // تطبيق الأندرويد: خدمة خلفية بترنّ وبترسل الموقع
  useWakeLock(!!me?.online && !zapp)
  useShareLocation(!!me?.online && !zapp)
  useEffect(() => {
    if (!zapp || !me) return
    // المشرف: الخدمة بتضل شغّالة حتى لو مو متاح، لحتى يوصله إشعار بكل طلب جديد
    if (me.online || me.supervisor) zapp.start({ token: getToken(), base: location.origin }).catch(() => {})
    else zapp.stop().catch(() => {})
  }, [zapp, me?.online, me])
  const load_ = loadOrders
  // زر التحديث: بيلف وقت التحميل، وبيبين "تم التحديث" لحتى يعرف إنه انكبس
  const [refreshing, setRefreshing] = useState(false)
  const [flash, setFlash] = useState('')
  const refreshAll = async () => {
    if (refreshing) return
    setRefreshing(true)
    window.dispatchEvent(new Event('zapp:refresh')) // شاشة المشرف بتتحدّث كمان
    await Promise.all([loadOrders(), refreshMe()]).catch(() => {})
    setRefreshing(false)
    setFlash('تم التحديث ✓')
    setTimeout(() => setFlash(''), 1800)
  }
  const [askLogout, setAskLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const logout = async () => {
    setLoggingOut(true)
    await zapp?.stop().catch(() => {})
    await disablePush((endpoint) => api('/push', { method: 'DELETE', body: { endpoint } })).catch(() => {})
    await api('/logout', { method: 'POST' }).catch(() => {})
    setToken(null)
    onLogout()
  }

  return (
    <div className="mx-auto min-h-full max-w-md pb-10" onClick={unlockSound}>
      {askLogout && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50" onClick={() => !loggingOut && setAskLogout(false)}>
          <div className="pb-safe w-full max-w-md rounded-t-3xl bg-white p-5" role="dialog" aria-modal="true" aria-label="تسجيل الخروج" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold">بدك تطلع من حسابك؟</p>
            <p className="mt-1 text-sm text-navy/55">بعد الخروج ما رح توصلك طلبات لحتى ترجع تفوت برقمك والرمز السري.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setAskLogout(false)} disabled={loggingOut} className="flex-1 rounded-2xl bg-navy-50 py-3 text-sm font-bold">
                لا، خليني
              </button>
              <button onClick={logout} disabled={loggingOut} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3 text-sm font-extrabold text-white">
                {loggingOut ? <LoaderCircle size={18} className="animate-spin" /> : 'إيه، اطلع'}
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="speed-bg pt-safe sticky top-0 z-20 rounded-b-[2rem] bg-navy px-4 pb-5 pt-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <img src="/driver-192.png" alt="" className="h-11 w-11 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/50">مرحباً</p>
            <p className="truncate font-extrabold">{me?.name || '...'}</p>
          </div>
          <button
            onClick={refreshAll}
            aria-label="تحديث"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition active:scale-90 active:bg-white/25"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setAskLogout(true)}
            aria-label="خروج"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition active:scale-90 active:bg-white/25"
          >
            <LogOut size={18} className="-scale-x-100" />
          </button>
        </div>
        {flash && (
          <p role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-50 mx-auto w-fit animate-fade-in rounded-full bg-lime px-5 py-2 text-sm font-extrabold text-navy shadow-lg">
            {flash}
          </p>
        )}
        <nav className={`mt-4 grid gap-1 rounded-2xl bg-white/10 p-1 ${me?.supervisor ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {[
            ['active', 'طلباتي'],
            ['map', 'الخريطة'],
            ['done', 'المنتهية'],
            ...(me?.supervisor ? [['sup', 'المشرف']] : []),
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setFocusId(null)
                setTab(id)
              }}
              className={`rounded-xl py-2.5 text-sm font-bold ${tab === id ? 'bg-lime text-navy' : 'text-white/70'}`}
            >
              {label}
              {id === 'active' && tab !== 'done' && orders?.length ? ` (${orders.length})` : ''}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'sup' ? (
        <main className="p-4">
          <Supervisor />
        </main>
      ) : (
      <main className="space-y-4 p-4">
        {tab !== 'map' && (
          <>
            <UpdateNotice driver />
            {zapp && <DriverSetupGate zapp={zapp} />}
            {zapp ? <NativeSetupCard zapp={zapp} /> : <NotificationsCard />}
            {!zapp && <DriverApkCard />}
            {!zapp && <InstallCard />}
            {me && <AvailabilityCard me={me} load={load} max={max} onChange={refreshMe} />}
            {me?.wallet && <WalletCard wallet={me.wallet} load={load} />}
            {me?.rating?.count > 0 && <RatingCard rating={me.rating} />}
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
      )}
    </div>
  )
}

/* ───────── رصيد العامل ───────── */

function WalletCard({ wallet, load }) {
  const fmt = (n) => `${new Intl.NumberFormat('en-US').format(n)} ل.س`
  const low = wallet.enabled && wallet.balance - wallet.commission * load < wallet.commission
  if (!wallet.enabled && wallet.balance === 0) return null
  return (
    <div className={`rounded-3xl p-4 ${low ? 'bg-rose-600 text-white' : 'bg-white shadow-soft'}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-extrabold">رصيدك</span>
        <span className={`num-zap text-2xl ${low ? 'text-white' : wallet.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmt(wallet.balance)}</span>
      </div>
      <p className={`mt-1 text-xs ${low ? 'text-white/85' : 'text-navy/55'}`}>
        {low
          ? 'رصيدك ما بيكفي، ما رح توصلك طلبات جديدة لحتى تشحن. تواصل مع الإدارة.'
          : wallet.balance < 0
            ? `عليك ${fmt(-wallet.balance)} للإدارة. عمولة التطبيق ${fmt(wallet.commission)} عن كل طلب.`
            : `بيكفي لـ ${wallet.ordersLeft} طلب. عمولة التطبيق ${fmt(wallet.commission)} عن كل طلب واصل.`}
      </p>
    </div>
  )
}

// معدل تقييم الزبائن لعامل التوصيل (بدون تفاصيل مين قيّم)
function RatingCard({ rating }) {
  const avg = rating.avg
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-soft">
      <span className="num-zap text-3xl">{avg.toFixed(1)}</span>
      <div className="flex-1">
        <span className="flex" aria-label={`${avg} من 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={16} className={n <= Math.round(avg) ? 'text-amber-400' : 'text-navy/15'} fill="currentColor" strokeWidth={1.5} />
          ))}
        </span>
        <p className="mt-0.5 text-xs text-navy/55">
          تقييم الزبائن لك من {rating.count} طلب{avg >= 4.5 ? '. أداء ممتاز.' : avg < 3.5 ? '. يرجى الاهتمام بمواعيد التوصيل وحسن التعامل.' : ''}
        </p>
      </div>
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
    const id = setInterval(ringOnce, 2900)
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
          className="fixed inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-[61] rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800 shadow-lg"
        >
          اضغط هنا لتفعيل صوت الرنين
        </button>
      )}
      {live.slice(0, 1).map((o) => (
        <OfferCard
          key={o.offerId}
          offer={o}
          more={live.length - 1}
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

// الطلب الجديد: شاشة كاملة متل المكالمة. قبل القبول ما في عنوان ولا اسم ولا رقم، بس الطلب والمسافة والأجرة
const offerTotals = new Map() // offerId -> الوقت الكلي (لدائرة العداد)
function OfferCard({ offer, secondsLeft, onDone, more = 0 }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const o = offer.order
  if (!offerTotals.has(offer.offerId)) offerTotals.set(offer.offerId, Math.max(secondsLeft, 1))
  const total = offerTotals.get(offer.offerId)
  const left = Math.max(0, secondsLeft)
  const frac = Math.min(1, left / total)
  const urgent = left <= 10
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
  const store = o.kind === 'custom' ? (o.details.storeMode === 'specific' && o.details.storeName ? `من ${o.details.storeName}` : 'من أقرب محل') : ''
  const what =
    o.kind === 'gas'
      ? `${o.details.qty} جرة غاز، ${o.details.gasType === 'buy' ? 'شراء جرة جديدة' : 'تبديل'}`
      : o.kind === 'cart' && Array.isArray(o.details.items)
        ? o.details.items.map((i) => `${i.qty} × ${i.name}`).join('، ')
        : o.details.items || 'طلب مرفق بصورة'
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-brand text-white animate-fade-in" role="alertdialog" aria-modal="true" aria-label={`طلب جديد ${o.number}`}>
      <div className="pt-safe flex flex-1 flex-col overflow-y-auto px-5 pb-4">
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            طلب جديد · <span className="font-en">{o.number}</span>
          </span>
          <span className="rounded-full bg-navy/25 px-3 py-1 text-xs font-bold">{CATEGORY[o.category] || 'طلب'}</span>
        </div>

        <div className="relative mx-auto mt-6 h-36 w-36" role="timer" aria-label={`باقي ${left} ثانية`}>
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgb(26 19 64 / 0.3)" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={urgent ? '#FB7185' : '#C6F432'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s' }}
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`num-zap text-5xl leading-none ${urgent ? 'text-rose-200' : ''}`}>{left}</span>
            <span className="mt-1 text-xs text-white/70">ثانية</span>
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-navy/25 px-3 py-3 text-center">
            <span className="block text-3xl font-black leading-tight">{offer.km != null ? <span className="font-en">{offer.km}</span> : '—'}</span>
            <span className="text-xs text-white/75">{offer.km != null ? 'كم تقريباً لعند الزبون' : 'المسافة غير معروفة'}</span>
          </div>
          <div className="rounded-2xl bg-navy/25 px-3 py-3 text-center">
            <span className="block text-3xl font-black leading-tight text-lime">
              <span className="font-en">{new Intl.NumberFormat('en-US').format(offer.fee || 0)}</span>
            </span>
            <span className="text-xs text-white/75">أجرة التوصيل {offer.currency || currency.label}</span>
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-white p-4 text-navy">
          {store && <p className="text-xs font-bold text-brand">{store}</p>}
          <p className="mt-1 line-clamp-5 whitespace-pre-line text-base font-bold leading-relaxed">{what}</p>
          {o.hasPhoto && <p className="mt-2 text-xs font-bold text-navy/55">📷 فيه صورة مرفقة بالطلب</p>}
          <p className="mt-2 text-[11px] text-navy/45">العنوان ومعلومات الزبون بتبين بعد القبول</p>
        </div>
        {more > 0 && <p className="mt-3 text-center text-xs font-bold text-white/80">وفي كمان {more} طلب ناطرك بعد هاد</p>}
        {error && <p className="mt-3 rounded-xl bg-rose-500/40 px-3 py-2 text-center text-sm font-bold">{error}</p>}
      </div>

      <div className="pb-safe px-5 pb-5">
        <button
          onClick={() => respond('accept')}
          disabled={!!busy}
          className="flex w-full items-center justify-center gap-2 rounded-3xl bg-lime py-5 text-xl font-black text-navy shadow-lg transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy === 'accept' ? <LoaderCircle size={24} className="animate-spin" /> : <><Check size={26} strokeWidth={3} /> قبول الطلب</>}
        </button>
        <button onClick={() => respond('decline')} disabled={!!busy} className="mt-2 w-full py-3 text-sm font-bold text-white/75 disabled:opacity-60">
          {busy === 'decline' ? <LoaderCircle size={16} className="mx-auto animate-spin" /> : 'رفض'}
        </button>
      </div>
    </div>
  )
}

/* ───────── تطبيق الأندرويد: الأذونات اللازمة للرنين والموقع ───────── */

// أول ما يفتح السائق التطبيق: شاشة كاملة بتطلب كل الأذونات خطوة خطوة (لحتى ما تضيع عليه الطلبات)
function DriverSetupGate({ zapp }) {
  const [st, setSt] = useState(null)
  const [skipped, setSkipped] = useState(() => {
    try {
      return sessionStorage.getItem('zapp.setupSkip') === '1'
    } catch {
      return false
    }
  })
  const check = useCallback(() => zapp.status().then(setSt).catch(() => {}), [zapp])
  useEffect(() => {
    check()
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [check])
  if (skipped || !st) return null
  const steps = [
    { ok: st.notifications, title: 'الإشعارات', sub: 'حتى يرنّ الموبايل لما يجيك طلب', run: () => zapp.ensurePermissions().then(setSt) },
    { ok: st.location, title: 'الموقع', sub: 'حتى توصلك الطلبات القريبة منك وتطلع عالخريطة', run: () => zapp.ensurePermissions().then(setSt) },
    { ok: st.batteryExempt, title: 'الشغل بالخلفية', sub: 'اختار "السماح" حتى ما يسكّر الموبايل التطبيق', run: () => zapp.batteryExemption().then(() => setTimeout(check, 1500)) },
    ...(st.fullScreen === false
      ? [{ ok: false, title: 'الظهور على شاشة القفل', sub: 'حتى يطلع الطلب متل المكالمة والموبايل مقفول', run: () => zapp.fullScreenSettings().then(() => setTimeout(check, 1500)) }]
      : []),
  ]
  if (steps.every((x) => x.ok)) return null
  const next = steps.find((x) => !x.ok)
  const skip = () => {
    try {
      sessionStorage.setItem('zapp.setupSkip', '1')
    } catch {}
    setSkipped(true)
  }
  return (
    <div className="pt-safe pb-safe fixed inset-0 z-[70] mx-auto flex max-w-md flex-col overflow-y-auto bg-navy px-6 text-white">
      <div className="flex-1 pt-12">
        <img src="/driver-192.png" alt="" className="h-14 w-14 rounded-2xl" />
        <h1 className="mt-6 text-[28px] font-black leading-tight">جهّز موبايلك لتوصلك الطلبات</h1>
        <p className="mt-2 text-sm text-white/70">بدون هالأذونات ممكن ما يرنّ الموبايل وما توصلك الطلبات والتطبيق مسكّر.</p>
        <ol className="mt-7 space-y-3">
          {steps.map((x, i) => (
            <li key={x.title}>
              <button
                disabled={x.ok}
                onClick={x.run}
                className={`flex w-full items-center gap-3 rounded-2xl p-4 text-start ${x.ok ? 'bg-white/10' : x === next ? 'bg-lime text-navy' : 'bg-white/5'}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-black ${x.ok ? 'bg-lime text-navy' : x === next ? 'bg-navy text-lime' : 'bg-white/10'}`}>
                  {x.ok ? '✓' : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{x.title}</span>
                  <span className={`block text-xs ${x === next ? 'text-navy/70' : 'text-white/60'}`}>{x.sub}</span>
                </span>
                {!x.ok && x === next && <span className="text-xs font-black">اسمح</span>}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="pb-8 pt-6">
        <button onClick={next.run} className="w-full rounded-2xl bg-lime py-4 text-base font-black text-navy">
          {next.title}: اسمح
        </button>
        <button onClick={skip} className="mt-3 w-full py-2 text-sm font-bold text-white/50">
          لاحقاً
        </button>
      </div>
    </div>
  )
}

function NativeSetupCard({ zapp }) {
  const [st, setSt] = useState(null)
  const check = useCallback(() => zapp.status().then(setSt).catch(() => {}), [zapp])
  useEffect(() => {
    check()
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [check])
  if (!st || (st.location && st.notifications && st.batteryExempt && st.fullScreen !== false)) return null
  const steps = [
    { ok: st.notifications && st.location, label: 'اسمح بالإشعارات والموقع', run: () => zapp.ensurePermissions().then(setSt) },
    { ok: st.batteryExempt, label: 'اسمح للتطبيق يشتغل بالخلفية (البطارية)', run: () => zapp.batteryExemption().then(() => setTimeout(check, 1500)) },
    ...(st.fullScreen === false
      ? [{ ok: false, label: 'اسمح يطلع الطلب على شاشة القفل', run: () => zapp.fullScreenSettings().then(() => setTimeout(check, 1500)) }]
      : []),
  ]
  return (
    <div className="rounded-3xl bg-amber-400 p-4 text-navy">
      <p className="font-extrabold">خطوة وحدة لحتى يرنّ الموبايل لما يجيك طلب</p>
      <p className="mt-1 text-xs">بدون هالأذونات ممكن ما توصلك الطلبات والتطبيق مسكّر.</p>
      <div className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <button
            key={i}
            disabled={s.ok}
            onClick={s.run}
            className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold ${s.ok ? 'bg-white/40' : 'bg-navy text-white'}`}
          >
            {s.label}
            <span>{s.ok ? '✓' : `${i + 1}`}</span>
          </button>
        ))}
      </div>
    </div>
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
          <b className="font-en"> zapp.prodev.cloud</b>، ثم عُد إلى التطبيق.
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

/* ───────── تطبيق الأندرويد الحقيقي (بيرنّ حتى والتطبيق مسكّر) ───────── */

function DriverApkCard() {
  const [ver, setVer] = useState(null)
  useEffect(() => {
    if (!/android/i.test(navigator.userAgent)) return
    fetch('/apk/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setVer)
      .catch(() => {})
  }, [])
  if (!ver) return null
  return (
    <a href={`/apk/zapp-driver.apk?v=${ver.versionCode}`} className="flex items-center gap-3 rounded-3xl bg-lime p-4 text-navy shadow-soft">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy text-lime">
        <Download size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">نزّل تطبيق عامل التوصيل للأندرويد</span>
        <span className="block text-xs">بيرنّ الموبايل متل المكالمة لما يجيك طلب، حتى والتطبيق مسكّر.</span>
      </span>
    </a>
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

  // تذكير جوّا التطبيق إذا طوّل بهالحالة
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(id)
  }, [])
  const LIMIT = { assigned: 10, buying: 30, on_the_way: 25 }
  const NEXT = { assigned: 'إذا بلّشت تشتري حدّث الحالة', buying: 'إذا طلعت لعند الزبون حدّث الحالة', on_the_way: 'إذا سلّمت الطلب حدّث الحالة' }
  const staleMin = active && o.updatedAt ? Math.floor((Date.now() - Date.parse(o.updatedAt)) / 60000) : 0
  const stale = active && staleMin >= LIMIT[o.status]

  return (
    <article className={`rounded-3xl bg-white p-4 shadow-soft ${stale ? 'ring-2 ring-rose-500' : o.status === 'assigned' ? 'ring-2 ring-amber-400' : ''}`}>
      {stale && (
        <p className="-mx-1 -mt-1 mb-3 rounded-2xl bg-rose-600 px-3 py-2 text-xs font-bold text-white">
          ⏰ صرلك {staleMin} دقيقة على هالحالة. {NEXT[o.status]}.
        </p>
      )}
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
            <p className="mt-1 text-xs text-navy/60">
              التكلفة التقديرية للزبون: {money(o.details.estimate)}
              {o.details.priceUnknown && ' + ثمن الغاز حسب سعر اليوم (قول للزبون السعر)'}
            </p>
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

