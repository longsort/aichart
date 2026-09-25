/**
 * AIZONE 주도 진입 후보 — Tier S 묶음 필수.
 * AIZONE(면+방) + 일봉면/기관/로켓 + 수수료 순ROE + (SFP|흡수/스윕).
 * 장바구니/ethchart = 가산만 · 단독 진입 금지.
 * 확정 승률·수익 아님.
 */
import {
  aiZoneEntryGate,
  resolveAiZoneLongSl,
  resolveAiZoneShortSl,
  AIZONE_TARGET_ROE_PCT,
} from '@/lib/mergedDeskAiZoneEntryGate';
import {
  readAiZoneEntrySnapshot,
  type AiZoneEntrySnapshot,
} from '@/lib/mergedDeskAiZoneSnapshot';
import { aiZoneEvidenceGate } from '@/lib/mergedDeskAiZoneEvidenceGate';
import { aiZoneFeeRrGate } from '@/lib/mergedDeskAiZoneFeeGate';

export type AiZoneDriveRole = 'A' | 'B';

export type AiZoneDriveCandidate = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  score: number;
  signalKo: string;
  evidenceKo: string;
  source: 'ai-zone';
  role: AiZoneDriveRole;
  netRoePct: number;
  rr: number;
  analysisTags: string[];
};

export { aiZoneFeeRrGate };

function pickDirection(snap: AiZoneEntrySnapshot): 'LONG' | 'SHORT' | null {
  const lp = snap.longPct;
  const sp = snap.shortPct;
  if (lp == null && sp == null) return null;
  if (lp != null && sp != null) {
    if (lp >= sp && lp >= 67) return 'LONG';
    if (sp > lp && sp >= 67) return 'SHORT';
    return null;
  }
  if (lp != null && lp >= 67) return 'LONG';
  if (sp != null && sp >= 67) return 'SHORT';
  return null;
}

/**
 * AIZONE 주도 후보.
 * · SFP|흡수/스윕 트리거 필수 (A·B 공통)
 * · Evidence 실정렬 ≥1축 (soft만 통과 금지)
 * · 면·방·수수료는 entryGate 내부
 */
export function buildAiZoneDriveCandidate(params: {
  symbol: string;
  leverage: number;
  role: AiZoneDriveRole;
  snap?: AiZoneEntrySnapshot | null;
  price?: number | null;
  /** SFP 또는 흡수/스윕 — 필수 */
  triggerOk?: boolean;
  triggerKo?: string | null;
  /** 장바구니 등 가산 라벨 (단독 진입 사유 아님) */
  bonusKo?: string[] | null;
  minRr?: number;
}): AiZoneDriveCandidate | null {
  const symbol = String(params.symbol || '').toUpperCase();
  const snap = params.snap ?? readAiZoneEntrySnapshot(symbol);
  if (!snap) return null;
  const price = Number(params.price) > 0 ? Number(params.price) : Number(snap.price);
  if (!(price > 0)) return null;

  const direction = pickDirection(snap);
  if (!direction) return null;

  /** S 필수: SFP 또는 흡수/스윕 — 역할 무관 */
  if (!params.triggerOk) return null;

  const gate = aiZoneEntryGate({
    symbol,
    direction,
    price,
    leverage: params.leverage,
    snap,
  });
  if (!gate.allow) return null;

  const evidence = aiZoneEvidenceGate({ direction, price, snap });
  if (!evidence.ok) return null;
  /** soft만(정렬0) 금지 — 일봉면·기관·로켓 중 실정렬 필요 */
  if (evidence.alignedN < 1) return null;

  const sl =
    gate.suggestSl ??
    (direction === 'LONG'
      ? resolveAiZoneLongSl(snap.longZone ?? snap.buyFace, price)
      : resolveAiZoneShortSl(snap.shortZone ?? snap.sellFace, price));
  const tp = gate.suggestTp;
  if (!(sl != null && sl > 0) || !(tp != null && tp > 0)) return null;

  const fee = aiZoneFeeRrGate({
    entry: price,
    sl,
    tp,
    direction,
    leverage: params.leverage,
    minRr: params.minRr ?? 1.2,
  });
  if (!fee.ok) return null;

  const score = direction === 'LONG' ? Number(snap.longPct) || 0 : Number(snap.shortPct) || 0;
  const faceKo =
    snap.htfFace?.labelKo ||
    snap.chartFace?.labelKo ||
    (direction === 'LONG' ? '롱면' : '숏면');
  const roomKo =
    direction === 'LONG'
      ? `다음저항·ROE≈${AIZONE_TARGET_ROE_PCT}`
      : `다음지지·ROE≈${AIZONE_TARGET_ROE_PCT}`;
  const stackKo = [
    '면+방',
    faceKo,
    snap.institutionalBias ? `기관${snap.institutionalBias}` : null,
    snap.rocketDir ? `로켓${snap.rocketDir}` : null,
    params.triggerKo || 'SFP/흡수',
    `순ROE${fee.netRoePct.toFixed(1)}%`,
    `RR${fee.rr.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join('·');

  const tags = [
    'AIZONE',
    'TierS',
    evidence.summaryKo,
    params.triggerKo || '',
    ...(params.bonusKo || []),
  ].filter(Boolean);

  return {
    symbol,
    direction,
    entry: price,
    sl,
    tp,
    score,
    signalKo: `AIZONE주도${params.role} · ${direction} · ${stackKo} · ${roomKo}`,
    evidenceKo: `${evidence.reasonKo} · ${fee.reasonKo} · SL${sl.toFixed(0)} TP${tp.toFixed(0)}`,
    source: 'ai-zone',
    role: params.role,
    netRoePct: fee.netRoePct,
    rr: fee.rr,
    analysisTags: tags,
  };
}

/** 심볼 → A/B 역할 · BTC·ETH·SOL=A · XRP=B · 모두 Tier S 동일 게이트 */
export function aiZoneDriveRoleForSymbol(symbol: string): AiZoneDriveRole | null {
  const u = String(symbol || '').toUpperCase();
  if (u.startsWith('BTC') || u.startsWith('ETH') || u.startsWith('SOL')) return 'A';
  if (u.startsWith('XRP')) return 'B';
  return null;
}
