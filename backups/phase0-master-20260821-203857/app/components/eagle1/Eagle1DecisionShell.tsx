'use client';

import { useMemo, useState } from 'react';
import type { AnalyzeResponse } from '@/types';
import { eagle1DecisionKo, formatPriceCompact } from '@/lib/eagle1/chartUx';
import { eagle1HorizonVerdicts } from '@/lib/eagle1/horizonVerdict';
import { lastLiquidityKo, lastStructureEventKo, wyckoffKo } from '@/lib/eagle1/structureEngine';
import { pocStateKo } from '@/lib/eagle1/zoneEngine';
import { moneyPressureShellKo } from '@/lib/eagle1/moneyPressureBand';
import { zoneReactionKo } from '@/lib/eagle1/zoneReaction';
import { similarityShellKo } from '@/lib/eagle1/historicalSimilarity';
import { consensusShellKo } from '@/lib/eagle1/consensusEngine';
import { mlShellKo } from '@/lib/eagle1/internalMl';
import { smartPathShellKo } from '@/lib/eagle1/smartPath';
import { walkForwardShellKo } from '@/lib/eagle1/walkForwardBacktest';
import { overlayFromEagle1ZoneId } from '@/lib/eagle1/zoneOverlays';
import { EAGLE1_ENGINE_VERSION } from '@/lib/eagle1/rawTypes';
import { EAGLE1_REPLAY_SPEEDS } from '@/lib/eagle1/replayEngine';
import styles from './Eagle1DecisionShell.module.css';

type Props = {
  analysis: AnalyzeResponse | null;
  selectedZoneId?: string | null;
};

function flowKo(analysis: AnalyzeResponse | null, plan: NonNullable<AnalyzeResponse['eagle1MainPlan']> | null): string {
  const fromPipe = moneyPressureShellKo(analysis?.eagle1MoneyPressure);
  if (fromPipe !== '데이터 없음') return fromPipe;
  if (plan?.moneyFlow?.stateKo) return `${plan.moneyFlow.stateKo} · 추정`;
  return '데이터 없음';
}

