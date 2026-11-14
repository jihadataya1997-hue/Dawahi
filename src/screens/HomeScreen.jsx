import { Bell, BookOpen, ChevronLeft, Flame, Fuel, MapPin, PencilLine, Pill, ShieldCheck, ShoppingCart, Truck, UtensilsCrossed, Wallet, BellRing } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import BannerCarousel from '../components/BannerCarousel'
import { useLang } from '../i18n/LanguageProvider'
import { useAppConfig } from '../config/AppConfigProvider'
import { OPEN_STATUSES } from '../orders/OrdersProvider'

const ICONS = {
  restaurants: { Icon: UtensilsCrossed },
  supermarket: { Icon: ShoppingCart },
  gas: { Icon: Flame },
  diesel: { Icon: Fuel },
  pharmacy: { Icon: Pill },
  library: { Icon: BookOpen },
}

/**
 * الصفحة الرئيسية — ترتيب واضح:
 * ١) الشريط العلوي + زر الطلب الرئيسي  ٢) الطلب الحالي (إن وجد)  ٣) الإعلانات  ٤) الخدمات  ٥) لماذا ZAPP
 */
export default function HomeScreen({ activeOrder, unread, onBell, onOrder, onService, onBanner, onOpenOrders }) {
  const { t, lang, toggleLang } = useLang()
  const { areaName, texts, services, pricing, money } = useAppConfig()
  const list = services.filter((s) => s.enabled !== false && ICONS[s.id])
  const heroTitle = lang === 'ar' && texts.heroTitle ? texts.heroTitle : t('hero.title')

  return (
    <div className="pb-6">
      {/* ١) الشريط العلوي */}
      <header className="speed-bg pt-safe rounded-b-[2rem] bg-navy px-4 pb-6 text-white">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <LogoMark className="h-10 w-10" />
            <span className="font-brand text-2xl font-black italic tracking-tight text-brand">ZAPP</span>
          </div>
          <button
            onClick={toggleLang}
            aria-label="Language"
            className="flex h-10 items-center rounded-full bg-white/10 px-3 font-en text-xs font-bold active:scale-95"
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button onClick={onBell} aria-label={t('inbox.title')} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10 active:scale-95">
            <Bell size={19} />
            {unread > 0 && (
              <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-navy bg-brand px-1 text-[10px] font-bold">
                {unread}
              </span>
            )}
          </button>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-white/60">
          <MapPin size={14} className="shrink-0 text-brand" />
          {t('deliverTo')} <b className="font-bold text-white">{areaName}</b>
        </p>

        {/* زر الطلب الرئيسي */}
        <button
          onClick={onOrder}
          className="mt-3 flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-start text-navy shadow-float active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
            <PencilLine size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-extrabold">{t('searchPlaceholder')}</span>
            <span className="block truncate text-xs text-navy/55">{heroTitle}</span>
          </span>
          <ChevronLeft size={20} className="shrink-0 text-navy/30 ltr:rotate-180" />
        </button>
      </header>

      <div className="space-y-7 px-4 pt-5">
        {/* ٢) الطلب الحالي */}
        {activeOrder && <ActiveOrderCard order={activeOrder} onClick={onOpenOrders} />}

        {/* ٣) الإعلانات */}
        <BannerCarousel onAction={onBanner} />

        {/* ٤) الخدمات */}
        {list.length > 0 && (
          <section>
            <h2 className="mb-3 text-base font-extrabold">{t('services')}</h2>
            <div className="grid grid-cols-3 gap-3">
              {list.map((s) => {
                const { Icon } = ICONS[s.id]
                return (
                  <button
                    key={s.id}
                    onClick={() => onService(s.id)}
                    className="flex flex-col items-center gap-2 rounded-3xl bg-white px-2 py-4 shadow-soft active:scale-95"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-brand">
                      <Icon size={24} strokeWidth={2.2} />
                    </span>
                    <span className="text-[13px] font-bold">{lang === 'ar' && s.label ? s.label : t(`svc.${s.id}`)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ٥) لماذا ZAPP */}
        <section className="grid grid-cols-3 gap-2 rounded-3xl bg-white p-3 shadow-soft">
          <Trust Icon={Wallet} title={lang === 'ar' ? 'الدفع عند الاستلام' : 'Pay on delivery'} />
          <Trust Icon={ShieldCheck} title={lang === 'ar' ? `توصيل ${money(pricing.deliveryFee)}` : `Delivery ${money(pricing.deliveryFee)}`} />
          <Trust Icon={BellRing} title={lang === 'ar' ? 'إشعار بكل خطوة' : 'Live updates'} />
        </section>
      </div>
    </div>
  )
}

function Trust({ Icon, title }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-1 py-2 text-center">
      <Icon size={20} className="text-brand" />
      <span className="text-[11px] font-bold leading-tight text-navy/70">{title}</span>
    </div>
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
