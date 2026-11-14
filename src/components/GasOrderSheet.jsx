import { useEffect, useState } from 'react'
import {
  ArrowUpDown,
  Building2,
  Check,
  ChevronLeft,
  Flame,
  Info,
  LoaderCircle,
  Minus,
  PackagePlus,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { useOrders } from '../orders/OrdersProvider'
import { useAppConfig } from '../config/AppConfigProvider'
import CustomerPushCard from './CustomerPushCard'
import PromoBox from './PromoBox'
import { newClientKey } from '../api'
import { errorText } from '../i18n/errorText'
import { Choice, Field, RowChoice, Stepper, Stepper2 } from './ui'
import LocationPicker, { LocationField, loadLastLocation } from './LocationPicker'
import { useAddresses } from '../addresses/AddressesProvider'
import { AddressChooser, SaveAddressBox, fromAddress } from '../addresses/AddressChooser'

// ⚙️ الأسعار تأتي من السيرفر (جدول settings) — تتغير من لوحة التحكم لاحقاً

const initial = () => ({ qty: 1, type: 'swap', location: loadLastLocation(), floor: 0, elevator: true, notes: '', address: '', addressId: null, saveAddress: true, saveLabel: 'البيت' })

export default function GasOrderSheet({ open, onClose, onConfirmed }) {
  const { t, lang, formatNumber } = useLang()
  const g = (k) => t(`gas.${k}`)
  const [step, setStep] = useState(0)
  const [order, setOrder] = useState(initial)
  const [perk, setPerk] = useState({ promoCode: '', usePoints: false, discount: 0 })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle') // idle | searching | found
  const { createOrder } = useOrders()
  const { pricing: PRICING, money, peak } = useAppConfig()
  const { addresses, defaultAddress, add: addAddress } = useAddresses()
  const [clientKey, setClientKey] = useState('')
  const [created, setCreated] = useState(null)
  const set = (patch) => {
    setError('')
    setOrder((o) => ({ ...o, ...patch }))
  }

  // إعادة ضبط عند الفتح + منع تمرير الصفحة خلف الـ Sheet
  useEffect(() => {
    if (open) {
      setPerk({ promoCode: '', usePoints: false, discount: 0 })
      setStep(0)
      setOrder(defaultAddress ? { ...initial(), ...fromAddress(defaultAddress) } : initial())
      setError('')
      setCreated(null)
      setClientKey(newClientKey())
      setStatus('idle')
    }
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open])

  if (!open) return null

  // حساب الفاتورة
  const stairsFloors = order.elevator ? 0 : order.floor
  const lines = [
    { label: peak ? `${g('deliveryFee')} · ${peak.label}` : g('deliveryFee'), amount: PRICING.deliveryFee },
    perk.discount > 0 && { label: lang === 'ar' ? 'حسم التوصيل' : 'Delivery discount', amount: -perk.discount },
    { label: `${g('gasPrice')} × ${formatNumber(order.qty)}`, amount: PRICING.gasPrice * order.qty, approx: true, unknown: !PRICING.gasPrice },
    order.type === 'buy' && {
      label: `${g('cylinderPrice')} × ${formatNumber(order.qty)}`,
      amount: PRICING.emptyCylinder * order.qty,
      approx: true,
      unknown: !PRICING.emptyCylinder,
    },
    stairsFloors > 0 && {
      label: `${g('stairsFee')} (${formatNumber(stairsFloors)} × ${formatNumber(order.qty)})`,
      amount: PRICING.stairsPerFloor * stairsFloors * order.qty,
      unknown: !PRICING.stairsPerFloor,
    },
  ].filter(Boolean)
  const total = lines.reduce((s, l) => s + l.amount, 0)
  // الإدارة ما حطت سعر ثابت لبند → سعره بيتحدد وقت التوصيل
  const someUnknown = lines.some((l) => l.unknown)
  const unknownText = lang === 'ar' ? 'حسب السعر وقت التوصيل' : 'Priced at delivery'

  const confirm = async () => {
    setStatus('searching')
    try {
      const o = await createOrder({
        kind: 'gas',
        clientKey,
        qty: order.qty,
        gasType: order.type,
        elevator: order.elevator,
        floor: order.floor,
        location: order.location,
        address: order.address,
        notes: order.notes,
        promoCode: perk.promoCode || undefined,
        usePoints: perk.usePoints || undefined,
      })
      setCreated(o)
      if (!order.addressId && order.saveAddress && order.location)
        addAddress({
          label: order.saveLabel.trim() || (addresses.length ? `عنوان ${addresses.length + 1}` : 'البيت'),
          location: order.location,
          details: order.address,
          floor: order.floor,
          elevator: order.elevator,
        }).catch(() => {})
      setStatus('found')
    } catch (err) {
      setStatus('idle')
      setError(errorText(t, err))
    }
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col justify-end">
      {/* الخلفية المعتمة */}
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      <div className="relative flex max-h-[92%] flex-col rounded-t-[2rem] bg-white animate-sheet-up">
        {/* المقبض + العنوان */}
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-12 rounded-full bg-navy/15" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand">
              <Flame size={22} />
            </span>
            <h2 className="text-lg font-extrabold">{g('title')}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50 text-navy/60 active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {status === 'idle' ? (
          <>
            <Stepper step={step} labels={t('gas.steps')} />

            <div className="scrollbar-hide flex-1 overflow-y-auto px-5 pb-4">
              {step === 0 && (
                <div className="space-y-6 animate-fade-in">
                  <Field label={g('qtyQ')}>
                    <div className="grid grid-cols-2 gap-3">
                      {[1, 2].map((n) => (
                        <Choice key={n} active={order.qty === n} onClick={() => set({ qty: n })}>
                          <div className="flex items-center justify-center gap-1">
                            {Array.from({ length: n }).map((_, i) => (
                              <CylinderIcon key={i} active={order.qty === n} />
                            ))}
                          </div>
                          <div className="mt-2 text-sm font-bold">
                            {n === 1 ? `${formatNumber(1)} ${g('cylinder')}` : g('cylinders')}
                          </div>
                        </Choice>
                      ))}
                    </div>
                  </Field>

                  <Field label={g('typeQ')}>
                    <div className="space-y-3">
                      <RowChoice
                        active={order.type === 'swap'}
                        onClick={() => set({ type: 'swap' })}
                        Icon={RefreshCw}
                        title={g('swap')}
                        sub={g('swapSub')}
                      />
                      <RowChoice
                        active={order.type === 'buy'}
                        onClick={() => set({ type: 'buy' })}
                        Icon={PackagePlus}
                        title={g('buy')}
                        sub={g('buySub')}
                      />
                    </div>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <Field label={t('custom.addressQ')}>
                    <AddressChooser
                      selectedId={order.addressId}
                      onSelect={(a) => set(fromAddress(a))}
                      onNew={() => set({ addressId: null, location: loadLastLocation(), address: '', floor: 0, elevator: true, saveLabel: addresses.length ? '' : 'البيت' })}
                    />
                    {(!addresses.length || order.addressId === null) && (
                      <div className={addresses.length ? 'mt-3 space-y-3' : 'space-y-3'}>
                        <LocationField value={order.location} onOpen={() => setPickerOpen(true)} />
                        <textarea
                          rows={2}
                          value={order.address}
                          onChange={(e) => set({ address: e.target.value })}
                          placeholder={t('custom.addressPh')}
                          className="w-full resize-none rounded-2xl border border-navy/10 bg-navy-50 p-3.5 text-sm outline-none transition focus:border-brand focus:bg-white"
                        />
                        <SaveAddressBox save={order.saveAddress} label={order.saveLabel} onChange={set} />
                      </div>
                    )}
                  </Field>
                  <Field label={g('floorQ')}>
                    <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-2">
                      <Stepper2 onClick={() => set({ floor: Math.max(0, order.floor - 1) })} Icon={Minus} />
                      <div className="flex items-center gap-2 text-center">
                        <Building2 size={20} className="text-brand" />
                        <span className="text-lg font-extrabold">
                          {order.floor === 0 ? g('ground') : `${g('floor')} ${formatNumber(order.floor)}`}
                        </span>
                      </div>
                      <Stepper2 onClick={() => set({ floor: Math.min(15, order.floor + 1) })} Icon={Plus} />
                    </div>
                  </Field>

                  {order.floor > 0 && (
                    <Field label={g('elevatorQ')}>
                      <div className="grid grid-cols-2 gap-3">
                        <Choice active={order.elevator} onClick={() => set({ elevator: true })}>
                          <ArrowUpDown className="mx-auto" size={22} />
                          <div className="mt-1.5 text-sm font-bold">{g('yes')}</div>
                        </Choice>
                        <Choice active={!order.elevator} onClick={() => set({ elevator: false })}>
                          <X className="mx-auto" size={22} />
                          <div className="mt-1.5 text-sm font-bold">{g('no')}</div>
                        </Choice>
                      </div>
                      {!order.elevator && (
                        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                          <Info size={16} className="mt-0.5 shrink-0" />
                          {g('noElevatorNote')}
                        </p>
                      )}
                    </Field>
                  )}

                  <Field label={g('notesLabel')}>
                    <textarea
                      rows={2}
                      value={order.notes}
                      onChange={(e) => set({ notes: e.target.value })}
                      placeholder={g('notesPh')}
                      className="w-full resize-none rounded-2xl border border-navy/10 bg-navy-50 p-3 text-sm outline-none transition focus:border-brand focus:bg-white"
                    />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <PromoBox fee={PRICING.deliveryFee} value={perk} onChange={setPerk} />
                  <div className="rounded-3xl border border-navy/10 p-4">
                    <h3 className="mb-3 text-sm font-extrabold">{g('invoice')}</h3>
                    <ul className="space-y-3 text-sm">
                      {lines.map((l, i) => (
                        <li key={i} className="flex items-start justify-between gap-3">
                          <span className="text-navy/70">{l.label}</span>
                          <span className="shrink-0 text-end font-bold">
                            {l.unknown ? <span className="text-xs text-brand">{unknownText}</span> : money(l.amount)}
                            {l.approx && !l.unknown && <span className="block text-[10px] font-normal text-brand">{g('approx')}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex items-center justify-between border-t border-dashed border-navy/15 pt-4">
                      <span className="font-extrabold">{g('total')}</span>
                      <span className="text-end text-xl font-extrabold text-brand">
                        {someUnknown ? `${money(total)} +` : `≈ ${money(total)}`}
                        {someUnknown && <span className="block text-[10px] font-bold">{lang === 'ar' ? 'والباقي حسب السعر وقت التوصيل' : 'plus items priced at delivery'}</span>}
                      </span>
                    </div>
                  </div>
                  <p className="flex items-start gap-2 rounded-2xl bg-brand-50 p-3 text-xs leading-relaxed text-navy/80">
                    <Info size={16} className="mt-0.5 shrink-0 text-brand" />
                    {g('disclaimer')}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="mx-5 mb-2 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600 animate-fade-in">
                {error}
              </p>
            )}
            {/* أزرار الأسفل */}
            <div className="pb-safe flex gap-3 border-t border-navy/5 bg-white px-5 py-4">
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="rounded-2xl bg-navy-50 px-5 py-3.5 text-sm font-bold text-navy active:scale-95"
                >
                  {g('back')}
                </button>
              )}
              <button
                onClick={() => {
                  if (step === 1 && !order.location) return setError(t('map.required'))
                  step < 2 ? setStep(step + 1) : confirm()
                }}
                className="flex flex-1 items-center justify-center gap-2 btn-zap bg-brand py-3.5 text-sm font-extrabold text-white shadow-[0_8px_20px_-8px_#4B1FE0] transition active:scale-[0.98]"
              >
                {step < 2 ? g('next') : g('confirm')}
                <ChevronLeft size={18} className="ltr:rotate-180" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center px-6 pb-10 pt-6 text-center animate-fade-in">
            {status === 'searching' ? (
              <>
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand">
                    <LoaderCircle size={36} className="animate-spin" />
                  </span>
                </div>
                <p className="mt-6 font-bold">{t('ordersExtra.sending')}</p>
              </>
            ) : (
              <>
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <Check size={40} strokeWidth={3} />
                </span>
                <p className="mt-5 text-lg font-extrabold">{g('found')}</p>
                {created && (
                  <p className="mt-2 rounded-full bg-navy-50 px-4 py-1.5 font-en text-sm font-bold">
                    {t('ordersExtra.orderNo')} {created.number}
                  </p>
                )}
                <p className="mt-1 text-sm text-navy/60">{g('foundSub')}</p>
                {/* أهم لحظة لتفعيل التنبيهات: لحتى يعرف أول ما يقبل العامل طلبه */}
                <div className="mt-4 w-full text-start">
                  <CustomerPushCard />
                </div>
                <button
                  onClick={() => {
                    onConfirmed?.()
                    onClose()
                  }}
                  className="mt-6 w-full rounded-2xl bg-navy py-3.5 text-sm font-extrabold text-white active:scale-[0.98]"
                >
                  {g('done')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <LocationPicker
        open={pickerOpen}
        initial={order.location}
        onClose={() => setPickerOpen(false)}
        onConfirm={(loc) => {
          set({ location: loc })
          setPickerOpen(false)
        }}
      />
    </div>
  )
}


function CylinderIcon({ active }) {
  return (
    <svg viewBox="0 0 24 36" className={`h-10 w-7 ${active ? 'text-brand' : 'text-navy/30'}`}>
      <rect x="8" y="0" width="8" height="5" rx="1.5" fill="currentColor" />
      <rect x="2" y="5" width="20" height="30" rx="7" fill="currentColor" />
      <rect x="2" y="15" width="20" height="3" fill="#fff" opacity=".5" />
    </svg>
  )
}
