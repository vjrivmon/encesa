/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: '#FF6B35',
        bg: '#1c1c1e',
        surface: '#2c2c2e',
        border: '#3a3a3c',
        text: '#ffffff',
        subtext: '#8e8e93',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        ios: '13px',
      },
    },
  },
  plugins: [],
}
