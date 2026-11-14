// التحكم بالتطبيق مباشرة: وضع الصيانة، تشغيل وإيقاف الأقسام، تسعير الذروة، النافذة المنبثقة
import { useEffect, useState } from 'react'
import { Check, Clock, ImagePlus, LoaderCircle, Megaphone, Plus, Power, Trash2, Wrench, X, Zap } from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'
import { imageToDataUrl, inputCls, money } from './shared'

const Card = ({ children, className = '' }) => <section className={`rounded-3xl bg-white p-5 shadow-soft ${className}`}>{children}</section>
const Err = ({ children }) =>
  children ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{children}</p> : null
const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="text-sm font-bold">{label}</span>
    {hint && <span className="block text-[11px] text-navy/40">{hint}</span>}
    <div className="mt-1.5">{children}</div>
  </label>
)
function Head({ Icon, title, sub, tone = 'brand', right }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand'}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-extrabold">{title}</h2>
        <p className="text-xs text-navy/50">{sub}</p>
      </div>
      {right}
    </div>
  )
}
function Switch({ on, onChange, label, danger }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? (danger ? 'bg-red-500' : 'bg-brand') : 'bg-navy/15'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'start-6' : 'start-1'}`} />
    </button>
  )
}
function Save({ busy, saved, onClick, children = 'حفظ', danger }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold text-white disabled:opacity-60 ${danger ? 'bg-red-500' : 'bg-brand'}`}
    >
      {busy ? <LoaderCircle size={18} className="animate-spin" /> : saved ? <><Check size={18} /> تم الحفظ، والتطبيق بيتحدّث خلال دقيقة</> : children}
    </button>
  )
}

/** حفظ جزء واحد من الإعدادات */
function useSaver(onSaved) {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const save = async (body) => {
    setBusy(true)
    setError('')
    try {
      const d = await adminApi('/controls', { method: 'PUT', body })
      onSaved(d)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      return true
    } catch (e) {
      setError(adminErrorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, saved, error, save }
}

export default function AppControlPanel({ can }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    adminApi('/controls')
      .then(setData)
      .catch((e) => setError(adminErrorText(e)))
  }, [])
  if (error) return <Err>{error}</Err>
  if (!data)
    return (
      <div className="flex justify-center py-16 text-brand">
        <LoaderCircle className="animate-spin" />
      </div>
    )
  const content = can('content.manage')
  const pricing = can('pricing.manage')
  const m = data.controls.maintenance
  const paused = data.services.filter((s) => s.state === 'paused').length

  return (
    <div className="space-y-4">
      {/* الحالة الحالية بنظرة */}
      <div className={`speed-bg flex flex-wrap items-center gap-x-6 gap-y-2 rounded-3xl p-5 text-white ${m.enabled ? 'bg-red-600' : 'bg-brand'}`}>
        <span className="flex items-center gap-2 text-lg font-black">
          <Power size={20} className={m.enabled ? '' : 'text-lime'} />
          {m.enabled ? 'التطبيق موقّف (وضع الصيانة)' : 'التطبيق شغّال'}
        </span>
        <span className="text-sm text-white/80">
          أجرة التوصيل هلق: <b className="num-zap text-lime">{money(data.fee.now)}</b>
          {data.fee.peakActive && ` (ذروة${data.fee.until ? ` حتى ${data.fee.until}` : ''})`}
        </span>
        <span className="text-sm text-white/80">{paused ? `${paused} قسم موقّف مؤقتاً` : 'كل الأقسام شغّالة'}</span>
        {data.controls.popup.enabled && <span className="text-sm text-white/80">في نافذة منبثقة مفعّلة</span>}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {content && <Maintenance data={data} onSaved={setData} />}
        {content && <Services data={data} onSaved={setData} />}
        {content && <HomeSections data={data} onSaved={setData} />}
        {pricing && <Peak data={data} onSaved={setData} />}
        {content && <Popup data={data} onSaved={setData} />}
      </div>
    </div>
  )
}

