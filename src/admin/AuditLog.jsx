import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, History, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'
import { inputCls } from './shared'

const KEY_AR = {
  amount: 'المبلغ', note: 'ملاحظة', name: 'الاسم', phone: 'الرقم', status: 'الحالة', reason: 'السبب', items: 'الطلب',
  address: 'العنوان', notes: 'ملاحظات', deliveryFee: 'أجرة التوصيل', blocked: 'موقوف', active: 'فعّال', ids: 'الطلبات',
  title: 'العنوان', body: 'النص', extra: 'الزيادة', zones: 'المناطق', peak: 'الذروة', maintenance: 'الصيانة', code: 'الكود',
  category: 'النوع', storeName: 'المحل', location: 'الموقع', floor: 'الطابق', adjust: 'تعديل يدوي', online: 'متاح', supervisor: 'مشرف',
}
const CAT_AR = { any: 'أي محل', restaurants: 'مطعم', supermarket: 'سوبرماركت', pharmacy: 'صيدلية', library: 'مكتبة', diesel: 'مازوت', gas: 'غاز', other: 'غير ذلك' }

const dayLabel = (iso) => {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date(Date.now() - 864e5)
  if (d.toDateString() === today.toDateString()) return 'اليوم'
  if (d.toDateString() === y.toDateString()) return 'مبارح'
  return d.toLocaleDateString('ar-SY-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })
}
const timeLabel = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function show(v, k) {
  if (k === 'category') return CAT_AR[v] || v
  if (k === 'location' && v && typeof v === 'object' && Number.isFinite(v.lat))
    return (
      <a href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" rel="noopener noreferrer" className="text-brand underline">
        افتح عالخريطة
      </a>
    )
  if (v === true) return 'نعم'
  if (v === false) return 'لا'
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// سجل كل التعديلات يلي عملها الفريق بلوحة الإدارة
export default function AuditLog() {
  const [items, setItems] = useState(null)
  const [people, setPeople] = useState([])
  const [more, setMore] = useState(false)
  const [staff, setStaff] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  const params = useCallback(
    (before) => {
      const p = new URLSearchParams({ limit: '100' })
      if (staff) p.set('staff', staff)
      if (query) p.set('q', query)
      if (before) p.set('before', before)
      return p.toString()
    },
    [staff, query]
  )

  const load = useCallback(async () => {
    try {
      const d = await adminApi(`/audit?${params()}`)
      setItems(d.items)
      setPeople(d.people)
      setMore(d.more)
      setError('')
    } catch (err) {
      setError(adminErrorText(err))
    }
  }, [params])

  useEffect(() => {
    setItems(null)
    load()
  }, [load])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const d = await adminApi(`/audit?${params(items[items.length - 1].id)}`)
      setItems((x) => [...x, ...d.items])
      setMore(d.more)
    } catch (err) {
      setError(adminErrorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  let lastDay = ''
  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-4 text-sm text-navy/60">كل تعديل بيعمله أي حدا من الفريق بلوحة الإدارة بينسجّل هون: مين عمله، وشو، وإيمتى. ما حدا فيه يعدّل أو يمسح هالسجل.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <select value={staff} onChange={(e) => setStaff(e.target.value)} className={`${inputCls.replace('w-full', '')} w-full sm:w-56`} aria-label="الشخص">
          <option value="">كل الفريق</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <form onSubmit={(e) => (e.preventDefault(), setQuery(q.trim()))} className="relative min-w-[12rem] flex-1">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-navy/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setQuery(q.trim())} placeholder="دوّر: اسم عامل توصيل، رقم طلب، شحن…" className={`${inputCls} ps-9`} />
        </form>
        <button onClick={load} aria-label="تحديث" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-soft">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <p className="mb-3 text-sm font-bold text-rose-600">{error}</p>}
      {!items ? (
        <div className="flex justify-center py-16 text-brand">
          <LoaderCircle size={28} className="animate-spin" />
        </div>
      ) : !items.length ? (
        <div className="rounded-3xl bg-white py-16 text-center text-sm text-navy/50 shadow-soft">
          <History size={28} className="mx-auto mb-2 text-navy/25" />
          {query || staff ? 'ما في نتائج لهالبحث' : 'لسا ما في نشاط مسجّل. أي تعديل جديد رح يبين هون.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white shadow-soft">
          {items.map((it) => {
            const day = dayLabel(it.at)
            const head = day !== lastDay
            lastDay = day
            const isOpen = open === it.id
            const entries = it.detail && typeof it.detail === 'object' ? Object.entries(it.detail).filter(([k, v]) => k !== 'clientKey' && v !== '' && v !== null && v !== undefined) : []
            return (
              <div key={it.id}>
                {head && <div className="bg-navy-50 px-5 py-2 text-xs font-extrabold text-navy/60">{day}</div>}
                <button
                  onClick={() => setOpen(isOpen ? null : it.id)}
                  disabled={!entries.length}
                  className="flex w-full items-start gap-3 border-b border-navy/5 px-5 py-3 text-start hover:bg-navy-50/50 disabled:cursor-default"
                >
                  <span className="num-zap w-12 shrink-0 pt-0.5 text-xs font-bold text-navy/45">{timeLabel(it.at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-relaxed">{it.action}</span>
                    <span className="mt-0.5 block text-xs text-navy/50">{it.actor}</span>
                  </span>
                  {entries.length > 0 && <ChevronDown size={16} className={`mt-1 shrink-0 text-navy/35 transition ${isOpen ? 'rotate-180' : ''}`} />}
                </button>
                {isOpen && (
                  <dl className="grid gap-x-4 gap-y-1.5 border-b border-navy/5 bg-navy-50/40 px-5 py-3 text-xs sm:grid-cols-[9rem_1fr]">
                    {entries.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="font-bold text-navy/55">{KEY_AR[k] || k}</dt>
                        <dd className="break-words font-en text-navy/80" dir="auto">
                          {show(v, k)}
                        </dd>
                      </div>
                    ))}
                    {it.ip && (
                      <div className="contents">
                        <dt className="font-bold text-navy/55">من جهاز</dt>
                        <dd className="font-en text-navy/60" dir="ltr">
                          {it.ip}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            )
          })}
          {more && (
            <button onClick={loadMore} disabled={loadingMore} className="flex w-full items-center justify-center gap-2 py-4 text-sm font-bold text-brand">
              {loadingMore && <LoaderCircle size={16} className="animate-spin" />} عرض أقدم
            </button>
          )}
        </div>
      )}
    </div>
  )
}
