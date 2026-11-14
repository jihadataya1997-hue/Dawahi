import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Camera,
  Check,
  Flame,
  Fuel,
  Gift,
  LoaderCircle,
  MapPin,
  Minus,
  Pill,
  Plus,
  ShoppingCart,
  Store,
  UtensilsCrossed,
  Search,
  X,
  Zap,
} from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { useAuth } from '../auth/AuthProvider'
import { useOrders } from '../orders/OrdersProvider'
import { useAppConfig } from '../config/AppConfigProvider'
import CustomerPushCard from './CustomerPushCard'
import PromoBox from './PromoBox'
import { compressImage, newClientKey } from '../api'
import { errorText } from '../i18n/errorText'
import LocationPicker, { LocationField, loadLastLocation } from './LocationPicker'
import { useAddresses } from '../addresses/AddressesProvider'
import { AddressChooser, fromAddress } from '../addresses/AddressChooser'

// اختصارات فوق صندوق الكتابة: بتحدد نوع المحل وبتكتب بداية الطلب إذا الصندوق فاضي
const QUICK = [
  { id: 'gas', Icon: Flame, ar: 'تبديل جرة غاز', en: 'Gas swap', text: ['تبديل جرة غاز: جرة وحدة', 'Gas cylinder swap: 1 cylinder'] },
  { id: 'diesel', Icon: Fuel, ar: 'تعبئة مازوت', en: 'Diesel', text: ['تعبئة مازوت: ___ ليتر', 'Diesel refill: ___ liters'] },
  { id: 'pharmacy', Icon: Pill, ar: 'صيدلية', en: 'Pharmacy', text: ['', ''] },
  { id: 'supermarket', Icon: ShoppingCart, ar: 'أغراض البيت', en: 'Groceries', text: ['', ''] },
  { id: 'restaurants', Icon: UtensilsCrossed, ar: 'مطعم', en: 'Food', text: ['', ''] },
  { id: 'library', Icon: BookOpen, ar: 'قرطاسية', en: 'Stationery', text: ['', ''] },
]
const PH = {
  any: ['اكتب شو بدك، مثلاً:\n٢ ربطة خبز، كيلو بندورة، علبة لبنة', 'Write what you need, e.g.:\n2 bread packs, 1kg tomatoes'],
  gas: ['مثلاً: جرة وحدة، والبيت بلا مصعد', 'e.g. one cylinder, no elevator'],
  diesel: ['كم ليتر بدك؟', 'How many liters?'],
  pharmacy: ['اكتب اسم الدوا، أو صوّر الوصفة', 'Medicine name, or snap the prescription'],
  supermarket: ['شو بدك من السوبرماركت أو الفرن؟', 'What do you need?'],
  restaurants: ['شو بدك تاكل؟ ومن أي مطعم؟', 'What would you like to eat?'],
  library: ['دفاتر، أقلام، طباعة...', 'Notebooks, pens, printing...'],
}

const blank = (category = 'any', items = '', phone = '') => ({
  category,
  items,
  photo: null,
  storeName: '',
  location: loadLastLocation(),
  address: '',
  floor: 0,
  phone,
  addressId: null,
})

/**
 * طلب من شاشة وحدة: شو بدك + (اختياري) من وين + عنوانك المحفوظ → اطلب.
 * عامل التوصيل بيشتري وبيوصل، والزبون بيدفع عند الاستلام.
 */
