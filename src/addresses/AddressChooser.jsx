import { Check, Home, MapPinPlus, Star } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { LABELS, useAddresses } from './AddressesProvider'

/** يملأ بيانات الطلب من عنوان محفوظ */
export const fromAddress = (a) => ({
  addressId: a.id,
  location: a.location,
  address: a.details,
  floor: a.floor,
  elevator: a.elevator,
})

/** اختيار عنوان محفوظ أو "عنوان جديد" — بيظهر بس إذا عند الزبون عناوين */
export function AddressChooser({ selectedId, onSelect, onNew }) {
  const { addresses } = useAddresses()
  const { lang, formatNumber } = useLang()
  const ar = lang === 'ar'
  if (!addresses.length) return null
  return (
    <div className="space-y-2">
      {addresses.map((a) => {
        const on = selectedId === a.id
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-start transition active:scale-[0.98] ${
              on ? 'border-brand bg-brand-50' : 'border-navy/10'
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-brand text-white' : 'bg-navy/5 text-navy/50'}`}>
              {on ? <Check size={19} strokeWidth={3} /> : <Home size={19} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-extrabold">
                {a.label}
                {a.isDefault && <Star size={12} className="fill-lime text-lime-600" />}
              </span>
              <span className="block truncate text-xs text-navy/55">
                {[a.details, a.floor ? `${ar ? 'الطابق' : 'Floor'} ${formatNumber(a.floor)}` : ar ? 'أرضي' : 'Ground'].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={onNew}
        className={`flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-3 text-start text-sm font-bold transition active:scale-[0.98] ${
          selectedId === null ? 'border-brand bg-brand-50 text-brand' : 'border-navy/15 text-navy/60'
        }`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy/5">
          <MapPinPlus size={19} />
        </span>
        {ar ? 'عنوان جديد' : 'New address'}
      </button>
    </div>
  )
}

/** "احفظ هالعنوان" بعد تحديد موقع جديد */
export function SaveAddressBox({ save, label, onChange }) {
  const { lang } = useLang()
  const ar = lang === 'ar'
  return (
    <div className="rounded-2xl bg-navy-50 p-3">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
        <input type="checkbox" checked={save} onChange={(e) => onChange({ saveAddress: e.target.checked })} className="h-5 w-5 accent-brand" />
        {ar ? 'احفظ هالعنوان لطلباتي الجاية' : 'Save this address for next time'}
      </label>
      {save && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 ps-7">
          {LABELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => onChange({ saveLabel: l })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${label === l ? 'bg-brand text-white' : 'bg-white text-navy/60'}`}
            >
              {l}
            </button>
          ))}
          <input
            value={LABELS.includes(label) ? '' : label}
            onChange={(e) => onChange({ saveLabel: e.target.value.slice(0, 30) })}
            placeholder={ar ? 'اسم تاني…' : 'Other…'}
            className="w-24 rounded-full bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      )}
    </div>
  )
}

