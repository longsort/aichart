/**
 * Phase 20 — LabelInteraction.
 * 기본 영문 표시 · hover=한줄 · click/dblclick/tap/long-press=상세 한글.
 */
import { explainEagle1Label, type Eagle1LabelExplain } from './labelLexicon';

export type LabelInteractionKind = 'hover' | 'click' | 'dblclick' | 'tap' | 'longpress' | 'contextmenu' | 'keyboard';

export type LabelInteractionPayload = {
  kind: LabelInteractionKind;
  en: string;
  textKo: string;
  panel: boolean;
};

/** IMPLEMENTATION_PLAN 쉬운 말 예시 — UI 기본 카피 */
export const EAGLE1_EASY_KO: Record<string, string> = {
  'A+ LONG': '여러 근거가 같은 가격대에서 롱으로 모인 자리',
  'A+ SHORT': '여러 근거가 같은 가격대에서 숏으로 모인 자리',
  ENTRY: '들어가 볼 가격 구간',
  STOP: '틀리면 나오는 가격',
  TP1: '첫 목표',
  TP2: '두 번째 목표',
  TP3: '세 번째 목표',
  BREAK: '가격이 선을 넘음',
  CLOSE: '봉 마감으로 확인',
  RETEST: '다시 와서 확인',
  ACCEPT: '돌파 후 안착',
  FAKE: '가짜 돌파',
  SQUEEZE: '한쪽 청산이 몰리는 구간',
  'SQUEEZE RADAR': '롱·숏 청산 몰림 강도',
  'SQUEEZE ACTIVE': '청산 몰림이 진행 중',
  CASCADE: '청산이 연쇄로 이어지는 구간',
  'RE-ENTRY': '끝난 뒤 새로 들어가 볼 자리',
  'BIG MOVE METER': '큰 움직임 준비도',
  'MTF COMPASS': '여러 봉 주기 방향 나침반',
  'BREAK RAIL': '돌파·안착 단계',
  'FLOW SYNC': '수급 방향이 맞는지',
  'CLOCK FLOW': '정각 봉 흐름',
  'TRADE PLAN': '진입·손절·목표 계획',
  'TRADE STATUS': '지금 거래 단계',
  'TRADE OPPORTUNITY': '들어갈 자리 등급',
  'POSITION SIZE': '얼마 넣을지',
  'POSITION STATUS': '지금 포지션 상태',
  'MARKET STATE': '시장 상태',
  'ENTRY QUALITY': '진입 자리 품질',
  'ORDER FLOW': '체결·호가 흐름',
  'EXECUTION LEVELS': '실행용 진입·손절·목표',
  'SCORE SPLIT': 'AI점수와 검증확률은 다름',
  'HTF SUPPLY ZONE': '상위 시간대 매도 구간',
  'HTF DEMAND ZONE': '상위 시간대 매수 구간',
  'LONG BUILDUP': '롱 축적 구간',
  'SHORT BUILDUP': '숏 축적 구간',
  'LONG LIQUIDATION ZONE': '롱 청산이 몰릴 수 있는 구간',
  'SHORT LIQUIDATION ZONE': '숏 청산이 몰릴 수 있는 구간',
  CVD: '누적 매수·매도 차이',
  OFI: '주문 흐름 치우침',
  OI: '미결제약정',
  ORDERBOOK: '호가창',
  PRACTICAL: '실전 화면',
  RESEARCH: '연구 화면',
  ALL: '전체 표시',
  FLAT: '포지션 없음 · 대기',
  WAIT: '대기',
  LONG: '롱',
  SHORT: '숏',
};

export function resolveLabelExplain(raw: string): Eagle1LabelExplain {
  const trimmed = String(raw || '').trim();
  const base = explainEagle1Label(trimmed);
  let easy = EAGLE1_EASY_KO[trimmed] ?? EAGLE1_EASY_KO[base.en];
  if (!easy) {
    const key = Object.keys(EAGLE1_EASY_KO).find(
      (k) => trimmed === k || trimmed.startsWith(`${k} `) || trimmed.toUpperCase().startsWith(k.toUpperCase())
    );
    if (key) easy = EAGLE1_EASY_KO[key];
  }
  if (!easy) return base;
  return { ...base, oneLineKo: easy, detailKo: `${easy} · ${base.detailKo}` };
}

export function labelInteractionPayload(raw: string, kind: LabelInteractionKind): LabelInteractionPayload {
  const ex = resolveLabelExplain(raw);
  const panel = kind !== 'hover';
  return {
    kind,
    en: ex.en,
    textKo: panel ? ex.detailKo : ex.oneLineKo,
    panel,
  };
}

export const LABEL_LONG_PRESS_MS = 480;

export type LabelInteractionHandlers = {
  onHoverTitle: string;
  onActivate: () => void;
};

export function buildLabelInteractionHandlers(
  raw: string,
  onExplain: (detailKo: string) => void
): LabelInteractionHandlers {
  const hover = labelInteractionPayload(raw, 'hover');
  return {
    onHoverTitle: hover.textKo,
    onActivate: () => onExplain(labelInteractionPayload(raw, 'click').textKo),
  };
}
