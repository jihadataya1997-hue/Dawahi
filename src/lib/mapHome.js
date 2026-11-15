import L from 'leaflet'

// زر عالخريطة بيرجّعها لمركز ضاحية قدسيا
export const QUDSAYA = [33.5403, 36.1931]

export function addHomeButton(map, center = QUDSAYA, zoom = 15) {
  const Ctl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'leaflet-bar')
      const a = L.DomUtil.create('a', 'map-home-btn', wrap)
      a.href = '#'
      a.title = 'رجوع لمركز ضاحية قدسيا'
      a.setAttribute('role', 'button')
      a.setAttribute('aria-label', 'رجوع لمركز ضاحية قدسيا')
      a.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>'
      L.DomEvent.disableClickPropagation(wrap)
      L.DomEvent.on(a, 'click', (e) => {
        L.DomEvent.preventDefault(e)
        map.setView(center, zoom)
      })
      return wrap
    },
  })
  new Ctl().addTo(map)
}
