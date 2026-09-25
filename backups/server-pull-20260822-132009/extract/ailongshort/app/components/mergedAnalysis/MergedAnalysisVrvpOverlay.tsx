'use client';

import type { MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import type { MergedAresLevel } from '@/lib/mergedAnalysisAresVisual';
import { mergedAresPriceRange } from '@/lib/mergedAnalysisAresVisual';
import { MERGED_VRVP_KO } from '@/lib/mergedAnalysisVrvpLabels';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  profile: MergedVrvpProfile | null;
  levels: MergedAresLevel[];
};

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return n.toFixed(0);
  if (a >= 1) return n.toFixed(0);
  return n.toFixed(2);
}

function priceToPct(price: number, min: number, max: number): number {
  const span = Math.max(max - min, 1e-9);
  return Math.max(0, Math.min(100, ((max - price) / span) * 100));
}

export default function MergedAnalysisVrvpOverlay({ profile, levels }: Props) {
  const range = mergedAresPriceRange(levels) ?? (profile ? { min: profile.priceMin, max: profile.priceMax } : null);
  if (!profile?.bars.length || !range) return null;

  const inRange = profile.bars.filter((b) => b.price >= range.min && b.price <= range.max);
  const pocPct = profile.poc != null ? priceToPct(profile.poc, range.min, range.max) : null;

  const topNodes = [...inRange].sort((a, b) => b.ratio - a.ratio).slice(0, 3);

  return (
    <div className={styles.vrvpOverlay} aria-label="VRVP 거래량 프로파일">
      <div className={styles.vrvpOverlayHead}>
        <span>VRVP</span>
        <span className={styles.vrvpOverlaySub}>길수록 거래↑</span>
      </div>
      <div className={styles.vrvpOverlayCanvas}>
        {inRange.map((b, i) => (
          <div
            key={`${b.price}-${i}`}
            className={`${styles.vrvpOverlayBin}${b.isPoc ? ` ${styles.vrvpOverlayBinPoc}` : ''}`}
            style={{
              top: `${priceToPct(b.price, range.min, range.max)}%`,
              width: `${6 + Math.round(b.ratio * 94)}%`,
            }}
            title={`${fmt(b.price)} · ${Math.round(b.ratio * 100)}%${b.isPoc ? ` · ${MERGED_VRVP_KO.pocShort}` : ''}`}
          />
        ))}
        {pocPct != null && profile.poc != null && (
          <div className={styles.vrvpOverlayPocLine} style={{ top: `${pocPct}%` }}>
            <span>
              {MERGED_VRVP_KO.pocShort} {fmt(profile.poc)}
            </span>
          </div>
        )}
      </div>
      <div className={styles.vrvpOverlayFoot}>
        {topNodes.map((n, i) => (
          <span key={i} title={`${fmt(n.price)}`}>
            H{i + 1} {fmt(n.price)}
          </span>
        ))}
      </div>
    </div>
  );
}
