import type { ReferenceItem } from '@/types/reference';

/** 기본 참조 라이브러리. 학습된 패턴(패턴 기억 AI)은 data/patterns.json + lib/patternMatcher.ts 참고 */
export const referenceLibrary: ReferenceItem[] = [
  {
    id: 'ref_001',
    title: 'Bull Flag + BOS continuation',
    tags: ['flag', 'bos', 'bullish', 'fvg'],
    patternType: 'flag',
    structureFeatures: { bos: true, choch: false, fvg: 2, ob: 1, sweep: true, pattern: 'flag', bias: 'bullish' },
    exampleBriefing: '상승 BOS 후 플래그 정리, FVG 터치 후 롱',
  },
  {
    id: 'ref_002',
    title: 'CHOCH + Liquidity sweep reversal',
    tags: ['choch', 'liquidity', 'bearish', 'sweep'],
    patternType: 'reversal',
    structureFeatures: { bos: false, choch: true, fvg: 1, ob: 0, sweep: true, pattern: 'sweep', bias: 'bearish' },
    exampleBriefing: '고점 유동성 스윕 후 CHOCH 하락 전환',
  },
  {
    id: 'ref_003',
    title: 'EQH/EQL + BOS breakout',
    tags: ['eqh', 'eql', 'bos', 'equilibrium'],
    patternType: 'breakout',
    structureFeatures: { bos: true, choch: true, fvg: 1, ob: 1, sweep: false, eqh: true, eql: true, bias: 'bullish' },
    exampleBriefing: '등가 고저선 확보 후 BOS 상승',
  },
  {
    id: 'ref_004',
    title: 'Symmetrical triangle + BOS',
    tags: ['triangle', 'bos', 'pattern'],
    patternType: 'triangle',
    structureFeatures: { bos: true, fvg: 1, ob: 0, pattern: 'triangle', bias: 'bullish' },
    exampleBriefing: '대칭 삼각형 수렴 후 BOS 방향 진입',
  },
  {
    id: 'ref_005',
    title: 'Bull wedge continuation',
    tags: ['wedge', 'bullish', 'pattern'],
    patternType: 'wedge',
    structureFeatures: { bos: true, fvg: 2, pattern: 'wedge', bias: 'bullish' },
    exampleBriefing: '상승 웨지 이탈 후 롱',
  },
  {
    id: 'ref_006',
    title: 'Bear wedge + OB rejection',
    tags: ['wedge', 'bearish', 'ob'],
    patternType: 'wedge',
    structureFeatures: { choch: true, ob: 2, pattern: 'wedge', bias: 'bearish' },
    exampleBriefing: 'OB 구간에서 웨지 하락 이탈',
  },
];

export function getReferenceById(id: string): ReferenceItem | undefined {
  return referenceLibrary.find(r => r.id === id);
}
