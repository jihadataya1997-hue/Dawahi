import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Building2,
  Camera,
  Check,
  ChevronLeft,
  Fuel,
  Info,
  LoaderCircle,
  MapPin,
  Minus,
  Package,
  Pill,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { Field, RowChoice, Stepper, Stepper2 } from './ui'
import { useAuth } from '../auth/AuthProvider'
import { useOrders } from '../orders/OrdersProvider'
import { useAppConfig } from '../config/AppConfigProvider'
import { compressImage, newClientKey } from '../api'
import { errorText } from '../i18n/errorText'
import LocationPicker, { LocationField, loadLastLocation, mapsLink } from './LocationPicker'

const CATEGORIES = [
  { id: 'any', Icon: ShoppingBag },
  { id: 'restaurants', Icon: UtensilsCrossed },
  { id: 'supermarket', Icon: ShoppingCart },
  { id: 'pharmacy', Icon: Pill },
  { id: 'library', Icon: BookOpen },
  { id: 'diesel', Icon: Fuel },
  { id: 'other', Icon: Package },
]

const blank = (category = 'any', items = '', phone = '') => ({
  category,
  items,
  photo: null,
  storeMode: 'any', // any | specific
  storeName: '',
  location: loadLastLocation(),
  address: '',
  floor: 0,
  phone,
  notes: '',
})

/**
 * "اطلب أي شي" — الزبون يكتب طلبه بحرية، يحدد المحل إذا بدو،
 * وعامل التوصيل يشتري الأغراض ويوصلها. لا يحتاج محلات متعاقدة.
 */
