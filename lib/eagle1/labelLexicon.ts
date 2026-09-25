/**
 * 차트/HUD 영문 라벨 → 누구나 알 수 있는 쉬운 한글.
 * 화면 기본은 영어. hover = 한줄, click/long-press = 상세.
 */

export type Eagle1LabelExplain = {
  en: string;
  oneLineKo: string;
  detailKo: string;
};

const LEXICON: Record<string, Eagle1LabelExplain> = {
  'A+ LONG': {
    en: 'A+ LONG',
    oneLineKo: '여러 근거가 같은 가격대에서 롱으로 모인 자리',
    detailKo: '구조·존·흐름·과거 유사사례가 같은 방향(롱)으로 겹친 구간입니다. 확정 수익이 아니라 합의 자리입니다.',
  },
  'A+ SHORT': {
    en: 'A+ SHORT',
    oneLineKo: '여러 근거가 같은 가격대에서 숏으로 모인 자리',
    detailKo: '구조·존·흐름·과거 유사사례가 같은 방향(숏)으로 겹친 구간입니다. 확정 수익이 아니라 합의 자리입니다.',
  },
  ENTRY: {
    en: 'ENTRY',
    oneLineKo: '들어가 볼 가격 구간',
    detailKo: '감시·확정 진입 가격대입니다. 이미 지나갔으면 추격하지 않습니다.',
  },
  STOP: {
    en: 'STOP',
    oneLineKo: '틀리면 나오는 가격',
    detailKo: '이 가격을 넘어 마감되면 시나리오가 무효에 가깝습니다. 손절·무효화 기준입니다.',
  },
  TP1: {
    en: 'TP1',
    oneLineKo: '첫 목표',
    detailKo: '가장 가까운 익절 목표입니다. 도달 후 수익보호·본전 이동을 검토합니다.',
  },
  TP2: {
    en: 'TP2',
    oneLineKo: '두 번째 목표',
    detailKo: '첫 목표 이후 추가 목표가입니다. 무조건 기다리지 않습니다.',
  },
  TP3: {
    en: 'TP3',
    oneLineKo: '세 번째 목표',
    detailKo: '확장 목표가입니다. 흐름이 약해지면 중간에 종료할 수 있습니다.',
  },
  BREAK: {
    en: 'BREAK',
    oneLineKo: '가격이 선을 넘음',
    detailKo: '중요 선을 돌파한 단계입니다. 윅만으로는 확정하지 않고 마감·재시험을 봅니다.',
  },
  CLOSE: {
    en: 'CLOSE',
    oneLineKo: '봉 마감으로 확인',
    detailKo: '해당 타임프레임 종가로 돌파·이탈을 확인한 단계입니다.',
  },
  RETEST: {
    en: 'RETEST',
    oneLineKo: '다시 와서 확인',
    detailKo: '돌파 후 같은 구간을 다시 터치해 유효한지 확인하는 단계입니다.',
  },
  ACCEPT: {
    en: 'ACCEPT',
    oneLineKo: '돌파 후 안착',
    detailKo: '재시험까지 버티면 안착으로 봅니다. 실패하면 가짜 돌파일 수 있습니다.',
  },
  FAKE: {
    en: 'FAKE',
    oneLineKo: '가짜 돌파',
    detailKo: '선을 넘었다가 바로 되돌아온 상태입니다. 추격 진입을 피합니다.',
  },
  FAKE_BREAKOUT: {
    en: 'FAKE_BREAKOUT',
    oneLineKo: '가짜 돌파',
    detailKo: '상방·하방 돌파가 유지되지 못하고 실패한 상태입니다.',
  },
  SWEEP: {
    en: 'SWEEP',
    oneLineKo: '유동성 털기',
    detailKo: '고점·저점 근처 주문을 훑고 되돌아오는 움직임입니다.',
  },
  ABSORB: {
    en: 'ABSORB',
    oneLineKo: '흡수',
    detailKo: '한쪽 매도·매수를 받아내며 가격이 크게 안 밀리는 상태입니다.',
  },
  IMPULSE: {
    en: 'IMPULSE',
    oneLineKo: '강한 한 방',
    detailKo: '거래량·몸통이 큰 빠른 방향 이동입니다.',
  },
  SQUEEZE: {
    en: 'SQUEEZE',
    oneLineKo: '한쪽 청산이 몰리는 구간',
    detailKo: '포지션이 강제 청산되며 가격이 가속될 수 있는 상태입니다.',
  },
  CASCADE: {
    en: 'CASCADE',
    oneLineKo: '청산 연쇄',
    detailKo: '청산이 이어지며 같은 방향으로 가속하는 상태입니다.',
  },
  BUILDUP: {
    en: 'BUILDUP',
    oneLineKo: '스퀴즈가 쌓이는 준비',
    detailKo: '변동성 수축·OI 증가 등으로 스퀴즈 전 단계입니다. 확정 방향이 아닙니다.',
  },
  'A+ LONG': {
    en: 'A+ LONG',
    oneLineKo: '강한 롱 합의 구간',
    detailKo: '여러 조건이 겹치고 표본 승격을 통과한 롱 존입니다. 투자 권유가 아닙니다.',
  },
  'A+ SHORT': {
    en: 'A+ SHORT',
    oneLineKo: '강한 숏 합의 구간',
    detailKo: '여러 조건이 겹치고 표본 승격을 통과한 숏 존입니다. 투자 권유가 아닙니다.',
  },
  'SQUEEZE RADAR': {
    en: 'SQUEEZE RADAR',
    oneLineKo: '청산·스퀴즈 상태판',
    detailKo: '롱/숏 스퀴즈 단계입니다. 승률이 아닙니다.',
  },
  'LIQ ZONE': {
    en: 'LIQ ZONE',
    oneLineKo: '청산 유동성 가격대',
    detailKo: 'SSL/BSL 근처 청산이 몰릴 수 있는 구간입니다. 확정 기관 구간이 아닙니다.',
  },
  'TRADE OPPORTUNITY': {
    en: 'TRADE OPPORTUNITY',
    oneLineKo: '기회 등급',
    detailKo: 'A+/A/WAIT/NO ENTRY 등급입니다. 타점이 나쁘면 방향과 무관하게 NO ENTRY입니다.',
  },
  'STRATEGY FUSION': {
    en: 'STRATEGY FUSION',
    oneLineKo: '전략 합의 태그',
    detailKo: 'BREAKOUT·REVERSAL·COMPRESSION·TREND·A+만 표시합니다. 내부 전략 이름은 숨깁니다.',
  },
  'EXECUTION LEVELS': {
    en: 'EXECUTION LEVELS',
    oneLineKo: '진입·손절·목표',
    detailKo: 'MAIN ENTRY 1개와 STOP·TP1~3입니다. 전폭 가격선으로 그립니다.',
  },
  'COMBINATION MINING': {
    en: 'COMBINATION MINING',
    oneLineKo: '조합·레짐 통계',
    detailKo: 'family×regime 표본입니다. n이 30 미만이면 통계 부족입니다.',
  },
  'SCORE SPLIT': {
    en: 'SCORE SPLIT',
    oneLineKo: 'AI 점수와 검증확률 분리',
    detailKo: 'AI 점수는 합의 휴리스틱이고, 검증확률은 표본 기반입니다. OOD면 WAIT입니다.',
  },
  'POSITION SIZE': {
    en: 'POSITION SIZE',
    oneLineKo: '포지션 크기',
    detailKo: '계좌 위험%÷손절폭입니다. 레버리지로 먼저 크기를 정하지 않습니다.',
  },
  'HTF HISTORY': {
    en: 'HTF HISTORY',
    oneLineKo: '상위 타임프레임 히스토리',
    detailKo: '1M~4H CSV·커버리지 상태입니다. 빈 봉을 만들지 않습니다.',
  },
  'ORDER FLOW': {
    en: 'ORDER FLOW',
    oneLineKo: '수급·호가 채널',
    detailKo: 'CVD·OI·호가·OFI입니다. 없으면 데이터 없음이고, 가짜 CVD를 만들지 않습니다.',
  },
  'PROFILE LEVELS': {
    en: 'PROFILE LEVELS',
    oneLineKo: '거래량 프로파일',
    detailKo: 'POC·HVN·LVN입니다. 실전 모드는 POC와 HVN 1개까지입니다.',
  },
  'LIQUIDITY DEFENSE': {
    en: 'LIQUIDITY DEFENSE',
    oneLineKo: '유동성·방어',
    detailKo: '실시간 호가 방어·숨은 유동성 후보입니다. 기관 확정 문구는 쓰지 않습니다.',
  },
  'WALK-FORWARD': {
    en: 'WALK-FORWARD',
    oneLineKo: '워크포워드',
    detailKo: '시간순 Train·Val·Holdout입니다. 셔플 금지·비용 반영·홀드아웃 가중 미사용입니다.',
  },
  'MAIN ENTRY': {
    en: 'MAIN ENTRY',
    oneLineKo: '메인 진입구간',
    detailKo: '동시에 하나만 쓰는 진입 가격대입니다. 놓친 뒤에는 추격하지 않습니다.',
  },
  'NO ENTRY': {
    en: 'NO ENTRY',
    oneLineKo: '지금은 들어가면 안 됨',
    detailKo: '방향이 맞아도 타점·추격·재진입 차단이면 진입하지 않습니다.',
  },
  BREAKOUT: {
    en: 'BREAKOUT',
    oneLineKo: '돌파형 합의',
    detailKo: '돌파·지속 쪽 합의 태그입니다. 확정 수익이 아닙니다.',
  },
  REVERSAL: {
    en: 'REVERSAL',
    oneLineKo: '반전형 합의',
    detailKo: '반전 클러스터 쪽 합의 태그입니다.',
  },
  COMPRESSION: {
    en: 'COMPRESSION',
    oneLineKo: '압축형 합의',
    detailKo: '변동성 수축 구간 합의입니다.',
  },
  TREND: {
    en: 'TREND',
    oneLineKo: '추세형 합의',
    detailKo: '추세 따라가기 쪽 합의 태그입니다.',
  },
  'MTF SMART ZONE': {
    en: 'MTF SMART ZONE',
    oneLineKo: '합의 존 등급',
    detailKo: 'A+/A/WATCH 등급의 합의 구간입니다. 좌표는 확정 존을 움직이지 않습니다.',
  },
  'RE-ENTRY': {
    en: 'RE-ENTRY',
    oneLineKo: '끝난 뒤 새로 들어가 볼 자리',
    detailKo: '이전 트레이드가 끝난 뒤 새 조건으로만 다시 진입합니다. 옛 포지션을 이어가지 않습니다.',
  },
  'BIG MOVE METER': {
    en: 'BIG MOVE METER',
    oneLineKo: '큰 움직임 준비도',
    detailKo: '압축·확장 준비 정도입니다. 승률·확정 방향이 아닙니다.',
  },
  'MTF COMPASS': {
    en: 'MTF COMPASS',
    oneLineKo: '여러 시간대 방향',
    detailKo: '월~분 봉의 방향 화살입니다. 서로 다르면 충돌로 표시됩니다.',
  },
  'BREAK RAIL': {
    en: 'BREAK RAIL',
    oneLineKo: '돌파 진행 단계',
    detailKo: '접근→돌파→마감→재시험→안착 순서입니다.',
  },
  'BATTLE GAUGE': {
    en: 'BATTLE GAUGE',
    oneLineKo: '롱·숏 압력 비중',
    detailKo: '현재 수집된 흐름 비중입니다. 확률 보장 숫자가 아닙니다.',
  },
  'TRADE PLAN': {
    en: 'TRADE PLAN',
    oneLineKo: '진입·손절·목표 요약',
    detailKo: '엔진이 계산한 감시/확정 플랜입니다. 표본이 부족하면 통계 부족으로 표시합니다.',
  },
  'TRADE STATUS': {
    en: 'TRADE STATUS',
    oneLineKo: '지금 트레이드 단계',
    detailKo: '셋업부터 종료까지 어느 단계인지 보여 줍니다.',
  },
  'RANGE PRESSURE': {
    en: 'RANGE PRESSURE',
    oneLineKo: '가격대별 압력',
    detailKo: '최근 구간에서 매수·매도·POC 쪽 압력 위치를 표시합니다.',
  },
  'FLOW MOMENTUM': {
    en: 'FLOW MOMENTUM',
    oneLineKo: '수급 모멘텀',
    detailKo: '체결·호가 기반 압력 점수입니다. 데이터가 없으면 데이터 없음입니다.',
  },
  'MARKET STATE': {
    en: 'MARKET STATE',
    oneLineKo: '시장 상태',
    detailKo: '추세·횡보·압축 등 현재 맥락 라벨입니다.',
  },
  'ENTRY QUALITY': {
    en: 'ENTRY QUALITY',
    oneLineKo: '진입 자리 품질',
    detailKo: '거리·손절·합의 등으로 본 자리 품질입니다. 승률이 아닙니다.',
  },
  INVALIDATION: {
    en: 'INVALIDATION',
    oneLineKo: '무효 조건',
    detailKo: '이 조건이 나오면 현재 시나리오를 버립니다.',
  },
  WAIT: {
    en: 'WAIT',
    oneLineKo: '대기',
    detailKo: '확정 진입 조건이 아직 안 찼습니다.',
  },
  WATCH: {
    en: 'WATCH',
    oneLineKo: '감시',
    detailKo: '자리는 보이지만 확정 전입니다. 추격하지 않고 조건을 기다립니다.',
  },
  POC: {
    en: 'POC',
    oneLineKo: '거래가 가장 많이 몰린 가격',
    detailKo: '볼륨 프로파일의 최대 거래량 가격입니다.',
  },
  'CORE SUPPORT': {
    en: 'CORE SUPPORT',
    oneLineKo: 'CORE 지지',
    detailKo: '여러 근거가 겹친 핵심 지지 가격대입니다. 확정 수익·승률이 아닙니다.',
  },
  'CORE RESISTANCE': {
    en: 'CORE RESISTANCE',
    oneLineKo: 'CORE 저항',
    detailKo: '여러 근거가 겹친 핵심 저항 가격대입니다. 확정 수익·승률이 아닙니다.',
  },
  EQH: {
    en: 'EQH',
    oneLineKo: '비슷한 고점들',
    detailKo: '비슷한 높이의 고점이 모여 유동성이 쌓인 자리입니다.',
  },
  EQL: {
    en: 'EQL',
    oneLineKo: '비슷한 저점들',
    detailKo: '비슷한 높이의 저점이 모여 유동성이 쌓인 자리입니다.',
  },
  BOS: {
    en: 'BOS',
    oneLineKo: '구조 돌파',
    detailKo: '이전 고점·저점 구조가 깨진 신호입니다.',
  },
  CHOCH: {
    en: 'CHOCH',
    oneLineKo: '추세 전환 신호',
    detailKo: '기존 추세와 반대 구조가 나온 전환 후보입니다.',
  },
};

function normalizeKey(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** 정확 키 또는 접두(TRADE PLAN LONG …) 매칭 */
export function explainEagle1Label(raw: string): Eagle1LabelExplain {
  const en = String(raw || '').trim() || '—';
  const upper = normalizeKey(en);
  if (LEXICON[en]) return LEXICON[en]!;
  if (LEXICON[upper]) return LEXICON[upper]!;
  for (const [k, v] of Object.entries(LEXICON)) {
    if (upper.startsWith(normalizeKey(k))) return v;
  }
  return {
    en,
    oneLineKo: '엔진 라벨 · 확정 수익 아님',
    detailKo: `${en} — 내부 엔진 표시입니다. 투자 권유가 아니며, 데이터·표본이 없으면 데이터 없음/통계 부족으로 표시합니다.`,
  };
}

export function eagle1LabelTitleAttr(raw: string): string {
  return explainEagle1Label(raw).oneLineKo;
}
