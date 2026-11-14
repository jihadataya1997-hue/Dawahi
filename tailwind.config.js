/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1E0E4F', 50: '#F1EEFA', 100: '#DED7F2', 700: '#2D1A72', 900: '#130836' },
        brand: { DEFAULT: '#4B1FE0', 50: '#F1EEFF', 100: '#DDD5FF', 600: '#3A12C6' },
        lime: { DEFAULT: '#C8F531', 50: '#F7FDE3', 600: '#A8D411' },
      },
      fontFamily: {
        ar: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        en: ['Inter', 'system-ui', 'sans-serif'],
        brand: ['"Exo 2"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -6px rgba(30,14,79,0.15)',
        float: '0 10px 30px -8px rgba(30,14,79,0.35)',
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
