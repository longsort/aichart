/**
 * 일일 확정매매 캡 — 심볼별 localStorage.
 */
import {
  PP_PAPER_MAX_TRADES_PER_DAY,
  ppUtcDayKey,
} from '@/lib/profitPattern15m/paperPolicy';
import { PROFIT_PATTERN_SKILL_ID, ppNormalizeSymbol } from '@/lib/profitPattern15m/skill';

const KEY = 'ailongshort.profitPattern15m.dayCap.v2';

type DayCapState = { day: string; bySymbol: Record<string, number> };

function read(): DayCapState {
  if (typeof window === 'undefined') return { day: '', bySymbol: {} };
  try {
    const j = JSON.parse(window.localStorage.getItem(KEY) || '{}') as DayCapState;
    return {
      day: String(j.day || ''),
      bySymbol: j.bySymbol && typeof j.bySymbol === 'object' ? j.bySymbol : {},
    };
  } catch {
    return { day: '', bySymbol: {} };
  }
}

function write(s: DayCapState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function ppDayCapRemaining(
  symbol: string,
  nowSec = Math.floor(Date.now() / 1000)
): number {
  const day = ppUtcDayKey(nowSec);
  const sym = ppNormalizeSymbol(symbol);
  const s = read();
  if (s.day !== day) return PP_PAPER_MAX_TRADES_PER_DAY;
  return Math.max(0, PP_PAPER_MAX_TRADES_PER_DAY - (Number(s.bySymbol[sym]) || 0));
}

export function ppDayCapCanEnter(
  symbol: string,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  return ppDayCapRemaining(symbol, nowSec) > 0;
}

export function ppDayCapRecordTrade(
  symbol: string,
  nowSec = Math.floor(Date.now() / 1000)
): void {
  const day = ppUtcDayKey(nowSec);
  const sym = ppNormalizeSymbol(symbol);
  const s = read();
  if (s.day !== day) {
    write({ day, bySymbol: { [sym]: 1 } });
    return;
  }
  write({
    day,
    bySymbol: { ...s.bySymbol, [sym]: (Number(s.bySymbol[sym]) || 0) + 1 },
  });
}

export function ppDayCapWhyKo(
  symbol: string,
  nowSec = Math.floor(Date.now() / 1000)
): string {
  const left = ppDayCapRemaining(symbol, nowSec);
  const sym = ppNormalizeSymbol(symbol);
  if (left <= 0) {
    return `${PROFIT_PATTERN_SKILL_ID} · ${sym} 일일캡 ${PP_PAPER_MAX_TRADES_PER_DAY}회 소진`;
  }
  return `${PROFIT_PATTERN_SKILL_ID} · ${sym} 오늘 남은 ${left}/${PP_PAPER_MAX_TRADES_PER_DAY}`;
}
