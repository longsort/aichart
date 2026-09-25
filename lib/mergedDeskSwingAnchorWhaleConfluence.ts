/**
 * 스윙앵커 빅롱/빅숏 ↔ Bitget 고래 DNA(롱빔/숏빔) 합류.
 * 마커·막대 강조만 — 카드/HUD 금지.
 */
import type { WhaleBeamHit, WhaleBeamIntelPack, BeamKindKo } from '@/lib/whaleVolumeBeamIntel';
import type { SwingAnchorVolumeEvent } from '@/lib/mergedDeskSwingAnchorVolumeEvents';

export type SwingAnchorWhaleConfluence = {
  hit: WhaleBeamHit | null;
  beamKo: BeamKindKo;
  tierBtc: number;
  strength: number;
  aligned: boolean;
  conflict: boolean;
  boost: boolean;
};

function beamSide(beamKo: BeamKindKo, hit: WhaleBeamHit): 'long' | 'short' | 'neutral' {
  if (beamKo === '롱빔' || hit.move.dir === 'long') return 'long';
  if (beamKo === '숏빔' || hit.move.dir === 'short') return 'short';
  return 'neutral';
}

export function findWhaleBeamHitForBar(
  intel: WhaleBeamIntelPack | null,
  barIdx: number,
  barTime: number
): WhaleBeamHit | null {
  if (!intel) return null;
  const hits = [intel.live, ...intel.history].filter(Boolean) as WhaleBeamHit[];
  let best: WhaleBeamHit | null = null;
  let bestScore = -1;
  for (const hit of hits) {
    let score = 0;
    const inCluster =
      (barTime >= hit.volClusterTimeFrom && barTime <= hit.volClusterTimeTo) ||
      (barIdx >= hit.volClusterFromIdx && barIdx <= hit.volClusterToIdx);
    if (inCluster) score += 100;
    if (Math.abs(barIdx - hit.volIdx) <= 1) score += 80;
    if (Math.abs(barIdx - hit.barIdx) <= 2) score += 60;
    if (barTime >= hit.timeFrom && barTime <= hit.timeTo) score += 40;
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return bestScore >= 40 ? best : null;
}

export function resolveSwingAnchorWhaleConfluence(
  ev: SwingAnchorVolumeEvent,
  intel: WhaleBeamIntelPack | null
): SwingAnchorWhaleConfluence {
  const hit = findWhaleBeamHitForBar(intel, ev.barIdx, ev.time);
  if (!hit) {
    return {
      hit: null,
      beamKo: '관망',
      tierBtc: 0,
      strength: 0,
      aligned: false,
      conflict: false,
      boost: false,
    };
  }
  const beamKo = hit.beamKo;
  const side = beamSide(beamKo, hit);
  const aligned =
    (ev.side === 'long' && side === 'long') || (ev.side === 'short' && side === 'short');
  const conflict =
    (ev.side === 'long' && side === 'short') || (ev.side === 'short' && side === 'long');
  const boost = aligned && hit.tierBtc >= 3 && hit.beamKo !== '관망';
  return {
    hit,
    beamKo,
    tierBtc: hit.tierBtc,
    strength: hit.strength,
    aligned,
    conflict,
    boost,
  };
}

export function enrichSwingAnchorWithWhale(
  ev: SwingAnchorVolumeEvent,
  intel: WhaleBeamIntelPack | null
): SwingAnchorVolumeEvent {
  const c = resolveSwingAnchorWhaleConfluence(ev, intel);
  if (!c.hit) return ev;

  const markerKo = c.boost ? `${ev.markerKo}·${c.beamKo}` : ev.markerKo;
  let tooltipKo = ev.tooltipKo;
  if (c.boost) {
    tooltipKo = `${ev.tooltipKo} · 고래DNA ${c.beamKo} ${c.tierBtc}BTC · 합류참고`;
  } else if (c.conflict) {
    tooltipKo = `${ev.tooltipKo} · 고래DNA ${c.beamKo} 방향상이 · 주의`;
  } else if (c.beamKo !== '관망') {
    tooltipKo = `${ev.tooltipKo} · 고래DNA ${c.beamKo} 근접`;
  }

  return {
    ...ev,
    whaleBeamKo: c.beamKo,
    whaleTierBtc: c.tierBtc,
    whaleStrength: c.strength,
    whaleAligned: c.aligned,
    whaleConflict: c.conflict,
    whaleBoost: c.boost,
    markerKo,
    tooltipKo,
  };
}
