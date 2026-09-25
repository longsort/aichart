'use client';

import type { VolumeZoneBurstMatch, VolumeZoneBurstMtfPack } from '@/lib/volumeZoneBurstIntel';

type Props = {
  match: VolumeZoneBurstMatch | null;
  mtfPack: VolumeZoneBurstMtfPack | null;
  chartTf: string;
  loading?: boolean;
};

export function VolumeZoneBurstHud({ match, mtfPack, chartTf, loading }: Props) {
  if (!match && !mtfPack && !loading) return null;

  if (loading && !match && !mtfPack) {
    return (
      <div className="volume-zone-burst-hud" aria-live="polite">
        <div className="volume-zone-burst-hud__title">📊 거래량 AI · 구간 통계</div>
        <div className="volume-zone-burst-hud__sub">비트겟 상장~ 전구간 분석 중…</div>
      </div>
    );
  }

  const agg = mtfPack?.aggregate ?? match;
  if (!agg) return null;

  const domCls =
    agg.dominant === 'LONG'
      ? 'volume-zone-burst-hud__dom--long'
      : agg.dominant === 'SHORT'
        ? 'volume-zone-burst-hud__dom--short'
        : 'volume-zone-burst-hud__dom--neutral';

  const primary = match?.horizons.find((h) => h.bars === match.primaryHorizon) ?? match?.horizons[0];

  return (
    <div className="volume-zone-burst-hud" aria-live="polite">
      <div className="volume-zone-burst-hud__head">
        <span className="volume-zone-burst-hud__title">📊 거래량 AI · 구간 매칭</span>
        <span className="volume-zone-burst-hud__tf">{chartTf.toUpperCase()} · 상장~</span>
      </div>
      <div className={`volume-zone-burst-hud__pct ${domCls}`}>
        <span>롱 {agg.longPct}%</span>
        <span className="volume-zone-burst-hud__sep">·</span>
        <span>숏 {agg.shortPct}%</span>
      </div>
      {match && (
        <div className="volume-zone-burst-hud__line">
          {match.currentBurst ? '⚡ 현재 구간 쇼크 · ' : ''}
          n={primary?.sampleCount ?? match.matchedCount}
          {match.listingFromKo ? ` · ${match.listingFromKo}~` : ''}
          {primary?.sampleLowTrust ? ' · 저표본' : ''}
        </div>
      )}
      {mtfPack && (
        <div className="volume-zone-burst-hud__mtf">
          {mtfPack.rows.map((r) => (
            <span
              key={r.tf}
              className={
                r.match && r.match.matchedCount >= 3
                  ? r.match.dominant === 'LONG'
                    ? 'volume-zone-burst-hud__chip--long'
                    : r.match.dominant === 'SHORT'
                      ? 'volume-zone-burst-hud__chip--short'
                      : 'volume-zone-burst-hud__chip--neutral'
                  : 'volume-zone-burst-hud__chip--idle'
              }
              title={r.match?.summaryKo ?? r.error ?? ''}
            >
              {r.tf}
              {r.match && r.match.matchedCount >= 3 ? ` ${r.match.longPct}` : ''}
            </span>
          ))}
        </div>
      )}
      {mtfPack && (
        <div className="volume-zone-burst-hud__meta">
          {mtfPack.summaryKo}
          {mtfPack.alignedTfCount > 0 ? ` · ${mtfPack.alignedTfCount}TF 일치` : ''}
        </div>
      )}
      <div className="volume-zone-burst-hud__foot">과거 동일 구간 거래량 터짐 → 후행 참고 · 확정 아님</div>
    </div>
  );
}
