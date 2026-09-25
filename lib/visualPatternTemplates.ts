/**
 * Visual Pattern Template 레지스트리.
 * 참고 이미지는 PNG 오버레이가 아니라 “구조→실루엣” 정의용.
 * 실제 표시는 캔들 피봇·구조 탐지 후 랜드마크에 SVG path를 맞춤.
 */
export type VisualPatternLifecycle =
  | 'FORMING'
  | 'CANDIDATE'
  | 'CONFIRMED'
  | 'FAILED'
  | 'INVALID';

export type VisualLandmarkId =
  | 'start'
  | 'end'
  | 'pivot1'
  | 'pivot2'
  | 'pivot3'
  | 'pivot4'
  | 'pivot5'
  | 'top'
  | 'bottom'
  | 'leftAnchor'
  | 'centerAnchor'
  | 'rightAnchor'
  | 'breakoutAnchor'
  | 'breakdownAnchor'
  | 'entryAnchor'
  | 'stopAnchor'
  | 'targetAnchor';

export type VisualSilhouetteKind =
  | 'elephant'
  | 'person'
  | 'butterfly'
  | 'heart'
  | 'eagle'
  | 'muscle'
  | 'ob_block'
  | 'supply_demand';

export type VisualPatternTemplate = {
  id: string;
  kind: VisualSilhouetteKind;
  labelKo: string;
  /** 차트에 짧게 표시할 구조 용어 */
  structureTerms: string[];
  /** 참고 이미지 설명 (등록용 메타 — 차트에 그리지 않음) */
  referenceNoteKo: string;
  /** viewBox 기준 path (실루엣만) */
  viewBox: string;
  pathD: string;
  /** 미완성(예: 코끼리 코) 점선 path — 없으면 생략 */
  formingPathD?: string;
  /** 템플릿 공간(0~1)에서 랜드마크 정규 좌표 */
  anchorsNorm: Partial<Record<VisualLandmarkId, { x: number; y: number }>>;
  /** 이 구조에 필요한 최소 피봇 수 */
  minPivots: number;
  bias: 'bullish' | 'bearish' | 'either';
};

/**
 * 내장 템플릿 — 하트·나비·코끼리·사람·독수리.
 * (이전 대화에서 SVG로 쓰이던 실루엣을 템플릿으로 정식 등록.
 *  사용자가 준 참고 PNG 원본은 워크스페이스에 없을 수 있음 — 이미지는 구조 정의 참고만.)
 */
