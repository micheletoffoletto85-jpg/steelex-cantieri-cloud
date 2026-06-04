/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        steelex: {
          orange: '#FF6B00',
          dark: '#1A1A2E',
          light: '#FFF3E8',
        },
      },
    },
  },
  plugins: [],
}