/* ───────── وضع الصيانة ───────── */
function Maintenance({ data, onSaved }) {
  const [f, setF] = useState(data.controls.maintenance)
  const [confirm, setConfirm] = useState(false)
  const { busy, saved, error, save } = useSaver(onSaved)
  const live = data.controls.maintenance.enabled
  const toggle = async () => {
    if (!live && !confirm) return setConfirm(true)
    setConfirm(false)
    const next = { ...f, enabled: !live }
    if (await save({ maintenance: next })) setF(next)
  }
  return (
    <Card className={live ? 'ring-2 ring-red-400' : ''}>
      <Head Icon={Wrench} tone="red" title="وضع الصيانة" sub="بيوقف التطبيق عند كل الزبائن ويعرض رسالتك. تطبيق العمال ولوحة الإدارة بيضلّوا شغّالين." />
      <div className="space-y-3">
        <Field label="العنوان">
          <input className={inputCls} value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="الرسالة للزبائن" hint="مثلاً: منرجع الساعة 10 الصبح">
          <textarea rows={3} className={inputCls} value={f.message} maxLength={300} onChange={(e) => setF({ ...f, message: e.target.value })} />
        </Field>
      </div>
      {live && (
        <button onClick={() => save({ maintenance: { ...f, enabled: true } })} className="mt-3 w-full rounded-2xl bg-navy/5 py-2.5 text-xs font-bold">
          تحديث الرسالة فقط
        </button>
      )}
      <Save busy={busy} saved={saved} onClick={toggle} danger={!live}>
        {live ? 'رجّع تشغيل التطبيق' : confirm ? 'متأكد؟ اضغط مرة تانية لإيقاف التطبيق' : 'فعّل وضع الصيانة'}
      </Save>
      {confirm && (
        <button onClick={() => setConfirm(false)} className="mt-2 w-full text-xs font-bold text-navy/50">
          تراجع
        </button>
      )}
      <Err>{error}</Err>
    </Card>
  )
}

