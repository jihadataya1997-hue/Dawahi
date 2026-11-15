import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, Star } from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'

export const RATING_TAG_AR = {
  fast: 'سرعة التوصيل', polite: 'حسن التعامل', accurate: 'دقة الطلب', communicative: 'التواصل الجيد',
  late: 'تأخر في التوصيل', wrong: 'خطأ في الطلب', damaged: 'منتجات تالفة', rude: 'سوء التعامل', no_contact: 'عدم التواصل',
}
const BAD = new Set(['late', 'wrong', 'damaged', 'rude', 'no_contact'])

export function Stars({ n, size = 14 }) {
  return (
    <span className="inline-flex" aria-label={`${n} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= n ? 'text-amber-400' : 'text-navy/15'} fill="currentColor" strokeWidth={1.5} />
      ))}
    </span>
  )
}

const when = (iso) =>
  new Date(iso).toLocaleString('ar-SY-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// تقييمات الزبائن لعمال التوصيل والشكاوى
export default function Ratings({ onOpenOrder }) {
  const [filter, setFilter] = useState('all')
  const [courier, setCourier] = useState('')
  const [couriers, setCouriers] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [more, setMore] = useState(false)

  const qs = useCallback(
    (before) => {
      const p = new URLSearchParams()
      if (filter === 'low') p.set('filter', 'low')
      if (courier) p.set('courier', courier)
      if (before) p.set('before', before)
      return p.toString()
    },
    [filter, courier]
  )
  const load = useCallback(async () => {
    try {
      const d = await adminApi(`/ratings?${qs()}`)
      setData(d)
      setMore(d.more)
      setError('')
    } catch (err) {
      setError(adminErrorText(err))
    }
  }, [qs])
  useEffect(() => {
    setData(null)
    load()
  }, [load])
  useEffect(() => {
    adminApi('/couriers')
      .then((d) => setCouriers(d.couriers.filter((c) => c.ratingCount > 0).sort((a, b) => a.ratingAvg - b.ratingAvg)))
      .catch(() => {})
  }, [])

  const loadMore = async () => {
    const last = data.items[data.items.length - 1]
    const d = await adminApi(`/ratings?${qs(last.at)}`)
    setData((x) => ({ ...x, items: [...x.items, ...d.items] }))
    setMore(d.more)
  }

  const s = data?.summary
  const rateShare = s && s.delivered ? Math.round((s.count / s.delivered) * 100) : 0

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {s && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-soft">
            <p className="text-xs font-bold text-navy/50">معدل التقييم (آخر 30 يوم)</p>
            <p className="mt-1 flex items-center gap-2">
              <span className="num-zap text-3xl">{s.count ? s.avg.toFixed(1) : '—'}</span>
              {s.count > 0 && <Stars n={Math.round(s.avg)} size={18} />}
            </p>
            <p className="mt-1 text-xs text-navy/50">من {s.count} تقييم · {rateShare}% من الطلبات الواصلة انقيّمت</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-soft">
            <p className="mb-2 text-xs font-bold text-navy/50">توزيع النجوم</p>
            {[5, 4, 3, 2, 1].map((n) => {
              const c = s[`s${n}`] || 0
              const pct = s.count ? (c / s.count) * 100 : 0
              return (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className="num-zap w-3">{n}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-50">
                    <div className={`h-full rounded-full ${n <= 2 ? 'bg-rose-500' : n === 3 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="num-zap w-6 text-end text-navy/50">{c}</span>
                </div>
              )
            })}
          </div>
          <div className={`rounded-3xl p-5 shadow-soft ${s.bad ? 'bg-rose-50' : 'bg-white'}`}>
            <p className="text-xs font-bold text-navy/50">تقييمات سيئة (نجمة أو نجمتين)</p>
            <p className={`num-zap mt-1 text-3xl ${s.bad ? 'text-rose-600' : ''}`}>{s.bad || 0}</p>
            <p className="mt-1 text-xs text-navy/50">بيوصلك إشعار فوري مع كل تقييم سيء</p>
          </div>
        </div>
      )}

      {couriers.length > 0 && (
        <div className="rounded-3xl bg-white p-5 shadow-soft">
          <p className="mb-3 text-sm font-extrabold">عمال التوصيل حسب التقييم (آخر 90 يوم)</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {couriers.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setCourier(courier === String(c.id) ? '' : String(c.id))}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-start ${courier === String(c.id) ? 'border-brand bg-brand-50' : 'border-navy/10'}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.name}</span>
                  <Stars n={Math.round(c.ratingAvg)} />
                  <span className={`num-zap text-sm ${c.ratingAvg < 3.5 ? 'text-rose-600' : ''}`}>{c.ratingAvg.toFixed(1)}</span>
                  <span className="text-[11px] text-navy/45">({c.ratingCount})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {[
          ['all', 'كل التقييمات'],
          ['low', 'الشكاوى (3 نجوم وأقل)'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === id ? 'bg-navy text-white' : 'bg-white text-navy/60 shadow-soft'}`}>
            {label}
          </button>
        ))}
        {courier && (
          <button onClick={() => setCourier('')} className="rounded-full bg-brand-50 px-4 py-2 text-sm font-bold text-brand">
            {couriers.find((c) => String(c.id) === courier)?.name} ✕
          </button>
        )}
        <button onClick={load} aria-label="تحديث" className="ms-auto flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-soft">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      {!data ? (
        <div className="flex justify-center py-12 text-brand">
          <LoaderCircle size={28} className="animate-spin" />
        </div>
      ) : !data.items.length ? (
        <p className="rounded-3xl bg-white py-14 text-center text-sm text-navy/50 shadow-soft">
          {filter === 'low' ? 'ما في شكاوى. ممتاز!' : 'لسا ما في تقييمات. بعد ما يوصل الطلب، الزبون بيطلعلو سؤال يقيّم التوصيل.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((r) => (
            <li key={r.id}>
              <button onClick={() => onOpenOrder?.({ id: r.id })} className={`w-full rounded-3xl bg-white p-4 text-start shadow-soft ${r.stars <= 2 ? 'ring-2 ring-rose-200' : ''}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars n={r.stars} size={16} />
                  <span className="text-sm font-extrabold">{r.courierName || 'عامل توصيل'}</span>
                  <span className="text-xs text-navy/45">قيّمه {r.customer}</span>
                  <span className="ms-auto flex items-center gap-2 text-xs text-navy/45">
                    <span className="num-zap">{r.number}</span>
                    <span>{when(r.at)}</span>
                  </span>
                </div>
                {r.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.tags.map((t) => (
                      <span key={t} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${BAD.has(t) ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {RATING_TAG_AR[t] || t}
                      </span>
                    ))}
                  </div>
                )}
                {r.note && <p className="mt-2 rounded-2xl bg-navy-50 px-3 py-2 text-sm text-navy/80">«{r.note}»</p>}
              </button>
            </li>
          ))}
          {more && (
            <li>
              <button onClick={loadMore} className="w-full py-3 text-sm font-bold text-brand">
                عرض أقدم
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
