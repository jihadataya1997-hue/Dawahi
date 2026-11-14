// ترتيب نقاط التوصيل: أقصر طريق يمر على كل الطلبات (حتى 3 طلبات → نجرّب كل الاحتمالات)
export const STOP_COLORS = ['#4B1FE0', '#1F6FD1', '#E8590C', '#13805C', '#D63C64']

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

const ll = (l) => `${l.lat.toFixed(6)},${l.lng.toFixed(6)}`
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/**
 * رابط Google Maps للمسار: من موقع العامل (إذا معروف) مروراً بكل المحطات بالترتيب،
 * بالسيارة، وبيبلّش الملاحة فوراً (dir_action=navigate)
 */
export function googleDirUrl(points, from) {
  if (!points.length) return null
  const dest = points[points.length - 1]
  const waypoints = points.slice(0, -1).map(ll).join('|')
  const q = new URLSearchParams({ api: '1', destination: ll(dest), travelmode: 'driving', dir_action: 'navigate' })
  if (from) q.set('origin', ll(from))
  if (waypoints) q.set('waypoints', waypoints)
  return `https://www.google.com/maps/dir/?${q}`
}

/** للتوافق مع الكود القديم: رابط كل المحطات */
export const multiStopUrl = (stops, from) => googleDirUrl(stops.map((s) => s.location), from)

/**
 * يفتح المسار بتطبيق Google Maps نفسه.
 * عالآيفون: التطبيق المثبّت على الشاشة الرئيسية بيفتح روابط https بمتصفح داخلي (بدون مسار)،
 * فمنفتح تطبيق Google Maps مباشرة، وإذا مو مثبّت منرجع للرابط العادي.
 */
export function openGoogleMaps(points, from) {
  const web = googleDirUrl(points, from)
  if (!web) return
  if (isIOS()) {
    const app = `comgooglemaps://?${from ? `saddr=${ll(from)}&` : ''}daddr=${points.map(ll).join('+to:')}&directionsmode=driving`
    let left = false
    const onHide = () => (left = true)
    document.addEventListener('visibilitychange', onHide, { once: true })
    window.location.href = app
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide)
      // التطبيق ما انفتح (مو مثبّت) → خرائط آبل بالمسار، أو رابط Google إذا أكتر من محطة
      if (!left && document.visibilityState === 'visible') {
        if (points.length === 1) window.location.href = `maps://?${from ? `saddr=${ll(from)}&` : ''}daddr=${ll(points[0])}&dirflg=d`
        else window.open(web, '_blank')
      }
    }, 1400)
    return
  }
  window.open(web, '_blank', 'noopener')
}

export const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} م` : `${d.toFixed(1)} كم`)
