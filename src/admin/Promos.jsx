import { useCallback, useEffect, useState } from 'react'
import { Gift, LoaderCircle, Plus, Star, Trash2, X } from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'
import { inputCls, money } from './shared'

const Card = ({ children, className = '' }) => <div className={`rounded-3xl bg-white p-5 shadow-soft ${className}`}>{children}</div>
const KIND = { free: 'توصيل مجاني', amount: 'حسم مبلغ من التوصيل', percent: 'حسم نسبة من التوصيل' }
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10) : '')
const fromLocal = (v) => (v ? new Date(`${v}T23:59:00+03:00`).toISOString() : null)

/** كودات الحسم + نظام النقاط */
export default function Promos() {
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setList((await adminApi('/promos')).promos)
    } catch (err) {
      setError(adminErrorText(err))
    }
  }, [])
  useEffect(() => void load(), [load])

  const toggle = async (p) => {
    await adminApi(`/promos/${p.id}`, { method: 'PATCH', body: { active: !p.active } }).catch((e) => setError(adminErrorText(e)))
    load()
  }
  const remove = async (p) => {
    if (!window.confirm(`حذف الكود ${p.code}؟`)) return
    await adminApi(`/promos/${p.id}`, { method: 'DELETE' }).catch((e) => setError(adminErrorText(e)))
    load()
  }

  return (
    <div className="space-y-5">
      <PointsCard />
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold">
              <Gift size={18} className="text-brand" /> كودات الحسم
            </h2>
            <p className="mt-1 text-xs text-navy/50">الزبون بيكتب الكود بآخر خطوة من الطلب، والحسم بينزل من أجرة التوصيل.</p>
          </div>
          <button
            onClick={() => setEdit({ code: '', kind: 'free', value: 0, firstOrderOnly: true, maxUses: 0, perCustomer: 1, expiresAt: null, note: '', active: true })}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-xs font-bold text-white"
          >
            <Plus size={16} /> كود جديد
          </button>
        </div>
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>}
        {!list ? (
          <div className="flex justify-center py-8 text-brand">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-navy/40">ما في كودات لسا. مثال: كود "AHLAN" توصيل مجاني لأول طلب.</p>
        ) : (
          <ul className="mt-4 divide-y divide-navy/5">
            {list.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center gap-3 py-3 ${p.active ? '' : 'opacity-50'}`}>
                <span dir="ltr" className="rounded-lg bg-lime px-2.5 py-1 font-en text-sm font-black tracking-wider text-navy">
                  {p.code}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <b>{p.kind === 'free' ? KIND.free : p.kind === 'amount' ? `حسم ${money(p.value)}` : `حسم ${p.value}%`}</b>
                  <span className="block text-xs text-navy/50">
                    {[
                      p.firstOrderOnly && 'لأول طلب بس',
                      `استُعمل ${p.uses}${p.maxUses ? ` من ${p.maxUses}` : ''} مرة`,
                      p.expiresAt && `لحد ${toLocal(p.expiresAt)}`,
                      p.note,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <button onClick={() => toggle(p)} className="rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs font-bold">
                  {p.active ? 'إيقاف' : 'تشغيل'}
                </button>
                <button onClick={() => setEdit(p)} className="rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs font-bold">
                  تعديل
                </button>
                <button onClick={() => remove(p)} aria-label="حذف" className="rounded-lg bg-rose-50 p-1.5 text-rose-600">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {edit && <PromoEditor initial={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} />}
    </div>
  )
}

const L = ({ label, children, hint }) => (
  <label className="block">
    <span className="text-xs font-bold text-navy/60">{label}</span>
    <div className="mt-1">{children}</div>
    {hint && <span className="mt-1 block text-[11px] text-navy/40">{hint}</span>}
  </label>
)

function PromoEditor({ initial, onClose, onSaved }) {
  const [p, setP] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (x) => setP((v) => ({ ...v, ...x }))
  const save = async () => {
    setBusy(true)
    setError('')
    const body = {
      code: p.code,
      kind: p.kind,
      value: p.kind === 'free' ? 0 : Number(p.value) || 0,
      firstOrderOnly: p.firstOrderOnly,
      maxUses: Number(p.maxUses) || 0,
      perCustomer: Number(p.perCustomer) || 1,
      expiresAt: p.expiresAt,
      note: p.note,
      active: p.active,
    }
    try {
      if (initial.id) await adminApi(`/promos/${initial.id}`, { method: 'PATCH', body })
      else await adminApi('/promos', { method: 'POST', body })
      onSaved()
    } catch (err) {
      setError(err.code === 'CODE_TAKEN' ? 'هالكود موجود من قبل' : err.code === 'INVALID' ? 'تأكد من الكود (3 إلى 20 حرف أو رقم) والأرقام' : adminErrorText(err))
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-navy/60 p-4" onClick={onClose}>
      <div className="my-auto w-full max-w-lg rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{initial.id ? 'تعديل الكود' : 'كود حسم جديد'}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <L label="الكود" hint="أحرف إنكليزي أو أرقام، مثال: AHLAN">
            <input dir="ltr" value={p.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} maxLength={20} className={`${inputCls} font-en font-bold tracking-wider`} />
          </L>
          <L label="نوع الحسم">
            <select value={p.kind} onChange={(e) => set({ kind: e.target.value })} className={inputCls}>
              {Object.entries(KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </L>
          {p.kind !== 'free' && (
            <L label={p.kind === 'amount' ? 'قيمة الحسم (ل.س)' : 'النسبة %'}>
              <input type="number" min={0} max={p.kind === 'percent' ? 100 : undefined} value={p.value} onChange={(e) => set({ value: e.target.value })} className={inputCls} />
            </L>
          )}
          <L label="عدد الاستعمالات الكلي" hint="0 = بلا حد">
            <input type="number" min={0} value={p.maxUses} onChange={(e) => set({ maxUses: e.target.value })} className={inputCls} />
          </L>
          <L label="كم مرة لكل زبون">
            <input type="number" min={1} value={p.perCustomer} onChange={(e) => set({ perCustomer: e.target.value })} className={inputCls} />
          </L>
          <L label="ينتهي بتاريخ (اختياري)">
            <input type="date" value={toLocal(p.expiresAt)} onChange={(e) => set({ expiresAt: fromLocal(e.target.value) })} className={inputCls} />
          </L>
          <L label="ملاحظة (اختياري)">
            <input value={p.note} maxLength={120} onChange={(e) => set({ note: e.target.value })} className={inputCls} />
          </L>
          <label className="flex items-center gap-2 self-end rounded-xl bg-navy-50 px-3 py-3 text-sm font-bold">
            <input type="checkbox" checked={p.firstOrderOnly} onChange={(e) => set({ firstOrderOnly: e.target.checked })} />
            لأول طلب بس
          </label>
        </div>
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>}
        <button onClick={save} disabled={busy || !p.code} className="mt-5 flex w-full items-center justify-center rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-50">
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'حفظ'}
        </button>
      </div>
    </div>
  )
}

function PointsCard() {
  const [cfg, setCfg] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    adminApi('/points').then(setCfg).catch((e) => setError(adminErrorText(e)))
  }, [])
  const save = async () => {
    try {
      const d = await adminApi('/points', { method: 'PUT', body: { perOrder: Number(cfg.perOrder), forFree: Number(cfg.forFree) } })
      setCfg((c) => ({ ...c, ...d }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(adminErrorText(e))
    }
  }
  if (!cfg) return null
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-extrabold">
        <Star size={18} className="fill-lime text-navy" /> نظام النقاط
      </h2>
      <p className="mt-1 text-xs text-navy/50">مع كل طلب بيوصل، الزبون بياخد نقاط. لما يجمع العدد المطلوب، بيستعملها لتوصيل مجاني. حط 0 لتوقيف النظام.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-bold text-navy/60">نقاط لكل طلب واصل</span>
          <input type="number" min={0} value={cfg.perOrder} onChange={(e) => setCfg({ ...cfg, perOrder: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-navy/60">نقاط للتوصيل المجاني</span>
          <input type="number" min={0} value={cfg.forFree} onChange={(e) => setCfg({ ...cfg, forFree: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <button onClick={save} className="self-end rounded-xl bg-navy py-2.5 text-sm font-bold text-white">
          {saved ? '✓ انحفظ' : 'حفظ'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
      {cfg.top?.length > 0 && (
        <div className="mt-4 border-t border-navy/5 pt-3">
          <p className="text-xs font-bold text-navy/50">أكتر الزبائن نقاط</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {cfg.top.map((c) => (
              <li key={c.id} className="rounded-full bg-navy-50 px-3 py-1 text-xs">
                {c.name} · <b>{c.points}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
