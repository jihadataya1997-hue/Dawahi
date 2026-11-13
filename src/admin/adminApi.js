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

export async function downloadBackup(name) {
  const res = await fetch(`/api/admin/backups/${name}`, { headers: { authorization: `Bearer ${getAdminToken()}` } })
  if (!res.ok) throw new Error('download')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

const ERR = {
  NETWORK: 'لا يوجد اتصال بالإنترنت',
  WRONG_PASSWORD: 'رقم الموبايل أو كلمة السر غير صحيحة',
  FORBIDDEN: 'لا تملك صلاحية لهذا الإجراء',
  WEAK_PASSWORD: 'كلمة السر 8 أحرف على الأقل',
  PHONE_TAKEN: 'هذا الرقم مستخدم لحساب آخر',
  NAME_TAKEN: 'يوجد دور بهذا الاسم',
  ROLE_IN_USE: 'لا يمكن حذف دور مرتبط بحسابات',
  RATE_LIMITED: 'محاولات كثيرة، انتظر ربع ساعة',
  NOT_CONFIGURED: 'كلمة سر الإدارة غير مضبوطة على السيرفر',
  COURIER_REQUIRED: 'اكتب اسم شب التوصيل',
  BAD_TRANSITION: 'لا يمكن نقل الطلب لهذه الحالة',
  CHANGED: 'الطلب تغيّر، حدّث الصفحة',
  INVALID: 'قيمة غير صحيحة',
  INVALID_PHONE: 'رقم الشب لازم يبلش بـ 09 ويكون 10 أرقام',
}
export const adminErrorText = (e) => ERR[e?.code] || 'صار خطأ، جرّب مرة ثانية'
