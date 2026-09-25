/**
 * 텔레그램 신호 — 터치전/후·대응·현물%·선물 참고 브리핑 블록.
 * Telegram HTML은 글자색 미지원 → 이모지·굵게·밑줄·코드로 핵심 강조.
 * 조건부 참고 — 승률·수익 보장·투자 권유 아님.
 */
import {
  escapeTelegramHtml,
  tgHighlight,
  tgPrice,
  tgSection,
  tgWarn,
} from '@/lib/telegramFormatHtml';

export type TelegramPlaybookSide = 'LONG' | 'SHORT' | 'WAIT';

export type TelegramPlaybookPhase =
  | 'approach'
  | 'touch'
  | 'confirm'
  | 'invalid'
  | 'generic';

export type TelegramPlaybookInput = {
  side?: TelegramPlaybookSide;
  price: number;
  zoneBot?: number | null;
  zoneTop?: number | null;
  entry?: number | null;
  sl?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  phase?: TelegramPlaybookPhase;
  /** 짧은 기존 브리핑이 있으면 관찰란에 합침 */
  noteKo?: string | null;
};

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function pctMove(from: number, to: number): number | null {
  if (!(from > 0) || !(to > 0) || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

function fmtPct(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return '—';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

/** 상승(초록) / 하락(빨강) 강조 — 텔레는 색 대신 이모지 */
export function tgPctUp(text: string): string {
  return `<b>🟢 ${escapeTelegramHtml(text)}</b>`;
}

export function tgPctDown(text: string): string {
  return `<b>🔴 ${escapeTelegramHtml(text)}</b>`;
}

export function tgCheck(text: string): string {
  return `<b>✅ ${escapeTelegramHtml(text)}</b>`;
}

function basePx(p: TelegramPlaybookInput): number {
  const e = p.entry != null && p.entry > 0 ? p.entry : null;
  if (e) return e;
  const bot = p.zoneBot != null && p.zoneBot > 0 ? p.zoneBot : null;
  const top = p.zoneTop != null && p.zoneTop > 0 ? p.zoneTop : null;
  if (bot && top) return (bot + top) / 2;
  return p.price > 0 ? p.price : 0;
}

/**
 * 터치전 · 터치후 · 대응 · 현물% · 선물 주의 HTML 블록들.
 */
export function buildTelegramSignalPlaybookHtml(p: TelegramPlaybookInput): string {
  const side = p.side === 'LONG' || p.side === 'SHORT' ? p.side : 'WAIT';
  const phase = p.phase ?? 'generic';
  const base = basePx(p);
  const lines: string[] = [];

  // —— 터치 전 ——
  lines.push(tgSection('터치 전'));
  if (side === 'LONG') {
    lines.push(
      phase === 'approach' || phase === 'generic'
        ? `${tgCheck('접근')}: 지지·수요 구간 접근 중 · <b>추격 매수 자제</b> · 구간 안착·거절 캔들 대기`
        : `${tgCheck('사전')}: 지지 터치 직전 · 과매도 스파이크·가짜돌파 가능 · 분할·대기`
    );
  } else if (side === 'SHORT') {
    lines.push(
      phase === 'approach' || phase === 'generic'
        ? `${tgCheck('접근')}: 저항·공급 구간 접근 중 · <b>추격 매도 자제</b> · 거부·윗꼬리 대기`
        : `${tgCheck('사전')}: 저항 터치 직전 · 스파이크 돌파 후 되돌림 가능 · 분할·대기`
    );
  } else {
    lines.push(`${tgCheck('관찰')}: 방향 미확정 · 구간 터치·이탈만 주시 · 추격 금지`);
  }

  // —— 터치 후 반응 ——
  lines.push('', tgSection('터치 후 예상 반응'));
  if (side === 'LONG') {
    lines.push(
      `· <b>우호</b>: 지지 방어·아랫꼬리·종가 구간 위 → ${tgPctUp('반등·롱 관찰')}`
    );
    lines.push(
      `· <b>경계</b>: 종가 하단 이탈·거래량 동반 하방 → ${tgPctDown('나락·무효 쪽')}`
    );
    lines.push(`· <b>애매</b>: 횡보·와이크만 통과 → 재터치·상위TF 확인 후 대응`);
  } else if (side === 'SHORT') {
    lines.push(
      `· <b>우호</b>: 저항 거부·윗꼬리·종가 구간 아래 → ${tgPctDown('하락·숏 관찰')}`
    );
    lines.push(
      `· <b>경계</b>: 종가 상단 돌파·거래량 상방 → ${tgPctUp('돌파·무효 쪽')}`
    );
    lines.push(`· <b>애매</b>: 횡보·돌파 실패만 → 재터치·상위TF 확인 후 대응`);
  } else {
    lines.push(`· 터치만으로 방향 단정 금지 · 종가·거래량·MTF 합류 확인`);
  }

  if (phase === 'confirm') {
    lines.push(tgHighlight('현재 단계: 확정·합류 쪽 — 그래도 즉시 추격 아님'));
  } else if (phase === 'invalid') {
    lines.push(tgWarn('현재 단계: 무효·이탈 — 반대 방향·관망 우선'));
  } else if (phase === 'touch') {
    lines.push(tgHighlight('현재 단계: 터치 직후 — 종가·다음 1~2봉 반응 확인'));
  }

  // —— 대응 ——
  lines.push('', tgSection('대응 가이드'));
  if (side === 'LONG') {
    lines.push(`· <b>진입</b>: 구간 안착·반등 확인 후 · E 근처 분할 · 추격↑ 금지`);
    lines.push(`· <b>손절</b>: SL·구간 하단 종가 이탈 시 축소/청산 검토`);
    lines.push(`· <b>익절</b>: TP1 일부 · TP2/3 분할 · 무효 오면 즉시 재평가`);
    lines.push(`· <b>무효 후</b>: 숏 전환은 MTF·거래량 재확인 후에만`);
  } else if (side === 'SHORT') {
    lines.push(`· <b>진입</b>: 거부·하락 확인 후 · E 근처 분할 · 추격↓ 금지`);
    lines.push(`· <b>손절</b>: SL·구간 상단 종가 돌파 시 축소/청산 검토`);
    lines.push(`· <b>익절</b>: TP1 일부 · TP2/3 분할 · 무효 오면 즉시 재평가`);
    lines.push(`· <b>무효 후</b>: 롱 전환은 MTF·거래량 재확인 후에만`);
  } else {
    lines.push(`· 관망 · 터치·이탈 로그만 · 방향 확정 전 사이즈 최소화`);
  }

  // —— 현물 기준 % (선물 포지션 PnL ≠ 현물%) ——
  lines.push('', tgSection('현물 기준 이동폭'));
  lines.push(`<i>기준가 ${tgPrice(fmtPx(base))} (E 또는 구간 mid)</i>`);
  if (base > 0) {
    const rows: string[] = [];
    if (p.tp1 != null && p.tp1 > 0) {
      const pct = pctMove(base, p.tp1);
      const label = `TP1 ${fmtPx(p.tp1)} → ${fmtPct(pct)}`;
      rows.push(pct != null && pct >= 0 ? tgPctUp(label) : tgPctDown(label));
    }
    if (p.tp2 != null && p.tp2 > 0) {
      const pct = pctMove(base, p.tp2);
      const label = `TP2 ${fmtPx(p.tp2)} → ${fmtPct(pct)}`;
      rows.push(pct != null && pct >= 0 ? tgPctUp(label) : tgPctDown(label));
    }
    if (p.tp3 != null && p.tp3 > 0) {
      const pct = pctMove(base, p.tp3);
      const label = `TP3 ${fmtPx(p.tp3)} → ${fmtPct(pct)}`;
      rows.push(pct != null && pct >= 0 ? tgPctUp(label) : tgPctDown(label));
    }
    if (p.sl != null && p.sl > 0) {
      const pct = pctMove(base, p.sl);
      const label = `SL ${fmtPx(p.sl)} → ${fmtPct(pct)}`;
      rows.push(tgPctDown(`리스크 ${label}`));
    }
    if (rows.length) {
      lines.push(...rows.map((r) => `· ${r}`));
    } else if (p.zoneBot != null && p.zoneTop != null && p.zoneBot > 0 && p.zoneTop > 0) {
      const up = pctMove(base, Math.max(p.zoneTop, p.zoneBot));
      const dn = pctMove(base, Math.min(p.zoneTop, p.zoneBot));
      lines.push(`· ${tgPctUp(`구간 상단까지 ${fmtPct(up)}`)}`);
      lines.push(`· ${tgPctDown(`구간 하단까지 ${fmtPct(dn)}`)}`);
    } else {
      lines.push(`· E/SL/TP 미산출 · 구간·현재가만 참고`);
    }
  }

  lines.push('', tgSection('선물 참고'));
  lines.push(
    `${tgWarn('선물')}: 위 %는 <b>현물 가격 이동폭</b> · 레버리지·펀딩·청산가와 <b>다름</b>`
  );
  lines.push(
    `· 레버리지↑ → 동일 현물%에도 손익·청산 거리 급변 · <b>사이즈·청산가 필수 확인</b>`
  );
  lines.push(`· 신호는 조건부 참고 · 확정 수익·승률 보장 아님`);

  if (p.noteKo && String(p.noteKo).trim()) {
    lines.push('', tgSection('추가 관찰'), `<i>${escapeTelegramHtml(String(p.noteKo).trim().slice(0, 280))}</i>`);
  }

  return lines.join('\n');
}

/** plain caption용 (태그 없음) */
export function buildTelegramSignalPlaybookPlain(p: TelegramPlaybookInput): string {
  return buildTelegramSignalPlaybookHtml(p)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** 알림 kind → playbook phase */
export function telegramAlertKindToPhase(
  kind: string | null | undefined
): TelegramPlaybookPhase {
  const k = String(kind || '');
  if (k === 'invalid' || k === 'INVALID') return 'invalid';
  if (k === 'at_entry' || k === 'confirmed' || k === 'confirmed_full') return 'confirm';
  if (k === 'candidate' || k === 'approach') return 'approach';
  if (k.includes('touch') || k.includes('TOUCH')) return 'touch';
  return 'generic';
}
