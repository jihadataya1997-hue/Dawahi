import { useEffect, useState } from 'react'
import { Phone, RefreshCw, Wrench, X, Zap } from 'lucide-react'
import { useAppConfig } from '../config/AppConfigProvider'
import { useLang } from '../i18n/LanguageProvider'

/** شاشة الصيانة: بتغطي التطبيق كله لما الإدارة تفعّل وضع الصيانة */
export function MaintenanceScreen() {
  const { maintenance, texts, refresh } = useAppConfig()
  const { lang } = useLang()
  const [busy, setBusy] = useState(false)
  const retry = async () => {
    setBusy(true)
    await refresh()
    setTimeout(() => setBusy(false), 600)
  }
  return (
    <div className="speed-bg pt-safe mx-auto flex h-full max-w-md flex-col items-center justify-center bg-brand px-8 text-center text-white">
      <img src="/wordmark.webp" alt="ZAPP" className="w-48" />
      <span className="mt-10 flex h-16 w-16 items-center justify-center rounded-3xl bg-lime text-navy">
        <Wrench size={30} />
      </span>
      <h1 className="mt-5 text-2xl font-black">{maintenance.title || (lang === 'ar' ? 'التطبيق قيد الصيانة' : 'Under maintenance')}</h1>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/80">{maintenance.message}</p>
      <button onClick={retry} className="btn-zap mt-8 flex items-center gap-2 bg-lime px-8 py-3.5 text-sm font-extrabold text-navy active:scale-95">
        <RefreshCw size={17} className={busy ? 'animate-spin' : ''} />
        {lang === 'ar' ? 'حاول مرة أخرى' : 'Try again'}
      </button>
      {texts.supportPhone && (
        <a href={`tel:${texts.supportPhone}`} className="mt-4 flex items-center gap-2 text-sm font-bold text-white/80">
          <Phone size={16} /> {lang === 'ar' ? 'اتصل بالدعم' : 'Call support'}
        </a>
      )}
    </div>
  )
}

const SEEN = 'zapp.popupSeen'
const today = () => new Date().toISOString().slice(0, 10)
const sessionShown = new Set()

/** النافذة المنبثقة اللي بتحددها الإدارة (مرة وحدة، أو مرة باليوم، أو كل فتحة) */
export function PromoPopup({ onAction }) {
  const { popup } = useAppConfig()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!popup) return setShow(false)
    let seen = {}
    try {
      seen = JSON.parse(localStorage.getItem(SEEN) || '{}')
    } catch {}
    const key = String(popup.id)
    const already =
      popup.frequency === 'always' ? sessionShown.has(key) : popup.frequency === 'daily' ? seen[key] === today() : !!seen[key]
    if (already) return
    const t = setTimeout(() => setShow(true), 700)
    return () => clearTimeout(t)
  }, [popup])

  if (!show || !popup) return null
  const close = () => {
    const key = String(popup.id)
    sessionShown.add(key)
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN) || '{}')
      seen[key] = today()
      localStorage.setItem(SEEN, JSON.stringify(seen))
    } catch {}
    setShow(false)
  }
  const act = () => {
    close()
    onAction(popup)
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/60 p-6 animate-fade-in" onClick={close}>
      <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-white shadow-float" onClick={(e) => e.stopPropagation()}>
        <button onClick={close} aria-label="إغلاق" className="absolute end-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-navy/40 text-white backdrop-blur">
          <X size={18} />
        </button>
        {popup.image ? (
          <img src={popup.image} alt="" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="speed-bg flex h-28 items-center justify-center bg-brand">
            <Zap size={40} className="text-lime" />
          </div>
        )}
        <div className="p-5 text-center">
          <h2 className="text-xl font-black">{popup.title}</h2>
          {popup.body && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-navy/65">{popup.body}</p>}
          {popup.action !== 'none' && popup.buttonText ? (
            <button onClick={act} className="btn-zap mt-5 w-full bg-brand py-3.5 text-sm font-extrabold text-white active:scale-95">
              {popup.buttonText}
            </button>
          ) : (
            <button onClick={close} className="mt-5 w-full rounded-2xl bg-navy/5 py-3.5 text-sm font-extrabold active:scale-95">
              {popup.buttonText || 'حسناً'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** تنبيه صغير أسفل الشاشة */
export function Toast({ text, onDone }) {
  useEffect(() => {
    if (!text) return
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [text, onDone])
  if (!text) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[80] flex justify-center px-6">
      <p className="animate-fade-in rounded-2xl bg-navy px-4 py-3 text-center text-sm font-bold text-white shadow-float">{text}</p>
    </div>
  )
}
