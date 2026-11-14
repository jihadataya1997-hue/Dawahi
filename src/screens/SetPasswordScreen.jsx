import { useState } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { errorText } from '../i18n/errorText'
import { useLang } from '../i18n/LanguageProvider'
import { useAuth } from '../auth/AuthProvider'

// بعد كلمة سر مؤقتة من الدعم (أو حساب قديم بلا كلمة سر): لازم يحط كلمة جديدة قبل ما يكمل
export default function SetPasswordScreen() {
  const { t } = useLang()
  const { user, setPassword, logout } = useAuth()
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (next.length < 6) return setError(t('auth.passErr'))
    if (next !== again) return setError(t('auth.matchErr'))
    setBusy(true)
    try {
      await setPassword({ next })
    } catch (err) {
      setError(errorText(t, err))
      setBusy(false)
    }
  }

  const field = (value, set, ph) => (
    <div className="mt-2 flex items-center gap-2 rounded-2xl border border-navy/10 bg-navy-50 px-3.5 focus-within:border-brand focus-within:bg-white">
      <KeyRound size={18} className="shrink-0 text-navy/40" />
      <input
        type="password"
        dir="ltr"
        value={value}
        onChange={(e) => (set(e.target.value), setError(''))}
        placeholder={ph}
        autoComplete="new-password"
        className="min-w-0 flex-1 bg-transparent py-3.5 font-en text-sm outline-none rtl:text-end"
      />
    </div>
  )

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-brand">
      <div className="pt-safe flex flex-1 flex-col items-center justify-center px-6 text-center text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-lime text-navy">
          <KeyRound size={30} />
        </div>
        <h1 className="mt-4 text-2xl font-black">{t('auth.setTitle')}</h1>
        <p className="mt-2 text-sm text-white/70">{t('auth.setSub')}</p>
        <p dir="ltr" className="mt-1 font-en text-xs text-white/50">{user?.phone}</p>
      </div>
      <form onSubmit={submit} className="pb-safe rounded-t-[2rem] bg-white px-6 pb-8 pt-7">
        <label className="block text-sm font-bold">{t('auth.newPass')}</label>
        {field(next, setNext, t('auth.passPh'))}
        <label className="mt-4 block text-sm font-bold">{t('auth.confirmPass')}</label>
        {field(again, setAgain, '')}
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="btn-zap mt-6 flex w-full items-center justify-center bg-brand py-4 text-sm font-extrabold text-white disabled:opacity-70"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : t('auth.save')}
        </button>
        <button type="button" onClick={logout} className="mt-3 w-full py-2 text-xs font-bold text-navy/50">
          {t('account.logout')}
        </button>
      </form>
    </div>
  )
}
