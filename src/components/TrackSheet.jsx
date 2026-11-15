import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Bike, Home, LocateFixed, Phone, X } from 'lucide-react'
import { api } from '../api'
import { useLang } from '../i18n/LanguageProvider'

const STATUS = {
  assigned: { ar: 'عامل التوصيل قبل طلبك', en: 'Courier accepted your order' },
  buying: { ar: 'عامل التوصيل عم يشتري طلبك', en: 'Courier is buying your order' },
  on_the_way: { ar: 'طلبك بالطريق لعندك', en: 'Your order is on the way' },
  delivered: { ar: 'وصل طلبك', en: 'Order delivered' },
  cancelled: { ar: 'انلغى الطلب', en: 'Order cancelled' },
}

const pinIcon = (bg, svg, size = 40) =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};border:3px solid #fff;box-shadow:0 4px 14px rgba(26,19,64,.35);display:flex;align-items:center;justify-content:center">${svg}</div>`,
  })
const BIKE_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A1340" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>'
const HOME_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>'

// خريطة تتبّع عامل التوصيل للزبون: بتتحدّث كل 5 ثواني
export default function TrackSheet({ order, onClose }) {
  const { lang } = useLang()
  const ar = lang === 'ar'
  const box = useRef(null)
  const map = useRef(null)
  const marks = useRef({})
  const fitted = useRef(false)
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let stop = false
    const load = () => {
      if (document.visibilityState !== 'visible') return
      api(`/orders/${order.id}/track`)
        .then((d) => !stop && (setData(d), setFailed(false)))
        .catch(() => !stop && setFailed(true))
    }
    load()
    const t = setInterval(load, 5000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [order.id])

  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([order.location.lat, order.location.lng], 16)
    L.tileLayer('/tiles/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
    return () => map.current.remove()
  }, [order.location.lat, order.location.lng])

  useEffect(() => {
    const m = map.current
    if (!m || !data) return
    const dest = [data.destination.lat, data.destination.lng]
    if (!marks.current.dest) marks.current.dest = L.marker(dest, { icon: pinIcon('#4B1FE0', HOME_SVG, 36), interactive: false }).addTo(m)
    const c = data.courier
    if (c) {
      const pos = [c.lat, c.lng]
      if (!marks.current.courier) marks.current.courier = L.marker(pos, { icon: pinIcon('#C6F432', BIKE_SVG, 44), interactive: false, zIndexOffset: 500 }).addTo(m)
      else marks.current.courier.setLatLng(pos)
      marks.current.courier.setOpacity(c.fresh ? 1 : 0.55)
      if (!marks.current.line) marks.current.line = L.polyline([pos, dest], { color: '#4B1FE0', weight: 3, dashArray: '6 8', opacity: 0.7 }).addTo(m)
      else marks.current.line.setLatLngs([pos, dest])
      if (!fitted.current) {
        m.fitBounds(L.latLngBounds([pos, dest]), { padding: [70, 70], maxZoom: 17 })
        fitted.current = true
      }
    } else {
      marks.current.courier?.remove()
      marks.current.line?.remove()
      marks.current.courier = marks.current.line = null
    }
  }, [data])

  const recenter = () => {
    const c = data?.courier
    const dest = [order.location.lat, order.location.lng]
    if (c) map.current.fitBounds(L.latLngBounds([[c.lat, c.lng], dest]), { padding: [70, 70], maxZoom: 17 })
    else map.current.setView(dest, 16)
  }

  const st = STATUS[data?.status || order.status]
  const c = data?.courier
  let sub
  if (data && !data.active) sub = ''
  else if (c) sub = ar ? `على بعد ${c.km} كم تقريباً${c.fresh ? '' : ' · آخر موقع من شوي'}` : `About ${c.km} km away${c.fresh ? '' : ' · last known'}`
  else if (data) sub = ar ? 'موقع عامل التوصيل رح يبين أول ما يوصلنا' : "Courier's location will appear shortly"

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={ar ? 'تتبّع الطلب' : 'Track order'}>
      <div ref={box} className="flex-1" />
      <button onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'} className="absolute end-4 top-[calc(1rem+env(safe-area-inset-top))] z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-float">
        <X size={20} />
      </button>
      <button onClick={recenter} aria-label={ar ? 'رجوع للطلب' : 'Recenter'} className="absolute start-4 top-[calc(1rem+env(safe-area-inset-top))] z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand shadow-float">
        <LocateFixed size={20} />
      </button>

      <div className="relative z-[500] -mt-6 rounded-t-[28px] bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-float">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lime text-navy">
            <Bike size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold">{st ? (ar ? st.ar : st.en) : ''}</p>
            <p className="truncate text-xs text-navy/55">
              <span className="font-en">{order.number}</span>
              {order.courierName ? ` · ${order.courierName}` : ''}
            </p>
            {sub && <p className="mt-0.5 text-xs font-bold text-brand">{sub}</p>}
            {failed && <p className="mt-0.5 text-xs font-bold text-amber-700">{ar ? 'عم نحاول نوصل… تأكد من النت' : 'Reconnecting… check your internet'}</p>}
          </div>
          {order.courierPhone && data?.active !== false && (
            <a href={`tel:${order.courierPhone}`} aria-label={ar ? 'اتصال بعامل التوصيل' : 'Call courier'} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
              <Phone size={20} />
            </a>
          )}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-navy/45">
          <Home size={12} /> {ar ? 'البيت البنفسجي هو عنوانك، والموتور الأخضر هو عامل التوصيل' : 'Purple home is you, green bike is your courier'}
        </p>
      </div>
    </div>,
    document.body
  )
}
