// تطبيق الأندرويد الحقيقي (Capacitor) بيفتح نفس الموقع، وهون منعرف إذا نحن جوّاه
export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.()
export const nativePlugin = (name) => (isNativeApp() ? window.Capacitor?.Plugins?.[name] || null : null)
