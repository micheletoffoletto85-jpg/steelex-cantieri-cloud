/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        steelex: {
          orange: '#FF6B00',
          'orange-press': '#E25F00',
          dark: '#1A1A2E',
          light: '#FFF3E8',
          // Neutri caldi del design system (MASTER.md)
          bg: '#FBFAF8',
          ink: '#1B1B24',
          muted: '#F1EEE8',
          'muted-fg': '#6B6862',
          border: '#E6E2D9',
          'border-strong': '#D7D2C6',
        },
        // Colori semantici — separati dall'accent (MASTER.md)
        ok: { DEFAULT: '#15803D', tint: '#E7F3EB' },
        warn: { DEFAULT: '#B45309', tint: '#FBEEDD' },
        danger: { DEFAULT: '#C81E1E', tint: '#FBE7E7' },
      },
    },
  },
  plugins: [],
}
