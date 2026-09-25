'use client';

import type { WhaleBeamRightOracleGeom } from '@/lib/whaleBeamRightOracleGeom';

type Props = {
  oracle: WhaleBeamRightOracleGeom | null;
};

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtBand(p25: number | null, p75: number | null): string {
  if (p25 == null && p75 == null) return '';
  return ` (${fmtPct(p25)}~${fmtPct(p75)})`;
}

/** Bitget DNA — 우측 여백 (마지막 캔들·세로 점선 비겹침) */
export function WhaleVolumeSegmentDrawLayer({ oracle }: Props) {
  if (!oracle) return null;

  const g = oracle;
  const d = g.dna;
  const h = g.chartHeight;
  const colW = Math.max(72, g.colRight - g.colLeft);
  const lane = g.futureLane;
  const panelTop = Math.min(lane.yTop, g.entryY, g.targetY) - 16;
  const panelBot = Math.max(lane.yBot, g.entryY, g.targetY) + 72;
  const panelH = Math.min(Math.max(128, panelBot - Math.max(10, panelTop)), g.volPanelTop - 6);

  const isLong = d.verdictKo === '상승' || d.beamKo === '롱빔';
  const isShort = d.verdictKo === '하락' || d.beamKo === '숏빔';
  const beamHead = isLong ? '▲ 롱빔' : isShort ? '▼ 숏빔' : `◆ ${d.beamKo}`;
  const futureLine = `+${d.forecastBars}봉 ${fmtPct(d.forecastPct)}${fmtBand(d.p25Pct, d.p75Pct)}`;

  let y = 14;
  const line = (text: string, cls: string, dy = 14) => {
    const cy = y;
    y += dy;
    return (
      <text key={`${cls}-${cy}`} x={colW / 2} y={cy} textAnchor="middle" className={cls}>
        {text}
      </text>
    );
  };

  return (
    <svg className="whale-segment-draw-layer" width="100%" height={h} aria-hidden>
      {/* 캔들 위 박스·세로 레인 없음 — 우측 여백 패널·가로선만 */}
      {/* 진입·목표 — 여백 안 가로선만 (캔들 쪽으로 안 뻗음) */}
      <line
        x1={g.colLeft}
        y1={g.entryY}
        x2={g.colRight}
        y2={g.entryY}
        className="whale-beam-margin-oracle__hair whale-beam-margin-oracle__hair--entry"
      />
      <line
        x1={g.colLeft}
        y1={g.targetY}
        x2={g.colRight}
        y2={g.targetY}
        className="whale-beam-margin-oracle__hair whale-beam-margin-oracle__hair--target"
      />

      <g transform={`translate(${g.colLeft}, ${Math.max(10, panelTop)})`}>
        <rect x={0} y={0} width={colW} height={panelH} rx={7} className="whale-beam-margin-oracle__panel" />
        {line('BITGET DNA', 'whale-beam-margin-oracle__brand', 14)}
        {line(
          beamHead,
          isLong
            ? 'whale-beam-margin-oracle__beam whale-beam-margin-oracle__beam--long'
            : isShort
              ? 'whale-beam-margin-oracle__beam whale-beam-margin-oracle__beam--short'
              : 'whale-beam-margin-oracle__beam',
          18
        )}
        {line(`롱 ${d.longPct.toFixed(0)}% · 숏 ${d.shortPct.toFixed(0)}%`, 'whale-beam-margin-oracle__meta', 13)}
        {line(`유사 ${d.similarCount}건 · ${d.tierBtc}BTC`, 'whale-beam-margin-oracle__meta', 13)}
        {line(futureLine, 'whale-beam-margin-oracle__footer', 14)}
        {line(d.entryKo, 'whale-beam-margin-oracle__entry-txt', 13)}
        {line(`목표 ${d.targetKo}`, 'whale-beam-margin-oracle__target-txt', 13)}
        {line(d.scenarioKo.slice(0, 16), 'whale-beam-margin-oracle__meta', 12)}
        {d.mtfLine !== '—' && line(d.mtfLine, 'whale-beam-margin-oracle__meta', 12)}
        {d.pastLine !== '—' && line(`과거 ${d.pastLine}`, 'whale-beam-margin-oracle__meta', 12)}
        {line(d.dataSpanKo, 'whale-beam-margin-oracle__meta', 12)}
      </g>
    </svg>
  );
}
