// إذا الصفحة مفتوحة من التطبيق (أندرويد أو مضاف عالشاشة الرئيسية) منروح للتطبيق مباشرة
(function () {
  try {
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true
    var native = /ZappApp/.test(navigator.userAgent) || !!window.androidBridge || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    if (standalone || native) location.replace('/app' + location.search + location.hash)
  } catch (e) {}
})()
