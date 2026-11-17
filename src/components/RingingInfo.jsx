import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'

// الطلب الجديد: عند مين عم يرن هلق، وقديش باقي، ومين رفضه أو ما ردّ قبل
export default function RingingInfo({ to, expiresAt, tried = [], compact = false }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  const left = expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)) : 0
  const declined = tried.filter((x) => x.status === 'declined').map((x) => x.name)
  const missed = tried.filter((x) => x.status === 'expired').map((x) => x.name)
  if (!to && !tried.length) return null
  return (
    <div className={`rounded-xl bg-amber-50 text-amber-900 ${compact ? 'mt-1.5 px-2.5 py-1.5 text-[11px]' : 'mt-2 px-3 py-2 text-xs'}`}>
      {to ? (
        <p className="flex items-center gap-1.5 font-extrabold">
          <BellRing size={compact ? 13 : 15} className="shrink-0 animate-pulse text-amber-600" />
          <span className="min-w-0 flex-1 truncate">عم يرن عند {to}</span>
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-en ${left <= 10 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100'}`}>{left} ث</span>
        </p>
      ) : (
        <p className="font-extrabold text-rose-700">ما عم يرن عند حدا هلق، عم ندوّر عامل متاح</p>
      )}
      {declined.length > 0 && <p className="mt-0.5 truncate font-bold text-amber-800/80">رفضه: {declined.join('، ')}</p>}
      {missed.length > 0 && <p className="mt-0.5 truncate font-bold text-amber-800/80">ما ردّ: {missed.join('، ')}</p>}
    </div>
  )
}
