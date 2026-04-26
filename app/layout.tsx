import React from 'react';
import type { Metadata, Viewport } from 'next';

/** 폰·태블릿: 실제 뷰포트 폭 기준, 노치·홈 인디케이터 안전 영역 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#091320' },
    { media: '(prefers-color-scheme: light)', color: '#e8eef6' },
  ],
};

export const metadata: Metadata = {
  title: '독수리1호 분석 엔진',
  description: 'SMC · 멀티타임프레임 · 스마트머니 차트 분석',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '독수리1호',
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/globals.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.documentElement;try{var t=JSON.parse(localStorage.getItem('ailongshort-settings')||'{}').theme;if(t==='light')s.dataset.theme='light';else s.dataset.theme='dark';}catch{s.dataset.theme='dark';}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
