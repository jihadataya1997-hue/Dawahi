import { useEffect, useState } from 'react'
import { api } from '../api'
import { Check, FileText, Globe, KeyRound, LoaderCircle, LogOut, MapPin, MessageCircle, Pencil, Phone, ShieldCheck, Trash2 } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { useAuth } from '../auth/AuthProvider'
import { useAppConfig } from '../config/AppConfigProvider'
import MyAddresses from '../addresses/MyAddresses'

export default function AccountScreen() {
  const { t, lang, toggleLang } = useLang()
  const { user, updateName, logout } = useAuth()
  const { areaName, texts } = useAppConfig()
  const support = texts.supportPhone
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name)

  const save = async () => {
    if (name.trim().split(/\s+/).filter((w) => w.length >= 2).length < 2) return
    try {
      await updateName(name.trim())
      setEditing(false)
    } catch {
      /* يبقى بوضع التعديل ليحاول مرة ثانية */
    }
  }

  return (
    <div className="animate-fade-in">
      <header className="speed-bg pt-safe rounded-b-[2rem] bg-brand px-5 pb-8 pt-6 text-white">
        <h1 className="text-lg font-extrabold">{t('account.title')}</h1>
        <div className="mt-5 flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-lime text-2xl font-extrabold text-navy">
            {user.name.charAt(0)}
          </span>
          {editing ? (
            <div className="min-w-0 flex-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none focus:bg-white/20"
              />
              <p dir="ltr" className="mt-1 font-en text-xs text-white/50 rtl:text-end">{user.phone}</p>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold">{user.name}</p>
              <p dir="ltr" className="mt-0.5 flex items-center gap-1.5 font-en text-sm text-white/60 rtl:justify-end">
                {user.phone} <Phone size={13} />
              </p>
            </div>
          )}
          <button
            onClick={editing ? save : () => setEditing(true)}
            aria-label={editing ? t('account.save') : t('account.edit')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 active:scale-95"
          >
            {editing ? <Check size={18} /> : <Pencil size={16} />}
          </button>
        </div>
      </header>

      <MyAddresses />

      <ul className="mx-4 mt-4 divide-y divide-navy/5 overflow-hidden rounded-3xl bg-white shadow-soft">
        <Row Icon={Globe} label={t('account.language')} value={lang === 'ar' ? 'العربية' : 'English'} onClick={toggleLang} />
        <Row Icon={MapPin} label={t('account.area')} value={areaName} />
        {support && (
          <Row
            Icon={MessageCircle}
            label={t('account.support')}
            value={support}
            onClick={() => window.open(`https://wa.me/963${support.slice(1)}`, '_blank')}
          />
        )}
        <Row Icon={ShieldCheck} label={lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy policy'} onClick={() => window.open('https://zapp.prodev.cloud/privacy', '_blank')} />
        <Row Icon={FileText} label={lang === 'ar' ? 'شروط الاستخدام' : 'Terms of use'} onClick={() => window.open('https://zapp.prodev.cloud/terms', '_blank')} />
      </ul>

      <PointsCard />
      <ChangePassword />

      <button
        onClick={logout}
        className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-2xl bg-rose-50 py-3.5 text-sm font-bold text-rose-600 active:scale-[0.98]"
      >
        <LogOut size={18} className="rtl:-scale-x-100" />
        {t('account.logout')}
      </button>

      <DeleteAccount />
    </div>
  )
}

// حذف الحساب نهائياً (مطلوب من Google Play)
function DeleteAccount() {
  const { lang } = useLang()
  const { user, deleteAccount } = useAuth()
  const ar = lang === 'ar'
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const needPass = true
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      await deleteAccount(password)
    } catch (err) {
      setMsg(
        err?.code === 'WRONG_PASSWORD'
          ? ar ? 'كلمة السر غلط' : 'Wrong password'
          : err?.code === 'ACTIVE_ORDER'
            ? ar ? 'عندك طلب شغّال. استنى ليخلص أو ألغيه أول' : 'You have an active order. Wait for it to finish or cancel it first'
            : ar ? 'صار خطأ، جرّب مرة تانية' : 'Something went wrong, try again'
      )
      setBusy(false)
    }
  }
  return (
    <div className="mx-4 mb-8 mt-6 text-center">
      {!open ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-navy/45 underline-offset-4 hover:underline">
          <Trash2 size={14} /> {ar ? 'حذف حسابي' : 'Delete my account'}
        </button>
      ) : (
        <form onSubmit={submit} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-start">
          <p className="text-sm font-extrabold text-rose-700">{ar ? 'حذف الحساب نهائياً' : 'Delete account permanently'}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-rose-700/80">
            {ar
              ? 'رح ينمسح اسمك ورقمك وعناوينك ونقاطك وكلمة السر، وما فيك ترجعهن. الطلبات القديمة بتضل بسجلاتنا بدون أي معلومة عنك.'
              : 'Your name, number, addresses, points and password will be erased and cannot be recovered. Past orders stay in our records without any of your details.'}
          </p>
          {needPass && (
            <input
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={ar ? 'اكتب كلمة السر للتأكيد' : 'Enter your password to confirm'}
              autoComplete="current-password"
              className="mt-3 w-full rounded-xl border border-rose-200 bg-white px-3 py-3 font-en text-sm outline-none focus:border-rose-400 rtl:text-end"
            />
          )}
          {msg && <p className="mt-2 text-xs font-bold text-rose-700">{msg}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => (setOpen(false), setMsg(''), setPassword(''))} className="flex-1 rounded-xl bg-white py-3 text-sm font-bold text-navy/70">
              {ar ? 'تراجع' : 'Cancel'}
            </button>
            <button disabled={busy || (needPass && !password)} className="flex flex-1 items-center justify-center rounded-xl bg-rose-600 py-3 text-sm font-extrabold text-white disabled:opacity-50">
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : ar ? 'احذف حسابي' : 'Delete my account'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function Row({ Icon, label, value, onClick }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-4 text-start active:bg-navy-50">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand">
          <Icon size={18} />
        </span>
        <span className="flex-1 text-sm font-bold">{label}</span>
        {value && <span className="text-xs text-navy/50">{value}</span>}
      </button>
    </li>
  )
}

function ChangePassword() {
  const { t, lang } = useLang()
  const { setPassword } = useAuth()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const ar = lang === 'ar'
  const submit = async (e) => {
    e.preventDefault()
    if (next.length < 6) return setMsg(t('auth.passErr'))
    setBusy(true)
    try {
      await setPassword({ current, next })
      setMsg(ar ? '✓ تغيّرت كلمة السر' : '✓ Password changed')
      setCurrent('')
      setNext('')
      setTimeout(() => (setOpen(false), setMsg('')), 1500)
    } catch (err) {
      setMsg(err?.code === 'WRONG_PASSWORD' ? (ar ? 'كلمة السر الحالية غلط' : 'Current password is wrong') : t('errors.default'))
    } finally {
      setBusy(false)
    }
  }
  const cls = 'mt-2 w-full rounded-xl border border-navy/10 bg-navy-50 px-3 py-3 font-en text-sm outline-none focus:border-brand focus:bg-white rtl:text-end'
  return (
    <div className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-sm font-bold">
        <KeyRound size={18} className="text-brand" /> {ar ? 'تغيير كلمة السر' : 'Change password'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3">
          <input type="password" dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder={ar ? 'كلمة السر الحالية' : 'Current password'} autoComplete="current-password" className={cls} />
          <input type="password" dir="ltr" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t('auth.newPass')} autoComplete="new-password" className={cls} />
          {msg && <p className="mt-2 text-center text-xs font-bold text-brand">{msg}</p>}
          <button disabled={busy} className="mt-3 flex w-full items-center justify-center rounded-xl bg-brand py-3 text-sm font-extrabold text-white">
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : t('auth.save')}
          </button>
        </form>
      )}
    </div>
  )
}

function PointsCard() {
  const { lang } = useLang()
  const [p, setP] = useState(null)
  useEffect(() => {
    api('/points').then(setP).catch(() => {})
  }, [])
  if (!p || !p.forFree) return null
  const ar = lang === 'ar'
  const pct = Math.min(100, Math.round((p.points / p.forFree) * 100))
  return (
    <div className="mx-4 mt-4 rounded-2xl bg-navy p-4 text-white">
      <div className="flex items-center justify-between">
        <span className="text-sm font-extrabold">{ar ? 'نقاطي' : 'My points'}</span>
        <span className="num-zap text-2xl text-lime">{p.points}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-white/70">
        {p.points >= p.forFree
          ? ar ? 'عندك توصيل مجاني! استعمله بآخر خطوة من طلبك الجاي.' : 'You have a free delivery! Use it at checkout.'
          : ar ? `باقي ${p.forFree - p.points} طلب لتوصيل مجاني` : `${p.forFree - p.points} more orders to a free delivery`}
      </p>
    </div>
  )
}
