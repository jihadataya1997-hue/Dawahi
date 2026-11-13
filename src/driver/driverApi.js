// اتصال تطبيق الشب بالسيرفر
const KEY = 'dawahi.courierToken'
export const getToken = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
export const setToken = (t) => {
  try {
    t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY)
  } catch {}
}

let onLoggedOut = () => {}
export const setLoggedOutHandler = (fn) => (onLoggedOut = fn)

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken()
  let res
  try {
    res = await fetch(`/api/courier${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    const e = new Error('network')
    e.code = 'NETWORK'
    throw e
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && token && path !== '/login') onLoggedOut()
    const e = new Error(data?.error?.message || 'error')
    e.code = data?.error?.code || 'INTERNAL'
    throw e
  }
  return data
}

export async function photoUrl(name) {
  const res = await fetch(`/api/courier/uploads/${name}`, { headers: { authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('photo')
  return URL.createObjectURL(await res.blob())
}

const ERR = {
  NETWORK: 'ما في نت، جرّب مرة ثانية',
  WRONG_LOGIN: 'الرقم أو الرمز غلط',
  RATE_LIMITED: 'محاولات كتيرة، استنى ربع ساعة',
  BAD_TRANSITION: 'الطلب تغيّر، حدّث الصفحة',
  CHANGED: 'الطلب تغيّر، حدّث الصفحة',
  NOT_FOUND: 'هالطلب ما عاد إلك',
}
export const errText = (e) => ERR[e?.code] || 'صار خطأ، جرّب مرة ثانية'
