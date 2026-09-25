import dynamic from 'next/dynamic';

const HomePageContent = dynamic(() => import('../HomePageContent'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        padding: 28,
        background: '#091320',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <strong style={{ fontSize: 18 }}>독수리1호</strong>
      <p style={{ marginTop: 10, color: '#94a3b8', fontSize: 14 }}>
        차트·분석 불러오는 중… 기능은 그대로입니다.
      </p>
    </div>
  ),
});

export default function TradingPage() {
  return <HomePageContent />;
}
