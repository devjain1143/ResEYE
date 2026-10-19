/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: '#000000',
        bone: '#ffffff',
        'bone-100': 'rgb(255 255 255 / 1)',
        'bone-80': 'rgb(255 255 255 / 0.80)',
        'bone-60': 'rgb(255 255 255 / 0.60)',
        'bone-35': 'rgb(255 255 255 / 0.35)',
        'bone-15': 'rgb(255 255 255 / 0.15)',
        'bone-07': 'rgb(255 255 255 / 0.07)',
      },
      fontFamily: {
        mono: ['"VT323"', 'Courier New', 'monospace'],
        terminal: ['"VT323"', 'Courier New', 'monospace'],
        typewriter: ['"Special Elite"', 'Courier New', 'monospace'],
      },
      fontSize: {
        'xs': ['14px', { lineHeight: '1.25rem' }],
        'sm': ['16px', { lineHeight: '1.5rem' }],
        'base': ['18px', { lineHeight: '1.75rem' }],
        'lg': ['20px', { lineHeight: '1.75rem' }],
        'xl': ['22px', { lineHeight: '1.75rem' }],
        '2xl': ['26px', { lineHeight: '2rem' }],
        '3xl': ['32px', { lineHeight: '2.25rem' }],
        '4xl': ['38px', { lineHeight: '2.5rem' }],
        '5xl': ['50px', { lineHeight: '1' }],
        '6xl': ['62px', { lineHeight: '1' }],
        '7xl': ['74px', { lineHeight: '1' }],
        '8xl': ['98px', { lineHeight: '1' }],
        '9xl': ['130px', { lineHeight: '1' }],
      }
    },
  },
  plugins: [],
}
