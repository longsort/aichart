'use client';

import { comparePlainShort, verdictShortKo } from '@/lib/volumeAiZoneEngine';
import type { VolumeLiveCompare } from '@/lib/volumeAiZoneEngine';

type Props = {
  live: VolumeLiveCompare;
  fullscreen?: boolean;
  active?: boolean;
  onClick?: () => void;
};

/** 거래량 패널 하단 — 롱/숏/관망 확정 + 탭=상세 */
export function VolumeCompareStrip({ live, fullscreen, active, onClick }: Props) {
  const side = live.verdict.side;
  const sideKo = verdictShortKo(side);
  const vol = comparePlainShort(live.volVsPastPct);

  return (
    <button
      type="button"
      className={`volume-compare-strip volume-compare-strip--${side.toLowerCase()}${fullscreen ? ' volume-compare-strip--fs' : ''}${active ? ' volume-compare-strip--active' : ''}`}
      aria-label={`거래량 확정 ${sideKo} — 탭하면 상세`}
      title={live.verdict.reasonKo}
      onClick={onClick}
    >
      <span className="volume-compare-strip__verdict" style={{ color: live.verdict.color }}>
        {sideKo}
      </span>
      <span className="volume-compare-strip__title">확정</span>
      <span className="volume-compare-strip__chip">
        <span className="volume-compare-strip__key">거래</span>
        <span className="volume-compare-strip__val">{vol}</span>
      </span>
      <span className="volume-compare-strip__score">{live.verdict.strength}점</span>
      <span className="volume-compare-strip__hint">탭=상세</span>
    </button>
  );
}
