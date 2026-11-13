import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '../api'

// حساب الزبون: يُسجَّل بالسيرفر، ويُحفظ "مفتاح الجلسة" على جهازه
const AuthContext = createContext(null)
const USER_KEY = 'dawahi.user'

function loadUser() {
  try {
    return getToken() ? JSON.parse(localStorage.getItem(USER_KEY)) || null : null
  } catch {
    return null
  }
}
function saveUser(u) {
  try {
    u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY)
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser)

  const clear = useCallback(() => {
    setToken(null)
    saveUser(null)
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(clear)
    // تحديث بيانات الزبون من السيرفر عند فتح التطبيق
    if (getToken()) api('/me').then((d) => (saveUser(d.user), setUser(d.user))).catch(() => {})
  }, [clear])

  const login = useCallback(async ({ name, phone }) => {
    const d = await api('/auth/login', { method: 'POST', body: { name: name.trim(), phone: phone.replace(/\s/g, '') } })
    setToken(d.token)
    saveUser(d.user)
    setUser(d.user)
  }, [])

  const updateName = useCallback(async (name) => {
    const d = await api('/me', { method: 'PATCH', body: { name } })
    saveUser(d.user)
    setUser(d.user)
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    clear()
  }, [clear])

  const value = useMemo(() => ({ user, login, logout, updateName }), [user, login, logout, updateName])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export const isValidSyrianMobile = (p) => /^09\d{8}$/.test(p.replace(/\s/g, ''))
