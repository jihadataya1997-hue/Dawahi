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
  NETWORK: 'لا يوجد اتصال بالإنترنت، حاول مرة أخرى',
  WRONG_LOGIN: 'الرقم أو الرمز غير صحيح',
  RATE_LIMITED: 'محاولات كثيرة، انتظر ربع ساعة',
  BAD_TRANSITION: 'تغيّرت حالة الطلب، حدّث الصفحة',
  CHANGED: 'تغيّرت حالة الطلب، حدّث الصفحة',
  NOT_FOUND: 'هذا الطلب لم يعد مسنداً إليك',
}
export const errText = (e) => ERR[e?.code] || 'حدث خطأ، حاول مرة أخرى'
