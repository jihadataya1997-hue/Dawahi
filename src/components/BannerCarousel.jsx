import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useAppConfig } from '../config/AppConfigProvider'
import { useLang } from '../i18n/LanguageProvider'

// ألوان الإعلانات (تُختار من لوحة الإدارة) — الشارة والبرق بيتلوّنوا حسب الخلفية
const THEMES = {
  orange: { bg: 'bg-brand text-white', accent: 'text-lime', badge: 'bg-lime text-navy' },
  navy: { bg: 'bg-navy text-white', accent: 'text-lime', badge: 'bg-lime text-navy' },
  green: { bg: 'bg-[#13805C] text-white', accent: 'text-lime', badge: 'bg-white text-[#13805C]' },
  sky: { bg: 'bg-[#1F6FD1] text-white', accent: 'text-lime', badge: 'bg-white text-[#1F6FD1]' },
  rose: { bg: 'bg-[#D63C64] text-white', accent: 'text-white/30', badge: 'bg-white text-[#D63C64]' },
  purple: { bg: 'bg-[#6A49D8] text-white', accent: 'text-lime', badge: 'bg-lime text-navy' },
}

// برق ZAPP كبير بزاوية الإعلان (بدل الدواير)
function Bolt({ className }) {
  return (
    <svg viewBox="0 0 60 100" aria-hidden="true" className={className}>
      <path d="M38 0 8 56h20L18 100 54 38H33z" fill="currentColor" />
    </svg>
  )
}

/**
 * إعلانات الصفحة الرئيسية
 * placement="top": السلايدر الكبير تحت صندوق الطلب — بيتنقّل لحاله وبيوقف وقت اللمس
 * placement="mid": إعلانات بنص الصفحة بين الخدمات
 */
export default function BannerCarousel({ onAction, placement = 'top' }) {
  const { banners: all } = useAppConfig()
  const { lang } = useLang()
  const banners = all.filter((b) => (b.placement || 'top') === placement)
  const ref = useRef(null)
  const [index, setIndex] = useState(0)
  const paused = useRef(false)
  const big = placement === 'top'

  const goTo = useCallback((i) => {
    const el = ref.current
    const card = el?.children[i]
    if (!el || !card) return
    // بالعربي (RTL) التمرير الأفقي يكون بقيم سالبة
    const sign = getComputedStyle(el).direction === 'rtl' ? -1 : 1
    el.scrollTo({ left: sign * i * (card.offsetWidth + 12), behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (banners.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => {
      if (paused.current || document.visibilityState !== 'visible') return
      setIndex((i) => {
        const next = (i + 1) % banners.length
        goTo(next)
        return next
      })
    }, 5000)
    return () => clearInterval(id)
  }, [banners.length, goTo])

  const onScroll = () => {
    const el = ref.current
    if (!el?.children.length) return
    const w = el.children[0].offsetWidth + 12
    setIndex(Math.min(banners.length - 1, Math.round(Math.abs(el.scrollLeft) / w)))
  }

  if (!banners.length) return null

  return (
    <section aria-label={lang === 'ar' ? 'العروض' : 'Offers'}>
      <div
        ref={ref}
        onScroll={onScroll}
        onTouchStart={() => (paused.current = true)}
        onTouchEnd={() => setTimeout(() => (paused.current = false), 4000)}
        className="scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto"
      >
        {banners.map((b) => {
          const th = THEMES[b.theme] || THEMES.navy
          return (
            <button
              key={b.id}
              onClick={() => onAction(b)}
              className={`relative flex w-full shrink-0 snap-start overflow-hidden rounded-[1.75rem] text-start active:scale-[0.99] ${big ? 'h-44' : 'h-32'} ${th.bg}`}
            >
              {b.image ? (
                <>
                  <img src={b.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/40 to-transparent ltr:bg-gradient-to-r" />
                </>
              ) : (
                <Bolt className={`pointer-events-none absolute -bottom-4 end-3 ${big ? 'h-48' : 'h-36'} -rotate-6 ${th.accent}`} />
              )}
              <span className={`relative flex h-full flex-col justify-center px-5 py-4 ${b.image ? 'max-w-[85%]' : 'max-w-[68%]'}`}>
                {b.badge && <span className={`mb-2 w-fit rounded-full px-2.5 py-0.5 text-[11px] font-black ${th.badge}`}>{b.badge}</span>}
                <span className={`line-clamp-2 font-black leading-[1.2] ${big ? 'text-[22px]' : 'text-lg'}`}>{b.title}</span>
                {b.subtitle && <span className="mt-1.5 line-clamp-1 text-xs text-white/80">{b.subtitle}</span>}
                {b.action !== 'none' && (
                  <span className="mt-2 inline-flex w-fit items-center gap-0.5 text-xs font-bold text-white/90">
                    {b.action === 'url' ? (lang === 'ar' ? 'التفاصيل' : 'Details') : lang === 'ar' ? 'اطلب هلق' : 'Order now'}
                    <ChevronLeft size={14} className="ltr:rotate-180" />
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      {banners.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              aria-label={`${i + 1}`}
              onClick={() => {
                setIndex(i)
                goTo(i)
              }}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-brand' : 'w-1.5 bg-navy/20'}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
