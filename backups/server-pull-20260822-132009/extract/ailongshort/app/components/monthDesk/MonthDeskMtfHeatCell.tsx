'use client';

import type { TfCloseSettleRow } from '@/lib/tfCloseSettleAssessment';
import { mtfRowBiasScore } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';

/** TF 행 미니 히트맵 (마감·유리·안착·갭) */
export function MonthDeskMtfHeatCell({
  row,
  theme,
  size = 52,
}: {
  row: TfCloseSettleRow;
  theme: MonthDeskVisualTheme;
  size?: number;
}) {
  const bias = mtfRowBiasScore(row.confirmedEdge, row.formingVerdict);
  const cells: { c: string; t: string }[] = [
    {
      c:
        row.confirmedEdge === '롱 유리'
          ? theme.long
          : row.confirmedEdge === '숏 유리'
            ? theme.short
            : theme.heatEmpty,
      t: '마감',
    },
    {
      c:
        row.formingVerdict === '안착'
          ? theme.long
          : row.formingVerdict === '실패'
            ? theme.short
            : row.formingVerdict === '불안'
              ? theme.wait
              : theme.heatEmpty,
      t: '안착',
    },
    {
      c: row.vsPriorClose === '위' ? theme.long : row.vsPriorClose === '아래' ? theme.short : theme.heatEmpty,
      t: '종가',
    },
    {
      c:
        row.gapFromPriorClosePct >= 0.15
          ? theme.long
          : row.gapFromPriorClosePct <= -0.15
            ? theme.short
            : theme.heatEmpty,
      t: '갭',
    },
  ];

  const w = size;
  const h = size * 0.55;
  const gap = 2;
  const cw = (w - gap * 3) / 4;
  const ch = (h - gap) / 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`${row.tf} 히트맵`} role="img">
      {cells.map((cell, i) => {
        const col = i % 2;
        const rowIdx = Math.floor(i / 2);
        const x = gap + col * (cw + gap);
        const y = gap / 2 + rowIdx * (ch + gap / 2);
        return (
          <rect
            key={cell.t}
            x={x}
            y={y}
            width={cw}
            height={ch}
            rx={3}
            fill={cell.c}
            opacity={cell.c === theme.heatEmpty ? 0.5 : 0.92}
          >
            <title>{`${row.tf} ${cell.t}`}</title>
          </rect>
        );
      })}
      <rect
        x={gap + 2 * (cw + gap)}
        y={h / 2 - ch / 2}
        width={cw}
        height={ch}
        rx={4}
        fill={bias > 0.1 ? theme.long : bias < -0.1 ? theme.short : theme.wait}
        opacity={0.85}
      >
        <title>종합 편향</title>
      </rect>
    </svg>
  );
}

/** 검증 구간 ok/fail/불안 스택 바 */
export function MonthDeskVerdictStackBar({
  ok,
  fail,
  nervous,
  theme,
  width = 88,
}: {
  ok: number;
  fail: number;
  nervous: number;
  theme: MonthDeskVisualTheme;
  width?: number;
}) {
  const total = Math.max(1, ok + fail + nervous);
  const h = 10;
  const wOk = (ok / total) * width;
  const wFail = (fail / total) * width;
  const wNerv = (nervous / total) * width;
  const xFail = wOk;
  const xNerv = wOk + wFail;
  return (
    <svg width={width} height={h + 4} viewBox={`0 0 ${width} ${h + 4}`} aria-hidden className="md-bar-grow">
      <rect x={0} y={2} width={width} height={h} rx={5} fill={theme.track} />
      {ok > 0 && <rect x={0} y={2} width={wOk} height={h} rx={5} fill={theme.long} />}
      {fail > 0 && <rect x={xFail} y={2} width={wFail} height={h} fill={theme.short} />}
      {nervous > 0 && (
        <rect x={xNerv} y={2} width={wNerv} height={h} rx={xNerv + wNerv >= width - 0.5 ? 5 : 0} fill={theme.wait} />
      )}
    </svg>
  );
}

/** MTF 보드 전체 히트맵 (TF × 지표) */
export function MonthDeskBoardHeatmap({
  rows,
  chartTf,
  theme,
}: {
  rows: TfCloseSettleRow[];
  chartTf?: string;
  theme: MonthDeskVisualTheme;
}) {
  const cell = 14;
  const gap = 3;
  const cols = 5;
  const w = cols * (cell + gap) + gap;
  const h = rows.length * (cell + gap) + gap + 16;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="MTF 히트맵">
        <text x={gap} y={11} fill={theme.textMuted} fontSize={8} fontWeight="700">
          TF→마감·안착·갭·편향
        </text>
        {rows.map((row, ri) => {
          const y0 = 16 + ri * (cell + gap);
          const bias = mtfRowBiasScore(row.confirmedEdge, row.formingVerdict);
          const colors = [
            row.confirmedEdge === '롱 유리' ? theme.long : row.confirmedEdge === '숏 유리' ? theme.short : theme.heatEmpty,
            row.formingVerdict === '안착' ? theme.long : row.formingVerdict === '실패' ? theme.short : row.formingVerdict === '불안' ? theme.wait : theme.heatEmpty,
            row.vsPriorClose === '위' ? theme.long : row.vsPriorClose === '아래' ? theme.short : theme.heatEmpty,
            row.gapFromPriorClosePct >= 0 ? theme.long : theme.short,
            bias > 0.1 ? theme.long : bias < -0.1 ? theme.short : theme.wait,
          ];
          const isFocus = chartTf === row.tf;
          return (
            <g key={row.tf}>
              <text
                x={gap}
                y={y0 + cell - 3}
                fill={isFocus ? theme.accent : theme.textMuted}
                fontSize={8}
                fontWeight={isFocus ? 900 : 700}
              >
                {row.tf}
              </text>
              {colors.map((c, ci) => (
                <rect
                  key={ci}
                  x={28 + ci * (cell + gap)}
                  y={y0}
                  width={cell}
                  height={cell}
                  rx={3}
                  fill={c}
                  opacity={c === theme.heatEmpty ? 0.45 : 0.9}
                  stroke={isFocus && ci === 4 ? theme.accent : 'none'}
                  strokeWidth={isFocus && ci === 4 ? 1 : 0}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
