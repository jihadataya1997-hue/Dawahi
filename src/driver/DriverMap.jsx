import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Flame, LocateFixed, Navigation, Phone, ShoppingBag } from 'lucide-react'
import { STOP_COLORS, bestOrder, fmtKm, km, multiStopUrl } from './route'
import { api } from './driverApi'

const STATUS = { assigned: 'جديد', buying: 'قيد الشراء', on_the_way: 'في الطريق' }
const navUrl = (l) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat.toFixed(6)},${l.lng.toFixed(6)}`

// لون ثابت لكل طلب (نفس اللون بالخريطة وبالقائمة)
export const colorFor = (orders, id) => {
  const ids = [...orders].map((o) => o.id).sort((a, b) => a - b)
  return STOP_COLORS[ids.indexOf(id) % STOP_COLORS.length]
}

// اسم الزبون فوق الدبوس
const label = (name, color) =>
  `<div style="background:#fff;border:2px solid ${color};color:#1E2E4A;font:700 12px Cairo,sans-serif;padding:2px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(30,46,74,.25)">${name.replace(/[<>&"]/g, '')}</div>`

const pin = (n, color, active) =>
  L.divIcon({
    className: '',
    iconSize: [40, 48],
    iconAnchor: [20, 46],
    html: `<div style="position:relative;width:40px;height:48px;filter:drop-shadow(0 4px 6px rgba(30,46,74,.35));transform:scale(${active ? 1.18 : 1});transform-origin:bottom center;transition:transform .2s">
      <svg viewBox="0 0 40 48" width="40" height="48"><path d="M20 47C20 47 37 30 37 18A17 17 0 0 0 3 18c0 12 17 29 17 29z" fill="${color}" stroke="#fff" stroke-width="3"/></svg>
      <span style="position:absolute;top:7px;left:0;right:0;text-align:center;font:800 17px Cairo,sans-serif;color:#fff">${n}</span></div>`,
  })

const meIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#2563EB;border:4px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)"></div>`,
})

/** خريطة كل طلبات العامل: محطات مرقّمة بالترتيب الأفضل + موقعه + قائمة مترابطة مع الخريطة */
export default function DriverMap({ orders, focusId }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const meMarker = useRef(null)
  const [me, setMe] = useState(null)
  const [geoErr, setGeoErr] = useState(false)
  const [active, setActive] = useState(focusId || null)
  const [legs, setLegs] = useState(null) // المسار الفعلي على الطرقات

  const stops = useMemo(() => bestOrder(orders, me), [orders, me])

  // تتبّع موقع العامل
  useEffect(() => {
    if (!navigator.geolocation) return setGeoErr(true)
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoErr(false)
        setMe((prev) => {
          const next = { lat: p.coords.latitude, lng: p.coords.longitude }
          // نتجاهل التغيرات الصغيرة (أقل من 25 متر) حتى ما يعيد الترتيب كل ثانية
          return prev && km(prev, next) < 0.025 ? prev : next
        })
      },
      () => setGeoErr(true),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // جلب المسار على الطرقات: من موقع العامل ← المحطة 1 ← المحطة 2 ...
  const routeKey = JSON.stringify([me && [me.lat.toFixed(4), me.lng.toFixed(4)], stops.map((o) => o.id)])
  useEffect(() => {
    const points = [...(me ? [me] : []), ...stops.map((o) => o.location)]
    if (points.length < 2) return setLegs([])
    let cancelled = false
    api('/route', { method: 'POST', body: { points } })
      .then((d) => !cancelled && setLegs(d.legs))
      .catch(() => !cancelled && setLegs(null))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // إنشاء الخريطة مرة واحدة
  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([33.5335, 36.2235], 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => map.current.remove()
  }, [])

  // رسم المحطات والخط بينها
  useEffect(() => {
    const g = layer.current
    g.clearLayers()
    const pts = []
    if (me) pts.push([me.lat, me.lng])
    // المسار: كل جزء بلون المحطة التي يوصل إليها
    const offset = me ? 0 : 1
    if (legs && legs.length) {
      legs.forEach((leg, i) => {
        const target = stops[i + offset] // مع موقع العامل: الجزء الأول يوصل للمحطة 1
        if (!target) return
        const color = colorFor(orders, target.id)
        const dim = active && active !== target.id
        L.polyline(leg.path, { color: '#fff', weight: 9, opacity: dim ? 0.4 : 0.9 }).addTo(g)
        L.polyline(leg.path, { color, weight: 5, opacity: dim ? 0.35 : 0.95, dashArray: leg.road ? null : '8 8' }).addTo(g)
      })
    }
    stops.forEach((o, i) => {
      const color = colorFor(orders, o.id)
      const m = L.marker([o.location.lat, o.location.lng], { icon: pin(i + 1, color, active === o.id), zIndexOffset: active === o.id ? 1000 : 0 })
      m.bindTooltip(label(o.customer.name, color), { permanent: true, direction: 'top', offset: [0, -48], opacity: 1, className: 'dawahi-label' })
      m.on('click', () => {
        setActive(o.id)
        document.getElementById(`stop-${o.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
      m.addTo(g)
      pts.push([o.location.lat, o.location.lng])
    })
    if (!legs && pts.length > 1) L.polyline(pts, { color: '#1E2E4A', weight: 3, opacity: 0.5, dashArray: '8 8' }).addTo(g)
    if (me) {
      if (!meMarker.current) meMarker.current = L.marker([me.lat, me.lng], { icon: meIcon, zIndexOffset: 2000 })
      meMarker.current.setLatLng([me.lat, me.lng]).addTo(g)
    }
  }, [stops, me, active, orders, legs])

  // تكبير الخريطة لتشمل كل المحطات (مرة عند فتحها أو تغيّر الطلبات)
  const fitAll = () => {
    const m = map.current
    if (!m) return
    const pts = stops.map((o) => [o.location.lat, o.location.lng])
    if (me) pts.push([me.lat, me.lng])
    m.stop() // إيقاف أي حركة جارية قبل إعادة التكبير
    m.invalidateSize()
    if (pts.length === 1) m.setView(pts[0], 16, { animate: false })
    else if (pts.length) m.fitBounds(pts, { paddingTopLeft: [50, 90], paddingBottomRight: [50, 40], maxZoom: 16, animate: false })
  }
  const key = stops.map((o) => o.id).join(',')
  useEffect(() => {
    const f = focusId && stops.find((o) => o.id === focusId)
    if (f) {
      map.current?.setView([f.location.lat, f.location.lng], 16, { animate: false })
      document.getElementById(`stop-${f.id}`)?.scrollIntoView({ block: 'nearest' })
    } else fitAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!me, focusId])

  const focus = (o) => {
    setActive(o.id)
    map.current?.stop()
    map.current?.setView([o.location.lat, o.location.lng], 17, { animate: true })
  }

  const all = multiStopUrl(stops)

  return (
    <div className="space-y-3">
      <div className="relative isolate overflow-hidden rounded-3xl shadow-soft">
        <div ref={box} dir="ltr" className="h-[46vh] min-h-[280px] w-full" />
        <button
          onClick={fitAll}
          aria-label="عرض كل المحطات"
          className="absolute bottom-3 end-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-float"
        >
          <LocateFixed size={20} className="text-navy" />
        </button>
        {geoErr && (
          <p className="absolute inset-x-3 top-3 z-[500] rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow">
            فعّل خدمة الموقع (GPS) ليظهر موقعك ويُحسب أفضل ترتيب للتوصيل
          </p>
        )}
      </div>

      {stops.length > 1 && all && (
        <a
          href={all}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl bg-navy py-3.5 text-sm font-extrabold text-white"
        >
          <Navigation size={18} /> فتح كل المحطات بالترتيب في خرائط Google
        </a>
      )}

      <p className="px-1 text-[11px] text-navy/50">
        {legs && legs.length && legs.every((l) => l.road)
          ? 'المسار مرسوم على الطرقات الفعلية. الترتيب يبدأ بالطلبات الجاهزة للتسليم ثم الأقرب.'
          : 'الترتيب المقترح يبدأ بالطلبات الجاهزة للتسليم ثم الأقرب إلى موقعك.'}
      </p>

      <ol className="space-y-2">
        {stops.map((o, i) => {
          const color = colorFor(orders, o.id)
          // المسافة والوقت على الطرقات (تراكمي حتى هذه المحطة)
          const upto = legs && legs.length && me ? legs.slice(0, i + 1) : null
          const road = upto && upto.every((l) => l.road)
          const d = road ? upto.reduce((a, l) => a + l.distanceKm, 0) : me ? km(me, o.location) : null
          const mins = road ? Math.max(1, Math.round(upto.reduce((a, l) => a + l.minutes, 0))) : null
          return (
            <li
              key={o.id}
              id={`stop-${o.id}`}
              onClick={() => focus(o)}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 shadow-soft transition ${active === o.id ? 'ring-2' : ''}`}
              style={active === o.id ? { '--tw-ring-color': color } : undefined}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-white" style={{ background: color }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-extrabold">
                  {o.kind === 'gas' ? <Flame size={14} className="text-brand" /> : <ShoppingBag size={14} className="text-brand" />}
                  <span className="font-en">{o.number}</span>
                  <span className="truncate font-normal text-navy/60">— {o.customer.name}</span>
                </p>
                <p className="text-[11px] text-navy/50">
                  {STATUS[o.status]}
                  {d !== null && ` • ${fmtKm(d)}`}
                  {mins !== null && ` • نحو ${mins} دقيقة`}
                  {o.floor ? ` • الطابق ${o.floor}` : ''}
                </p>
              </div>
              <a
                href={`tel:${o.contactPhone}`}
                onClick={(e) => e.stopPropagation()}
                aria-label="اتصال"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50"
              >
                <Phone size={16} className="text-brand" />
              </a>
              <a
                href={navUrl(o.location)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label="فتح في خرائط Google"
                className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl px-2.5 text-[11px] font-bold text-white"
                style={{ background: color }}
              >
                <Navigation size={14} /> Google
              </a>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