export default function CustomOrderSheet({ open, initialCategory, initialText, onClose, onConfirmed }) {
  const { t, formatNumber } = useLang()
  const { user } = useAuth()
  const { createOrder } = useOrders()
  const { pricing, money } = useAppConfig()
  const [clientKey, setClientKey] = useState('')
  const [created, setCreated] = useState(null)
  const c = (k) => t(`custom.${k}`)
  const [step, setStep] = useState(0)
  const [order, setOrder] = useState(blank())
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const fileRef = useRef(null)
  const set = (patch) => {
    setError('')
    setOrder((o) => ({ ...o, ...patch }))
  }

  useEffect(() => {
    if (open) {
      setStep(0)
      setOrder(blank(initialCategory || 'any', initialText || '', user?.phone || ''))
      setStatus('idle')
      setError('')
      setCreated(null)
      setClientKey(newClientKey()) // مفتاح ثابت لهذا الطلب يمنع تكراره عند إعادة المحاولة
    }
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open, initialCategory, initialText, user])

  if (!open) return null

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      set({ photo: { url: dataUrl, dataUrl } })
    } catch {
      setError(t('errors.default'))
    }
  }

  const next = () => {
    if (step === 0 && !order.items.trim() && !order.photo) return setError(c('required'))
    if (step === 1 && !order.location) return setError(t('map.required'))
    if (step === 1 && order.phone.replace(/\s/g, '').length < 10) return setError(c('addressRequired'))
    if (step < 2) return setStep(step + 1)
    submit()
  }

  const submit = async () => {
    setStatus('searching')
    try {
      const o = await createOrder({
        kind: 'custom',
        clientKey,
        category: order.category,
        items: order.items,
        photo: order.photo?.dataUrl,
        storeMode: order.storeMode,
        storeName: order.storeName,
        location: order.location,
        address: order.address,
        floor: order.floor,
        contactPhone: order.phone,
        notes: order.notes,
      })
      setCreated(o)
      setStatus('found')
    } catch (err) {
      setStatus('idle')
      setError(errorText(t, err))
    }
  }


  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col justify-end">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      <div className="relative flex max-h-[94%] flex-col rounded-t-[2rem] bg-white animate-sheet-up">
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-12 rounded-full bg-navy/15" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand">
              <ShoppingBag size={22} />
            </span>
            <h2 className="text-lg font-extrabold">{c('title')}</h2>
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
            <Stepper step={step} labels={c('steps')} />

            <div className="scrollbar-hide flex-1 overflow-y-auto px-5 pb-4">
              {step === 0 && (
                <div className="space-y-6 animate-fade-in">
                  <Field label={c('catQ')}>
                    <div className="scrollbar-hide -mx-5 flex gap-2 overflow-x-auto px-5">
                      {CATEGORIES.map(({ id, Icon }) => {
                        const on = order.category === id
                        return (
                          <button
                            key={id}
                            onClick={() => set({ category: id })}
                            className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-xs font-bold transition active:scale-95 ${
                              on ? 'border-brand bg-brand text-white' : 'border-navy/10 text-navy/60'
                            }`}
                          >
                            <Icon size={15} />
                            {t(`custom.cats.${id}`)}
                          </button>
                        )
                      })}
                    </div>
                  </Field>

                  <Field label={c('itemsQ')}>
                    <textarea
                      rows={5}
                      value={order.items}
                      onChange={(e) => set({ items: e.target.value })}
                      placeholder={c('itemsPh')}
                      className="w-full resize-none rounded-2xl border border-navy/10 bg-navy-50 p-3.5 text-sm leading-relaxed outline-none transition focus:border-brand focus:bg-white"
                    />
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
                    {order.photo ? (
                      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-emerald-50 p-2.5">
                        <img src={order.photo.url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                        <span className="flex-1 text-xs font-bold text-emerald-700">{c('attached')}</span>
                        <button
                          onClick={() => set({ photo: null })}
                          aria-label="Remove photo"
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-navy/50"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy/15 py-3 text-xs font-bold text-navy/60 active:scale-[0.98]"
                      >
                        <Camera size={18} className="text-brand" />
                        {c('attach')}
                      </button>
                    )}
                  </Field>

                  <Field label={c('storeQ')}>
                    <div className="space-y-3">
                      <RowChoice
                        active={order.storeMode === 'any'}
                        onClick={() => set({ storeMode: 'any' })}
                        Icon={MapPin}
                        title={c('anyStore')}
                        sub={c('anyStoreSub')}
                      />
                      <RowChoice
                        active={order.storeMode === 'specific'}
                        onClick={() => set({ storeMode: 'specific' })}
                        Icon={Store}
                        title={c('specificStore')}
                        sub={c('specificStoreSub')}
                      />
                      {order.storeMode === 'specific' && (
                        <input
                          autoFocus
                          value={order.storeName}
                          onChange={(e) => set({ storeName: e.target.value })}
                          placeholder={c('storePh')}
                          className="w-full rounded-2xl border border-navy/10 bg-navy-50 p-3.5 text-sm outline-none transition focus:border-brand focus:bg-white animate-fade-in"
                        />
                      )}
                    </div>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <Field label={c('addressQ')}>
                    <LocationField value={order.location} onOpen={() => setPickerOpen(true)} />
                    <textarea
                      rows={2}
                      value={order.address}
                      onChange={(e) => set({ address: e.target.value })}
                      placeholder={c('addressPh')}
                      className="mt-3 w-full resize-none rounded-2xl border border-navy/10 bg-navy-50 p-3.5 text-sm outline-none transition focus:border-brand focus:bg-white"
                    />
                  </Field>

                  <Field label={c('floorQ')}>
                    <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-2">
                      <Stepper2 onClick={() => set({ floor: Math.max(0, order.floor - 1) })} Icon={Minus} />
                      <div className="flex items-center gap-2">
                        <Building2 size={20} className="text-brand" />
                        <span className="text-lg font-extrabold">
                          {order.floor === 0 ? t('gas.ground') : `${t('gas.floor')} ${formatNumber(order.floor)}`}
                        </span>
                      </div>
                      <Stepper2 onClick={() => set({ floor: Math.min(15, order.floor + 1) })} Icon={Plus} />
                    </div>
                  </Field>

                  <Field label={c('phoneQ')}>
                    <input
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      value={order.phone}
                      onChange={(e) => set({ phone: e.target.value.replace(/[^\d+ ]/g, '') })}
                      placeholder="09xx xxx xxx"
                      className="w-full rounded-2xl border border-navy/10 bg-navy-50 p-3.5 text-start font-en text-sm tracking-wider outline-none transition focus:border-brand focus:bg-white rtl:text-end"
                    />
                  </Field>

                  <Field label={c('notesLabel')}>
                    <textarea
                      rows={2}
                      value={order.notes}
                      onChange={(e) => set({ notes: e.target.value })}
                      placeholder={c('notesPh')}
                      className="w-full resize-none rounded-2xl border border-navy/10 bg-navy-50 p-3.5 text-sm outline-none transition focus:border-brand focus:bg-white"
                    />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-fade-in">
                  {/* ملخص الطلب */}
                  <div className="rounded-3xl bg-navy-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-bold text-brand">
                      {(() => {
                        const Icon = CATEGORIES.find((x) => x.id === order.category)?.Icon || ShoppingBag
                        return <Icon size={14} />
                      })()}
                      {t(`custom.cats.${order.category}`)}
                      <span className="text-navy/30">•</span>
                      <span className="text-navy/60">
                        {order.storeMode === 'specific' && order.storeName.trim() ? order.storeName : c('anyStore')}
                      </span>
                    </div>
                    {order.items.trim() && (
                      <p className="whitespace-pre-line text-sm leading-relaxed text-navy">{order.items}</p>
                    )}
                    {order.photo && (
                      <img src={order.photo.url} alt="" className="mt-3 h-20 w-20 rounded-xl object-cover" />
                    )}
                    <div className="mt-3 flex items-start gap-1.5 border-t border-navy/10 pt-3 text-xs text-navy/60">
                      <MapPin size={14} className="mt-0.5 shrink-0" />
                      <span>
                        {order.address || t('map.picked')}
                        {order.floor > 0 && ` — ${t('gas.floor')} ${formatNumber(order.floor)}`}
                        {order.location && (
                          <a
                            href={mapsLink(order.location)}
                            target="_blank"
                            rel="noreferrer"
                            className="ms-1 font-bold text-brand underline"
                          >
                            ({t('map.view')})
                          </a>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* كيف تمشي العملية */}
                  <div>
                    <h3 className="mb-3 text-sm font-extrabold">{c('howItWorks')}</h3>
                    <ol className="space-y-2.5">
                      {c('how').map((line, i) => (
                        <li key={i} className="flex items-center gap-3 text-sm">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-extrabold text-brand">
                            {formatNumber(i + 1)}
                          </span>
                          {line}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* الفاتورة */}
                  <div className="rounded-3xl border border-navy/10 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-navy/70">{c('deliveryFee')}</span>
                      <span className="font-bold">{money(pricing.deliveryFee)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-navy/70">{c('itemsCost')}</span>
                      <span className="font-bold text-brand">{c('itemsCostVal')}</span>
                    </div>
                  </div>

                  <p className="flex items-start gap-2 rounded-2xl bg-brand-50 p-3 text-xs leading-relaxed text-navy/80">
                    <Info size={16} className="mt-0.5 shrink-0 text-brand" />
                    {c('disclaimer')}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="mx-5 mb-2 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600 animate-fade-in">
                {error}
              </p>
            )}

            <div className="pb-safe flex gap-3 border-t border-navy/5 bg-white px-5 py-4">
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="rounded-2xl bg-navy-50 px-5 py-3.5 text-sm font-bold text-navy active:scale-95"
                >
                  {t('gas.back')}
                </button>
              )}
              <button
                onClick={next}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white shadow-[0_8px_20px_-8px_#FF8A00] transition active:scale-[0.98]"
              >
                {step < 2 ? t('gas.next') : c('confirm')}
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
                <p className="mt-5 text-lg font-extrabold">{c('found')}</p>
                {created && (
                  <p className="mt-2 rounded-full bg-navy-50 px-4 py-1.5 font-en text-sm font-bold">
                    {t('ordersExtra.orderNo')} {created.number}
                  </p>
                )}
                <p className="mt-1 text-sm text-navy/60">{c('foundSub')}</p>
                <button
                  onClick={() => {
                    onConfirmed?.()
                    onClose()
                  }}
                  className="mt-6 w-full rounded-2xl bg-navy py-3.5 text-sm font-extrabold text-white active:scale-[0.98]"
                >
                  {t('gas.done')}
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
