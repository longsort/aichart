'use client';

import {
  collectMonthDeskZoneBandPriceLabels,
  collectMonthDeskZoneRolePins,
  resolveMonthDeskDottedLineRightX,
  type MonthDeskZoneBandLabelRow,
} from '@/lib/monthDeskZoneRightBandLabels';
import {
  resolveSettleBracketForBand,
  type SettleLineSummaryRow,
} from '@/lib/monthDeskFeatureSettleLabels';
import type { MonthDeskZoneSettleReaction } from '@/lib/monthDeskZoneSettleReaction';
import type { OverlayItem } from '@/types';

export type MonthDeskZoneRightBandGeom = {
  chartW: number;
  chartH: number;
  anchorRightX: number;
  /** 차트 우측 가격축 근처에 라벨 고정 (벤치마크 Trade Atlas) */
  rightEdgeAnchor?: boolean;
  priceRows: Array<MonthDeskZoneBandLabelRow & { y: number; left: number }>;
  zonePins: Array<{
    id: string;
    caption: string;
    left: number;
    top: number;
    settle?: import('@/lib/monthDeskFeatureSettleLabels').MonthDeskFeatureSettleLabel;
  }>;
};

function fmtBandPx(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (a >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

type Props = {
  geom: MonthDeskZoneRightBandGeom | null;
  reaction?: MonthDeskZoneSettleReaction | null;
  labelMode?: 'off' | 'summary' | 'full';
  summaryChip?: string;
  summaryRows?: SettleLineSummaryRow[];
  /** 간결+요약 ON — 요약 카드를 라인 라벨과 동시 표시 */
  showSummaryPanel?: boolean;
};

function phaseBadgeKo(phase: SettleLineSummaryRow['phase']): string {
  if (phase === 'confirmed') return '안착';
  if (phase === 'failed') return '실패';
  if (phase === 'breakout' || phase === 'settling') return '검증';
  return '';
}

export function MonthDeskZoneRightBandLabels({
  geom,
  reaction,
  labelMode = 'summary',
  summaryChip = '',
  summaryRows = [],
  showSummaryPanel = false,
}: Props) {
  if (!geom && !showSummaryPanel) return null;
  if (!geom && showSummaryPanel) {
    return (
      <div
        className="month-desk-zone-right-band-labels month-desk-zone-right-band-labels--summary"
        style={{
          position: 'absolute',
          right: 10,
          top: 52,
          pointerEvents: 'none',
          zIndex: 2490,
        }}
        aria-hidden
      >
        <div className="month-desk-zone-right-band-labels__summary-card">
          <div className="month-desk-zone-right-band-labels__summary-head">
            <span className="month-desk-zone-right-band-labels__summary-title">라인 요약</span>
            {summaryChip ? (
              <span className="month-desk-zone-right-band-labels__summary-chip">{summaryChip}</span>
            ) : null}
          </div>
          {summaryRows.length === 0 ? (
            <div className="month-desk-zone-right-band-labels__summary-empty">E · SL · TP 로딩</div>
          ) : null}
        </div>
      </div>
    );
  }

  const showSummaryCard = showSummaryPanel;

  return (
    <div
      className={`month-desk-zone-right-band-labels${showSummaryCard ? ' month-desk-zone-right-band-labels--summary' : ''}`}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: geom!.chartW,
        height: geom!.chartH,
        pointerEvents: 'none',
        zIndex: 2490,
        overflow: 'hidden',
      }}
      aria-hidden
    >
      {showSummaryCard && (
        <div className="month-desk-zone-right-band-labels__summary-card">
          <div className="month-desk-zone-right-band-labels__summary-head">
            <span className="month-desk-zone-right-band-labels__summary-title">라인 요약</span>
            {summaryChip ? (
              <span className="month-desk-zone-right-band-labels__summary-chip">{summaryChip}</span>
            ) : null}
          </div>
          {summaryRows.length > 0 ? (
            <div className="month-desk-zone-right-band-labels__summary-rows">
              {summaryRows.map((row) => {
                const badge = phaseBadgeKo(row.phase);
                return (
                  <div
                    key={row.key}
                    className={`month-desk-zone-right-band-labels__summary-row month-desk-zone-right-band-labels__summary-row--${row.phase}`}
                  >
                    <span className="month-desk-zone-right-band-labels__summary-label" style={{ color: row.color }}>
                      {row.labelKo}
                    </span>
                    <span className="month-desk-zone-right-band-labels__summary-price">
                      {row.price != null ? fmtBandPx(row.price) : '—'}
                    </span>
                    {badge ? (
                      <span className="month-desk-zone-right-band-labels__summary-badge">{badge}</span>
                    ) : row.bracket ? (
                      <span className="month-desk-zone-right-band-labels__summary-bracket">{row.bracket}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="month-desk-zone-right-band-labels__summary-empty">E · SL · TP 로딩</div>
          )}
        </div>
      )}
      {reaction && (
        <div
          className="month-desk-zone-right-band-labels__reaction"
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            left: 'auto',
            fontSize: 11,
            fontWeight: 800,
            color: reaction.color,
            background: reaction.bgColor,
            padding: '5px 10px',
            borderRadius: 6,
            border: `1px solid ${reaction.borderColor}`,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
          }}
          title={[reaction.headlineKo, reaction.levelKo, ...reaction.bullets].join('\n')}
        >
          {reaction.headlineKo}
          <span style={{ marginLeft: 8, opacity: 0.85, fontWeight: 600 }}>{reaction.levelKo}</span>
        </div>
      )}
      {geom!.zonePins.map((p) => (
        <div
          key={`zone-pin-${p.id}`}
          className="month-desk-zone-right-band-labels__zone-role"
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            fontSize: 10,
            fontWeight: 800,
            color: p.settle?.color ?? 'rgba(226,232,240,0.92)',
            background: p.settle?.bgColor ?? 'rgba(15,23,42,0.78)',
            padding: '2px 6px',
            borderRadius: 4,
            border: `1px solid ${p.settle?.borderColor ?? 'rgba(148,163,184,0.45)'}`,
            whiteSpace: 'nowrap',
          }}
          title={p.settle?.tooltipLines.join('\n')}
        >
          {p.caption}
        </div>
      ))}
      {geom!.priceRows.map((r) => (
        <div
          key={r.key}
          className="month-desk-zone-right-band-labels__price"
          style={{
            position: 'absolute',
            ...(geom!.rightEdgeAnchor
              ? { right: 56, left: 'auto' as const }
              : { left: r.left }),
            top: r.y - 9,
            fontSize: 10,
            fontWeight: 700,
            color: r.color,
            background: 'rgba(8,12,24,0.82)',
            padding: '2px 7px',
            borderRadius: 5,
            border: '1px solid rgba(148,163,184,0.35)',
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
            textAlign: 'left',
          }}
        >
          <span style={{ marginRight: 6 }}>{r.labelKo}</span>
          <span style={{ opacity: 0.92, fontWeight: 600 }}>{fmtBandPx(r.price)}</span>
          {r.settle && (() => {
            const bracket = resolveSettleBracketForBand(r.overlayId ?? r.key, r.settle, labelMode, summaryChip);
            if (!bracket) return null;
            return (
              <span
                className={`month-desk-zone-right-band-labels__settle month-desk-zone-right-band-labels__settle--${r.settle.phase}`}
                style={{
                  marginLeft: 6,
                  fontSize: 9,
                  fontWeight: 800,
                  color: r.settle.color,
                }}
                title={r.settle.tooltipLines.join('\n')}
              >
                {bracket}
              </span>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

export function buildMonthDeskZoneRightBandGeom(input: {
  chartW: number;
  chartH: number;
  pack: OverlayItem[];
  settleByOverlayId?: Map<string, import('@/lib/monthDeskFeatureSettleLabels').MonthDeskFeatureSettleLabel> | null;
  /** 마감존 SuperTrend 상·하한 가격 — 우측 라벨 행 추가 */
  envelopeBandPrices?: { lower: number; upper: number } | null;
  screen: Array<{
    id?: string;
    kind?: string;
    y1: number;
    y2?: number;
    x1: number;
    x2?: number;
    zoneTimeEndScreenX?: number;
  }>;
  priceToY: (p: number) => number | null;
  /** 벤치마크 LWC — 가격축 왼쪽에 E·SL·TP 고정 */
  rightEdgeAnchor?: boolean;
}): MonthDeskZoneRightBandGeom | null {
  const { chartW, chartH, pack, screen, priceToY, settleByOverlayId, envelopeBandPrices, rightEdgeAnchor } = input;
  if (chartW < 160 || chartH < 80) return null;

  const zoneScreens = screen.filter((o) => {
    const k = String(o.kind || '');
    return ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone'].includes(k);
  });

  /** 가격 라벨: 점선이 끝나는 우측 X (존 형성 끝이 아님) */
  const lineRightX = resolveMonthDeskDottedLineRightX(screen, chartW);
  let zoneRoleRightX = 0;
  for (const z of zoneScreens) {
    const id = String(z.id || '');
    if (!id.includes('plan-') && !id.startsWith('ob-pre-beam') && !id.startsWith('month-desk-core')) continue;
    const r =
      typeof z.zoneTimeEndScreenX === 'number' && Number.isFinite(z.zoneTimeEndScreenX)
        ? z.zoneTimeEndScreenX
        : Math.max(z.x1, z.x2 ?? z.x1);
    zoneRoleRightX = Math.max(zoneRoleRightX, r);
  }
  const anchorRightX = Math.max(lineRightX, zoneRoleRightX);

  const lineRows = collectMonthDeskZoneBandPriceLabels(pack);
  const priceRows: MonthDeskZoneRightBandGeom['priceRows'] = [];
  const labelOffset = rightEdgeAnchor ? 10 : 24;
  const minGap = 22;
  const priceLabelLeft = lineRightX + labelOffset;

  if (envelopeBandPrices && Number.isFinite(envelopeBandPrices.lower) && Number.isFinite(envelopeBandPrices.upper)) {
    const envSpecs: { key: string; labelKo: string; price: number; color: string }[] = [
      { key: 'month-desk-closing-zone-lower', labelKo: '마감존하', price: envelopeBandPrices.lower, color: 'rgba(34,211,238,0.95)' },
      { key: 'month-desk-closing-zone-upper', labelKo: '마감존상', price: envelopeBandPrices.upper, color: 'rgba(251,113,133,0.95)' },
    ];
    for (const spec of envSpecs) {
      const y = priceToY(spec.price);
      if (y == null || !Number.isFinite(y)) continue;
      priceRows.push({
        key: spec.key,
        labelKo: spec.labelKo,
        price: spec.price,
        color: spec.color,
        overlayId: spec.key,
        y: Math.max(12, Math.min(chartH - 12, y)),
        left: priceLabelLeft,
        settle: settleByOverlayId?.get(spec.key),
      });
    }
  }

  for (const row of lineRows) {
    const scr = screen.find((s) => s.id === row.overlayId);
    let y =
      scr != null && Number.isFinite(scr.y1)
        ? scr.y1
        : priceToY(row.price);
    if (y == null || !Number.isFinite(y)) continue;
    y = Math.max(12, Math.min(chartH - 12, y));
    const oid = row.overlayId ?? row.key;
    priceRows.push({
      ...row,
      y,
      left: priceLabelLeft,
      settle: settleByOverlayId?.get(oid),
    });
  }

  priceRows.sort((a, b) => a.y - b.y);
  for (let i = 1; i < priceRows.length; i++) {
    if (priceRows[i].y - priceRows[i - 1].y < minGap) {
      priceRows[i].y = priceRows[i - 1].y + minGap;
    }
  }

  const zonePins = collectMonthDeskZoneRolePins(zoneScreens, settleByOverlayId).map((p) => ({
    ...p,
    left: (zoneRoleRightX > 0 ? zoneRoleRightX : p.left) + labelOffset,
  }));

  if (priceRows.length === 0 && zonePins.length === 0) return null;

  return {
    chartW,
    chartH,
    anchorRightX: lineRightX,
    rightEdgeAnchor: rightEdgeAnchor === true,
    priceRows,
    zonePins,
  };
}
