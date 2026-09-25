/**
 * AIZONE EvidenceGate — 점수(추정%)와 분리된 「근거 합류」.
 * 상승/하락면(일봉면 등) · 기관밴드 · 로켓 · 폭락/하락구간을 방향에 맞게 묶음.
 * 확정 승률·수익 아님 · 70~80% 보장 표현 금지.
 */
import type { AiZoneEntrySnapshot, AiZoneFaceBand } from '@/lib/mergedDeskAiZoneSnapshot';

export type AiZoneTfFace = {
  /** 예: 일봉면 · 4시간면 */
  baseKo: string;
  /** 상승 | 하락 | 반등 */
  signalKo: string;
  bias: 'up' | 'down';
  lo: number;
  hi: number;
  mid: number;
  labelKo: string;
};

export type EvidenceCheck = {
  id: string;
  ok: boolean;
  /** 데이터 없어 스킵(차단 아님) */
  soft?: boolean;
  detailKo: string;
};

export type AiZoneEvidenceResult = {
  ok: boolean;
  /** 정렬된 축 수 (면·기관·로켓·폭락) */
  alignedN: number;
  /** 반대 축(하드페일) */
  conflictN: number;
  checks: EvidenceCheck[];
  reasonKo: string;
  /** UI: 점수와 분리 표시용 */
  summaryKo: string;
};

function nearBand(price: number, band: AiZoneFaceBand, bufPct: number): boolean {
  const mid = band.mid > 0 ? band.mid : (band.lo + band.hi) / 2;
  const buf = Math.max(mid * (bufPct / 100), (band.hi - band.lo) * 0.35);
  return price >= band.lo - buf && price <= band.hi + buf;
}

function faceAligns(bias: 'up' | 'down', direction: 'LONG' | 'SHORT'): boolean {
  if (direction === 'LONG') return bias === 'up';
  return bias === 'down';
}

/**
 * EvidenceGate
 * - HTF면(일봉면 상승/하락)이 있으면 방향과 일치해야 함
 * - 기관밴드·로켓이 있으면 역행 금지 · 동의 시 가산
 * - 숏: 폭락/하락구간 근처면 가산
 * - 데이터 없음 = soft(통과) · 역행 = 차단
 * - 축이 2개 이상 있을 때 최소 1개 이상 정렬 필요(품질)
 */
export function aiZoneEvidenceGate(params: {
  direction: 'LONG' | 'SHORT';
  price: number;
  snap: AiZoneEntrySnapshot;
}): AiZoneEvidenceResult {
  const { direction, price, snap } = params;
  const checks: EvidenceCheck[] = [];
  let alignedN = 0;
  let conflictN = 0;
  let hardFail = false;

  const htf = snap.htfFace ?? null;
  if (!htf) {
    checks.push({
      id: 'htf-face',
      ok: true,
      soft: true,
      detailKo: '상위면(일봉면 등) 데이터없음 · soft',
    });
  } else if (faceAligns(htf.bias, direction)) {
    alignedN += 1;
    checks.push({
      id: 'htf-face',
      ok: true,
      detailKo: `${htf.labelKo || htf.baseKo} ${htf.signalKo} · ${direction}정렬`,
    });
  } else {
    conflictN += 1;
    hardFail = true;
    checks.push({
      id: 'htf-face',
      ok: false,
      detailKo: `${htf.labelKo || htf.baseKo} ${htf.signalKo} · ${direction}역행 · 차단`,
    });
  }

  const inst = snap.institutionalBias ?? null;
  if (!inst) {
    checks.push({
      id: 'institutional',
      ok: true,
      soft: true,
      detailKo: '기관밴드 판정없음 · soft',
    });
  } else if (inst === direction) {
    alignedN += 1;
    const nearInst =
      (direction === 'LONG' && snap.buyFace && nearBand(price, snap.buyFace, 0.5)) ||
      (direction === 'SHORT' && snap.sellFace && nearBand(price, snap.sellFace, 0.5));
    checks.push({
      id: 'institutional',
      ok: true,
      detailKo: nearInst
        ? `기관밴드 ${inst} · 면근접 · 정렬`
        : `기관밴드 ${inst} · 정렬`,
    });
  } else {
    conflictN += 1;
    hardFail = true;
    checks.push({
      id: 'institutional',
      ok: false,
      detailKo: `기관밴드 ${inst} · ${direction}역행 · 차단`,
    });
  }

  const rocket = snap.rocketDir ?? null;
  if (!rocket) {
    checks.push({
      id: 'rocket',
      ok: true,
      soft: true,
      detailKo: '로켓신호 없음 · soft',
    });
  } else if (rocket === direction) {
    alignedN += 1;
    checks.push({
      id: 'rocket',
      ok: true,
      detailKo: `로켓 ${rocket} · 정렬`,
    });
  } else {
    conflictN += 1;
    hardFail = true;
    checks.push({
      id: 'rocket',
      ok: false,
      detailKo: `로켓 ${rocket} · ${direction}역행 · 차단`,
    });
  }

  /** 폭락/하락구간 — 숏 가산 · 롱은 폭락존 한가운데 추격 금지(soft warn만, 기존 게이트가 극단 처리) */
  const dump = snap.dumpDeclineNear ?? null;
  if (direction === 'SHORT') {
    if (dump === true) {
      alignedN += 1;
      checks.push({
        id: 'dump-decline',
        ok: true,
        detailKo: '폭락·하락구간 근처 · 숏가산',
      });
    } else if (dump === false) {
      checks.push({
        id: 'dump-decline',
        ok: true,
        soft: true,
        detailKo: '폭락구간 비근접 · soft',
      });
    } else {
      checks.push({
        id: 'dump-decline',
        ok: true,
        soft: true,
        detailKo: '폭락구간 데이터없음 · soft',
      });
    }
  } else if (dump === true) {
    checks.push({
      id: 'dump-decline',
      ok: true,
      soft: true,
      detailKo: '폭락구간 근처 · 롱은 면·로켓 정렬 필수(가산없음)',
    });
  }

  /** 축이 실데이터로 2개 이상인데 정렬 0이면 품질 부족 */
  const presentAxes =
    (htf ? 1 : 0) + (inst ? 1 : 0) + (rocket ? 1 : 0) + (direction === 'SHORT' && dump === true ? 1 : 0);
  const qualityFail = !hardFail && presentAxes >= 2 && alignedN < 1;

  const ok = !hardFail && !qualityFail;
  const failParts = checks.filter((c) => !c.ok).map((c) => c.detailKo);
  const okParts = checks.filter((c) => c.ok && !c.soft).map((c) => c.detailKo);

  let reasonKo: string;
  if (hardFail) {
    reasonKo = `근거충돌 · ${failParts[0] || '역행'} · WAIT`;
  } else if (qualityFail) {
    reasonKo = `근거부족 · 면·기관·로켓 중 정렬0 · WAIT`;
  } else if (okParts.length) {
    reasonKo = `근거OK · ${okParts.slice(0, 3).join(' · ')}`;
  } else {
    reasonKo = '근거 soft통과 · 면·기관·로켓 미확정';
  }

  return {
    ok,
    alignedN,
    conflictN,
    checks,
    reasonKo,
    summaryKo: ok
      ? `근거OK(${alignedN}축)`
      : `근거차단(${conflictN}충돌/${alignedN}정렬)`,
  };
}
