import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, Plus, Wallet, X } from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'
import { inputCls, money } from './shared'

const day = (offset = 0) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10)
function ranges() {
  const t = new Date(Date.now() + 3 * 3600e3)
  const dow = (t.getUTCDay() + 1) % 7 // السبت أول الأسبوع
  return [
    ['اليوم', day(), day()],
    ['مبارح', day(-1), day(-1)],
    ['هالأسبوع', day(-dow), day()],
    ['هالشهر', `${day().slice(0, 8)}01`, day()],
  ]
}
const fmtDate = (iso) =>
  new Date(iso).toLocaleString('ar-SY-u-nu-latn', { timeZone: 'Asia/Damascus', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

/** الحسابات: شو اجانا، وحساب كل عامل توصيل ورصيده */
export default function Accounts() {
  const [range, setRange] = useState([day(), day()])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [topup, setTopup] = useState(null)
  const [ledger, setLedger] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await adminApi(`/accounts?from=${range[0]}&to=${range[1]}`))
      setError('')
    } catch (e) {
      setError(adminErrorText(e))
    }
  }, [range])
  useEffect(() => void load(), [load])

  if (!data)
    return (
      <div className="flex justify-center py-12 text-brand">
        {error ? <p className="text-sm font-bold text-rose-600">{error}</p> : <LoaderCircle className="animate-spin" />}
      </div>
    )
  const t = data.totals

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {ranges().map(([label, a, b]) => (
          <button
            key={label}
            onClick={() => setRange([a, b])}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${range[0] === a && range[1] === b ? 'bg-brand text-white' : 'bg-white shadow-soft'}`}
          >
            {label}
          </button>
        ))}
        <span className="ms-auto flex items-center gap-1 text-xs">
          <input type="date" value={range[0]} max={range[1]} onChange={(e) => setRange([e.target.value, range[1]])} className="rounded-lg border border-navy/10 px-2 py-1.5" />
          <span>←</span>
          <input type="date" value={range[1]} min={range[0]} onChange={(e) => setRange([range[0], e.target.value])} className="rounded-lg border border-navy/10 px-2 py-1.5" />
        </span>
      </div>
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl bg-navy p-5 text-white sm:col-span-2 lg:col-span-1">
          <p className="text-sm font-bold text-white/70">أرباحك (عمولة التطبيق)</p>
          <p className="num-zap mt-1 text-4xl text-lime">{money(t.commission)}</p>
          <p className="mt-1 text-xs text-white/60">
            من {t.orders} طلب واصل × {money(data.config.commission)}
            {t.discounts ? ` · ناقص حسومات ${money(t.discounts)}` : ''}
          </p>
        </div>
        <Kpi label="طلبات واصلة" value={t.orders} plain />
        <Kpi label="مجموع أجور التوصيل" value={money(t.fees)} sub={`حصة السائقين ${money(t.couriersShare)}`} />
        <Kpi label="ديون عند السائقين (هلق)" value={money(t.owed)} sub={`شحن رصيد بالفترة ${money(t.topups)}`} alert={t.owed > 0} />
      </div>

      <Settings config={data.config} onSaved={load} />

      <section className="rounded-3xl bg-white shadow-soft">
        <h2 className="flex items-center gap-2 border-b border-navy/5 px-5 py-4 font-extrabold">
          <Wallet size={18} className="text-brand" /> حساب كل عامل توصيل
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-navy/50">
              <tr className="border-b border-navy/5">
                <th className="px-4 py-2 text-start font-bold">العامل</th>
                <th className="px-3 py-2 text-start font-bold">طلبات</th>
                <th className="px-3 py-2 text-start font-bold">أجور حصّلها</th>
                <th className="px-3 py-2 text-start font-bold">عمولتك</th>
                <th className="px-3 py-2 text-start font-bold">الرصيد هلق</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {data.couriers.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <b className="block">{c.name}</b>
                    <span dir="ltr" className="font-en text-[11px] text-navy/45">{c.phone}</span>
                  </td>
                  <td className="px-3 py-3 font-bold">{c.delivered}</td>
                  <td className="px-3 py-3">{money(c.fees)}</td>
                  <td className="px-3 py-3 font-bold text-brand">{money(c.commission)}</td>
                  <td className="px-3 py-3">
                    <span className={`font-black ${c.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(c.balance)}</span>
                    <span className="block text-[11px] text-navy/45">
                      {c.balance < 0 ? `بدك منه ${money(-c.balance)}` : data.config.commission ? `بيكفي ${Math.floor(c.balance / data.config.commission)} طلب` : ''}
                    </span>
                    {data.config.enabled && !c.canWork && <span className="mt-0.5 inline-block rounded bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700">ما بتوصله طلبات</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setTopup(c)} className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-bold text-white">
                        <Plus size={13} /> شحن
                      </button>
                      <button onClick={() => setLedger(c)} className="rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs font-bold">
                        السجل
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {topup && <TopupDialog courier={topup} onClose={() => setTopup(null)} onDone={() => (setTopup(null), load())} />}
      {ledger && <LedgerDialog courier={ledger} onClose={() => setLedger(null)} />}
    </div>
  )
}

function Kpi({ label, value, sub, alert, plain }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-soft">
      <p className="text-sm font-bold text-navy/55">{label}</p>
      <p className={`num-zap mt-1 text-3xl ${alert ? 'text-rose-600' : plain ? 'text-navy' : 'text-brand'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-navy/50">{sub}</p>}
    </div>
  )
}

function Settings({ config, onSaved }) {
  const [commission, setCommission] = useState(String(config.commission))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const save = async (body) => {
    setBusy(true)
    try {
      await adminApi('/accounts/settings', { method: 'PUT', body })
      setMsg('✓ انحفظ')
      setTimeout(() => setMsg(''), 2000)
      onSaved()
    } catch (e) {
      setMsg(adminErrorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="grid gap-4 rounded-3xl bg-white p-5 shadow-soft md:grid-cols-2">
      <div>
        <h3 className="font-extrabold">عمولة التطبيق من كل طلب</h3>
        <p className="mt-1 text-xs text-navy/50">بتنخصم من رصيد العامل لما يوصل الطلب، والباقي من أجرة التوصيل إله.</p>
        <div className="mt-3 flex gap-2">
          <input inputMode="numeric" value={commission} onChange={(e) => setCommission(e.target.value.replace(/\D/g, ''))} className={`${inputCls} max-w-[10rem]`} />
          <button disabled={busy} onClick={() => save({ commission: Number(commission) || 0 })} className="rounded-xl bg-navy px-4 text-sm font-bold text-white">
            حفظ
          </button>
          {msg && <span className="self-center text-xs font-bold text-brand">{msg}</span>}
        </div>
      </div>
      <div>
        <h3 className="font-extrabold">نظام الرصيد المسبق</h3>
        <p className="mt-1 text-xs text-navy/50">
          لما يكون شغّال: العامل لازم يكون رصيده بيكفي لعمولة طلب، وإلا ما بيوصله طلبات لحتى يشحن. اشحن رصيد السائقين قبل ما تشغّله.
        </p>
        <button
          disabled={busy}
          onClick={() => save({ enabled: !config.enabled })}
          className={`mt-3 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-extrabold ${config.enabled ? 'bg-emerald-600 text-white' : 'bg-navy-50'}`}
        >
          {config.enabled ? 'شغّال: يلي رصيده خلصان ما بيوصله طلبات' : 'موقّف: الكل بيوصله طلبات (والرصيد بيصير بالسالب)'}
          <span className={`relative h-6 w-11 rounded-full ${config.enabled ? 'bg-white/30' : 'bg-navy/15'}`}>
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow ${config.enabled ? 'start-6' : 'start-1'}`} />
          </span>
        </button>
      </div>
    </section>
  )
}

