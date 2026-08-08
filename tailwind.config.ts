import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: '#1a1a1c',
        darker: '#101012',
        card: '#f4f4f2',
        blue: {
          DEFAULT: '#1d4ed8',
          hover: '#1e40af',
        },
        gold: '#c9a227',
      },
    },
  },
  plugins: [],
}

export default config
