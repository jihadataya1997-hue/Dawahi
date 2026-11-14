import { MessageCircle, Phone, UserRound } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

/** عامل التوصيل تبع الطلب: صورته واسمه ورقمه، مع زر اتصال وواتساب */
export default function CourierCard({ order, compact = false }) {
  const { lang } = useLang()
  if (!order?.courierName || !['assigned', 'buying', 'on_the_way'].includes(order.status)) return null
  const ar = lang === 'ar'
  const phone = order.courierPhone
  const c = order.courier || {}
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-navy p-3 text-white ${compact ? '' : 'mt-3'}`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-lime text-navy">
        {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover" /> : <UserRound size={22} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-white/60">{ar ? 'عامل التوصيل' : 'Your courier'}</span>
        <span className="block truncate text-sm font-black">{order.courierName}</span>
        <span className="block truncate text-[11px] text-white/70">
          {phone && (
            <span dir="ltr" className="font-en">
              {phone}
            </span>
          )}
          {phone && c.vehicle ? ' · ' : ''}
          {c.vehicle}
        </span>
      </span>
      {phone && (
        <>
          <a href={`https://wa.me/963${phone.slice(1)}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <MessageCircle size={18} />
          </a>
          <a href={`tel:${phone}`} aria-label={ar ? 'اتصال' : 'Call'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-navy">
            <Phone size={18} />
          </a>
        </>
      )}
    </div>
  )
}
