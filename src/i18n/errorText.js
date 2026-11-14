// يحوّل كود الخطأ من السيرفر لرسالة مفهومة بلغة الزبون
export const errorText = (t, err) => {
  // رسائل الإدارة (إيقاف خدمة، صيانة) بنعرضها متل ما كتبتها الإدارة
  if (['SERVICE_PAUSED', 'MAINTENANCE'].includes(err?.code) && err.message) return err.message
  const msg = t(`errors.${err?.code}`)
  return msg && msg !== `errors.${err?.code}` ? msg : t('errors.default')
}
