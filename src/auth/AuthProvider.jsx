import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// حساب الزبون — حالياً يُحفظ على جهازه فقط.
// لاحقاً عند بناء السيرفر: يُرسل الرقم للسيرفر ويصل الزبون رمز تحقق.
const AuthContext = createContext(null)
const KEY = 'dawahi.user'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(load)

  const login = useCallback((data) => {
    const u = { name: data.name.trim(), phone: data.phone.trim() }
    try {
      localStorage.setItem(KEY, JSON.stringify(u))
    } catch {}
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {}
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export const isValidSyrianMobile = (p) => /^09\d{8}$/.test(p.replace(/\s/g, ''))
