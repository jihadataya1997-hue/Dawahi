import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LanguageProvider } from './i18n/LanguageProvider'
import { AuthProvider } from './auth/AuthProvider'
import { OrdersProvider } from './orders/OrdersProvider'
import { AddressesProvider } from './addresses/AddressesProvider'
import { AppConfigProvider } from './config/AppConfigProvider'
import { startPresence } from './presence'
import { onNativePushTap } from './push'
import './index.css'

// آيفون (التطبيق المثبّت على الشاشة الرئيسية) أحياناً بيعطي ارتفاع أقصر من الشاشة
// بقد شريط الساعة، فبتطلع مسافة فاضية تحت. منقيس الارتفاع الحقيقي ومنصحّحه.
function fitHeight() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  let h = window.innerHeight
  if (standalone && ios) {
    const full = Math.max(screen.height, screen.width) === Math.max(window.innerHeight, window.innerWidth) ? h : matchMedia('(orientation: portrait)').matches ? screen.height : screen.width
    const gap = full - h
    if (gap > 0 && gap <= 80) h = full // الفرق بقد شريط الحالة فقط (مو كيبورد مفتوح)
  }
  document.documentElement.style.setProperty('--app-h', `${h}px`)
}
document.documentElement.classList.add('app-shell')
fitHeight()
window.addEventListener('resize', fitHeight)
window.addEventListener('orientationchange', () => setTimeout(fitHeight, 300))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AppConfigProvider>
        <AuthProvider>
          <AddressesProvider>
            <OrdersProvider>
              <App />
            </OrdersProvider>
          </AddressesProvider>
        </AuthProvider>
      </AppConfigProvider>
    </LanguageProvider>
  </React.StrictMode>
)

// تسجيل الـ Service Worker ليصبح التطبيق قابلاً للتثبيت (PWA)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  })
}

if (import.meta.env.PROD) startPresence('customer')

// تطبيق الأندرويد: الكبس على إشعار بيفتح الصفحة المطلوبة
onNativePushTap((url) => {
  if (url && url !== location.pathname + location.search) location.href = url
})
