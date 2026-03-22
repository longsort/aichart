/**
 * 클라이언트 식별자 — 기기/브라우저별 데이터 구분
 * localStorage에 저장, API 요청 시 헤더로 전송
 */

const KEY = 'ailongshort-client-id';

function generateId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(KEY);
    if (!id || id.length < 8) {
      id = generateId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return generateId();
  }
}
