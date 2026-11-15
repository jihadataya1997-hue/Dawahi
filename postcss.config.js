// تحويلات لموبايلات أندرويد القديمة (WebView قبل Chrome 88 ما بيفهم :where)
const dirVariants = () => ({
  postcssPlugin: 'zapp-dir-variants',
  Rule(rule) {
    if (!rule.selector.includes(':where([dir=')) return
    rule.selectors = rule.selectors.flatMap((sel) => {
      const m = sel.match(/^(.*):where\(\[dir="?(rtl|ltr)"?\],\s*\[dir="?\2"?\] \*\)(.*)$/)
      if (!m) return [sel]
      return [`[dir=${m[2]}] ${m[1]}${m[3]}`, `${m[1]}[dir=${m[2]}]${m[3]}`]
    })
  },
})
dirVariants.postcss = true

export default {
  plugins: [
    (await import('tailwindcss')).default,
    dirVariants,
    (await import('postcss-preset-env')).default({ browsers: 'chrome >= 64, safari >= 12', stage: 2, features: { 'logical-properties-and-values': false } }),
    (await import('autoprefixer')).default,
  ],
}
