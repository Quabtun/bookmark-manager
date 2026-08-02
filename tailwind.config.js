/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dae6ff', 200: '#bcd2ff', 300: '#8eb4ff',
          400: '#598bff', 500: '#3563ff', 600: '#1e42f5', 700: '#1730e1',
          800: '#192ab6', 900: '#1a2b8f'
        }
      },
      fontFamily: {
        sans: ['"Microsoft YaHei"', '"Segoe UI"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 4px 24px -8px rgba(20, 30, 80, 0.18)',
        glass: '0 8px 32px -12px rgba(20, 30, 80, 0.25)'
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'slide-up': {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        },
        'pop': {
          '0%': { opacity: 0, transform: 'scale(0.96)' },
          '100%': { opacity: 1, transform: 'scale(1)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'pop': 'pop 0.18s ease-out'
      }
    }
  },
  plugins: []
}