export default function CustomOrderSheet({ open, initialCategory, initialText, initialStore, cart, onClose, onConfirmed }) {
  const { t, lang, formatNumber } = useLang()
  const ar = lang === 'ar'
  const L = (a, e) => (ar ? a : e)
  const { user } = useAuth()
  const { createOrder, orders, loaded } = useOrders()
  const { pricing, money, services, peak, firstOrderFree } = useAppConfig()
  // أول طلب للزبون: التوصيل ببلاش (السيرفر بيطبّقها لحاله)
  const firstFree = !!firstOrderFree && loaded && !orders.some((o) => o.status !== 'cancelled') && pricing.deliveryFee > 0
  const { addresses, defaultAddress, add: addAddress } = useAddresses()
  const quick = QUICK.filter((q) => services.some((s) => s.id === q.id && !s.paused))
  const [clientKey, setClientKey] = useState('')
  const [created, setCreated] = useState(null)
  const [order, setOrder] = useState(blank())
  const [perk, setPerk] = useState({ promoCode: '', usePoints: false, discount: 0 })
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editAddress, setEditAddress] = useState(false)
  const [showPromo, setShowPromo] = useState(false)
  const [showPhone, setShowPhone] = useState(false)
  const fileRef = useRef(null)
  // لما يطلع الكيبورد: الشاشة بتلحقه، وزر "اطلب الآن" بيضل فوق الكيبورد
  const [vv, setVv] = useState(null)
  useEffect(() => {
    const v = window.visualViewport
    if (!open || !v) return
    const update = () => setVv({ h: v.height, top: v.offsetTop })
    update()
    v.addEventListener('resize', update)
    v.addEventListener('scroll', update)
    return () => {
      v.removeEventListener('resize', update)
      v.removeEventListener('scroll', update)
    }
  }, [open])
  const set = (patch) => {
    setError('')
    setOrder((o) => ({ ...o, ...patch }))
  }

  useEffect(() => {
    if (open) {
      setPerk({ promoCode: '', usePoints: false, discount: 0 })
      const b = cart
        ? { ...blank('restaurants', '', user?.phone || ''), storeName: cart.storeName }
        : { ...blank(initialCategory || 'any', initialText || '', user?.phone || ''), storeName: initialStore || '' }
      setOrder(defaultAddress ? { ...b, ...fromAddress(defaultAddress) } : b)
      setEditAddress(false)
      setShowPromo(false)
      setShowPhone(false)
      setStatus('idle')
      setError('')
      setCreated(null)
      setClientKey(newClientKey()) // مفتاح ثابت لهذا الطلب يمنع تكراره عند إعادة المحاولة
    }
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open, initialCategory, initialText, initialStore, cart, user])

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

  const pickQuick = (q) => {
    const on = order.category === q.id
    const preset = q.text[ar ? 0 : 1]
    set({
      category: on ? 'any' : q.id,
      // الصندوق فاضي أو فيه نص اختصار تاني → منحط نص الاختصار الجديد
      items: on ? (QUICK.some((x) => x.text.includes(order.items)) ? '' : order.items) : !order.items.trim() || QUICK.some((x) => x.text.includes(order.items)) ? preset : order.items,
    })
  }

  const savedAddress = addresses.find((a) => a.id === order.addressId)
  const fee = firstFree ? 0 : Math.max(0, pricing.deliveryFee - perk.discount)

  const submit = async () => {
    if (!cart && !order.items.trim() && !order.photo) return setError(L('اكتب شو بدك، أو صوّر الورقة', 'Write your order or add a photo'))
    if (!order.location) {
      setEditAddress(true)
      return setError(t('map.required'))
    }
    if (order.phone.replace(/\s/g, '').length < 10) {
      setShowPhone(true)
      return setError(L('اكتب رقم موبايل صحيح', 'Enter a valid phone number'))
    }
    setStatus('searching')
    try {
      const o = await createOrder({
        kind: 'custom',
        clientKey,
        category: order.category,
        items: order.items,
        photo: order.photo?.dataUrl,
        storeMode: order.storeName.trim() ? 'specific' : 'any',
        storeName: order.storeName,
        location: order.location,
        address: order.address,
        floor: order.floor,
        contactPhone: order.phone,
        notes: '',
        promoCode: firstFree ? undefined : perk.promoCode || undefined,
        usePoints: firstFree ? undefined : perk.usePoints || undefined,
        ...(cart ? { storeId: cart.storeId, cart: cart.lines.map((l) => ({ itemId: l.id, qty: l.qty })) } : {}),
      })
      setCreated(o)
      setStatus('found')
      // أول عنوان بيتحفظ لحاله للطلبات الجاية
      if (!order.addressId && order.location)
        addAddress({
          label: addresses.length ? L(`عنوان ${addresses.length + 1}`, `Address ${addresses.length + 1}`) : L('البيت', 'Home'),
          location: order.location,
          details: order.address,
          floor: order.floor,
          elevator: true,
        }).catch(() => {})
    } catch (err) {
      setStatus('idle')
      setError(errorText(t, err))
    }
  }

  const input = 'w-full rounded-2xl border border-navy/10 bg-navy-50 p-3.5 text-sm outline-none transition focus:border-brand focus:bg-white'

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 mx-auto flex h-full max-w-md flex-col justify-end"
      style={vv ? { height: vv.h, top: vv.top } : undefined}
    >
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      <div className="relative flex max-h-[95%] flex-col rounded-t-[2rem] bg-white animate-sheet-up">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-xl font-black">{cart ? cart.storeName : L('شو بدك نجيبلك؟', 'What can we bring you?')}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50 text-navy/60 active:scale-95">
            <X size={18} />
          </button>
        </div>

        {status === 'idle' ? (
          <>
            <div className="scrollbar-hide flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-2">
              {cart ? (
                <div className="rounded-3xl bg-navy-50 p-4">
                  <ul className="space-y-2 text-sm">
                    {cart.lines.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-3">
                        <span>
                          <b className="num-zap me-1 text-brand">{formatNumber(l.qty)}×</b> {l.name}
                        </span>
                        <span className="shrink-0 font-bold">{money(l.price * l.qty)}</span>
                      </li>
                    ))}
                  </ul>
                  <textarea
                    rows={1}
                    value={order.items}
                    onChange={(e) => set({ items: e.target.value })}
                    placeholder={L('ملاحظة للمطعم (اختياري): بدون بصل...', 'Note for the restaurant (optional)')}
                    className="mt-3 w-full resize-none rounded-xl border border-navy/10 bg-white p-3 text-sm outline-none focus:border-brand"
                  />
                </div>
              ) : (
                <>
                  {quick.length > 0 && (
                    <div className="scrollbar-hide -mx-5 flex gap-2 overflow-x-auto px-5">
                      {quick.map((q) => {
                        const on = order.category === q.id
                        const hot = q.id === 'gas' || q.id === 'diesel'
                        return (
                          <button
                            key={q.id}
                            onClick={() => pickQuick(q)}
                            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold transition active:scale-95 ${
                              on ? 'bg-brand text-white' : hot ? 'bg-lime text-navy' : 'bg-navy-50 text-navy/70'
                            }`}
                          >
                            <q.Icon size={15} />
                            {ar ? q.ar : q.en}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="rounded-3xl border-2 border-brand/25 bg-white focus-within:border-brand">
                    <textarea
                      autoFocus={!order.items}
                      rows={4}
                      value={order.items}
                      onChange={(e) => set({ items: e.target.value })}
                      placeholder={(PH[order.category] || PH.any)[ar ? 0 : 1]}
                      className="block w-full resize-none rounded-t-3xl bg-transparent p-4 text-[15px] leading-relaxed outline-none"
                    />
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
                    <div className="flex items-center gap-2 border-t border-navy/5 px-3 py-2">
                      {order.photo ? (
                        <span className="flex items-center gap-2">
                          <img src={order.photo.url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                          <button onClick={() => set({ photo: null })} className="text-xs font-bold text-rose-600">
                            {L('شيل الصورة', 'Remove')}
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold text-brand">
                          <Camera size={17} /> {L('صوّر الورقة أو الوصفة', 'Snap a list or prescription')}
                        </button>
                      )}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 rounded-2xl bg-navy-50 px-3.5">
                    <Store size={17} className="shrink-0 text-navy/40" />
                    <input
                      value={order.storeName}
                      onChange={(e) => set({ storeName: e.target.value })}
                      placeholder={L('من محل معيّن؟ (اختياري، وإلا من أقرب محل)', 'Specific shop? (optional)')}
                      className="min-w-0 flex-1 bg-transparent py-3.5 text-sm outline-none"
                    />
                  </label>
                </>
              )}

              {/* العنوان: المحفوظ بيطلع سطر وحدة، والتغيير عند الطلب */}
              {savedAddress && !editAddress ? (
                <button onClick={() => setEditAddress(true)} className="flex w-full items-center gap-3 rounded-2xl bg-navy-50 p-3 text-start">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                    <MapPin size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold">{L('بيوصل لـ', 'Deliver to')} {savedAddress.label}</span>
                    <span className="block truncate text-xs text-navy/55">
                      {[savedAddress.details, savedAddress.floor ? `${L('الطابق', 'Floor')} ${formatNumber(savedAddress.floor)}` : L('أرضي', 'Ground')]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-brand">{L('تغيير', 'Change')}</span>
                </button>
              ) : (
                <div className="space-y-3 rounded-3xl bg-navy-50 p-3">
                  <p className="px-1 text-sm font-extrabold">{L('وين بدك ياه؟', 'Where to?')}</p>
                  {addresses.length > 0 && (
                    <AddressChooser
                      selectedId={order.addressId}
                      onSelect={(a) => (set(fromAddress(a)), setEditAddress(false))}
                      onNew={() => set({ addressId: null, location: loadLastLocation(), address: '', floor: 0 })}
                    />
                  )}
                  {(!addresses.length || order.addressId === null) && (
                    <>
                      <LocationField value={order.location} onOpen={() => setPickerOpen(true)} />
                      <input value={order.address} onChange={(e) => set({ address: e.target.value })} placeholder={L('البناية، المدخل، علامة مميزة', 'Building, entrance, landmark')} className={`${input} bg-white`} />
                      <div className="flex items-center justify-between rounded-2xl bg-white p-1.5">
                        <button onClick={() => set({ floor: Math.max(0, order.floor - 1) })} aria-label="-" className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50">
                          <Minus size={17} />
                        </button>
                        <span className="text-sm font-extrabold">{order.floor === 0 ? L('طابق أرضي', 'Ground floor') : `${L('الطابق', 'Floor')} ${formatNumber(order.floor)}`}</span>
                        <button onClick={() => set({ floor: Math.min(15, order.floor + 1) })} aria-label="+" className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50">
                          <Plus size={17} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-xs font-bold">
                {!showPhone && (
                  <button onClick={() => setShowPhone(true)} className="text-navy/55">
                    {L('بيتصل فيك على', 'Courier calls')} <span dir="ltr" className="font-en">{order.phone}</span> · <span className="text-brand">{L('رقم تاني؟', 'Change')}</span>
                  </button>
                )}
                {!firstFree && !showPromo && perk.discount === 0 && !perk.usePoints && (
                  <button onClick={() => setShowPromo(true)} className="flex items-center gap-1 text-brand">
                    <Gift size={14} /> {L('عندك كود حسم أو نقاط؟', 'Promo code or points?')}
                  </button>
                )}
              </div>
              {showPhone && (
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={order.phone}
                  onChange={(e) => set({ phone: e.target.value.replace(/[^\d+ ]/g, '') })}
                  placeholder="09xx xxx xxx"
                  className={`${input} font-en tracking-wider rtl:text-end`}
                />
              )}
              {firstFree ? (
                <p className="flex items-center gap-2 rounded-2xl bg-lime px-4 py-3 text-sm font-black text-navy">
                  <Gift size={18} className="shrink-0" /> {L('أول طلب إلك: التوصيل ببلاش!', 'Your first order: free delivery!')}
                </p>
              ) : (
                (showPromo || perk.discount > 0 || perk.usePoints) && <PromoBox fee={pricing.deliveryFee} value={perk} onChange={setPerk} />
              )}
            </div>

            {error && <p className="mx-5 mb-2 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600 animate-fade-in">{error}</p>}

            <div className="pb-safe border-t border-navy/5 bg-white px-5 pb-4 pt-3">
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="text-navy/60">
                  {cart ? L('الأكل', 'Food') + ` ${money(cart.total)} + ` : L('ثمن الأغراض متل سعر المحل + ', 'Shop price + ')}
                  {L('توصيل', 'delivery')}{' '}
                  {(perk.discount > 0 || firstFree) && <s className="text-navy/35">{money(pricing.deliveryFee)}</s>}{' '}
                  <b className="text-navy">{firstFree ? L('ببلاش', 'Free') : money(fee)}</b>
                  {peak ? <span className="text-brand"> · {peak.label}</span> : null}
                </span>
                <span className="font-bold text-navy/50">{L('الدفع عند الاستلام', 'Cash on delivery')}</span>
              </div>
              <button
                onClick={submit}
                className="btn-zap flex w-full items-center justify-center gap-2 bg-navy py-4 text-[16px] font-black text-white transition active:scale-[0.98]"
              >
                {cart ? `${L('اطلب الآن', 'Order now')} · ${money(cart.total + fee)}` : L('اطلب الآن', 'Order now')}
                <Zap size={18} className="fill-lime text-lime" />
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
                <div className="relative flex h-28 w-28 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand/15" />
                  <span className="absolute inset-3 animate-ping rounded-full bg-brand/20 [animation-delay:.4s]" />
                  <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand text-white">
                    <Search size={34} />
                  </span>
                </div>
                <p className="mt-5 text-xl font-black">{L('جاري البحث عن عامل توصيل…', 'Finding a courier…')}</p>
                {created && <p className="mt-2 rounded-full bg-navy-50 px-4 py-1.5 font-en text-sm font-bold">{created.number}</p>}
                <p className="mt-2 text-sm text-navy/60">
                  {L('حالة طلبك رح تضل ظاهرة تحت بالشاشة، وأول ما يقبل عامل التوصيل بيطلعلك اسمه ورقمه.', "Your order status stays visible at the bottom. You'll see the courier's name once accepted.")}
                </p>
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
                  {L('تمام', 'OK')}
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
