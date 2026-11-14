import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n/LanguageProvider'

// إعدادات التطبيق من السيرفر (تتعدل من لوحة الإدارة): النصوص، الخدمات، الإعلانات، الأسعار، العملة
const Ctx = createContext(null)
const KEY = 'dawahi.appConfig'

const DEFAULTS = {
  texts: { areaName: 'ضاحية قدسيا', heroTitle: '', heroSub: '', supportPhone: '' },
  currency: 'ل.س',
  services: [
    { id: 'restaurants', enabled: true },
    { id: 'supermarket', enabled: true },
    { id: 'gas', enabled: true },
    { id: 'diesel', enabled: true },
    { id: 'pharmacy', enabled: true },
    { id: 'library', enabled: true },
  ],
  banners: [],
  maintenance: null,
  peak: null,
  popup: null,
  pricing: { deliveryFee: 150, gasPrice: 1500, emptyCylinder: 3500, stairsPerFloor: 20 },
}

function cached() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }
  } catch {
    return DEFAULTS
  }
}

export function AppConfigProvider({ children }) {
  const { lang, formatNumber } = useLang()
  const [config, setConfig] = useState(cached)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/app')
      if (!res.ok) return
      const d = await res.json()
      setConfig(d)
      try {
        localStorage.setItem(KEY, JSON.stringify(d))
      } catch {}
    } catch {}
  }, [])

  useEffect(() => {
    refresh()
    // كل دقيقة: حتى توصل الصيانة والإيقاف المؤقت والذروة بسرعة
    const id = setInterval(() => document.visibilityState === 'visible' && refresh(), 60 * 1000)
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh])

  // المبالغ بالعملة السورية الجديدة
  const money = useCallback(
    (n) => `${formatNumber(n)} ${lang === 'ar' ? config.currency : 'SYP'}`,
    [lang, config.currency, formatNumber]
  )
  const areaName = lang === 'ar' ? config.texts.areaName : 'Qudsaya Suburb'

  const value = useMemo(() => ({ ...config, money, areaName, refresh }), [config, money, areaName, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppConfig() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAppConfig must be used inside <AppConfigProvider>')
  return c
}
