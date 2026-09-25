'use client';

import type { WhaleVolumeSignalPack } from '@/lib/whaleVolumeSignalIndicator';

type Props = {
  signal: WhaleVolumeSignalPack;
  left: number;
  top: number;
  chartTf: string;
};

export function WhaleVolumeSignalPill({ signal, left, top, chartTf }: Props) {
  const gaugeW = Math.abs(signal.beamGauge);
  const gaugeDir = signal.beamGauge >= 0 ? 'long' : 'short';

  return (
    <div
      className={`whale-signal-pill whale-signal-pill--${signal.dir}${signal.beam ? ' whale-signal-pill--beam' : ''}${signal.trap ? ' whale-signal-pill--trap' : ''}`}
      style={{
        left,
        top,
        ['--whale-signal-color' as string]: signal.color,
        ['--whale-signal-glow' as string]: signal.glow,
      }}
      title={`${signal.hudLine} · ${signal.subLine} · 참고용`}
    >
      <div className="whale-signal-pill__badge">{signal.badge}</div>
      <div className="whale-signal-pill__pct">
        +{signal.forecastBars}봉{' '}
        {signal.forecastPct != null
          ? `${signal.forecastPct >= 0 ? '+' : ''}${signal.forecastPct.toFixed(1)}%`
          : '—'}
      </div>
      <div className="whale-signal-pill__gauge" aria-hidden>
        <div
          className={`whale-signal-pill__gauge-fill whale-signal-pill__gauge-fill--${gaugeDir}`}
          style={{ width: `${gaugeW}%` }}
        />
      </div>
      <div className="whale-signal-pill__tf">{chartTf.toUpperCase()}</div>
    </div>
  );
}
