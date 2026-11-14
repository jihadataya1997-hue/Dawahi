// نبضة حضور خفيفة كل 30 ثانية: تعرّف لوحة الإدارة كم شخص فاتح التطبيق هلق
// ما فيها أي بيانات شخصية — بس رقم عشوائي للجهاز
const KEY = 'zapp.device'

function deviceId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      const b = new Uint8Array(16)
      crypto.getRandomValues(b)
      id = btoa(String.fromCharCode(...b)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c])
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return null
  }
}

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

export function startPresence(app) {
  const id = deviceId()
  if (!id) return
  const ping = (extra = {}) =>
    fetch('/api/presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: id, app, standalone: standalone(), ...extra }),
      keepalive: true,
    }).catch(() => {})
  const beat = () => document.visibilityState === 'visible' && ping()
  ping()
  setInterval(beat, 30000)
  document.addEventListener('visibilitychange', beat)
  window.addEventListener('appinstalled', () => ping({ installed: true }))
}
