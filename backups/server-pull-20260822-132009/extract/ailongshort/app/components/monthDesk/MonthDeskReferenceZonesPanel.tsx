'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import {
  buildMonthDeskReferenceZones,
  formatReferenceZoneBand,
  type MonthDeskReferenceZoneItem,
} from '@/lib/monthDeskReferenceZones';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import styles from '../MonthDeskAnalysisBoard.module.css';

function ZoneCard({ item, close }: { item: MonthDeskReferenceZoneItem; close: number | null }) {
  const band = formatReferenceZoneBand(item);
  const hasBand = item.priceLow != null && item.priceHigh != null;
  let distKo = '';
  if (hasBand && close != null && item.priceLow != null) {
    const mid = (item.priceLow + (item.priceHigh ?? item.priceLow)) / 2;
    const pct = ((mid - close) / close) * 100;
    distKo = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  }

  return (
    <div
      className={`${styles.referenceZoneCard} ${item.active ? styles.referenceZoneCardActive : ''}`}
      style={{ borderColor: `${item.color}${item.active ? '88' : '33'}` }}
    >
      <div className={styles.referenceZoneCardHead}>
        <span className={styles.referenceZoneDot} style={{ background: item.color }} />
        <div>
          <div className={styles.referenceZoneTitle} style={{ color: item.active ? item.color : '#94a3b8' }}>
            {item.titleKo}
          </div>
          <div className={styles.referenceZoneSub}>{item.subtitleKo}</div>
        </div>
        {item.active ? (
          <span className={styles.referenceZoneBadge} style={{ borderColor: `${item.color}66`, color: item.color }}>
            참고
          </span>
        ) : (
          <span className={styles.referenceZoneBadgeMuted}>대기</span>
        )}
      </div>
      {hasBand && (
        <div className={styles.referenceZonePriceRow}>
          <span className={styles.referenceZonePrice}>{band}</span>
          {distKo && <span className={styles.referenceZoneDist}>{distKo}</span>}
        </div>
      )}
      <p className={styles.referenceZoneNote}>{item.noteKo}</p>
    </div>
  );
}

export default function MonthDeskReferenceZonesPanel({
  analysis,
  candles,
  theme: vt,
}: {
  analysis: AnalyzeResponse | null;
  candles: Candle[] | null;
  theme: MonthDeskVisualTheme;
}) {
  const items = useMemo(() => buildMonthDeskReferenceZones(analysis, candles), [analysis, candles]);
  const close =
    analysis?.currentPrice ??
    (candles?.length ? candles[candles.length - 1].close : null) ??
    null;

  if (!analysis) return null;

  return (
    <section className={styles.referenceZonesPanel} style={{ borderColor: `${vt.accent}33` }}>
      <div className={styles.referenceZonesHead}>
        <div>
          <div className={styles.referenceZonesTitle} style={{ color: vt.text }}>
            숏·공급 참고 구간
          </div>
          <div className={styles.referenceZonesSub} style={{ color: vt.textMuted }}>
            숏 커버 · 숏 우선 반응대 · FVG 공급 — 차트와 동일 데이터(참고용)
          </div>
        </div>
        <span className={styles.referenceZonesHint} style={{ color: vt.textMuted }}>
          차트 탭 · ⚙ 반응구간·타입옴
        </span>
      </div>
      <div className={styles.referenceZonesGrid}>
        {items.map((item) => (
          <ZoneCard key={item.key} item={item} close={close} />
        ))}
      </div>
    </section>
  );
}
