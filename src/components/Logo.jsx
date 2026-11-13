import { useLang } from '../i18n/LanguageProvider'

// شعار ضواحي: دبوس موقع بداخله سقف بيت
export function LogoMark({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#FF8A00" />
      <path d="M24 8c-7.2 0-13 5.8-13 13 0 9.5 13 19.5 13 19.5S37 30.5 37 21c0-7.2-5.8-13-13-13z" fill="#fff" />
      <path d="M17.5 22.5 24 17l6.5 5.5v6.2a1 1 0 0 1-1 1H26v-4.2h-4v4.2h-3.5a1 1 0 0 1-1-1z" fill="#1E2E4A" />
    </svg>
  )
}

export default function Logo() {
  const { lang } = useLang()
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="text-xl font-extrabold text-white">{lang === 'ar' ? 'ضواحي' : 'Dawahi'}</div>
        <div className="mt-1 text-[10px] font-semibold tracking-wider text-brand">
          {lang === 'ar' ? 'DAWAHI' : 'ضواحي'}
        </div>
      </div>
    </div>
  )
}
