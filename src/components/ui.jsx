import { Check } from 'lucide-react'

/* ——— مكونات صغيرة مساعدة ——— */

export function Stepper({ step, labels }) {
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

export function Field({ label, children }) {
  return (
    <div>
      <div className="mb-3 text-sm font-extrabold">{label}</div>
      {children}
    </div>
  )
}

export function Choice({ active, onClick, children }) {
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

export function RowChoice({ active, onClick, Icon, title, sub }) {
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

export function Stepper2({ onClick, Icon }) {
  return (
    <button
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-navy shadow-soft active:scale-90"
    >
      <Icon size={20} />
    </button>
  )
}

