'use client';

import type { AiAnalysisTradePlan } from '@/lib/aiAnalysisTradePlan';
import styles from '../MonthDeskAnalysisBoard.module.css';

type Props = {
  plan: AiAnalysisTradePlan;
  compact?: boolean;
};

const DIR_COLOR = { LONG: '#4ade80', SHORT: '#f87171', WAIT: '#fcd34d' } as const;

export default function AiAnalysisTradePlanPanel({ plan, compact }: Props) {
  const accent = DIR_COLOR[plan.direction];
  const confColor =
    plan.confluenceScore >= 82 ? '#22d3ee' : plan.confluenceScore >= 65 ? '#4ade80' : plan.confluenceScore >= 45 ? '#fcd34d' : '#94a3b8';

  if (compact) {
    return (
      <div className={styles.aiPlanCompact} style={{ borderColor: `${accent}44` }}>
        <div className={styles.aiPlanHeadRow}>
          <span className={styles.aiPlanDir} style={{ color: accent }}>
            {plan.directionKo}
          </span>
          <span className={styles.aiPlanStage}>{plan.stageKo}</span>
          <span className={styles.aiPlanConf} style={{ color: confColor }}>
            정합 {plan.confluenceScore}
          </span>
        </div>
        <p className={styles.aiPlanHeadline}>{plan.headline}</p>
        {plan.followChain?.headlineKo && (
          <p className={styles.aiPlanHeadline} style={{ fontSize: 10, marginBottom: 4 }}>
            {plan.followChain.headlineKo}
          </p>
        )}
        {plan.levels.slice(0, 4).map((lv) => (
          <div key={lv.key} className={styles.aiPlanLvRow}>
            <span>{lv.label}</span>
            <span className={styles.practicalMono}>
              {lv.price != null ? (lv.price >= 1000 ? lv.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : lv.price.toFixed(2)) : '—'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className={styles.aiPlanPanel} style={{ borderColor: `${accent}44`, boxShadow: `0 0 32px -12px ${accent}44` }}>
      <div className={styles.aiPlanGlow} style={{ background: `radial-gradient(ellipse 70% 50% at 50% 0%, ${accent}22, transparent 65%)` }} />
      <div className={styles.aiPlanInner}>
        <header className={styles.aiPlanHeader}>
          <div>
            <div className={styles.aiPlanTitle}>{plan.panelTitle}</div>
            <div className={styles.aiPlanSub}>{plan.panelSub}</div>
          </div>
          <div className={styles.aiPlanBadges}>
            <span className={styles.aiPlanDirBadge} style={{ color: accent, borderColor: `${accent}66`, background: `${accent}14` }}>
              {plan.directionKo}
            </span>
            <span className={styles.aiPlanStageBadge}>{plan.stageKo}</span>
          </div>
        </header>

        <div className={styles.aiPlanScoreRow}>
          <div className={styles.aiPlanScoreMain} style={{ color: confColor }}>
            <span className={styles.aiPlanScoreNum}>{plan.confluenceScore}</span>
            <span className={styles.aiPlanScoreUnit}>/100</span>
          </div>
          <div className={styles.aiPlanScoreMeta}>
            <div style={{ fontWeight: 800, color: confColor, fontSize: 12 }}>{plan.confluenceLabel}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
              확정 {plan.gatesPass}/{plan.gatesTotal}
              {plan.mtfBlocked ? ' · MTF 반대' : ''}
            </div>
          </div>
          {plan.metaTags.length > 0 && (
            <div className={styles.aiPlanTags}>
              {plan.metaTags.map((t) => (
                <span key={t} className={styles.aiPlanTag}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <p className={styles.aiPlanHeadline}>{plan.headline}</p>
        <p className={styles.aiPlanAction} style={{ color: accent }}>
          {plan.actionLine}
        </p>

        {plan.followChain && plan.followChain.phase !== 'idle' && (
          <div className={styles.aiPlanScenarios} style={{ marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>돌파·연동 경로</div>
            <div>
              <span className={styles.aiPlanScLabel} style={{ color: '#86efac' }}>
                ↑
              </span>{' '}
              {plan.followChain.upPath.length > 0
                ? plan.followChain.upPath.map((n) => `${n.labelKo} ${n.price >= 1000 ? n.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.price.toFixed(2)}`).join(' → ')
                : '—'}
            </div>
            <div style={{ marginTop: 4 }}>
              <span className={styles.aiPlanScLabel} style={{ color: '#fca5a5' }}>
                ↓
              </span>{' '}
              {plan.followChain.downPath.length > 0
                ? plan.followChain.downPath.map((n) => `${n.labelKo} ${n.price >= 1000 ? n.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.price.toFixed(2)}`).join(' → ')
                : '—'}
            </div>
            {plan.followChain.narrativeLlm && (
              <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>{plan.followChain.narrativeLlm}</p>
            )}
          </div>
        )}

        <div className={styles.aiPlanLadder}>
          {plan.levels.map((lv) => {
            const c =
              lv.role === 'invalid'
                ? '#f87171'
                : lv.role === 'tp'
                  ? '#38bdf8'
                  : lv.role === 'confirm'
                    ? '#22d3ee'
                    : lv.role === 'entry'
                      ? accent
                      : '#e2e8f0';
            return (
              <div key={lv.key} className={styles.aiPlanLvCard} style={{ borderColor: `${c}44`, background: `${c}0c` }}>
                <div className={styles.aiPlanLvTop}>
                  <span style={{ color: c, fontWeight: 900, fontSize: 11 }}>{lv.label}</span>
                  <span className={styles.practicalMono} style={{ fontWeight: 800, fontSize: 12 }}>
                    {lv.price != null
                      ? lv.price >= 1000
                        ? lv.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : lv.price.toFixed(2)
                      : '—'}
                  </span>
                </div>
                <div className={styles.aiPlanLvFoot}>
                  <span>{lv.source}</span>
                  {lv.distPct != null && (
                    <span className={styles.practicalMono} style={{ color: Math.abs(lv.distPct) < 0.25 ? '#4ade80' : '#94a3b8' }}>
                      {lv.distPct > 0 ? '+' : ''}
                      {lv.distPct.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {plan.rrLines.length > 0 && (
          <div className={styles.aiPlanRr}>
            {plan.rrLines.map((r, i) => (
              <div key={i}>
                {r}
              </div>
            ))}
          </div>
        )}

        <div className={styles.aiPlanChecklist}>
          <div className={styles.aiPlanCheckTitle}>실행 체크</div>
          <ul>
            {plan.checklist.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>

        <div className={styles.aiPlanScenarios}>
          <div>
            <span className={styles.aiPlanScLabel} style={{ color: '#86efac' }}>
              A
            </span>{' '}
            {plan.scenarios.a}
          </div>
          <div>
            <span className={styles.aiPlanScLabel} style={{ color: '#fca5a5' }}>
              B
            </span>{' '}
            {plan.scenarios.b}
          </div>
        </div>

        <p className={styles.aiPlanRisk}>{plan.riskNote}</p>
      </div>
    </section>
  );
}
