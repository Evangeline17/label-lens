/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f7f2e8',
        ink: '#28271f',
        orange: '#d86837',
        leaf: '#427a5b',
        brick: '#a84d3f',
      },
      boxShadow: {
        card: '0 12px 38px rgba(76, 62, 40, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
