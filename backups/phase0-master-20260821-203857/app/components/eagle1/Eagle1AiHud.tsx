/**
 * 독수리1호 AI HUD — 1000060795.png layout. Numbers from analyze engines only.
 */
'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { AnalyzeResponse } from '@/types';
import { formatPriceCompact } from '@/lib/eagle1/chartUx';
import { formatSamplePct } from '@/lib/eagle1/noFakeNumbers';
import { formatReactionTime } from '@/lib/eagle1/historicalStatisticsEngine';
import { formatEagle1SnapshotClock } from '@/lib/eagle1/predictionSnapshot';
import { EAGLE1_ENGINE_VERSION } from '@/lib/eagle1/rawTypes';
import { HUD_TRADE_RAIL, HUD_BREAK_RAIL } from '@/lib/eagle1/hudPack';
import { overlayFromEagle1ZoneId } from '@/lib/eagle1/zoneOverlays';
import { heatBarPaint } from '@/lib/eagle1/pressureHeatmap';
import styles from './Eagle1AiHud.module.css';

type Props = {
  analysis: AnalyzeResponse | null;
  selectedZoneId?: string | null;
  symbol?: string;
  timeframe?: string;
  children: ReactNode;
  evidence?: ReactNode;
};

type ViewMode = 'live' | 'research' | 'all';

const VIEW_KEY = 'eagle1-hud-view-v3';

const AVAIL_CHIPS: Array<{ key: keyof NonNullable<AnalyzeResponse['eagle1Availability']>; label: string }> = [
  { key: 'has_orderbook', label: '호가' },
  { key: 'has_cvd', label: 'CVD' },
  { key: 'has_trades', label: '체결' },
  { key: 'has_oi', label: 'OI' },
  { key: 'has_funding', label: '펀딩' },
  { key: 'has_liquidation', label: '청산시리즈' },
];

function readView(): ViewMode {
  if (typeof window === 'undefined') return 'all';
  const v = window.localStorage.getItem(VIEW_KEY);
  if (v === 'live' || v === 'research' || v === 'all') return v;
  return 'all';
}

function railIndex(state: string | undefined): number {
  const s = String(state || '');
  if (s === 'ACCEPTED' || s === 'HOLD') return 4;
  if (s === 'RETEST' || s === 'RETEST_PENDING') return 3;
  if (s === 'CLOSE_CONFIRM') return 2;
  if (s === 'BREAK' || s === 'BODY_BREAK' || s === 'WICK_BREAK' || s === 'WICK') return 1;
  if (s === 'APPROACH' || s === 'TOUCH') return 0;
  return -1;
}

function SemiGauge({ score, label }: { score: number | null; label: string }) {
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const ang = Math.PI * (1 - v / 100);
  const x = 50 + Math.cos(ang) * 38;
  const y = 52 - Math.sin(ang) * 38;
  return (
    <svg className={styles.semiGauge} viewBox="0 0 100 62" aria-hidden>
      <path d="M12 52 A38 38 0 0 1 88 52" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
      <path
        d="M12 52 A38 38 0 0 1 88 52"
        fill="none"
        stroke="url(#e1gm)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * 119} 119`}
      />
      <defs>
        <linearGradient id="e1gm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="55%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <circle cx={x} cy={y} r="4.2" fill="#f8fafc" />
      <text x="50" y="48" textAnchor="middle" fill="#e2e8f0" fontSize="16" fontWeight="800">
        {score == null ? '—' : `${Math.round(score)}%`}
      </text>
      <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="7">
        {label}
      </text>
    </svg>
  );
}

function RingGauge({ score, sub }: { score: number | null; sub: string }) {
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const dash = 2 * Math.PI * 16;
  return (
    <div className={styles.ringWrap}>
      <svg viewBox="0 0 44 44" className={styles.ring}>
        <circle cx="22" cy="22" r="16" fill="none" stroke="#1e293b" strokeWidth="5" />
        <circle
          cx="22"
          cy="22"
          r="16"
          fill="none"
          stroke="#22c55e"
          strokeWidth="5"
          strokeDasharray={`${(v / 100) * dash} ${dash}`}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
        <text x="22" y="25" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontWeight="800">
          {score == null ? '—' : `${Math.round(score)}`}
        </text>
      </svg>
      <span>{sub}</span>
    </div>
  );
}

