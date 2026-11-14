import { Phone, Search, ShoppingBag, Truck, UserCheck } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { OPEN_STATUSES } from '../orders/OrdersProvider'

const STEPS = {
  new: { Icon: Search, ar: 'جاري البحث عن عامل توصيل…', en: 'Finding a courier…' },
  assigned: { Icon: UserCheck, ar: 'عامل التوصيل قبل طلبك', en: 'Courier accepted' },
  buying: { Icon: ShoppingBag, ar: 'عم يشتري أغراضك', en: 'Buying your items' },
  on_the_way: { Icon: Truck, ar: 'بالطريق لعندك', en: 'On the way' },
}
const LABELS = { ar: ['البحث', 'قبول', 'شراء', 'بالطريق'], en: ['Search', 'Accepted', 'Buying', 'On way'] }

/** حالة الطلب الحالي: شريط عائم فوق القائمة السفلية، بيبيّن وين صار الطلب بكل الصفحات */
export default function FloatingOrder({ order, onOpen }) {
  const { lang } = useLang()
  if (!order) return null
  const ar = lang === 'ar'
  const st = STEPS[order.status] || STEPS.new
  const step = OPEN_STATUSES.indexOf(order.status)
  const searching = order.status === 'new'
  const sub = searching
    ? ar
      ? 'منخبّرك أول ما يقبل عامل التوصيل'
      : "We'll notify you once accepted"
    : order.courierName
      ? `${order.courierName}${order.courier?.vehicle ? ` · ${order.courier.vehicle}` : ''}`
      : ''
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-full z-30 mb-2">
      <div className="pointer-events-auto overflow-hidden rounded-[1.4rem] bg-navy text-white shadow-float animate-fade-in">
        <div className="flex items-center gap-3 p-3">
          <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lime text-navy">
              {searching && <span className="absolute inset-0 animate-ping rounded-2xl bg-lime/60" />}
              <st.Icon size={21} className="relative" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black">{ar ? st.ar : st.en}</span>
              <span className="block truncate text-[11px] text-white/65">
                <span className="font-en">{order.number}</span>
                {sub ? ` · ${sub}` : ''}
              </span>
            </span>
          </button>
          {!searching && order.courierPhone && (
            <a href={`tel:${order.courierPhone}`} aria-label={ar ? 'اتصال بعامل التوصيل' : 'Call courier'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Phone size={17} />
            </a>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 px-3 pb-2.5">
          {LABELS[ar ? 'ar' : 'en'].map((l, i) => (
            <span key={l}>
              <span className={`block h-1.5 rounded-full ${i < step ? 'bg-lime' : i === step ? 'bg-lime animate-pulse' : 'bg-white/15'}`} />
              <span className={`mt-1 block text-center text-[10px] font-bold ${i <= step ? 'text-lime' : 'text-white/40'}`}>{l}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
