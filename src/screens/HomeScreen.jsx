import { useEffect, useState } from 'react'
import { Zap, Bell, BookOpen, ChevronLeft, Flame, Fuel, MapPin, PencilLine, Pill, ShoppingCart, Truck, UtensilsCrossed } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import BannerCarousel from '../components/BannerCarousel'
import { useLang } from '../i18n/LanguageProvider'
import { useAppConfig } from '../config/AppConfigProvider'
import { OPEN_STATUSES } from '../orders/OrdersProvider'


/**
 * الصفحة الرئيسية — ترتيب واضح:
 * ١) الشريط العلوي + زر الطلب الرئيسي  ٢) الطلب الحالي (إن وجد)  ٣) الإعلانات  ٤) الخدمات  ٥) لماذا ZAPP
 */
export default function HomeScreen({ activeOrder, unread, onBell, onOrder, onService, onBanner, onOpenOrders }) {
  const { t, lang, toggleLang } = useLang()
  const { areaName, services, pricing, money, peak } = useAppConfig()
  const ar = lang === 'ar'
  // اختصارات سريعة: كلها بتفتح نفس "اكتب طلبك" مع نوع المحل محدد (أو طلب الغاز)
  const quick = QUICK.filter((q) => services.some((s) => s.id === q.id))
  // الغاز والمازوت (طلبات تقيلة) بصف لحالهن، وإذا واحد بس بياخد العرض كله
  const heavyCount = quick.filter((q) => q.heavy).length
  const paused = (id) => services.find((s) => s.id === id)?.paused

  return (
    <div className="pb-6">
      {/* ١) الرأس: الشعار + الموقع + صندوق الطلب */}
      <header className="pt-safe rounded-b-[2rem] bg-brand px-4 pb-6 text-white">
        <div className="flex items-center gap-2">
          <LogoMark className="h-9 w-9" />
          <span className="font-brand text-[22px] font-black italic tracking-tight text-lime">ZAPP</span>
          <span className="flex-1" />
          <button onClick={toggleLang} aria-label="Language" className="flex h-10 items-center rounded-full bg-white/15 px-3 font-en text-xs font-bold active:scale-95">
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

        <p className="mt-5 flex items-center gap-1.5 text-xs text-white/75">
          <MapPin size={14} className="shrink-0 text-lime" />
          {t('deliverTo')} <b className="font-bold text-white">{areaName}</b>
        </p>
        <h1 className="mt-1.5 text-[26px] font-black leading-tight">{ar ? 'شو بدك نجيبلك اليوم؟' : 'What can we get you today?'}</h1>
        <p className="mt-1 text-sm text-white/75">
          {ar ? 'اكتب طلبك من أي محل، وعامل التوصيل بيشتريه وبيوصله لباب بيتك.' : 'Write your order from any shop, and a courier buys and brings it to your door.'}
        </p>

        {/* صندوق الطلب: هو الشي الأساسي بالتطبيق */}
        <button onClick={onOrder} className="mt-4 block w-full rounded-3xl bg-white p-4 text-start text-navy shadow-float active:scale-[0.99]">
          <span className="flex min-h-[3.25rem] items-start gap-2 rounded-2xl bg-navy-50 px-3.5 py-3 text-[15px] text-navy/45">
            <PencilLine size={18} className="mt-0.5 shrink-0 text-brand" />
            <TypingHint ar={ar} />
          </span>
          <span className="btn-zap mt-3 flex items-center justify-center gap-2 bg-lime py-3.5 text-[15px] font-extrabold text-navy">
            {ar ? 'اكتب طلبك' : 'Write your order'}
            <ChevronLeft size={18} className="ltr:rotate-180" />
          </span>
        </button>

        {peak && (
          <p className="mt-3 flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-2 text-xs font-bold">
            <Zap size={15} className="shrink-0 text-lime" />
            {ar
              ? `${peak.label}: أجرة التوصيل ${money(pricing.deliveryFee)}${peak.until ? ` حتى ${peak.until}` : ''}`
              : `Peak time: delivery ${money(pricing.deliveryFee)}${peak.until ? ` until ${peak.until}` : ''}`}
          </p>
        )}
      </header>

      <div className="space-y-7 px-4 pt-5">
        {/* ٢) الطلب الحالي */}
        {activeOrder && <ActiveOrderCard order={activeOrder} onClick={onOpenOrders} />}

        {/* ٣) اختصارات: نفس الخدمة، بس أسرع */}
        {quick.length > 0 && (
          <section>
            <h2 className="text-base font-extrabold">{ar ? 'أو ابدأ من هون' : 'Or start here'}</h2>
            <p className="mb-3 text-xs text-navy/50">{ar ? 'منجيبلك من أي محل بالضاحية' : 'From any shop in the area'}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {quick.map(({ id, Icon, ar: la, en, sub, heavy }) => (
                <button
                  key={id}
                  onClick={() => onService(id)}
                  className={`relative flex items-center gap-3 rounded-2xl bg-white p-3 text-start shadow-soft active:scale-[0.98] ${
                    heavy && heavyCount === 1 ? 'col-span-2' : ''
                  } ${heavy ? 'ring-2 ring-lime' : ''
                  } ${paused(id) ? 'opacity-55' : ''}`}
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${heavy ? 'bg-lime text-navy' : 'bg-brand-50 text-brand'}`}>
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold">{ar ? la : en}</span>
                    <span className="block truncate text-[11px] text-navy/50">
                      {paused(id)
                        ? ar ? 'متوقف مؤقتاً' : 'Paused for now'
                        : id === 'gas' ? `${money(pricing.gasPrice)} ${ar ? 'للجرة' : 'each'}` : ar ? sub : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ٤) العروض */}
        <BannerCarousel onAction={onBanner} />

        {/* ٥) كيف بتمشي — خطوات متسلسلة فعلاً */}
        <section className="rounded-3xl bg-white p-4 shadow-soft">
          <h2 className="text-base font-extrabold">{ar ? 'كيف بتمشي؟' : 'How it works'}</h2>
          <ol className="mt-3 space-y-3">
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
                <span className="num-zap flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand text-sm text-lime">{i + 1}</span>
                <span>
                  <span className="block text-sm font-extrabold">{title}</span>
                  <span className="block text-xs leading-relaxed text-navy/55">{sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}

// الاختصارات (الأسماء من لوحة الإدارة بتتحكم بالإيقاف والإخفاء)
const QUICK = [
  { id: 'gas', Icon: Flame, ar: 'جرة غاز', en: 'Gas cylinder', heavy: true },
  { id: 'diesel', Icon: Fuel, ar: 'مازوت', en: 'Diesel', sub: 'تعبئة لحد البيت', heavy: true },
  { id: 'supermarket', Icon: ShoppingCart, ar: 'أغراض البيت', en: 'Groceries', sub: 'سوبرماركت، خضرة، فرن' },
  { id: 'pharmacy', Icon: Pill, ar: 'دوا من الصيدلية', en: 'Pharmacy', sub: 'صوّر الوصفة وابعتها' },
  { id: 'restaurants', Icon: UtensilsCrossed, ar: 'أكل من مطعم', en: 'Food', sub: 'من أي مطعم بتحدده' },
  { id: 'library', Icon: BookOpen, ar: 'قرطاسية', en: 'Stationery', sub: 'دفاتر وأقلام وطباعة' },
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
    <button onClick={onClick} className="w-full rounded-3xl bg-white p-4 text-start shadow-soft ring-2 ring-brand/30 active:scale-[0.99]">
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
