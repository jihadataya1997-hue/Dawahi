import { useEffect, useState } from 'react'
import { Zap, Bell, BookOpen, ChevronLeft, Flame, Fuel, MapPin, PencilLine, Pill, ShoppingCart, Truck, UtensilsCrossed } from 'lucide-react'
import BannerCarousel from '../components/BannerCarousel'
import { useLang } from '../i18n/LanguageProvider'
import { useAppConfig } from '../config/AppConfigProvider'
import { OPEN_STATUSES, useOrders } from '../orders/OrdersProvider'


/**
 * الصفحة الرئيسية — ترتيب واضح:
 * ١) الشريط العلوي + زر الطلب الرئيسي  ٢) الطلب الحالي (إن وجد)  ٣) الإعلانات  ٤) الخدمات  ٥) لماذا ZAPP
 */
export default function HomeScreen({ activeOrder, unread, onBell, onOrder, onService, onBanner, onOpenOrders, restaurants }) {
  const { t, lang, toggleLang } = useLang()
  const { areaName, services, pricing, money, peak, home = {} } = useAppConfig()
  const show = (k) => home[k] !== false // كل قسم ظاهر إلا إذا الإدارة خفته
  const ar = lang === 'ar'
  const { orders, loaded } = useOrders()
  const area = ar ? areaName || 'ضاحية قدسيا' : 'Qudsaya Suburb'
  // اختصارات سريعة: كلها بتفتح نفس "اكتب طلبك" مع نوع المحل محدد (أو طلب الغاز)
  const quick = QUICK.filter((q) => services.some((s) => s.id === q.id))
  const paused = (id) => services.find((s) => s.id === id)?.paused
  const gas = quick.find((q) => q.id === 'gas')
  const rest = quick.filter((q) => q.id !== 'gas')
  const subOf = (q) =>
    paused(q.id)
      ? ar ? 'متوقف مؤقتاً' : 'Paused for now'
      : q.id === 'gas'
        ? pricing.gasPrice
          ? `${money(pricing.gasPrice)} ${ar ? 'للجرة' : 'each'}`
          : ar ? 'تبديل لحد البيت' : 'Swap to your door'
        : ar ? q.sub : q.enSub

  return (
    <div className="pb-6">
      {/* ١) الرأس "بوستر الضاحية": اسم المنطقة كبير مفرّغ بالخلفية */}
      <header className="pt-safe relative overflow-hidden bg-brand px-5 pb-24 text-white">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -start-6 top-10 select-none whitespace-pre text-[92px] font-black leading-[0.95] text-transparent opacity-[0.22]"
          style={{ WebkitTextStroke: '1.5px #fff' }}
        >
          {ar ? (areaName || 'ضاحية قدسيا').split(' ').join('\n') : 'Qudsaya\nSuburb'}
        </span>

        <div className="relative flex items-center gap-2 pt-3">
          <img src="/wordmark.webp" alt="ZAPP Delivery" className="h-9 w-auto" />
          <span className="flex-1" />
          <button onClick={toggleLang} aria-label="Language" className="flex h-10 min-w-10 items-center justify-center rounded-full bg-white/15 px-3 font-en text-xs font-bold active:scale-95">
            {ar ? 'EN' : 'ع'}
          </button>
          <button onClick={onBell} aria-label={t('inbox.title')} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 active:scale-95">
            <Bell size={19} />
            {unread > 0 && (
              <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-brand bg-lime px-1 text-[10px] font-bold text-navy">
                {unread}
              </span>
            )}
          </button>
        </div>

        <div className="relative mt-12">
          <p className="flex items-center gap-1.5 text-sm font-bold text-white/80">
            <MapPin size={15} className="shrink-0 text-lime" />
            {ar ? 'التوصيل لكل بيت بـ' : 'Delivery to every home in'}
          </p>
          <h1 className="mt-1 text-[40px] font-black leading-[1.05] tracking-tight">{area}</h1>
          <p className="mt-2 inline-block -rotate-2 rounded-xl bg-lime px-3 pb-1 text-[36px] font-black leading-tight text-navy">
            {ar ? 'بإيدك.' : 'in your hand.'}
          </p>
        </div>
      </header>

      <div className="relative z-10 -mt-16 space-y-6 px-4">
        {/* ٢) صندوق الطلب: الشي الأساسي بالتطبيق، طالع فوق الرأس */}
        <button onClick={onOrder} className="block w-full rounded-[1.75rem] bg-white p-3.5 text-start text-navy shadow-float active:scale-[0.99]">
          <span className="flex min-h-[3.25rem] items-start gap-2 rounded-2xl bg-navy-50 px-3.5 py-3 text-[15px] text-navy/45">
            <PencilLine size={18} className="mt-0.5 shrink-0 text-brand" />
            <TypingHint ar={ar} />
          </span>
          <span className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-navy py-4 text-[16px] font-black text-white">
            {ar ? 'اكتب طلبك' : 'Write your order'}
            <Zap size={18} className="fill-lime text-lime" />
          </span>
          {peak && (
            <span className="mt-2.5 flex items-center justify-center gap-1.5 text-xs font-bold text-brand">
              <Zap size={13} className="shrink-0" />
              {ar
                ? `${peak.label}: أجرة التوصيل ${money(pricing.deliveryFee)}${peak.until ? ` حتى ${peak.until}` : ''}`
                : `Peak time: delivery ${money(pricing.deliveryFee)}${peak.until ? ` until ${peak.until}` : ''}`}
            </span>
          )}
        </button>

        {/* ٣) الإعلانات الكبيرة: أول شي بيشوفه الزبون بعد صندوق الطلب */}
        {show('banners') && <BannerCarousel onAction={onBanner} placement="top" />}

        {/* ٤) الطلب الحالي */}
        {activeOrder && <ActiveOrderCard order={activeOrder} onClick={onOpenOrders} />}

        {/* ٥) المطاعم الشريكة: بتطلع لحالها أول ما الإدارة تنشر مطعم */}
        {restaurants}

        {/* ٦) الخدمات: جرة الغاز كبيرة، والباقي حولها */}
        {show('shortcuts') && quick.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-black">{ar ? 'منجيبلك من أي محل بالضاحية' : 'We bring it from any shop'}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {gas && (
                <button
                  onClick={() => onService('gas')}
                  className={`relative flex flex-col justify-between overflow-hidden rounded-[1.5rem] bg-lime p-4 text-start text-navy active:scale-[0.98] ${rest.length >= 2 ? 'row-span-2 min-h-[11.5rem]' : 'col-span-2 min-h-[7rem]'} ${paused('gas') ? 'opacity-55' : ''}`}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-lime">
                    <Flame size={24} />
                  </span>
                  <span>
                    <span className="block text-2xl font-black leading-tight">{ar ? 'جرة غاز' : 'Gas cylinder'}</span>
                    <span className="block text-xs font-bold text-navy/60">{subOf(gas)}</span>
                  </span>
                </button>
              )}
              {rest.map((q, i) => (
                <button
                  key={q.id}
                  onClick={() => onService(q.id)}
                  className={`flex min-h-[5.5rem] flex-col justify-between gap-2 rounded-[1.5rem] bg-white p-3.5 text-start shadow-soft active:scale-[0.98] ${
                    i === rest.length - 1 && (rest.length - (gas && rest.length >= 2 ? 2 : 0)) % 2 === 1 ? 'col-span-2' : ''
                  } ${paused(q.id) ? 'opacity-55' : ''}`}
                >
                  <q.Icon size={22} strokeWidth={2.2} className="text-brand" />
                  <span>
                    <span className="block text-[15px] font-black leading-tight">{ar ? q.ar : q.en}</span>
                    <span className="block truncate text-[11px] text-navy/50">{subOf(q)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ٧) مكان إعلان تاني بنص الصفحة */}
        {show('banners') && <BannerCarousel onAction={onBanner} placement="mid" />}

        {/* ٨) كيف بتمشي — للزبون الجديد بس (اللي ما طلب قبل) */}
        {show('howItWorks') && loaded && orders.length === 0 && (
          <section className="rounded-[1.75rem] bg-navy p-5 text-white">
            <h2 className="text-lg font-black">{ar ? 'كيف بتمشي؟' : 'How it works'}</h2>
            <ol className="mt-4 space-y-4">
              {(ar
                ? [
                    ['اكتب طلبك وحدد بيتك', 'اكتب الأغراض أو صوّر الورقة، وإذا بدك حدد المحل.'],
                    ['عامل التوصيل بيشتري وبيجيب', 'بيوصلك إشعار بكل خطوة لحتى يدق بابك.'],
                    ['بتدفع عند الاستلام', `ثمن الأغراض متل سعر المحل + أجرة توصيل ${money(pricing.deliveryFee)}.`],
                  ]
                : [
                    ['Write your order', 'List items or snap a photo, and pick a shop if you like.'],
                    ['A courier buys and brings it', 'You get a notification at every step.'],
                    ['Pay on delivery', `Shop price + ${money(pricing.deliveryFee)} delivery.`],
                  ]
              ).map(([title, sub], i) => (
                <li key={i} className="flex gap-3">
                  <span className="num-zap flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime text-base text-navy">{i + 1}</span>
                  <span>
                    <span className="block text-sm font-extrabold">{title}</span>
                    <span className="block text-xs leading-relaxed text-white/65">{sub}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

// الاختصارات (الأسماء من لوحة الإدارة بتتحكم بالإيقاف والإخفاء)
const QUICK = [
  { id: 'gas', Icon: Flame, ar: 'جرة غاز', en: 'Gas cylinder' },
  { id: 'diesel', Icon: Fuel, ar: 'مازوت', en: 'Diesel', sub: 'تعبئة لحد البيت', enSub: 'Refill at home' },
  { id: 'pharmacy', Icon: Pill, ar: 'صيدلية', en: 'Pharmacy', sub: 'صوّر الوصفة', enSub: 'Snap the prescription' },
  { id: 'supermarket', Icon: ShoppingCart, ar: 'أغراض البيت', en: 'Groceries', sub: 'سوبرماركت، فرن', enSub: 'Market, bakery' },
  { id: 'restaurants', Icon: UtensilsCrossed, ar: 'أكل من مطعم', en: 'Food', sub: 'أي مطعم', enSub: 'Any restaurant' },
  { id: 'library', Icon: BookOpen, ar: 'قرطاسية', en: 'Stationery', sub: 'دفاتر وطباعة', enSub: 'Notebooks, printing' },
]

// أمثلة بتنكتب لحالها جوّا صندوق الطلب لتوضّح الفكرة
const EXAMPLES = {
  ar: ['٢ ربطة خبز وكيلو لبن…', 'علبة بنادول من الصيدلية…', 'كيلو بندورة ونص كيلو خيار…', 'شاورما من المطعم اللي بتحبه…'],
  en: ['2 bread packs and yogurt…', 'Panadol from the pharmacy…', 'Tomatoes and cucumbers…', 'Shawarma from your favorite place…'],
}
function TypingHint({ ar }) {
  const list = EXAMPLES[ar ? 'ar' : 'en']
  const [i, setI] = useState(0)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setN(list[0].length)
    const full = list[i]
    const id = setTimeout(
      () => {
        if (n < full.length) setN(n + 1)
        else {
          setN(0)
          setI((i + 1) % list.length)
        }
      },
      n < full.length ? 60 : 1800
    )
    return () => clearTimeout(id)
  }, [i, n, list])
  return (
    <span className="min-w-0 flex-1">
      {list[i].slice(0, n)}
      <span className="ms-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-brand" />
    </span>
  )
}

function ActiveOrderCard({ order, onClick }) {
  const { t } = useLang()
  const step = OPEN_STATUSES.indexOf(order.status)
  return (
    <button onClick={onClick} className="w-full rounded-[1.5rem] bg-white p-4 text-start shadow-soft ring-2 ring-brand/25 active:scale-[0.99]">
      <div className="flex items-center gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
          <Truck size={22} />
          <span className="absolute -end-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-400 animate-pulse-dot" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold">{t(`status.${order.status}`)}</span>
          <span className="num-zap block text-xs text-navy/50">{order.number}</span>
        </span>
        <ChevronLeft size={18} className="shrink-0 text-navy/30 ltr:rotate-180" />
      </div>
      <div className="mt-3 flex gap-1.5">
        {OPEN_STATUSES.map((s, i) => (
          <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-navy/10'}`} />
        ))}
      </div>
    </button>
  )
}
