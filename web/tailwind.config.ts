import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        mint:       '#C5FFBC',
        'mint-bg':  '#EAF9E7',
        'mint-dim': '#D4EDCE',
        navy:       '#172250',
        'navy-deep':'#0D1535',
        green:      '#0C9E54',
        'green-dim':'#0A8749',
        coral:      '#FB5B5B',
        muted:      '#7A9B89',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':  'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
