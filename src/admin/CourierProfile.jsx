import { useEffect, useRef, useState } from 'react'
import { FileImage, ImagePlus, LoaderCircle, X } from 'lucide-react'
import { adminApi, adminErrorText, getAdminToken } from './adminApi'
import { imageToDataUrl, inputCls } from './shared'

const DOCS = [
  ['front', 'الهوية (الوجه)'],
  ['back', 'الهوية (الخلف)'],
  ['license', 'شهادة السواقة / أوراق الموتور'],
]

// الوثائق محمية: منجيبها بمفتاح الإدارة ومنعرضها كصورة مؤقتة
function DocThumb({ courierId, kind, has, pending }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (pending || !has) return setUrl(null)
    let u
    fetch(`/api/admin/couriers/${courierId}/doc/${kind}`, { headers: { authorization: `Bearer ${getAdminToken()}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => b && setUrl((u = URL.createObjectURL(b))))
      .catch(() => {})
    return () => u && URL.revokeObjectURL(u)
  }, [courierId, kind, has, pending])
  const src = pending || url
  if (!src) return <span className="flex h-24 w-full items-center justify-center rounded-xl bg-navy-50 text-navy/30"><FileImage size={22} /></span>
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img src={src} alt="" className="h-24 w-full rounded-xl object-cover" />
    </a>
  )
}

function Pick({ onPick, children, className }) {
  const ref = useRef(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPick(await imageToDataUrl(f, 1600, 0.85))
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} className={className}>
        {children}
      </button>
    </>
  )
}

/** ملف عامل التوصيل: صورته (بتطلع للزبون) + معلوماته + وثائقه الثبوتية (للإدارة بس) */
export default function CourierProfile({ courier, onClose }) {
  const [p, setP] = useState(null)
  const [photo, setPhoto] = useState(undefined)
  const [docs, setDocs] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    adminApi(`/couriers/${courier.id}/profile`).then((d) => setP(d.profile)).catch((e) => setError(adminErrorText(e)))
  }, [courier.id])
  const set = (x) => setP((v) => ({ ...v, ...x }))

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const body = { vehicle: p.vehicle, nationalId: p.nationalId, homeAddress: p.homeAddress, notes: p.notes }
      if (photo !== undefined) body.photo = photo
      if (Object.keys(docs).length) body.docs = docs
      const d = await adminApi(`/couriers/${courier.id}/profile`, { method: 'PATCH', body })
      setP(d.profile)
      setPhoto(undefined)
      setDocs({})
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.code === 'TOO_LARGE' ? 'الصورة كبيرة كتير' : adminErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const shownPhoto = photo !== undefined ? photo : p?.photo
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-navy/60 p-4" onClick={onClose}>
      <div className="my-auto w-full max-w-xl rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">ملف {courier.name}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>
        {!p ? (
          <div className="flex justify-center py-10 text-brand">
            {error ? <p className="text-sm text-rose-600">{error}</p> : <LoaderCircle className="animate-spin" />}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-4 rounded-2xl bg-navy-50 p-3">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-navy/30">
                {shownPhoto ? <img src={shownPhoto} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={24} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">الصورة الشخصية</p>
                <p className="text-[11px] text-navy/50">بتطلع للزبون مع الاسم والرقم لما يقبل الطلب</p>
                <div className="mt-2 flex gap-2">
                  <Pick onPick={setPhoto} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold">
                    {shownPhoto ? 'تغيير' : 'رفع صورة'}
                  </Pick>
                  {shownPhoto && (
                    <button onClick={() => setPhoto(null)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600">
                      إزالة
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-navy/60">الرقم الوطني</span>
                <input dir="ltr" value={p.nationalId} maxLength={30} onChange={(e) => set({ nationalId: e.target.value })} className={`${inputCls} mt-1 font-en`} />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-navy/60">وسيلة التوصيل (بتطلع للزبون)</span>
                <input value={p.vehicle} maxLength={80} onChange={(e) => set({ vehicle: e.target.value })} placeholder="مثال: موتور أحمر · 123456" className={`${inputCls} mt-1`} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-navy/60">عنوان السكن</span>
                <input value={p.homeAddress} maxLength={200} onChange={(e) => set({ homeAddress: e.target.value })} className={`${inputCls} mt-1`} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-navy/60">ملاحظات (للإدارة بس)</span>
                <textarea rows={2} value={p.notes} maxLength={500} onChange={(e) => set({ notes: e.target.value })} className={`${inputCls} mt-1 resize-none`} />
              </label>
            </div>

            <div>
              <p className="text-sm font-bold">الوثائق الثبوتية</p>
              <p className="text-[11px] text-navy/50">محفوظة بشكل خاص، ما حدا بيشوفها غير الإدارة.</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {DOCS.map(([k, label]) => (
                  <div key={k} className="space-y-1.5">
                    <DocThumb courierId={courier.id} kind={k} has={p.docs[k] && docs[k] !== null} pending={docs[k] || null} />
                    <p className="text-[11px] font-bold leading-tight">{label}</p>
                    <div className="flex gap-1">
                      <Pick onPick={(d) => setDocs((v) => ({ ...v, [k]: d }))} className="flex-1 rounded-lg bg-navy-50 py-1 text-[11px] font-bold">
                        {p.docs[k] || docs[k] ? 'تغيير' : 'رفع'}
                      </Pick>
                      {(p.docs[k] || docs[k]) && docs[k] !== null && (
                        <button onClick={() => setDocs((v) => ({ ...v, [k]: null }))} className="rounded-lg bg-rose-50 px-2 text-[11px] font-bold text-rose-600">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
            <button onClick={save} disabled={busy} className="flex w-full items-center justify-center rounded-2xl bg-brand py-3.5 text-sm font-extrabold text-white disabled:opacity-60">
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : saved ? '✓ انحفظ' : 'حفظ الملف'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
