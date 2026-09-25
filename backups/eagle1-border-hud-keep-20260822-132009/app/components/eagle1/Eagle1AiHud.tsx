/**
 * 독수리1호 AI HUD — 1000060795.png layout. Numbers from analyze engines only.
 */
'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { AnalyzeResponse } from '@/types';
import { eagle1DecisionKo, formatPriceCompact } from '@/lib/eagle1/chartUx';
import { formatSamplePct } from '@/lib/eagle1/noFakeNumbers';
import { formatReactionTime } from '@/lib/eagle1/historicalStatisticsEngine';
import { formatEagle1SnapshotClock } from '@/lib/eagle1/predictionSnapshot';
import { EAGLE1_ENGINE_VERSION } from '@/lib/eagle1/rawTypes';
import { HUD_TRADE_RAIL, HUD_BREAK_RAIL } from '@/lib/eagle1/hudPack';
import { overlayFromEagle1ZoneId } from '@/lib/eagle1/zoneOverlays';
import { heatBarPaintSafe } from '@/lib/eagle1/heatUnderlayPolicy';
import { eagle1LabelTitleAttr } from '@/lib/eagle1/labelLexicon';
import {
  buildLabelInteractionHandlers,
  labelInteractionPayload,
  LABEL_LONG_PRESS_MS,
} from '@/lib/eagle1/labelInteraction';
import { buildEagle1ChartAlerts } from '@/lib/eagle1/chartAlertCallouts';
import { TIMEFRAMES, normalizeChartTimeframe } from '@/lib/constants';
import styles from './Eagle1AiHud.module.css';

type Props = {
  analysis: AnalyzeResponse | null;
  selectedZoneId?: string | null;
  symbol?: string;
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
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
  { key: 'has_mark', label: '마크' },
  { key: 'has_index', label: '지수' },
];

function readView(): ViewMode {
  if (typeof window === 'undefined') return 'live';
  const v = window.localStorage.getItem(VIEW_KEY);
  if (v === 'live' || v === 'research' || v === 'all') return v;
  return 'live';
}

const SQUEEZE_TRIGGER_STEPS = ['WATCH', 'BUILDUP', 'READY', 'ACTIVE', 'CASCADE'] as const;

