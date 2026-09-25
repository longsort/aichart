'use client';

import { memo, useMemo } from 'react';
import type { AnalyzeResponse } from '@/types';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { SuperStatsHubPack } from '@/lib/mergedDeskSuperStatsHub';
import { buildMergedDeskSuperAdvancedStats } from '@/lib/mergedDeskSuperAdvancedStats';
import {
  AI_SUPER_BIANSHEN_STATS,
  AI_SUPER_BIANSHEN_STATS_TAG,
} from '@/lib/eagle1/aiSuperBianShenStats';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  master?: MasterFuturesDecision | null;
  judgment?: MergedTradeJudgment | null;
  analysis?: AnalyzeResponse | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  confluenceHint?: string | null;
  hub?: SuperStatsHubPack | null;
  schoolEvidenceKo?: string | null;
  timeframe?: string | null;
  /** Anchored VWAP 연동 (찍은 핀 고가/시가) */
  avwapLineKo?: string | null;
  avwapRows?: Array<{
    n: number;
    role: 'high' | 'low';
    anchorTf: string;
    extreme: number | null;
    open: number | null;
  }> | null;
};

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return n >= 1000 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(4);
}

function fmtSignedPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtStopPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `−${Math.abs(n).toFixed(2)}%`;
}

/** AI超级变身统计 — Hub 1판정 바 (카드·학파는 증거만) */
function MergedDeskSuperAdvancedStatsStrip({
  master,
  judgment,
  analysis,
  tradePlan,
  confluenceHint,
  hub = null,
  schoolEvidenceKo = null,
  timeframe = null,
  avwapLineKo = null,
  avwapRows = null,
}: Props) {
  const stats = useMemo(() => {
    if (hub?.stats) return hub.stats;
    return buildMergedDeskSuperAdvancedStats({
      master,
      judgment,
      analysis,
      tradePlan,
      confluenceHint,
      timeframe,
    });
  }, [hub, master, judgment, analysis, tradePlan, confluenceHint, timeframe]);

  const evidence = schoolEvidenceKo || hub?.evidenceKo?.[0] || stats.reasonsKo[0];
  const conflict = hub?.conflictKo;
  const swing = stats.swingSpot;
  const avwapList = avwapRows?.length ? avwapRows : null;

  return (
    <div
      className={styles.superAdvStats}
      data-verdict={stats.verdict}
      data-hub={hub ? '1' : '0'}
      data-brand="ai-super-bianshen"
      title={`${stats.headlineKo} · ${stats.invalidationKo} (참고·확정수익 아님)`}
    >
      <div className={styles.superAdvStatsHead}>
        <span className={styles.superAdvStatsTag}>
          {hub ? AI_SUPER_BIANSHEN_STATS_TAG : AI_SUPER_BIANSHEN_STATS}
        </span>
        <strong className={styles.superAdvStatsVerdict} style={{ color: stats.color }}>
          {stats.verdictKo}
        </strong>
        <span className={styles.superAdvStatsGrade}>
          {stats.grade} · {stats.strength}점
          {hub ? ` · 合议${hub.agreementPct}%` : ''}
          {swing ? ` · ${swing.horizonKo}` : ''}
        </span>
        <span className={styles.superAdvStatsLock} data-ok={stats.entryAllowed ? '1' : '0'}>
          {stats.entryAllowed ? '타점가능' : '대기·잠금'}
        </span>
      </div>
      <div className={styles.superAdvStatsRatio} aria-label="롱숏 비율">
        <span className={styles.superAdvStatsLong}>롱 {stats.longPct}%</span>
        <span className={styles.superAdvStatsBar}>
          <i style={{ width: `${stats.longPct}%` }} />
        </span>
        <span className={styles.superAdvStatsShort}>숏 {stats.shortPct}%</span>
      </div>
      <div className={styles.superAdvStatsLevels}>
        <span>E {fmt(stats.entry)}</span>
        <span>SL {fmt(stats.stopLoss)}</span>
        <span>TP1 {fmt(stats.tp1)}</span>
        {stats.tp2 != null ? <span>TP2 {fmt(stats.tp2)}</span> : null}
        {stats.tp3 != null ? <span>TP3 {fmt(stats.tp3)}</span> : null}
      </div>
      {avwapList || avwapLineKo ? (
        <div className={styles.superAdvStatsAvwap} aria-label="AVWAP 연동">
          <span className={styles.superAdvStatsAvwapLabel}>AVWAP</span>
          {avwapList
            ? avwapList.slice(0, 4).map((r) => (
                <span
                  key={`${r.n}-${r.role}-${r.anchorTf}`}
                  className={styles.superAdvStatsAvwapChip}
                  data-role={r.role}
                  title={`${r.n}번 ${r.role === 'high' ? '고점' : '저점'} · ${r.anchorTf}`}
                >
                  {r.n}
                  {r.role === 'high' ? '고' : '저'}·{r.anchorTf} 고가{fmt(r.extreme)}/시가
                  {fmt(r.open)}
                </span>
              ))
            : (
                <span className={styles.superAdvStatsAvwapLine}>{avwapLineKo}</span>
              )}
        </div>
      ) : null}
      {swing ? (
        <>
          <div className={styles.superAdvStatsSpot} aria-label="현물 기준 스윙 %">
            <span className={styles.superAdvStatsSpotLabel}>현물기준</span>
            <span data-tone="sl">손절 {fmtStopPct(swing.stopPct)}</span>
            <span data-tone="tp">TP1 {fmtSignedPct(swing.risePctTp1)}</span>
            <span data-tone="tp">TP2 {fmtSignedPct(swing.risePctTp2)}</span>
            <span data-tone="tp">TP3 {fmtSignedPct(swing.risePctTp3)}</span>
            {swing.rrTp1 != null ? <span>RR≈{swing.rrTp1}</span> : null}
            <span className={styles.superAdvStatsSpotQuality}>{swing.qualityKo}</span>
          </div>
          <div className={styles.superAdvStatsTfBoard} aria-label="TF별 Hub 연동 타점">
            {swing.tfBoard.map((row) => (
              <div
                key={row.tf}
                className={styles.superAdvStatsTfRow}
                data-active={row.active ? '1' : '0'}
                data-source={row.source}
                title={row.noteKo}
              >
                <div className={styles.superAdvStatsTfHead}>
                  <b>{row.tf}</b>
                  <em>{row.horizonKo}</em>
                  {row.active ? <i>Hub실타점</i> : <i>Hub연동</i>}
                </div>
                <div className={styles.superAdvStatsTfPrices}>
                  <span data-tone="e">E {fmt(row.entry)}</span>
                  <span data-tone="sl">SL {fmt(row.stopLoss)}</span>
                  <span data-tone="tp">TP1 {fmt(row.tp1)}</span>
                  <span data-tone="tp">TP2 {fmt(row.tp2)}</span>
                  <span data-tone="tp">TP3 {fmt(row.tp3)}</span>
                </div>
                <div className={styles.superAdvStatsTfPct}>
                  손절 {fmtStopPct(row.stopPct)} · TP1 {fmtSignedPct(row.risePctTp1)} · TP2{' '}
                  {fmtSignedPct(row.risePctTp2)} · TP3 {fmtSignedPct(row.risePctTp3)}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className={styles.superAdvStatsFoot}>
        <span>{stats.sampleHintKo}</span>
        {conflict ? <span>· {conflict}</span> : evidence ? <span>· {evidence}</span> : null}
        <span className={styles.superAdvStatsNote}>참고·터치≠확정</span>
      </div>
      {hub?.evidenceKo && hub.evidenceKo.length > 1 ? (
        <ul className={styles.superAdvStatsEvidence} aria-label="变身统计 증거">
          {hub.evidenceKo.slice(0, 6).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default memo(MergedDeskSuperAdvancedStatsStrip);
