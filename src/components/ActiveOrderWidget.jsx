import { ChevronLeft, Truck } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

export default function ActiveOrderWidget({ onClose }) {
  const { t, formatNumber } = useLang()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-20 mx-auto max-w-md px-4 pb-safe animate-fade-in">
      <button
        onClick={onClose}
        className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-navy p-3 text-start text-white shadow-float transition active:scale-[0.98]"
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand">
          <Truck size={22} />
          <span className="absolute -end-1 -top-1 h-3 w-3 rounded-full bg-emerald-400 animate-pulse-dot" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{t('activeOrder')}</span>
          <span className="block truncate text-[11px] text-white/60">{t('activeOrderSub')}</span>
          {/* شريط التقدم */}
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/15">
            <span className="block h-full w-2/3 rounded-full bg-brand" />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-center rounded-xl bg-white/10 px-2.5 py-1.5">
          <span className="text-base font-extrabold leading-none">{formatNumber(12)}</span>
          <span className="text-[10px] text-white/60">{t('eta')}</span>
        </span>
        <ChevronLeft size={18} className="shrink-0 text-white/50 ltr:rotate-180" />
      </button>
    </div>
  )
}
