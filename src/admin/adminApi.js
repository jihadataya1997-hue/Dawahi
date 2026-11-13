// اتصال لوحة التحكم بالسيرفر (مفتاح جلسة منفصل عن الزبون)
const KEY = 'dawahi.adminToken'
export const getAdminToken = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
export const setAdminToken = (t) => {
  try {
    t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY)
  } catch {}
}

export class AdminError extends Error {
  constructor(status, code, message) {
    super(message)
    Object.assign(this, { status, code })
  }
}

let onLoggedOut = () => {}
export const setLoggedOutHandler = (fn) => (onLoggedOut = fn)

export async function adminApi(path, { method = 'GET', body } = {}) {
  const token = getAdminToken()
  let res
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new AdminError(0, 'NETWORK', 'لا يوجد اتصال')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && token && path !== '/login') onLoggedOut()
    throw new AdminError(res.status, data?.error?.code || 'INTERNAL', data?.error?.message || 'Error')
  }
  return data
}

export async function adminPhotoUrl(name) {
  const res = await fetch(`/api/admin/uploads/${name}`, {
    headers: { authorization: `Bearer ${getAdminToken()}` },
  })
  if (!res.ok) throw new Error('photo')
  return URL.createObjectURL(await res.blob())
}

const ERR = {
  NETWORK: 'لا يوجد اتصال بالإنترنت',
  WRONG_PASSWORD: 'كلمة السر غلط',
  RATE_LIMITED: 'محاولات كثيرة، انتظر ربع ساعة',
  NOT_CONFIGURED: 'كلمة سر الإدارة غير مضبوطة على السيرفر',
  COURIER_REQUIRED: 'اكتب اسم شب التوصيل',
  BAD_TRANSITION: 'لا يمكن نقل الطلب لهذه الحالة',
  CHANGED: 'الطلب تغيّر، حدّث الصفحة',
  INVALID: 'قيمة غير صحيحة',
}
export const adminErrorText = (e) => ERR[e?.code] || 'صار خطأ، جرّب مرة ثانية'
