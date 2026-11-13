import { useEffect, useState } from 'react'
import { Bell, LoaderCircle, X } from 'lucide-react'
import { api } from '../api'
import { useLang } from '../i18n/LanguageProvider'

const SEEN_KEY = 'dawahi.inboxSeen'
export const getSeen = () => {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0
  } catch {
    return 0
  }
}
const setSeen = (id) => {
  try {
    localStorage.setItem(SEEN_KEY, String(id))
  } catch {}
}

/** يجيب الإشعارات العامة ويحسب غير المقروء */
export function useInbox() {
  const [items, setItems] = useState(null)
  const load = () =>
    api('/announcements')
      .then((d) => setItems(d.announcements))
      .catch(() => setItems((x) => x || []))
  useEffect(() => {
    load()
    const id = setInterval(() => document.visibilityState === 'visible' && load(), 60000)
    return () => clearInterval(id)
  }, [])
  const unread = (items || []).filter((a) => a.id > getSeen()).length
  return { items, unread, reload: load }
}

export default function InboxSheet({ open, items, onClose }) {
  const { t, lang } = useLang()
  const [, force] = useState(0)
  useEffect(() => {
    if (open && items?.length) {
      setSeen(Math.max(...items.map((a) => a.id)))
      force((x) => x + 1)
    }
  }, [open, items])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col justify-end">
      <div className="absolute inset-0 bg-navy/60 animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[85%] flex-col rounded-t-[2rem] bg-white animate-sheet-up">
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Bell size={20} className="text-brand" /> {t('inbox.title')}
          </h2>
          <button onClick={onClose} aria-label={t('inbox.close')} className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50">
            <X size={18} />
          </button>
        </div>
        <div className="scrollbar-hide flex-1 overflow-y-auto px-5 pb-8">
          {!items ? (
            <div className="flex justify-center py-10 text-brand">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-bold">{t('inbox.empty')}</p>
              <p className="mt-1 text-sm text-navy/50">{t('inbox.emptySub')}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((a) => (
                <li key={a.id} className="rounded-2xl bg-navy-50 p-4">
                  <p className="font-bold">{a.title}</p>
                  {a.body && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-navy/70">{a.body}</p>}
                  <p className="mt-2 text-[11px] text-navy/40">
                    {new Date(a.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SY' : 'en-GB', { day: 'numeric', month: 'long' })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
