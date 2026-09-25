'use client';

/**
 * Mirage zone 선반영·후반영 스냅샷 — trade-learning 로컬 기록 (확정 수익 아님).
 */
import type { MirageZoneProactiveIntel, ZoneRole } from '@/lib/mergedDeskMirageZoneExchangeIntel';
import {
  extractMirageZoneLifecycleKo,
  inferMirageZoneRole,
  mirageZoneBaseCaption,
  stampMirageZoneIntelOnOverlay,
} from '@/lib/mergedDeskMirageZoneExchangeIntel';
import type { MirageZoneFaceLang } from '@/lib/mergedDeskMirageZoneCompactLabel';
import { isMergedDeskMirageTvZoneOverlay } from '@/lib/mergedAnalysisOverlayIds';
import { loadLearningState, type LearningState } from '@/lib/unifiedTrade';
import type { OverlayItem } from '@/types';

const MIRAGE_ZONE_SNAPSHOT_KEY = 'ailongshort-mirage-zone-intel-v1';

export type MirageZoneLearningSnapshot = {
  at: number;
  zoneId: string;
  symbol: string;
  timeframe: string;
  role: ZoneRole;
  captionKo: string;
  tagKo: string;
  reboundPct: number | null;
  touches: number;
  bounces: number;
  center: number;
  invalidation: number | null;
  reactiveKo: string | null;
};

let lastPersistMs = 0;

function loadSnapshots(): MirageZoneLearningSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MIRAGE_ZONE_SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MirageZoneLearningSnapshot[];
    return Array.isArray(parsed) ? parsed.slice(0, 64) : [];
  } catch {
    return [];
  }
}

function saveSnapshots(items: MirageZoneLearningSnapshot[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MIRAGE_ZONE_SNAPSHOT_KEY, JSON.stringify(items.slice(0, 64)));
  } catch {
    /* ignore */
  }
}

function persistToServer(state: LearningState): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastPersistMs < 25_000) return;
  lastPersistMs = now;
  void fetch('/api/trade-learning', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  }).catch(() => {});
}

/** zone 클릭·인텔 갱신 시 스냅샷 (중복 30초 억제) */
export function logMirageZoneIntelSnapshot(params: {
  zoneId: string;
  symbol: string;
  timeframe: string;
  role: ZoneRole;
  captionKo: string;
  intel: MirageZoneProactiveIntel | null;
  center: number;
  invalidation: number | null;
  reactiveKo?: string | null;
  reason?: 'select' | 'intel';
}): void {
  if (typeof window === 'undefined') return;

  const snap: MirageZoneLearningSnapshot = {
    at: Date.now(),
    zoneId: params.zoneId,
    symbol: params.symbol,
    timeframe: params.timeframe,
    role: params.role,
    captionKo: params.captionKo,
    tagKo: params.intel?.tagKo ?? '분석중',
    reboundPct: params.intel?.reboundPct ?? params.intel?.holdPct ?? null,
    touches: params.intel?.touches ?? 0,
    bounces: params.intel?.bounces ?? 0,
    center: params.center,
    invalidation: params.invalidation,
    reactiveKo: params.reactiveKo ?? null,
  };

  const prev = loadSnapshots().find(
    (s) =>
      s.zoneId === snap.zoneId &&
      s.symbol === snap.symbol &&
      s.timeframe === snap.timeframe &&
      s.tagKo === snap.tagKo &&
      Date.now() - s.at < 30_000
  );
  if (prev) return;

  const next = [snap, ...loadSnapshots()].slice(0, 48);
  saveSnapshots(next);

  const state = loadLearningState();
  const merged = {
    ...(state as LearningState & { mirageZoneSnapshots?: MirageZoneLearningSnapshot[] }),
    mirageZoneSnapshots: next.slice(0, 24),
  };
  persistToServer(merged as LearningState);
}

export function loadMirageZoneLearningSnapshots(): MirageZoneLearningSnapshot[] {
  return loadSnapshots();
}

export type MirageZoneLearningWeight = {
  zoneId: string;
  sampleCount: number;
  avgReboundPct: number | null;
  tagKo: string;
  weightClass: 'merged-ares-mlsp-tv-learn-high' | 'merged-ares-mlsp-tv-learn-mid' | 'merged-ares-mlsp-tv-learn-low';
};

function reboundFromSnap(s: MirageZoneLearningSnapshot): number | null {
  if (s.reboundPct != null && Number.isFinite(s.reboundPct)) return s.reboundPct;
  if (s.touches > 0 && s.bounces >= 0) return (s.bounces / s.touches) * 100;
  return null;
}

