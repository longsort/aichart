'use client';

import {
  MONTH_DESK_TRADE_PLAN_RAIL_SPECS,
  resolveRailScreenY,
  type MonthDeskTradePlanRailNode,
} from '@/lib/monthDeskTradePlanRail';
import { monthDeskEntryRailLabelKo } from '@/lib/monthDeskStructuralStopPlan';

export type MonthDeskTradePlanRailGeom = {
  chartW: number;
  chartH: number;
  spineX: number;
  tickStartX: number;
  tickEndX: number;
  nodes: Array<MonthDeskTradePlanRailNode & { y: number }>;
};

type Props = {
  geom: MonthDeskTradePlanRailGeom | null;
};

const LEFT_MARGIN = 10;
const TICK_LEN = 42;

export function MonthDeskTradePlanRail({ geom }: Props) {
  if (!geom || geom.nodes.length < 2) return null;

  const { chartH, spineX, tickStartX, tickEndX, nodes } = geom;
  const ys = nodes.map((n) => n.y);
  const yTop = Math.min(...ys);
  const yBot = Math.max(...ys);

  return (
    <div
      className="month-desk-trade-plan-rail month-desk-trade-plan-rail--left"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: geom.chartW,
        height: chartH,
        pointerEvents: 'none',
        zIndex: 2488,
        overflow: 'hidden',
      }}
      aria-hidden
    >
      <svg width={geom.chartW} height={chartH} style={{ display: 'block', overflow: 'visible' }}>
        <line
          className="month-desk-trade-plan-rail__spine"
          x1={spineX}
          y1={yTop}
          x2={spineX}
          y2={yBot}
        />
        {nodes.map((n) => (
          <g key={n.level}>
            <line
              className="month-desk-trade-plan-rail__tick"
              x1={tickStartX}
              y1={n.y}
              x2={tickEndX}
              y2={n.y}
              stroke={n.color}
            />
            <circle className="month-desk-trade-plan-rail__dot" cx={spineX} cy={n.y} r={3} fill={n.color} />
            <text
              className="month-desk-trade-plan-rail__label"
              x={tickEndX + 6}
              y={n.y + 4}
              textAnchor="start"
              fill={n.color}
            >
              {n.labelKo}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function buildMonthDeskTradePlanRailGeom(input: {
  chartW: number;
  chartH: number;
  nodes: MonthDeskTradePlanRailNode[];
  screen: Array<{ id?: string; y1?: number; y2?: number }>;
  priceToY: (p: number) => number | null;
  direction?: 'LONG' | 'SHORT';
  /** 연동 체인 — 진입 라벨에 상·하방 한 줄 병기 */
  followHeadlineKo?: string | null;
}): MonthDeskTradePlanRailGeom | null {
  const { chartW, chartH, nodes, screen, priceToY, direction = 'LONG' } = input;
  if (nodes.length < 2 || chartW < 120 || chartH < 80) return null;

  const tickStartX = LEFT_MARGIN;
  const spineX = LEFT_MARGIN + TICK_LEN;
  const tickEndX = spineX;
  const withY: Array<MonthDeskTradePlanRailNode & { y: number }> = [];

  for (const n of nodes) {
    const spec = MONTH_DESK_TRADE_PLAN_RAIL_SPECS.find((s) => s.level === n.level);
    if (!spec) continue;
    const y = resolveRailScreenY(screen, spec, n.price, priceToY, chartH);
    if (y == null) continue;
    withY.push({ ...n, y });
  }

  if (withY.length < 2) return null;
  withY.sort((a, b) => b.y - a.y);

  const entryN = withY.find((n) => n.level === 'entry');
  const slN = withY.find((n) => n.level === 'sl');
  const tp1N = withY.find((n) => n.level === 'tp1');
  if (entryN && slN && tp1N) {
    entryN.labelKo = monthDeskEntryRailLabelKo(entryN.price, slN.price, tp1N.price, direction);
  }
  if (input.followHeadlineKo && entryN) {
    const short = input.followHeadlineKo.length > 36 ? `${input.followHeadlineKo.slice(0, 34)}…` : input.followHeadlineKo;
    entryN.labelKo = `${entryN.labelKo} · ${short}`;
  }

  return { chartW, chartH, spineX, tickStartX, tickEndX, nodes: withY };
}
