import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AlertTriangle, ArrowLeftRight, LoaderCircle, MessageCircle, Phone, X } from 'lucide-react'
import { api, errText } from './driverApi'

const HOME = [33.5375, 36.2165]
const STATE = {
  free: { label: 'متاح', chip: 'bg-emerald-100 text-emerald-700', dot: '#10B981' },
  busy: { label: 'مشغول', chip: 'bg-amber-100 text-amber-700', dot: '#F59E0B' },
  offline: { label: 'غير متاح', chip: 'bg-navy-50 text-navy/50', dot: '#94A3B8' },
}
const ORDER = { new: 'بانتظار عامل', assigned: 'استلمه', buying: 'عم يشتري', on_the_way: 'بالطريق' }
const esc = (t) => String(t || '').replace(/[<>&"]/g, '')

function ago(iso) {
  if (!iso) return ''
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000))
  if (s < 60) return 'هلق'
  if (s < 3600) return `من ${Math.floor(s / 60)} دقيقة`
  if (s < 86400) return `من ${Math.floor(s / 3600)} ساعة`
  return `من ${Math.floor(s / 86400)} يوم`
}
const mins = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 60000)

/** وضع المشرف: كل السائقين والطلبات المفتوحة، مع تحويل الطلبات وتشغيل/توقيف السائقين */
export default function Supervisor() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [moving, setMoving] = useState(null) // الطلب يلي عم ينحوّل
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api('/sup/overview'))
      setError('')
    } catch (e) {
      setError(errText(e))
    }
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(() => document.visibilityState === 'visible' && load(), 10000)
    return () => clearInterval(id)
  }, [load])

  const setOnline = async (c) => {
    setBusy(`c${c.id}`)
    try {
      await api(`/sup/couriers/${c.id}/online`, { method: 'POST', body: { online: c.state === 'offline' } })
      await load()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy('')
    }
  }
  const assign = async (order, courier) => {
    setBusy(`o${order.id}`)
    try {
      await api(`/sup/orders/${order.id}/assign`, { method: 'POST', body: { courierId: courier.id } })
      setMoving(null)
      await load()
    } catch (e) {
      setError(e.code === 'TOO_LATE' ? 'العامل بلّش يشتري، ما فيك تحوّله هلق' : errText(e))
    } finally {
      setBusy('')
    }
  }

  if (!data)
    return (
      <div className="flex justify-center pt-12 text-brand">
        {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : <LoaderCircle size={30} className="animate-spin" />}
      </div>
    )

  const waiting = data.active.filter((o) => o.status === 'new')
  const running = data.active.filter((o) => o.status !== 'new')
  const late = waiting.filter((o) => mins(o.createdAt) >= data.waitingAlertMin)
  const order = { free: 0, busy: 1, offline: 2 }
  const couriers = [...data.couriers].sort((a, b) => order[a.state] - order[b.state] || b.appOpen - a.appOpen)
  const n = (s) => data.couriers.filter((c) => c.state === s).length

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-sm font-bold text-rose-600">{error}</p>}

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['متاح', n('free'), 'text-emerald-600'],
          ['مشغول', n('busy'), 'text-amber-600'],
          ['بانتظار عامل', waiting.length, waiting.length ? 'text-rose-600' : 'text-navy/40'],
        ].map(([l, v, c]) => (
          <div key={l} className="rounded-2xl bg-white p-3 shadow-soft">
            <p className={`num-zap text-2xl ${c}`}>{v}</p>
            <p className="text-[11px] font-bold text-navy/50">{l}</p>
          </div>
        ))}
      </div>

      {late.length > 0 && (
        <p className="flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white">
          <AlertTriangle size={18} className="shrink-0" />
          {late.length === 1 ? 'في طلب' : `في ${late.length} طلبات`} صرلها أكتر من {data.waitingAlertMin} دقايق بدون عامل. حوّلها لحدا متاح.
        </p>
      )}

      <SupMap couriers={data.couriers} orders={data.active} />

      <section>
        <h2 className="mb-2 font-extrabold">الطلبات المفتوحة ({data.active.length})</h2>
        {!data.active.length ? (
          <p className="rounded-2xl bg-white p-5 text-center text-sm text-navy/45 shadow-soft">ما في طلبات مفتوحة هلق</p>
        ) : (
          <ul className="space-y-2">
            {[...waiting, ...running].map((o) => {
              const m = mins(o.createdAt)
              const isLate = o.status === 'new' && m >= data.waitingAlertMin
              return (
                <li key={o.id} className={`rounded-2xl bg-white p-3 shadow-soft ${isLate ? 'ring-2 ring-rose-500' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="num-zap text-sm">{o.number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.status === 'new' ? 'bg-rose-100 text-rose-700' : 'bg-brand-50 text-brand'}`}>
                      {ORDER[o.status]}
                    </span>
                    <span className={`ms-auto text-[11px] font-bold ${isLate ? 'text-rose-600' : 'text-navy/45'}`}>من {m} د</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm">{o.summary}</p>
                  <p className="text-[11px] text-navy/50">
                    {o.customer.name}
                    {o.courierName ? ` · مع ${o.courierName}` : o.offer ? ` · معروض على ${o.offer.to}` : ''}
                  </p>
                  {['new', 'assigned'].includes(o.status) && (
                    <button
                      onClick={() => setMoving(o)}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-navy py-2 text-xs font-bold text-white"
                    >
                      <ArrowLeftRight size={14} /> {o.status === 'new' ? 'سلّمه لعامل' : 'حوّله لعامل تاني'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-extrabold">السائقين ({data.couriers.length})</h2>
        <ul className="divide-y divide-navy/5 rounded-2xl bg-white shadow-soft">
          {couriers.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 font-extrabold">
                {c.name.trim()[0]}
                <span className={`absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white ${c.appOpen ? 'bg-emerald-500' : 'bg-navy/25'}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm font-bold">
                  {c.name}
                  <span className={`rounded-full px-1.5 text-[10px] ${STATE[c.state].chip}`}>{STATE[c.state].label}</span>
                </span>
                <span className="block truncate text-[11px] text-navy/50">
                  {c.appOpen ? 'فاتح التطبيق هلق' : c.lastSeen ? `آخر ظهور ${ago(c.lastSeen)}` : 'ما فتح التطبيق بعد'}
                  {c.orders ? ` · معه ${c.orders} طلب` : ''}
                </span>
              </span>
              <a href={`tel:${c.phone}`} aria-label="اتصال" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime text-navy">
                <Phone size={15} />
              </a>
              <a href={`https://wa.me/963${c.phone.slice(1)}`} aria-label="واتساب" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-emerald-600">
                <MessageCircle size={15} />
              </a>
              <button
                onClick={() => setOnline(c)}
                disabled={busy === `c${c.id}`}
                className={`h-9 shrink-0 rounded-xl px-2.5 text-[11px] font-bold ${c.state === 'offline' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}
              >
                {busy === `c${c.id}` ? <LoaderCircle size={14} className="animate-spin" /> : c.state === 'offline' ? 'شغّله' : 'وقّفه'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {moving && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50" onClick={() => setMoving(null)}>
          <div className="pb-safe max-h-[80%] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold">لمين بدك تسلّم {moving.number}؟</h3>
              <button onClick={() => setMoving(null)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-navy/50">{moving.summary}</p>
            <ul className="mt-3 space-y-2">
              {couriers
                .filter((c) => c.id !== moving.courierId)
                .map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => assign(moving, c)}
                      disabled={!!busy}
                      className="flex w-full items-center gap-3 rounded-2xl border border-navy/10 p-3 text-start active:scale-[0.99] disabled:opacity-50"
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: STATE[c.state].dot }} />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm">{c.name}</b>
                        <span className="text-[11px] text-navy/50">
                          {STATE[c.state].label}
                          {c.orders ? ` · معه ${c.orders} طلب` : ''}
                          {c.appOpen ? ' · فاتح التطبيق' : ''}
                        </span>
                      </span>
                      {busy === `o${moving.id}` ? <LoaderCircle size={16} className="animate-spin text-brand" /> : <ArrowLeftRight size={16} className="text-brand" />}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function SupMap({ couriers, orders }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const fitted = useRef(false)
  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: false, attributionControl: false }).setView(HOME, 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => map.current.remove()
  }, [])
  useEffect(() => {
    const g = layer.current
    g.clearLayers()
    const pts = []
    for (const o of orders) {
      pts.push([o.location.lat, o.location.lng])
      const color = o.status === 'new' ? '#E11D48' : '#4B1FE0'
      L.circleMarker([o.location.lat, o.location.lng], { radius: 9, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 })
        .bindTooltip(`<b>${o.number}</b> · ${ORDER[o.status]}`, { direction: 'top' })
        .addTo(g)
    }
    for (const c of couriers) {
      if (!c.location || c.state === 'offline') continue
      pts.push([c.location.lat, c.location.lng])
      L.marker([c.location.lat, c.location.lng], {
        icon: L.divIcon({
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: `<div style="width:30px;height:30px;border-radius:10px;background:${STATE[c.state].dot};border:3px solid #fff;color:#fff;font:800 13px Cairo,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3)">${esc(c.name.trim()[0])}</div>`,
        }),
        zIndexOffset: 1000,
      })
        .bindTooltip(`<b>${esc(c.name)}</b> · ${STATE[c.state].label}`, { direction: 'top' })
        .addTo(g)
    }
    if (!fitted.current && pts.length) {
      fitted.current = true
      if (pts.length === 1) map.current.setView(pts[0], 15)
      else map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 16 })
    }
  }, [couriers, orders])
  return <div ref={box} className="h-56 w-full overflow-hidden rounded-2xl shadow-soft" />
}