/** 동일 심볼·TF zone별 학습 스냅샷 집계 — 조건부 참고 */
export function buildMirageZoneLearningWeights(
  symbol: string,
  timeframe: string
): Record<string, MirageZoneLearningWeight> {
  const sym = String(symbol || '').trim();
  const tf = String(timeframe || '').trim();
  const rows = loadSnapshots().filter((s) => s.symbol === sym && s.timeframe === tf);
  const byZone = new Map<string, MirageZoneLearningSnapshot[]>();
  for (const s of rows) {
    const list = byZone.get(s.zoneId) ?? [];
    list.push(s);
    byZone.set(s.zoneId, list);
  }
  const out: Record<string, MirageZoneLearningWeight> = {};
  for (const [zoneId, snaps] of byZone) {
    const sampleCount = snaps.length;
    const rebounds = snaps.map(reboundFromSnap).filter((v): v is number => v != null);
    const avgReboundPct =
      rebounds.length > 0 ? rebounds.reduce((a, b) => a + b, 0) / rebounds.length : null;
    let weightClass: MirageZoneLearningWeight['weightClass'] = 'merged-ares-mlsp-tv-learn-mid';
    if (avgReboundPct != null) {
      if (avgReboundPct >= 62) weightClass = 'merged-ares-mlsp-tv-learn-high';
      else if (avgReboundPct < 42) weightClass = 'merged-ares-mlsp-tv-learn-low';
    } else if (sampleCount >= 4) {
      weightClass = 'merged-ares-mlsp-tv-learn-high';
    }
    const trustKo =
      weightClass === 'merged-ares-mlsp-tv-learn-high'
        ? '신뢰높음'
        : weightClass === 'merged-ares-mlsp-tv-learn-low'
          ? '신뢰낮음'
          : '신뢰보통';
    const tagKo = sampleCount >= 1 ? `${trustKo}·로그${sampleCount}` : trustKo;
    out[zoneId] = { zoneId, sampleCount, avgReboundPct, tagKo, weightClass };
  }
  return out;
}

/** 학습 로그 → zone 면 AI 라벨 보강 (면 라벨 유지·로그 세그먼트 추가) */
export function applyMirageZoneLearningToOverlays(
  overlays: OverlayItem[],
  symbol: string,
  timeframe: string,
  intelById?: Record<string, MirageZoneProactiveIntel>,
  opts?: { faceLang?: MirageZoneFaceLang; compact?: boolean }
): OverlayItem[] {
  const weights = buildMirageZoneLearningWeights(symbol, timeframe);
  if (!Object.keys(weights).length && !intelById) return overlays;
  return overlays.map((raw) => {
    if (!isMergedDeskMirageTvZoneOverlay(raw) || String(raw.kind) !== 'zone') return raw;
    const zoneId = String(raw.id || '');
    const w = weights[zoneId];
    const intel = intelById?.[zoneId];
    const role = inferMirageZoneRole(raw);
    const lifecycleKo = extractMirageZoneLifecycleKo(String(raw.label || ''));
    const base = mirageZoneBaseCaption(raw);
    const learningKo = w && w.sampleCount >= 1 ? w.tagKo : null;

    const extra = String(raw.overlayZoneExtraClass || '')
      .trim()
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('merged-ares-mlsp-tv-learn-'));
    if (w?.weightClass) extra.push(w.weightClass);

    let label = String(raw.label || '').trim();
    if (intel) {
      const stamped = stampMirageZoneIntelOnOverlay(raw, role, intel, {
        lifecycleKo,
        learningKo,
        faceLang: opts?.faceLang ?? 'ko',
        compact: opts?.compact !== false,
        priorTooltip: String(raw.labelTooltip || '').trim() || undefined,
      });
      label = stamped.label;
      return {
        ...stamped,
        label,
        labelTooltip:
          w && stamped.labelTooltip
            ? `${stamped.labelTooltip} · ${w.tagKo} (승률 아님)`
            : w
              ? `${stamped.labelTooltip || label} · ${w.tagKo} — 조건부 참고`
              : stamped.labelTooltip || label,
        overlayZoneExtraClass: extra.join(' '),
        zoneFillPreserve: true,
      };
    } else if (learningKo && !label.includes('신뢰')) {
      label = label ? `${label}·${learningKo}` : `${base}·${learningKo}`;
    }

    const prior = String(raw.labelTooltip || '').trim();
    return {
      ...raw,
      label,
      labelTooltip:
        w && prior
          ? `${prior} · ${w.tagKo} — 조건부 참고`
          : w
            ? `${w.tagKo} — 조건부 참고 · 승률 아님`
            : prior || label,
      overlayZoneExtraClass: extra.join(' '),
      zoneFillPreserve: true,
    };
  });
}