function squeezeTriggerIndex(state: string | undefined): number {
  const s = String(state || '');
  if (s === 'CASCADE') return 4;
  if (s === 'SQUEEZE_ACTIVE') return 3;
  if (s === 'TRIGGER_READY') return 2;
  if (s === 'BUILDUP') return 1;
  if (s === 'WATCH') return 0;
  return -1;
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

function ExplainKicker({
  label,
  children,
  onExplain,
}: {
  label: string;
  children?: ReactNode;
  onExplain: (detail: string) => void;
}) {
  const tip = buildLabelInteractionHandlers(label, onExplain).onHoverTitle || eagle1LabelTitleAttr(label);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const activate = (kind: 'click' | 'dblclick' | 'longpress' | 'contextmenu' | 'keyboard') => {
    onExplain(labelInteractionPayload(label, kind).textKo);
  };
  return (
    <div
      className={styles.kicker}
      title={tip}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        activate('click');
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        activate('dblclick');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate('keyboard');
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        activate('contextmenu');
      }}
      onTouchStart={() => {
        clearPress();
        pressTimer.current = setTimeout(() => activate('longpress'), LABEL_LONG_PRESS_MS);
      }}
      onTouchEnd={clearPress}
      onTouchCancel={clearPress}
    >
      {label}
      {children}
    </div>
  );
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
  onTimeframeChange,
  children,
  evidence,
}: Props) {
  const [view, setView] = useState<ViewMode>(readView);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [explainKo, setExplainKo] = useState<string | null>(null);
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
  const tfs = TIMEFRAMES.filter((tf) => tf !== '1Y');
  const compassTfs = ['1M', '1W', '1D', '4H', '1H', '15m', '5m', '1m'];
  const posPct = prem?.position != null ? Math.max(0, Math.min(100, prem.position * 100)) : null;
  const dir = plan?.direction;
  const decisionKo = plan ? eagle1DecisionKo(plan.status) : '대기';
  const decisionTone =
    plan?.status === 'CONFIRMED_LONG' || plan?.status === 'LONG_WATCH'
      ? 'long'
      : plan?.status === 'CONFIRMED_SHORT' || plan?.status === 'SHORT_WATCH'
        ? 'short'
        : 'wait';
  const spark = analysis?.eagle1SparkCandles ?? [];
  const px = analysis?.currentPrice ?? spark[spark.length - 1]?.close ?? null;
  const chartAlerts = useMemo(
    () =>
      buildEagle1ChartAlerts({
        squeeze: hud?.squeezeRadar ?? null,
        falseBreak: analysis?.eagle1FalseBreak ?? null,
        hud: hud
          ? { breakRail: hud.breakRail, bigLong: hud.bigLong, cascadeShort: hud.cascadeShort }
          : null,
        lastClose: px,
      }).filter((a) => a.id !== 'fake-break' && a.id !== 'retest-fail'),
    [hud, analysis?.eagle1FalseBreak, px]
  );

  return (
    <section className={styles.hud} data-eagle1-desk="structure" data-eagle1-hud="1" data-tone={hud?.marketState.tone ?? 'wait'}>
      <header className={styles.topbar} data-eagle1-region="header">
        <div>
          <h1 className={styles.title}>
            독수리 1호 <span className={styles.titleEn}>AI FUTURES SYSTEM</span>
            <span className={styles.liveBadge} data-on="1">
              LIVE
            </span>
          </h1>
          <div className={styles.sub}>
            BITGET {symbol} PERP
            {px != null ? (
              <>
                {' · '}
                <strong className={styles.priceHero}>{formatPriceCompact(px)}</strong>
              </>
            ) : null}
            {' · '}
            {timeframe} · {EAGLE1_ENGINE_VERSION}
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
          {tfs.map((tf) => {
            const on = String(timeframe).toLowerCase() === tf.toLowerCase();
            return (
              <button
                key={tf}
                type="button"
                data-on={on ? '1' : '0'}
                disabled={!onTimeframeChange}
                title={`${tf} 캔들 전환 · 봉 개수는 기존 설정 유지`}
                onClick={() => {
                  if (!onTimeframeChange) return;
                  const next = normalizeChartTimeframe(tf) || tf;
                  if (String(timeframe).toLowerCase() === String(next).toLowerCase()) return;
                  onTimeframeChange(next);
                }}
              >
                {tf}
              </button>
            );
          })}
        </div>
        <div className={styles.viewSwitch} aria-label="표시 모드">
          {(
            [
              ['live', 'PRACTICAL'],
              ['research', 'RESEARCH'],
              ['all', 'ALL'],
            ] as const
          ).map(([id, lab]) => (
            <button key={id} type="button" data-on={view === id ? '1' : '0'} onClick={() => setViewPersist(id)}>
              {lab}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.decisionBar} data-eagle1-region="decision" data-tone={decisionTone}>
        <button
          type="button"
          className={styles.decisionDir}
          onClick={() => setExplainKo(labelInteractionPayload(dir ?? decisionKo, 'click').textKo)}
        >
          <span className={styles.decisionKicker}>방향</span>
          <strong>{decisionKo}</strong>
          <em>{dir ?? 'WAIT'}</em>
        </button>
        <button
          type="button"
          className={styles.decisionEntry}
          onClick={() => setExplainKo(labelInteractionPayload('ENTRY', 'click').textKo)}
        >
          <span className={styles.decisionKicker}>타점 ENTRY</span>
          <strong>
            {plan?.entryLow != null
              ? `${formatPriceCompact(plan.entryLow)} ~ ${formatPriceCompact(plan.entryHigh)}`
              : '데이터 없음'}
          </strong>
        </button>
        <button
          type="button"
          className={styles.decisionSl}
          onClick={() => setExplainKo(labelInteractionPayload('STOP', 'click').textKo)}
        >
          <span className={styles.decisionKicker}>손절 STOP</span>
          <strong>{formatPriceCompact(plan?.sl ?? null)}</strong>
        </button>
        <button
          type="button"
          className={styles.decisionTp}
          onClick={() => setExplainKo(labelInteractionPayload('TP1', 'click').textKo)}
        >
          <span className={styles.decisionKicker}>목표 TP</span>
          <strong>
            {[plan?.tp1, plan?.tp2, plan?.tp3]
              .filter((p) => p != null)
              .map((p) => formatPriceCompact(p))
              .join(' / ') || '데이터 없음'}
          </strong>
        </button>
        <button
          type="button"
          className={styles.decisionRr}
          onClick={() => setExplainKo('손익비(RR) · 위험에 비해 목표가 얼마나인지 · 확정 수익 아님')}
        >
          <span className={styles.decisionKicker}>RR</span>
          <strong>{plan?.netRr != null ? `1:${plan.netRr.toFixed(2)}` : '통계 부족'}</strong>
        </button>
      </div>

      <div className={styles.stageBlock}>
      {showLive && (
        <div className={styles.gauges} data-eagle1-region="gauges">
          <article className={styles.panel}>
            <ExplainKicker label="BIG MOVE METER" onExplain={setExplainKo} />
            <SemiGauge
              score={hud?.bigMove.score ?? null}
              label={
                hud?.bigMove.state === 'NONE'
                  ? '데이터 없음'
                  : `${hud?.bigMove.direction === 'up' ? '↑' : hud?.bigMove.direction === 'down' ? '↓' : ''} ${hud?.bigMove.labelEn ?? ''}`
              }
            />
            <div className={styles.hint}>{hud?.bigMove.note ?? '큰 움직임 준비도'}</div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="MTF COMPASS" onExplain={setExplainKo} />
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
            <ExplainKicker label="BREAK RAIL" onExplain={setExplainKo}>
              <span>{hud?.breakRail.targetEn ?? 'STRUCTURE ACCEPTANCE'}</span>
            </ExplainKicker>
            <ol className={styles.breakRail}>
              {(hud?.breakRail.steps ?? HUD_BREAK_RAIL).map((lab, i) => (
                <li key={lab} data-on={railAt === i ? '1' : railAt > i ? 'done' : '0'}>
                  {lab}
                </li>
              ))}
            </ol>
            {hud?.breakRail.fail ? <div className={styles.fail}>{hud.breakRail.fail}</div> : null}
            {!hud?.breakRail.fail && hud?.breakRail.current ? (
              <div className={styles.hint}>현재 상태: {hud.breakRail.current}</div>
            ) : null}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="FLOW SYNC" onExplain={setExplainKo} />
            <strong className={styles.stateBig}>{hud?.flowSync?.labelKo ?? '데이터 없음'}</strong>
            <div className={styles.hint}>{hud?.flowSync?.note ?? 'Bitget cross-market'}</div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="CLOCK FLOW" onExplain={setExplainKo} />
            <strong className={styles.stateBig}>{hud?.clockFlow?.labelKo ?? '데이터 없음'}</strong>
            <div className={styles.hint}>
              {hud?.clockFlow?.slot ? `UTC :${hud.clockFlow.slot}` : ''}
              {hud?.clockFlow?.note ? ` · ${hud.clockFlow.note}` : ''}
            </div>
          </article>
        </div>
      )}

      <div className={styles.chartRow} data-eagle1-region="chart">
        <div className={styles.chartCol}>
          <div className={styles.chartStage} data-eagle1-chart-fs-root="stage">
            <button
              type="button"
              className={styles.chartFsChip}
              data-eagle1-fs-chip="stage"
              title="차트 전체화면"
              onClick={() => {
                const strip = document.querySelector(
                  '[data-eagle1-fs-chip="strip"]'
                ) as HTMLButtonElement | null;
                if (strip) {
                  strip.click();
                  return;
                }
                const col =
                  (document.querySelector(
                    '[data-eagle1-chart-fs-root="1"]'
                  ) as HTMLElement | null) ||
                  (document.querySelector(
                    '[data-eagle1-chart-fs-root]'
                  ) as HTMLElement | null);
                if (!col) return;
                const CSS_FS = 'is-css-chart-fullscreen';
                const on = !col.classList.contains(CSS_FS);
                if (document.fullscreenElement) {
                  void document.exitFullscreen().catch(() => undefined);
                }
                col.classList.toggle(CSS_FS, on);
                col.setAttribute('data-eagle1-chart-fs-root', '1');
                document.documentElement.classList.toggle('eagle1-chart-fs-active', on);
                window.dispatchEvent(new Event('resize'));
              }}
            >
              ⛶ 전체화면
            </button>
            {hud?.heat?.length ? (
              <div className={styles.heatBack} aria-hidden title="수급 히트 · 캔들 가림 없음">
                {hud.heat.slice(-96).map((h) => {
                  const p = heatBarPaintSafe(h.score);
                  return <i key={h.time} style={{ background: p.fill, opacity: p.opacity }} />;
                })}
              </div>
            ) : null}
            {children}
            {showLive && chartAlerts.length > 0 ? (
              <div className={styles.chartAlerts} data-eagle1-region="chart-alerts" aria-label="차트 알림">
                {chartAlerts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={styles.chartAlert}
                    data-tone={a.tone}
                    title={a.ko}
                    onClick={() => setExplainKo(`${a.en} · ${a.ko} · 확정 수익 아님`)}
                  >
                    <b>{a.en}</b>
                    <span>{a.ko}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {showLive && (
            <div className={styles.microStrip} data-eagle1-region="micro">
              {(
                [
                  {
                    key: 'CVD',
                    label: 'CVD',
                    text:
                      hud?.orderFlow?.channels?.find((c) => c.key === 'cvd')?.valueText ??
                      (analysis?.eagle1Availability?.has_cvd ? '수집중' : '데이터 없음'),
                    on: Boolean(hud?.orderFlow?.channels?.find((c) => c.key === 'cvd')?.available),
                  },
                  {
                    key: 'OFI',
                    label: 'OFI',
                    text:
                      hud?.orderFlow?.channels?.find((c) => c.key === 'ofi')?.valueText ??
                      (analysis?.eagle1Availability?.has_trades ? '수집중' : '데이터 없음'),
                    on: Boolean(hud?.orderFlow?.channels?.find((c) => c.key === 'ofi')?.available),
                  },
                  {
                    key: 'LOB',
                    label: 'ORDERBOOK',
                    text:
                      hud?.orderFlow?.channels?.find((c) => c.key === 'lob')?.valueText ??
                      (analysis?.eagle1Availability?.has_orderbook ? '호가' : '데이터 없음'),
                    on: Boolean(hud?.orderFlow?.channels?.find((c) => c.key === 'lob')?.available),
                  },
                  {
                    key: 'OI',
                    label: 'OI',
                    text:
                      hud?.orderFlow?.channels?.find((c) => c.key === 'oi')?.valueText ??
                      (analysis?.eagle1Availability?.has_oi ? '시리즈' : '데이터 없음'),
                    on: Boolean(hud?.orderFlow?.channels?.find((c) => c.key === 'oi')?.available),
                  },
                ] as const
              ).map((row) => (
                <article key={row.key} className={styles.microCell} data-on={row.on ? '1' : '0'}>
                  <ExplainKicker label={row.label} onExplain={setExplainKo} />
                  <strong>{row.text}</strong>
                  <div className={styles.microBars} aria-hidden>
                    {(spark.length ? spark.slice(-24) : []).map((c, i) => (
                      <i
                        key={`${row.key}-${c.time ?? i}`}
                        style={{
                          height: `${Math.max(8, Math.min(100, Math.abs(((c.close - c.open) / Math.max(c.high - c.low, 1e-9)) * 100)))}%`,
                          background: c.close >= c.open ? 'var(--e1-green)' : 'var(--e1-red)',
                        }}
                      />
                    ))}
                    {!spark.length ? <span className={styles.muted}>—</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        {showLive && (
          <aside className={styles.squeezeSide} data-eagle1-region="squeeze-side">
            <ExplainKicker label="SQUEEZE RADAR" onExplain={setExplainKo} />
            <div className={styles.squeezeDual}>
              <div className={styles.squeezeLane} data-side="LONG">
                <SemiGauge
                  score={hud?.squeezeRadar?.long.score ?? null}
                  label={hud?.squeezeRadar?.long.labelEn ?? 'LONG'}
                />
                <div className={styles.hint}>{hud?.squeezeRadar?.long.labelKo ?? '데이터 없음'}</div>
              </div>
              <div className={styles.squeezeLane} data-side="SHORT">
                <SemiGauge
                  score={hud?.squeezeRadar?.short.score ?? null}
                  label={hud?.squeezeRadar?.short.labelEn ?? 'SHORT'}
                />
                <div className={styles.hint}>{hud?.squeezeRadar?.short.labelKo ?? '데이터 없음'}</div>
              </div>
            </div>
            <div className={styles.kicker}>TRIGGER · {hud?.squeezeRadar?.activeSide ?? 'WAIT'}</div>
            <ol className={styles.triggerRail}>
              {SQUEEZE_TRIGGER_STEPS.map((lab, i) => {
                const active = hud?.squeezeRadar?.activeSide === 'LONG' ? hud.squeezeRadar.long : hud?.squeezeRadar?.short;
                const at = squeezeTriggerIndex(active?.state);
                return (
                  <li key={lab} data-on={at === i ? '1' : at > i ? 'done' : '0'}>
                    {lab}
                  </li>
                );
              })}
            </ol>
            <div className={styles.kicker}>점수 · AI ≠ 검증확률</div>
            <div className={styles.scoreBars}>
              <div>
                <span>AI SCORE</span>
                <b>{hud?.scoreCalibration?.aiScore ?? '데이터 없음'}</b>
                <i style={{ width: `${Math.max(0, Math.min(100, hud?.scoreCalibration?.aiScore ?? 0))}%` }} />
              </div>
              <div>
                <span>{hud?.scoreCalibration?.calibratedLabelKo ?? '검증확률'}</span>
                <b>{hud?.scoreCalibration?.calibratedText ?? '데이터 없음'}</b>
              </div>
            </div>
            <div className={styles.totalScore}>
              TOTAL
              <strong>
                {hud?.squeezeRadar?.activeSide === 'SHORT'
                  ? hud.squeezeRadar.short.score ?? '—'
                  : hud?.squeezeRadar?.long.score ?? hud?.squeezeRadar?.short.score ?? '—'}
                <em>/100</em>
              </strong>
            </div>
            <div className={styles.kicker}>핵심 정보</div>
            <ul className={styles.keyFacts}>
              <li>
                MARK <b>{analysis?.eagle1Availability?.has_mark ? '수집됨' : '데이터 없음'}</b>
              </li>
              <li>
                INDEX <b>{analysis?.eagle1Availability?.has_index ? '수집됨' : '데이터 없음'}</b>
              </li>
              <li>
                OI <b>{analysis?.eagle1Availability?.has_oi ? '시리즈' : '데이터 없음'}</b>
              </li>
              <li>
                FUNDING <b>{analysis?.eagle1Availability?.has_funding ? '시리즈' : '데이터 없음'}</b>
              </li>
              <li>
                ORDER FLOW <b>{hud?.orderFlow?.summaryKo ?? '데이터 없음'}</b>
              </li>
            </ul>
            <div className={styles.positionFlat} data-flat={plan?.status === 'WAIT' || !dir ? '1' : '0'}>
              <ExplainKicker label="POSITION STATUS" onExplain={setExplainKo} />
              <strong>{plan?.status === 'WAIT' || !dir ? 'FLAT' : dir}</strong>
              <span>{plan?.status === 'WAIT' || !dir ? '대기 중' : hud?.tradeStatus.current ?? plan?.status}</span>
            </div>
          </aside>
        )}
      </div>
      </div>

      <div className={styles.lowerScroll}>
      {showLive && (
        <>
          <div className={styles.planRow} data-eagle1-region="plan">
            <article className={`${styles.panel} ${styles.tradePlanHero}`} data-dir={dir ?? 'WAIT'}>
              <ExplainKicker
                label={`TRADE PLAN ${dir ?? 'WAIT'}${
                  hud?.tradeOpportunity?.grade ? ` · ${hud.tradeOpportunity.grade}` : ''
                }${plan?.status === 'WAIT' && plan.entryLow != null ? ' · 감시' : ''}`}
                onExplain={setExplainKo}
              />
              <div className={styles.planGrade}>
                {hud?.tradeOpportunity?.grade ?? (dir === 'LONG' || dir === 'SHORT' ? `${dir} ZONE` : 'WAIT')}
              </div>
              <div className={styles.planGrid}>
                <div
                  title={eagle1LabelTitleAttr('ENTRY')}
                  onClick={() => setExplainKo(labelInteractionPayload('ENTRY', 'click').textKo)}
                  onDoubleClick={() => setExplainKo(labelInteractionPayload('ENTRY', 'dblclick').textKo)}
                >
                  ENTRY
                  <b>
                    {plan?.entryLow != null
                      ? `${formatPriceCompact(plan.entryLow)}~${formatPriceCompact(plan.entryHigh)}`
                      : '데이터 없음'}
                  </b>
                </div>
                <div
                  title={eagle1LabelTitleAttr('STOP')}
                  onClick={() => setExplainKo(labelInteractionPayload('STOP', 'click').textKo)}
                >
                  STOP
                  <b>{formatPriceCompact(plan?.sl ?? null)}</b>
                </div>
                <div
                  title={eagle1LabelTitleAttr('TP1')}
                  onClick={() => setExplainKo(labelInteractionPayload('TP1', 'click').textKo)}
                >
                  TP1
                  <b>{formatPriceCompact(plan?.tp1 ?? null)}</b>
                </div>
                <div
                  title={eagle1LabelTitleAttr('TP2')}
                  onClick={() => setExplainKo(labelInteractionPayload('TP2', 'click').textKo)}
                >
                  TP2
                  <b>{formatPriceCompact(plan?.tp2 ?? null)}</b>
                </div>
                <div
                  title={eagle1LabelTitleAttr('TP3')}
                  onClick={() => setExplainKo(labelInteractionPayload('TP3', 'click').textKo)}
                >
                  TP3
                  <b>{formatPriceCompact(plan?.tp3 ?? null)}</b>
                </div>
              </div>
              <div className={styles.rr}>
                RR {plan?.netRr != null ? `1 : ${plan.netRr.toFixed(2)}` : '통계 부족'}
                {hud?.positionSize?.units != null
                  ? ` · SIZE ${hud.positionSize.units.toFixed(4)}u`
                  : ''}
              </div>
              <div className={styles.hint}>
                AI 점수 {hud?.scoreCalibration?.aiScore ?? plan?.aiScore ?? '데이터 없음'}
                {' · '}
                {hud?.scoreCalibration?.calibratedLabelKo ?? '검증확률'}{' '}
                {hud?.scoreCalibration?.calibratedText ??
                  formatSamplePct(sample, plan?.calibratedProbability ?? null)}
                {hud?.scoreCalibration?.oodFlagged ? ' · OOD→WAIT' : ''}
                {' · 확정 수익 아님'}
              </div>
            </article>
            <article className={`${styles.panel} ${styles.statusPanel}`}>
              <ExplainKicker label="TRADE STATUS" onExplain={setExplainKo} />
              <ol className={styles.statusRail}>
                {HUD_TRADE_RAIL.map((step) => (
                  <li key={step} data-on={hud?.tradeStatus.current === step ? '1' : '0'}>
                    {step}
                  </li>
                ))}
              </ol>
              <div className={styles.hint}>{hud?.tradeStatus.note}</div>
              {hud?.positionManagement ? (
                <div className={styles.hint}>
                  PM {hud.positionManagement.summaryKo}
                  {hud.positionManagement.failClosedHoldingTargets ? ' · FAIL TP보유' : ''}
                  {' · '}
                  무조건BE금지
                </div>
              ) : null}
              <div className={styles.hint}>{hud?.executionLevels?.summaryKo ?? ''}</div>
            </article>
          </div>

          <div className={styles.statSix} data-eagle1-region="stats">
            <article className={styles.panel}>
              <ExplainKicker label="MARKET STATE" onExplain={setExplainKo} />
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
              <ExplainKicker label="ENTRY QUALITY" onExplain={setExplainKo} />
              <RingGauge score={hud?.entryQuality.score ?? null} sub={hud?.entryQuality.labelKo ?? '데이터 없음'} />
              <div className={styles.hint}>{hud?.entryQuality.note}</div>
            </article>
          </div>

          <div className={styles.eventStrip} data-eagle1-region="events">
            <div className={styles.kicker}>AI CANDLE EVENTS</div>
            <ol>
              {(hud?.candleEvidence?.marks ?? hud?.events ?? []).slice(-18).map((ev) => {
                const icon =
                  'chartIcon' in ev ? String(ev.chartIcon ?? '') : 'icon' in ev ? String(ev.icon ?? '') : '';
                return (
                  <li
                    key={`${icon}-${ev.index}-${ev.kind}`}
                    data-kind={ev.kind}
                    title={'labelEn' in ev ? `${ev.labelEn} · ${ev.labelKo}` : ev.labelKo}
                  >
                    {icon || '·'}
                  </li>
                );
              })}
              {!(hud?.candleEvidence?.marks?.length || hud?.events?.length) ? (
                <li className={styles.muted}>데이터 없음</li>
              ) : null}
            </ol>
            {hud?.candleEvidence ? (
              <div className={styles.hint}>
                {hud.candleEvidence.summaryKo} ·{' '}
                {hud.candleEvidence.iconLegend.map((x) => `${x.chartIcon}${x.labelEn}`).join(' ')}
              </div>
            ) : null}
          </div>

          <div className={styles.statSix} data-eagle1-region="live-patches">
            <article className={styles.panel}>
              <ExplainKicker label="TRADE OPPORTUNITY" onExplain={setExplainKo} />
              <strong className={styles.stateBig}>
                {hud?.tradeOpportunity?.grade ?? '데이터 없음'}
              </strong>
              <div className={styles.hint}>
                {hud?.tradeOpportunity?.note ?? hud?.tradeOpportunity?.labelKo ?? '데이터 없음'}
              </div>
            </article>
            <article className={styles.panel}>
              <ExplainKicker label="POSITION SIZE" onExplain={setExplainKo} />
              <strong>
                {hud?.positionSize?.units != null ? `${hud.positionSize.units.toFixed(4)} u` : '데이터 없음'}
              </strong>
              <div className={styles.hint}>{hud?.positionSize?.note ?? ''}</div>
            </article>
            <article className={styles.panel}>
              <div className={styles.kicker}>OVERLAY BUDGET</div>
              <div className={styles.hint}>{hud?.overlayBudget?.summaryKo ?? '데이터 없음'}</div>
            </article>
          </div>
        </>
      )}

      {showResearch && (
        <div className={styles.research} data-eagle1-region="research">
          <article className={styles.panel}>
            <div className={styles.kicker}>MAIN / ALT / BREAK PATH</div>
            <ul className={styles.miniList}>
              {(hud?.smartFuturePath?.cluster ?? []).length
                ? hud!.smartFuturePath!.cluster.map((p) => (
                    <li key={p.id} data-hit={p.uiState === 'ON_TRACK' ? '1' : p.uiState === 'INVALID' ? '0' : 'na'}>
                      {p.id} · {p.uiState} · {p.note}
                    </li>
                  ))
                : (hud?.paths ?? []).map((p) => (
                    <li key={p.id}>
                      {p.labelEn} {p.text}
                      <em> n={p.sample}</em>
                    </li>
                  ))}
            </ul>
            <div className={styles.pathPct}>{hud?.pathProbability.text ?? '데이터 없음'}</div>
            <div className={styles.hint}>
              {hud?.smartFuturePath?.summaryKo ?? '표본 기반 · 임의 점선 금지'} · 표본{' '}
              {hud?.pathProbability.sample ?? 0}
            </div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="ORDER FLOW" onExplain={setExplainKo} />
            {hud?.orderFlow ? (
              <>
                <div>{hud.orderFlow.summaryKo}</div>
                <ul className={styles.miniList}>
                  {hud.orderFlow.channels.map((c) => (
                    <li key={c.key} data-hit={c.available ? '1' : c.stale ? '0' : 'na'}>
                      {c.labelKo} · {c.valueText}
                      {c.stale ? ' · stale' : ''}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="PROFILE LEVELS" onExplain={setExplainKo} />
            {hud?.profileLevels ? (
              <>
                <div>{hud.profileLevels.summaryKo}</div>
                <ul className={styles.miniList}>
                  {hud.profileLevels.rows.slice(0, 6).map((r) => (
                    <li key={`${r.kind}-${r.price}`}>
                      {r.labelKo} · {formatPriceCompact(r.price)}
                    </li>
                  ))}
                </ul>
                <div className={styles.hint}>{hud.profileLevels.practicalCapNote}</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="LIQUIDITY DEFENSE" onExplain={setExplainKo} />
            {hud?.liquidityDefense ? (
              <>
                <div>{hud.liquidityDefense.summaryKo}</div>
                <ul className={styles.miniList}>
                  <li>
                    BID {hud.liquidityDefense.bidDefense.real ? hud.liquidityDefense.bidDefense.note : '데이터 없음'}
                  </li>
                  <li>
                    ASK {hud.liquidityDefense.askDefense.real ? hud.liquidityDefense.askDefense.note : '데이터 없음'}
                  </li>
                  <li>압력 {hud.liquidityDefense.pressureMigration}</li>
                  {hud.liquidityDefense.vacuumCorridor ? (
                    <li>
                      Vacuum {formatPriceCompact(hud.liquidityDefense.vacuumCorridor.lower)}~
                      {formatPriceCompact(hud.liquidityDefense.vacuumCorridor.upper)}
                    </li>
                  ) : null}
                </ul>
                <div className={styles.hint}>확정 기관 문구 금지</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="WALK-FORWARD" onExplain={setExplainKo} />
            {hud?.costAwareWalkForward ? (
              <>
                <div>{hud.costAwareWalkForward.summaryKo}</div>
                <ul className={styles.miniList}>
                  <li>{hud.costAwareWalkForward.note}</li>
                  <li>
                    fee {hud.costAwareWalkForward.costs.feeMode} · shuffle 금지 · holdout 가중 미사용
                  </li>
                </ul>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>NEXT KEY LEVEL</div>
            <div>저항 {zones?.resist[0] ? `${formatPriceCompact(zones.resist[0].lower)}~${formatPriceCompact(zones.resist[0].upper)}` : '데이터 없음'}</div>
            <div>지지 {zones?.support[0] ? `${formatPriceCompact(zones.support[0].lower)}~${formatPriceCompact(zones.support[0].upper)}` : '데이터 없음'}</div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="INVALIDATION" onExplain={setExplainKo} />
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
            <ExplainKicker label="SQUEEZE RADAR" onExplain={setExplainKo} />
            {hud?.squeezeRadar ? (
              <>
                <div title={eagle1LabelTitleAttr(hud.squeezeRadar.chartTag ?? 'SQUEEZE')}>
                  {hud.squeezeRadar.summaryKo}
                </div>
                <ul className={styles.miniList}>
                  <li data-hit={hud.squeezeRadar.long.state !== 'NONE' ? '1' : '0'}>
                    LONG · {hud.squeezeRadar.long.labelEn} · {hud.squeezeRadar.long.labelKo}
                    {hud.squeezeRadar.long.score != null ? ` · ${hud.squeezeRadar.long.score}` : ''}
                  </li>
                  <li data-hit={hud.squeezeRadar.short.state !== 'NONE' ? '1' : '0'}>
                    SHORT · {hud.squeezeRadar.short.labelEn} · {hud.squeezeRadar.short.labelKo}
                    {hud.squeezeRadar.short.score != null ? ` · ${hud.squeezeRadar.short.score}` : ''}
                  </li>
                  <li>차트태그 {hud.squeezeRadar.chartTag ?? '데이터 없음'}</li>
                </ul>
                <div className={styles.hint}>{hud.squeezeRadar.bigMove.labelKo} · 확률 아님</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="LIQ ZONE" onExplain={setExplainKo} />
            {hud?.liqZones ? (
              <>
                <div>{hud.liqZones.summaryKo}</div>
                <ul className={styles.miniList}>
                  {hud.liqZones.longLiq ? (
                    <li data-hit={hud.liqZones.longLiq.active ? '1' : 'na'}>
                      {hud.liqZones.longLiq.labelEn} · {hud.liqZones.longLiq.note}
                    </li>
                  ) : (
                    <li data-hit="0">LONG LIQ ZONE · 데이터 없음</li>
                  )}
                  {hud.liqZones.shortLiq ? (
                    <li data-hit={hud.liqZones.shortLiq.active ? '1' : 'na'}>
                      {hud.liqZones.shortLiq.labelEn} · {hud.liqZones.shortLiq.note}
                    </li>
                  ) : (
                    <li data-hit="0">SHORT LIQ ZONE · 데이터 없음</li>
                  )}
                </ul>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="SCORE SPLIT" onExplain={setExplainKo} />
            {hud?.scoreCalibration ? (
              <>
                <div>{hud.scoreCalibration.summaryKo}</div>
                <ul className={styles.miniList}>
                  <li>
                    AI · {hud.scoreCalibration.aiScore ?? '데이터 없음'} · {hud.scoreCalibration.aiScoreNote}
                  </li>
                  <li data-hit={hud.scoreCalibration.calibratedLabelKo === '검증확률' ? '1' : 'na'}>
                    {hud.scoreCalibration.calibratedLabelKo} · {hud.scoreCalibration.calibratedText}
                  </li>
                  <li data-hit={hud.scoreCalibration.oodFlagged ? '0' : '1'}>
                    OOD {hud.scoreCalibration.oodFlagged ? 'YES' : 'NO'} · {hud.scoreCalibration.oodNote}
                  </li>
                </ul>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="POSITION SIZE" onExplain={setExplainKo} />
            {hud?.positionSize ? (
              <>
                <div>
                  {hud.positionSize.units != null
                    ? `${hud.positionSize.units.toFixed(4)} u`
                    : '데이터 없음'}
                </div>
                <ul className={styles.miniList}>
                  <li>
                    위험 {hud.positionSize.riskPct}% · equity {hud.positionSize.equity}
                  </li>
                  <li>레버리지 선결정 금지</li>
                </ul>
                <div className={styles.hint}>{hud.positionSize.note}</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="HTF HISTORY" onExplain={setExplainKo} />
            {hud?.htfHistorical ? (
              <>
                <div>{hud.htfHistorical.summaryKo}</div>
                <ul className={styles.miniList}>
                  {hud.htfHistorical.rows
                    .filter((r) => ['1M', '1W', '1D', '4H'].includes(r.tf))
                    .map((r) => (
                      <li key={r.tf} data-hit={r.status === 'ok' ? '1' : 'na'}>
                        {r.tf} · {r.status} · {r.note}
                      </li>
                    ))}
                </ul>
                {hud.htfHistorical.blockConfirmedHint ? (
                  <div className={styles.hint}>상위 TF 부족 · 확정 제한 힌트</div>
                ) : null}
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="EXECUTION LEVELS" onExplain={setExplainKo} />
            {hud?.executionLevels ? (
              <>
                <div>{hud.executionLevels.summaryKo}</div>
                <ul className={styles.miniList}>
                  <li data-hit={hud.executionLevels.entry.allowEntry ? '1' : '0'}>
                    MAIN ENTRY · {hud.executionLevels.entry.note}
                  </li>
                  <li>
                    STOP · {hud.executionLevels.stop.executableSl ?? '데이터 없음'} ·{' '}
                    {hud.executionLevels.stop.note}
                  </li>
                  {hud.executionLevels.target.levels.map((lv) => (
                    <li key={lv.id}>
                      {lv.id} · {lv.price ?? '데이터 없음'} · {lv.reason}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="COMBINATION MINING" onExplain={setExplainKo} />
            {hud?.combinationMining ? (
              <>
                <div>{hud.combinationMining.summaryKo}</div>
                <ul className={styles.miniList}>
                  {hud.combinationMining.rows.slice(0, 5).map((r) => (
                    <li key={`${r.family}-${r.regime}`} data-hit={r.statLabel === 'ok' ? '1' : 'na'}>
                      {r.family}/{r.regime} · n={r.sampleSize} · {r.statLabel}
                    </li>
                  ))}
                </ul>
                <div className={styles.hint}>{hud.combinationMining.combinationSummaryKo}</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="TRADE OPPORTUNITY" onExplain={setExplainKo} />
            {hud?.tradeOpportunity ? (
              <>
                <div title={eagle1LabelTitleAttr(hud.tradeOpportunity.labelEn)}>
                  {hud.tradeOpportunity.labelEn} · {hud.tradeOpportunity.labelKo}
                </div>
                <ul className={styles.miniList}>
                  <li data-hit={hud.tradeOpportunity.allowEntry ? '1' : '0'}>
                    진입 {hud.tradeOpportunity.allowEntry ? '허용' : '불가'} ·{' '}
                    {hud.tradeOpportunity.direction ?? 'WAIT'}
                  </li>
                </ul>
                <div className={styles.hint}>{hud.tradeOpportunity.note}</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="STRATEGY FUSION" onExplain={setExplainKo} />
            {hud?.legendaryFusion ? (
              <>
                <div title={eagle1LabelTitleAttr(hud.legendaryFusion.labelEn)}>
                  {hud.legendaryFusion.chartTag ?? 'NONE'} · {hud.legendaryFusion.labelKo}
                </div>
                <ul className={styles.miniList}>
                  <li data-hit={hud.legendaryFusion.aPlusEligible ? '1' : 'na'}>
                    A+ {hud.legendaryFusion.aPlusEligible ? '승격' : '미달'}
                    {hud.legendaryFusion.fusionScore != null
                      ? ` · 합의 ${hud.legendaryFusion.fusionScore}`
                      : ''}
                  </li>
                </ul>
                <div className={styles.hint}>{hud.legendaryFusion.note}</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="RE-ENTRY" onExplain={setExplainKo} />
            {hud?.reEntry ? (
              <>
                <div title={eagle1LabelTitleAttr(hud.reEntry.labelEn)}>
                  {hud.reEntry.labelEn} · {hud.reEntry.labelKo}
                </div>
                <ul className={styles.miniList}>
                  <li data-hit={hud.reEntry.allowNewSetup ? '1' : '0'}>
                    새셋업 {hud.reEntry.allowNewSetup ? '허용' : '차단'} · 새 tradeId 필수
                  </li>
                  <li>
                    이전 {hud.reEntry.previousState ?? '데이터 없음'}
                    {hud.reEntry.previousTradeId ? ` · ${hud.reEntry.previousTradeId.slice(0, 14)}` : ''}
                  </li>
                </ul>
                <div className={styles.hint}>{hud.reEntry.note}</div>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="MTF SMART ZONE" onExplain={setExplainKo} />
            {hud?.mtfSmartZone ? (
              <>
                <div title={eagle1LabelTitleAttr(hud.mtfSmartZone.primary?.labelEn ?? 'MTF SMART ZONE')}>
                  {hud.mtfSmartZone.summaryKo}
                </div>
                <ul className={styles.miniList}>
                  {hud.mtfSmartZone.long ? (
                    <li data-hit={hud.mtfSmartZone.long.grade === 'A_PLUS' ? '1' : 'na'}>
                      {hud.mtfSmartZone.long.labelEn} · n={hud.mtfSmartZone.long.sampleSize} ·{' '}
                      {hud.mtfSmartZone.long.note}
                    </li>
                  ) : (
                    <li data-hit="0">A+ LONG · 데이터 없음</li>
                  )}
                  {hud.mtfSmartZone.short ? (
                    <li data-hit={hud.mtfSmartZone.short.grade === 'A_PLUS' ? '1' : 'na'}>
                      {hud.mtfSmartZone.short.labelEn} · n={hud.mtfSmartZone.short.sampleSize} ·{' '}
                      {hud.mtfSmartZone.short.note}
                    </li>
                  ) : (
                    <li data-hit="0">A+ SHORT · 데이터 없음</li>
                  )}
                </ul>
              </>
            ) : (
              <div className={styles.muted}>데이터 없음</div>
            )}
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
      {explainKo ? (
        <div
          className={styles.explainToast}
          role="status"
          onClick={() => setExplainKo(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') setExplainKo(null);
          }}
        >
          <b>쉬운 설명</b>
          <p>{explainKo}</p>
          <span>탭하면 닫힘 · 확정 수익 아님</span>
        </div>
      ) : null}
    </section>
  );
}
