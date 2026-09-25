import type { OverlayItem } from '@/types';

/**
 * 통합 고급 완전판 **집중 덱**: 럭스/TV식으로 밴드·합성·스윙 레이어가 읽히게
 * 고래 자동존·핫존·스마트적응·비전·CP채널·다중 수급 면 등 과밀 소스를 차트 오버레이 묶음에서 제외.
 * (분석 API 응답 자체는 그대로 — 표시만 얇게.)
 */
export function mergedAdvancedFocusDeckKeepOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const cat = String(o.category || '');
  const kind = String(o.kind || '');

  if (id.startsWith('merged-')) return true;
  if (id.startsWith('month-desk-')) return true;
  if (id.startsWith('close-')) return true;
  if (id.startsWith('settlement-')) return true;
  if (
    id.startsWith('key-mustBreak-') ||
    id.startsWith('key-mustHold-') ||
    id.startsWith('key-invalidation-') ||
    id.startsWith('key-nextTarget-') ||
    id.startsWith('key-mustReclaim-')
  ) {
    return true;
  }

  if (id.startsWith('tailong-')) return true;

  if (id.startsWith('ls-plan-')) return false;
  if (id.startsWith('whale-')) return false;
  if (id.startsWith('hotzone-')) return false;
  if (id.startsWith('hypertrend-')) return false;
  if (id.startsWith('smart-adaptive-')) return false;
  if (id.startsWith('vision-')) return false;
  if (id.startsWith('cptc-')) return false;
  if (id.startsWith('parkf-')) return false;
  if (id.startsWith('diag-')) return false;
  if (id.startsWith('fusion-structure-')) return false;
  if (id.startsWith('smart-overlay-zone-')) return false;
  if (id.startsWith('structure-bounce-')) return false;

  if (cat === 'patternVision') return false;
  if (cat === 'chartPrimeTrendChannels') return false;
  if (cat === 'smartAdaptive') return false;
  if (cat === 'whaleToolkit') return false;
  if (cat === 'boswaves' || cat === 'vifvg' || cat === 'breakerBlocks') return false;
  if (cat === 'smcDesk') return false;

  if (kind === 'supplyZone' || kind === 'demandZone' || kind === 'ob' || kind === 'fvg' || kind === 'zone') return false;
  if (kind === 'reactionZone' || kind === 'bprZone') return false;
  if (kind === 'trendLine') return false;
  if (kind === 'bos' || kind === 'choch') return false;
  if (kind === 'fibLine' || cat === 'fib') return false;

  return false;
}