export default function Eagle1DecisionShell({ analysis, selectedZoneId = null }: Props) {
  const [whyOpen, setWhyOpen] = useState(false);
  const plan = analysis?.eagle1MainPlan ?? null;
  const horizons = useMemo(() => eagle1HorizonVerdicts(plan?.mtf ?? analysis?.eagle1MainPlan?.mtf ?? null), [plan?.mtf, analysis?.eagle1MainPlan?.mtf]);
  const inspect = useMemo(() => {
    const id = String(selectedZoneId || '');
    if (!id.startsWith('eagle1-') || !analysis?.eagle1Zones) return null;
    return overlayFromEagle1ZoneId({
      id,
      lastTime: Date.now(),
      mode: analysis.eagle1ChartUx?.mode ?? 'practical',
      pack: {
        zones: analysis.eagle1Zones.zones,
        clusters: analysis.eagle1Zones.clusters,
        recommended: analysis.eagle1Zones.recommended,
        displaySupport: analysis.eagle1Zones.displaySupport,
        displayResist: analysis.eagle1Zones.displayResist,
        pocState: analysis.eagle1Zones.profile?.pocState,
        reaction: analysis.eagle1Zones.reaction,
      },
    });
  }, [selectedZoneId, analysis]);
  if (!plan) {
    return (
      <section className={styles.shell} data-status="WAIT">
        <div className={styles.brand}>독수리1호</div>
        <div className={styles.decision}>대기</div>
        <div className={styles.muted}>분석 대기 · 가짜 확률 없음</div>
      </section>
    );
  }
  const status = plan.status;
  const decision = eagle1DecisionKo(status);
  const tone =
    status === 'CONFIRMED_LONG' || status === 'LONG_WATCH'
      ? 'long'
      : status === 'CONFIRMED_SHORT' || status === 'SHORT_WATCH'
        ? 'short'
        : 'wait';
  const prob =
    plan.calibratedProbability != null && plan.sampleSize >= 30
      ? `${Math.round(plan.calibratedProbability * 100)}%`
      : '통계 부족';
  const rr = plan.netRr != null ? `1:${plan.netRr.toFixed(2)}` : '통계 부족';
  const ev =
    plan.stats?.netExpectancy != null && plan.sampleSize >= 30
      ? `${plan.stats.netExpectancy >= 0 ? '+' : ''}${plan.stats.netExpectancy.toFixed(2)}R`
      : '통계 부족';
  const src = analysis?.eagle1CandleSource;

  return (
    <section className={styles.shell} data-status={tone}>
      <header className={styles.head}>
        <div>
          <div className={styles.brand}>독수리1호 · 실전</div>
          <div className={styles.decision}>{decision}</div>
        </div>
        <div className={styles.probBox}>
          <span className={styles.k}>검증확률</span>
          <strong>{prob}</strong>
        </div>
      </header>

      <div className={styles.row}>
        <span className={styles.k}>레짐</span>
        <span>{plan.regime === 'UNKNOWN' ? '데이터 없음' : plan.regime}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>구조</span>
        <span>{lastStructureEventKo(analysis?.eagle1Structure?.events) || '데이터 없음'}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>최다거래</span>
        <span>
          {analysis?.eagle1Zones?.profile?.poc != null
            ? pocStateKo(analysis.eagle1Zones.profile.pocState)
            : '데이터 없음'}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>큰손</span>
        <span>{flowKo(analysis, plan)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>진입존</span>
        <span>{analysis?.eagle1Zones?.recommended?.labelKo || '데이터 없음'}</span>
      </div>
      <div className={styles.muted}>존·라벨 클릭 → 구간 설명 · 확률 단정 아님</div>
      {inspect ? (
        <div className={styles.inspect}>
          <div className={styles.inspectTitle}>{inspect.label || inspect.zoneFaceBase || '구간'}</div>
          <div>
            {formatPriceCompact(Number(inspect.price2))} ~ {formatPriceCompact(Number(inspect.price1))}
          </div>
          <div className={styles.foot}>{inspect.labelTooltip || '클릭: 구간 설명 · 확률 단정 아님'}</div>
        </div>
      ) : null}
      <div className={styles.row}>
        <span className={styles.k}>존반응</span>
        <span>{zoneReactionKo(analysis?.eagle1Zones?.reaction)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>합의</span>
        <span>{consensusShellKo(plan.consensus ?? analysis?.eagle1Consensus)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>유사국면</span>
        <span>{similarityShellKo(plan.stats)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>내부ML</span>
        <span>{mlShellKo(plan.ml)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>경로</span>
        <span>{smartPathShellKo(plan.smartPath ?? analysis?.eagle1SmartPath)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>성과</span>
        <span>
          {analysis?.eagle1SnapshotStats
            ? analysis.eagle1SnapshotStats.note || analysis.eagle1SnapshotStats.label
            : plan.sampleSize >= 30
              ? `표본 ${plan.sampleSize}`
              : '통계 부족'}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>유동성</span>
        <span>{lastLiquidityKo(analysis?.eagle1Structure) || '데이터 없음'}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.k}>와이코프</span>
        <span>{wyckoffKo(analysis?.eagle1Structure?.wyckoff)}</span>
      </div>

      <div className={styles.horizons}>
        {horizons.map((h) => (
          <div key={h.id} className={styles.horizon} data-h={h.status}>
            <span>{h.labelKo}</span>
            <strong>
              {h.status === 'LONG' ? '롱' : h.status === 'SHORT' ? '숏' : h.status === 'WAIT' ? '대기' : '데이터 없음'}
            </strong>
          </div>
        ))}
      </div>

      <dl className={styles.grid}>
        <div>
          <dt>진입</dt>
          <dd>
            {plan.entryLow != null && plan.entryHigh != null
              ? `${formatPriceCompact(plan.entryLow)} ~ ${formatPriceCompact(plan.entryHigh)}`
              : '대기'}
          </dd>
        </div>
        <div>
          <dt>손절</dt>
          <dd>{formatPriceCompact(plan.sl)}</dd>
        </div>
        <div>
          <dt>TP1 / TP2 / TP3</dt>
          <dd>
            {formatPriceCompact(plan.tp1)} / {formatPriceCompact(plan.tp2)} / {formatPriceCompact(plan.tp3)}
          </dd>
        </div>
        <div>
          <dt>RR · EV</dt>
          <dd>
            {rr} · {ev}
          </dd>
        </div>
      </dl>

      <div className={styles.inv}>
        <span className={styles.k}>무효</span>
        <span>{plan.invalidation || '데이터 없음'}</span>
      </div>

      {status === 'LONG_MISSED' || status === 'SHORT_MISSED' ? (
        <div className={styles.miss}>{status === 'LONG_MISSED' ? '롱놓침 · 눌림대기' : '숏놓침 · 되돌림대기'}</div>
      ) : null}

      <div className={styles.replayHint}>
        리플레이 {EAGLE1_REPLAY_SPEEDS.map((s) => `${s}x`).join(' / ')} · Live와 동일 엔진
      </div>

      <button type="button" className={styles.whyBtn} onClick={() => setWhyOpen((v) => !v)}>
        {whyOpen ? '근거 닫기' : '왜 이 판단인가'}
      </button>
      {whyOpen ? (
        <div className={styles.why}>
          <div>근거: {(plan.reasons || []).slice(0, 8).join(' · ') || '데이터 없음'}</div>
          <div>반대: {(plan.opposing || []).slice(0, 6).join(' · ') || '—'}</div>
          <div>
            표본 {plan.sampleSize} · {plan.calibratedLabel}
            {plan.aiScore != null ? ` · AI점수 ${plan.aiScore.toFixed(0)}(확률 아님)` : ''}
            {plan.noTradeGates?.length ? ` · ${plan.noTradeGates[0]}` : ''}
          </div>
          <div>경로: {plan.expectedPath || '데이터 없음'}</div>
          <div>대체: {plan.altPath || '데이터 없음'}</div>
          {plan.consensus?.votes?.length ? (
            <div>
              모델: {plan.consensus.votes.map((v) => `${v.name} ${v.vote}`).join(' · ')}
            </div>
          ) : null}
        </div>
      ) : null}

      <details className={styles.stats}>
        <summary>통계</summary>
        {(analysis?.eagle1StatsDashboard?.rows ?? []).length
          ? analysis!.eagle1StatsDashboard!.rows.map((row) => (
              <div key={row.key} className={styles.row}>
                <span className={styles.k}>{row.labelKo}</span>
                <span>{row.value}</span>
              </div>
            ))
          : (
              <div className={styles.muted}>데이터 없음</div>
            )}
        <div className={styles.row}>
          <span className={styles.k}>워크포워드</span>
          <span>{walkForwardShellKo(analysis?.eagle1WalkForward)}</span>
        </div>
      </details>

      <footer className={styles.foot}>
        {src?.exchange ?? 'bitget'} · {src?.source ?? 'bitget'} · {src?.sample_count ?? 0}봉 · {EAGLE1_ENGINE_VERSION}
      </footer>
    </section>
  );
}
