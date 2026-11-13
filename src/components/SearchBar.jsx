import { useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'

// البحث يتحول لطلب: يكتب الزبون شو بدو ويضغط Enter فيفتح "اطلب أي شي"
export default function SearchBar({ onSubmit }) {
  const { t } = useLang()
  const [q, setQ] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(q.trim())
        setQ('')
      }}
      className="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-soft"
    >
      <Search size={20} className="ms-2 shrink-0 text-navy/40" />
      <input
        type="search"
        enterKeyHint="go"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm text-navy outline-none placeholder:text-navy/40"
      />
      <button
        type="button"
        aria-label="Filter"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition active:scale-95"
      >
        <SlidersHorizontal size={18} />
      </button>
    </form>
  )
}
