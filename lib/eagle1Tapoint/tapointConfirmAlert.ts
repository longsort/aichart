/**
 * 타점 CONFIRMED_LONG/SHORT 전환 → TG + 기기알림·진동.
 * 주문과 분리 · signalId 쿨다운 · 확정 수익 아님.
 */
import type { TapointDecisionReport } from '@/lib/eagle1Tapoint/types';
import { isTapointConfirmAlertOn } from '@/lib/eagle1Tapoint/config';
import { getTelegramSignalAuthHeaders } from '@/lib/telegramSignalAuthClient';
import {
  escapeTelegramHtml,
  tgHighlight,
  tgPrice,
  tgSide,
} from '@/lib/telegramFormatHtml';

export type TapointConfirmSide = 'LONG' | 'SHORT';

const DEDUP_KEY = 'ailongshort.tapoint.confirmAlert.v1';
const PREV_KEY = 'ailongshort.tapoint.confirmPrevDec.v1';
/** signalId당 재알림 쿨다운 */
export const TAPOINT_CONFIRM_COOLDOWN_MS = 18 * 60_000;
const FLASH_MS = 12_000;

type DedupMap = Record<string, number>;
type PrevMap = Record<string, string>;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, v: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function fmtPx(n: number | null | undefined): string {
  const x = Number(n);
  if (!(x > 0)) return '—';
  if (x >= 1000) return x.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (x >= 1) return x.toFixed(4);
  return x.toFixed(6);
}

export function isTapointConfirmedDecision(dec: string | null | undefined): boolean {
  return dec === 'CONFIRMED_LONG' || dec === 'CONFIRMED_SHORT';
}

export function tapointConfirmSideFromDecision(
  dec: string | null | undefined
): TapointConfirmSide | null {
  if (dec === 'CONFIRMED_LONG') return 'LONG';
  if (dec === 'CONFIRMED_SHORT') return 'SHORT';
  return null;
}

/** ARMED/WAIT 등 → CONFIRMED 전환만 true · 첫 시드(이전기록없음)는 알림 없음 */
export function detectTapointConfirmTransition(
  symbol: string,
  nextDecision: string | null | undefined
): TapointConfirmSide | null {
  const side = tapointConfirmSideFromDecision(nextDecision);
  const sym = String(symbol || '').toUpperCase();
  const prevMap = readJson<PrevMap>(PREV_KEY, {});
  const prev = String(prevMap[sym] || '');
  prevMap[sym] = String(nextDecision || '');
  writeJson(PREV_KEY, prevMap);
  if (!side) return null;
  /** 첫 관측은 시드만 · 새로고침 스팸 방지 */
  if (!prev) return null;
  if (isTapointConfirmedDecision(prev)) return null;
  return side;
}

function dedupOk(eventKey: string): boolean {
  const now = Date.now();
  const map = readJson<DedupMap>(DEDUP_KEY, {});
  const prev = Number(map[eventKey]) || 0;
  if (prev && now - prev < TAPOINT_CONFIRM_COOLDOWN_MS) return false;
  map[eventKey] = now;
  const keys = Object.keys(map);
  if (keys.length > 120) {
    const sorted = keys.sort((a, b) => (map[a] || 0) - (map[b] || 0));
    for (const k of sorted.slice(0, 60)) delete map[k];
  }
  writeJson(DEDUP_KEY, map);
  return true;
}

export function buildTapointConfirmTelegramHtml(params: {
  symbol: string;
  timeframe: string;
  side: TapointConfirmSide;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  signalId?: string | null;
  reasonKo?: string | null;
  entryScore?: number | null;
}): string {
  const chip = String(params.symbol || '')
    .toUpperCase()
    .replace(/USDT$/i, '');
  const sideKo = params.side === 'LONG' ? '확정롱' : '확정숏';
  const lines = [
    tgHighlight(`타점결정 · ${sideKo}`),
    `${escapeTelegramHtml(chip)} · ${escapeTelegramHtml(params.timeframe || '—')}`,
    '',
    `방향 ${tgSide(params.side)}`,
    `E ${tgPrice(fmtPx(params.entry))} · SL ${tgPrice(fmtPx(params.sl))} · TP ${tgPrice(fmtPx(params.tp))}`,
  ];
  if (params.entryScore != null && Number.isFinite(params.entryScore)) {
    lines.push(`진입점수 <b>${Math.round(Number(params.entryScore))}</b>`);
  }
  if (params.reasonKo) {
    lines.push('', escapeTelegramHtml(String(params.reasonKo).slice(0, 160)));
  }
  if (params.signalId) {
    lines.push(`id <code>${escapeTelegramHtml(String(params.signalId).slice(0, 64))}</code>`);
  }
  lines.push('', '<i>참고 신호 · 확정 수익·투자 권유 아님 · 주문과 별개</i>');
  return lines.join('\n');
}

