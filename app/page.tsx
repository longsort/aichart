'use client';

import dynamic from 'next/dynamic';
import SiteAuthBootstrap from '@/app/components/SiteAuthBootstrap';

/** 익명: 차트 청크 로드 전 로그인만. 허용 계정만 통과. */
const HomePageContent = dynamic(() => import('./HomePageContent'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#091320',
        color: '#94a3b8',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
      }}
    >
      불러오는 중…
    </div>
  ),
});

export default function Page() {
  return (
    <SiteAuthBootstrap>
      <HomePageContent />
    </SiteAuthBootstrap>
  );
}
