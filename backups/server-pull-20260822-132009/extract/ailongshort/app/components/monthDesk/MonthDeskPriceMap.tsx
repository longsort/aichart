'use client';

import { useMemo } from 'react';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import { coreLevelsPriceSpan } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskWhaleSnapshot } from '@/lib/monthDeskWhaleDesk';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import styles from '../MonthDeskAnalysisBoard.module.css';

function fmtPx(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

type PlacedLine = {
  key: string;
  price: number;
  color: string;
  label: string;
  dash?: boolean;
  thick?: number;
  priority: number;
};

/** 겹치는 라벨 Y 보정 */
function placeLabelYs(
  items: { key: string; y: number; priority: number }[],
  minGap: number,
  top: number,
  bottom: number
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const out = new Map<string, number>();
  let lastY = -Infinity;
  for (const it of sorted) {
    let y = it.y;
    if (y - lastY < minGap) y = lastY + minGap;
    out.set(it.key, y);
    lastY = y;
  }
  const maxY = Math.max(...out.values());
  if (maxY > bottom) {
    const shift = maxY - bottom;
    for (const [k, y] of out) out.set(k, y - shift);
  }
  for (const it of sorted) {
    const y = out.get(it.key)!;
    if (y < top) out.set(it.key, top);
  }
  return out;
}

export default function MonthDeskPriceMap({
  levels,
  verdict,
  theme: vt,
  height = 360,
  whale,
}: {
  levels: MonthDeskCoreLevels;
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  theme: MonthDeskVisualTheme;
  height?: number;
  whale?: MonthDeskWhaleSnapshot;
}) {
  const span = useMemo(() => {
    const base = coreLevelsPriceSpan(levels);
    if (!base || levels.close == null) return base;
    const cluster = [levels.close, levels.support, levels.resistance, levels.entryMid].filter(
      (p): p is number => p != null && Number.isFinite(p)
    );
    if (cluster.length < 2) return base;
    const cMin = Math.min(...cluster);
    const cMax = Math.max(...cluster);
    const mid = (cMin + cMax) / 2;
    const rel = mid > 0 ? (cMax - cMin) / mid : 1;
    if (rel < 0.025) {
      const pad = Math.max(mid * 0.035, (cMax - cMin) * 2.5, 1);
      return { min: mid - pad, max: mid + pad };
    }
    return base;
  }, [levels]);

  const entryLo =
    levels.entryLow != null && levels.entryHigh != null ? Math.min(levels.entryLow, levels.entryHigh) : null;
  const entryHi =
    levels.entryLow != null && levels.entryHigh != null ? Math.max(levels.entryLow, levels.entryHigh) : null;
  const entryMid =
    levels.entryMid ?? (entryLo != null && entryHi != null ? (entryLo + entryHi) / 2 : null);

  const sideColor = verdict === 'LONG' ? vt.long : verdict === 'SHORT' ? vt.short : vt.wait;
  const sideKo = verdict === 'LONG' ? '롱 LONG' : verdict === 'SHORT' ? '숏 SHORT' : '관망 WAIT';
  const entryHint =
    verdict === 'LONG' ? '▲ 롱 타점 구간' : verdict === 'SHORT' ? '▼ 숏 타점 구간' : '타점 구간';

  if (!span) {
    return (
      <div className={styles.priceMapEmpty} style={{ color: vt.textMuted }}>
        가격·타점 데이터 로드 후 표시됩니다.
      </div>
    );
  }

  const { min, max } = span;
  const range = max - min;
  const chartTop = 36;
  const chartBot = height - 28;
  const yOf = (p: number) => chartTop + ((max - p) / range) * (chartBot - chartTop);

  const lines: PlacedLine[] = [];
  if (levels.support != null) lines.push({ key: 'sup', price: levels.support, color: vt.long, label: '지지', thick: 2, priority: 2 });
  if (levels.resistance != null) lines.push({ key: 'res', price: levels.resistance, color: vt.short, label: '저항', thick: 2, priority: 2 });
  if (levels.invalidation != null) lines.push({ key: 'inv', price: levels.invalidation, color: vt.wait, label: '무효', dash: true, thick: 1.5, priority: 1 });
  if (entryMid != null && (entryLo == null || entryHi == null)) {
    lines.push({ key: 'entry', price: entryMid, color: vt.accent, label: '★ 타점', thick: 3, priority: 5 });
  }
  levels.targets.forEach((p, i) => {
    lines.push({ key: `tp${i}`, price: p, color: '#38bdf8', label: `TP${i + 1}`, dash: true, thick: 1.5, priority: 0 });
  });
  if (levels.close != null) {
    lines.push({ key: 'close', price: levels.close, color: '#f8fafc', label: '현재가', thick: 3.5, priority: 10 });
  }
  if (whale?.defendPrice != null) {
    lines.push({
      key: 'whale-def',
      price: whale.defendPrice,
      color: '#22d3ee',
      label: '🛡 고래방어',
      thick: 2.5,
      priority: 4,
    });
  }
  if (whale?.attackPrice != null) {
    lines.push({
      key: 'whale-atk',
      price: whale.attackPrice,
      color: '#fb7185',
      label: '▽ 고래매도',
      thick: 2.5,
      priority: 4,
    });
  }

  const labelYs = placeLabelYs(
    lines.map((ln) => ({ key: ln.key, y: yOf(ln.price), priority: ln.priority })),
    22,
    chartTop,
    chartBot
  );

  const closeY = levels.close != null ? yOf(levels.close) : null;
  const entryY = entryMid != null ? yOf(entryMid) : null;

  const activeZoneId = whale?.activeZone?.id;

  return (
    <div className={styles.priceMapWrap}>
      <div className={styles.priceMapStrip}>
        <div className={styles.priceMapPill} style={{ borderColor: '#f8fafc55', background: 'rgba(248,250,252,0.12)' }}>
          <span className={styles.priceMapPillTag} style={{ color: '#f8fafc' }}>
            ● 현재
          </span>
          <span className={styles.priceMapPillVal} style={{ color: '#f8fafc' }}>
            {levels.close != null ? fmtPx(levels.close) : '—'}
          </span>
        </div>
        <div className={styles.priceMapPill} style={{ borderColor: `${vt.accent}88`, background: `${vt.accent}22` }}>
          <span className={styles.priceMapPillTag} style={{ color: vt.accent }}>
            ★ 타점
          </span>
          <span className={styles.priceMapPillVal} style={{ color: vt.text }}>
            {entryLo != null && entryHi != null
              ? `${fmtPx(entryLo)} ~ ${fmtPx(entryHi)}`
              : entryMid != null
                ? fmtPx(entryMid)
                : '—'}
          </span>
        </div>
        <div
          className={`${styles.priceMapPill} ${styles.priceMapPillVerdict}`}
          style={{
            borderColor: `${sideColor}aa`,
            background: `${sideColor}28`,
            boxShadow: `0 0 24px ${sideColor}55`,
          }}
        >
          <span className={styles.priceMapPillTag} style={{ color: sideColor }}>
            방향
          </span>
          <span className={styles.priceMapPillVal} style={{ color: sideColor, fontSize: 18 }}>
            {sideKo}
          </span>
        </div>
        {whale && whale.whaleBuyRecent + whale.whaleSellRecent > 0 && (
          <div
            className={styles.priceMapPill}
            style={{
              borderColor: 'rgba(148,163,184,0.4)',
              background: 'rgba(30,41,59,0.5)',
            }}
          >
            <span className={styles.priceMapPillTag} style={{ color: '#94a3b8' }}>
              WAD
            </span>
            <span className={styles.priceMapPillVal} style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700 }}>
              B{whale.whaleBuyRecent} / S{whale.whaleSellRecent}
            </span>
          </div>
        )}
      </div>

      <svg width="100%" height={height} viewBox={`0 0 400 ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="가격·타점 맵">
        <defs>
          <linearGradient id="mdPriceBg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={verdict === 'SHORT' ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.1)'} />
            <stop offset="100%" stopColor={verdict === 'LONG' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)'} />
          </linearGradient>
          <marker id="mdArrowLong" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={vt.long} />
          </marker>
          <marker id="mdArrowShort" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={vt.short} />
          </marker>
        </defs>

        <rect x={0} y={0} width={400} height={height} fill="url(#mdPriceBg2)" rx={12} />

        <text x={12} y={22} fill={sideColor} fontSize={13} fontWeight="900" letterSpacing="0.06em">
          {sideKo}
        </text>

        {whale?.zones.map((z) => {
          const yTop = yOf(z.high);
          const yBot = yOf(z.low);
          const isBuy = z.side === 'buy';
          const isActive = z.id === activeZoneId;
          const h = Math.max(6, yBot - yTop);
          return (
            <g key={z.id}>
              <rect
                x={88}
                y={yTop}
                width={224}
                height={h}
                fill={isBuy ? 'rgba(34,211,238,0.15)' : 'rgba(251,113,133,0.15)'}
                stroke={isBuy ? '#22d3ee' : '#fb7185'}
                strokeWidth={isActive ? 2 : 1}
                strokeDasharray={isBuy ? undefined : '5 4'}
                rx={3}
                opacity={0.9}
              />
              {isActive && (
                <text x={92} y={yTop + 11} fill={isBuy ? '#67e8f9' : '#fda4af'} fontSize={9} fontWeight="800">
                  현재가 · {isBuy ? '매수존' : '매도존'}
                </text>
              )}
            </g>
          );
        })}

        {entryLo != null && entryHi != null && (
          <>
            <rect
              className="md-price-zone-pulse"
              x={88}
              y={yOf(entryHi)}
              width={224}
              height={Math.max(8, yOf(entryLo) - yOf(entryHi))}
              fill={verdict === 'LONG' ? 'rgba(74,222,128,0.35)' : verdict === 'SHORT' ? 'rgba(248,113,113,0.35)' : 'rgba(167,139,250,0.3)'}
              stroke={vt.accent}
              strokeWidth={2.5}
              rx={6}
            />
            <rect x={88} y={yOf(entryHi) - 20} width={72} height={18} rx={4} fill={vt.accent} opacity={0.95} />
            <text x={92} y={yOf(entryHi) - 7} fill="#0f172a" fontSize={11} fontWeight="900">
              ★ 타점
            </text>
            <text x={164} y={yOf(entryHi) - 7} fill={vt.text} fontSize={10} fontWeight="700">
              {fmtPx(entryLo)}~{fmtPx(entryHi)}
            </text>
          </>
        )}

        {levels.close != null && levels.invalidation != null && (
          <rect
            x={88}
            y={Math.min(yOf(levels.close), yOf(levels.invalidation))}
            width={224}
            height={Math.max(6, Math.abs(yOf(levels.close) - yOf(levels.invalidation)))}
            fill="rgba(248,113,113,0.12)"
            rx={4}
          />
        )}
        {levels.close != null && levels.targets[0] != null && (
          <rect
            x={88}
            y={Math.min(yOf(levels.close), yOf(levels.targets[0]))}
            width={224}
            height={Math.max(6, Math.abs(yOf(levels.close) - yOf(levels.targets[0])))}
            fill="rgba(56,189,248,0.14)"
            rx={4}
          />
        )}

        {closeY != null && entryY != null && Math.abs(closeY - entryY) > 4 && (
          <line
            x1={200}
            y1={closeY}
            x2={200}
            y2={entryY}
            stroke={sideColor}
            strokeWidth={2}
            strokeDasharray="4 3"
            markerEnd={verdict === 'LONG' ? 'url(#mdArrowLong)' : verdict === 'SHORT' ? 'url(#mdArrowShort)' : undefined}
            opacity={0.85}
          />
        )}

        {lines.map((ln) => {
          const y = yOf(ln.price);
          const labelY = labelYs.get(ln.key) ?? y;
          const isClose = ln.key === 'close';
          return (
            <g key={ln.key} className="md-price-line-enter">
              <line
                x1={88}
                y1={y}
                x2={312}
                y2={y}
                stroke={isClose ? sideColor : ln.color}
                strokeWidth={ln.thick ?? 2}
                strokeDasharray={ln.dash ? '8 5' : undefined}
                opacity={isClose ? 1 : 0.92}
              />
              {isClose && (
                <>
                  <rect x={86} y={y - 14} width={228} height={28} rx={6} fill="rgba(15,23,42,0.75)" stroke={sideColor} strokeWidth={2} />
                  <circle className="md-price-close-pulse" cx={98} cy={y} r={7} fill={sideColor} stroke="#fff" strokeWidth={2} />
                </>
              )}
              <text x={82} y={labelY + 5} textAnchor="end" fill={isClose ? sideColor : ln.color} fontSize={isClose ? 13 : 12} fontWeight="900">
                {ln.label}
              </text>
              <text
                x={318}
                y={labelY + 5}
                textAnchor="start"
                fill={isClose ? '#f8fafc' : vt.text}
                fontSize={isClose ? 14 : 12}
                fontWeight={isClose ? 900 : 700}
                fontFamily="system-ui"
              >
                {fmtPx(ln.price)}
              </text>
            </g>
          );
        })}

        {!lines.some((l) => l.key === 'close') && levels.close != null && (
          <circle className="md-price-close-pulse" cx={200} cy={yOf(levels.close)} r={7} fill={sideColor} />
        )}
      </svg>

      <div className={styles.priceMapFoot} style={{ color: vt.textMuted }}>
        <span style={{ color: sideColor, fontWeight: 800 }}>{entryHint}</span>
        <span> · </span>
        <span>초록=지지 · 빨강=저항 · 보라=타점 · 청록=고래매수존 · 분홍=고래매도존</span>
      </div>
    </div>
  );
}
