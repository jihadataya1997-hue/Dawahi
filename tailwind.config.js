/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0B1B35', 50: '#EEF1F6', 100: '#D9DFEA', 700: '#142748', 900: '#07122A' },
        brand: { DEFAULT: '#FF6F08', 50: '#FFF1E6', 100: '#FFDCC2', 600: '#F65401' },
      },
      fontFamily: {
        ar: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        en: ['Inter', 'system-ui', 'sans-serif'],
        brand: ['"Exo 2"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -6px rgba(11,27,53,0.15)',
        float: '0 10px 30px -8px rgba(11,27,53,0.35)',
      },
      keyframes: {
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'pulse-dot': { '0%,100%': { transform: 'scale(1)', opacity: 1 }, '50%': { transform: 'scale(1.6)', opacity: 0.4 } },
      },
      animation: {
        'sheet-up': 'sheet-up .35s cubic-bezier(.2,.9,.3,1)',
        'fade-in': 'fade-in .25s ease-out',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
