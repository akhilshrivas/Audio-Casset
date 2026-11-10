/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          900: '#0d1117',
          800: '#161b22',
          700: '#21262d',
          600: '#30363d',
          tape: '#2b2118',
          label: '#e6ded3',
          brass: '#b48a3c',
          amber: '#f59e0b',
          neonGreen: '#00ff66',
          neonCyan: '#00e5ff',
          gardaRed: '#ff2d55',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'Courier New', 'monospace'],
        retro: ['"VT323"', 'Courier', 'monospace'],
      },
    },
  },
  plugins: [],
}
