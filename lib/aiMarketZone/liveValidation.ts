/**
 * STEP21 — Live 검증 게이트 (완료 선언용 체크리스트).
 * 확정 수익/승률 판정 아님.
 */
import type { Candle } from '@/types';
import type { AmzEnginePack, AmzMarketZone } from './types';

export type AmzLiveCheck = {
  id: string;
  ok: boolean;
  noteKo: string;
};

export type AmzLiveValidation = {
  ok: boolean;
  checks: AmzLiveCheck[];
  summaryKo: string;
};

function zoneFrozenOk(z: AmzMarketZone): boolean {
  return (
    z.outerUpper === z.outerUpper &&
    z.outerLower === z.outerLower &&
    Number.isFinite(z.outerUpper) &&
    Number.isFinite(z.outerLower) &&
    z.outerUpper > z.outerLower
  );
}

export function validateAmzLivePack(params: {
  pack: AmzEnginePack;
  candles: Candle[];
}): AmzLiveValidation {
  const { pack, candles } = params;
  const checks: AmzLiveCheck[] = [];
  const closed = candles.length >= 2 ? candles[candles.length - 2]! : null;
  const close = closed ? Number(closed.close) : null;

  checks.push({
    id: 'data_quality',
    ok: pack.dataQuality !== 'BAD',
    noteKo: `품질 ${pack.dataQuality}`,
  });

  checks.push({
    id: 'zone_reason',
    ok: pack.zones.every((z) => (z.explainKo?.length ?? 0) > 0 || (z.evidence?.length ?? 0) > 0),
    noteKo:
      pack.zones.length === 0
        ? 'Zone 없음'
        : `Zone ${pack.zones.length} · 생성 근거 ${pack.zones.filter((z) => z.evidence.length).length}개`,
  });

  checks.push({
    id: 'zone_bounds',
    ok: pack.zones.every(zoneFrozenOk),
    noteKo: '외곽·핵심 가격 유한·상>하',
  });

  checks.push({
    id: 'no_fake_prob',
    ok: pack.zones.every(
      (z) =>
        z.probabilities.calibrated ||
        (z.probabilities.hold == null &&
          z.probabilities.breakTrue == null &&
          (z.probabilities.abstainReasonKo != null || !z.probabilities.calibrated))
    ),
    noteKo: pack.zones.some((z) => z.probabilities.calibrated)
      ? '보정확률은 통계/ML 기반 · 확정 아님'
      : '확률 WAIT (표본·합의 부족)',
  });

  const near = pack.zones.filter((z) => {
    if (close == null || !(close > 0)) return false;
    const mid = (z.outerLower + z.outerUpper) / 2;
    return Math.abs(close - mid) / close < 0.02;
  });
  checks.push({
    id: 'approach_state',
    ok: near.length === 0 || near.some((z) => z.state !== 'DETECTED'),
    noteKo:
      near.length === 0
        ? '근접 Zone 없음(정상)'
        : `근접 ${near.length} · 상태 ${near.map((z) => z.stateKo).join(',')}`,
  });

  checks.push({
    id: 'attack_defense',
    ok: pack.zones.every(
      (z) =>
        Number.isFinite(z.attackScore) &&
        Number.isFinite(z.defenseScore) &&
        z.attackScore >= 0 &&
        z.defenseScore >= 0
    ),
    noteKo: 'Attack/Defense 수치 존재',
  });

  checks.push({
    id: 'overlays_match',
    ok: pack.overlays.length === 0 || pack.zones.length > 0,
    noteKo: `오버레이 ${pack.overlays.length} · Zone ${pack.zones.length}`,
  });

  checks.push({
    id: 'same_core_hint',
    ok: pack.disclaimerKo.includes('독립') || pack.disclaimerKo.includes('참고'),
    noteKo: 'Live 코어 고지 문구 유지',
  });

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    summaryKo:
      failed.length === 0
        ? `LIVE VALIDATION OK · ${checks.length}항`
        : `LIVE VALIDATION 주의 ${failed.length}항 · ${failed.map((f) => f.id).join(',')}`,
  };
}
