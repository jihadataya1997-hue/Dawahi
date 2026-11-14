import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

// رقم نسخة التطبيق المنزّل على الموبايل (من الـ User-Agent)، أو 0 إذا متصفح أو نسخة قديمة
const installed = () => Number(/ZappBuild\/(\d+)/.exec(navigator.userAgent)?.[1] || 0)
const isApp = () => /ZappApp\//.test(navigator.userAgent)

/**
 * تنبيه "في نسخة جديدة": بيطلع بس جوّا تطبيق الأندرويد لما نبني APK أحدث.
 * التعديلات العادية (التصميم، الأسعار، المطاعم...) بتوصل لحالها بدون تنزيل.
 */
export default function UpdateNotice({ driver = false }) {
  const [latest, setLatest] = useState(null)
  useEffect(() => {
    if (!isApp()) return
    fetch('/apk/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!v?.versionCode) return
        const mine = installed()
        // نسخة ما فيها رقم = أقدم من نظام التحديث
        if (mine >= v.versionCode) return
        try {
          if (localStorage.getItem('zapp.updateDismissed') === String(v.versionCode)) return
        } catch {}
        setLatest(v)
      })
      .catch(() => {})
  }, [])
  if (!latest) return null
  const dismiss = () => {
    try {
      localStorage.setItem('zapp.updateDismissed', String(latest.versionCode))
    } catch {}
    setLatest(null)
  }
  return (
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-navy p-3 text-white shadow-float animate-fade-in">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-navy">
        <Download size={20} />
      </span>
      <span className="min-w-0 flex-1 text-xs">
        <b className="block text-sm">في نسخة جديدة من التطبيق</b>
        نزّلها وثبّتها فوق القديمة، حساباتك بتضل متل ما هي.
      </span>
      <a href={driver ? '/apk/zapp-driver.apk' : '/apk/zapp.apk'} className="shrink-0 rounded-xl bg-lime px-3 py-2 text-xs font-black text-navy">
        تحديث
      </a>
      <button onClick={dismiss} aria-label="لاحقاً" className="shrink-0 p-1 text-white/60">
        <X size={16} />
      </button>
    </div>
  )
}
