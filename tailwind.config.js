/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1E2E4A', 50: '#EEF1F6', 100: '#D9DFEA', 700: '#2A3D60', 900: '#141F33' },
        brand: { DEFAULT: '#FF8A00', 50: '#FFF4E5', 100: '#FFE4C2', 600: '#E67A00' },
      },
      fontFamily: {
        ar: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        en: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -6px rgba(30,46,74,0.15)',
        float: '0 10px 30px -8px rgba(30,46,74,0.35)',
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
