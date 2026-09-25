/**
 * Eagle1 StructureAcceptance desk — layout matches the 2026-08-20 reference mockup.
 * All numbers come from analyze → eagle1 engines. No hardcoded sample/probability.
 */
'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { AnalyzeResponse } from '@/types';
import { formatPriceCompact } from '@/lib/eagle1/chartUx';
import { ACCEPTANCE_FLOW } from '@/lib/eagle1/structureAcceptanceEngine';
import { formatReactionTime } from '@/lib/eagle1/historicalStatisticsEngine';
import { EAGLE1_ENGINE_VERSION } from '@/lib/eagle1/rawTypes';
import { overlayFromEagle1ZoneId } from '@/lib/eagle1/zoneOverlays';
import { formatSamplePct } from '@/lib/eagle1/noFakeNumbers';
import styles from './Eagle1StructureDesk.module.css';

type Props = {
  analysis: AnalyzeResponse | null;
  selectedZoneId?: string | null;
  symbol?: string;
  timeframe?: string;
  children: ReactNode;
  evidence?: ReactNode;
};

function pctText(n: number | null | undefined, sample: number, none = '데이터 없음'): string {
  if (sample <= 0) return none;
  return formatSamplePct(sample, n);
}

function rText(n: number | null | undefined, sample: number): string {
  if (sample <= 0) return '데이터 없음';
  if (n == null || !Number.isFinite(n)) return '통계 부족';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`;
}

function PathSpark({
  points,
  tone,
}: {
  points: Array<{ time: number; price: number }>;
  tone: 'green' | 'amber' | 'red';
}) {
  if (!points.length) {
    return <div className={styles.pathEmpty}>데이터 없음</div>;
  }
  const xs = points.map((p) => p.time);
  const ys = points.map((p) => p.price);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(1e-9, maxX - minX);
  const h = Math.max(1e-9, maxY - minY);
  const d = points
    .map((p, i) => {
      const x = ((p.time - minX) / w) * 100;
      const y = 36 - ((p.price - minY) / h) * 32;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points[points.length - 1]!;
  const prev = points[Math.max(0, points.length - 2)]!;
  const x2 = ((last.time - minX) / w) * 100;
  const y2 = 36 - ((last.price - minY) / h) * 32;
  const x1 = ((prev.time - minX) / w) * 100;
  const y1 = 36 - ((prev.price - minY) / h) * 32;
  const stroke = tone === 'green' ? '#22c55e' : tone === 'red' ? '#ef4444' : '#f59e0b';
  const ax = x2 - x1;
  const ay = y2 - y1;
  const alen = Math.hypot(ax, ay) || 1;
  const ux = ax / alen;
  const uy = ay / alen;
  const px = -uy;
  const py = ux;
  const size = 4.2;
  const bx = x2 - ux * size;
  const by = y2 - uy * size;
  const hw = size * 0.45;
  return (
    <svg className={styles.pathSvg} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.4" strokeDasharray="3 2.2" />
      {points.length >= 2 ? (
        <polygon
          points={`${x2},${y2} ${bx + px * hw},${by + py * hw} ${bx - px * hw},${by - py * hw}`}
          fill={stroke}
        />
      ) : null}
    </svg>
  );
}

function MiniOhlc({
  candles,
}: {
  candles: Array<{ open: number; high: number; low: number; close: number }>;
}) {
  if (candles.length < 4) {
    return <div className={styles.pathEmpty}>데이터 없음</div>;
  }
  const slice = candles.slice(0, 22);
  const hi = Math.max(...slice.map((c) => c.high));
  const lo = Math.min(...slice.map((c) => c.low));
  const span = Math.max(1e-9, hi - lo);
  const w = slice.length * 4;
  return (
    <svg className={styles.miniOhlc} viewBox={`0 0 ${w} 36`} preserveAspectRatio="none" aria-hidden>
      {slice.map((c, i) => {
        const x = i * 4 + 1.6;
        const yH = 34 - ((c.high - lo) / span) * 32;
        const yL = 34 - ((c.low - lo) / span) * 32;
        const yO = 34 - ((c.open - lo) / span) * 32;
        const yC = 34 - ((c.close - lo) / span) * 32;
        const color = c.close >= c.open ? '#22c55e' : '#ef4444';
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth="0.7" />
            <rect
              x={x - 0.9}
              y={Math.min(yO, yC)}
              width="1.8"
              height={Math.max(1.1, Math.abs(yC - yO))}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}

function eventAtLabel(ev: { at?: number; known_at: number }): string {
  const t = Number(ev.at);
  if (!(t > 0)) return String(ev.known_at);
  const ms = t > 1e12 ? t : t * 1000;
  return new Date(ms).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Eagle1StructureDesk({
  analysis,
  selectedZoneId = null,
  symbol = 'BTCUSDT',
  timeframe = '15m',
  children,
  evidence,
}: Props) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const acc = analysis?.eagle1Acceptance ?? null;
  const plan = analysis?.eagle1MainPlan ?? null;
  const path = analysis?.eagle1SmartPath ?? plan?.smartPath ?? null;
  const fb = analysis?.eagle1FalseBreak ?? null;
  const hist = analysis?.eagle1HistoricalOutcome ?? null;
  const prem = analysis?.eagle1PremiumDiscount ?? null;
  const zones = analysis?.eagle1UnifiedZones ?? null;
  const events = analysis?.eagle1Structure?.events ?? [];
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

  const tone =
    acc?.uiLabel === '상방 안착확정'
      ? 'long'
      : acc?.uiLabel === '하방 안착확정'
        ? 'short'
        : acc?.uiLabel === '가짜돌파' || acc?.uiLabel === '가짜이탈'
          ? 'fail'
          : 'wait';

  const sample = acc?.historicalSample ?? plan?.sampleSize ?? 0;
  const score = acc?.breakQualityScore;
  const zoneCards = [zones?.support[0], zones?.resist[0]].filter(
    (z): z is NonNullable<typeof z> => z != null
  );
  const posPct = prem?.position != null ? Math.max(0, Math.min(100, prem.position * 100)) : null;
  const spark = analysis?.eagle1SparkCandles ?? [];
  const px = analysis?.currentPrice ?? spark[spark.length - 1]?.close ?? null;
  const prev = spark.length >= 2 ? spark[spark.length - 2]!.close : null;
  const chg = px != null && prev != null && prev !== 0 ? ((px - prev) / prev) * 100 : null;

  return (
    <section className={styles.desk} data-eagle1-desk="structure" data-tone={tone}>
      <header className={styles.header} data-eagle1-region="header">
        <div className={styles.brandBlock}>
          <h1 className={styles.title}>독수리1호 AI 구조분석 시스템</h1>
          <div className={styles.sub}>
            StructureAcceptanceEngine (실시간 상태 머신) · {symbol} {timeframe} · {EAGLE1_ENGINE_VERSION}
          </div>
        </div>
        <div className={styles.flowWrap} aria-label="상태 흐름도">
          <div className={styles.panelKicker}>상태 흐름도</div>
          <ol className={styles.flow}>
            {ACCEPTANCE_FLOW.map((step, i) => {
              const cur = ACCEPTANCE_FLOW.indexOf(acc?.state as (typeof ACCEPTANCE_FLOW)[number]);
              const inFlow = cur >= 0 && !acc?.activeFail;
              const phase = acc?.state === step ? '1' : inFlow && i < cur ? 'done' : '0';
              return (
                <li key={step} data-active={phase}>
                  {step}
                </li>
              );
            })}
          </ol>
          <div className={styles.failRow}>
            {(['FAILED_RECLAIM', 'FAKE_BREAKOUT', 'FAKE_BREAKDOWN'] as const).map((f) => (
              <span key={f} data-active={acc?.activeFail === f ? '1' : '0'}>
                {f}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.top}>
        <div className={styles.chartCol} data-eagle1-region="chart">
          <div className={styles.chartMeta}>
            {symbol} · {timeframe}
            {analysis?.eagle1CandleSource?.source ? ` · ${analysis.eagle1CandleSource.source}` : ''}
            {px != null ? ` · ${formatPriceCompact(px)}` : ''}
            {chg != null ? (
              <b data-up={chg >= 0 ? '1' : '0'}>
                {' '}
                {chg >= 0 ? '+' : ''}
                {chg.toFixed(2)}%
              </b>
            ) : null}
            <span className={styles.muted}> · 기존 도구는 「도구」</span>
          </div>
          <div className={styles.chartSlot}>{children}</div>
        </div>

        <aside className={styles.statePanel} data-eagle1-region="state">
          <div className={styles.panelKicker}>현재 구조 상태 ({timeframe})</div>
          <div className={styles.stateLabel}>{acc?.uiLabel ?? '대기'}</div>
          <div className={styles.stateEn}>{acc?.state ?? 'IDLE'}</div>
          <div className={styles.scoreRow}>
            <span>BreakQualityScore</span>
            <strong>
              {score == null ? '데이터 없음' : `${Math.round(score)} / 100`}
            </strong>
          </div>
          <ul className={styles.factors}>
            {(acc?.factors ?? []).map((f) => (
              <li key={f.id}>
                <span>{f.labelKo}</span>
                <div className={styles.barTrack} aria-hidden>
                  <i style={{ width: f.score == null ? '0%' : `${Math.round(f.score)}%` }} />
                </div>
                <b>{f.score == null ? f.note : Math.round(f.score)}</b>
              </li>
            ))}
          </ul>
          <div className={styles.metaLine}>
            Historical Sample:{' '}
            {sample > 0 ? `${sample.toLocaleString('en-US')} 건` : '데이터 없음'}
          </div>
          <div className={styles.metaLine}>
            상승 확률 (Calibrated): {pctText(acc?.calibratedProbability, sample)}
          </div>
          <div className={styles.mtf}>
            {(acc?.mtfBias ?? []).map((row) => (
              <div key={row.id} className={styles.mtfRow}>
                <span>{row.labelKo}</span>
                <span className={styles.muted}>{row.tfs}</span>
                <strong data-bias={row.bias ?? 'none'}>
                  {row.bias === 'up' ? 'Up' : row.bias === 'down' ? 'Down' : row.note || '데이터 없음'}
                </strong>
              </div>
            ))}
          </div>
        </aside>

        <aside className={styles.rightCol}>
          <div className={styles.card} data-eagle1-region="scenario">
            <div className={styles.panelKicker}>Scenario</div>
            {([
              { key: 'main' as const, tone: 'green' as const },
              { key: 'alt' as const, tone: 'amber' as const },
              { key: 'break' as const, tone: 'red' as const },
            ]).map(({ key, tone: t }) => {
              const sc = key === 'main' ? path?.main : key === 'alt' ? path?.alt : path?.break ?? path?.invalid;
              return (
                <div key={key} className={styles.scenario}>
                  <div className={styles.scenarioHead}>
                    <span>{sc?.labelEn ?? (key === 'main' ? 'MAIN PATH' : key === 'alt' ? 'ALTERNATIVE PATH' : 'BREAK/EXTREME PATH')}</span>
                    <b>{formatSamplePct(sc?.sampleSize ?? 0, sc?.probability ?? null)}</b>
                  </div>
                  <PathSpark points={sc?.points ?? []} tone={t} />
                  <div className={styles.scenarioMeta}>
                    {sc?.uiState ?? 'WAIT'} · TP {formatPriceCompact(sc?.tp1)} / {formatPriceCompact(sc?.tp2)} /{' '}
                    {formatPriceCompact(sc?.tp3)}
                  </div>
                  <div className={styles.scenarioMeta}>
                    무효 {formatPriceCompact(sc?.invalidation)} · {sc?.note || '데이터 없음'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.card} data-eagle1-region="falsebreak">
            <div className={styles.panelKicker}>FalseBreakEngine</div>
            <div className={styles.falseGrid}>
              {([fb?.breakout, fb?.breakdown] as const).map((side) =>
                side ? (
                  <div key={side.kind} className={styles.falseCard} data-on={side.active ? '1' : '0'}>
                    <div>{side.labelKo}</div>
                    <strong>{side.kind.replace('_', ' ')}</strong>
                    <MiniOhlc candles={fb?.excerpt ?? []} />
                    <ul>
                      {side.evidence.map((e) => (
                        <li key={e.id} data-hit={e.hit == null ? 'na' : e.hit ? '1' : '0'}>
                          {e.labelKo}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div key="empty" className={styles.falseCard}>
                    데이터 없음
                  </div>
                )
              )}
            </div>
          </div>

          <div className={styles.card} data-eagle1-region="premium">
            <div className={styles.panelKicker}>Premium / Discount</div>
            {prem?.zone === 'NONE' || posPct == null ? (
              <div className={styles.muted}>데이터 없음</div>
            ) : (
              <div className={styles.pdTrack} aria-label="스윙 범위 위치">
                <div className={styles.pdFill} />
                <span className={styles.pdEq}>Equilibrium 50%</span>
                <i className={styles.pdNeedle} style={{ top: `${100 - posPct}%` }} />
                <span className={styles.pdTop}>Premium Zone</span>
                <span className={styles.pdBot}>Discount Zone</span>
              </div>
            )}
            <div className={styles.scenarioMeta}>
              Long fit {prem?.longFit == null ? '데이터 없음' : `${Math.round(prem.longFit)}`} · Short fit{' '}
              {prem?.shortFit == null ? '데이터 없음' : `${Math.round(prem.shortFit)}`}
            </div>
          </div>
        </aside>
      </div>

      <div className={styles.bottom}>
        <article className={styles.card} data-eagle1-region="zone">
          <div className={styles.panelKicker}>Unified Zone</div>
          {inspect ? (
            <div className={styles.muted}>선택 {String(inspect.label || inspect.zoneFaceBase || '')}</div>
          ) : null}
          {zoneCards.length ? (
            zoneCards.map((zoneCard) => (
            <div key={zoneCard.clusterId} className={styles.zoneBlock}>
              <div className={styles.zoneTitle}>{zoneCard.titleKo}</div>
              <div className={styles.zonePx}>
                {formatPriceCompact(zoneCard.lower)} ~ {formatPriceCompact(zoneCard.upper)}
              </div>
              <div className={styles.chips}>
                {zoneCard.sourceLabels.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <dl className={styles.kv}>
                <div>
                  <dt>상태</dt>
                  <dd>{zoneCard.statusKo}</dd>
                </div>
                <div>
                  <dt>{zoneCard.side === 'resist' ? '저항 확률' : '지지 확률'}</dt>
                  <dd>{pctText(zoneCard.holdProbability, zoneCard.sampleSize)}</dd>
                </div>
                <div>
                  <dt>표본</dt>
                  <dd>{zoneCard.sampleSize > 0 ? `${zoneCard.sampleSize.toLocaleString('en-US')} 건` : '데이터 없음'}</dd>
                </div>
                <div>
                  <dt>MFE / MAE</dt>
                  <dd>
                    {rText(zoneCard.mfe, zoneCard.sampleSize)} / {rText(zoneCard.mae, zoneCard.sampleSize)}
                  </dd>
                </div>
                <div>
                  <dt>다음 Target</dt>
                  <dd>{zoneCard.nextTarget}</dd>
                </div>
                <div>
                  <dt>무효</dt>
                  <dd>{zoneCard.invalidation}</dd>
                </div>
              </dl>
            </div>
            ))
          ) : (
            <div className={styles.muted}>데이터 없음</div>
          )}
        </article>

        <article className={styles.card} data-eagle1-region="events">
          <div className={styles.panelKicker}>Structural Event Log</div>
          {events.filter((ev) => ev.kind !== 'SWING').length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events
                  .filter((ev) => ev.kind !== 'SWING')
                  .slice(-8)
                  .reverse()
                  .map((ev, i) => (
                  <tr key={`${ev.kind}-${ev.known_at}-${i}`}>
                    <td>{eventAtLabel(ev)}</td>
                    <td>
                      {ev.kind}
                      {ev.bias === 'bullish' ? ' ↑' : ev.bias === 'bearish' ? ' ↓' : ''}
                    </td>
                    <td>{formatPriceCompact(ev.level || ev.price)}</td>
                    <td>{ev.kind === 'FAILED_BREAK' ? 'FAIL' : 'OK'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.muted}>데이터 없음</div>
          )}
        </article>

        <article className={styles.card} data-eagle1-region="stats">
          <div className={styles.panelKicker}>Historical Outcome Statistics</div>
          <div className={styles.statGrid}>
            <div>
              Total Sample
              <b>{hist?.totalSample ? hist.totalSample.toLocaleString('en-US') : '데이터 없음'}</b>
            </div>
            <div>
              Mean/Median MFE
              <b>
                {rText(hist?.meanMfe ?? null, hist?.totalSample ?? 0)} / {rText(hist?.medianMfe ?? null, hist?.totalSample ?? 0)}
              </b>
            </div>
            <div>
              Mean/Median MAE
              <b>
                {rText(hist?.meanMae ?? null, hist?.totalSample ?? 0)} / {rText(hist?.medianMae ?? null, hist?.totalSample ?? 0)}
              </b>
            </div>
          </div>
          <ul className={styles.reach}>
            {(hist?.reach ?? []).map((row) => (
              <li key={row.pct}>
                <span>{row.label}</span>
                <b>{row.rate == null ? row.note : `${Math.round(row.rate * 100)}%`}</b>
              </li>
            ))}
          </ul>
          <div className={styles.donutRow}>
            <div
              className={styles.donut}
              style={{
                background:
                  hist?.tpBeforeSl == null
                    ? '#1e293b'
                    : `conic-gradient(#22c55e 0 ${Math.round(hist.tpBeforeSl * 360)}deg, #ef4444 ${Math.round(
                        hist.tpBeforeSl * 360
                      )}deg 360deg)`,
              }}
            />
            <div>
              <div>TP-before-SL {pctText(hist?.tpBeforeSl ?? null, hist?.totalSample ?? 0)}</div>
              <div>SL-before-TP {pctText(hist?.slBeforeTp ?? null, hist?.totalSample ?? 0)}</div>
              <div>
                평균 반응시간 {formatReactionTime(hist?.meanReactionSec ?? null, hist?.meanReactionLabel || '데이터 없음')}
              </div>
            </div>
          </div>
        </article>

        <article className={styles.card} data-eagle1-region="risk">
          <div className={styles.panelKicker}>Entry / SL / TP</div>
          {plan ? (
            <dl className={styles.kv}>
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
                <dt>무효</dt>
                <dd>{plan.invalidation || '데이터 없음'}</dd>
              </div>
              <div>
                <dt>RR</dt>
                <dd>{plan.netRr != null ? `1:${plan.netRr.toFixed(2)}` : '통계 부족'}</dd>
              </div>
            </dl>
          ) : (
            <div className={styles.muted}>데이터 없음</div>
          )}
        </article>
      </div>

      {evidence ? (
        <details className={styles.evidence} open={evidenceOpen} onToggle={(e) => setEvidenceOpen((e.target as HTMLDetailsElement).open)}>
          <summary>내부 Evidence (기존 분석기능 유지)</summary>
          <div className={styles.evidenceBody}>{evidence}</div>
        </details>
      ) : null}
    </section>
  );
}
