// تفعيل التنبيهات (Web Push) — مشترك بين تطبيق الزبون والشب ولوحة التحكم
const urlB64ToUint8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

/**
 * الحالات: 'unsupported' | 'ios-install' (آيفون: لازم يضيفه للشاشة الرئيسية أولاً)
 *          | 'denied' | 'enabled' | 'off'
 */
export async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'enabled' : 'off'
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

/** يطلب الإذن ويشترك ويرسل الاشتراك للسيرفر. send = (subscription) => Promise */
export async function enablePush(send) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denied' : 'dismissed')
  const reg = (await registerSW()) && (await navigator.serviceWorker.ready)
  const { key } = await fetch('/api/push/key').then((r) => r.json())
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) })
  await send(sub.toJSON())
  return sub
}

export async function disablePush(remove) {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await remove(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
}
