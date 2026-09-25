/**
 * Eagle1 HUD — 카드 영문 라벨 → 한글 (사용자 칩 토글).
 */

export type HudLangMode = 'en' | 'ko';

const LABEL_KO: Record<string, string> = {
  'AI FUTURES SYSTEM': 'AI 선물 시스템',
  PRACTICAL: '실전',
  RESEARCH: '연구',
  ALL: '전체',
  'BIG MOVE METER': '큰 움직임',
  'MTF COMPASS': 'MTF 나침반',
  'BREAK RAIL': '돌파 단계',
  'FLOW SYNC': '흐름 동기',
  'CLOCK FLOW': '시간대 흐름',
  'SQUEEZE RADAR': '압축 레이더',
  'POSITION STATUS': '포지션',
  'TRADE STATUS': '매매 단계',
  'MARKET STATE': '장 상태',
  COMPRESSION: '압축',
  'EXPANSION READINESS': '확장 준비',
  'FLOW DIRECTION': '흐름 방향',
  'VOLUME FLOW': '거래량 흐름',
  'ENTRY QUALITY': '진입 품질',
  'TRADE OPPORTUNITY': '매매 기회',
  'POSITION SIZE': '포지션 크기',
  'OVERLAY BUDGET': '작도 예산',
  'MAIN / ALT / BREAK PATH': '메인·대안·돌파 경로',
  'ORDER FLOW': '주문 흐름',
  'PROFILE LEVELS': '프로파일 레벨',
  'LIQUIDITY DEFENSE': '유동성 방어',
  'WALK-FORWARD': '워크포워드',
  'NEXT KEY LEVEL': '다음 핵심 레벨',
  INVALIDATION: '무효화',
  'PREDICTION SNAPSHOT': '예측 스냅샷',
  'UNIFIED ZONE': '통합 존',
  'FALSE BREAK': '가짜 돌파',
  'BREAK QUALITY': '돌파 품질',
  'LIQ ZONE': '청산 존',
  'SCORE SPLIT': '점수 분해',
  'HTF HISTORY': '상위 TF 이력',
  'EXECUTION LEVELS': '체결 레벨',
  'COMBINATION MINING': '조합 탐색',
  'STRATEGY FUSION': '전략 융합',
  'RE-ENTRY': '재진입',
  'MTF SMART ZONE': 'MTF 스마트 존',
  'COMBINATION ENGINE': '조합 엔진',
  '15M CLOCK FLOW': '15분 시간 흐름',
  'LOB RESILIENCY': '호가 회복력',
  'BITGET COVERAGE': 'Bitget 커버리지',
  'HISTORICAL OUTCOME': '과거 결과',
  'PREMIUM / DISCOUNT': '프리미엄·디스카운트',
  'AI SCORE': 'AI 점수',
  MARK: '마크',
  INDEX: '지수',
  OI: '미결제',
  FUNDING: '펀딩',
  ENTRY: '진입',
  STOP: '손절',
  TP: '목표',
  TP1: '목표1',
  TP2: '목표2',
  TP3: '목표3',
  RR: '손익비',
  SIZE: '크기',
  LONG: '롱',
  SHORT: '숏',
  WAIT: '대기',
  FLAT: '무포지션',
  TRIGGER: '트리거',
  TOTAL: '총점',
  WATCH: '감시',
  BUILDUP: '축적',
  READY: '준비',
  ACTIVE: '활성',
  CASCADE: '연쇄',
  SETUP: '세팅',
  WAITING: '대기중',
  TRIGGERED: '트리거됨',
  OPEN: '진입',
  BE: '본절',
  TRAIL: '트레일',
  EXIT: '청산',
  'STRUCTURE ACCEPTANCE': '구조 안착',
};

const TOKEN_KO: Record<string, string> = {
  LONG: '롱',
  SHORT: '숏',
  WAIT: '대기',
  FLAT: '무포지션',
  ENTRY: '진입',
  STOP: '손절',
  TP1: '목표1',
  TP2: '목표2',
  TP3: '목표3',
  RR: '손익비',
  ZONE: '존',
  SIZE: '크기',
  PM: '포지션관리',
  OOD: '분포이탈',
  AI: 'AI',
  SCORE: '점수',
  MARK: '마크',
  INDEX: '지수',
  FUNDING: '펀딩',
  WATCH: '감시',
  BUILDUP: '축적',
  READY: '준비',
  ACTIVE: '활성',
  CASCADE: '연쇄',
  SETUP: '세팅',
  WAITING: '대기',
  TRIGGERED: '발동',
  OPEN: '보유',
  BE: '본절',
  TRAIL: '트레일',
  EXIT: '청산',
  BID: '매수호가',
  ASK: '매도호가',
  Vacuum: '공백',
  NONE: '없음',
  ON_TRACK: '정상',
  INVALID: '무효',
  PATH: '경로',
  UNAVAILABLE: '불가',
};

export function resolveHudLabel(label: string, langKo: boolean): string {
  if (!langKo || !label) return label;
  const trimmed = label.trim();
  if (LABEL_KO[trimmed]) return LABEL_KO[trimmed];
  if (/^TRADE PLAN\b/i.test(trimmed)) {
    return trimmed
      .replace(/^TRADE PLAN/i, '매매플랜')
      .replace(/\bLONG\b/g, '롱')
      .replace(/\bSHORT\b/g, '숏')
      .replace(/\bWAIT\b/g, '대기')
      .replace(/\ · 감시$/, ' · 감시');
  }
  if (/^TRIGGER\s·/i.test(trimmed)) {
    return trimmed.replace(/^TRIGGER/i, '트리거').replace(/\bLONG\b/g, '롱').replace(/\bSHORT\b/g, '숏').replace(/\bWAIT\b/g, '대기');
  }
  if (/^AI SCORE$/i.test(trimmed)) return 'AI 점수';
  if (/^TOTAL$/i.test(trimmed)) return '총점';
  return trimmed;
}

export function resolveHudToken(token: string, langKo: boolean): string {
  if (!langKo) return token;
  const t = token.trim();
  return TOKEN_KO[t] ?? TOKEN_KO[t.toUpperCase()] ?? token;
}

export function resolveHudTradeRailStep(step: string, langKo: boolean): string {
  if (!langKo) return step;
  return TOKEN_KO[step] ?? step;
}

export function resolveHudSqueezeStep(step: string, langKo: boolean): string {
  if (!langKo) return step;
  return TOKEN_KO[step] ?? step;
}

export function resolveHudViewMode(mode: string, langKo: boolean): string {
  if (!langKo) return mode;
  return LABEL_KO[mode] ?? mode;
}

export const HUD_LANG_KEY = 'eagle1-hud-lang-ko';

export function readHudLangKo(): boolean {
  if (typeof window === 'undefined') return true;
  const v = window.localStorage.getItem(HUD_LANG_KEY);
  if (v === '0' || v === 'en') return false;
  if (v === '1' || v === 'ko') return true;
  return true;
}

export function persistHudLangKo(ko: boolean): void {
  try {
    window.localStorage.setItem(HUD_LANG_KEY, ko ? '1' : '0');
  } catch {
    /* ignore */
  }
}
