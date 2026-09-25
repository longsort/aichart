'use client';

import type { MasterFuturesDecision, MergedTradeJudgment } from '@/lib/mergedAnalysisDeskEngine';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  master?: MasterFuturesDecision | null;
  judgment?: MergedTradeJudgment | null;
  theme?: 'dark' | 'light';
  onJournal?: () => void;
};

/** 통합분석 — 선물 마스터 확정 배너 (롱/숏/관망 1개) */
export default function MergedAnalysisTradeJudgmentBanner({
  master,
  judgment,
  theme = 'dark',
  onJournal,
}: Props) {
  if (!master && !judgment) return null;

  if (master) {
    const side = master.side;
    const dirClass =
      side === 'LONG'
        ? styles.judgmentBannerLong
        : side === 'SHORT'
          ? styles.judgmentBannerShort
          : styles.judgmentBannerNeutral;
    const sideKo = side === 'LONG' ? '롱' : side === 'SHORT' ? '숏' : '관망';
    const lockKo = master.entryAllowed ? '진입가능' : '진입잠금';

    return (
      <div
        className={`${styles.judgmentBanner} ${styles.masterFuturesBanner} ${dirClass}`}
        data-theme={theme}
        aria-label="선물 마스터 확정"
      >
        <div className={styles.masterFuturesTop}>
          <div className={styles.masterFuturesBadge} style={{ color: master.color, borderColor: `${master.color}88` }}>
            {sideKo}
          </div>
          <div className={styles.masterFuturesMain}>
            <div className={styles.judgmentBannerHead}>{master.verdictKo}</div>
            <div className={styles.judgmentBannerHeadline}>{master.reasonKo}</div>
          </div>
          <div className={styles.masterFuturesMeta}>
            <span className={styles.masterGrade} data-grade={master.grade}>
              {master.grade}
            </span>
            <span className={master.entryAllowed ? styles.masterUnlock : styles.masterLock}>{lockKo}</span>
            <span className={styles.masterScore}>{master.strength}점</span>
          </div>
        </div>

        <div className={styles.masterFuturesGrid}>
          <div>
            <span className={styles.masterLabel}>게이트</span>
            <span>
              {master.gatesPassCount}/{master.gatesRequired}
              {master.gatesPassCount >= master.gatesRequired ? ' ✓' : ' ✗'}
            </span>
          </div>
          <div>
            <span className={styles.masterLabel}>RR</span>
            <span>{master.rr > 0 ? `${master.rr.toFixed(2)}R` : '—'}</span>
          </div>
          <div>
            <span className={styles.masterLabel}>E/SL</span>
            <span>
              {master.entryPrice > 0 ? master.entryPrice.toFixed(0) : '—'} /{' '}
              {master.stopPrice > 0 ? master.stopPrice.toFixed(0) : '—'}
            </span>
          </div>
          <div>
            <span className={styles.masterLabel}>세션</span>
            <span title={master.session.filterKo}>{master.session.sessionKo}</span>
          </div>
        </div>

        {!master.entryAllowed && master.gateBlockReasons.length > 0 && (
          <ul className={styles.masterBlockList}>
            {master.gateBlockReasons.slice(0, 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}

        <div className={styles.masterFuturesCtx}>
          <span title={master.futures.fundingKo}>{master.futures.fundingKo}</span>
          <span title={master.futures.oiKo}>{master.futures.oiKo}</span>
          <span title={master.futures.liqKo}>{master.futures.liqKo}</span>
        </div>

        <div className={styles.judgmentInvalid}>{master.invalidationKo}</div>
        <div className={styles.masterSizing}>{master.sizing.sizingKo}</div>

        <div className={styles.masterFuturesFoot}>
          <span className={styles.masterJournalHint}>{master.journalHintKo}</span>
          {onJournal && (
            <button type="button" className={styles.masterJournalBtn} onClick={onJournal}>
              저널 기록
            </button>
          )}
        </div>

        {judgment && judgment.pillars.length > 0 && (
          <details className={styles.masterPillarDetails}>
            <summary>근거 기둥 보기</summary>
            <ul className={styles.judgmentPillarList}>
              {judgment.pillars.map((p) => (
                <li
                  key={p.key}
                  className={
                    p.bias === 'LONG'
                      ? styles.judgmentPillarLong
                      : p.bias === 'SHORT'
                        ? styles.judgmentPillarShort
                        : styles.judgmentPillarNeutral
                  }
                >
                  <strong>{p.labelKo}</strong> {p.detailKo}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  const dir = judgment!.direction;
  const dirClass =
    dir === 'LONG' ? styles.judgmentBannerLong : dir === 'SHORT' ? styles.judgmentBannerShort : styles.judgmentBannerNeutral;

  return (
    <div className={`${styles.judgmentBanner} ${dirClass}`} data-theme={theme} aria-label="매매 판단">
      <div className={styles.judgmentBannerHead}>{judgment!.stanceKo}</div>
      <div className={styles.judgmentBannerHeadline}>{judgment!.headlineKo}</div>
      <div className={styles.judgmentBannerAction}>{judgment!.actionKo}</div>
      <ul className={styles.judgmentPillarList}>
        {judgment!.pillars.map((p) => (
          <li
            key={p.key}
            className={
              p.bias === 'LONG'
                ? styles.judgmentPillarLong
                : p.bias === 'SHORT'
                  ? styles.judgmentPillarShort
                  : styles.judgmentPillarNeutral
            }
          >
            <strong>{p.labelKo}</strong> {p.detailKo}
          </li>
        ))}
      </ul>
      <div className={styles.judgmentInvalid}>{judgment!.invalidationKo}</div>
    </div>
  );
}
