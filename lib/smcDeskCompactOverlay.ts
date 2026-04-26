/**
 * SMC 데스크(TV 스타일 압축 뷰): 핫존·수급 존·구조(BOS/CHOCH)·CP 채널·하이퍼·DRS/LQB·핵심 S/R 중심.
 * 비전·하모닉·PO3·LVRB·VTS·시나리오 텍스트 등은 모드 프리셋에서 기본 OFF — 여기서는 잔여 오버레이도 걸러 냄.
 */
export function overlayMatchesSmcDeskCompactView(o: Record<string, unknown>): boolean {
  const id = String(o.id || '');
  const k = String(o.kind || '');
  const cat = String(o.category || '');

  if (cat === 'smartAdaptive' || id.startsWith('smart-adaptive-')) return true;
  if (cat === 'smcDesk') return true;

  if (id.startsWith('hotzone-')) return true;
  if (id.startsWith('hypertrend-')) return true;
  if (id.startsWith('whale-drs-')) return true;
  if (id.startsWith('whale-lqb-')) return true;
  if (id.startsWith('whale-predict-')) return true;
  if (id.startsWith('ai-auto-')) return true;

  if (cat === 'chartPrimeTrendChannels') return true;

  if (k === 'demandZone' || k === 'supplyZone' || k === 'ob' || k === 'fvg') return true;
  if (k === 'bos' || k === 'choch') return true;
  if (k === 'swingLabel' || k === 'poi' || k === 'liquiditySweep') return true;
  if (
    k === 'trendLine' &&
    (cat === 'chartPrimeTrendChannels' || cat === 'trendlineEngine' || cat === 'autoTrendline')
  ) {
    return true;
  }
  if (k === 'supportLine' || k === 'resistanceLine') return true;
  if (k === 'eqh' || k === 'eql') return true;

  if (/^major-(support|resistance)-\d+-(zone|line)$/.test(id)) return true;

  if (cat === 'strongZone') return true;

  if (k === 'candlePattern' || cat === 'candle') return true;

  if (id.startsWith('beam-')) return false;
  if (id.startsWith('close-') || id.startsWith('ls-plan-') || id.startsWith('settlement-')) return false;
  if (cat === 'patternVision' || cat === 'harmonic' || cat === 'po3') return false;
  if (k === 'harmonic' || k === 'harmonicLeg') return false;
  if (cat === 'rsi' || k === 'rsiSignal' || k === 'rsiDivergenceLine') return false;
  if (k === 'fibLine' || cat === 'fib') return false;
  if (k === 'scenario') return false;
  if (k === 'reactionZone' || cat === 'reactionZone') return false;
  if (k === 'bprZone' || cat === 'bpr') return false;
  if (k === 'po3Phase') return false;
  if (cat === 'lvrb') return false;
  if (cat === 'volatilityTrendScore') return false;
  if (k === 'symTriangleTarget') return false;

  if (k === 'zone') {
    if (id.startsWith('hotzone-')) return true;
    if (/^major-(support|resistance)-/.test(id)) return true;
    const label = String(o.label || '');
    if (/HOT-ZONE|핫/i.test(label)) return true;
    if (/Bu-|Be-|Buy-|Sell-|MB\(/i.test(label)) return true;
    return false;
  }

  return false;
}

/** TV 스타일 짧은 영문 존 캡션 — SMC 데스크에서 방향·확률 접미사 없이 표시 */
export function smcDeskShortZoneCaption(kind: string): string | null {
  switch (kind) {
    case 'supplyZone':
      return 'Supply';
    case 'demandZone':
      return 'Demand';
    case 'ob':
      return 'OB';
    case 'fvg':
      return 'FVG';
    default:
      return null;
  }
}

/**
 * 고래 툴킷 DRS/LQB 존 — 색만 있으면 의미를 모름 → SMC 데스크에서 짧은 한글 배지
 * (다른 모드는 기존처럼 면만 유지)
 */
export function smcDeskWhaleToolkitZoneBadge(id: string): string | null {
  if (id.startsWith('whale-drs-res')) return 'DRS·저항';
  if (id.startsWith('whale-drs-sup')) return 'DRS·지지';
  if (id === 'whale-lqb-bsl') return 'LQB·BSL';
  if (id === 'whale-lqb-ssl') return 'LQB·SSL';
  return null;
}

/** LinReg+OB+구조 합류 존 — Supply/Demand 영문 대신 짧은 한글 배지 */
export function smcDeskConfluenceZoneBadge(id: string): string | null {
  if (id === 'smc-desk-confluence-zone-long') return '합류·롱';
  if (id === 'smc-desk-confluence-zone-short') return '합류·숏';
  if (id === 'smc-desk-range-break-zone') return '구간·돌파';
  return null;
}
