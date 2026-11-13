import { Bike, ChevronLeft } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { useAppConfig } from '../config/AppConfigProvider'

// البطاقة الرئيسية: "اطلب أي شي من أي محل"
export default function HeroOrderCard({ onClick }) {
  const { t, lang } = useLang()
  const { texts } = useAppConfig()
  const title = lang === 'ar' && texts.heroTitle ? texts.heroTitle : t('hero.title')
  const sub = lang === 'ar' && texts.heroSub ? texts.heroSub : t('hero.sub')
  return (
    <button
      onClick={onClick}
      className="relative flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-navy p-5 text-start text-white shadow-soft transition active:scale-[0.98]"
    >
      <span className="pointer-events-none absolute -bottom-10 -end-6 h-36 w-36 rounded-full bg-white/10" />
      <span className="relative min-w-0 flex-1">
        <span className="block text-lg font-extrabold leading-snug">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-white/90">{sub}</span>
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-xs font-extrabold">
          {t('hero.cta')}
          <ChevronLeft size={14} className="ltr:rotate-180" />
        </span>
      </span>
      <span className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
        <Bike size={44} strokeWidth={1.75} />
      </span>
    </button>
  )
}
