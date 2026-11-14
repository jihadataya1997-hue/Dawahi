import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Bike, ClipboardList, Download, Eye, Flame, Radio, ShoppingBag, Smartphone, Truck, Wallet, WifiOff } from 'lucide-react'
import { adminApi } from './adminApi'
import { currency } from './shared'

// شاشة المراقبة الحية: تتحدّث كل ثانيتين، والعدّادات تمشي كل ثانية
const POLL_MS = 2000
const HOME = [33.5375, 36.2165] // ضاحية قدسيا

const STATUS = {
  new: { label: 'بانتظار عامل', dot: '#E5484D', chip: 'bg-red-50 text-red-600' },
  assigned: { label: 'تم التعيين', dot: '#F59E0B', chip: 'bg-amber-50 text-amber-700' },
  buying: { label: 'قيد الشراء', dot: '#1F6FD1', chip: 'bg-sky-50 text-sky-700' },
  on_the_way: { label: 'في الطريق', dot: '#4B1FE0', chip: 'bg-brand-50 text-brand' },
}
const COURIER = {
  free: { label: 'متاح', fill: '#C8F531', ink: '#1E0E4F', chip: 'bg-lime-50 text-[#5B7A00]' },
  busy: { label: 'مشغول', fill: '#4B1FE0', ink: '#fff', chip: 'bg-brand-50 text-brand' },
  offline: { label: 'غير متصل', fill: '#9AA0B4', ink: '#fff', chip: 'bg-navy/5 text-navy/50' },
}

const esc = (s) => String(s).replace(/[<>&"]/g, '')
// أرقام لاتينية بخط الشعار (أوضح بالعدّادات الكبيرة)
const fmtNum = (n) => new Intl.NumberFormat('en-US').format(n)
const money = (n) => `${fmtNum(n)} ${currency.label}`
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
function ago(iso, now) {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  if (s < 60) return `قبل ${s} ث`
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`
  return `قبل ${Math.floor(s / 3600)} س`
}

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function useLive() {
  const [data, setData] = useState(null)
  const [lastOk, setLastOk] = useState(0)
  const busy = useRef(false)
  const load = useCallback(async () => {
    if (busy.current || document.visibilityState !== 'visible') return
    busy.current = true
    try {
      setData(await adminApi('/live'))
      setLastOk(Date.now())
    } catch {
    } finally {
      busy.current = false
    }
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', load)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', load)
    }
  }, [load])
  return { data, lastOk }
}

export default function LiveMonitor({ onOpenOrder }) {
  const { data, lastOk } = useLive()
  const now = useNow()
  const [focus, setFocus] = useState(null) // { lat, lng, key }

  if (!data)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
    )

  const stale = now - lastOk > 10000
  const waiting = data.active.filter((o) => o.status === 'new').length
  const free = data.couriers.filter((c) => c.state === 'free').length
  const busyN = data.couriers.filter((c) => c.state === 'busy').length

  return (
    <div className="space-y-5">
      {/* حالة الاتصال */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {stale ? (
          <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 font-bold text-red-600">
            <WifiOff size={14} /> انقطع التحديث المباشر، نحاول من جديد…
          </span>
        ) : (
          <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 font-bold text-navy shadow-soft">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            مباشر · يتحدّث كل ثانيتين
          </span>
        )}
        <span className="text-navy/45">آخر تحديث {ago(data.at, now)}</span>
      </div>

      {/* الأرقام الحية */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi Icon={Smartphone} hero label="فاتحين التطبيق هلق" value={fmtNum(data.online.customers)}
          sub={data.online.downloadPage ? `${fmtNum(data.online.downloadPage)} على صفحة التحميل` : 'زبائن متصلون الآن'} />
        <Kpi Icon={Bike} label="عمال التوصيل" value={`${fmtNum(free)} متاح`}
          sub={`${fmtNum(busyN)} مشغول · ${fmtNum(data.couriers.length - free - busyN)} غير متصل`} />
        <Kpi Icon={Radio} label="طلبات نشطة الآن" value={fmtNum(data.active.length)}
          sub={waiting ? `${fmtNum(waiting)} بانتظار عامل` : 'كلها مع عمال'} alert={waiting > 0} />
        <Kpi Icon={ClipboardList} label="طلبات اليوم" value={fmtNum(data.today.orders)}
          sub={`${fmtNum(data.today.delivered)} وصلت · ${fmtNum(data.today.cancelled)} ملغاة`} />
        <Kpi Icon={Eye} label="زوار اليوم" value={fmtNum(data.today.visitors)}
          sub={`${fmtNum(data.today.downloadPageVisitors)} فتحوا صفحة التحميل`} />
        <Kpi Icon={Download} label="تثبيتات اليوم" value={fmtNum(data.today.installs)}
          sub={`المجموع ${fmtNum(data.installsTotal)} · ${fmtNum(data.customersTotal)} حساب`} />
        <Kpi Icon={Wallet} label="أجور التوصيل اليوم" value={money(data.today.deliveryFees)} sub="من الطلبات اللي وصلت" small />
        <Kpi Icon={Flame} label="مبيعات الغاز اليوم" value={money(data.today.gasSales)} sub="ثمن الجرات المسلّمة" small />
      </div>

      {/* الخريطة + رادار الطلبات */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-2xl bg-white shadow-soft">
          <LiveMap couriers={data.couriers} orders={data.active} focus={focus} />
          <Legend />
        </section>
        <Radar orders={data.active} now={now} onFocus={(o) => setFocus({ ...o.location, key: `${o.id}:${Date.now()}` })} onOpen={onOpenOrder} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Hourly hourly={data.today.hourly} />
        <Fleet couriers={data.couriers} now={now} onFocus={(c) => c.location && setFocus({ ...c.location, key: `c${c.id}:${Date.now()}` })} />
      </div>
    </div>
  )
}

function Kpi({ Icon, label, value, sub, hero, alert, small }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-4 shadow-soft ${
        hero ? 'speed-bg bg-brand text-white' : alert ? 'bg-white ring-2 ring-red-400' : 'bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${hero ? 'bg-lime text-navy' : 'bg-brand-50 text-brand'}`}>
          <Icon size={17} />
        </span>
        <span className={`text-xs font-bold ${hero ? 'text-white/80' : 'text-navy/55'}`}>{label}</span>
      </div>
      <p className={`num-zap mt-3 leading-none ${small ? 'text-xl' : 'text-3xl'} ${hero ? 'text-lime' : alert ? 'text-red-600' : 'text-navy'}`}>{value}</p>
      <p className={`mt-2 truncate text-[11px] ${hero ? 'text-white/70' : 'text-navy/45'}`}>{sub}</p>
    </div>
  )
}

