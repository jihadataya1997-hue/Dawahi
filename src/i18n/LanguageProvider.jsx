import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { translations } from './translations'

const LanguageContext = createContext(null)
const STORAGE_KEY = 'dawahi.lang'

function readSavedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'en' || saved === 'ar' ? saved : 'ar'
  } catch {
    return 'ar' // العربية هي الافتراضية
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(readSavedLang)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  // كلما تغيّرت اللغة: نقلب اتجاه الصفحة كاملة + الخط + نحفظ الاختيار
  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dir
    root.classList.toggle('lang-ar', lang === 'ar')
    root.classList.toggle('lang-en', lang === 'en')
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {}
  }, [lang, dir])

  const toggleLang = useCallback(() => setLang((l) => (l === 'ar' ? 'en' : 'ar')), [])

  // t('gas.title') → يرجع النص حسب اللغة الحالية
  const t = useCallback(
    (path) => path.split('.').reduce((obj, key) => obj?.[key], translations[lang]) ?? path,
    [lang]
  )

  // الأرقام والأسعار بالأرقام الإنكليزية (15,000) باللغتين — أوضح للقراءة
  const formatNumber = useCallback((n) => new Intl.NumberFormat('en-US').format(n), [])

  const value = useMemo(
    () => ({ lang, dir, isRTL: dir === 'rtl', setLang, toggleLang, t, formatNumber }),
    [lang, dir, toggleLang, t, formatNumber]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>')
  return ctx
}
