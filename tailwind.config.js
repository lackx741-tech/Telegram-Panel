/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./public/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Panel surface scale used across the dark UI.
        panel: {
          bg: '#020617', // slate-950
          surface: '#0f172a', // slate-900
          border: '#1e293b', // slate-800
        },
        accent: {
          DEFAULT: '#3b82f6', // blue-500
          hover: '#2563eb', // blue-600
        },
      },
    },
  },
  plugins: [],
};
