import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // ثلاث صفحات: تطبيق الزبون + لوحة التحكم + تطبيق الشب
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        driver: resolve(__dirname, 'driver.html'),
        download: resolve(__dirname, 'download.html'),
      },
    },
  },
  // أثناء التطوير: طلبات /api تذهب للسيرفر المحلي
  server: { proxy: { '/api': 'http://localhost:3000' } },
  preview: { proxy: { '/api': 'http://localhost:3000' } },
})