function MiniOhlc({ candles }: { candles: Array<{ open: number; high: number; low: number; close: number }> }) {
  if (!candles.length) return <div className={styles.muted}>데이터 없음</div>;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const span = Math.max(hi - lo, 1e-9);
  const w = 132;
  const h = 44;
  const slot = (w - 4) / candles.length;
  const bw = Math.max(1.6, slot - 1.2);
  const y = (p: number) => 2 + ((hi - p) / span) * (h - 4);
  return (
    <svg className={styles.miniOhlc} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {candles.map((c, i) => {
        const x = 2 + i * slot;
        const up = c.close >= c.open;
        const color = up ? '#22c55e' : '#ef4444';
        const top = Math.min(y(c.open), y(c.close));
        const body = Math.max(1, Math.abs(y(c.close) - y(c.open)));
        return (
          <g key={i} stroke={color} fill={color}>
            <line x1={x + bw / 2} x2={x + bw / 2} y1={y(c.high)} y2={y(c.low)} strokeWidth="1" />
            <rect x={x} y={top} width={bw} height={body} />
          </g>
        );
      })}
    </svg>
  );
}

export default function Eagle1AiHud({
  analysis,
  selectedZoneId = null,
  symbol = 'BTCUSDT',
  timeframe = '15m',
  children,
  evidence,
}: Props) {
  const [view, setView] = useState<ViewMode>(readView);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const hud = analysis?.eagle1Hud ?? null;
  const acc = analysis?.eagle1Acceptance ?? null;
  const plan = analysis?.eagle1MainPlan ?? null;
  const path = analysis?.eagle1SmartPath ?? plan?.smartPath ?? null;
  const fb = analysis?.eagle1FalseBreak ?? null;
  const hist = analysis?.eagle1HistoricalOutcome ?? null;
  const prem = analysis?.eagle1PremiumDiscount ?? null;
  const zones = analysis?.eagle1UnifiedZones ?? null;
  const sample = plan?.sampleSize ?? hist?.totalSample ?? 0;
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

  const setViewPersist = (m: ViewMode) => {
    setView(m);
    try {
      window.localStorage.setItem(VIEW_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const showLive = view === 'live' || view === 'all';
  const showResearch = view === 'research' || view === 'all';
  const railAt = railIndex(hud?.breakRail.current);
  const tfs = ['1m', '5m', '15m', '1H', '4H', '1D', '1W', '1M'];
  const compassTfs = ['1M', '1W', '1D', '4H', '1H', '15m', '5m', '1m'];
  const posPct = prem?.position != null ? Math.max(0, Math.min(100, prem.position * 100)) : null;
  const dir = plan?.direction;
  const spark = analysis?.eagle1SparkCandles ?? [];
  const px = analysis?.currentPrice ?? spark[spark.length - 1]?.close ?? null;

  return (
    <section className={styles.hud} data-eagle1-desk="structure" data-eagle1-hud="1" data-tone={hud?.marketState.tone ?? 'wait'}>
      <header className={styles.topbar} data-eagle1-region="header">
        <div>
          <h1 className={styles.title}>
            독수리1호 <span className={styles.titleEn}>AI HUD</span>
          </h1>
          <div className={styles.sub}>
            {symbol} PERP · {timeframe} · {EAGLE1_ENGINE_VERSION}
            {px != null ? ` · ${formatPriceCompact(px)}` : ''}
          </div>
          <ul className={styles.avail} aria-label="데이터 가용성">
            {AVAIL_CHIPS.map((chip) => {
              const on = Boolean(analysis?.eagle1Availability?.[chip.key]);
              return (
                <li key={chip.key} data-on={on ? '1' : '0'} title={on ? chip.label : `${chip.label} · 데이터 없음`}>
                  {chip.label}
                </li>
              );
            })}
          </ul>
        </div>
        <div className={styles.tfRow} aria-label="타임프레임">
          {tfs.map((tf) => (
            <span key={tf} data-on={String(timeframe).toLowerCase() === tf.toLowerCase() ? '1' : '0'}>
              {tf}
            </span>
          ))}
        </div>
        <div className={styles.viewSwitch} aria-label="표시 모드">
          {(
            [
              ['live', '실전'],
              ['research', '연구'],
              ['all', '전체'],
            ] as const
          ).map(([id, lab]) => (
            <button key={id} type="button" data-on={view === id ? '1' : '0'} onClick={() => setViewPersist(id)}>
              {lab}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.stageBlock}>
      {showLive && (
        <div className={styles.gauges} data-eagle1-region="gauges">
          <article className={styles.panel}>
            <div className={styles.kicker}>BIG MOVE METER</div>
            <SemiGauge
              score={hud?.bigMove.score ?? null}
              label={
                hud?.bigMove.state === 'NONE'
                  ? '데이터 없음'
                  : `${hud?.bigMove.direction === 'up' ? '↑' : hud?.bigMove.direction === 'down' ? '↓' : ''} ${hud?.bigMove.labelEn ?? ''}`
              }
            />
            <div className={styles.hint}>{hud?.bigMove.note ?? '데이터 없음'}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>MTF COMPASS</div>
            <div className={styles.compass}>
              {(hud?.mtfCompass ?? compassTfs.map((tf) => ({ tf, arrow: '→' as const, bias: 'flat' as const, note: '데이터 없음' }))).map(
                (row) => (
                  <div key={row.tf} data-bias={row.bias} title={row.note}>
                    <b>{row.tf}</b>
                    <strong>{row.arrow}</strong>
                  </div>
                )
              )}
            </div>
            {hud?.compassConflict ? <div className={styles.conflict}>{hud.compassConflict}</div> : null}
          </article>
          <article className={`${styles.panel} ${styles.railPanel}`}>
            <div className={styles.kicker}>
              BREAK RAIL
              <span>{hud?.breakRail.targetEn ?? '데이터 없음'}</span>
            </div>
            <ol className={styles.breakRail}>
              {(hud?.breakRail.steps ?? HUD_BREAK_RAIL).map((lab, i) => (
                <li key={lab} data-on={railAt === i ? '1' : railAt > i ? 'done' : '0'}>
                  {lab}
                </li>
              ))}
            </ol>
            {hud?.breakRail.fail ? <div className={styles.fail}>{hud.breakRail.fail}</div> : null}
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>BATTLE GAUGE</div>
            {hud?.battle.longPct == null ? (
              <div className={styles.muted}>데이터 없음</div>
            ) : (
              <div className={styles.battle}>
                <div className={styles.battleTrack}>
                  <i style={{ height: `${hud.battle.longPct}%` }} />
                </div>
                <div>
                  <b>LONG {hud.battle.longPct}%</b>
                  <span>SHORT {hud.battle.shortPct}%</span>
                  <em>{hud.battle.note}</em>
                </div>
              </div>
            )}
          </article>
        </div>
      )}

      <div className={styles.chartRow} data-eagle1-region="chart">
        <div className={styles.chartStage}>
          {hud?.heat?.length ? (
            <div className={styles.heatBack} aria-hidden>
              {hud.heat.slice(-96).map((h) => {
                const p = heatBarPaint(h.score);
                return <i key={h.time} style={{ background: p.fill, opacity: p.opacity }} />;
              })}
            </div>
          ) : null}
          {children}
        </div>
        {showLive && (
          <aside className={styles.sideStrip}>
            <div className={styles.kicker}>RANGE PRESSURE</div>
            {hud?.rangePressure.length ? (
              <ul className={styles.rangeMap}>
                {hud.rangePressure.map((r) => (
                  <li key={r.price} data-side={r.side}>
                    <i style={{ width: `${Math.round(r.intensity * 100)}%` }} />
                    <span>{formatPriceCompact(r.price)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
            <div className={styles.kicker}>FLOW MOMENTUM</div>
            <div className={styles.flowMom}>
              {analysis?.eagle1MoneyPressure != null
                ? `${analysis.eagle1MoneyPressure.score >= 0 ? '+' : ''}${Math.round(analysis.eagle1MoneyPressure.score)}`
                : '데이터 없음'}
            </div>
          </aside>
        )}
      </div>
      </div>

      <div className={styles.lowerScroll}>
      {showLive && (
        <>
          <div className={styles.planRow} data-eagle1-region="plan">
            <article className={styles.panel}>
              <div className={styles.kicker}>
                TRADE PLAN {dir ?? 'WAIT'} · {hud?.entryZoneState ?? 'WAIT'}
                {plan?.status === 'WAIT' && plan.entryLow != null ? ' · 감시' : ''}
              </div>
              <div className={styles.planGrid}>
                <div>
                  ENTRY
                  <b>
                    {plan?.entryLow != null
                      ? `${formatPriceCompact(plan.entryLow)}~${formatPriceCompact(plan.entryHigh)}`
                      : '데이터 없음'}
                  </b>
                </div>
                <div>
                  STOP
                  <b>{formatPriceCompact(plan?.sl ?? null)}</b>
                </div>
                <div>
                  TP1
                  <b>{formatPriceCompact(plan?.tp1 ?? null)}</b>
                </div>
                <div>
                  TP2
                  <b>{formatPriceCompact(plan?.tp2 ?? null)}</b>
                </div>
                <div>
                  TP3
                  <b>{formatPriceCompact(plan?.tp3 ?? null)}</b>
                </div>
              </div>
              <div className={styles.rr}>
                RR {plan?.netRr != null ? `1 : ${plan.netRr.toFixed(2)}` : '통계 부족'} · 검증확률{' '}
                {formatSamplePct(sample, plan?.calibratedProbability ?? null)}
              </div>
            </article>
            <article className={`${styles.panel} ${styles.statusPanel}`}>
              <div className={styles.kicker}>TRADE STATUS</div>
              <ol className={styles.statusRail}>
                {HUD_TRADE_RAIL.map((step) => (
                  <li key={step} data-on={hud?.tradeStatus.current === step ? '1' : '0'}>
                    {step}
                  </li>
                ))}
              </ol>
              <div className={styles.hint}>{hud?.tradeStatus.note}</div>
            </article>
          </div>

          <div className={styles.statSix} data-eagle1-region="stats">
            <article className={styles.panel}>
              <div className={styles.kicker}>MARKET STATE</div>
              <strong className={styles.stateBig}>{hud?.marketState.labelKo ?? '데이터 없음'}</strong>
            </article>
            <article className={styles.panel}>
              <div className={styles.kicker}>COMPRESSION</div>
              <RingGauge score={hud?.bigMove.compression ?? null} sub={hud?.bigMove.labelKo ?? '데이터 없음'} />
            </article>
            <article className={styles.panel}>
              <div className={styles.kicker}>EXPANSION READINESS</div>
              <div className={styles.bar}>
                <i style={{ width: `${hud?.bigMove.expansionReady ?? 0}%` }} />
              </div>
              <b>{hud?.bigMove.expansionReady == null ? '데이터 없음' : `${hud.bigMove.expansionReady}%`}</b>
            </article>
            <article className={styles.panel}>
              <div className={styles.kicker}>FLOW DIRECTION</div>
              <div className={styles.arrows}>
                {hud?.flowDirection.arrows
                  ? Array.from({ length: hud.flowDirection.arrows }).map((_, i) => <span key={i}>↑</span>)
                  : '—'}
              </div>
              <div>{hud?.flowDirection.labelKo}</div>
            </article>
            <article className={styles.panel}>
              <div className={styles.kicker}>VOLUME FLOW</div>
              <strong>
                {hud?.volumeFlow.value == null
                  ? '데이터 없음'
                  : `${hud.volumeFlow.value >= 0 ? '+' : ''}${hud.volumeFlow.value.toFixed(2)}`}
              </strong>
              <div>{hud?.volumeFlow.labelKo}</div>
            </article>
            <article className={styles.panel}>
              <div className={styles.kicker}>ENTRY QUALITY</div>
              <RingGauge score={hud?.entryQuality.score ?? null} sub={hud?.entryQuality.labelKo ?? '데이터 없음'} />
              <div className={styles.hint}>{hud?.entryQuality.note}</div>
            </article>
          </div>

          <div className={styles.eventStrip} data-eagle1-region="events">
            <div className={styles.kicker}>AI CANDLE EVENTS</div>
            <ol>
              {(hud?.events ?? []).slice(-18).map((ev) => (
                <li key={`${ev.kind}-${ev.index}`} data-kind={ev.kind} title={ev.labelKo}>
                  {ev.icon}
                </li>
              ))}
              {!hud?.events?.length ? <li className={styles.muted}>데이터 없음</li> : null}
            </ol>
          </div>
        </>
      )}

      {showResearch && (
        <div className={styles.research} data-eagle1-region="research">
          <article className={styles.panel}>
            <div className={styles.kicker}>MAIN / ALT / BREAK PATH</div>
            <ul className={styles.miniList}>
              {(hud?.paths ?? []).map((p) => (
                <li key={p.id}>
                  {p.labelEn} {p.text}
                  <em> n={p.sample}</em>
                </li>
              ))}
            </ul>
            <div className={styles.pathPct}>{hud?.pathProbability.text ?? '데이터 없음'}</div>
            <div className={styles.hint}>표본 {hud?.pathProbability.sample ?? 0} · AI score를 확률로 쓰지 않음 · {hud?.paths[0]?.note ?? ''}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>NEXT KEY LEVEL</div>
            <div>저항 {zones?.resist[0] ? `${formatPriceCompact(zones.resist[0].lower)}~${formatPriceCompact(zones.resist[0].upper)}` : '데이터 없음'}</div>
            <div>지지 {zones?.support[0] ? `${formatPriceCompact(zones.support[0].lower)}~${formatPriceCompact(zones.support[0].upper)}` : '데이터 없음'}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>INVALIDATION</div>
            <div>
              {plan?.sl != null
                ? `종가가 ${formatPriceCompact(plan.sl)} ${dir === 'SHORT' ? '위' : '아래'}면 무효`
                : '데이터 없음'}
            </div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>PREDICTION SNAPSHOT</div>
            <div>
              {formatEagle1SnapshotClock(analysis?.eagle1Snapshot?.timestamp)}
            </div>
            <div>{analysis?.eagle1Snapshot?.status ?? '대기'}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>UNIFIED ZONE</div>
            {zones?.support[0] || zones?.resist[0] ? (
              <ul className={styles.miniList}>
                <li>POC/OB/FVG {(zones.support[0] ?? zones.resist[0])?.sourceLabels.join(' · ')}</li>
                <li>홀드 {formatSamplePct((zones.support[0] ?? zones.resist[0])?.sampleSize ?? 0, (zones.support[0] ?? zones.resist[0])?.holdProbability ?? null)}</li>
              </ul>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>FALSE BREAK</div>
            <div>{fb?.labelKo ?? '데이터 없음'}</div>
            <MiniOhlc candles={fb?.excerpt ?? []} />
            <ul className={styles.miniList}>
              {(fb?.breakout.evidence ?? []).slice(0, 4).map((e) => (
                <li key={e.id} data-hit={e.hit == null ? 'na' : e.hit ? '1' : '0'}>
                  {e.labelKo}
                </li>
              ))}
            </ul>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>BREAK QUALITY</div>
            {acc?.breakQualityScore == null ? (
              <div className={styles.muted}>데이터 없음</div>
            ) : (
              <div>
                {Math.round(acc.breakQualityScore)} · {acc.breakQualityNote}
              </div>
            )}
            <ul className={styles.miniList}>
              {(acc?.factors ?? []).slice(0, 8).map((f) => (
                <li key={f.id} data-hit={f.score == null ? 'na' : '1'}>
                  {f.labelKo} · {f.score == null ? f.note || '데이터 없음' : Math.round(f.score)}
                </li>
              ))}
            </ul>
            <div className={styles.hint}>구조 품질 · 확률 아님</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>COMBINATION ENGINE</div>
            {hud?.combination ? (
              <>
                <div>{hud.combination.summaryKo}</div>
                <ul className={styles.miniList}>
                  {hud.combination.hits.map((h) => (
                    <li key={h.id} data-hit={h.promote ? '1' : h.complete ? 'na' : '0'}>
                      {h.labelKo} · n={h.sampleSize} · {h.note}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>FLOW SYNC</div>
            <div>{hud?.flowSync.labelKo ?? '데이터 없음'}</div>
            <div className={styles.hint}>{hud?.flowSync.note}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>15M CLOCK FLOW</div>
            <div>{hud?.clockFlow.labelKo ?? '데이터 없음'}</div>
            <ul className={styles.miniList}>
              <li>15m 이후 {hud?.clockFlow.after15m ?? '데이터 없음'}</li>
              <li>1H 이후 {hud?.clockFlow.after1h ?? '데이터 없음'}</li>
              <li>4H 이후 {hud?.clockFlow.after4h ?? '데이터 없음'}</li>
              <li>10초/30초 {hud?.clockFlow.subMinute ?? '데이터 없음'}</li>
            </ul>
            <div className={styles.hint}>{hud?.clockFlow.note}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>LOB RESILIENCY</div>
            <div>{hud?.lobResiliency.labelKo ?? '데이터 없음'}</div>
            <div className={styles.hint}>{hud?.lobResiliency.note}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>BITGET COVERAGE</div>
            {hud?.coverage?.length ? (
              <ul className={styles.miniList}>
                {hud.coverage.map((c) => (
                  <li key={c.tf}>
                    {c.tf} {c.rows > 0 ? `${c.rows}봉 · 공백 ${c.gaps}` : '데이터 없음'}
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>도식 비교</div>
            {hud?.schematic ? (
              <>
                <div>참고 {hud.schematic.referenceKo}</div>
                <div>현재 {hud.schematic.currentKo}</div>
                <ul className={styles.miniList}>
                  {hud.schematic.features.map((f) => (
                    <li key={f.id} data-hit={f.hit == null ? 'na' : f.hit ? '1' : '0'}>
                      {f.labelKo}
                    </li>
                  ))}
                </ul>
                <div className={styles.hint}>{hud.schematic.note}</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>HISTORICAL OUTCOME</div>
            <ul className={styles.miniList}>
              {(hist?.reach ?? []).slice(0, 6).map((r) => (
                <li key={r.pct}>
                  {r.label} {formatSamplePct(hist?.totalSample ?? 0, r.rate)}
                </li>
              ))}
            </ul>
            <div className={styles.hint}>반응 {formatReactionTime(hist?.meanReactionSec ?? null, hist?.meanReactionLabel || '데이터 없음')}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>PREMIUM / DISCOUNT</div>
            {posPct == null ? (
              <div className={styles.muted}>데이터 없음</div>
            ) : (
              <div className={styles.pd}>
                <i style={{ top: `${100 - posPct}%` }} />
                <span>Premium</span>
                <span>Discount</span>
              </div>
            )}
          </article>
          <article className={styles.panel} data-on={hud?.bigLong.active ? '1' : '0'}>
            <div className={styles.kicker}>BIG LONG 후보</div>
            <ul className={styles.miniList}>
              {(hud?.bigLong.checks ?? []).map((c) => (
                <li key={c.id} data-hit={c.hit == null ? 'na' : c.hit ? '1' : '0'}>
                  {c.labelKo}
                </li>
              ))}
            </ul>
          </article>
          <article className={styles.panel} data-on={hud?.cascadeShort.active ? '1' : '0'}>
            <div className={styles.kicker}>CASCADE SHORT 후보</div>
            <ul className={styles.miniList}>
              {(hud?.cascadeShort.checks ?? []).map((c) => (
                <li key={c.id} data-hit={c.hit == null ? 'na' : c.hit ? '1' : '0'}>
                  {c.labelKo}
                </li>
              ))}
            </ul>
          </article>
          <article className={`${styles.panel} ${styles.summary}`}>
            <div className={styles.kicker}>실시간 신호 요약</div>
            <p>{hud?.summary || acc?.uiLabel || '데이터 없음'}</p>
            {inspect ? <div className={styles.hint}>{inspect.label}</div> : null}
          </article>
        </div>
      )}

      <details className={styles.evidence} open={evidenceOpen} onToggle={(e) => setEvidenceOpen((e.target as HTMLDetailsElement).open)}>
        <summary>내부 Evidence · 기존 엔진 유지</summary>
        <div className={styles.evidenceBody}>{evidence}</div>
      </details>
      </div>
    </section>
  );
}
