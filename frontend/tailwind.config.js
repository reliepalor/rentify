/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Grayish-green palette with plant-inspired accents
        sage: {
          50: '#f6f7f6',
          100: '#e3e8e3',
          200: '#c7d1c7',
          300: '#a3b5a3',
          400: '#7a9679',
          500: '#5a7a59',  // Main accent color
          600: '#4a6448',
          700: '#3d523c',
          800: '#334432',
          900: '#2b392a',
        },
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      keyframes: {
        fadeInDown: {
          '0%': {
            opacity: '0',
            transform: 'translateY(-20px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        fadeInUp: {
          '0%': {
            opacity: '0',
            transform: 'translateY(30px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
      animation: {
        fadeInDown: 'fadeInDown 0.8s ease-out',
        fadeInUp: 'fadeInUp 0.8s ease-out',
      },
    },
  },
  plugins: [],
}