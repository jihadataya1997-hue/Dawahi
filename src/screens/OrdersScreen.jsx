import CourierCard from '../components/CourierCard'
import { useState } from 'react'
import { ClipboardList, Flame, ImageIcon, LoaderCircle, MapPin, ShoppingBag } from 'lucide-react'
import { useLang } from '../i18n/LanguageProvider'
import { useOrders, OPEN_STATUSES } from '../orders/OrdersProvider'
import { errorText } from '../i18n/errorText'
import CustomerPushCard from '../components/CustomerPushCard'

const STATUS_STYLE = {
  new: 'bg-amber-50 text-amber-700',
  assigned: 'bg-sky-50 text-sky-700',
  buying: 'bg-violet-50 text-violet-700',
  on_the_way: 'bg-brand-50 text-brand-600',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-navy-50 text-navy/50',
}

export default function OrdersScreen({ onStart }) {
  const { t } = useLang()
  const { orders, loaded } = useOrders()

  return (
    <div className="animate-fade-in">
      <header className="speed-bg pt-safe rounded-b-[2rem] bg-brand px-5 pb-10 pt-6">
        <h1 className="text-lg font-extrabold text-white">{t('orders.title')}</h1>
      </header>

      {!loaded ? (
        <div className="flex justify-center pt-20 text-brand">
          <LoaderCircle size={32} className="animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-brand">
            <ClipboardList size={44} strokeWidth={1.75} />
          </span>
          <p className="mt-5 text-lg font-extrabold">{t('orders.empty')}</p>
          <p className="mt-1 text-sm text-navy/50">{t('orders.emptySub')}</p>
          <button onClick={onStart} className="mt-6 rounded-2xl bg-brand px-8 py-3.5 text-sm font-extrabold text-white active:scale-95">
            {t('orders.start')}
          </button>
        </div>
      ) : (
        <ul className="-mt-4 space-y-3 px-4">
          <li>
            <CustomerPushCard />
          </li>
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ul>
      )}
    </div>
  )
}

function OrderCard({ order: o }) {
  const { t, lang, formatNumber } = useLang()
  const { cancelOrder } = useOrders()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const date = new Date(o.createdAt).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
  const isGas = o.kind === 'gas'
  const summary = isGas
    ? `${formatNumber(o.details.qty)} × ${t('gas.cylinder')} — ${o.details.gasType === 'buy' ? t('gas.buy') : t('gas.swap')}`
    : o.details.items || (o.hasPhoto ? t('ordersExtra.photo') : '')
  const store = !isGas && o.details.storeMode === 'specific' && o.details.storeName

  const doCancel = async () => {
    setBusy(true)
    setError('')
    try {
      await cancelOrder(o.id)
      setConfirming(false)
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`rounded-3xl bg-white p-4 shadow-soft ${o.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
          {isGas ? <Flame size={20} /> : <ShoppingBag size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="num-zap text-sm">{o.number}</p>
          <p className="text-[11px] text-navy/50">{date}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[o.status]}`}>
          {t(`status.${o.status}`)}
        </span>
      </div>

      <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-navy/80">
        {o.hasPhoto && <ImageIcon size={14} className="me-1 inline text-navy/40" />}
        {summary}
      </p>
      {(store || o.address) && (
        <p className="mt-2 flex items-center gap-1 text-xs text-navy/50">
          <MapPin size={12} className="shrink-0" />
          <span className="truncate">{store || o.address}</span>
        </p>
      )}

      <CourierCard order={o} />
      {OPEN_STATUSES.includes(o.status) && <Progress status={o.status} />}

      {o.status === 'new' &&
        (confirming ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-rose-50 p-2 animate-fade-in">
            <span className="flex-1 ps-2 text-xs font-bold text-rose-700">{t('ordersExtra.cancelConfirm')}</span>
            <button onClick={() => setConfirming(false)} className="rounded-xl bg-white px-3 py-2 text-xs font-bold">
              {t('ordersExtra.keep')}
            </button>
            <button
              onClick={doCancel}
              disabled={busy}
              className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : t('ordersExtra.yesCancel')}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="mt-3 text-xs font-bold text-rose-600">
            {t('ordersExtra.cancel')}
          </button>
        ))}
      {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
    </li>
  )
}

function Progress({ status }) {
  const idx = OPEN_STATUSES.indexOf(status)
  return (
    <div className="mt-3 flex gap-1.5">
      {OPEN_STATUSES.map((s, i) => (
        <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-brand' : 'bg-navy/10'}`} />
      ))}
    </div>
  )
}
