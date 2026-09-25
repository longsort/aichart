'use client';

import { useState } from 'react';
import type { MergedDeskVolumeAiPack } from '@/lib/mergedDeskVolumeAiIntel';
import { formatVolumeSegmentKo } from '@/lib/volumeDirectionStats';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  pack: MergedDeskVolumeAiPack;
  loading?: boolean;
  onReload?: () => void;
  onOpenCompare?: () => void;
  compareLoading?: boolean;
};

export function MergedDeskVolumeIntelHud({
  pack,
  loading,
  onReload,
  onOpenCompare,
  compareLoading,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<'ai' | 'mtf' | 'past'>('ai');

  return (
    <div className={styles.volIntelHud} data-expanded={expanded ? '1' : '0'} aria-label="거래량 AI 해석">
      <div className={styles.volIntelHead}>
        <button
          type="button"
          className={styles.volIntelToggle}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? '접기' : '펼치기'}
        >
          {expanded ? '▾' : '▸'} 거래량 AI
        </button>
        <span className={styles.volIntelBadge}>
          RVOL {pack.current.rvol != null ? `${pack.current.rvol.toFixed(1)}×` : '—'}
          {pack.current.rvolPctile != null ? ` · P${pack.current.rvolPctile}` : ''}
        </span>
        {onReload && (
          <button type="button" className={styles.volIntelIconBtn} onClick={onReload} title="갱신">
            ↻
          </button>
        )}
        {onOpenCompare && (
          <button
            type="button"
            className={styles.volIntelCompareBtn}
            onClick={onOpenCompare}
            disabled={compareLoading}
          >
            {compareLoading ? '…' : '과거 비교'}
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div className={styles.volIntelTabs}>
            {(['ai', 'mtf', 'past'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`${styles.volIntelTab}${tab === k ? ` ${styles.volIntelTabActive}` : ''}`}
                onClick={() => setTab(k)}
              >
                {k === 'ai' ? '의미·AI' : k === 'mtf' ? '분·시·일·주·월' : '과거'}
              </button>
            ))}
          </div>

          {tab === 'ai' && (
            <div className={styles.volIntelBody}>
              <p className={styles.volIntelNarrative}>{pack.narrativeKo}</p>
              <div className={styles.volIntelCurrent}>
                <span>{pack.current.volLabel}</span>
                <span className={styles.volIntelBuy}>↑ {pack.current.buyLabel}</span>
                <span className={styles.volIntelSell}>↓ {pack.current.sellLabel}</span>
                <span>{pack.current.directionKo}</span>
                <span>{pack.current.vsPastKo}</span>
              </div>
              {pack.segments.length > 0 && (
                <div className={styles.volIntelSegments}>
                  {pack.segments.map((seg, i) => (
                    <span
                      key={`${seg.fromIdx}-${seg.toIdx}-${i}`}
                      className={
                        seg.direction === 'buy'
                          ? styles.volIntelSegBuy
                          : seg.direction === 'sell'
                            ? styles.volIntelSegSell
                            : styles.volIntelSegMix
                      }
                    >
                      {formatVolumeSegmentKo(seg)}
                    </span>
                  ))}
                </div>
              )}
              <div className={styles.volIntelLegend}>
                {pack.legend.map((item) => (
                  <div key={item.labelKo} className={styles.volIntelLegendItem} title={item.detailKo}>
                    <span className={styles.volIntelSwatch} style={{ background: item.swatch }} />
                    <span>{item.labelKo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'mtf' && (
            <div className={styles.volIntelMtfGrid}>
              {pack.mtfRows.map((r) => (
                <div key={r.tf} className={styles.volIntelMtfRow}>
                  <span className={styles.volIntelMtfTf}>{r.tfKo}</span>
                  <span
                    className={
                      r.whaleDom === 'LONG'
                        ? styles.volIntelDomLong
                        : r.whaleDom === 'SHORT'
                          ? styles.volIntelDomShort
                          : styles.volIntelMuted
                    }
                  >
                    {r.rvolKo}
                  </span>
                  <span className={styles.volIntelMtfHead}>{r.headlineKo}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'past' && (
            <div className={styles.volIntelPastWrap}>
              {pack.pastRows.length === 0 ? (
                <div className={styles.volIntelMuted}>유사·과거 거래량 구간 없음</div>
              ) : (
                <div className={styles.volIntelPastGrid}>
                  {pack.pastRows.map((r) => (
                    <div
                      key={r.dateKo}
                      className={styles.volIntelPastCol}
                      title={
                        r.afterPct != null
                          ? `+8봉 후 ${r.afterPct >= 0 ? '+' : ''}${r.afterPct.toFixed(1)}%`
                          : undefined
                      }
                    >
                      <div
                        className={
                          (r.afterPct ?? 0) >= 0 ? styles.volIntelPastBarUp : styles.volIntelPastBarDn
                        }
                        style={{
                          height: `${Math.max(12, Math.min(100, (r.similarityPct ?? 50)))}%`,
                        }}
                      />
                      <span className={styles.volIntelPastDate}>{r.dateKo.slice(-8)}</span>
                      <span className={styles.volIntelPastVol}>{r.volLabel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {pack.dataSpanKo && (
            <div className={styles.volIntelFoot}>{pack.dataSpanKo} · 조건부 참고</div>
          )}
          {loading && <div className={styles.volIntelLoading}>갱신 중…</div>}
        </>
      )}
    </div>
  );
}
