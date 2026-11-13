import { Bell, ChevronDown, MapPin } from 'lucide-react'
import Logo from './Logo'
import { useLang } from '../i18n/LanguageProvider'

export default function Header() {
  const { t, lang, toggleLang } = useLang()

  return (
    <header className="pt-safe relative overflow-hidden rounded-b-[2rem] bg-navy px-4 pb-12 pt-4">
      {/* زخرفة خلفية خفيفة */}
      <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-brand/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -start-10 h-40 w-40 rounded-full bg-white/5" />

      <div className="relative flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          {/* زر تبديل اللغة */}
          <button
            onClick={toggleLang}
            aria-label="Switch language"
            className="flex h-10 items-center rounded-full bg-white/10 p-1 text-xs font-bold text-white backdrop-blur transition active:scale-95"
          >
            <span className={`rounded-full px-2.5 py-1.5 transition ${lang === 'ar' ? 'bg-brand' : 'text-white/60'}`}>ع</span>
            <span className={`rounded-full px-2.5 py-1.5 font-en transition ${lang === 'en' ? 'bg-brand' : 'text-white/60'}`}>En</span>
          </button>
          {/* الإشعارات */}
          <button
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95"
          >
            <Bell size={20} />
            <span className="absolute end-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-navy bg-brand" />
          </button>
        </div>
      </div>

      {/* الموقع الحالي */}
      <button className="relative mt-5 flex items-center gap-2 text-start transition active:opacity-70">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/20 text-brand">
          <MapPin size={18} />
        </span>
        <span>
          <span className="block text-[11px] text-white/60">{t('deliverTo')}</span>
          <span className="flex items-center gap-1 text-sm font-bold text-white">
            {t('location')} <ChevronDown size={16} className="text-brand" />
          </span>
        </span>
      </button>
    </header>
  )
}
