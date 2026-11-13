import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Check, LoaderCircle, LocateFixed, MapPin, X } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

// مركز ضاحية قدسيا تقريباً — نقطة البداية إذا ما في موقع محفوظ
export const QUDSAYA_CENTER = { lat: 33.5335, lng: 36.2235 }
const KEY = 'dawahi.lastLocation'

export function loadLastLocation() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

// رابط يفتح الموقع مباشرة في خرائط Google عند شب التوصيل
export const mapsLink = ({ lat, lng }) => `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`

/**
 * شاشة كاملة لاختيار الموقع: الدبوس ثابت بالمنتصف والزبون يحرّك الخريطة تحته
 * (نفس أسلوب تطبيقات التوصيل المعروفة) + زر "موقعي الحالي" بالـ GPS.
 */
export default function LocationPicker({ open, initial, onClose, onConfirm }) {
  const { t } = useLang()
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const [moving, setMoving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [geoErr, setGeoErr] = useState('')

  useEffect(() => {
    if (!open || !boxRef.current) return
    const start = initial || loadLastLocation() || QUDSAYA_CENTER
    const map = L.map(boxRef.current, { zoomControl: false, attributionControl: true }).setView(
      [start.lat, start.lng],
      initial || loadLastLocation() ? 17 : 15
    )
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    map.on('movestart', () => setMoving(true))
    map.on('moveend', () => setMoving(false))
    mapRef.current = map
    // إذا ما في موقع سابق، نحاول نحدد موقعه تلقائياً
    if (!initial && !loadLastLocation()) locate()
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function locate() {
    if (!navigator.geolocation) return setGeoErr(t('map.geoErr'))
    setLocating(true)
    setGeoErr('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 18, { duration: 0.8 })
      },
      () => {
        setLocating(false)
        setGeoErr(t('map.geoErr'))
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  }

  const confirm = () => {
    const c = mapRef.current.getCenter()
    const loc = { lat: c.lat, lng: c.lng }
    try {
      localStorage.setItem(KEY, JSON.stringify(loc))
    } catch {}
    onConfirm(loc)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-md flex-col bg-white animate-fade-in">
      {/* الخريطة */}
      <div className="relative flex-1">
        <div ref={boxRef} dir="ltr" className="absolute inset-0 z-0" />

        {/* الدبوس الثابت بالمنتصف */}
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <div className={`-mt-12 flex flex-col items-center transition-transform ${moving ? '-translate-y-3' : ''}`}>
            <MapPin size={48} className="fill-brand text-navy drop-shadow-lg" strokeWidth={1.5} />
          </div>
          <span className={`absolute h-2 w-4 rounded-full bg-navy/30 transition-all ${moving ? 'scale-75 opacity-50' : ''}`} />
        </div>

        {/* العنوان + إغلاق */}
        <div className="pt-safe absolute inset-x-0 top-0 z-[600] flex items-start gap-2 p-4">
          <p className="flex-1 rounded-2xl bg-white/95 px-4 py-3 text-sm font-bold shadow-soft backdrop-blur">
            {t('map.title')}
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-soft active:scale-95"
          >
            <X size={20} />
          </button>
        </div>

        {/* زر موقعي */}
        <button
          onClick={locate}
          className="absolute bottom-4 end-4 z-[600] flex items-center gap-2 rounded-full bg-white px-4 py-3 text-xs font-bold shadow-float active:scale-95"
        >
          {locating ? <LoaderCircle size={18} className="animate-spin text-brand" /> : <LocateFixed size={18} className="text-brand" />}
          {locating ? t('map.locating') : t('map.locateMe')}
        </button>
      </div>

      <div className="pb-safe border-t border-navy/5 bg-white px-5 py-4">
        {geoErr && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{geoErr}</p>}
        <button
          onClick={confirm}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-sm font-extrabold text-white active:scale-[0.98]"
        >
          <Check size={18} />
          {t('map.confirm')}
        </button>
      </div>
    </div>
  )
}

// بطاقة صغيرة داخل نموذج الطلب: "حدد موقعك" أو "تم التحديد — تغيير"
export function LocationField({ value, onOpen }) {
  const { t } = useLang()
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-start transition active:scale-[0.98] ${
        value ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-brand bg-brand-50'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${
          value ? 'bg-emerald-500' : 'bg-brand'
        }`}
      >
        {value ? <Check size={20} strokeWidth={3} /> : <MapPin size={20} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{value ? t('map.picked') : t('map.pick')}</span>
        <span dir="ltr" className="block truncate font-en text-xs text-navy/50 rtl:text-end">
          {value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : t('map.pickSub')}
        </span>
      </span>
      {value && <span className="shrink-0 text-xs font-bold text-emerald-600">{t('map.change')}</span>}
    </button>
  )
}
