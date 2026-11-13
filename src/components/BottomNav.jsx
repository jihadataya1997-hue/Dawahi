import { ClipboardList, House, UserRound, Wallet } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

const items = [
  { id: 'home', Icon: House },
  { id: 'orders', Icon: ClipboardList },
  { id: 'wallet', Icon: Wallet },
  { id: 'account', Icon: UserRound },
]

export default function BottomNav({ active, onChange }) {
  const { t } = useLang()
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md rounded-t-3xl border-t border-navy/5 bg-white shadow-[0_-8px_30px_-12px_rgba(30,46,74,0.2)]">
      <ul className="flex items-center justify-around px-2 py-2">
        {items.map(({ id, Icon }) => {
          const on = active === id
          return (
            <li key={id}>
              <button
                onClick={() => onChange(id)}
                className={`flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition active:scale-95 ${
                  on ? 'text-brand' : 'text-navy/40'
                }`}
              >
                <span className={`flex h-8 w-12 items-center justify-center rounded-full transition ${on ? 'bg-brand-50' : ''}`}>
                  <Icon size={22} strokeWidth={on ? 2.4 : 2} />
                </span>
                <span className="text-[11px] font-bold">{t(`nav.${id}`)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
