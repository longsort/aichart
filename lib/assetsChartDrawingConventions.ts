/**
 * assets/CHART_OVERLAY_KEYS.md + DESIGN_SMC_ZONES_KO.md 기준 차트 작도 규칙.
 * analyze·Trade Atlas 오버레이에 이미지 스타일(점선 EQL/EQH, BPR 라벨, OB 상태, PRZ 색)을 적용.
 */
import type { OverlayItem } from '@/types';

export type AssetsDrawingGuideOptions = {
  /** 가격 라벨을 라인·존 캡션에 붙임 */
  showPriceInLabel?: boolean;
  /** Mitigated OB 점선·완화 표기 */
  smcZoneStateLabels?: boolean;
};

function fmtPx(p: number): string {
  if (!Number.isFinite(p)) return '–';
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function bandMid(o: OverlayItem): number | null {
  const p1 = o.price1;
  const p2 = o.price2;
  if (typeof p1 === 'number' && typeof p2 === 'number') return (p1 + p2) / 2;
  if (typeof p1 === 'number') return p1;
  return null;
}

function appendPrice(label: string, price: number | null, showPrice: boolean): string {
  if (!showPrice || price == null || !Number.isFinite(price)) return label;
  const base = String(label || '').trim();
  if (base.includes(fmtPx(price))) return base;
  return base ? `${base} · ${fmtPx(price)}` : fmtPx(price);
}

function obSideLabel(o: OverlayItem): string | null {
  const id = String(o.id || '');
  const label = String(o.label || '');
  if (/Bu-OB|Be-OB|Bu-BB|Be-BB|Bu-MB|Be-MB/i.test(label)) return null;
  if (o.kind === 'ob' || id.includes('-ob-')) {
    const bear = o.kind === 'supplyZone' || /be-|bear|숏|공급/i.test(label + id);
    const bull = o.kind === 'demandZone' || /bu-|bull|롱|수요/i.test(label + id);
    if (bear) return 'Be-OB';
    if (bull) return 'Bu-OB';
  }
  return null;
}

function harmonicPrzColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('1.27') && l.includes('ab')) return '#f87171';
  if (l.includes('1.27') || l.includes('0.618') || l.includes('0.786')) return '#60a5fa';
  if (l.includes('2.0') || l.includes('2.24') || l.includes('2.618')) return '#e2e8f0';
  return '#a78bfa';
}

