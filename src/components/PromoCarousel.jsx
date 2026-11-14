import { useRef, useState } from 'react'
import { Flame, Pill, UtensilsCrossed } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

const styles = [
  { bg: 'from-brand to-[#FFB347]', Icon: UtensilsCrossed },
  { bg: 'from-navy to-[#1D3561]', Icon: Flame },
  { bg: 'from-emerald-500 to-teal-400', Icon: Pill },
]

export default function PromoCarousel() {
  const { t } = useLang()
  const promos = t('promos')
  const ref = useRef(null)
  const [index, setIndex] = useState(0)

  // نحسب الشريحة الحالية — Math.abs لأن scrollLeft يكون سالباً في RTL
  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const w = el.firstChild?.offsetWidth || 1
    setIndex(Math.round(Math.abs(el.scrollLeft) / (w + 12)))
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold">{t('offers')}</h2>
        <button className="text-xs font-bold text-brand">{t('seeAll')}</button>
      </div>

      <div
        ref={ref}
        onScroll={onScroll}
        className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 scroll-px-4"
      >
        {promos.map((p, i) => {
          const { bg, Icon } = styles[i % styles.length]
          return (
            <article
              key={i}
              className={`relative h-36 w-[85%] shrink-0 snap-start overflow-hidden rounded-3xl bg-gradient-to-br ${bg} p-5 text-white shadow-soft`}
            >
              <span className="inline-block rounded-full bg-white/25 px-2.5 py-1 text-[10px] font-bold backdrop-blur">
                {p.badge}
              </span>
              <h3 className="mt-3 max-w-[70%] text-lg font-extrabold leading-snug">{p.title}</h3>
              <p className="mt-1 max-w-[70%] text-xs text-white/85">{p.sub}</p>
              <Icon className="absolute -bottom-3 -end-3 h-28 w-28 rotate-12 text-white/20" strokeWidth={1.5} />
            </article>
          )
        })}
      </div>

      <div className="mt-3 flex justify-center gap-1.5">
        {promos.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-brand' : 'w-1.5 bg-navy/20'}`}
          />
        ))}
      </div>
    </section>
  )
}
