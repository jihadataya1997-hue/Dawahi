import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, Star, X } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { useOrders } from '../orders/OrdersProvider'

// الوسوم: الحلوة بتطلع للتقييم العالي، والشكاوى للتقييم المنخفض
const GOOD = ['fast', 'polite', 'accurate', 'communicative']
const BAD = ['late', 'wrong', 'damaged', 'rude', 'no_contact']
const TAG = {
  ar: { fast: 'سرعة التوصيل', polite: 'حسن التعامل', accurate: 'دقة الطلب', communicative: 'التواصل الجيد', late: 'تأخر في التوصيل', wrong: 'خطأ في الطلب', damaged: 'منتجات تالفة', rude: 'سوء التعامل', no_contact: 'عدم التواصل' },
  en: { fast: 'Fast', polite: 'Polite', accurate: 'Order was right', communicative: 'Kept me updated', late: 'Very late', wrong: 'Wrong items', damaged: 'Damaged items', rude: 'Rude', no_contact: "Didn't call me" },
}
const STAR_TEXT = {
  ar: ['', 'سيئ جداً', 'سيئ', 'مقبول', 'جيد', 'ممتاز'],
  en: ['', 'Very bad', 'Bad', 'Okay', 'Good', 'Excellent'],
}

const SKIP_KEY = (id) => `zapp.rateSkip.${id}`
export const skippedRating = (id) => {
  try {
    return localStorage.getItem(SKIP_KEY(id)) === '1'
  } catch {
    return false
  }
}

/** الطلب يلي لازم نسأل الزبون يقيّمه: وصل خلال آخر يومين وما انقيّم ولا تخطّاه */
export function orderToRate(orders) {
  return (
    orders.find(
      (o) => o.status === 'delivered' && o.courierName && !o.rating && Date.parse(o.updatedAt) > Date.now() - 2 * 864e5 && !skippedRating(o.id)
    ) || null
  )
}

export default function RateSheet({ order, onClose }) {
  const { lang } = useLang()
  const ar = lang === 'ar'
  const { rateOrder } = useOrders()
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setStars(0)
    setTags([])
    setNote('')
    setDone(false)
    setError('')
  }, [order?.id])

  if (!order) return null
  const L = ar ? 'ar' : 'en'
  const options = stars >= 4 ? GOOD : stars ? BAD : []
  const toggle = (t) => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))
  const skip = () => {
    try {
      localStorage.setItem(SKIP_KEY(order.id), '1')
    } catch {}
    onClose()
  }
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await rateOrder(order.id, { stars, tags: tags.filter((t) => options.includes(t)), note: note.trim() })
      setDone(true)
      setTimeout(onClose, 1400)
    } catch {
      setError(ar ? 'تعذّر الإرسال، يرجى المحاولة مرة أخرى' : 'Could not send, try again')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-navy/40 animate-fade-in" role="dialog" aria-modal="true" aria-label={ar ? 'قيّم التوصيل' : 'Rate delivery'}>
      <div className="w-full max-w-md rounded-t-[28px] bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-float">
        {done ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-lime text-navy">
              <Star size={26} fill="currentColor" />
            </div>
            <p className="mt-3 text-lg font-extrabold">{ar ? 'شكراً لتقييمك' : 'Thanks for your rating!'}</p>
            <p className="mt-1 text-sm text-navy/55">{ar ? 'يساعدنا رأيك على تحسين الخدمة' : 'It helps us improve'}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-lg font-extrabold">{ar ? 'كيف كانت تجربة التوصيل؟' : 'How was your delivery?'}</p>
                <p className="mt-0.5 text-sm text-navy/55">
                  {ar ? `الطلب ${order.number} مع عامل التوصيل ${order.courierName}` : `Order ${order.number} with ${order.courierName}`}
                </p>
              </div>
              <button onClick={skip} aria-label={ar ? 'لاحقاً' : 'Later'} className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => (setStars(n), setTags([]))}
                  aria-label={ar ? `${n} من 5 نجوم` : `${n} of 5 stars`}
                  aria-pressed={stars === n}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl transition active:scale-90"
                >
                  <Star size={36} className={n <= stars ? 'text-amber-400' : 'text-navy/15'} fill="currentColor" strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <p className="mt-1 h-5 text-center text-sm font-bold text-navy/60">{STAR_TEXT[L][stars]}</p>

            {options.length > 0 && (
              <div className="mt-4 animate-fade-in">
                <p className="mb-2 text-xs font-bold text-navy/50">{stars >= 4 ? (ar ? 'ما الذي أعجبك؟' : 'What went well?') : ar ? 'ما المشكلة؟' : 'What went wrong?'}</p>
                <div className="flex flex-wrap gap-2">
                  {options.map((t) => (
                    <button
                      key={t}
                      onClick={() => toggle(t)}
                      aria-pressed={tags.includes(t)}
                      className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${tags.includes(t) ? 'bg-brand text-white' : 'bg-navy-50 text-navy/70'}`}
                    >
                      {TAG[L][t]}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={stars >= 4 ? (ar ? 'أضف ملاحظة (اختياري)' : 'Anything to add? (optional)') : ar ? 'صف المشكلة (اختياري)' : 'Tell us what happened (optional)'}
                  className="mt-3 w-full resize-none rounded-2xl bg-navy-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            )}

            {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
            <button
              onClick={submit}
              disabled={!stars || busy}
              className="mt-4 flex w-full items-center justify-center rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : ar ? 'إرسال التقييم' : 'Send rating'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
