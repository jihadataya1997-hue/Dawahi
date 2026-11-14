import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth/AuthProvider'
import { useAppConfig } from '../config/AppConfigProvider'

// الطلبات والأسعار من السيرفر، مع تحديث تلقائي كل 20 ثانية
const OrdersContext = createContext(null)
export const OPEN_STATUSES = ['new', 'assigned', 'buying', 'on_the_way']

export function OrdersProvider({ children }) {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const hasOpen = useRef(false)
  const { pricing } = useAppConfig()

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const d = await api('/orders')
      setOrders(d.orders)
    } catch {
      /* نحاول بالمرة الجاية */
    } finally {
      setLoaded(true)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setOrders([])
      setLoaded(false)
      return
    }
    refresh()
    // أسرع لما في طلب مفتوح (لحتى تتحدّث حالته بسرعة)
    let n = 0
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      n++
      if (hasOpen.current || n % 4 === 0) refresh()
    }, 5000)
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [user, refresh])

  const createOrder = useCallback(
    async (payload) => {
      const d = await api('/orders', { method: 'POST', body: payload })
      setOrders((list) => [d.order, ...list.filter((o) => o.id !== d.order.id)])
      return d.order
    },
    []
  )

  const cancelOrder = useCallback(async (id) => {
    const d = await api(`/orders/${id}/cancel`, { method: 'POST' })
    setOrders((list) => list.map((o) => (o.id === id ? d.order : o)))
  }, [])

  const activeOrder = orders.find((o) => OPEN_STATUSES.includes(o.status)) || null
  hasOpen.current = !!activeOrder

  const value = useMemo(
    () => ({ orders, loaded, pricing, activeOrder, refresh, createOrder, cancelOrder }),
    [orders, loaded, pricing, activeOrder, refresh, createOrder, cancelOrder]
  )
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders must be used inside <OrdersProvider>')
  return ctx
}