/* ───────── الخريطة الحية ───────── */
const orderIcon = (o) =>
  L.divIcon({
    className: '',
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    html: `<div style="position:relative;width:30px;height:38px;filter:drop-shadow(0 3px 4px rgba(30,14,79,.35))">
      ${o.status === 'new' ? `<span style="position:absolute;left:3px;top:2px;width:24px;height:24px;border-radius:50%;background:${STATUS.new.dot};opacity:.35;animation:zapPing 1.4s infinite"></span>` : ''}
      <svg viewBox="0 0 30 38" width="30" height="38"><path d="M15 37S28 23 28 14A13 13 0 0 0 2 14c0 9 13 23 13 23z" fill="${STATUS[o.status].dot}" stroke="#fff" stroke-width="2.5"/></svg>
      <span style="position:absolute;top:5px;left:0;right:0;text-align:center;color:#fff">${
        o.kind === 'gas'
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M12 3c3 4 6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 10 9 8 12 3z"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>'
      }</span></div>`,
  })

const courierIcon = (c) => {
  const s = COURIER[c.state]
  const dim = !c.location.fresh
  return L.divIcon({
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div style="opacity:${dim ? 0.45 : 1};display:flex;flex-direction:column;align-items:center">
      <div style="width:36px;height:36px;border-radius:12px;background:${s.fill};color:${s.ink};border:3px solid #fff;box-shadow:0 3px 8px rgba(30,14,79,.35);display:flex;align-items:center;justify-content:center;font:800 15px Cairo,sans-serif;position:relative">
        ${esc(c.name.trim()[0] || '؟')}
        ${c.orders ? `<span style="position:absolute;top:-8px;inset-inline-end:-8px;min-width:18px;height:18px;border-radius:9px;background:#1E0E4F;color:#C8F531;font:800 11px 'Exo 2',sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff">${c.orders}</span>` : ''}
      </div>
      <div style="margin-top:2px;background:#fff;color:#1E0E4F;font:700 11px Cairo,sans-serif;padding:0 6px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(30,14,79,.25)">${esc(c.name.split(' ')[0])}</div>
    </div>`,
  })
}

function LiveMap({ couriers, orders, focus }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const fitted = useRef(false)

  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: true, attributionControl: false }).setView(HOME, 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    const ro = new ResizeObserver(() => map.current?.invalidateSize())
    ro.observe(box.current)
    return () => {
      ro.disconnect()
      map.current.remove()
    }
  }, [])

  useEffect(() => {
    const g = layer.current
    g.clearLayers()
    const pts = []
    const byId = new Map(couriers.map((c) => [c.id, c]))
    // خط بين العامل وطلباته
    for (const o of orders) {
      const c = o.courierId && byId.get(o.courierId)
      if (c?.location)
        L.polyline([[c.location.lat, c.location.lng], [o.location.lat, o.location.lng]], {
          color: '#4B1FE0', weight: 2.5, opacity: 0.55, dashArray: '6 6', interactive: false,
        }).addTo(g)
    }
    for (const o of orders) {
      pts.push([o.location.lat, o.location.lng])
      L.marker([o.location.lat, o.location.lng], { icon: orderIcon(o), zIndexOffset: o.status === 'new' ? 500 : 0 })
        .bindTooltip(`<b>${o.number}</b> · ${esc(o.customer.name)}<br>${STATUS[o.status].label}`, { direction: 'top', offset: [0, -30] })
        .addTo(g)
    }
    for (const c of couriers) {
      if (!c.location || c.state === 'offline') continue
      pts.push([c.location.lat, c.location.lng])
      L.marker([c.location.lat, c.location.lng], { icon: courierIcon(c), zIndexOffset: 1000 })
        .bindTooltip(`<b>${esc(c.name)}</b> · ${COURIER[c.state].label}${c.orders ? ` · ${c.orders} طلب` : ''}`, { direction: 'top', offset: [0, -24] })
        .addTo(g)
    }
    // نضبط الإطار أول مرة فقط، بعدها الإدارة بتتحكم بالتكبير
    if (!fitted.current && pts.length) {
      fitted.current = true
      map.current.stop()
      if (pts.length === 1) map.current.setView(pts[0], 15, { animate: false })
      else map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 16, animate: false })
    }
  }, [couriers, orders])

  useEffect(() => {
    if (focus) map.current.flyTo([focus.lat, focus.lng], 17, { duration: 0.6 })
  }, [focus])

  return <div ref={box} className="h-[360px] w-full lg:h-[480px]" />
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-navy/5 px-4 py-3 text-[11px] text-navy/60">
      {Object.values(STATUS).map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.dot }} /> {s.label}
        </span>
      ))}
      <span className="mx-1 text-navy/20">|</span>
      {['free', 'busy'].map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px]" style={{ background: COURIER[k].fill }} /> عامل {COURIER[k].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-navy/40">باهت = موقع قديم</span>
    </div>
  )
}

/* ───────── رادار الطلبات ───────── */
function Radar({ orders, now, onFocus, onOpen }) {
  const list = useMemo(
    () => [...orders].sort((a, b) => (a.status !== 'new') - (b.status !== 'new') || a.id - b.id),
    [orders]
  )
  return (
    <section className="flex max-h-[600px] flex-col rounded-2xl bg-white shadow-soft">
      <header className="flex items-center justify-between border-b border-navy/5 px-4 py-3">
        <h2 className="font-extrabold">رادار الطلبات</h2>
        <span className="num-zap rounded-full bg-navy px-2.5 py-0.5 text-sm text-lime">{orders.length}</span>
      </header>
      {!list.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-navy/45">
          <Radio size={28} className="text-navy/20" />
          ما في طلبات نشطة هلق. أول ما يجي طلب بيظهر هون فوراً.
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-navy/5 overflow-y-auto">
          {list.map((o) => {
            const s = STATUS[o.status]
            const age = now - Date.parse(o.createdAt)
            const late = o.status === 'new' && age > 3 * 60 * 1000
            return (
              <li key={o.id} className={`px-4 py-3 ${o.status === 'new' ? 'bg-red-50/40' : ''}`}>
                <button onClick={() => onFocus(o)} className="block w-full text-start">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.dot }} />
                    <span className="num-zap text-sm">{o.number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>{s.label}</span>
                    <span className={`num-zap ms-auto text-sm tabular-nums ${late ? 'text-red-600' : 'text-navy/70'}`}>{clock(age)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-bold">
                    {o.kind === 'gas' ? <Flame size={13} className="me-1 inline text-brand" /> : <ShoppingBag size={13} className="me-1 inline text-brand" />}
                    {o.summary}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-navy/50">
                    {o.customer.name}
                    {o.address ? ` · ${o.address}` : ''}
                  </p>
                </button>
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  {o.courierName ? (
                    <span className="flex items-center gap-1 font-bold text-navy/70">
                      <Truck size={12} /> {o.courierName} · بهالحالة من {clock(now - Date.parse(o.statusAt))}
                    </span>
                  ) : o.offer ? (
                    <span className="font-bold text-amber-700">
                      معروض على {o.offer.to} · باقي {clock(Date.parse(o.offer.expiresAt) - now)}
                    </span>
                  ) : (
                    <span className="font-bold text-red-600">ما في عامل متاح حالياً</span>
                  )}
                  <button onClick={() => onOpen({ id: o.id })} className="ms-auto rounded-lg bg-navy/5 px-2.5 py-1 font-bold text-navy active:scale-95">
                    تفاصيل
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ───────── الطلبات حسب الساعة ───────── */
function Hourly({ hourly }) {
  const max = Math.max(1, ...hourly)
  const nowH = new Date(Date.now() + 3 * 3600 * 1000).getUTCHours()
  return (
    <section className="rounded-2xl bg-white p-4 shadow-soft">
      <h2 className="font-extrabold">طلبات اليوم حسب الساعة</h2>
      <div className="mt-4 flex h-36 items-end gap-[3px]" dir="ltr">
        {hourly.map((n, h) => (
          <div key={h} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className={`w-full rounded-t-[4px] transition-all ${h === nowH ? 'bg-brand' : h > nowH ? 'bg-navy/5' : 'bg-brand/35'}`}
              style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%` }}
            />
            {n > 0 && (
              <span className="num-zap pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-navy/60 opacity-0 group-hover:opacity-100">{n}</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-navy/40" dir="ltr">
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h} className="font-en">{String(h).padStart(2, '0')}:00</span>
        ))}
      </div>
    </section>
  )
}

/* ───────── أسطول العمال ───────── */
function Fleet({ couriers, now, onFocus }) {
  const order = { busy: 0, free: 1, offline: 2 }
  const list = [...couriers].sort((a, b) => order[a.state] - order[b.state])
  return (
    <section className="rounded-2xl bg-white shadow-soft">
      <h2 className="border-b border-navy/5 px-4 py-3 font-extrabold">عمال التوصيل الآن</h2>
      {!list.length ? (
        <p className="p-6 text-center text-sm text-navy/45">لا يوجد عمال بعد. أضفهم من قسم عمال التوصيل.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-navy/5 overflow-y-auto">
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => onFocus(c)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold"
                  style={{ background: COURIER[c.state].fill, color: COURIER[c.state].ink }}>
                  {c.name.trim()[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{c.name}</span>
                  <span className="block text-[11px] text-navy/45">
                    {c.location ? `آخر موقع ${ago(c.location.at, now)}` : 'لم يرسل موقعه بعد'}
                  </span>
                </span>
                {c.orders > 0 && <span className="num-zap text-sm text-brand">{c.orders} طلب</span>}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${COURIER[c.state].chip}`}>{COURIER[c.state].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
