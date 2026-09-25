/**
 * SMC 구조 마크(BOS/CHoCH) 단계 — 한글 라벨 (숏·롱 확정 아님, 구조 안착 참고).
 */
import type { StructureMarkPhase } from '@/lib/smcDeskOverlay';

export function structurePhaseLabelSuffix(phase: StructureMarkPhase): string {
  switch (phase) {
    case 'failed':
      return '·무효';
    case 'trace':
      return '·추적';
    case 'breakout':
      return '';
    case 'settling':
      return '·안착중';
    case 'confirmed':
      return '·구조안착';
    default:
      return '';
  }
}

export function structurePhaseTooltipExtra(phase: StructureMarkPhase): string {
  switch (phase) {
    case 'failed':
      return ' — 이후 종가가 레벨 안쪽으로 되돌아 무효';
    case 'trace':
      return ' — 돌파 직후 추적(연한 톤)';
    case 'breakout':
      return ' — 종가로 스윙 레벨 돌파 봉';
    case 'settling':
      return ' — 안착 진행(돌파 후 1봉 유지)';
    case 'confirmed':
      return ' — 마감 기준 레벨 3봉 이상 유지(구조 전환 참고, 진입 확정 아님)';
    default:
      return '';
  }
}

export function chochMarkerLabelKo(phase: StructureMarkPhase | string, developing?: boolean): string {
  if (phase === 'confirmed') return 'CHoCH·구조안착';
  if (phase === 'failed') return 'CHoCH·무효';
  if (phase === 'settling') return 'CHoCH·안착중';
  if (phase === 'breakout') return 'CHoCH';
  if (developing) return 'CHoCH·관찰';
  return 'CHoCH';
}
