import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth/AuthProvider'

// عناوين الزبون المحفوظة على السيرفر (بتضل حتى لو غيّر موبايله)
const Ctx = createContext(null)
const KEY = 'zapp.addresses'

function cached(userId) {
  try {
    const c = JSON.parse(localStorage.getItem(KEY))
    return c?.userId === userId ? c.list : []
  } catch {
    return []
  }
}

export function AddressesProvider({ children }) {
  const { user } = useAuth()
  const [list, setList] = useState(() => (user ? cached(user.id) : []))
  const [loaded, setLoaded] = useState(false)

  const apply = useCallback(
    (addresses) => {
      setList(addresses)
      try {
        localStorage.setItem(KEY, JSON.stringify({ userId: user?.id, list: addresses }))
      } catch {}
    },
    [user]
  )

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const d = await api('/addresses')
      apply(d.addresses)
    } catch {
    } finally {
      setLoaded(true)
    }
  }, [user, apply])

  useEffect(() => {
    setList(user ? cached(user.id) : [])
    setLoaded(false)
    refresh()
  }, [user, refresh])

  const add = useCallback(async (a) => {
    const d = await api('/addresses', { method: 'POST', body: a })
    apply(d.addresses)
    return d.address
  }, [apply])
  const update = useCallback(async (id, patch) => apply((await api(`/addresses/${id}`, { method: 'PATCH', body: patch })).addresses), [apply])
  const remove = useCallback(async (id) => apply((await api(`/addresses/${id}`, { method: 'DELETE' })).addresses), [apply])

  const value = useMemo(
    () => ({ addresses: list, loaded, defaultAddress: list.find((a) => a.isDefault) || list[0] || null, add, update, remove, refresh }),
    [list, loaded, add, update, remove, refresh]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAddresses() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAddresses must be used inside <AddressesProvider>')
  return c
}

export const LABELS = ['البيت', 'الشغل', 'بيت الأهل']
