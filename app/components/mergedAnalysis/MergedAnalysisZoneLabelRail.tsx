'use client';

import type { MergedAresLevel } from '@/lib/mergedAnalysisAresVisual';
import { mergedAresPriceRange } from '@/lib/mergedAnalysisAresVisual';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  levels: MergedAresLevel[];
  currentPrice: number | null;
};

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return n.toFixed(1);
  if (a >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function priceToPct(price: number, min: number, max: number): number {
  const span = Math.max(max - min, 1e-9);
  return Math.max(2, Math.min(98, ((max - price) / span) * 100));
}

export default function MergedAnalysisZoneLabelRail({ levels, currentPrice }: Props) {
  const range = mergedAresPriceRange(levels);
  if (!levels.length || !range) return null;

  return (
    <div className={styles.zoneLabelRail} aria-label="존 번호·역할·가격">
      <div className={styles.zoneRailTitle}>ZONE</div>
      {levels.map((lv) => (
        <div
          key={`${lv.index}-${lv.role}`}
          className={`${styles.zoneLabelChip}${lv.kind === 'demand' ? ` ${styles.zoneLabelDemand}` : ` ${styles.zoneLabelSupply}`}${lv.role === 'entry' ? ` ${styles.zoneLabelEntry}` : ''}`}
          style={{ top: `${priceToPct(lv.price, range.min, range.max)}%` }}
          title={`${lv.chartLabel} · ${fmt(lv.price)}`}
        >
          <div className={styles.zoneChipRole}>{lv.index}·{lv.roleKo.split(' ')[0]}</div>
          <div className={styles.zoneChipPx}>{fmt(lv.price)}</div>
        </div>
      ))}
      {currentPrice != null && Number.isFinite(currentPrice) && (
        <div className={styles.zoneLabelPrice} style={{ top: `${priceToPct(currentPrice, range.min, range.max)}%` }}>
          ▶ {fmt(currentPrice)}
        </div>
      )}
    </div>
  );
}
