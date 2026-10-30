import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#f6f5f1',
        ink: '#242824',
        accent: '#355e4b',
        line: '#dedfd7',
        chess: {
          dark: '#1e293b',
          boardDark: '#779952',
          boardLight: '#edeed1',
          gold: '#eab308',
          accent: '#3b82f6',
          threat: '#ef4444',
          success: '#22c55e',
          warning: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
};

export default config;
