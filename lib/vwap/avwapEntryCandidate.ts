/**
 * AVWAP 줄선 위 롱/숏 **후보** 합류 게이트.
 * 카드·HUD 금지 · 확정 승률/확정 진입 문구 금지 · 기본 WAIT.
 *
 * 입력: 앱 분석(판정·Eagle1·HotZone·기관ST) + VWAP 리클레임/거부.
 * 인터넷 “전 세계 분석”이 아니라 **앱에 실제 연결된 엔진 합류**.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import { computeInstitutionalSuperTrendMeta } from '@/lib/institutionalSuperBand';
import type { AvwapLineSignalBias, AvwapLineSignalMarker } from './avwapLineSignal';
import { buildAvwapLineSignalPack } from './avwapLineSignal';

export type AvwapEntryCandidatePack = {
  bias: AvwapLineSignalBias;
  markers: AvwapLineSignalMarker[];
  titleKo: string;
  reasonsKo: string[];
  /** 합류 투표 수 (참고) */
  longVotes: number;
  shortVotes: number;
  entryAllowed: boolean;
};

type Vote = 'long' | 'short' | 'wait';

function voteFromVerdict(v: string | null | undefined): Vote {
  if (v === 'LONG') return 'long';
  if (v === 'SHORT') return 'short';
  return 'wait';
}

function voteFromEagle1(analysis: AnalyzeResponse | null | undefined): Vote {
  const plan = (analysis as { eagle1MainPlan?: { direction?: string; status?: string } } | null)
    ?.eagle1MainPlan;
  if (!plan) return 'wait';
  const d = String(plan.direction || '').toUpperCase();
  const st = String(plan.status || '').toUpperCase();
  if (st.includes('WAIT') || st.includes('MISS')) return 'wait';
  if (d === 'LONG') return 'long';
  if (d === 'SHORT') return 'short';
  return 'wait';
}

function voteFromHotZone(hz: MergedDeskHotZoneEntryPack | null | undefined, price: number): Vote {
  if (!hz || !(price > 0)) return 'wait';
  const below = hz.below;
  const above = hz.above;
  const touchBelow =
    below &&
    (below.status === 'TOUCH' || below.status === 'ENTER' || below.touchedNow) &&
    below.side === 'LONG';
  const touchAbove =
    above &&
    (above.status === 'TOUCH' || above.status === 'ENTER' || above.touchedNow) &&
    above.side === 'SHORT';
  if (touchBelow && !touchAbove) return 'long';
  if (touchAbove && !touchBelow) return 'short';
  if (below?.side === 'LONG' && price <= below.top && price >= below.bot) return 'long';
  if (above?.side === 'SHORT' && price >= above.bot && price <= above.top) return 'short';
  return 'wait';
}

function voteFromStructure(analysis: AnalyzeResponse | null | undefined): Vote {
  const snap = (analysis as { eagle1Structure?: { events?: Array<{ kind?: string; bias?: string }> } } | null)
    ?.eagle1Structure;
  const events = snap?.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (String(e.kind || '').toUpperCase() !== 'BOS') continue;
    if (e.bias === 'bullish') return 'long';
    if (e.bias === 'bearish') return 'short';
  }
  return 'wait';
}

/**
 * 초록/빨강 AVWAP 줄선용 진입 **후보**.
 * 규칙: VWAP 리클/상단 또는 거부/하단과 같은 방향 투표 ≥2 → 후보, 아니면 WAIT.
 */
