// المناطق البعيدة يلي إلها زيادة على أجرة التوصيل (نفس حساب السيرفر)
function inPolygon(lat, lng, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [yi, xi] = points[i]
    const [yj, xj] = points[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function zoneFor(zones, loc) {
  if (!loc || !Array.isArray(zones)) return null
  let best = null
  for (const z of zones) {
    if (z.points?.length >= 3 && inPolygon(loc.lat, loc.lng, z.points) && (!best || z.extra > best.extra)) best = z
  }
  return best
}
