// حذف الحساب من الويب: بندخل بالرقم وكلمة السر، وبعدين بنحذف الحساب بنفس الجلسة
(function () {
  var f = document.getElementById('f')
  var msg = document.getElementById('msg')
  var go = document.getElementById('go')
  function say(text, ok) { msg.textContent = text; msg.className = ok ? 'ok' : 'err' }
  f.addEventListener('submit', function (e) {
    e.preventDefault()
    var phone = document.getElementById('phone').value.replace(/\s/g, '')
    var password = document.getElementById('pass').value
    if (!/^09\d{8}$/.test(phone)) return say('الرقم لازم يبلش بـ 09 ويكون 10 أرقام · Enter a valid number')
    if (!confirm('متأكد؟ ما فيك ترجع الحساب بعد الحذف.\nAre you sure? This cannot be undone.')) return
    go.disabled = true
    say('')
    fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: phone, password: password }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw d.error || {}; return d }) })
      .then(function (d) {
        return fetch('/api/me', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + d.token },
          body: JSON.stringify({ password: password }),
        }).then(function (r) {
          if (r.status === 204) return
          return r.json().then(function (x) { throw x.error || {} })
        })
      })
      .then(function () {
        f.reset()
        say('✓ انحذف حسابك. شكراً إنك جربت ZAPP · Your account has been deleted.', true)
      })
      .catch(function (err) {
        var c = err && err.code
        say(
          c === 'ACTIVE_ORDER' ? 'عندك طلب شغّال. استنى ليخلص أو ألغيه أول · You have an active order'
            : c === 'RATE_LIMITED' ? 'محاولات كتير، جرّب بعد شوي · Too many attempts, try later'
            : c === 'INVALID_CREDENTIALS' || c === 'WRONG_PASSWORD' || c === 'UNAUTHORIZED' ? 'الرقم أو كلمة السر غلط · Wrong number or password'
            : c === 'NOT_REGISTERED' ? 'ما في حساب بهالرقم · No account with this number'
            : c === 'NO_PASSWORD' ? 'حسابك ما إلو كلمة سر، احكينا عالواتساب · Contact us on WhatsApp'
            : c === 'BLOCKED' ? 'الحساب موقوف، احكينا عالواتساب · Account suspended, contact us'
            : 'صار خطأ، جرّب مرة تانية · Something went wrong'
        )
      })
      .finally(function () { go.disabled = false })
  })
})()
