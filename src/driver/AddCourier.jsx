import { useState } from 'react'
import { Camera, Check, Copy, IdCard, LoaderCircle, MessageCircle, MessageSquareText, UserPlus, X } from 'lucide-react'
import { api, errText } from './driverApi'
import { imageToDataUrl } from '../admin/shared'

const APK = 'https://zapp.prodev.cloud/apk/zapp-driver.apk'

// نص الرسالة يلي بتنبعت للعامل الجديد
export function welcomeText(c) {
  return [
    `أهلاً ${c.name.split(' ')[0]} 👋`,
    'تم تسجيلك كعامل توصيل في ZAPP.',
    '',
    `1) نزّل تطبيق عامل التوصيل من هالرابط:`,
    APK,
    '',
    '2) سجّل دخول بهالمعلومات:',
    `رقم الموبايل: ${c.phone}`,
    `الرمز السري: ${c.pin}`,
    '',
    'بعد الدخول وافق على كل الصلاحيات واكبس "متاح" لتبلّش تستقبل طلبات.',
    'لا تعطي الرمز السري لحدا.',
  ].join('\n')
}

function PhotoField({ label, hint, value, onChange, required, Icon = IdCard }) {
  const [busy, setBusy] = useState(false)
  return (
    <label className={`relative flex h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed text-center ${value ? 'border-brand' : 'border-navy/15 bg-navy-50'}`}>
      {value ? (
        <>
          <img src={value} alt={label} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute bottom-1.5 start-1.5 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
            <Check size={11} /> {label}
          </span>
        </>
      ) : busy ? (
        <LoaderCircle size={22} className="animate-spin text-brand" />
      ) : (
        <>
          <Icon size={22} className="text-brand" />
          <span className="mt-1 text-xs font-bold">
            {label}
            {required && <span className="text-rose-600"> *</span>}
          </span>
          {hint && <span className="text-[10px] text-navy/45">{hint}</span>}
        </>
      )}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          try {
            onChange(await imageToDataUrl(f, 1400, 0.8))
          } finally {
            setBusy(false)
          }
        }}
      />
    </label>
  )
}