function TopupDialog({ courier, onClose, onDone }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [minus, setMinus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    const n = Number(amount)
    if (!n) return setError('اكتب المبلغ')
    setBusy(true)
    try {
      await adminApi(`/couriers/${courier.id}/topup`, { method: 'POST', body: { amount: minus ? -n : n, note, adjust: minus } })
      onDone()
    } catch (err) {
      setError(adminErrorText(err))
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">شحن رصيد {courier.name}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-navy/50">الرصيد هلق: {money(courier.balance)}</p>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-navy-50 p-1 text-xs font-bold">
          <button type="button" onClick={() => setMinus(false)} className={`rounded-lg py-2 ${!minus ? 'bg-white shadow-sm' : ''}`}>
            شحن (دفع مصاري)
          </button>
          <button type="button" onClick={() => setMinus(true)} className={`rounded-lg py-2 ${minus ? 'bg-white shadow-sm' : ''}`}>
            خصم / تصحيح
          </button>
        </div>
        <input autoFocus inputMode="numeric" placeholder="المبلغ بالليرة" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} className={`${inputCls} mt-3 text-lg font-bold`} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[1000, 2500, 5000, 10000].map((v) => (
            <button key={v} type="button" onClick={() => setAmount(String(v))} className="rounded-lg bg-navy-50 px-2.5 py-1 text-xs font-bold">
              {money(v)}
            </button>
          ))}
        </div>
        <input placeholder="ملاحظة (اختياري)" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={`${inputCls} mt-3`} />
        {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
        <button disabled={busy} className={`mt-4 flex w-full items-center justify-center rounded-2xl py-3.5 text-sm font-extrabold text-white ${minus ? 'bg-rose-600' : 'bg-brand'}`}>
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : minus ? 'خصم من الرصيد' : 'شحن الرصيد'}
        </button>
      </form>
    </div>
  )
}

function LedgerDialog({ courier, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    adminApi(`/couriers/${courier.id}/ledger`).then((d) => setRows(d.entries)).catch(() => setRows([]))
  }, [courier.id])
  const KIND = { topup: 'شحن', commission: 'عمولة', adjust: 'تصحيح' }
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-navy/60 p-4" onClick={onClose}>
      <div className="my-auto w-full max-w-lg rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">سجل رصيد {courier.name}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>
        {!rows ? (
          <div className="flex justify-center py-8 text-brand">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : !rows.length ? (
          <p className="py-8 text-center text-sm text-navy/45">ما في حركات لهلق</p>
        ) : (
          <ul className="mt-3 max-h-[60vh] divide-y divide-navy/5 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <b>{KIND[r.kind]}</b>
                  {r.number && <span className="ms-1 text-xs text-navy/50">{r.number}</span>}
                  <span className="block text-[11px] text-navy/45">
                    {fmtDate(r.createdAt)}
                    {r.note ? ` · ${r.note}` : ''}
                    {r.actor ? ` · ${r.actor}` : ''}
                  </span>
                </span>
                <span className="text-end">
                  <b className={r.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                    {r.amount > 0 ? '+' : ''}
                    {money(r.amount)}
                  </b>
                  <span className="block text-[11px] text-navy/45">الرصيد {money(r.balanceAfter)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
