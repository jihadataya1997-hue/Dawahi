import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useAppConfig } from '../config/AppConfigProvider'

// ألوان الإعلانات (تُختار من لوحة الإدارة)
const THEMES = {
  orange: 'bg-brand text-white',
  navy: 'bg-navy text-white',
  green: 'bg-[#13805C] text-white',
  sky: 'bg-[#1F6FD1] text-white',
  rose: 'bg-[#D63C64] text-white',
  purple: 'bg-[#6A49D8] text-white',
}

/** سلايدر الإعلانات أعلى الصفحة الرئيسية — يتنقّل تلقائياً ويتوقف عند لمسه */
export default function BannerCarousel({ onAction }) {
  const { banners } = useAppConfig()
  const ref = useRef(null)
  const [index, setIndex] = useState(0)
  const paused = useRef(false)

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
    <section aria-label="العروض">
      <div
        ref={ref}
        onScroll={onScroll}
        onTouchStart={() => (paused.current = true)}
        onTouchEnd={() => setTimeout(() => (paused.current = false), 4000)}
        className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 scroll-px-4"
      >
        {banners.map((b) => (
          <button
            key={b.id}
            onClick={() => onAction(b)}
            className={`relative flex h-40 w-[88%] shrink-0 snap-start overflow-hidden rounded-3xl text-start shadow-soft active:scale-[0.99] ${THEMES[b.theme] || THEMES.orange}`}
          >
            {b.image && (
              <>
                <img src={b.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                {/* طبقة لتوضيح النص فوق الصورة */}
                <span className="absolute inset-0 bg-gradient-to-l from-black/70 via-black/40 to-transparent ltr:bg-gradient-to-r" />
              </>
            )}
            {!b.image && (
              <>
                <span className="pointer-events-none absolute -bottom-12 -end-10 h-44 w-44 rounded-full bg-white/10" />
                <span className="pointer-events-none absolute -top-10 end-16 h-24 w-24 rounded-full bg-white/10" />
              </>
            )}
            <span className="relative flex h-full max-w-[78%] flex-col justify-center p-5">
              {b.badge && (
                <span className="mb-2 w-fit rounded-full bg-white/25 px-2.5 py-0.5 text-[11px] font-bold backdrop-blur">{b.badge}</span>
              )}
              <span className="text-lg font-extrabold leading-snug">{b.title}</span>
              {b.subtitle && <span className="mt-1 text-xs leading-relaxed text-white/90">{b.subtitle}</span>}
              {b.action !== 'none' && (
                <span className="mt-3 inline-flex w-fit items-center gap-0.5 text-xs font-bold underline-offset-4">
                  {b.action === 'url' ? 'التفاصيل' : 'اطلب الآن'} <ChevronLeft size={14} className="ltr:rotate-180" />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              aria-label={`الإعلان ${i + 1}`}
              onClick={() => {
                setIndex(i)
                goTo(i)
              }}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-brand' : 'w-1.5 bg-navy/20'}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
