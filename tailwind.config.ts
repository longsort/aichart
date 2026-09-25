import type { Config } from 'tailwindcss';

/**
 * WMS(재고) 화면만 Tailwind 사용. 기존 차트 UI와 충돌 방지를 위해 preflight 비활성.
 */
const config: Config = {
  content: ['./app/(wms)/**/*.{ts,tsx}', './components/wms/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        wms: {
          panel: '#0f172a',
          border: '#1e293b',
          muted: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
};

export default config;
