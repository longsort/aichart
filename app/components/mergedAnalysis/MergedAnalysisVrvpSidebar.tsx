'use client';

import type { MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import type { MergedAresLevel } from '@/lib/mergedAnalysisAresVisual';
import { mergedAresPriceRange } from '@/lib/mergedAnalysisAresVisual';
import { MERGED_VRVP_KO } from '@/lib/mergedAnalysisVrvpLabels';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  profile: MergedVrvpProfile | null;
  levels: MergedAresLevel[];
  theme?: 'dark' | 'light';
};

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return n.toFixed(0);
  if (a >= 1) return n.toFixed(1);
  return n.toFixed(4);
}

function priceToPct(price: number, min: number, max: number): number {
  const span = Math.max(max - min, 1e-9);
  return Math.max(1, Math.min(99, ((max - price) / span) * 100));
}

export default function MergedAnalysisVrvpSidebar({ profile, levels, theme = 'dark' }: Props) {
  const range = mergedAresPriceRange(levels) ?? (profile ? { min: profile.priceMin, max: profile.priceMax } : null);
  if (!profile?.bars.length || !range) return null;

  const bars = profile.bars.filter((b) => b.ratio > 0.06);

  return (
    <div className={styles.vrvpSidebar} data-theme={theme} aria-label="VRVP 거래량 프로파일">
      <div className={styles.vrvpTitle}>VRVP</div>
      <div className={styles.vrvpSub}>긴 막대=거래 많음</div>
      {profile.poc != null && (
        <div className={styles.vrvpPoc}>
          {MERGED_VRVP_KO.pocShort} {fmt(profile.poc!)}
        </div>
      )}
      <div className={styles.vrvpBarsAligned}>
        {bars.map((b, i) => (
          <div
            key={`${b.price}-${i}`}
            className={styles.vrvpBarAligned}
            style={{ top: `${priceToPct(b.price, range.min, range.max)}%` }}
            title={`${fmt(b.price)} · 거래량 ${Math.round(b.ratio * 100)}%${b.isPoc ? ` · ${MERGED_VRVP_KO.pocShort}` : ''}`}
          >
            <div className={styles.vrvpTrack}>
              <div
                className={`${styles.vrvpFill}${b.isPoc ? ` ${styles.vrvpFillPoc}` : ''}`}
                style={{ width: `${Math.max(8, Math.round(b.ratio * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.vrvpAxisHint}>↑ 고가 · ↓ 저가</div>
    </div>
  );
}
