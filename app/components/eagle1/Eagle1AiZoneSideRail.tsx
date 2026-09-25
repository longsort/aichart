'use client';

import type { Eagle1AiZonePack } from '@/lib/eagle1/aiZonePack';
import {
  formatAiZoneExecPrice,
  formatAiZoneHoldLine,
  formatAiZoneSources,
} from '@/lib/eagle1/aiZonePack';
import type { Eagle1LiveBriefing } from '@/lib/eagle1/chartAlertCallouts';
import type { SuperStatsSwingSpotPack } from '@/lib/mergedDeskSuperStatsSwingTf';
import styles from './Eagle1AiZoneSideRail.module.css';

type Props = {
  pack: Eagle1AiZonePack | null;
  liveBriefing?: Eagle1LiveBriefing | null;
  briefingHidden?: boolean;
  onShowBriefing?: () => void;
  onHideBriefing?: () => void;
  frozen?: boolean;
  frozenOutcomeKo?: string | null;
  swingSpot?: SuperStatsSwingSpotPack | null;
};

function ExecRow({ label, value, tone }: { label: string; value: string; tone?: 'e' | 'sl' | 'tp' }) {
  return (
    <div className={styles.execRow} data-tone={tone ?? 'neutral'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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

export default function Eagle1AiZoneSideRail({
  pack,
  liveBriefing,
  briefingHidden = false,
  onShowBriefing,
  onHideBriefing,
  frozen = false,
  frozenOutcomeKo,
  swingSpot = null,
}: Props) {
  if (!pack) {
    return (
      <aside className={styles.rail} data-eagle1-region="ai-zone-rail">
        <div className={styles.empty}>AI ZONE · 데이터 없음</div>
      </aside>
    );
  }

  const active = pack.activeSupport;
  const ex = pack.execution;
  const briefing = liveBriefing ?? null;
  const swing = swingSpot;

  return (
    <aside className={styles.rail} data-eagle1-region="ai-zone-rail">
      {briefing ? (
        <section
          className={styles.conclusionBlock}
          data-verdict={briefing.conclusion}
          data-confirmed={briefing.confirmed ? '1' : '0'}
        >
          <header className={styles.blockHead}>
            <span className={styles.liveDot} aria-hidden />
            AI결론
            {onHideBriefing && !briefingHidden ? (
              <button type="button" className={styles.dismissBtn} onClick={onHideBriefing}>
                닫기
              </button>
            ) : null}
          </header>
          {briefingHidden ? (
            <button
              type="button"
              className={styles.conclusionChip}
              data-verdict={briefing.conclusion}
              onClick={onShowBriefing}
              title={`AI결론 ${briefing.resultKo} — 탭하면 브리핑 표시`}
            >
              AI결론 · {briefing.conclusionKo}
            </button>
          ) : (
            <>
              <div className={styles.conclusionHero} data-side={briefing.conclusion.toLowerCase()}>
                <strong>{briefing.conclusionKo}</strong>
                <em>{briefing.resultKo}</em>
              </div>
              <p className={styles.briefHeadline}>{briefing.headlineKo}</p>
              <ul className={styles.briefLines}>
                {briefing.lines.slice(0, 3).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}

      <section className={styles.block}>
        <header className={styles.blockHead}>
          <span className={styles.iconSupport} aria-hidden />
          활성 존
        </header>
        {active ? (
          <>
            <div className={styles.activeTitle}>{active.titleKo}</div>
            <div className={styles.meta}>{formatAiZoneHoldLine(active)}</div>
            <div className={styles.metaMuted}>{formatAiZoneSources(active)}</div>
            {active.gradeKo ? <div className={styles.grade}>{active.gradeKo}</div> : null}
          </>
        ) : (
          <div className={styles.muted}>지지·HotZone 후보 없음</div>
        )}
      </section>

      <section className={styles.block}>
        <header className={styles.blockHead}>증거</header>
        <ul className={styles.evidenceList}>
          {pack.evidence.length ? (
            pack.evidence.map((row) => (
              <li key={row.label} data-tone={row.tone ?? 'neutral'}>
                {row.label}
              </li>
            ))
          ) : (
            <li className={styles.muted}>증거 수집 중</li>
          )}
        </ul>
      </section>

      <section className={styles.block}>
        <header className={styles.blockHead}>
          실전 · AI超级变身统计
          {frozen ? <span className={styles.lockBadge}>잠금</span> : null}
        </header>
        {frozenOutcomeKo ? (
          <div className={styles.outcomeKo} data-outcome={frozenOutcomeKo.includes('TP1') ? 'success' : 'fail'}>
            {frozenOutcomeKo}
          </div>
        ) : null}
        {ex.direction ? (
          <>
            <div className={styles.metaMuted}>
              {ex.direction === 'LONG' ? '롱' : '숏'} · 상단 판정과 동일 타점
              {frozen ? ' · E/SL/TP 고정' : ''}
              {swing ? ` · ${swing.horizonKo}` : ''}
            </div>
            <ExecRow label="E" value={formatAiZoneExecPrice(ex.entry)} tone="e" />
            <ExecRow label="SL" value={formatAiZoneExecPrice(ex.sl)} tone="sl" />
            <ExecRow label="TP1" value={formatAiZoneExecPrice(ex.tp1)} tone="tp" />
            {ex.tp2 != null ? <ExecRow label="TP2" value={formatAiZoneExecPrice(ex.tp2)} tone="tp" /> : null}
            {ex.tp3 != null ? <ExecRow label="TP3" value={formatAiZoneExecPrice(ex.tp3)} tone="tp" /> : null}
            {swing ? (
              <div className={styles.spotBlock} aria-label="TF별 Hub 연동 타점">
                <div className={styles.spotLine}>
                  <span>현물기준</span>
                  <strong data-tone="sl">손절 {fmtStopPct(swing.stopPct)}</strong>
                </div>
                <div className={styles.spotLine}>
                  <span>상승/유리</span>
                  <strong data-tone="tp">
                    TP1 {fmtSignedPct(swing.risePctTp1)} · TP2 {fmtSignedPct(swing.risePctTp2)} · TP3{' '}
                    {fmtSignedPct(swing.risePctTp3)}
                  </strong>
                </div>
                {swing.rrTp1 != null ? (
                  <div className={styles.metaMuted}>
                    RR≈{swing.rrTp1} · {swing.qualityKo}
                  </div>
                ) : (
                  <div className={styles.metaMuted}>{swing.qualityKo}</div>
                )}
                <div className={styles.tfMiniBoard}>
                  {swing.tfBoard.map((row) => (
                    <div
                      key={row.tf}
                      className={styles.tfPriceCard}
                      data-active={row.active ? '1' : '0'}
                      title={row.noteKo}
                    >
                      <header>
                        <b>{row.tf}</b>
                        <em>{row.active ? 'Hub실타점' : 'Hub연동'}</em>
                      </header>
                      <div className={styles.tfPriceGrid}>
                        <span data-tone="e">E {formatAiZoneExecPrice(row.entry)}</span>
                        <span data-tone="sl">SL {formatAiZoneExecPrice(row.stopLoss)}</span>
                        <span data-tone="tp">TP1 {formatAiZoneExecPrice(row.tp1)}</span>
                        <span data-tone="tp">TP2 {formatAiZoneExecPrice(row.tp2)}</span>
                        <span data-tone="tp">TP3 {formatAiZoneExecPrice(row.tp3)}</span>
                      </div>
                      <div className={styles.tfPctLine}>
                        손절{fmtStopPct(row.stopPct)} · ↑{fmtSignedPct(row.risePctTp1)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.muted}>대기 · 상단 AI超级变身统计와 동일(반대 타점 숨김)</div>
        )}
        {active ? (
          <div className={styles.metaMuted}>
            존 근거: {active.titleKo}
            {active.holdPct != null ? ` · 지속 ${active.holdPct}%` : ''} (방향≠매매신호)
          </div>
        ) : null}
      </section>

      <section className={styles.lifecycle}>
        {pack.lifecycleKo.map((step, i) => (
          <span key={`${step}-${i}`} data-on={step === '—' ? '0' : i === 1 ? '1' : i === 0 ? 'done' : '0'}>
            {step}
          </span>
        ))}
      </section>

      <footer className={styles.footer}>{pack.footerKo}</footer>
    </aside>
  );
}
