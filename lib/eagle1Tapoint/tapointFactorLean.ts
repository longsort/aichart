/**
 * 팩터 체크리스트 종합 — 화면과 서버가 같은 식.
 * 줄마다 같은 색일 필요 없음. 맨 위 롱/숏 우세만 진입 판정에 씀.
 */
import type { TapointDecisionReport } from '@/lib/eagle1Tapoint/types';

export type FactorBias = 'long' | 'short' | 'neutral';

export type FactorRow = {
  label: string;
  strength: number;
  bias: FactorBias;
  signed: number;
  noteKo?: string;
};

export function rsi14(closes: number[]): number | null {
  if (closes.length < 16) return null;
  let g = 0;
  let l = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) g += d;
    else l -= d;
  }
  if (l === 0) return 100;
  const rs = g / l;
  return 100 - 100 / (1 + rs);
}

function signedFromBias(strength: number, bias: FactorBias): number {
  const mag = Math.max(0, Math.min(100, Math.round(strength)));
  if (bias === 'long') return mag;
  if (bias === 'short') return -mag;
  return 0;
}

export function buildTapointFactorRows(
  report: TapointDecisionReport | null | undefined,
  rsi: number | null | undefined
): FactorRow[] {
  const s = report?.scores;
  if (!s) return [];
  const dir = report?.direction;
  const dirBias: FactorBias =
    dir === 'LONG' ? 'long' : dir === 'SHORT' ? 'short' : 'neutral';
  const av = report?.sharedMerged?.advVolume;
  const face = report?.sharedMerged?.dailyFace;
  const flowBiasRaw = String(report?.flowSnap?.bias || '').toUpperCase();
  const flowBias: FactorBias =
    flowBiasRaw === 'BUY' || flowBiasRaw === 'BULL'
      ? 'long'
      : flowBiasRaw === 'SELL' || flowBiasRaw === 'BEAR'
        ? 'short'
        : dirBias;
  const regimeKo = String(report?.regimeKo || '');
  const regimeBias: FactorBias = /BULL|상승|매집|ACCUM/i.test(regimeKo)
    ? 'long'
    : /BEAR|하락|분산|DISTRIB/i.test(regimeKo)
      ? 'short'
      : dirBias;
  const locHint = (report?.macro || []).find((m) => m.location && m.location !== 'UNKNOWN');
  const locBias: FactorBias =
    locHint?.location === 'DISCOUNT'
      ? 'long'
      : locHint?.location === 'PREMIUM'
        ? 'short'
        : dirBias;
  const advBias: FactorBias =
    av?.action === 'long-ref' ? 'long' : av?.action === 'short-ref' ? 'short' : 'neutral';
  const advV =
    av == null
      ? 40
      : av.action === 'long-ref' || av.action === 'short-ref'
        ? av.notable
          ? 88
          : 72
        : av.notable
          ? 55
          : 40;
  const faceBias: FactorBias =
    face?.bias === 'up' ? 'long' : face?.bias === 'down' ? 'short' : 'neutral';
  const faceV =
    face == null
      ? 40
      : face.bias === 'flat'
        ? 45
        : faceBias === dirBias && dirBias !== 'neutral'
          ? 85
          : faceBias === 'neutral'
            ? 50
            : 32;
  const rsiN = rsi != null ? Math.round(rsi) : 50;
  const rsiSigned = Math.max(-100, Math.min(100, (rsiN - 50) * 2));
  const rsiBias: FactorBias =
    rsiSigned > 8 ? 'long' : rsiSigned < -8 ? 'short' : 'neutral';
  return [
    {
      label: '추세',
      strength: s.direction,
      bias: dirBias,
      signed: signedFromBias(s.direction, dirBias),
      noteKo: dir ? `${dir} 방향 합류` : '방향 미정',
    },
    {
      label: '지지저항',
      strength: s.location,
      bias: locBias,
      signed: signedFromBias(s.location, locBias),
      noteKo: locHint?.location || '위치',
    },
    {
      label: '유동성',
      strength: s.liquidity,
      bias: dirBias,
      signed: signedFromBias(s.liquidity, dirBias),
    },
    {
      label: '거래량',
      strength: s.event,
      bias: dirBias,
      signed: signedFromBias(s.event, dirBias),
    },
    {
      label: '선진거래량',
      strength: advV,
      bias: advBias,
      signed: signedFromBias(advV, advBias),
      noteKo: av?.actionKo || undefined,
    },
    {
      label: '일봉면',
      strength: faceV,
      bias: faceBias,
      signed: signedFromBias(faceV, faceBias),
      noteKo: face?.labelKo,
    },
    {
      label: 'CVD/흐름',
      strength: s.flow,
      bias: flowBias,
      signed: signedFromBias(s.flow, flowBias),
      noteKo: report?.flowSnap?.summaryKo,
    },
    {
      label: 'RSI',
      strength: Math.abs(rsiSigned),
      bias: rsiBias,
      signed: rsiSigned,
      noteKo: `RSI ${rsiN}`,
    },
    {
      label: '패턴/셋업',
      strength: s.setup,
      bias: dirBias,
      signed: signedFromBias(s.setup, dirBias),
    },
    {
      label: '레짐',
      strength: s.regime,
      bias: regimeBias,
      signed: signedFromBias(s.regime, regimeBias),
      noteKo: regimeKo || undefined,
    },
    {
      label: '실행확률',
      strength: s.entry,
      bias: dirBias,
      signed: signedFromBias(s.entry, dirBias),
      noteKo: '합류 참고 · 확정 아님',
    },
  ];
}

export function summarizeTapointFactorLean(rows: FactorRow[]): {
  longPct: number;
  shortPct: number;
  lean: FactorBias;
  leanKo: string;
} {
  let longW = 0;
  let shortW = 0;
  for (const f of rows) {
    if (f.signed > 0) longW += f.signed;
    else if (f.signed < 0) shortW += -f.signed;
  }
  const total = longW + shortW;
  const longPct = total > 0 ? Math.round((longW / total) * 100) : 50;
  const shortPct = 100 - longPct;
  const lean: FactorBias = longPct >= 58 ? 'long' : shortPct >= 58 ? 'short' : 'neutral';
  const leanKo = lean === 'long' ? '롱 우세' : lean === 'short' ? '숏 우세' : '롱숏 균형';
  return { longPct, shortPct, lean, leanKo };
}
