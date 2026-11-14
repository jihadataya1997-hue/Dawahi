import { useState } from 'react'
import { ArrowUpDown, Building2, Home, LoaderCircle, Minus, Plus, Star, Trash2, X } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import LocationPicker, { LocationField } from '../components/LocationPicker'
import { LABELS, useAddresses } from './AddressesProvider'

/** قسم "عناويني" بصفحة الحساب: إضافة، تعديل، تعيين الافتراضي، حذف */
export default function MyAddresses() {
  const { addresses, update, remove } = useAddresses()
  const { lang, formatNumber } = useLang()
  const ar = lang === 'ar'
  const [editing, setEditing] = useState(null) // null | 'new' | address
  const [busy, setBusy] = useState(null)

  const act = async (id, fn) => {
    setBusy(id)
    try {
      await fn()
    } catch {
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mx-4 mt-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold">{ar ? 'عناويني' : 'My addresses'}</h2>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 text-xs font-bold text-brand">
          <Plus size={15} /> {ar ? 'أضف عنوان' : 'Add'}
        </button>
      </div>
      {!addresses.length ? (
        <button onClick={() => setEditing('new')} className="w-full rounded-3xl border-2 border-dashed border-navy/15 bg-white p-5 text-center text-xs text-navy/55">
          {ar ? 'احفظ عنوان بيتك مرة وحدة، وبيتعبّى لحاله بكل طلب.' : 'Save your home address once and it fills in automatically.'}
        </button>
      ) : (
        <ul className="divide-y divide-navy/5 overflow-hidden rounded-3xl bg-white shadow-soft">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => setEditing(a)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
                  <Home size={17} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    {a.label}
                    {a.isDefault && (
                      <span className="rounded-full bg-lime px-1.5 py-0.5 text-[9px] font-black text-navy">{ar ? 'الافتراضي' : 'Default'}</span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-navy/50">
                    {[a.details, a.floor ? `${ar ? 'الطابق' : 'Floor'} ${formatNumber(a.floor)}` : ar ? 'أرضي' : 'Ground'].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
              {busy === a.id ? (
                <LoaderCircle size={18} className="animate-spin text-brand" />
              ) : (
                <>
                  {!a.isDefault && (
                    <button onClick={() => act(a.id, () => update(a.id, { makeDefault: true }))} aria-label={ar ? 'اجعله الافتراضي' : 'Make default'} className="p-1.5 text-navy/35">
                      <Star size={17} />
                    </button>
                  )}
                  <button onClick={() => act(a.id, () => remove(a.id))} aria-label={ar ? 'حذف' : 'Delete'} className="p-1.5 text-rose-400">
                    <Trash2 size={17} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <AddressEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function AddressEditor({ initial, onClose }) {
  const { add, update, addresses } = useAddresses()
  const { lang, formatNumber } = useLang()
  const ar = lang === 'ar'
  const [f, setF] = useState(
    initial
      ? { label: initial.label, location: initial.location, details: initial.details, floor: initial.floor, elevator: initial.elevator }
      : { label: addresses.length ? '' : 'البيت', location: null, details: '', floor: 0, elevator: true }
  )
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (p) => {
    setError('')
    setF((x) => ({ ...x, ...p }))
  }

  const save = async () => {
    if (!f.label.trim()) return setError(ar ? 'اكتب اسم للعنوان' : 'Name this address')
    if (!f.location) return setError(ar ? 'حدّد الموقع على الخريطة' : 'Pin the location on the map')
    setBusy(true)
    try {
      if (initial) await update(initial.id, { ...f, label: f.label.trim() })
      else await add({ ...f, label: f.label.trim() })
      onClose()
    } catch {
      setError(ar ? 'ما انحفظ، جرّب مرة تانية' : 'Could not save, try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col justify-end bg-navy/50 animate-fade-in" onClick={onClose}>
      <div className="pb-safe max-h-[92%] overflow-y-auto rounded-t-[2rem] bg-white p-5 animate-sheet-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{initial ? (ar ? 'تعديل العنوان' : 'Edit address') : ar ? 'عنوان جديد' : 'New address'}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/5">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-bold">{ar ? 'اسم العنوان' : 'Name'}</p>
            <div className="flex flex-wrap gap-1.5">
              {LABELS.map((l) => (
                <button key={l} onClick={() => set({ label: l })} className={`rounded-full px-3 py-1.5 text-xs font-bold ${f.label === l ? 'bg-brand text-white' : 'bg-navy/5 text-navy/60'}`}>
                  {l}
                </button>
              ))}
              <input
                value={LABELS.includes(f.label) ? '' : f.label}
                onChange={(e) => set({ label: e.target.value.slice(0, 30) })}
                placeholder={ar ? 'اسم تاني…' : 'Other…'}
                className="w-28 rounded-full bg-navy/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
          <LocationField value={f.location} onOpen={() => setPicker(true)} />
          <textarea
            rows={2}
            value={f.details}
            onChange={(e) => set({ details: e.target.value })}
            placeholder={ar ? 'تفاصيل: اسم البناية، جانب شو، لون الباب…' : 'Details: building, landmark…'}
            className="w-full resize-none rounded-2xl border border-navy/10 bg-navy-50 p-3.5 text-sm outline-none focus:border-brand focus:bg-white"
          />
          <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-2">
            <button onClick={() => set({ floor: Math.max(0, f.floor - 1) })} aria-label="-" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-soft">
              <Minus size={18} />
            </button>
            <span className="flex items-center gap-2 font-extrabold">
              <Building2 size={18} className="text-brand" />
              {f.floor === 0 ? (ar ? 'أرضي' : 'Ground') : `${ar ? 'الطابق' : 'Floor'} ${formatNumber(f.floor)}`}
            </span>
            <button onClick={() => set({ floor: Math.min(15, f.floor + 1) })} aria-label="+" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-soft">
              <Plus size={18} />
            </button>
          </div>
          {f.floor > 0 && (
            <label className="flex items-center gap-2.5 rounded-2xl bg-navy-50 p-3 text-sm font-bold">
              <input type="checkbox" checked={f.elevator} onChange={(e) => set({ elevator: e.target.checked })} className="h-5 w-5 accent-brand" />
              <ArrowUpDown size={16} className="text-brand" />
              {ar ? 'في مصعد' : 'Has elevator'}
            </label>
          )}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
          <button onClick={save} disabled={busy} className="btn-zap flex w-full items-center justify-center bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-60">
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : ar ? 'احفظ العنوان' : 'Save address'}
          </button>
        </div>
      </div>
      {/* ما نخلي كبسات الخريطة توصل للخلفية وتسكّر النافذة */}
      <div onClick={(e) => e.stopPropagation()}>
      <LocationPicker
        open={picker}
        initial={f.location}
        onClose={() => setPicker(false)}
        onConfirm={(loc) => {
          set({ location: loc })
          setPicker(false)
        }}
      />
      </div>
    </div>
  )
}
