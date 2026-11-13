import { useState } from 'react'
import { Check, Globe, LogOut, MapPin, MessageCircle, Pencil, Phone } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { useAuth } from '../auth/AuthProvider'
import { useAppConfig } from '../config/AppConfigProvider'

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
      <header className="pt-safe rounded-b-[2rem] bg-navy px-5 pb-8 pt-6 text-white">
        <h1 className="text-lg font-extrabold">{t('account.title')}</h1>
        <div className="mt-5 flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand text-2xl font-extrabold">
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

      <ul className="mx-4 -mt-4 divide-y divide-navy/5 overflow-hidden rounded-3xl bg-white shadow-soft">
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
      </ul>

      <button
        onClick={logout}
        className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-2xl bg-rose-50 py-3.5 text-sm font-bold text-rose-600 active:scale-[0.98]"
      >
        <LogOut size={18} className="rtl:-scale-x-100" />
        {t('account.logout')}
      </button>
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
