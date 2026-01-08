/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '375px',
      },
      maxWidth: {
        'mobile': '600px',
        'content': '800px',
      },
    },
  },
  plugins: [],
}
