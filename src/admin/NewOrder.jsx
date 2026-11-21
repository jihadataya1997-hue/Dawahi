import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Check, History, LoaderCircle, MapPin, PhoneCall, UserPlus, X } from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'
import { inputCls } from './shared'
import { QUDSAYA, addHomeButton } from '../lib/mapHome'

const CATS = [
  ['any', 'أي محل'],
  ['supermarket', 'سوبرماركت'],
  ['restaurants', 'مطعم'],
  ['pharmacy', 'صيدلية'],
  ['gas', 'جرة غاز'],
  ['diesel', 'مازوت'],
  ['library', 'مكتبة'],
  ['other', 'غير ذلك'],
]

const newKey = () => `adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// طلب هاتفي أو واتساب: الموظف بيدخله باسم الزبون
export default function NewOrder({ onClose, onCreated }) {
  const [phone, setPhone] = useState('')
  const [lookup, setLookup] = useState(null) // { customer, addresses, last } | 'loading'
  const [name, setName] = useState('')
  const [loc, setLoc] = useState(null)
  const [address, setAddress] = useState('')
  const [floor, setFloor] = useState(0)
  const [category, setCategory] = useState('any')
  const [items, setItems] = useState('')
  const [storeName, setStoreName] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [key] = useState(newKey)

  const box = useRef(null)
  const map = useRef(null)
  const pin = useRef(null)

  // نجيب الزبون أول ما يكتمل الرقم
  useEffect(() => {
    const p = phone.replace(/\s/g, '')
    if (!/^09\d{8}$/.test(p)) return setLookup(null)
    let stop = false
    setLookup('loading')
    adminApi(`/customer-lookup?phone=${p}`)
      .then((d) => {
        if (stop) return
        setLookup(d)
        if (d.customer) setName(d.customer.name)
        // آخر عنوان طلب عليه بينحط تلقائياً
        const a = d.addresses?.[0]
        if (a) pick({ lat: a.lat, lng: a.lng }, a.details, a.floor)
        else if (d.last) pick({ lat: d.last.lat, lng: d.last.lng }, d.last.address, d.last.floor)
      })
      .catch(() => !stop && setLookup(null))
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone])

  useEffect(() => {
    map.current = L.map(box.current, { attributionControl: false }).setView(QUDSAYA, 15)
    L.tileLayer('/tiles/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map.current)
    addHomeButton(map.current)
    map.current.on('click', (e) => setLoc({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }))
    return () => map.current.remove()
  }, [])

  // الدبوس: بينحط بالكبس عالخريطة وبينسحب
  useEffect(() => {
    if (!map.current) return
    if (!loc) {
      pin.current?.remove()
      pin.current = null
      return
    }
    if (!pin.current) {
      pin.current = L.marker([loc.lat, loc.lng], {
        draggable: true,
        icon: L.divIcon({ className: 'zone-pt', iconSize: [22, 22] }),
      })
        .on('dragend', (e) => {
          const p = e.target.getLatLng()
          setLoc({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })
        })
        .addTo(map.current)
    } else pin.current.setLatLng([loc.lat, loc.lng])
  }, [loc])

  function pick(l, addr, fl) {
    setLoc(l)
    if (addr !== undefined) setAddress(addr || '')
    if (fl !== undefined) setFloor(fl || 0)
    map.current?.setView([l.lat, l.lng], 17)
  }

  const customer = lookup && lookup !== 'loading' ? lookup.customer : null
  const isNew = lookup && lookup !== 'loading' && !customer
  const blocked = customer?.blocked
  const ready = /^09\d{8}$/.test(phone.replace(/\s/g, '')) && (customer || name.trim().length >= 2) && loc && items.trim() && !blocked

  async function submit(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      const d = await adminApi('/orders/new', {
        method: 'POST',
        body: {
          clientKey: key,
          phone: phone.replace(/\s/g, ''),
          name: name.trim(),
          category,
          items: items.trim(),
          storeName: storeName.trim(),
          location: loc,
          address: address.trim(),
          floor: Number(floor) || 0,
          notes: notes.trim(),
        },
      })
      onCreated?.(d.order)
    } catch (err) {
      setError(adminErrorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="طلب هاتفي جديد">
      <form onSubmit={submit} className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-float sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-navy/10 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand">
            <PhoneCall size={20} />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-extrabold">طلب هاتفي جديد</h2>
            <p className="text-xs text-navy/55">للزبائن يلي بيطلبوا بالتلفون أو الواتساب. الطلب بيتوزع على عمال التوصيل متل أي طلب.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/5">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold">رقم موبايل الزبون</span>
              <input
                dir="ltr"
                inputMode="numeric"
                autoFocus
                maxLength={10}
                placeholder="09xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
                className={`${inputCls} font-en text-base rtl:text-end`}
              />
            </label>

            {lookup === 'loading' && (
              <p className="flex items-center gap-2 text-xs text-navy/60">
                <LoaderCircle size={14} className="animate-spin" /> عم دوّر عالزبون…
              </p>
            )}
            {customer && (
              <div className={`rounded-2xl px-4 py-3 text-sm ${blocked ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>
                <p className="font-extrabold">{blocked ? 'هالزبون موقوف، ما فيك تطلبله' : `زبون موجود: ${customer.name}`}</p>
                {!blocked && <p className="mt-0.5 text-xs opacity-80">{customer.orders ? `طلب قبل ${customer.orders} مرة` : 'أول طلب إلو'}</p>}
              </div>
            )}
            {isNew && (
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
                  <UserPlus size={15} className="text-brand" /> زبون جديد: اسمه
                </span>
                <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: أبو سامر" className={inputCls} />
                <span className="mt-1 block text-[11px] text-navy/60">بينفتحله حساب برقمه. إذا بدو يستعمل التطبيق بعدين، بتعطيه كلمة سر مؤقتة من صفحة الزبائن.</span>
              </label>
            )}

            {lookup && lookup !== 'loading' && (lookup.addresses?.length > 0 || lookup.last) && (
              <div>
                <span className="mb-1.5 block text-xs font-bold text-navy/55">عناوينه</span>
                <div className="flex flex-wrap gap-2">
                  {lookup.addresses.map((a) => (
                    <button key={a.id} type="button" onClick={() => pick({ lat: a.lat, lng: a.lng }, a.details, a.floor)} className="flex items-center gap-1 rounded-full bg-navy-50 px-3 py-1.5 text-xs font-bold">
                      <MapPin size={13} className="text-brand" /> {a.label}
                    </button>
                  ))}
                  {lookup.last && (
                    <button type="button" onClick={() => pick({ lat: lookup.last.lat, lng: lookup.last.lng }, lookup.last.address, lookup.last.floor)} className="flex items-center gap-1 rounded-full bg-navy-50 px-3 py-1.5 text-xs font-bold">
                      <History size={13} className="text-brand" /> آخر طلب
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <span className="mb-1.5 block text-sm font-bold">شو بدو؟</span>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {CATS.map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setCategory(id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${category === id ? 'bg-brand text-white' : 'bg-navy-50 text-navy/70'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <textarea rows={4} maxLength={2000} value={items} onChange={(e) => setItems(e.target.value)} placeholder="اكتب الطلب متل ما قالو الزبون" className={`${inputCls} resize-none`} />
            </div>
            <input value={storeName} maxLength={120} onChange={(e) => setStoreName(e.target.value)} placeholder="من محل معيّن؟ (اختياري)" className={inputCls} />
          </div>

          <div className="space-y-3">
            <span className="block text-sm font-bold">وين؟ اكبس عالخريطة لتحط الموقع، وفيك تسحب الدبوس</span>
            <div ref={box} className="h-64 overflow-hidden rounded-2xl border border-navy/10 lg:h-80" />
            {!loc && <p className="text-xs font-bold text-amber-700">لازم تحدد الموقع عالخريطة</p>}
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <input value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان بالتفصيل (الجزيرة، البناية…)" className={inputCls} />
              <input type="number" min={0} max={30} value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="الطابق" placeholder="الطابق" className={inputCls} />
            </div>
            <input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات لعامل التوصيل (اختياري)" className={inputCls} />
          </div>
        </div>

        <div className="border-t border-navy/10 px-5 py-4">
          {error && <p className="mb-2 text-sm font-bold text-rose-600">{error}</p>}
          <button disabled={!ready || busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-sm font-extrabold text-white disabled:opacity-40">
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Check size={18} />} أرسل الطلب لعمال التوصيل
          </button>
          <p className="mt-2 text-center text-[11px] text-navy/60">الأجرة بتنحسب متل التطبيق (المنطقة والذروة وأول طلب ببلاش).</p>
        </div>
      </form>
    </div>
  )
}
