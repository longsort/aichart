import './globals.css';
import React from 'react';

export const metadata = {
  title: 'AI 트레이더 분석 엔진',
  description: 'SMC · 멀티타임프레임 · 스마트머니 차트 분석'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
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
