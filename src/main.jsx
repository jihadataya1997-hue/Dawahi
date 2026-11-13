import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LanguageProvider } from './i18n/LanguageProvider'
import { AuthProvider } from './auth/AuthProvider'
import { OrdersProvider } from './orders/OrdersProvider'
import { AppConfigProvider } from './config/AppConfigProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AppConfigProvider>
        <AuthProvider>
          <OrdersProvider>
            <App />
          </OrdersProvider>
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
