/**
 * §4 시간 마감 — Bitget 선물 기준(일·주·월 16:00 UTC = KST 01:00).
 * 마감 안 된 HTF 봉 = LIVE DEVELOPING · 확정 구조로 쓰지 않음.
 */
import {
  candleCloseRemainSec,
  candleCloseSessionTipKo,
  nextCandleCloseUnixSec,
} from '@/lib/closeSettlement';

export type TapHtfCloseStatus = {
  tf: string;
  /** 확정 봉만 구조에 사용 */
  useClosedOnly: boolean;
  developing: boolean;
  remainSec: number;
  nextCloseUnix: number;
  statusKo: '확정가능' | '거의확정' | '진행중(미확정)';
  tipKo: string;
};

const HTF_CLOSE_TFS = ['1d', '1w', '1M'] as const;

function normalizeTf(tf: string): string {
  const t = String(tf || '').trim();
  if (t === '1D' || t === '1d') return '1d';
  if (t === '1W' || t === '1w') return '1w';
  if (t === '1M') return '1M';
  return t;
}

export function tapHtfCloseStatus(
  tf: string,
  nowSec = Math.floor(Date.now() / 1000)
): TapHtfCloseStatus {
  const n = normalizeTf(tf);
  const tipKo = candleCloseSessionTipKo('bitget');
  if (!(HTF_CLOSE_TFS as readonly string[]).includes(n)) {
    return {
      tf: n,
      useClosedOnly: false,
      developing: false,
      remainSec: 0,
      nextCloseUnix: nowSec,
      statusKo: '확정가능',
      tipKo,
    };
  }
  const next = nextCandleCloseUnixSec(n, nowSec, 'bitget');
  const remain = candleCloseRemainSec(n, nowSec, 'bitget');
  const developing = remain > 0;
  const statusKo: TapHtfCloseStatus['statusKo'] =
    remain <= 300 ? '거의확정' : developing ? '진행중(미확정)' : '확정가능';
  return {
    tf: n,
    useClosedOnly: true,
    developing,
    remainSec: remain,
    nextCloseUnix: next,
    statusKo,
    tipKo,
  };
}

/** 진행중 HTF 봉이면 마지막 봉 제외(직전 확정 봉만) */
export function sliceClosedBarsForHtf<T>(
  bars: T[],
  tf: string,
  nowSec = Math.floor(Date.now() / 1000)
): { bars: T[]; droppedDeveloping: boolean; close: TapHtfCloseStatus } {
  const close = tapHtfCloseStatus(tf, nowSec);
  if (!close.useClosedOnly || !close.developing || bars.length < 2) {
    return { bars, droppedDeveloping: false, close };
  }
  return { bars: bars.slice(0, -1), droppedDeveloping: true, close };
}

export function tapMacroCloseBoard(nowSec = Math.floor(Date.now() / 1000)): TapHtfCloseStatus[] {
  return (['1d', '1w', '1M'] as const).map((tf) => tapHtfCloseStatus(tf, nowSec));
}
