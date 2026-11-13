import { ClipboardList } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

// لاحقاً: تُعرض هنا الطلبات القادمة من السيرفر
export default function OrdersScreen({ onStart }) {
  const { t } = useLang()
  return (
    <div className="animate-fade-in">
      <header className="pt-safe rounded-b-[2rem] bg-navy px-5 pb-8 pt-6">
        <h1 className="text-lg font-extrabold text-white">{t('orders.title')}</h1>
      </header>
      <div className="flex flex-col items-center px-8 pt-16 text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-brand">
          <ClipboardList size={44} strokeWidth={1.75} />
        </span>
        <p className="mt-5 text-lg font-extrabold">{t('orders.empty')}</p>
        <p className="mt-1 text-sm text-navy/50">{t('orders.emptySub')}</p>
        <button
          onClick={onStart}
          className="mt-6 rounded-2xl bg-brand px-8 py-3.5 text-sm font-extrabold text-white active:scale-95"
        >
          {t('orders.start')}
        </button>
      </div>
    </div>
  )
}
