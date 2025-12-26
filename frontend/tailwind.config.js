/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      animation: {
        'breathe': 'breathe 4s ease-in-out infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        }
      },
      boxShadow: {
        'neural': '0 0 20px rgba(0, 123, 255, 0.4)',
        'neural-active': '0 0 30px rgba(0, 255, 123, 0.5)',
      }
    },
  },
  plugins: [],
}
