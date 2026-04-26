import type { OverlayKind } from '@/types';

/**
 * 영어 차트 오버레이 라벨 → 한글 번역
 * 사용자가 "영어 관련 전부 한글 번역" 기능을 켜면 적용
 */
const EN_TO_KO: Record<string, string> = {
  // 구조
  BOS: '구조돌파',
  CHOCH: '추세전환',
  MSB: '시장구조전환',
  EQ: '균형',
  EQH: '균형고점',
  EQL: '균형저점',
  'EQ 0.5': '균형 0.5',
  'GP 0.382': '황금포켓 0.382',
  'GP 0.618': '황금포켓 0.618',

  // 존/구간
  FVG: '공정가치갭',
  OB: '롱·숏 구간',
  'OB Mit': '약함(완화)',
  'OB Early': '롱·숏 대기',
  'OB Early Mit': '약함(대기·완화)',
  // 과거 한글 라벨 → 통일 문구 (캐시·스냅샷 호환)
  '수요 블록(롱)': '롱확인',
  '공급 블록(숏)': '숏확인',
  '수요 블록·완화': '롱약함',
  '공급 블록·완화': '숏약함',
  '수요 선포착(롱)': '롱대기',
  '공급 선포착(숏)': '숏대기',
  '수요 선포착·완화': '롱약함',
  '공급 선포착·완화': '숏약함',
  /** 이전 패치 문구(확정) → 요청 문구(확인) */
  롱확정: '롱확인',
  숏확정: '숏확인',
  BPR: '균형가격구간',
  Target: '목표가',
  Sweep: '유동성스윕',
  Fake: '가짜돌파',
  'Kill Zone': '킬존',
  POI: '관심가격',
  High: '고점',
  Low: '저점',

  // 키레벨
  Support: '지지',
  Resistance: '저항',
  Break: '돌파',
  'Support Zone': '지지 구간',
  'Resistance Zone': '저항 구간',
  'Underneath Support': '하단지지선',
  'Overhead Resistance': '상단저항선',
  'Overhead Support': '상단저항선',
  Neckline: '목선',
  Breakout: '돌파',
  Retest: '재테스트',
  'Double Top': '더블탑',
  'Double Bottom': '더블바텀',

  // 신호/패턴
  RSI: 'RSI',
  'PO3 Acc': 'PO3 축적',
  'PO3 Man': 'PO3 조작',
  'PO3 Dist': 'PO3 분산',

  // 스윙
  HH: '고점고',
  LH: '고점저',
  HL: '저점고',
  LL: '저점저',

  // 캔들 패턴 (smc.ts 등)
  'Bullish Engulfing': '상승장악',
  'Bearish Engulfing': '하락장악',
  'Three Outside Up': '삼바깥상승',
  Doji: '도지',
  Hammer: '해머',
  'Hanging Man': '교수형',
  'Shooting Star': '유성',

};

/** 영어 라벨을 한글로 번역. 매핑 없으면 원문 반환 */
export function translateLabelToKo(label: string | undefined | null, enabled: boolean): string {
  if (!enabled || label == null) return String(label ?? '');
  const trimmed = String(label).trim();
  if (!trimmed) return trimmed;
  const exact = EN_TO_KO[trimmed];
  if (exact != null) return exact;
  // BOS / CHOCH / MSB + 단계 접미사(✓ ~ ✕ 등) 유지
  const struct = trimmed.match(/^(BOS|CHOCH|MSB)(\s+[\s\S]*)?$/);
  if (struct) {
    const base = struct[1] as keyof typeof EN_TO_KO;
    const suffix = struct[2] ?? '';
    const ko = EN_TO_KO[base];
    if (ko) return `${ko}${suffix}`;
  }
  return trimmed;
}

/** 실행 모드에서만: 타점 지지/저항 구간·선 라벨 끝의 ` · 75%` / ` · 지지 75%` 등 제거 */
const TAP_SUPPORT_RESISTANCE_IDS_HIDE_PCT = new Set([
  'tap-support-zone',
  'tap-resistance-zone',
  'tap-retest-support',
  'tap-resistance',
]);

export type ChartUiMode =
  | 'FULL'
  | 'FOCUS'
  | 'EXECUTION'
  | 'SMART'
  | 'MAX_ANALYSIS'
  | 'SMC_DESK'
  | 'SMC_DESK_COMPOSITE'
  | 'SMC_DELTA_DESK'
  | 'SMART_MONEY_MVP'
  | 'UNIFIED_DESK'
  | 'AI_ZONE'
  | 'CANDLE_ANALYSIS'
  | 'BIBLE_MODE'
  | 'HOT_ZONE'
  | 'TAPPOINT'
  | 'EVOLUTION'
  | 'WHALE';

/** 차트 오버레이에 실제로 보여줄 라벨 (실행 모드 % 숨김 → 선택적 한글 번역) */
export function overlayDisplayLabel(
  label: string | undefined | null,
  id: string | undefined,
  uiMode: ChartUiMode,
  translateLabelsToKo: boolean,
  kind?: OverlayKind
): string {
  let s = label == null ? '' : String(label);
  if ((uiMode === 'EXECUTION' || uiMode === 'EVOLUTION') && id && TAP_SUPPORT_RESISTANCE_IDS_HIDE_PCT.has(id)) {
    s = s.replace(/ · (?:지지 |저항 )?\d+%$/, '').trim();
  }
  const translated = translateLabelToKo(s, translateLabelsToKo);
  if (!translateLabelsToKo && kind && /^[A-Z]{1,6}$/.test(translated.trim()) && ['swingLabel'].includes(kind)) {
    return translateLabelToKo(translated, true);
  }
  return translated;
}