export function buildAvwapEntryCandidatePack(params: {
  candles: Candle[];
  vwapLine: Array<{ time: number; value: number }>;
  lineTagKo: string;
  tone: 'green' | 'red';
  analysis?: AnalyzeResponse | null;
  hotZone?: MergedDeskHotZoneEntryPack | null;
  deskConsensus?: 'long' | 'short' | 'wait' | null;
}): AvwapEntryCandidatePack {
  const line = buildAvwapLineSignalPack({
    candles: params.candles,
    vwapLine: params.vwapLine,
    lineTagKo: params.lineTagKo,
    tone: params.tone,
  });

  const candles = params.candles ?? [];
  const closed = candles.length >= 2 ? candles[candles.length - 2]! : candles[candles.length - 1];
  const price = Number(closed?.close) || 0;
  const reasonsKo: string[] = [];

  const votes: Vote[] = [];
  const push = (v: Vote, reason: string) => {
    if (v === 'wait') return;
    votes.push(v);
    reasonsKo.push(reason);
  };

  /** 1) VWAP 줄선 자체 */
  if (line.bias === 'long') push('long', 'VWAP 상단·리클레임 쪽');
  else if (line.bias === 'short') push('short', 'VWAP 하단·거부 쪽');

  /** 2) 통합 판정 */
  const verd = voteFromVerdict(params.analysis?.verdict);
  if (verd === 'long') push('long', '통합판정 LONG');
  else if (verd === 'short') push('short', '통합판정 SHORT');

  /** 3) Eagle1 메인플랜 */
  const eg = voteFromEagle1(params.analysis);
  if (eg === 'long') push('long', 'Eagle1 플랜 롱');
  else if (eg === 'short') push('short', 'Eagle1 플랜 숏');

  /** 4) HotZone */
  const hz = voteFromHotZone(params.hotZone, price);
  if (hz === 'long') push('long', 'HotZone 지지 반응');
  else if (hz === 'short') push('short', 'HotZone 저항 반응');

  /** 5) 기관 SuperTrend */
  try {
    const st = computeInstitutionalSuperTrendMeta(candles);
    if (st?.lastDir === 'long') push('long', '기관ST 롱');
    else if (st?.lastDir === 'short') push('short', '기관ST 숏');
  } catch {
    /* optional */
  }

  /** 6) 구조 BOS */
  const bos = voteFromStructure(params.analysis);
  if (bos === 'long') push('long', '구조 BOS 상승');
  else if (bos === 'short') push('short', '구조 BOS 하락');

  /** 7) 데스크 합의(있으면) */
  if (params.deskConsensus === 'long') push('long', '데스크 합의 롱');
  else if (params.deskConsensus === 'short') push('short', '데스크 합의 숏');

  const longVotes = votes.filter((v) => v === 'long').length;
  const shortVotes = votes.filter((v) => v === 'short').length;

  let bias: AvwapLineSignalBias = 'wait';
  let entryAllowed = false;

  /** VWAP 방향과 일치 + 반대 투표보다 많고 ≥2 */
  if (longVotes >= 2 && longVotes > shortVotes && line.bias !== 'short') {
    bias = 'long';
    entryAllowed = line.bias === 'long' || longVotes >= 3;
  } else if (shortVotes >= 2 && shortVotes > longVotes && line.bias !== 'long') {
    bias = 'short';
    entryAllowed = line.bias === 'short' || shortVotes >= 3;
  }

  if (longVotes > 0 && shortVotes > 0 && Math.abs(longVotes - shortVotes) < 2) {
    bias = 'wait';
    entryAllowed = false;
    reasonsKo.push('롱·숏 합류 충돌 → 대기');
  }

  if (candles.length < 40) {
    bias = 'wait';
    entryAllowed = false;
    reasonsKo.push('캔들 표본 부족 → 대기');
  }

  const titleKo =
    bias === 'long' && entryAllowed
      ? `${params.lineTagKo} · 롱후보`
      : bias === 'short' && entryAllowed
        ? `${params.lineTagKo} · 숏후보`
        : bias === 'long'
          ? `${params.lineTagKo} · 롱관찰`
          : bias === 'short'
            ? `${params.lineTagKo} · 숏관찰`
            : `${params.lineTagKo} · 대기`;

  const markers: AvwapLineSignalMarker[] = [...line.markers];
  /** 형성봉 제외 마지막 확정봉에 후보 원 — 확정 진입 아님 */
  const t = Number(closed?.time);
  if (t > 0) {
    if (entryAllowed && bias === 'long') {
      markers.push({
        time: t,
        position: 'inBar',
        shape: 'circle',
        color: '#f8fafc',
        text: 'L',
        size: 2,
      });
    } else if (entryAllowed && bias === 'short') {
      markers.push({
        time: t,
        position: 'inBar',
        shape: 'circle',
        color: '#f8fafc',
        text: 'S',
        size: 2,
      });
    } else {
      markers.push({
        time: t,
        position: 'inBar',
        shape: 'circle',
        color: '#94a3b8',
        text: '·',
        size: 1.4,
      });
    }
  }

  if (!reasonsKo.length) reasonsKo.push('합류 근거 부족 · 대기');

  return {
    bias: entryAllowed ? bias : 'wait',
    markers,
    titleKo,
    reasonsKo: reasonsKo.slice(0, 8),
    longVotes,
    shortVotes,
    entryAllowed,
  };
}