/** 단일 오버레이에 assets 작도 규칙 적용 (불변 복사) */
export function applyAssetsDrawingConventionOne(
  o: OverlayItem,
  opts: AssetsDrawingGuideOptions = {}
): OverlayItem {
  const showPrice = opts.showPriceInLabel !== false;
  const smcState = opts.smcZoneStateLabels !== false;
  const kind = String(o.kind || '');
  const id = String(o.id || '');
  const cat = String(o.category || '');
  const next: OverlayItem = { ...o };

  if (kind === 'eqh' || kind === 'eql' || id.startsWith('eqh-') || id.startsWith('eql-') || id.startsWith('eqhl-') || id.startsWith('eqll-')) {
    next.lineDash = next.lineDash ?? '4 4';
    next.lineStrokeWidth = next.lineStrokeWidth ?? 1.5;
    const tag = kind === 'eql' || id.includes('eql') ? 'EQL' : 'EQH';
    const px = next.price1 ?? next.price2;
    next.label = appendPrice(tag, typeof px === 'number' ? px : null, showPrice);
    next.lineLabelColor = kind === 'eql' || id.includes('eql') ? '#38bdf8' : '#f472b6';
    next.overlayZoneExtraClass = [next.overlayZoneExtraClass, 'overlay-line--assets-eq'].filter(Boolean).join(' ');
    return next;
  }

  if (kind === 'bos' || kind === 'choch') {
    next.lineStrokeWidth = next.lineStrokeWidth ?? (kind === 'bos' ? 2 : 1.75);
    next.lineDash = next.lineDash ?? (kind === 'choch' ? '6 3' : undefined);
    const px = next.price1 ?? bandMid(next);
    if (!next.label || next.label === 'BOS' || next.label === 'CHoCH') {
      next.label = kind === 'bos' ? 'BOS' : 'CHoCH';
    }
    next.label = appendPrice(next.label, px ?? null, showPrice);
    next.overlayZoneExtraClass = [next.overlayZoneExtraClass, `overlay-line--assets-${kind}`].filter(Boolean).join(' ');
    return next;
  }

  if (kind === 'supportLine' || kind === 'resistanceLine') {
    const dashed = id.includes('mitig') || next.obMitigated;
    if (dashed) next.lineDash = next.lineDash ?? '5 4';
    next.lineStrokeWidth = next.lineStrokeWidth ?? 1.65;
    const px = next.price1 ?? bandMid(next);
    next.label = appendPrice(next.label || (kind === 'supportLine' ? 'Support' : 'Resistance'), px ?? null, showPrice);
    return next;
  }

  if (kind === 'keyLevel' && id.startsWith('key-')) {
    if (id.startsWith('key-invalidation-')) {
      next.lineDash = next.lineDash ?? '6 4';
      next.lineLabelColor = next.lineLabelColor ?? '#f87171';
    }
    if (id.startsWith('key-mustBreak-')) next.lineLabelColor = next.lineLabelColor ?? '#4ade80';
    if (id.startsWith('key-mustHold-')) next.lineLabelColor = next.lineLabelColor ?? '#38bdf8';
    const px = next.price1 ?? bandMid(next);
    next.label = appendPrice(next.label, px ?? null, showPrice);
    return next;
  }

  if (kind === 'bprZone' || cat === 'bpr') {
    next.overlayZoneExtraClass = [next.overlayZoneExtraClass, 'overlay-zone--assets-bpr'].filter(Boolean).join(' ');
    const mid = bandMid(next);
    next.labelTooltip = appendPrice(next.label, mid, showPrice);
    return next;
  }

  if (['ob', 'fvg', 'demandZone', 'supplyZone', 'reactionZone', 'zone'].includes(kind)) {
    const side = obSideLabel(next);
    let label = next.label || '';
    if (side && !label.includes(side)) label = label ? `${side} · ${label}` : side;
    if (smcState && next.obMitigated && !label.includes('완화')) {
      label = `${label} · 완화`.replace(/^ · /, '');
      next.lineDash = next.lineDash ?? '4 3';
      next.overlayZoneExtraClass = [next.overlayZoneExtraClass, 'overlay-zone--assets-mitigated'].filter(Boolean).join(' ');
    }
    if (next.zonePartialMitigation) {
      next.overlayZoneExtraClass = [next.overlayZoneExtraClass, 'overlay-zone--assets-partial'].filter(Boolean).join(' ');
    }
    next.label = label;
    const mid = bandMid(next);
    if (mid != null) next.labelTooltip = appendPrice(label, mid, showPrice);
    return next;
  }

  if (kind === 'po3Phase') {
    next.overlayZoneExtraClass = [next.overlayZoneExtraClass, 'overlay-zone--assets-po3'].filter(Boolean).join(' ');
    return next;
  }

  if (kind === 'harmonic' || kind === 'harmonicLeg' || cat === 'harmonic') {
    const px = next.price1 ?? bandMid(next);
    next.label = appendPrice(next.label || id.replace(/-/g, ' '), px ?? null, showPrice);
    const c = harmonicPrzColor(next.label);
    next.lineLabelColor = next.lineLabelColor ?? c;
    next.overlayZoneExtraClass = [next.overlayZoneExtraClass, 'overlay-zone--assets-harmonic'].filter(Boolean).join(' ');
    return next;
  }

  if (cat === 'patternVision' || id.includes('vision-')) {
    next.overlayZoneExtraClass = [next.overlayZoneExtraClass, 'overlay-zone--assets-vision'].filter(Boolean).join(' ');
    const px = next.price1 ?? bandMid(next);
    next.label = appendPrice(next.label, px ?? null, showPrice);
    return next;
  }

  if (kind === 'trendLine' || id.startsWith('diag-')) {
    if (id.includes('mitig') || id.includes('broken')) next.lineDash = next.lineDash ?? '5 4';
    return next;
  }

  if (id.startsWith('trade-atlas-')) {
    if (id === 'trade-atlas-sl') next.lineDash = next.lineDash ?? '6 4';
    return next;
  }

  return next;
}

export function applyAssetsChartDrawingConventions(
  overlays: OverlayItem[],
  opts?: AssetsDrawingGuideOptions
): OverlayItem[] {
  let bprIdx = 0;
  return overlays.map((o) => {
    const out = applyAssetsDrawingConventionOne(o, opts);
    if (out.kind === 'bprZone' || String(out.category) === 'bpr') {
      bprIdx += 1;
      if (!/^BPR\s*\d/i.test(out.label)) out.label = `BPR ${bprIdx}`;
    }
    return out;
  });
}

/** assets/overlays — 기하 데이터가 채워진 참조 JSON (CHART_OVERLAY_KEYS 샘플) */
export const ASSETS_POPULATED_OVERLAY_IDS = [
  'img024',
  'img031',
  'img035',
  'img038',
  'img067',
  'img083',
  'img110',
  'img117',
] as const;

export const ASSETS_DRAWING_GUIDE_SUMMARY_KO =
  'assets/CHART_OVERLAY_KEYS · SMC — EQL/EQH 점선, BPR 1·2, Bu/Be-OB 완화, PRZ 색, SL 점선';
