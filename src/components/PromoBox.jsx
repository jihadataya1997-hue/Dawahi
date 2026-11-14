import { useEffect, useState } from 'react'
import { Check, Gift, LoaderCircle, Star, X } from 'lucide-react'
import { api } from '../api'
import { useLang } from '../i18n/LanguageProvider'
import { useAppConfig } from '../config/AppConfigProvider'

const ERR = {
  ar: {
    PROMO_INVALID: 'الكود غلط أو موقّف',
    PROMO_EXPIRED: 'الكود خلصت مدته',
    PROMO_USED_UP: 'الكود خلص عدد استعمالاته',
    PROMO_ALREADY_USED: 'استعملت هالكود قبل',
    PROMO_FIRST_ONLY: 'هالكود لأول طلب بس',
  },
  en: {
    PROMO_INVALID: 'Invalid code',
    PROMO_EXPIRED: 'This code has expired',
    PROMO_USED_UP: 'This code is used up',
    PROMO_ALREADY_USED: 'You already used this code',
    PROMO_FIRST_ONLY: 'This code is for the first order only',
  },
}

/**
 * كود حسم أو نقاط على أجرة التوصيل
 * value = { promoCode, usePoints, discount } — بيرجع للطلب عبر onChange
 */
export default function PromoBox({ fee, value, onChange }) {
  const { lang } = useLang()
  const { money } = useAppConfig()
  const ar = lang === 'ar'
  const [code, setCode] = useState(value.promoCode || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [points, setPoints] = useState(null)

  useEffect(() => {
    api('/points').then(setPoints).catch(() => {})
  }, [])

  const apply = async () => {
    if (!code.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const d = await api('/promo/check', { method: 'POST', body: { code: code.trim(), fee } })
      onChange({ promoCode: d.code, usePoints: false, discount: d.discount })
    } catch (err) {
      setError(ERR[ar ? 'ar' : 'en'][err.code] || (ar ? 'ما زبط، جرّب مرة تانية' : 'Try again'))
    } finally {
      setBusy(false)
    }
  }
  const clear = () => (onChange({ promoCode: '', usePoints: false, discount: 0 }), setCode(''))

  const canUsePoints = points && points.forFree > 0 && points.points >= points.forFree && fee > 0

  return (
    <div className="rounded-3xl border border-navy/10 p-4">
      {value.discount > 0 || value.usePoints ? (
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-navy">
            <Check size={20} />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <b className="block">
              {value.usePoints ? (ar ? 'توصيل مجاني بنقاطك' : 'Free delivery with points') : `${ar ? 'الكود' : 'Code'} ${value.promoCode}`}
            </b>
            <span className="text-xs font-bold text-brand">
              {ar ? 'وفّرت' : 'You save'} {money(value.usePoints ? fee : value.discount)}
            </span>
          </span>
          <button onClick={clear} aria-label={ar ? 'إلغاء' : 'Remove'} className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-50">
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-sm font-extrabold">
            <Gift size={16} className="text-brand" /> {ar ? 'عندك كود حسم؟' : 'Have a promo code?'}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={code}
              onChange={(e) => (setCode(e.target.value.toUpperCase()), setError(''))}
              placeholder={ar ? 'اكتب الكود' : 'Enter code'}
              dir="ltr"
              maxLength={20}
              className="min-w-0 flex-1 rounded-xl border border-navy/10 bg-navy-50 px-3 py-2.5 font-en text-sm font-bold uppercase tracking-wider outline-none focus:border-brand focus:bg-white rtl:text-end"
            />
            <button onClick={apply} disabled={!code.trim() || busy} className="rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-40">
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : ar ? 'تطبيق' : 'Apply'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
          {points && points.forFree > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t border-dashed border-navy/10 pt-3 text-xs">
              <Star size={15} className="shrink-0 fill-lime text-navy" />
              <span className="flex-1 text-navy/70">
                {ar ? `نقاطك: ${points.points} من ${points.forFree} لتوصيل مجاني` : `Points: ${points.points} of ${points.forFree} for free delivery`}
              </span>
              {canUsePoints && (
                <button
                  onClick={() => onChange({ promoCode: '', usePoints: true, discount: fee })}
                  className="rounded-lg bg-lime px-2.5 py-1.5 font-black text-navy"
                >
                  {ar ? 'استعملها' : 'Use'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
