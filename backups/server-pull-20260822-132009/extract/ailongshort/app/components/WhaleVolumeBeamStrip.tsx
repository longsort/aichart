'use client';

import type { WhaleVolumeSignalPack } from '@/lib/whaleVolumeSignalIndicator';

type Props = {
  signal: WhaleVolumeSignalPack;
};

/** 거래량 패널 위 얇은 빔 지표 스트립 */
export function WhaleVolumeBeamStrip({ signal }: Props) {
  return (
    <div
      className={`whale-beam-strip whale-beam-strip--${signal.dir}${signal.beam ? ' whale-beam-strip--beam' : ''}${signal.trap ? ' whale-beam-strip--trap' : ''}`}
      style={{
        ['--whale-signal-color' as string]: signal.color,
        ['--whale-signal-glow' as string]: signal.glow,
      }}
      aria-hidden
    >
      <span className="whale-beam-strip__icon">{signal.icon}</span>
      <span className="whale-beam-strip__tag">{signal.tag}</span>
      <span className="whale-beam-strip__pct">
        +{signal.forecastBars}봉{' '}
        {signal.forecastPct != null
          ? `${signal.forecastPct >= 0 ? '+' : ''}${signal.forecastPct.toFixed(1)}%`
          : '—'}
      </span>
      <div className="whale-beam-strip__bar">
        <div className="whale-beam-strip__short" style={{ flex: signal.shortPct }} />
        <div className="whale-beam-strip__long" style={{ flex: signal.longPct }} />
      </div>
    </div>
  );
}
