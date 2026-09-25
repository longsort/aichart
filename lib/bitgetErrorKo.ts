/**
 * Bitget·거래소 영문 오류 → 사용자 표시용 한글.
 * 확정 수익 문구 아님.
 */
export function bitgetErrorToKo(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '주문 실패';

  const lower = s.toLowerCase();

  if (/stop loss price of the long.*less than the current/i.test(s)) {
    return '롱 손절가는 현재가보다 낮아야 함';
  }
  if (/stop loss price of the short.*greater than the current/i.test(s)) {
    return '숏 손절가는 현재가보다 높아야 함';
  }
  if (/take profit price of the long.*greater than the current/i.test(s)) {
    return '롱 익절가는 현재가보다 높아야 함';
  }
  if (/take profit price of the short.*less than the current/i.test(s)) {
    return '숏 익절가는 현재가보다 낮아야 함';
  }
  if (/45115|multiple of/i.test(s) || /price you enter should be a multiple/i.test(s)) {
    return '가격이 거래소 틱 단위와 안 맞음 · 반올림 후 재시도';
  }
  if (
    /40774/.test(s) ||
    /unilateral position/i.test(s) ||
    /order type for unilateral/i.test(s)
  ) {
    return '단방향(원웨이) 모드 불일치 · 원웨이로 맞춘 뒤 재시도';
  }
  if (/tradeSide|hold side|hedge|position mode/i.test(s) && /must|require|need|empty|fill/i.test(s)) {
    return '포지션 모드(단방향/헷지)와 주문 옵션이 안 맞음 · 자동 재시도';
  }
  if (/insufficient/i.test(lower) && /balance|margin|fund/i.test(lower)) {
    return '잔고·증거금 부족';
  }
  if (/position.*exist|already.*position|duplicate/i.test(lower)) {
    return '이미 포지션 있음';
  }
  if (/leverage/i.test(lower) && /fail|invalid|exceed/i.test(lower)) {
    return '레버리지 설정 실패';
  }
  if (/min.*trade|minimum.*size|size.*too small/i.test(lower)) {
    return '주문 수량이 최소치보다 작음';
  }
  if (/max.*position|position.*limit/i.test(lower)) {
    return '포지션·주문 한도 초과';
  }
  if (/live_instance_lock|다른 로컬 인스턴스|다른 인스턴스 보유|PAPER 강제/i.test(s)) {
    return '다른 실행 창이 실주문을 점유 중 · 죽은 락은 자동 회수됨 · 재시도';
  }
  if (/423/.test(s) && /lock|인스턴스/i.test(s)) {
    return '실주문 락 충돌 · 재시도하세요';
  }
  if (/rate limit|too many request/i.test(lower)) {
    return '요청 과다 · 잠시 후 재시도';
  }
  if (/market.*closed|symbol.*invalid|not support/i.test(lower)) {
    return '심볼·시장 주문 불가';
  }
  if (/reduce only|reduceOnly/i.test(lower)) {
    return '청산전용 주문 조건 오류';
  }
  if (/tradeside|hold side|position mode/i.test(lower)) {
    return '포지션 모드(단방향/헷지) 설정 확인 필요';
  }
  if (/parameter|invalid.*price|illegal/i.test(lower)) {
    return '주문 파라미터 오류';
  }
  if (/timeout|network|fetch failed/i.test(lower)) {
    return '네트워크·타임아웃';
  }
  if (s === 'ok' || s === 'OK') return '완료';

  /** 이미 한글이면 그대로 */
  if (/[가-힣]/.test(s) && !/[A-Za-z]{4,}/.test(s)) return s;

  /** 영문 잔여 — 짧게 감싸기 */
  const short = s.length > 80 ? `${s.slice(0, 77)}…` : s;
  return `거래소 거절 · ${short}`;
}

/** 코드+메시지 합쳐 한글화 */
export function bitgetFailMsgKo(code?: string | null, msg?: string | null): string {
  const ko = bitgetErrorToKo(msg);
  const c = String(code || '').trim();
  if (c && c !== '00000' && !ko.includes(c)) {
    return `${ko} (${c})`;
  }
  return ko;
}
