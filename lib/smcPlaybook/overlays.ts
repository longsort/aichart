import type { Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import { FIB_LO, FIB_HI } from '@/lib/smcPlaybook/constants';
import type { SmcEntryPlaybook, SmcPlaybookStep } from '@/lib/smcPlaybook/types';

function visTime(candles: Candle[], i: number): number {
  const c = candles[Math.max(0, Math.min(candles.length - 1, i))];
  return (c?.time as number) ?? 0;
}

function checklistText(steps: SmcPlaybookStep[]): string {
  const head = steps.slice(0, 6).map((s) => `${s.done ? '✓' : '·'}${s.labelKo}`).join(' ');
  return head.length > 90 ? `${head.slice(0, 87)}…` : head;
}

function fmtPx(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p) || p <= 0) return '—';
  if (p >= 1000) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

export function buildSmcEntryPlaybookOverlays(
  playbook: SmcEntryPlaybook,
  candles: Candle[],
  timeframe: string
): OverlayItem[] {
  if (!candles.length) return [];
  const n = candles.length;
  const last = candles[n - 1];
  const tLast = last.time as number;
  const tf = timeframe || '1h';
  const barSec = candleBarDurationSec(tf, tLast);
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const rng = Math.max(1e-12, max - min);
  const toY = (p: number) => 1 - (p - min) / rng;

  const out: OverlayItem[] = [];
  const iStart = Math.max(0, n - 56);
  const t1 = visTime(candles, iStart);
  const t2 = tLast + barSec * 2;

  const phaseText = playbook.active
    ? `${playbook.phaseLabel}${playbook.zone ? '' : ' (존 미식별)'}`
    : playbook.phaseLabel;

  const moreSteps = playbook.steps.length > 6 ? Math.max(0, playbook.steps.length - 6) : 0;
  const bandLine =
    playbook.active && playbook.zone && playbook.zone.high > playbook.zone.low
      ? `타점 밴드 ${fmtPx(playbook.zone.low)} – ${fmtPx(playbook.zone.high)}`
      : '';
  const tpSummary =
    playbook.active && playbook.targetPrices
      ? `TP1 ${fmtPx(playbook.targetPrices[0])} · TP2 ${fmtPx(playbook.targetPrices[1])} · TP3 ${fmtPx(playbook.targetPrices[2])}`
      : playbook.active
        ? `TP1(참고) ${fmtPx(playbook.targetPrice)}`
        : '';
  const priceBlock = playbook.active
    ? [
        bandLine,
        `진입(중앙·참고) ${fmtPx(playbook.entryRefPrice)}`,
        `손절(SL·근사) ${fmtPx(playbook.stopPrice)}`,
        tpSummary,
        playbook.targetSourceNote ? `출처: ${playbook.targetSourceNote}` : '',
      ]
        .filter((s) => s.length > 0)
        .join('\n')
    : '';
  const tooltipLines = [
    playbook.detail,
    ...(playbook.steps.length ? [checklistText(playbook.steps), ...(moreSteps ? [`… 외 ${moreSteps}단계`] : [])] : []),
    ...(priceBlock ? ['', '— 가격(자동 근사·참고) —', priceBlock] : []),
  ].join('\n');

  out.push({
    id: 'smc-entry-playbook-phase',
    kind: 'label',
    label: phaseText,
    x1: (n - 1) / Math.max(1, n),
    y1: toY(last.close),
    time1: tLast,
    price1: last.close,
    confidence: 52,
    color: 'rgba(250,204,21,0.95)',
    lineLabelColor: '#FACC15',
    labelBackgroundColor: 'rgba(15,23,42,0.82)',
    labelTextColor: '#F8FAFC',
    category: 'smcDesk',
    labelTooltip: tooltipLines,
    noProject: true,
  });

  if (playbook.active && playbook.steps.length) {
    out.push({
      id: 'smc-entry-playbook-checklist',
      kind: 'label',
      label: checklistText(playbook.steps),
      x1: Math.max(0, (n - 28) / n),
      y1: toY(max - rng * 0.04),
      time1: visTime(candles, Math.max(0, n - 28)),
      price1: max - rng * 0.04,
      confidence: 48,
      color: 'rgba(148,163,184,0.92)',
      lineLabelColor: '#94A3B8',
      labelBackgroundColor: 'rgba(15,23,42,0.75)',
      labelTextColor: '#E2E8F0',
      category: 'smcDesk',
      labelTooltip: playbook.steps.map((s) => `${s.done ? '✓' : '○'} ${s.labelKo}`).join('\n'),
      noProject: true,
    });
  }

  const htf = playbook.htfPoi;
  if (htf && htf.high > htf.low) {
    out.push({
      id: 'smc-entry-playbook-htf-poi',
      kind: 'zone',
      label: `HTF POI ${fmtPx(htf.low)}~${fmtPx(htf.high)}`,
      x1: iStart / n,
      y1: toY(htf.high),
      x2: Math.min(0.995, (n - 0.5) / n),
      y2: toY(htf.low),
      time1: t1,
      time2: t2,
      price1: htf.high,
      price2: htf.low,
      confidence: 44,
      color: 'rgba(71,85,105,0.14)',
      lineLabelColor: 'rgba(148,163,184,0.45)',
      category: 'smcDesk',
      labelTooltip: '고타임프레임 관심 구간(넓은 밴드·근사)',
    });
  }

  const sw = playbook.sweep;
  if (sw) {
    const sp = sw.price;
    out.push({
      id: 'smc-entry-playbook-lqs',
      kind: 'trendLine',
      label: `${sw.side === 'buy' ? 'LQS·스윕(고점)' : 'LQS·스윕(저점)'} ${fmtPx(sp)}`,
      x1: iStart / n,
      y1: toY(sp),
      x2: (n - 1) / n,
      y2: toY(sp),
      time1: t1,
      price1: sp,
      time2: tLast,
      price2: sp,
      confidence: 55,
      color: 'rgba(248,113,113,0.65)',
      lineDash: '4 3',
      category: 'smcDesk',
      noProject: true,
    });
  }

  if (!playbook.active || !playbook.zone) {
    return out;
  }

  const z = playbook.zone;
  const col =
    playbook.direction === 'SHORT'
      ? 'rgba(244,114,182,0.26)'
      : 'rgba(52,211,153,0.26)';
  const border =
    playbook.direction === 'SHORT' ? 'rgba(244,114,182,0.55)' : 'rgba(52,211,153,0.55)';

  const dirKo = playbook.direction === 'SHORT' ? '숏' : '롱';
  out.push({
    id: 'smc-entry-playbook-zone',
    kind: 'zone',
    label: `${dirKo} 타점 OB/FVG ${fmtPx(z.low)}~${fmtPx(z.high)}`,
    x1: iStart / n,
    y1: toY(z.high),
    x2: Math.min(0.995, (n - 0.5) / n),
    y2: toY(z.low),
    time1: t1,
    time2: t2,
    price1: z.high,
    price2: z.low,
    confidence: 58,
    color: col,
    lineLabelColor: border,
    category: 'smcDesk',
    labelTooltip: `⑦ ${dirKo}·OB/FVG (참고)`,
    zonePulse: true,
  });

  if (playbook.entryRefPrice != null && Number.isFinite(playbook.entryRefPrice)) {
    const ep = playbook.entryRefPrice;
    out.push({
      id: 'smc-entry-playbook-entry',
      kind: 'trendLine',
      label: `${dirKo} 진입 ${fmtPx(ep)}`,
      x1: iStart / n,
      y1: toY(ep),
      x2: (n - 1) / n,
      y2: toY(ep),
      time1: t1,
      price1: ep,
      time2: tLast,
      price2: ep,
      confidence: 54,
      color: 'rgba(250,204,21,0.55)',
      lineDash: '2 4',
      category: 'smcDesk',
      noProject: true,
      labelTooltip: `타점 존 중앙가 ${fmtPx(ep)}`,
    });
  }

  if (playbook.stopPrice != null && Number.isFinite(playbook.stopPrice)) {
    const sp = playbook.stopPrice;
    out.push({
      id: 'smc-entry-playbook-stop',
      kind: 'trendLine',
      label: `SL ${fmtPx(sp)}`,
      x1: iStart / n,
      y1: toY(sp),
      x2: (n - 1) / n,
      y2: toY(sp),
      time1: t1,
      price1: sp,
      time2: tLast,
      price2: sp,
      confidence: 56,
      color: 'rgba(239,68,68,0.72)',
      lineDash: '4 4',
      category: 'smcDesk',
      noProject: true,
      labelTooltip: `${dirKo} 시나리오 무효화 근사 — 참고용`,
    });
  }

  const ltf = playbook.ltfPoi;
  if (ltf && ltf.high > ltf.low) {
    out.push({
      id: 'smc-entry-playbook-ltf-poi',
      kind: 'zone',
      label: `LTF POI ${fmtPx(ltf.low)}~${fmtPx(ltf.high)}`,
      x1: iStart / n,
      y1: toY(ltf.high),
      x2: Math.min(0.995, (n - 0.5) / n),
      y2: toY(ltf.low),
      time1: t1,
      time2: t2,
      price1: ltf.high,
      price2: ltf.low,
      confidence: 50,
      color: 'rgba(251,191,36,0.12)',
      lineLabelColor: 'rgba(251,191,36,0.5)',
      category: 'smcDesk',
      labelTooltip: '⑨ 좁은 재진입 밴드(할인/프리미엄 근사)',
    });
  }

  const oz = playbook.oteZone;
  if (oz && oz.high > oz.low) {
    out.push({
      id: 'smc-entry-playbook-ote',
      kind: 'zone',
      label: `OTE ${FIB_LO}–${FIB_HI} ${fmtPx(oz.low)}~${fmtPx(oz.high)}`,
      x1: iStart / n,
      y1: toY(oz.high),
      x2: Math.min(0.995, (n - 0.5) / n),
      y2: toY(oz.low),
      time1: t1,
      time2: t2,
      price1: oz.high,
      price2: oz.low,
      confidence: 52,
      color:
        playbook.direction === 'SHORT'
          ? 'rgba(167,139,250,0.18)'
          : 'rgba(56,189,248,0.18)',
      lineLabelColor:
        playbook.direction === 'SHORT' ? 'rgba(167,139,250,0.65)' : 'rgba(56,189,248,0.65)',
      category: 'smcDesk',
      labelTooltip: '⑧ OTE',
    });
  }

  const iz = playbook.ifvgZone;
  if (iz && iz.high > iz.low) {
    out.push({
      id: 'smc-entry-playbook-ifvg',
      kind: 'zone',
      label: `${dirKo} IFVG ${fmtPx(iz.low)}~${fmtPx(iz.high)}`,
      x1: iStart / n,
      y1: toY(iz.high),
      x2: Math.min(0.995, (n - 0.5) / n),
      y2: toY(iz.low),
      time1: t1,
      time2: t2,
      price1: iz.high,
      price2: iz.low,
      confidence: 49,
      color: 'rgba(236,72,153,0.12)',
      lineLabelColor: 'rgba(236,72,153,0.45)',
      category: 'smcDesk',
      labelTooltip: `⑥ ${dirKo} 시나리오 — 메워진 반대 FVG(역갭 근사)`,
    });
  }

  const idm = playbook.inducement;
  if (idm && Number.isFinite(idm.price)) {
    const ip = idm.price;
    out.push({
      id: 'smc-entry-playbook-idm',
      kind: 'label',
      label: `IDM ${fmtPx(ip)}`,
      x1: (n - 8) / Math.max(1, n),
      y1: toY(ip),
      time1: visTime(candles, Math.max(0, n - 8)),
      price1: ip,
      confidence: 50,
      color: 'rgba(251,191,36,0.9)',
      lineLabelColor: '#FBBF24',
      labelBackgroundColor: 'rgba(30,27,75,0.78)',
      labelTextColor: '#FEF3C7',
      category: 'smcDesk',
      labelTooltip: idm.sideNote,
      noProject: true,
    });
  }

  const lq = playbook.liquidityPoolTarget;
  if (lq != null && Number.isFinite(lq)) {
    out.push({
      id: 'smc-entry-playbook-lq',
      kind: 'trendLine',
      label: `${playbook.direction === 'SHORT' ? 'EQL' : 'EQH'} ${fmtPx(lq)}`,
      x1: iStart / n,
      y1: toY(lq),
      x2: (n - 1) / n,
      y2: toY(lq),
      time1: t1,
      price1: lq,
      time2: tLast,
      price2: lq,
      confidence: 46,
      color: 'rgba(34,197,94,0.35)',
      lineDash: '6 5',
      category: 'smcDesk',
      noProject: true,
    });
  }

  if (playbook.mitigationTouched) {
    out.push({
      id: 'smc-entry-playbook-mitigation',
      kind: 'label',
      label: '완화·재터치',
      x1: (n - 3) / Math.max(1, n),
      y1: toY(last.close),
      time1: tLast,
      price1: last.close,
      confidence: 51,
      color: 'rgba(34,197,94,0.95)',
      lineLabelColor: '#22C55E',
      labelBackgroundColor: 'rgba(6,78,59,0.75)',
      labelTextColor: '#ECFDF5',
      category: 'smcDesk',
      labelTooltip: '⑩ 타점 존과 최신 봉이 겹침',
      noProject: true,
    });
  }

  const tpLines: Array<{ id: string; label: string; color: string; dash: string }> = [
    { id: 'smc-entry-playbook-tp-1', label: 'TP1', color: 'rgba(45,212,191,0.78)', dash: '4 3' },
    { id: 'smc-entry-playbook-tp-2', label: 'TP2', color: 'rgba(148,163,184,0.68)', dash: '5 5' },
    { id: 'smc-entry-playbook-tp-3', label: 'TP3', color: 'rgba(100,116,139,0.58)', dash: '6 4' },
  ];
  if (playbook.targetPrices) {
    playbook.targetPrices.forEach((tp, i) => {
      if (tp == null || !Number.isFinite(tp)) return;
      const spec = tpLines[i] ?? tpLines[2]!;
      out.push({
        id: spec.id,
        kind: 'trendLine',
        label: `${spec.label} ${fmtPx(tp)}`,
        x1: iStart / n,
        y1: toY(tp),
        x2: (n - 1) / n,
        y2: toY(tp),
        time1: t1,
        price1: tp,
        time2: tLast,
        price2: tp,
        confidence: 48 + i,
        color: spec.color,
        lineDash: spec.dash,
        category: 'smcDesk',
        noProject: true,
        labelTooltip: playbook.targetSourceNote || undefined,
      });
    });
  } else if (playbook.targetPrice != null && Number.isFinite(playbook.targetPrice)) {
    const tp = playbook.targetPrice;
    out.push({
      id: 'smc-entry-playbook-tp-1',
      kind: 'trendLine',
      label: `TP1 ${fmtPx(tp)}`,
      x1: iStart / n,
      y1: toY(tp),
      x2: (n - 1) / n,
      y2: toY(tp),
      time1: t1,
      price1: tp,
      time2: tLast,
      price2: tp,
      confidence: 48,
      color: 'rgba(148,163,184,0.55)',
      lineDash: '5 4',
      category: 'smcDesk',
      noProject: true,
    });
  }

  return out;
}
