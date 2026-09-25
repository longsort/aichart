'use client';

import { useMemo } from 'react';
import type { Candle } from '@/types';
import type { AnalyzeResponse, OverlayItem } from '@/types';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { CandleCardConfluencePack } from '@/lib/mergedDeskCandleCardConfluence';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import {
  MERGED_DESK_CHART_FEATURE_CHIPS,
  type MergedDeskChartFeatureChipId,
  type MergedDeskChartFeatureFlags,
} from '@/lib/mergedDeskChartFeatureChips';
import { buildMergedDeskFeatureStatsPack } from '@/lib/mergedDeskFeatureStatsSim';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  enabled: boolean;
  candles: Candle[];
  timeframe: string;
  symbol: string;
  analysis?: AnalyzeResponse | null;
  overlays?: OverlayItem[] | null;
  activeTrade?: MergedDeskActiveTradePlan | null;
  candleCard?: CandleCardConfluencePack | null;
  settleBoard?: TfCloseSettleBoard | null;
  hubVerdictKo?: string | null;
  /** AVWAP·AI 합류 한줄 */
  avwapAiTitleKo?: string | null;
  /** 실전 AI 플랜 한줄 */
  practiceAiTitleKo?: string | null;
  featureFlags: MergedDeskChartFeatureFlags;
  onToggleFeature: (id: MergedDeskChartFeatureChipId) => void;
  onOpenFullStats?: () => void;
  onCloseHud?: () => void;
};

/**
 * 차트 위에 붙는 통계·FVG/OB/CHoCH 칩 HUD (전체화면 아님).
 */
export function MergedDeskChartFeatureHud({
  enabled,
  candles,
  timeframe,
  symbol,
  analysis,
  overlays,
  activeTrade,
  candleCard,
  settleBoard,
  hubVerdictKo,
  avwapAiTitleKo,
  practiceAiTitleKo,
  featureFlags,
  onToggleFeature,
  onOpenFullStats,
  onCloseHud,
}: Props) {
  const pack = useMemo(() => {
    if (!enabled || candles.length < 48) return null;
    return buildMergedDeskFeatureStatsPack({
      candles,
      timeframe,
      symbol,
      analysis,
      overlays,
      activeTrade,
      candleCard,
      settleBoard,
      hubVerdictKo,
    });
  }, [
    enabled,
    candles,
    timeframe,
    symbol,
    analysis,
    overlays,
    activeTrade,
    candleCard,
    settleBoard,
    hubVerdictKo,
  ]);

  if (!enabled) return null;

  return (
    <div className={styles.chartFeatHud} aria-label="차트 기능·통계 HUD">
      <div className={styles.chartFeatHudTop}>
        <span className={styles.chartFeatHudTitle}>차트기능</span>
        <div className={styles.chartFeatHudActions}>
          {onOpenFullStats ? (
            <button type="button" className={styles.chartFeatHudBtn} onClick={onOpenFullStats}>
              전체통계
            </button>
          ) : null}
          {onCloseHud ? (
            <button type="button" className={styles.chartFeatHudBtnOff} onClick={onCloseHud} title="통계HUD OFF">
              OFF
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.chartFeatHudChips} aria-label="FVG OB CHoCH BOS">
        {MERGED_DESK_CHART_FEATURE_CHIPS.map((c) => {
          const on = featureFlags[c.id] !== false;
          return (
            <button
              key={c.id}
              type="button"
              className={`tool-chip tool-chip-button ${on ? 'tool-chip-active' : ''}`}
              title={`${c.hintKo} — 지금 ${on ? 'ON' : 'OFF'}`}
              data-on={on ? '1' : '0'}
              onClick={() => onToggleFeature(c.id)}
            >
              {c.labelKo}
              <span className={styles.chartFeatHudChipState}>{on ? 'ON' : 'OFF'}</span>
            </button>
          );
        })}
      </div>

      {pack ? (
        <div className={styles.chartFeatHudStats}>
          {avwapAiTitleKo ? (
            <div className={styles.chartFeatHudStatRow}>
              <span>AVWAP·AI</span>
              <b>{avwapAiTitleKo}</b>
            </div>
          ) : null}
          {practiceAiTitleKo ? (
            <div className={styles.chartFeatHudStatRow}>
              <span>실전AI</span>
              <b>{practiceAiTitleKo}</b>
            </div>
          ) : null}
          <div className={styles.chartFeatHudStatRow}>
            <span>지지</span>
            <b>{pack.headline.bestSupportKo || '—'}</b>
          </div>
          <div className={styles.chartFeatHudStatRow}>
            <span>저항</span>
            <b>{pack.headline.bestResistKo || '—'}</b>
          </div>
          <div className={styles.chartFeatHudStatRow}>
            <span>거래량</span>
            <b>{pack.headline.volBiasKo || '—'}</b>
          </div>
          <div className={styles.chartFeatHudStatRow}>
            <span>안착</span>
            <b>{pack.headline.settleBiasKo || '—'}</b>
          </div>
          {hubVerdictKo ? (
            <div className={styles.chartFeatHudStatRow}>
              <span>Hub</span>
              <b>{hubVerdictKo}</b>
            </div>
          ) : null}
          <p className={styles.chartFeatHudNote}>조건부 표본 · 확정 아님</p>
        </div>
      ) : (
        <p className={styles.chartFeatHudNote}>봉 부족 — 통계 대기</p>
      )}
    </div>
  );
}
