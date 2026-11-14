import { useEffect, useState } from 'react'
import { BellRing, Check, LoaderCircle, MapPin } from 'lucide-react'
import { api } from '../api'
import { enableNativePush, enablePush, isNativePushApp, nativePushState, pushState } from '../push'
import { isNativeApp } from '../native'
import { useLang } from '../i18n/LanguageProvider'

const KEY = 'zapp.permsDone'
export const permsDone = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

async function notifState() {
  if (isNativePushApp()) return nativePushState()
  if (isNativeApp()) return 'unsupported'
  return pushState().catch(() => 'unsupported')
}
async function askNotifications() {
  if (isNativePushApp()) return enableNativePush((token) => api('/push/native', { method: 'POST', body: { token } }))
  return enablePush((subscription) => api('/push', { method: 'POST', body: { subscription } }))
}
function askLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve('unsupported')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        try {
          localStorage.setItem('zapp.lastLocation', JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }))
        } catch {}
        resolve('enabled')
      },
      (e) => resolve(e.code === 1 ? 'denied' : 'enabled'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  })
}

/** أول ما يفتح الزبون التطبيق: منطلب الإشعارات والموقع بشرح بسيط، مرة وحدة */
export default function PermissionsScreen({ onDone }) {
  const { lang } = useLang()
  const ar = lang === 'ar'
  const [notif, setNotif] = useState(null)
  const [loc, setLoc] = useState(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    notifState().then(setNotif)
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => setLoc(p.state === 'granted' ? 'enabled' : p.state === 'denied' ? 'denied' : 'off'))
      .catch(() => setLoc('off'))
  }, [])

  const finish = () => {
    try {
      localStorage.setItem(KEY, '1')
      localStorage.setItem('zapp.pushAsked', '1')
    } catch {}
    onDone()
  }
  const doNotif = async () => {
    setBusy('n')
    try {
      await askNotifications()
      setNotif('enabled')
    } catch (e) {
      setNotif(e.message === 'denied' ? 'denied' : 'unsupported')
    } finally {
      setBusy('')
    }
  }
  const doLoc = async () => {
    setBusy('l')
    setLoc(await askLocation())
    setBusy('')
  }
  // زر وحدة بيطلب الاتنين ورا بعض
  const all = async () => {
    if (notif !== 'enabled' && notif !== 'unsupported') await doNotif()
    if (loc !== 'enabled') await doLoc()
    finish()
  }

  const Row = ({ Icon, title, sub, state, onClick, k }) => (
    <button onClick={onClick} disabled={state === 'enabled' || busy} className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-start text-navy shadow-soft">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${state === 'enabled' ? 'bg-lime text-navy' : 'bg-brand text-white'}`}>
        {busy === k ? <LoaderCircle size={22} className="animate-spin" /> : state === 'enabled' ? <Check size={22} strokeWidth={3} /> : <Icon size={22} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold">{title}</span>
        <span className="block text-xs text-navy/55">
          {state === 'denied' ? (ar ? 'مرفوض. فعّلها من إعدادات الموبايل ← التطبيقات ← ZAPP' : 'Blocked. Enable it in phone settings') : sub}
        </span>
      </span>
      {state !== 'enabled' && state !== 'denied' && <span className="text-xs font-bold text-brand">{ar ? 'فعّل' : 'Allow'}</span>}
    </button>
  )

  const showNotif = notif && notif !== 'unsupported'
  return (
    <div className="pt-safe pb-safe mx-auto flex h-full max-w-md flex-col overflow-y-auto bg-brand px-6 text-white">
      <div className="flex-1 pt-14">
        <img src="/wordmark.webp" alt="ZAPP" className="h-10 w-auto" />
        <h1 className="mt-8 text-[32px] font-black leading-tight">{ar ? 'خطوة وحدة قبل ما نبلّش' : 'One step before we start'}</h1>
        <p className="mt-2 text-white/75">
          {ar ? 'اسمحلنا بهالشغلتين حتى نوصّلك طلبك لباب البيت ونخبّرك وين صار.' : 'Allow these so we can deliver to your door and keep you updated.'}
        </p>
        <div className="mt-8 space-y-3">
          {showNotif && (
            <Row
              k="n"
              Icon={BellRing}
              title={ar ? 'الإشعارات' : 'Notifications'}
              sub={ar ? 'لتعرف أول ما يقبل عامل التوصيل طلبك ووين صار' : 'Know when a courier accepts and where your order is'}
              state={notif}
              onClick={doNotif}
            />
          )}
          <Row
            k="l"
            Icon={MapPin}
            title={ar ? 'الموقع' : 'Location'}
            sub={ar ? 'لنحدد بيتك عالخريطة بسرعة ويوصلك عامل التوصيل بدون ما يضيع' : 'To pin your home quickly'}
            state={loc}
            onClick={doLoc}
          />
        </div>
      </div>
      <div className="pb-8 pt-6">
        <button onClick={all} disabled={!!busy} className="flex w-full items-center justify-center rounded-2xl bg-lime py-4 text-base font-black text-navy disabled:opacity-70">
          {busy ? <LoaderCircle size={20} className="animate-spin" /> : (notif === 'enabled' || !showNotif) && loc === 'enabled' ? (ar ? 'يلا نبلّش' : "Let's go") : ar ? 'اسمح وكمّل' : 'Allow and continue'}
        </button>
        <button onClick={finish} className="mt-3 w-full py-2 text-sm font-bold text-white/60">
          {ar ? 'لاحقاً' : 'Later'}
        </button>
      </div>
    </div>
  )
}
