import { useEffect, useState } from 'react'
import { BellRing, LoaderCircle } from 'lucide-react'
import { api } from '../api'
import { enableNativePush, enablePush, isNativePushApp, nativePushState, pushState } from '../push'
import { isNativeApp } from '../native'
import { useLang } from '../i18n/LanguageProvider'

// بطاقة صغيرة: "فعّل التنبيهات لتعرف وين صار طلبك"
export default function CustomerPushCard() {
  const { lang } = useLang()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (isNativePushApp()) {
      nativePushState().then((st) => {
        setState(st)
        // رمز الجهاز ممكن يتغيّر: منجدّده بصمت إذا الإذن موجود
        if (st === 'enabled') enableNativePush((token) => api('/push/native', { method: 'POST', body: { token } }), { prompt: false }).catch(() => {})
        // تطبيق الأندرويد: منطلب الإذن مرة وحدة تلقائياً (متل أي تطبيق)
        else if (st === 'off' && !localStorage.getItem('zapp.pushAsked')) {
          localStorage.setItem('zapp.pushAsked', '1')
          enableNativePush((token) => api('/push/native', { method: 'POST', body: { token } }))
            .then(() => setState('enabled'))
            .catch((e) => e.message === 'denied' && setState('denied'))
        }
      })
    } else if (isNativeApp()) setState('unsupported')
    else pushState().then(setState).catch(() => {})
  }, [])
  if (state !== 'off') return null
  const enable = async () => {
    setBusy(true)
    try {
      if (isNativePushApp()) await enableNativePush((token) => api('/push/native', { method: 'POST', body: { token } }))
      else await enablePush((subscription) => api('/push', { method: 'POST', body: { subscription } }))
      setState('enabled')
    } catch (e) {
      if (e.message === 'denied') setState('denied')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button onClick={enable} disabled={busy} className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-start shadow-soft">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
        {busy ? <LoaderCircle size={20} className="animate-spin" /> : <BellRing size={20} />}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-bold">{lang === 'ar' ? 'فعّل التنبيهات' : 'Turn on notifications'}</span>
        <span className="block text-xs text-navy/50">
          {lang === 'ar' ? 'لتعرف وين صار طلبك حتى والتطبيق مسكّر' : 'Know where your order is, even with the app closed'}
        </span>
      </span>
    </button>
  )
}