// المشرف بيضيف عامل توصيل جديد مع وثائقه، وبعدها بيبعتله المعلومات عالواتساب
export default function AddCourier({ onClose, onAdded }) {
  const [f, setF] = useState({ name: '', phone: '', vehicle: '', nationalId: '', homeAddress: '' })
  const [docs, setDocs] = useState({ front: '', back: '', license: '' })
  const [photo, setPhoto] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState(null)
  const [copied, setCopied] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: k === 'phone' ? e.target.value.replace(/[^\d]/g, '') : e.target.value }))

  const ready = f.name.trim().split(/\s+/).length >= 2 && /^09\d{8}$/.test(f.phone)

  async function submit(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      const d = await api('/sup/couriers', {
        method: 'POST',
        body: { ...f, photo: photo || undefined, docs: { front: docs.front || undefined, back: docs.back || undefined, license: docs.license || undefined } },
      })
      setMade(d.courier)
      onAdded?.()
    } catch (err) {
      setError(
        err.code === 'PHONE_TAKEN'
          ? 'هالرقم مسجّل كعامل توصيل من قبل'
          : err.code === 'FULL_NAME'
            ? 'اكتب الاسم والكنية'
            : err.code === 'RATE_LIMITED'
              ? 'ضفت كتير عمال اليوم، جرّب بكرا'
              : errText(err)
      )
    } finally {
      setBusy(false)
    }
  }

  const text = made ? welcomeText(made) : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50" role="dialog" aria-modal="true" aria-label="إضافة عامل توصيل">
      <div className="pb-safe flex max-h-[94%] w-full max-w-md flex-col rounded-t-3xl bg-white">
        <div className="flex items-center gap-3 border-b border-navy/5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand">
            <UserPlus size={20} />
          </span>
          <h3 className="flex-1 font-extrabold">{made ? 'انضاف عامل التوصيل' : 'عامل توصيل جديد'}</h3>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>

        {made ? (
          <div className="space-y-4 overflow-y-auto p-4">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="font-extrabold text-emerald-800">{made.name}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-navy/55">رقم الدخول</dt>
                <dd className="font-en font-bold" dir="ltr">
                  {made.phone}
                </dd>
                <dt className="text-navy/55">الرمز السري</dt>
                <dd className="num-zap text-lg tracking-widest" dir="ltr">
                  {made.pin}
                </dd>
              </dl>
              <p className="mt-2 text-[11px] text-emerald-800/70">الرمز السري بيطلع هون مرة وحدة بس. ابعته للعامل هلق.</p>
            </div>

            <a
              href={`https://wa.me/963${made.phone.slice(1)}?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-extrabold text-white"
            >
              <MessageCircle size={18} /> ابعتله المعلومات عالواتساب
            </a>
            <div className="grid grid-cols-2 gap-2">
              <a href={`sms:${made.phone}?body=${encodeURIComponent(text)}`} className="flex items-center justify-center gap-1.5 rounded-2xl bg-navy-50 py-3 text-xs font-bold">
                <MessageSquareText size={16} /> رسالة SMS
              </a>
              <button onClick={copy} className="flex items-center justify-center gap-1.5 rounded-2xl bg-navy-50 py-3 text-xs font-bold">
                {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />} {copied ? 'انتسخت' : 'نسخ الرسالة'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-2xl bg-navy-50 p-3 font-sans text-xs leading-relaxed text-navy/70">{text}</pre>
            <button onClick={onClose} className="w-full rounded-2xl bg-navy py-3 text-sm font-bold text-white">
              تمام
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 overflow-y-auto p-4">
            <input value={f.name} onChange={set('name')} maxLength={60} placeholder="الاسم والكنية *" className="w-full rounded-xl bg-navy-50 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-brand/30" />
            <input
              value={f.phone}
              onChange={set('phone')}
              inputMode="numeric"
              maxLength={10}
              dir="ltr"
              placeholder="09xxxxxxxx *"
              className="w-full rounded-xl bg-navy-50 px-3.5 py-3 font-en text-sm outline-none focus:ring-2 focus:ring-brand/30 rtl:text-end"
            />
            <div className="grid grid-cols-2 gap-2">
              <input value={f.vehicle} onChange={set('vehicle')} maxLength={80} placeholder="الموتور (اختياري)" className="rounded-xl bg-navy-50 px-3.5 py-3 text-sm outline-none" />
              <input value={f.nationalId} onChange={set('nationalId')} maxLength={30} placeholder="الرقم الوطني (اختياري)" className="rounded-xl bg-navy-50 px-3.5 py-3 text-sm outline-none" />
            </div>
            <input value={f.homeAddress} onChange={set('homeAddress')} maxLength={200} placeholder="عنوان السكن (اختياري)" className="w-full rounded-xl bg-navy-50 px-3.5 py-3 text-sm outline-none" />

            <p className="pt-1 text-xs font-bold text-navy/55">الوثائق والمعلومات الباقية اختيارية، فيك تضيفها هلق أو بعدين</p>
            <div className="grid grid-cols-2 gap-2">
              <PhotoField label="الهوية - وجه" hint="اختياري" value={docs.front} onChange={(v) => setDocs((d) => ({ ...d, front: v }))} />
              <PhotoField label="الهوية - ضهر" hint="اختياري" value={docs.back} onChange={(v) => setDocs((d) => ({ ...d, back: v }))} />
              <PhotoField label="رخصة السواقة" hint="اختياري" value={docs.license} onChange={(v) => setDocs((d) => ({ ...d, license: v }))} />
              <PhotoField label="صورته الشخصية" hint="بتطلع للزبون" Icon={Camera} value={photo} onChange={setPhoto} />
            </div>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-sm font-bold text-rose-600">{error}</p>}
            <button disabled={!ready || busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-40">
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <UserPlus size={18} />} أضف عامل التوصيل
            </button>
            <p className="text-center text-[11px] text-navy/45">الرمز السري بيتولّد تلقائياً، وبتقدر تبعته للعامل بعد الإضافة.</p>
          </form>
        )}
      </div>
    </div>
  )
}
