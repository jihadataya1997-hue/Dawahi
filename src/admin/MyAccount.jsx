// حسابي: تغيير كلمة السر (للمالك ولكل موظف)
import { useState } from 'react'
import { Check, Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react'
import { adminApi, adminErrorText } from './adminApi'
import { inputCls } from './shared'

function PassInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        dir="ltr"
        autoComplete={autoComplete}
        className={`${inputCls} pe-11`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'إخفاء' : 'إظهار'} className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-navy/40">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

export default function MyAccount({ me }) {
  const [f, setF] = useState({ current: '', next: '', again: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setDone(false)
    if (!f.current) return setError('اكتب كلمة السر الحالية')
    if (f.next.length < 8) return setError('كلمة السر الجديدة لازم تكون 8 أحرف على الأقل')
    if (f.next !== f.again) return setError('كلمة السر الجديدة وتأكيدها مو متطابقين')
    if (f.next === f.current) return setError('كلمة السر الجديدة نفس القديمة')
    setBusy(true)
    try {
      await adminApi('/password', { method: 'POST', body: { current: f.current, next: f.next } })
      setDone(true)
      setF({ current: '', next: '', again: '' })
    } catch (err) {
      setError(err.code === 'WRONG_CURRENT' ? 'كلمة السر الحالية غلط' : adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-soft">
        <p className="text-xs text-navy/50">مسجّل الدخول باسم</p>
        <p className="mt-1 text-lg font-extrabold">{me.name}</p>
        <p className="text-sm text-navy/55">{me.role}</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-5 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand">
            <KeyRound size={20} />
          </span>
          <div>
            <h2 className="font-extrabold">تغيير كلمة السر</h2>
            <p className="text-xs text-navy/50">بعد التغيير، أي جهاز تاني فايت بحسابك بيطلع لحاله.</p>
          </div>
        </div>
        <label className="block">
          <span className="text-sm font-bold">كلمة السر الحالية</span>
          <div className="mt-1.5">
            <PassInput value={f.current} onChange={(v) => setF({ ...f, current: v })} autoComplete="current-password" />
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-bold">كلمة السر الجديدة</span>
          <span className="block text-[11px] text-navy/40">8 أحرف على الأقل. الأفضل تخلط أحرف وأرقام.</span>
          <div className="mt-1.5">
            <PassInput value={f.next} onChange={(v) => setF({ ...f, next: v })} autoComplete="new-password" />
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-bold">أعد كتابة كلمة السر الجديدة</span>
          <div className="mt-1.5">
            <PassInput value={f.again} onChange={(v) => setF({ ...f, again: v })} autoComplete="new-password" />
          </div>
        </label>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
        {done && (
          <p className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-700">
            <Check size={15} /> تغيّرت كلمة السر. استعمل الجديدة بالمرة الجاية.
          </p>
        )}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-extrabold text-white disabled:opacity-60">
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'غيّر كلمة السر'}
        </button>
      </form>
    </div>
  )
}