export const VISUAL_PATTERN_TEMPLATES: readonly VisualPatternTemplate[] = [
  {
    id: 'butterfly-double-bottom',
    kind: 'butterfly',
    labelKo: '나비·이중바닥',
    structureTerms: ['DOUBLE BOTTOM', 'BREAKOUT', 'RETEST'],
    referenceNoteKo: 'Left breakdown → Bottom1 → Neckline → Bottom2 → Breakout',
    viewBox: '0 0 280 160',
    pathD:
      'M140 40 C108 18 52 36 40 78 C36 108 72 128 140 108 C140 108 140 70 140 40 Z M140 40 C172 18 228 36 240 78 C244 108 208 128 140 108 C140 108 140 70 140 40 Z',
    anchorsNorm: {
      leftAnchor: { x: 0.18, y: 0.72 },
      pivot1: { x: 0.32, y: 0.88 },
      centerAnchor: { x: 0.5, y: 0.42 },
      pivot2: { x: 0.68, y: 0.88 },
      rightAnchor: { x: 0.86, y: 0.55 },
      breakoutAnchor: { x: 0.92, y: 0.38 },
      bottom: { x: 0.5, y: 0.9 },
      top: { x: 0.5, y: 0.2 },
    },
    minPivots: 3,
    bias: 'bullish',
  },
  {
    id: 'heart-double-top',
    kind: 'heart',
    labelKo: '하트·이중천장',
    structureTerms: ['DOUBLE TOP', 'BREAKDOWN', 'RETEST'],
    referenceNoteKo: 'Top1 → Neck → Top2 → Breakdown',
    viewBox: '0 0 280 160',
    pathD:
      'M140 138 C48 92 28 40 72 22 C102 10 124 28 140 52 C156 28 178 10 208 22 C252 40 232 92 140 138 Z',
    anchorsNorm: {
      pivot1: { x: 0.34, y: 0.22 },
      centerAnchor: { x: 0.5, y: 0.48 },
      pivot2: { x: 0.66, y: 0.22 },
      breakdownAnchor: { x: 0.5, y: 0.88 },
      top: { x: 0.5, y: 0.12 },
      bottom: { x: 0.5, y: 0.9 },
      leftAnchor: { x: 0.18, y: 0.4 },
      rightAnchor: { x: 0.82, y: 0.4 },
    },
    minPivots: 3,
    bias: 'bearish',
  },
  {
    id: 'elephant-trunk',
    kind: 'elephant',
    labelKo: '코끼리',
    structureTerms: ['BREAKDOWN', 'SUPPORT', 'RESISTANCE'],
    referenceNoteKo: 'Run-up → Body consolidation → Head → Chin → Breakdown(코)',
    viewBox: '0 0 280 160',
    pathD:
      'M42 96 C48 54 78 30 118 28 C148 26 172 22 198 38 C218 50 228 66 224 82 C248 86 268 104 262 126 C238 134 210 124 196 110 C178 134 142 142 104 132 C72 122 50 110 42 96 Z',
    formingPathD: 'M208 72 C222 88 232 108 226 132 C220 146 208 150 200 142',
    anchorsNorm: {
      start: { x: 0.12, y: 0.7 },
      leftAnchor: { x: 0.28, y: 0.55 },
      centerAnchor: { x: 0.48, y: 0.4 },
      top: { x: 0.62, y: 0.22 },
      pivot1: { x: 0.7, y: 0.3 },
      breakdownAnchor: { x: 0.82, y: 0.85 },
      end: { x: 0.9, y: 0.78 },
      bottom: { x: 0.5, y: 0.88 },
    },
    minPivots: 2,
    bias: 'bearish',
  },
  {
    id: 'person-head-shoulders',
    kind: 'person',
    labelKo: '사람·머리어깨',
    structureTerms: ['H&S', 'BREAKDOWN', 'NECKLINE'],
    referenceNoteKo: 'Left shoulder → Head → Right shoulder → Neck break',
    viewBox: '0 0 280 160',
    pathD:
      'M36 118 C48 70 78 58 112 62 C124 64 132 68 140 68 C148 68 156 64 168 62 C202 58 232 70 244 118 L222 122 C214 86 186 78 140 78 C94 78 66 86 58 122 Z',
    anchorsNorm: {
      pivot1: { x: 0.22, y: 0.55 },
      top: { x: 0.5, y: 0.18 },
      pivot2: { x: 0.5, y: 0.2 },
      pivot3: { x: 0.78, y: 0.55 },
      centerAnchor: { x: 0.5, y: 0.62 },
      breakdownAnchor: { x: 0.55, y: 0.88 },
      leftAnchor: { x: 0.15, y: 0.7 },
      rightAnchor: { x: 0.85, y: 0.7 },
    },
    minPivots: 3,
    bias: 'bearish',
  },
  {
    id: 'eagle-recovery',
    kind: 'eagle',
    labelKo: '독수리',
    structureTerms: ['CHoCH', 'SWEEP', 'RECOVERY'],
    referenceNoteKo: 'Downtrend wing → Bottom body → CHoCH → Recovery wing',
    viewBox: '0 0 280 160',
    pathD:
      'M40 50 C70 30 100 70 140 90 C180 70 210 30 240 50 C220 90 180 120 140 130 C100 120 60 90 40 50 Z',
    anchorsNorm: {
      leftAnchor: { x: 0.16, y: 0.35 },
      bottom: { x: 0.5, y: 0.82 },
      centerAnchor: { x: 0.5, y: 0.55 },
      rightAnchor: { x: 0.84, y: 0.35 },
      breakoutAnchor: { x: 0.88, y: 0.28 },
      top: { x: 0.5, y: 0.22 },
      start: { x: 0.1, y: 0.25 },
      end: { x: 0.92, y: 0.3 },
    },
    minPivots: 3,
    bias: 'bullish',
  },
];

export function findVisualTemplateByKind(kind: VisualSilhouetteKind): VisualPatternTemplate | null {
  return VISUAL_PATTERN_TEMPLATES.find((t) => t.kind === kind) ?? null;
}

export function listVisualPatternTemplates(): VisualPatternTemplate[] {
  return [...VISUAL_PATTERN_TEMPLATES];
}
