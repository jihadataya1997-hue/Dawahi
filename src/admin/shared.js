// أدوات مشتركة للوحة الإدارة
export const currency = { label: 'ل.س' }
export const money = (n) => `${new Intl.NumberFormat('ar-SY').format(n)} ${currency.label}`

// تصغير صورة قبل الرفع (للإعلانات)
export async function imageToDataUrl(file, maxSide = 1400, quality = 0.82) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', quality)
}

export const inputCls =
  'w-full rounded-xl border border-navy/10 bg-navy-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:bg-white'
