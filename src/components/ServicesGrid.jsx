import { BookOpen, Flame, Fuel, Pill, ShoppingCart, UtensilsCrossed } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

export const SERVICES = [
  { id: 'restaurants', Icon: UtensilsCrossed, color: 'bg-rose-50 text-rose-500' },
  { id: 'supermarket', Icon: ShoppingCart, color: 'bg-emerald-50 text-emerald-600' },
  { id: 'gas', Icon: Flame, color: 'bg-brand-50 text-brand', featured: true },
  { id: 'diesel', Icon: Fuel, color: 'bg-amber-50 text-amber-600' },
  { id: 'pharmacy', Icon: Pill, color: 'bg-sky-50 text-sky-600' },
  { id: 'library', Icon: BookOpen, color: 'bg-violet-50 text-violet-600' },
]

export default function ServicesGrid({ onSelect }) {
  const { t } = useLang()
  return (
    <section>
      <h2 className="mb-3 text-base font-extrabold">{t('services')}</h2>
      <div className="grid grid-cols-3 gap-3">
        {SERVICES.map(({ id, Icon, color, featured }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`relative flex flex-col items-center rounded-3xl bg-white px-2 py-4 shadow-soft transition active:scale-95 ${
              featured ? 'ring-2 ring-brand/40' : ''
            }`}
          >
            {featured && (
              <span className="absolute -top-2 rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold text-white">
                {t('popular')}
              </span>
            )}
            <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${color}`}>
              <Icon size={26} strokeWidth={2} />
            </span>
            <span className="mt-2 text-sm font-bold">{t(`svc.${id}`)}</span>
            <span className="text-[10px] text-navy/50">{t(`svcSub.${id}`)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
