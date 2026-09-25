import { TelegramMergedCaptureClient } from './TelegramMergedCaptureClient';

export const dynamic = 'force-dynamic';

function captureSecret(): string {
  return (
    process.env.TELEGRAM_MULTITF_CRON_SECRET ||
    process.env.INTERNAL_ANALYZE_SECRET ||
    process.env.TELEGRAM_SIGNAL_SECRET ||
    ''
  ).trim();
}

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

/** Playwright headless — 통합·분석 tv-frame 캡처 전용 (UI 크롬 없음) */
export default function TelegramMergedCapturePage({ searchParams }: PageProps) {
  const secret = captureSecret();
  const key = String(searchParams?.key || '').trim();
  const symbol = String(searchParams?.symbol || 'BTCUSDT').trim().toUpperCase();
  const timeframe = String(searchParams?.timeframe || '15m').trim().toLowerCase();

  if (!secret || key !== secret) {
    return (
      <div style={{ background: '#020617', color: '#94a3b8', minHeight: '100vh', padding: 24 }}>
        unauthorized
      </div>
    );
  }

  return <TelegramMergedCaptureClient symbol={symbol} timeframe={timeframe} captureKey={key} />;
}