/* ───────── الأقسام ───────── */
const STATES = [
  { id: 'on', label: 'شغّال' },
  { id: 'paused', label: 'متوقف مؤقتاً' },
  { id: 'hidden', label: 'مخفي' },
]
function Services({ data, onSaved }) {
  const [list, setList] = useState(data.services)
  const { busy, saved, error, save } = useSaver((d) => {
    onSaved(d)
    setList(d.services)
  })
  const upd = (id, patch) => setList((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  return (
    <Card>
      <Head Icon={Power} title="خيارات الصفحة الرئيسية" sub="جرة الغاز والمازوت والصيدلية وغيرها. الموقّف بيظهر باهت مع رسالتك، والمخفي بيختفي من الصفحة كلياً ومن اختيارات الطلب." />
      <ul className="space-y-3">
        {list.map((s) => (
          <li key={s.id} className="rounded-2xl border border-navy/10 p-3">
            <div className="flex items-center gap-3">
              <span className="flex-1 font-bold">{s.label}</span>
              <div className="flex rounded-xl bg-navy/5 p-1 text-[11px] font-bold">
                {STATES.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => upd(s.id, { state: st.id })}
                    className={`rounded-lg px-2.5 py-1.5 transition ${
                      s.state === st.id ? (st.id === 'on' ? 'bg-lime text-navy' : st.id === 'paused' ? 'bg-amber-400 text-navy' : 'bg-navy text-white') : 'text-navy/50'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            {s.state === 'paused' && (
              <input
                className={`${inputCls} mt-2`}
                placeholder="سبب الإيقاف للزبون، مثلاً: نفد الغاز اليوم، منرجع بكرا"
                maxLength={120}
                value={s.pauseNote}
                onChange={(e) => upd(s.id, { pauseNote: e.target.value })}
              />
            )}
          </li>
        ))}
      </ul>
      <Save busy={busy} saved={saved} onClick={() => save({ services: list.map(({ id, state, pauseNote }) => ({ id, state, pauseNote })) })} />
      <Err>{error}</Err>
    </Card>
  )
}

/* ───────── أقسام الصفحة الرئيسية ───────── */
const HOME_PARTS = [
  ['banners', 'الإعلانات', 'السلايدر تحت صندوق الطلب (إذا في إعلانات مفعّلة)'],
  ['shortcuts', 'الاختصارات "أو ابدأ من هون"', 'مربعات الغاز والمازوت والصيدلية وغيرها'],
  ['howItWorks', '"كيف بتمشي؟"', 'شرح الخطوات، بيطلع للزبون الجديد بس'],
]
function HomeSections({ data, onSaved }) {
  const [f, setF] = useState(data.controls.home)
  const { busy, saved, error, save } = useSaver((d) => {
    onSaved(d)
    setF(d.controls.home)
  })
  return (
    <Card>
      <Head Icon={Megaphone} title="أقسام الصفحة الرئيسية" sub='صندوق "اكتب طلبك" دايماً ظاهر لأنه الخدمة الأساسية. الباقي فيك تخفيه.' />
      <ul className="space-y-2">
        {HOME_PARTS.map(([k, label, hint]) => (
          <li key={k} className="flex items-center gap-3 rounded-2xl border border-navy/10 p-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{label}</span>
              <span className="block text-[11px] text-navy/45">{hint}</span>
            </span>
            <span className={`text-[11px] font-bold ${f[k] ? 'text-brand' : 'text-navy/40'}`}>{f[k] ? 'ظاهر' : 'مخفي'}</span>
            <Switch on={!!f[k]} onChange={(v) => setF({ ...f, [k]: v })} label={label} />
          </li>
        ))}
      </ul>
      <Save busy={busy} saved={saved} onClick={() => save({ home: f })} />
      <Err>{error}</Err>
    </Card>
  )
}

/* ───────── تسعير الذروة ───────── */
const DAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
function Peak({ data, onSaved }) {
  const [f, setF] = useState(data.controls.peak)
  const { busy, saved, error, save } = useSaver((d) => {
    onSaved(d)
    setF(d.controls.peak)
  })
  const setW = (i, patch) => setF({ ...f, schedule: f.schedule.map((w, j) => (j === i ? { ...w, ...patch } : w)) })
  const extra = Number(f.extra) || 0
  return (
    <Card>
      <Head
        Icon={Zap}
        title="تسعير أوقات الذروة"
        sub="زيادة على أجرة التوصيل بأوقات الضغط. الطلب بيحفظ الأجرة وقت ما انطلب."
        right={data.fee.peakActive && <span className="rounded-full bg-lime px-2.5 py-1 text-[11px] font-black text-navy">شغّالة هلق</span>}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="الزيادة" hint={`الأجرة العادية ${money(data.fee.base)}`}>
          <input type="number" min={0} inputMode="numeric" className={inputCls} value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} />
        </Field>
        <Field label="الاسم للزبون" hint="بيظهر بالتطبيق">
          <input className={inputCls} maxLength={30} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        </Field>
      </div>
      <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand">
        وقت الذروة بتصير الأجرة {money(data.fee.base + extra)} بدل {money(data.fee.base)}
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-navy/10 p-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">شغّل الذروة هلق يدوياً</span>
          <span className="block text-[11px] text-navy/45">مثلاً وقت مطر أو ضغط مفاجئ. بتضل شغّالة لحتى تطفيها.</span>
        </span>
        <Switch on={f.manual} onChange={(v) => setF({ ...f, manual: v })} label="ذروة يدوية" />
      </div>

      <p className="mt-4 text-sm font-bold">مواعيد ثابتة (بتوقيت دمشق)</p>
      <ul className="mt-2 space-y-2">
        {f.schedule.map((w, i) => (
          <li key={i} className="rounded-2xl border border-navy/10 p-3">
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d, n) => {
                const on = w.days.includes(n)
                return (
                  <button
                    key={n}
                    onClick={() => setW(i, { days: on ? w.days.filter((x) => x !== n) : [...w.days, n] })}
                    className={`rounded-lg px-2 py-1 text-[11px] font-bold ${on ? 'bg-brand text-white' : 'bg-navy/5 text-navy/50'}`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs font-bold">
              <Clock size={15} className="text-navy/40" />
              من
              <input type="time" dir="ltr" className={`${inputCls} !w-36 !py-1.5`} value={w.from} onChange={(e) => setW(i, { from: e.target.value })} />
              لـ
              <input type="time" dir="ltr" className={`${inputCls} !w-36 !py-1.5`} value={w.to} onChange={(e) => setW(i, { to: e.target.value })} />
              <button onClick={() => setF({ ...f, schedule: f.schedule.filter((_, j) => j !== i) })} aria-label="حذف" className="ms-auto rounded-lg p-1.5 text-rose-500 hover:bg-rose-50">
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        onClick={() => setF({ ...f, schedule: [...f.schedule, { days: [0, 1, 2, 3, 4, 5, 6], from: '13:00', to: '15:00' }] })}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-navy/15 py-2.5 text-xs font-bold text-navy/60"
      >
        <Plus size={15} /> أضف موعد ذروة
      </button>
      <Save busy={busy} saved={saved} onClick={() => save({ peak: { ...f, extra } })} />
      <Err>{error}</Err>
    </Card>
  )
}

/* ───────── النافذة المنبثقة ───────── */
const ACTIONS = { none: 'بدون زر (إغلاق فقط)', order: 'يفتح طلب جديد', gas: 'يفتح طلب الغاز', url: 'يفتح رابط' }
const CATS = { any: 'أي محل', restaurants: 'مطعم', supermarket: 'سوبرماركت', pharmacy: 'صيدلية', library: 'مكتبة', diesel: 'مازوت' }
const FREQ = { once: 'مرة وحدة لكل زبون', daily: 'مرة كل يوم', always: 'كل ما يفتح التطبيق' }
function Popup({ data, onSaved }) {
  const [f, setF] = useState(data.controls.popup)
  const [image, setImage] = useState(undefined) // undefined = بدون تغيير
  const [again, setAgain] = useState(false)
  const { busy, saved, error, save } = useSaver((d) => {
    onSaved(d)
    setF(d.controls.popup)
    setImage(undefined)
    setAgain(false)
  })
  const preview = image === undefined ? f.image : image
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setImage(await imageToDataUrl(file, 1000))
  }
  const submit = () => save({ popup: { ...f, ...(image !== undefined ? { image } : {}), showAgain: again } })
  return (
    <Card className="lg:col-span-2">
      <Head
        Icon={Megaphone}
        title="النافذة المنبثقة"
        sub="رسالة بتطلع للزبون أول ما يفتح التطبيق: عرض، خبر، أو تنبيه."
        right={<Switch on={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="تفعيل النافذة" />}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <Field label="العنوان">
            <input className={inputCls} maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثلاً: توصيل مجاني اليوم" />
          </Field>
          <Field label="النص">
            <textarea rows={3} className={inputCls} maxLength={400} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </Field>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold">
              <ImagePlus size={16} /> {preview ? 'غيّر الصورة' : 'أضف صورة'}
              <input type="file" accept="image/*" className="hidden" onChange={pick} />
            </label>
            {preview && (
              <button onClick={() => setImage(null)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-rose-500">
                <X size={14} /> شيل الصورة
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الزر">
              <select className={inputCls} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, actionValue: e.target.value === 'order' ? 'any' : '' })}>
                {Object.entries(ACTIONS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="نص الزر">
              <input className={inputCls} maxLength={30} value={f.buttonText} onChange={(e) => setF({ ...f, buttonText: e.target.value })} placeholder="اطلب الآن" />
            </Field>
          </div>
          {f.action === 'order' && (
            <Field label="نوع المحل">
              <select className={inputCls} value={f.actionValue || 'any'} onChange={(e) => setF({ ...f, actionValue: e.target.value })}>
                {Object.entries(CATS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
          )}
          {f.action === 'url' && (
            <Field label="الرابط">
              <input dir="ltr" className={inputCls} value={f.actionValue} onChange={(e) => setF({ ...f, actionValue: e.target.value })} placeholder="https://" />
            </Field>
          )}
          <Field label="كم مرة تطلع؟">
            <select className={inputCls} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>
              {Object.entries(FREQ).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          {data.controls.popup.enabled && (
            <label className="flex items-center gap-2 text-xs font-bold text-navy/70">
              <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} className="h-4 w-4 accent-brand" />
              اعرضها من جديد حتى للي شافوها قبل
            </label>
          )}
        </div>

        {/* معاينة متل ما بيشوفها الزبون */}
        <div className="rounded-3xl bg-navy/60 p-4">
          <div className="overflow-hidden rounded-[1.5rem] bg-white">
            {preview ? (
              <img src={preview} alt="" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="speed-bg flex h-24 items-center justify-center bg-brand">
                <Zap size={34} className="text-lime" />
              </div>
            )}
            <div className="p-4 text-center">
              <p className="font-black">{f.title || 'العنوان هون'}</p>
              {f.body && <p className="mt-1.5 whitespace-pre-line text-xs text-navy/60">{f.body}</p>}
              <p className={`mt-3 py-2.5 text-xs font-extrabold ${f.action !== 'none' && f.buttonText ? 'btn-zap bg-brand text-white' : 'rounded-xl bg-navy/5'}`}>
                {f.buttonText || 'حسناً'}
              </p>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-white/70">معاينة</p>
        </div>
      </div>
      <Save busy={busy} saved={saved} onClick={submit} />
      <Err>{error}</Err>
    </Card>
  )
}
