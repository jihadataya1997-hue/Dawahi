// ترتيب نقاط التوصيل: أقصر طريق يمر على كل الطلبات (حتى 3 طلبات → نجرّب كل الاحتمالات)
export const STOP_COLORS = ['#FF8A00', '#1F6FD1', '#8B5CF6', '#13805C', '#D63C64']

export function km(a, b) {
  const R = 6371
  const r = (d) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function permutations(arr) {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]))
}

/**
 * يرجّع الطلبات بالترتيب الأفضل للزيارة من موقع العامل الحالي.
 * الطلبات اللي "بالطريق" بتجي قبل اللي لسا ما انشرت أغراضها (منطقياً هي جاهزة للتسليم).
 */
export function bestOrder(orders, from) {
  if (orders.length <= 1) return orders
  const ready = orders.filter((o) => o.status === 'on_the_way')
  const rest = orders.filter((o) => o.status !== 'on_the_way')
  const plan = (list, start) => {
    if (!start || list.length > 6) return [...list].sort((a, b) => a.id - b.id)
    let best = list
    let bestLen = Infinity
    for (const p of permutations(list)) {
      let len = 0
      let cur = start
      for (const o of p) {
        len += km(cur, o.location)
        cur = o.location
      }
      if (len < bestLen) {
        bestLen = len
        best = p
      }
    }
    return best
  }
  const first = plan(ready, from)
  const after = plan(rest, first.length ? first[first.length - 1].location : from)
  return [...first, ...after]
}

/** رابط Google Maps فيه كل المحطات بالترتيب */
export function multiStopUrl(stops) {
  if (!stops.length) return null
  const p = (l) => `${l.lat.toFixed(6)},${l.lng.toFixed(6)}`
  const dest = stops[stops.length - 1].location
  const waypoints = stops.slice(0, -1).map((s) => p(s.location)).join('|')
  return `https://www.google.com/maps/dir/?api=1&destination=${p(dest)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=driving`
}

export const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} م` : `${d.toFixed(1)} كم`)
