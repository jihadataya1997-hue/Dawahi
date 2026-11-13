import { useState } from 'react'
import { ChevronLeft, Phone, UserRound } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import { useLang } from '../i18n/LanguageProvider'
import { isValidSyrianMobile, useAuth } from '../auth/AuthProvider'

export default function LoginScreen() {
  const { t, lang, toggleLang } = useLang()
  const { login } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return setError(t('auth.nameErr'))
    if (!isValidSyrianMobile(phone)) return setError(t('auth.phoneErr'))
    login({ name, phone: phone.replace(/\s/g, '') })
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-navy">
      {/* الجزء العلوي */}
      <div className="pt-safe relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-10 text-center">
        <div className="pointer-events-none absolute -end-20 -top-20 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 h-56 w-56 rounded-full bg-white/5" />
        <button
          onClick={toggleLang}
          className="absolute end-4 top-4 mt-[env(safe-area-inset-top)] rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white active:scale-95"
        >
          {lang === 'ar' ? 'English' : 'عربي'}
        </button>
        <LogoMark className="relative h-20 w-20 drop-shadow-xl" />
        <h1 className="relative mt-5 text-3xl font-extrabold text-white">{lang === 'ar' ? 'ضواحي' : 'Dawahi'}</h1>
        <p className="relative mt-1 text-xs font-bold tracking-widest text-brand">{lang === 'ar' ? 'DAWAHI' : 'ضواحي'}</p>
      </div>

      {/* نموذج الدخول */}
      <form onSubmit={submit} className="pb-safe rounded-t-[2rem] bg-white px-6 pb-8 pt-8 animate-sheet-up">
        <h2 className="text-xl font-extrabold">{t('auth.welcome')}</h2>
        <p className="mt-1 text-sm text-navy/60">{t('auth.sub')}</p>

        <label className="mt-6 block text-sm font-bold">{t('auth.nameLabel')}</label>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-navy/10 bg-navy-50 px-3.5 transition focus-within:border-brand focus-within:bg-white">
          <UserRound size={18} className="shrink-0 text-navy/40" />
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            placeholder={t('auth.namePh')}
            autoComplete="name"
            className="min-w-0 flex-1 bg-transparent py-3.5 text-sm outline-none"
          />
        </div>

        <label className="mt-4 block text-sm font-bold">{t('auth.phoneLabel')}</label>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-navy/10 bg-navy-50 px-3.5 transition focus-within:border-brand focus-within:bg-white">
          <Phone size={18} className="shrink-0 text-navy/40" />
          <input
            type="tel"
            inputMode="numeric"
            dir="ltr"
            maxLength={12}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/[^\d ]/g, ''))
              setError('')
            }}
            placeholder="09xx xxx xxx"
            autoComplete="tel"
            className="min-w-0 flex-1 bg-transparent py-3.5 font-en text-sm tracking-wider outline-none rtl:text-end"
          />
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600 animate-fade-in">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-sm font-extrabold text-white shadow-[0_8px_20px_-8px_#FF8A00] active:scale-[0.98]"
        >
          {t('auth.login')}
          <ChevronLeft size={18} className="ltr:rotate-180" />
        </button>
        <p className="mt-4 text-center text-[11px] text-navy/40">{t('auth.note')}</p>
      </form>
    </div>
  )
}
