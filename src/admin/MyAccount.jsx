// حسابي: تغيير كلمة السر (للمالك ولكل موظف)
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { AtSign, Check, Copy, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
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
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'إخفاء' : 'إظهار'} className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-navy/60">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

export default function MyAccount({ me, mfaOnly = false, onMfaEnabled }) {
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

  if (mfaOnly)
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Security mfaOnly onMfaEnabled={onMfaEnabled} />
      </div>
    )
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-soft">
        <p className="text-xs text-navy/60">مسجّل الدخول باسم</p>
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
            <p className="text-xs text-navy/60">بعد التغيير، أي جهاز تاني فايت بحسابك بيطلع لحاله.</p>
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
          <span className="block text-[11px] text-navy/60">8 أحرف على الأقل. الأفضل تخلط أحرف وأرقام.</span>
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

      <Security />
    </div>
  )
}

/* ───────── اسم المستخدم + التحقق بخطوتين ───────── */
function Security({ mfaOnly = false, onMfaEnabled }) {
  const [sec, setSec] = useState(null)
  const [error, setError] = useState('')
  const load = () => adminApi('/security').then(setSec).catch((e) => setError(adminErrorText(e)))
  useEffect(() => void load(), [])
  if (!sec) return error ? <p className="text-center text-xs text-rose-600">{error}</p> : null
  return (
    <>
      {!mfaOnly && (sec.canChangeUsername ? <UsernameCard current={sec.username} onSaved={load} /> : <StaffUsername username={sec.username} />)}
      <MfaCard sec={sec} onChanged={load} onEnabled={onMfaEnabled} />
    </>
  )
}

function StaffUsername({ username }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-white p-5 shadow-soft">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand">
        <AtSign size={20} />
      </span>
      <div>
        <h2 className="font-extrabold">اسم المستخدم</h2>
        <p className="text-xs text-navy/60">
          <b dir="ltr" className="font-en">{username}</b> · المالك بيقدر يغيّره
        </p>
      </div>
    </div>
  )
}

function UsernameCard({ current, onSaved }) {
  const [u, setU] = useState(current)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      await adminApi('/username', { method: 'PUT', body: { username: u, password: pw } })
      setPw('')
      setMsg('✓ تغيّر اسم المستخدم')
      onSaved()
    } catch (err) {
      setMsg(
        err.code === 'WRONG_CURRENT'
          ? 'كلمة السر غلط'
          : err.code === 'INVALID_USERNAME'
            ? 'من 3 لـ 30 حرف إنكليزي أو أرقام (مو أرقام بس)'
            : err.code === 'USERNAME_TAKEN'
              ? 'هالاسم مأخوذ'
              : adminErrorText(err)
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-3xl bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand">
          <AtSign size={20} />
        </span>
        <div>
          <h2 className="font-extrabold">اسم المستخدم</h2>
          <p className="text-xs text-navy/60">
            هلق: <b dir="ltr" className="font-en">{current}</b>
          </p>
        </div>
      </div>
      <input dir="ltr" autoCapitalize="none" value={u} onChange={(e) => setU(e.target.value.trim())} className={`${inputCls} font-en`} />
      <PassInput value={pw} onChange={setPw} placeholder="كلمة السر للتأكيد" autoComplete="current-password" />
      {msg && <p className="text-center text-xs font-bold text-brand">{msg}</p>}
      <button disabled={busy || !pw || u === current} className="w-full rounded-2xl bg-navy py-3 text-sm font-extrabold text-white disabled:opacity-50">
        حفظ اسم المستخدم
      </button>
    </form>
  )
}

