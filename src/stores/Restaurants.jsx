import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Minus, Plus, UtensilsCrossed, X } from 'lucide-react'
import { api } from '../api'
import { useLang } from '../i18n/LanguageProvider'
import { useAppConfig } from '../config/AppConfigProvider'

// المطاعم الشريكة: بتنجاب من السيرفر، وإذا ما في ولا مطعم منشور ما بيطلع شي بالواجهة
export function useStores() {
  const [stores, setStores] = useState([])
  useEffect(() => {
    let alive = true
    const load = () => api('/stores').then((d) => alive && setStores(d.stores || [])).catch(() => {})
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => ((alive = false), clearInterval(id))
  }, [])
  return stores
}

export function RestaurantsRow({ stores, onOpen }) {
  const { lang } = useLang()
  if (!stores.length) return null
  const ar = lang === 'ar'
  return (
    <section>
      <h2 className="mb-3 text-lg font-black">{ar ? 'مطاعم الضاحية' : 'Local restaurants'}</h2>
      <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4">
        {stores.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s)}
            className={`w-44 shrink-0 overflow-hidden rounded-[1.5rem] bg-white text-start shadow-soft active:scale-[0.98] ${s.isOpen ? '' : 'opacity-60'}`}
          >
            <span className="relative block h-24 bg-brand">
              {s.cover && <img src={s.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
              <span className="absolute -bottom-5 start-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border-[3px] border-white bg-lime text-navy">
                {s.logo ? <img src={s.logo} alt="" className="h-full w-full object-cover" /> : <UtensilsCrossed size={20} />}
              </span>
            </span>
            <span className="block px-3 pb-3 pt-7">
              <span className="block truncate text-sm font-black">{s.name}</span>
              <span className="block truncate text-[11px] text-navy/50">
                {s.isOpen ? s.description || (ar ? `${s.items.length} صنف` : `${s.items.length} items`) : ar ? 'مسكّر هلق' : 'Closed now'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** قائمة المطعم: الأصناف بأقسامها، وسلة تحت */
export function StoreSheet({ store, onClose, onCheckout }) {
  const { lang, formatNumber } = useLang()
  const { money } = useAppConfig()
  const ar = lang === 'ar'
  const [qty, setQty] = useState({})
  useEffect(() => {
    setQty({})
    document.body.style.overflow = store ? 'hidden' : ''
    return () => (document.body.style.overflow = '')
  }, [store])

  const sections = useMemo(() => {
    const map = new Map()
    for (const it of store?.items || []) {
      const k = it.section || (ar ? 'القائمة' : 'Menu')
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(it)
    }
    return [...map.entries()]
  }, [store, ar])

  if (!store) return null
  const lines = (store.items || []).filter((i) => qty[i.id] > 0).map((i) => ({ id: i.id, name: i.name, price: i.price, qty: qty[i.id] }))
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const add = (id, d) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(50, (q[id] || 0) + d)) }))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 animate-fade-in" onClick={onClose}>
      <div className="flex max-h-[94%] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] bg-[#F6F5FB] animate-sheet-up" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-36 shrink-0 bg-brand">
          {store.cover && <img src={store.cover} alt="" className="h-full w-full object-cover" />}
          <button onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'} className="absolute end-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-navy">
            <X size={20} />
          </button>
          <span className="absolute -bottom-7 start-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-[#F6F5FB] bg-lime text-navy">
            {store.logo ? <img src={store.logo} alt="" className="h-full w-full object-cover" /> : <UtensilsCrossed size={26} />}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-9">
          <h2 className="text-2xl font-black">{store.name}</h2>
          {store.description && <p className="mt-1 text-sm text-navy/60">{store.description}</p>}
          {!store.isOpen && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{ar ? 'المطعم مسكّر هلق، فيك تتفرج عالقائمة' : 'Closed now — you can browse the menu'}</p>}

          {sections.map(([name, items]) => (
            <section key={name} className="mt-6">
              <h3 className="mb-2 text-base font-black">{name}</h3>
              <ul className="space-y-2.5">
                {items.map((it) => (
                  <li key={it.id} className={`flex gap-3 rounded-2xl bg-white p-3 shadow-soft ${it.available ? '' : 'opacity-50'}`}>
                    {it.image && <img src={it.image} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="text-sm font-extrabold">{it.name}</p>
                      {it.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-navy/55">{it.description}</p>}
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <span className="text-sm font-black text-brand">{money(it.price)}</span>
                        {!it.available ? (
                          <span className="text-[11px] font-bold text-navy/50">{ar ? 'خلصان' : 'Sold out'}</span>
                        ) : qty[it.id] ? (
                          <span className="flex items-center gap-2">
                            <button onClick={() => add(it.id, -1)} aria-label="-" className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-50">
                              <Minus size={15} />
                            </button>
                            <span className="num-zap w-5 text-center">{formatNumber(qty[it.id])}</span>
                            <button onClick={() => add(it.id, 1)} aria-label="+" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
                              <Plus size={15} />
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => add(it.id, 1)}
                            disabled={!store.isOpen}
                            className="flex items-center gap-1 rounded-full bg-lime px-3 py-1.5 text-xs font-black text-navy disabled:opacity-40"
                          >
                            <Plus size={14} /> {ar ? 'أضف' : 'Add'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {count > 0 && (
          <div className="pb-safe shrink-0 bg-white px-5 py-3">
            <button
              onClick={() => onCheckout({ storeId: store.id, storeName: store.name, lines, total })}
              className="flex w-full items-center gap-3 rounded-2xl bg-navy px-4 py-3.5 text-white active:scale-[0.99]"
            >
              <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-lime px-1.5 text-sm font-black text-navy">{formatNumber(count)}</span>
              <span className="flex-1 text-start text-sm font-black">{ar ? 'كمّل الطلب' : 'Checkout'}</span>
              <span className="text-sm font-black text-lime">{money(total)}</span>
              <ChevronLeft size={18} className="ltr:rotate-180" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

