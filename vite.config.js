import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { resolve } from 'node:path'

export default defineConfig({
  // موبايلات أندرويد القديمة (مثلاً أندرويد 11 مع WebView ما تحدّث): منحوّل الكود لنسخة بتفهمها
  plugins: [react(), legacy({ modernTargets: ['chrome >= 64', 'safari >= 12'], modernPolyfills: true, renderLegacyChunks: false })],
  base: './',
  build: {
    target: ['es2019', 'chrome64', 'safari12'],
    cssTarget: ['chrome64', 'safari12'],
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
