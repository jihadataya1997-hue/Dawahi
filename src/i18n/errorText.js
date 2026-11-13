// يحوّل كود الخطأ من السيرفر لرسالة مفهومة بلغة الزبون
export const errorText = (t, err) => {
  const msg = t(`errors.${err?.code}`)
  return msg && msg !== `errors.${err?.code}` ? msg : t('errors.default')
}
