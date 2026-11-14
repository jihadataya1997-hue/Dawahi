// رقم الدعم من السيرفر لصفحات الخصوصية والشروط
fetch('/api/app').then(function (r) { return r.json() }).then(function (d) {
  var s = d && d.texts && d.texts.supportPhone
  if (!s) return
  document.querySelectorAll('[data-support]').forEach(function (el) {
    var a = document.createElement('a')
    a.href = 'https://wa.me/963' + s.slice(1)
    a.target = '_blank'; a.rel = 'noopener'
    a.textContent = s
    el.textContent = ''; el.appendChild(a)
  })
}).catch(function () {})