export function playTapointConfirmDeviceAlert(side: TapointConfirmSide): void {
  if (typeof window === 'undefined') return;
  try {
    if ('vibrate' in navigator) {
      const pattern =
        side === 'SHORT' ? [220, 90, 220, 90, 320] : [180, 80, 180, 80, 260];
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
  try {
    const Ctx =
      (
        window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        }
      ).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const beep = (t: number, d: number, f: number, g: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.value = g;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + d);
      };
      if (side === 'SHORT') {
        beep(0, 0.12, 620, 0.07);
        beep(0.16, 0.14, 480, 0.08);
        beep(0.34, 0.18, 360, 0.07);
      } else {
        beep(0, 0.12, 880, 0.07);
        beep(0.16, 0.14, 1180, 0.08);
        beep(0.34, 0.16, 1320, 0.07);
      }
      window.setTimeout(() => {
        try {
          void ctx.close();
        } catch {
          /* ignore */
        }
      }, 700);
    }
  } catch {
    /* ignore */
  }
  try {
    if (!('Notification' in window)) return;
    const title = side === 'SHORT' ? '타점 · 확정숏' : '타점 · 확정롱';
    const body = '신호감지 · 타점결정 확정 · 참고(확정수익 아님)';
    const show = () => {
      try {
        new Notification(title, {
          body,
          tag: `tapoint-confirm-${side}`,
          requireInteraction: false,
        });
      } catch {
        /* ignore */
      }
    };
    if (Notification.permission === 'granted') show();
    else if (Notification.permission === 'default') {
      void Notification.requestPermission().then((p) => {
        if (p === 'granted') show();
      });
    }
  } catch {
    /* ignore */
  }
}

export type TapointConfirmAlertResult = {
  fired: boolean;
  side: TapointConfirmSide | null;
  flashUntil: number;
  eventKey: string | null;
  reasonKo: string;
};

/**
 * 확정 전환이면 기기알림 + (옵션) TG POST.
 * 주문 실행과 무관.
 */
export async function fireTapointConfirmAlert(
  report: TapointDecisionReport | null | undefined,
  opts?: { telegram?: boolean; forceDevice?: boolean }
): Promise<TapointConfirmAlertResult> {
  const empty: TapointConfirmAlertResult = {
    fired: false,
    side: null,
    flashUntil: 0,
    eventKey: null,
    reasonKo: '아님',
  };
  if (!report) return empty;

  /** 사용자 OFF면 TG·반짝임·알림 전부 스킵 (전환 시드는 유지) */
  const sym = String(report.symbol || '').toUpperCase();
  if (!isTapointConfirmAlertOn()) {
    /** OFF여도 prev 시드는 갱신해 ON 전환 직후 스팸 방지 */
    detectTapointConfirmTransition(sym, report.decision);
    return { ...empty, reasonKo: '확정알림 OFF' };
  }

  const side = detectTapointConfirmTransition(sym, report.decision);
  if (!side) {
    return { ...empty, reasonKo: '전환아님·이미확정' };
  }
  const sid = String(report.signalId || `${sym}-${report.decision}-${report.timeframe}`);
  const eventKey = `tap-confirm|${sym}|${sid}|${side}`;
  if (!dedupOk(eventKey)) {
    return { ...empty, side, eventKey, reasonKo: '쿨다운' };
  }

  playTapointConfirmDeviceAlert(side);

  if (opts?.telegram !== false) {
    try {
      const authH = await getTelegramSignalAuthHeaders();
      const html = buildTapointConfirmTelegramHtml({
        symbol: sym,
        timeframe: report.timeframe || '—',
        side,
        entry: report.entry,
        sl: report.sl,
        tp: report.tp1,
        signalId: report.signalId,
        reasonKo: report.reasonOneLineKo || report.rejectReasonKo,
        entryScore: report.scores?.entry,
      });
      await fetch('/api/telegram/tapoint-confirm', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({
          eventKey,
          symbol: sym,
          timeframe: report.timeframe,
          side,
          html,
          entry: report.entry,
          sl: report.sl,
          tp: report.tp1,
          signalId: report.signalId,
        }),
      });
    } catch {
      /* TG 실패해도 UI/진동은 유지 */
    }
  }

  return {
    fired: true,
    side,
    flashUntil: Date.now() + FLASH_MS,
    eventKey,
    reasonKo: side === 'SHORT' ? '확정숏 알림' : '확정롱 알림',
  };
}

export const TAPOINT_CONFIRM_FLASH_MS = FLASH_MS;
