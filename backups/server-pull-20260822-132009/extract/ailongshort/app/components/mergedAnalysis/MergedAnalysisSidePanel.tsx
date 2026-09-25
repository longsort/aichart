'use client';

import type { MergedAnalysisCardPanel, MergedTradeJudgment } from '@/lib/mergedAnalysisDeskEngine';
import { MERGED_VRVP_KO } from '@/lib/mergedAnalysisVrvpLabels';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  panel: MergedAnalysisCardPanel;
  judgment?: MergedTradeJudgment | null;
  symbol: string;
  timeframe: string;
  theme?: 'dark' | 'light';
  candleSourceKo?: string;
};

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const frac = a >= 1000 ? 1 : a >= 1 ? 2 : 4;
  return n.toLocaleString(undefined, { maximumFractionDigits: frac });
}

export default function MergedAnalysisSidePanel({ panel, judgment, symbol, timeframe, theme = 'dark', candleSourceKo }: Props) {
  const dirColor =
    panel.direction === 'LONG' ? '#22c55e' : panel.direction === 'SHORT' ? '#ef4444' : '#94a3b8';
  const longW = Math.max(8, Math.min(92, panel.longPct));
  const shortW = Math.max(8, Math.min(92, panel.shortPct));

  return (
    <aside className={styles.sidePanel} data-theme={theme} aria-label="통합 분석 패널">
      <div className={styles.sideBadge}>AI · 통합</div>
      <div className={styles.sideSymbol}>
        {symbol} · {timeframe}
      </div>
      {candleSourceKo ? <div className={styles.candleSourceKo}>{candleSourceKo}</div> : null}

      <div className={styles.gaugeWrap}>
        <div className={styles.gaugeLabel}>
          {panel.direction === 'LONG' ? 'LONG 우위' : panel.direction === 'SHORT' ? 'SHORT 우위' : '관망'}
        </div>
        <div className={styles.gaugeBar}>
          <div className={styles.gaugeLong} style={{ width: `${longW}%` }} />
          <div className={styles.gaugeShort} style={{ width: `${shortW}%` }} />
        </div>
        <div className={styles.gaugePct}>
          <span style={{ color: '#22c55e' }}>L {Math.round(panel.longPct)}%</span>
          <span style={{ color: '#ef4444' }}>S {Math.round(panel.shortPct)}%</span>
        </div>
      </div>

      <div className={styles.strategyBlock}>
        <div className={styles.strategyHead} style={{ color: dirColor }}>
          {panel.direction === 'LONG' ? '▲ 롱 전략' : panel.direction === 'SHORT' ? '▼ 숏 전략' : '◆ 관망'}
        </div>
        <div className={styles.levelGrid}>
          <div><span>E</span><strong>{fmt(panel.entry)}</strong></div>
          <div><span>SL</span><strong>{fmt(panel.stopLoss)}</strong></div>
          <div><span>TP1</span><strong>{fmt(panel.tp1)}</strong></div>
          <div><span>TP2</span><strong>{fmt(panel.tp2)}</strong></div>
          <div><span>TP3</span><strong>{fmt(panel.tp3)}</strong></div>
        </div>
        <div className={styles.stepKo}>{panel.stepKo}</div>
      </div>

      <div className={styles.whaleBlock}>
        <div className={styles.whaleHead}>고래 · VRVP</div>
        <div className={styles.whaleRow}>
          <span>매수</span>
          <div className={styles.whaleBar}>
            <div style={{ width: `${panel.whaleBuyPct}%`, background: '#22c55e' }} />
          </div>
          <span>{Math.round(panel.whaleBuyPct)}%</span>
        </div>
        <div className={styles.whaleRow}>
          <span>매도</span>
          <div className={styles.whaleBar}>
            <div style={{ width: `${panel.whaleSellPct}%`, background: '#ef4444' }} />
          </div>
          <span>{Math.round(panel.whaleSellPct)}%</span>
        </div>
        <div className={styles.whalePhase}>{panel.whalePhaseKo}</div>
        {panel.pocPrice != null && (
          <div className={styles.pocLine}>
            {MERGED_VRVP_KO.poc} · {fmt(panel.pocPrice)}
          </div>
        )}
        <div className={styles.pocDetail}>{panel.pocKo}</div>
      </div>

      <div className={styles.aiSrBlock}>
        <div className={styles.aiSrHead}>AI S/R</div>
        <div className={styles.aiSrLine} style={{ color: '#f87171' }}>
          R · {fmt(panel.aiResistance)}
        </div>
        <div className={styles.aiSrLine} style={{ color: '#34d399' }}>
          S · {fmt(panel.aiSupport)}
        </div>
      </div>

      <div className={styles.keyZoneBlock}>
        <div className={styles.keyZoneHead}>핵심 zone (TF 스윙)</div>
        <div className={styles.keyZoneKo}>{panel.keyZoneKo}</div>
      </div>

      <div className={styles.criticalZoneBlock}>
        <div className={styles.criticalZoneHead}>선행 핵심 (하락·상승 시)</div>
        <div className={styles.criticalPrimaryKo}>{panel.criticalPrimaryKo}</div>
        <div className={styles.criticalZoneKo}>{panel.criticalZoneKo}</div>
      </div>

      <div className={styles.bounceBlock}>
        <div className={styles.bounceHead}>지지 후 반등 목표</div>
        <div className={styles.bounceTargetKo}>{panel.bounceTargetKo}</div>
        <div className={styles.bounceDetailKo}>{panel.bounceDetailKo}</div>
      </div>

      <div className={styles.smcLeadingBlock}>
        <div className={styles.smcLeadingHead}>SMC 선행 (BOS·CHoCH·OB)</div>
        <div className={styles.smcLeadingKo}>{panel.smcLeadingKo}</div>
        <div className={styles.smcLeadingDetailKo}>{panel.smcLeadingDetailKo}</div>
      </div>

      <div className={styles.topsBottomsBlock}>
        <div className={styles.topsBottomsHead}>TOP / BOT (피벗·RSI)</div>
        <div className={styles.topsBottomsKo}>{panel.topsBottomsKo}</div>
      </div>

      <div className={styles.mirageLspBlock}>
        <div className={styles.mirageLspHead}>Mirage LSP (유동성 스윕)</div>
        <div className={styles.mirageLspKo}>{panel.mirageLspKo}</div>
      </div>

      <div className={styles.confirmBlock}>
        <div className={styles.confirmHead}>롱/숏 확정 (자체 탐지)</div>
        <div className={styles.confirmKo}>{panel.confirmKo}</div>
      </div>

      <div className={styles.judgmentBlock}>
        <div className={styles.judgmentHead}>매매 판단 (6요소)</div>
        {judgment && (
          <>
            <div
              className={styles.judgmentStance}
              style={{
                color:
                  judgment.direction === 'LONG'
                    ? '#4ade80'
                    : judgment.direction === 'SHORT'
                      ? '#f87171'
                      : '#94a3b8',
              }}
            >
              {judgment.stanceKo}
            </div>
            <div className={styles.judgmentAction}>{judgment.actionKo}</div>
          </>
        )}
        <div className={styles.judgmentKo}>{panel.judgmentKo}</div>
      </div>

      <div className={styles.timelineKo}>{panel.timelineKo}</div>
      <p className={styles.disclaimer}>조건부 참고 — 확정 수익·투자 권유 아님</p>
    </aside>
  );
}