function MfaCard({ sec, onChanged, onEnabled }) {
  const [setup, setSetup] = useState(null) // { secret, uri, qr }
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState(null) // الرموز الاحتياطية بعد التفعيل
  const [disabling, setDisabling] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await adminApi('/mfa/setup', { method: 'POST' })
      const qr = await QRCode.toDataURL(d.uri, { margin: 1, width: 240, color: { dark: '#1E0E4F', light: '#ffffff' } })
      setSetup({ ...d, qr })
    } catch (e) {
      setError(adminErrorText(e))
    } finally {
      setBusy(false)
    }
  }
  const enable = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const d = await adminApi('/mfa/enable', { method: 'POST', body: { code } })
      setCodes(d.recoveryCodes)
      setSetup(null)
      setCode('')
      onChanged()
    } catch (err) {
      setError(err.code === 'WRONG_CODE' ? 'الرمز غلط. تأكد إن وقت الموبايل مضبوط وجرّب الرمز الجديد' : err.code === 'MFA_EXPIRED' ? 'انتهى الوقت، ابدأ من جديد' : adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }
  const disable = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminApi('/mfa/disable', { method: 'POST', body: { password: pw, code } })
      setDisabling(false)
      setPw('')
      setCode('')
      onChanged()
    } catch (err) {
      setError(err.code === 'WRONG_CURRENT' ? 'كلمة السر غلط' : err.code === 'WRONG_CODE' ? 'الرمز غلط' : adminErrorText(err))
    } finally {
      setBusy(false)
    }
  }
  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
    } catch {}
  }

  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${sec.mfa.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand'}`}>
          <ShieldCheck size={20} />
        </span>
        <div className="flex-1">
          <h2 className="font-extrabold">التحقق بخطوتين</h2>
          <p className="text-xs text-navy/60">
            {sec.mfa.enabled
              ? `شغّال ✓ · باقي ${sec.mfa.recoveryLeft} رموز احتياطية`
              : 'بعد كلمة السر، بيطلب رمز من تطبيق Authenticator على موبايلك. حتى لو حدا عرف كلمة السر ما بيقدر يفوت.'}
          </p>
        </div>
      </div>

      {codes && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-extrabold text-amber-800">احفظ هالرموز الاحتياطية هلق!</p>
          <p className="mt-1 text-xs text-amber-800/80">إذا ضاع موبايلك، بتفوت بواحد منهن (كل رمز لمرة وحدة). ما رح يطلعوا مرة تانية.</p>
          <div dir="ltr" className="mt-3 grid grid-cols-2 gap-2 font-en text-sm font-bold">
            {codes.map((c) => (
              <span key={c} className="rounded-lg bg-white px-2 py-1.5 text-center">
                {c}
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={copyCodes} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-xs font-bold">
              <Copy size={14} /> {copied ? '✓ انتسخوا' : 'نسخ'}
            </button>
            <button onClick={() => (setCodes(null), onEnabled?.())} className="flex-1 rounded-xl bg-amber-600 py-2 text-xs font-bold text-white">
              حفظتهن
            </button>
          </div>
        </div>
      )}

      {!sec.mfa.enabled && !setup && (
        <button onClick={start} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-extrabold text-white disabled:opacity-60">
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'فعّل التحقق بخطوتين'}
        </button>
      )}

      {setup && (
        <form onSubmit={enable} className="space-y-3">
          <ol className="list-decimal space-y-1.5 ps-5 text-sm text-navy/75">
            <li>
              نزّل تطبيق <b>Google Authenticator</b> أو <b>Microsoft Authenticator</b> على موبايلك.
            </li>
            <li>بالتطبيق اكبس <b>+</b> وبعدين <b>مسح رمز QR</b>، وامسح هالرمز:</li>
          </ol>
          <img src={setup.qr} alt="QR" className="mx-auto h-48 w-48 rounded-xl border border-navy/10" />
          <details className="text-xs text-navy/55">
            <summary className="cursor-pointer font-bold">ما زبط المسح؟ اكتب المفتاح بإيدك</summary>
            <p dir="ltr" className="mt-2 select-all break-all rounded-lg bg-navy-50 p-2 text-center font-en font-bold">
              {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
            </p>
          </details>
          <p className="text-sm text-navy/75">3. اكتب الرمز يلي طلع بالتطبيق (6 أرقام):</p>
          <input
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className={`${inputCls} text-center font-en text-2xl font-black tracking-[0.4em]`}
          />
          <button disabled={busy || code.length !== 6} className="flex w-full items-center justify-center rounded-2xl bg-brand py-3 text-sm font-extrabold text-white disabled:opacity-60">
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : 'تأكيد وتفعيل'}
          </button>
          <button type="button" onClick={() => (setSetup(null), setCode(''))} className="w-full text-xs font-bold text-navy/60">
            إلغاء
          </button>
        </form>
      )}

      {sec.mfa.enabled &&
        !codes &&
        (disabling ? (
          <form onSubmit={disable} className="space-y-2 rounded-2xl bg-rose-50 p-3">
            <p className="text-xs font-bold text-rose-700">لتوقيف التحقق بخطوتين اكتب كلمة السر ورمز التطبيق:</p>
            <PassInput value={pw} onChange={setPw} placeholder="كلمة السر" autoComplete="current-password" />
            <input
              dir="ltr"
              inputMode="numeric"
              maxLength={11}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="رمز التطبيق"
              className={`${inputCls} text-center font-en`}
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDisabling(false)} className="rounded-xl bg-white py-2 text-xs font-bold">
                رجوع
              </button>
              <button disabled={busy || !pw || !code} className="rounded-xl bg-rose-600 py-2 text-xs font-bold text-white disabled:opacity-50">
                وقّف التحقق
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setDisabling(true)} className="w-full text-xs font-bold text-rose-600">
            توقيف التحقق بخطوتين
          </button>
        ))}
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}
    </div>
  )
}
