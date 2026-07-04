/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Coinbidex brand blue — from logo
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#1a56ff',   // Primary brand blue from logo
          600: '#1440dd',
          700: '#1030bb',
          800: '#0c2299',
          900: '#081677',
          950: '#040b44',
        },
        dark: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          850: '#172032',
          900: '#0f172a',
          950: '#060d1a',
        }
      },
      fontFamily: {
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        display: ['"Syne"', 'sans-serif'],
      },
      animation: {
        'ticker-scroll': 'ticker-scroll 40s linear infinite',
        'pulse-green':   'pulse-green 1s ease-in-out',
        'pulse-red':     'pulse-red 1s ease-in-out',
        'slide-up':      'slide-up 0.3s ease-out',
        'fade-in':       'fade-in 0.2s ease-out',
        'glow':          'glow 2s ease-in-out infinite',
      },
      keyframes: {
        'ticker-scroll': { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        'pulse-green':   { '0%,100%': { backgroundColor: 'transparent' }, '50%': { backgroundColor: 'rgba(34,197,94,0.15)' } },
        'pulse-red':     { '0%,100%': { backgroundColor: 'transparent' }, '50%': { backgroundColor: 'rgba(239,68,68,0.15)' } },
        'slide-up':      { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'fade-in':       { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'glow':          { '0%,100%': { boxShadow: '0 0 20px rgba(26,86,255,0.1)' }, '50%': { boxShadow: '0 0 40px rgba(26,86,255,0.3)' } },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(26,86,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(26,86,255,0.03) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      }
    }
  },
  plugins: []
}
