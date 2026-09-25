'use client';

import { comparePlainShort, verdictShortKo } from '@/lib/volumeAiZoneEngine';
import type { VolumeAiZoneScreenGeom } from '@/lib/volumeAiZoneEngine';

type Props = {
  zones: VolumeAiZoneScreenGeom[];
  volPanelTop: number;
  selectedZoneId?: string | null;
  onZoneClick?: (zoneId: string) => void;
};

/** 거래량 패널 상단 — 번호·롱/숏/관망 칩 (막대 위 글자 대신) */
export function VolumeZoneIndexRail({ zones, volPanelTop, selectedZoneId, onZoneClick }: Props) {
  const chips = zones
    .filter((z) => z.layer === 'cluster' && z.segNo != null)
    .sort((a, b) => (a.segNo ?? 0) - (b.segNo ?? 0));

  if (!chips.length) return null;

  return (
    <div
      className="volume-zone-index-rail"
      style={{ top: volPanelTop + 2 }}
      role="tablist"
      aria-label="거래량 구간 목록"
    >
      <span className="volume-zone-index-rail__title">구간</span>
      <div className="volume-zone-index-rail__scroll">
        {chips.map((z) => {
          const side = verdictShortKo(z.verdictSide);
          const vol = comparePlainShort(z.volVsPastPct);
          const volKo = vol === '비슷' ? '' : `거래${vol}`;
          const active = selectedZoneId === z.id;
          const sideCls =
            z.verdictSide === 'LONG' ? 'long' : z.verdictSide === 'SHORT' ? 'short' : 'wait';
          return (
            <button
              key={z.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`volume-zone-chip volume-zone-chip--${sideCls}${active ? ' volume-zone-chip--on' : ''}${z.isLive ? ' volume-zone-chip--live' : ''}`}
              style={{ borderColor: `${z.verdictColor}66` }}
              title={z.plainSummaryKo || z.labelKo}
              onClick={() => onZoneClick?.(z.id)}
            >
              <span className="volume-zone-chip__no" style={{ background: `${z.verdictColor}33`, color: z.verdictColor }}>
                {z.segNo}
              </span>
              <span className="volume-zone-chip__side">{side}</span>
              {volKo ? <span className="volume-zone-chip__vol">{volKo}</span> : null}
            </button>
          );
        })}
      </div>
      <span className="volume-zone-index-rail__hint">탭=상세</span>
    </div>
  );
}
