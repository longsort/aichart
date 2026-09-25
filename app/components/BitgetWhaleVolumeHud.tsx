'use client';

import type { WhaleVolumeLiveMatch, WhaleVolumeMtfPack } from '@/lib/bitgetWhaleVolumeCatalog';
import type { SingleCandleCompare, RangeSegmentCompare } from '@/lib/bitgetWhaleVolumeCompare';
import type { WhaleVolumeSignalPack } from '@/lib/whaleVolumeSignalIndicator';

type Props = {
  match: WhaleVolumeLiveMatch | null;
  mtfPack: WhaleVolumeMtfPack | null;
  signal?: WhaleVolumeSignalPack | null;
  singleCandle?: SingleCandleCompare | null;
  rangeSegment?: RangeSegmentCompare | null;
  chartTf: string;
  listingFromKo?: string | null;
  loading?: boolean;
  onOpenCompare?: () => void;
};

export function BitgetWhaleVolumeHud({
  match,
  mtfPack,
  signal,
  singleCandle,
  rangeSegment,
  chartTf,
  listingFromKo,
  loading,
  onOpenCompare,
}: Props) {
  if (!match && !mtfPack && !loading) return null;

  if (loading && !match && !mtfPack) {
    return (
      <div className="bitget-whale-volume-hud" aria-live="polite">
        <div className="bitget-whale-volume-hud__title">WHALE AI</div>
        <div className="bitget-whale-volume-hud__sub">분석 중…</div>
      </div>
    );
  }

  const agg = mtfPack?.aggregate ?? match;
  if (!agg) return null;

  const domCls =
    signal?.dir === 'long'
      ? 'bitget-whale-volume-hud__dom--long'
      : signal?.dir === 'short'
        ? 'bitget-whale-volume-hud__dom--short'
        : 'bitget-whale-volume-hud__dom--neutral';

  const badgeCls = [
    'bitget-whale-volume-hud__signal-badge',
    signal?.trap ? 'is-trap' : '',
    signal?.beam ? 'is-beam' : '',
    signal?.big ? 'is-big' : '',
    domCls,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="bitget-whale-volume-hud bitget-whale-volume-hud--indicator" aria-live="polite">
      <div className="bitget-whale-volume-hud__head">
        <span className="bitget-whale-volume-hud__title">WHALE AI</span>
        <span className="bitget-whale-volume-hud__tf">
          {chartTf.toUpperCase()} · {listingFromKo ?? '2020~'}
        </span>
      </div>

      {signal ? (
        <div
          className={badgeCls}
          style={{ ['--whale-signal-color' as string]: signal.color, ['--whale-signal-glow' as string]: signal.glow }}
        >
          <span className="bitget-whale-volume-hud__signal-main">{signal.badge}</span>
          <span className="bitget-whale-volume-hud__signal-pct">
            L{signal.longPct}% · S{signal.shortPct}%
          </span>
        </div>
      ) : (
        <div className={`bitget-whale-volume-hud__pct ${domCls}`}>
          <span>롱 {agg.longPct}%</span>
          <span className="bitget-whale-volume-hud__sep">·</span>
          <span>숏 {agg.shortPct}%</span>
        </div>
      )}

      {signal && (
        <div className="bitget-whale-volume-hud__signal-line">{signal.hudLine}</div>
      )}

      <div className="bitget-whale-volume-hud__beam-meter" aria-hidden>
        <span className="bitget-whale-volume-hud__beam-label">S</span>
        <div className="bitget-whale-volume-hud__beam-track">
          <div
            className="bitget-whale-volume-hud__beam-short"
            style={{ width: `${signal?.shortPct ?? agg.shortPct}%` }}
          />
          <div
            className="bitget-whale-volume-hud__beam-long"
            style={{ width: `${signal?.longPct ?? agg.longPct}%` }}
          />
        </div>
        <span className="bitget-whale-volume-hud__beam-label">L</span>
      </div>

      {match && (
        <div className="bitget-whale-volume-hud__tier">
          {match.tierBtc} BTC · {match.sideKo}
          {match.currentRvol != null ? ` · ${match.currentRvol.toFixed(1)}×` : ''}
        </div>
      )}

      {(singleCandle || rangeSegment) && (
        <div className="bitget-whale-volume-hud__chips">
          {singleCandle && (
            <span className="bitget-whale-volume-hud__chip" title={singleCandle.forecastLineKo}>
              🕯 {singleCandle.isBull ? '양' : '음'} · {singleCandle.volBtc}BTC
            </span>
          )}
          {rangeSegment && (
            <span className="bitget-whale-volume-hud__chip" title={rangeSegment.forecastLineKo}>
              📦 {rangeSegment.bars}봉 {rangeSegment.scenarioKo.slice(0, 6)}
            </span>
          )}
        </div>
      )}

      {mtfPack && (
        <div className="bitget-whale-volume-hud__mtf">
          {mtfPack.rows.map((r) => (
            <span
              key={r.tf}
              className={
                r.match && r.match.sampleCount >= 3
                  ? r.match.dominant === 'LONG'
                    ? 'bitget-whale-volume-hud__chip--long'
                    : r.match.dominant === 'SHORT'
                      ? 'bitget-whale-volume-hud__chip--short'
                      : 'bitget-whale-volume-hud__chip--neutral'
                  : 'bitget-whale-volume-hud__chip--idle'
              }
              title={r.match?.summaryKo ?? r.error ?? ''}
            >
              {r.tf}
              {r.match && r.match.sampleCount >= 3
                ? r.match.dominant === 'LONG'
                  ? ' ▲'
                  : r.match.dominant === 'SHORT'
                    ? ' ▼'
                    : ' ◆'
                : ''}
            </span>
          ))}
        </div>
      )}

      {onOpenCompare && (
        <button type="button" className="bitget-whale-volume-hud__btn" onClick={onOpenCompare}>
          📊 상세
        </button>
      )}
      <div className="bitget-whale-volume-hud__foot">참고용 · 확정 아님</div>
    </div>
  );
}
