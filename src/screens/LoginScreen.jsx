import { useState } from 'react'
import { ChevronLeft, KeyRound, LoaderCircle, Phone, UserRound } from 'lucide-react'
import { useAppConfig } from '../config/AppConfigProvider'
import { errorText } from '../i18n/errorText'
import { LogoMark } from '../components/Logo'
import { useLang } from '../i18n/LanguageProvider'
import { isValidSyrianMobile, useAuth } from '../auth/AuthProvider'

export default function LoginScreen() {
  const { t, lang, toggleLang } = useLang()
  const { login, register } = useAuth()
  const { texts } = useAppConfig()
  const [mode, setMode] = useState('login') // login | register
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    // الاسم الكامل: كلمتان على الأقل
    if (mode === 'register' && name.trim().split(/\s+/).filter((w) => w.length >= 2).length < 2) return setError(t('auth.nameErr'))
    if (!isValidSyrianMobile(phone)) return setError(t('auth.phoneErr'))
    if (password.length < 6) return setError(t('auth.passErr'))
    setBusy(true)
    try {
      if (mode === 'register') await register({ name, phone, password })
      else await login({ phone, password })
    } catch (err) {
      setError(errorText(t, err))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-brand">
      {/* الجزء العلوي */}
      <div className="speed-bg pt-safe relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-10 text-center">
        <div className="pointer-events-none absolute -end-20 -top-20 h-64 w-64 rounded-full bg-lime/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 h-56 w-56 rounded-full bg-white/5" />
        <button
          onClick={toggleLang}
          className="absolute end-4 top-4 mt-[env(safe-area-inset-top)] rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white active:scale-95"
        >
          {lang === 'ar' ? 'English' : 'عربي'}
        </button>
        <img src="/wordmark.webp" alt="ZAPP Delivery" className="relative w-[78%] max-w-xs" />
      </div>

      {/* نموذج الدخول */}
      <form onSubmit={submit} className="pb-safe rounded-t-[2rem] bg-white px-6 pb-8 pt-8 animate-sheet-up">
        <h2 className="text-xl font-extrabold">{t('auth.welcome')}</h2>
        <p className="mt-1 text-sm text-navy/60">{t('auth.sub')}</p>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-navy-50 p-1">
          {['login', 'register'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => (setMode(k), setError(''))}
              className={`rounded-xl py-2.5 text-sm font-extrabold transition ${mode === k ? 'bg-white text-brand shadow-sm' : 'text-navy/50'}`}
            >
              {t(k === 'login' ? 'auth.tabLogin' : 'auth.tabRegister')}
            </button>
          ))}
        </div>

        {mode === 'register' && (<>
        <label className="mt-5 block text-sm font-bold">{t('auth.nameLabel')}</label>
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
        </>)}

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

        <label className="mt-4 block text-sm font-bold">{t('auth.passLabel')}</label>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-navy/10 bg-navy-50 px-3.5 transition focus-within:border-brand focus-within:bg-white">
          <KeyRound size={18} className="shrink-0 text-navy/40" />
          <input
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => (setPassword(e.target.value), setError(''))}
            placeholder={t('auth.passPh')}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            className="min-w-0 flex-1 bg-transparent py-3.5 font-en text-sm outline-none rtl:text-end"
          />
        </div>
        {mode === 'login' && texts.supportPhone && (
          <a
            href={`https://wa.me/963${texts.supportPhone.slice(1)}?text=${encodeURIComponent(t('auth.forgotMsg') + phone.replace(/\s/g, ''))}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs font-bold text-brand"
          >
            {t('auth.forgot')}
          </a>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600 animate-fade-in">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-zap mt-6 disabled:opacity-70 flex w-full items-center justify-center gap-2 bg-brand py-4 text-sm font-extrabold text-white shadow-[0_8px_20px_-8px_#4B1FE0] active:scale-[0.98]"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : t(mode === 'register' ? 'auth.register' : 'auth.login')}
          {!busy && <ChevronLeft size={18} className="ltr:rotate-180" />}
        </button>
        <p className="mt-4 text-center text-[11px] text-navy/40">{t('auth.note')}</p>
      </form>
    </div>
  )
}
