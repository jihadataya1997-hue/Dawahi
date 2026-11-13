import { useEffect, useState } from 'react'
import {
  ArrowUpDown,
  Building2,
  Check,
  ChevronLeft,
  Flame,
  Info,
  LoaderCircle,
  Minus,
  PackagePlus,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

// ⚙️ الأسعار — لاحقاً تأتي من لوحة التحكم / قاعدة البيانات بدل كتابتها هنا
export const PRICING = {
  deliveryFee: 15000, // أجرة توصيل ثابتة
  gasPrice: 150000, // سعر تعبئة الجرة (متغيّر حسب السوق)
  emptyCylinder: 350000, // ثمن جرة فارغة جديدة
  stairsPerFloor: 2000, // رسم الدرج لكل طابق لكل جرة (بدون مصعد)
}

const initial = { qty: 1, type: 'swap', floor: 0, elevator: true, notes: '' }

export default function GasOrderSheet({ open, onClose, onConfirmed }) {
  const { t, formatNumber } = useLang()
  const g = (k) => t(`gas.${k}`)
  const [step, setStep] = useState(0)
  const [order, setOrder] = useState(initial)
  const [status, setStatus] = useState('idle') // idle | searching | found
  const set = (patch) => setOrder((o) => ({ ...o, ...patch }))

  // إعادة ضبط عند الفتح + منع تمرير الصفحة خلف الـ Sheet
  useEffect(() => {
    if (open) {
      setStep(0)
      setOrder(initial)
      setStatus('idle')
    }
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open])

  if (!open) return null

  // حساب الفاتورة
  const stairsFloors = order.elevator ? 0 : order.floor
  const lines = [
    { label: g('deliveryFee'), amount: PRICING.deliveryFee },
    { label: `${g('gasPrice')} × ${formatNumber(order.qty)}`, amount: PRICING.gasPrice * order.qty, approx: true },
    order.type === 'buy' && {
      label: `${g('cylinderPrice')} × ${formatNumber(order.qty)}`,
      amount: PRICING.emptyCylinder * order.qty,
      approx: true,
    },
    stairsFloors > 0 && {
      label: `${g('stairsFee')} (${formatNumber(stairsFloors)} × ${formatNumber(order.qty)})`,
      amount: PRICING.stairsPerFloor * stairsFloors * order.qty,
    },
  ].filter(Boolean)
  const total = lines.reduce((s, l) => s + l.amount, 0)
  const money = (n) => `${formatNumber(n)} ${g('currency')}`

  const confirm = () => {
    setStatus('searching')
    // هنا يُرسل الطلب للسيرفر — حالياً محاكاة
    setTimeout(() => setStatus('found'), 2200)
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col justify-end">
      {/* الخلفية المعتمة */}
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      <div className="relative flex max-h-[92%] flex-col rounded-t-[2rem] bg-white animate-sheet-up">
        {/* المقبض + العنوان */}
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-12 rounded-full bg-navy/15" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand">
              <Flame size={22} />
            </span>
            <h2 className="text-lg font-extrabold">{g('title')}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50 text-navy/60 active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {status === 'idle' ? (
          <>
            <Stepper step={step} labels={t('gas.steps')} />

            <div className="scrollbar-hide flex-1 overflow-y-auto px-5 pb-4">
              {step === 0 && (
                <div className="space-y-6 animate-fade-in">
                  <Field label={g('qtyQ')}>
                    <div className="grid grid-cols-2 gap-3">
                      {[1, 2].map((n) => (
                        <Choice key={n} active={order.qty === n} onClick={() => set({ qty: n })}>
                          <div className="flex items-center justify-center gap-1">
                            {Array.from({ length: n }).map((_, i) => (
                              <CylinderIcon key={i} active={order.qty === n} />
                            ))}
                          </div>
                          <div className="mt-2 text-sm font-bold">
                            {n === 1 ? `${formatNumber(1)} ${g('cylinder')}` : g('cylinders')}
                          </div>
                        </Choice>
                      ))}
                    </div>
                  </Field>

                  <Field label={g('typeQ')}>
                    <div className="space-y-3">
                      <RowChoice
                        active={order.type === 'swap'}
                        onClick={() => set({ type: 'swap' })}
                        Icon={RefreshCw}
                        title={g('swap')}
                        sub={g('swapSub')}
                      />
                      <RowChoice
                        active={order.type === 'buy'}
                        onClick={() => set({ type: 'buy' })}
                        Icon={PackagePlus}
                        title={g('buy')}
                        sub={g('buySub')}
                      />
                    </div>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <Field label={g('floorQ')}>
                    <div className="flex items-center justify-between rounded-2xl bg-navy-50 p-2">
                      <Stepper2 onClick={() => set({ floor: Math.max(0, order.floor - 1) })} Icon={Minus} />
                      <div className="flex items-center gap-2 text-center">
                        <Building2 size={20} className="text-brand" />
                        <span className="text-lg font-extrabold">
                          {order.floor === 0 ? g('ground') : `${g('floor')} ${formatNumber(order.floor)}`}
                        </span>
                      </div>
                      <Stepper2 onClick={() => set({ floor: Math.min(15, order.floor + 1) })} Icon={Plus} />
                    </div>
                  </Field>

                  {order.floor > 0 && (
                    <Field label={g('elevatorQ')}>
                      <div className="grid grid-cols-2 gap-3">
                        <Choice active={order.elevator} onClick={() => set({ elevator: true })}>
                          <ArrowUpDown className="mx-auto" size={22} />
                          <div className="mt-1.5 text-sm font-bold">{g('yes')}</div>
                        </Choice>
                        <Choice active={!order.elevator} onClick={() => set({ elevator: false })}>
                          <X className="mx-auto" size={22} />
                          <div className="mt-1.5 text-sm font-bold">{g('no')}</div>
                        </Choice>
                      </div>
                      {!order.elevator && (
                        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                          <Info size={16} className="mt-0.5 shrink-0" />
                          {g('noElevatorNote')}
                        </p>
                      )}
                    </Field>
                  )}

                  <Field label={g('notesLabel')}>
                    <textarea
                      rows={2}
                      value={order.notes}
                      onChange={(e) => set({ notes: e.target.value })}
                      placeholder={g('notesPh')}
                      className="w-full resize-none rounded-2xl border border-navy/10 bg-navy-50 p-3 text-sm outline-none transition focus:border-brand focus:bg-white"
                    />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="rounded-3xl border border-navy/10 p-4">
                    <h3 className="mb-3 text-sm font-extrabold">{g('invoice')}</h3>
                    <ul className="space-y-3 text-sm">
                      {lines.map((l, i) => (
                        <li key={i} className="flex items-start justify-between gap-3">
                          <span className="text-navy/70">{l.label}</span>
                          <span className="shrink-0 text-end font-bold">
                            {money(l.amount)}
                            {l.approx && <span className="block text-[10px] font-normal text-brand">{g('approx')}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex items-center justify-between border-t border-dashed border-navy/15 pt-4">
                      <span className="font-extrabold">{g('total')}</span>
                      <span className="text-xl font-extrabold text-brand">≈ {money(total)}</span>
                    </div>
                  </div>
                  <p className="flex items-start gap-2 rounded-2xl bg-brand-50 p-3 text-xs leading-relaxed text-navy/80">
                    <Info size={16} className="mt-0.5 shrink-0 text-brand" />
                    {g('disclaimer')}
                  </p>
                </div>
              )}
            </div>

            {/* أزرار الأسفل */}
            <div className="pb-safe flex gap-3 border-t border-navy/5 bg-white px-5 py-4">
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="rounded-2xl bg-navy-50 px-5 py-3.5 text-sm font-bold text-navy active:scale-95"
                >
                  {g('back')}
                </button>
              )}
              <button
                onClick={() => (step < 2 ? setStep(step + 1) : confirm())}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white shadow-[0_8px_20px_-8px_#FF8A00] transition active:scale-[0.98]"
              >
                {step < 2 ? g('next') : g('confirm')}
                <ChevronLeft size={18} className="ltr:rotate-180" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center px-6 pb-10 pt-6 text-center animate-fade-in">
            {status === 'searching' ? (
              <>
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand">
                    <LoaderCircle size={36} className="animate-spin" />
                  </span>
                </div>
                <p className="mt-6 font-bold">{g('searching')}</p>
              </>
            ) : (
              <>
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <Check size={40} strokeWidth={3} />
                </span>
                <p className="mt-5 text-lg font-extrabold">{g('found')}</p>
                <p className="mt-1 text-sm text-navy/60">{g('foundSub')}</p>
                <button
                  onClick={() => {
                    onConfirmed?.()
                    onClose()
                  }}
                  className="mt-6 w-full rounded-2xl bg-navy py-3.5 text-sm font-extrabold text-white active:scale-[0.98]"
                >
                  {g('done')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ——— مكونات صغيرة مساعدة ——— */

function Stepper({ step, labels }) {
  return (
    <div className="flex items-center gap-2 px-5 pb-5 pt-2">
      {labels.map((label, i) => (
        <div key={i} className="flex flex-1 flex-col gap-1.5">
          <span className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-brand' : 'bg-navy/10'}`} />
          <span className={`text-[11px] font-bold ${i === step ? 'text-brand' : 'text-navy/40'}`}>
            {i + 1}. {label}
          </span>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div className="mb-3 text-sm font-extrabold">{label}</div>
      {children}
    </div>
  )
}

function Choice({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 p-4 text-center transition active:scale-95 ${
        active ? 'border-brand bg-brand-50 text-navy' : 'border-navy/10 text-navy/60'
      }`}
    >
      {children}
    </button>
  )
}

function RowChoice({ active, onClick, Icon, title, sub }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-start transition active:scale-[0.98] ${
        active ? 'border-brand bg-brand-50' : 'border-navy/10'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          active ? 'bg-brand text-white' : 'bg-navy-50 text-navy/50'
        }`}
      >
        <Icon size={20} />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-navy/50">{sub}</span>
      </span>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
          active ? 'border-brand bg-brand text-white' : 'border-navy/20'
        }`}
      >
        {active && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  )
}

function Stepper2({ onClick, Icon }) {
  return (
    <button
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-navy shadow-soft active:scale-90"
    >
      <Icon size={20} />
    </button>
  )
}

function CylinderIcon({ active }) {
  return (
    <svg viewBox="0 0 24 36" className={`h-10 w-7 ${active ? 'text-brand' : 'text-navy/30'}`}>
      <rect x="8" y="0" width="8" height="5" rx="1.5" fill="currentColor" />
      <rect x="2" y="5" width="20" height="30" rx="7" fill="currentColor" />
      <rect x="2" y="15" width="20" height="3" fill="#fff" opacity=".5" />
    </svg>
  )
}
