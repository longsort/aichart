/**
 * HTF → LTF confirmation sequence. Missing frame → 데이터 없음, no fake alignment.
 * Default ladder: 1D → 4H → 1H → 15m → 5m (then current TF if lower, e.g. 1m).
 */

import type { StructureSnapshot } from './structureEngine';

export type MtfFrameInput = {
  tf: string;
  structure: StructureSnapshot | null | undefined;
};

export type MtfFrameView = {
  tf: string;
  regime: string;
  state: string;
  bias: 'bullish' | 'bearish' | null;
};

export type MtfSequenceReport = {
  htfRegime: string;
  htfState: string;
  ltfState: string;
  aligned: boolean | null;
  sequence: string[];
  note: string;
  frames: MtfFrameView[];
};

export const MTF_LADDER = ['1D', '4H', '1H', '15m', '5m'] as const;

const TF_ALIAS: Record<string, string> = {
  '1d': '1D',
  '1D': '1D',
  '4h': '4H',
  '4H': '4H',
  '1h': '1H',
  '1H': '1H',
  '15m': '15m',
  '15M': '15m',
  '5m': '5m',
  '5M': '5m',
  '1m': '1m',
  '1min': '1m',
  '1W': '1W',
  '1w': '1W',
  '1M': '1M',
  '1mo': '1M',
};

const TF_KO: Record<string, string> = {
  '1D': '일봉',
  '4H': '4시간',
  '1H': '1시간',
  '15m': '15분',
  '5m': '5분',
  '1m': '1분',
  '1W': '주봉',
  '1M': '월봉',
};

export function normalizeMtfTf(tf: string): string {
  const s = String(tf || '').trim();
  return TF_ALIAS[s] || TF_ALIAS[s.toLowerCase()] || s;
}

export function mtfChainTfsForChart(chartTf: string): string[] {
  const n = normalizeMtfTf(chartTf);
  if (n === '1m') return [...MTF_LADDER];
  const i = MTF_LADDER.indexOf(n as (typeof MTF_LADDER)[number]);
  if (i < 0) return [...MTF_LADDER];
  return MTF_LADDER.slice(0, i + 1);
}

function tfKo(tf: string): string {
  const n = normalizeMtfTf(tf);
  return TF_KO[n] || n;
}

function frameBias(st: StructureSnapshot): 'bullish' | 'bearish' | null {
  const ev = [...st.events].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS' || e.kind === 'SWEEP');
  if (ev?.bias === 'bullish' || ev?.bias === 'bearish') return ev.bias;
  if (st.regime === 'BULL' || st.regime === 'STRONG_BULL') return 'bullish';
  if (st.regime === 'BEAR' || st.regime === 'STRONG_BEAR') return 'bearish';
  return null;
}

function stepLabel(tf: string, st: StructureSnapshot): string {
  const head = tfKo(tf);
  const ev = [...st.events].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS' || e.kind === 'SWEEP');
  if (ev?.kind === 'SWEEP') return `${head} 유동성털기(${ev.bias === 'bullish' ? '아래' : '위'})`;
  if (ev?.kind === 'CHOCH') return `${head} 추세전환`;
  if (ev?.kind === 'BOS') return `${head} 구조돌파`;
  if (st.state === 'RETEST') return `${head} 재확인`;
  if (st.state === 'CONFIRMED') return `${head} 확정`;
  if (st.state === 'SHIFT') return `${head} 추세전환`;
  return `${head} ${st.regime}`;
}

export function mtfFrameView(tf: string, st: StructureSnapshot | null | undefined): MtfFrameView {
  if (!st) {
    return { tf: normalizeMtfTf(tf), regime: '데이터 없음', state: '데이터 없음', bias: null };
  }
  return {
    tf: normalizeMtfTf(tf),
    regime: st.regime,
    state: st.state,
    bias: frameBias(st),
  };
}

function viewOf(tf: string, st: StructureSnapshot | null | undefined): MtfFrameView {
  return mtfFrameView(tf, st);
}

export function evaluateMtfSequence(params: {
  htf?: StructureSnapshot | null | undefined;
  ltf: StructureSnapshot;
  chain?: MtfFrameInput[] | null;
}): MtfSequenceReport {
  const ltf = params.ltf;
  const framesIn: MtfFrameInput[] =
    params.chain && params.chain.length
      ? params.chain
      : [
          { tf: 'HTF', structure: params.htf ?? null },
          { tf: 'LTF', structure: ltf },
        ];
  const frames = framesIn.map((f) => viewOf(f.tf, f.structure));
  const sequence: string[] = [];
  for (const f of framesIn) {
    if (!f.structure) {
      sequence.push(`${tfKo(f.tf)} 데이터 없음`);
      continue;
    }
    sequence.push(stepLabel(f.tf, f.structure));
  }

  let aligned: boolean | null = null;
  const known = frames.filter((f) => f.bias != null);
  for (let i = 1; i < known.length; i++) {
    const a = known[i - 1]!;
    const b = known[i]!;
    if (a.bias !== b.bias) {
      aligned = false;
      break;
    }
    aligned = true;
  }

  const present = frames.filter((f) => f.state !== '데이터 없음');
  const htf = present[0];
  const last = frames[frames.length - 1];

  let note = '정렬 판단 보류';
  if (!present.length) note = '상위 TF 구조 없음 — 정렬 단정 금지';
  else if (frames.some((f) => f.state === '데이터 없음') && aligned !== false) {
    note = aligned === true ? '있는 TF만 정합 — 빈 프레임은 단정 금지' : '정렬 판단 보류';
  } else if (aligned === false) note = '상위/하위 충돌 — 확정 억제';
  else if (aligned === true) note = '상위→하위 시퀀스 정합';

  return {
    htfRegime: htf?.regime ?? '데이터 없음',
    htfState: htf?.state ?? '데이터 없음',
    ltfState: last?.state ?? ltf.state,
    aligned,
    sequence,
    note,
    frames,
  };
}
