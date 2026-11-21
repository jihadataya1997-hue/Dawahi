import { useEffect, useState } from 'react'
import { adminApi } from './adminApi'

// اختيار مطعم شريك (ووجبة منه اختيارياً) ليفتحها الزر عند الزبون. القيمة: "رقم المطعم" أو "رقم المطعم:رقم الوجبة"
export default function StoreTargetPicker({ value, onChange, inputCls }) {
  const [storeId, itemId] = String(value || '').split(':')
  const [stores, setStores] = useState(null)
  const [items, setItems] = useState([])
  useEffect(() => {
    adminApi('/stores')
      .then((d) => setStores(d.stores || []))
      .catch(() => setStores([]))
  }, [])
  useEffect(() => {
    setItems([])
    if (!storeId) return
    adminApi(`/stores/${storeId}`)
      .then((d) => setItems(d.items || []))
      .catch(() => {})
  }, [storeId])
  if (!stores) return <p className="text-xs text-navy/60">عم نحمّل المطاعم...</p>
  if (!stores.length) return <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">ما في مطاعم شريكة لسا. ضيف مطعم من قسم «المطاعم الشريكة» أول.</p>
  const store = stores.find((s) => String(s.id) === storeId)
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-bold">المطعم</span>
        <select className={inputCls} value={storeId || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">اختار المطعم</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.published ? '' : ' (مخفي عن الزبائن)'}
            </option>
          ))}
        </select>
      </label>
      {storeId && (
        <label className="block">
          <span className="text-xs font-bold">وجبة معيّنة (اختياري)</span>
          <select className={inputCls} value={itemId || ''} onChange={(e) => onChange(e.target.value ? `${storeId}:${e.target.value}` : storeId)}>
            <option value="">بيفتح قائمة المطعم كلها</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
                {it.available ? '' : ' (مو متوفرة)'}
              </option>
            ))}
          </select>
        </label>
      )}
      {store && !store.published && <p className="text-xs font-bold text-rose-700">هالمطعم مخفي عن الزبائن، فالزر ما رح يفتحه. انشره أول.</p>}
    </div>
  )
}
