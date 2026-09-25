/**
 * 파랑빨강띠 시각 AI — 차트 분석(독수리1호·마스터·안착)을 띠 위에 한 방향으로 붙인다.
 * 글자 나열 대신 롱구간/숏구간/안착. RES·위아래 동시 신호 금지.
 * 확정 수익·승률 아님.
 */
import type { AnalyzeResponse, OverlayItem } from '@/types';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { Eagle1MainPlan } from '@/lib/eagle1/signalEngine';
import type { MergedDeskRbMasterStance } from '@/lib/mergedDeskRbMasterStance';

type PrimaryLite = {
  direction?: 'LONG' | 'SHORT' | 'WAIT' | null;
  stateKo?: string;
  captionKo?: string;
};

export type RbVisualSide = 'LONG' | 'SHORT' | 'WAIT';
export type RbVisualSettle = '안착확정' | '감시' | '안착중' | '돌파중' | '놓침' | '실패' | '대기';

export type RbVisualVerdict = {
  side: RbVisualSide;
  zoneKo: '롱구간' | '숏구간' | '대기구간';
  settleKo: RbVisualSettle;
  candleHintKo: string;
};

const DETACHED_EN = /^(RES|SUP|NECK|BOS|CH|OB↑|OB↓|EQL|EQH)$/i;

function planSide(plan: Eagle1MainPlan | null | undefined): RbVisualSide | null {
  if (!plan) return null;
  if (plan.status === 'CONFIRMED_LONG' || plan.status === 'LONG_WATCH' || plan.status === 'LONG_MISSED') {
    return 'LONG';
  }
  if (plan.status === 'CONFIRMED_SHORT' || plan.status === 'SHORT_WATCH' || plan.status === 'SHORT_MISSED') {
    return 'SHORT';
  }
  return null;
}

function settleFromPlan(plan: Eagle1MainPlan | null | undefined): RbVisualSettle | null {
  if (!plan) return null;
  if (plan.status === 'CONFIRMED_LONG' || plan.status === 'CONFIRMED_SHORT') return '안착확정';
  if (plan.status === 'LONG_WATCH' || plan.status === 'SHORT_WATCH') return '감시';
  if (plan.status === 'LONG_MISSED' || plan.status === 'SHORT_MISSED') return '놓침';
  return null;
}

export function resolveRbVisualVerdict(params: {
  analysis?: AnalyzeResponse | null;
  stance?: MergedDeskRbMasterStance | null;
  primary?: PrimaryLite | null;
  coreSummaryKo?: string | null;
}): RbVisualVerdict {
  const plan = params.analysis?.eagle1MainPlan ?? null;
  const fromPlan = planSide(plan);
  const stanceSide = params.stance?.side ?? 'WAIT';
  const primaryDir = params.primary?.direction;
  const side: RbVisualSide =
    fromPlan ??
    (stanceSide === 'LONG' || stanceSide === 'SHORT' ? stanceSide : null) ??
    (primaryDir === 'LONG' || primaryDir === 'SHORT' ? primaryDir : 'WAIT');

  const core = String(params.coreSummaryKo || '');
  const edge = String(params.primary?.stateKo || params.primary?.captionKo || '');
  const settle: RbVisualSettle =
    settleFromPlan(plan) ??
    (/안착확정/.test(edge + core)
      ? '안착확정'
      : /돌파실패|실패/.test(edge + core)
        ? '실패'
        : /안착/.test(edge + core)
          ? '안착중'
          : /돌파/.test(edge + core)
            ? '돌파중'
            : side === 'WAIT'
              ? '대기'
              : '감시');

  const zoneKo = side === 'LONG' ? '롱구간' : side === 'SHORT' ? '숏구간' : '대기구간';
  const candleHintKo =
    settle === '안착확정'
      ? '확정봉 = 띠 밖 유지 마감'
      : settle === '실패'
        ? '실패봉 = 돌파 후 복귀'
        : settle === '놓침'
          ? '추격 금지 · 눌림/되돌림 대기'
          : '종가 마감 후 재확인';
  return { side, zoneKo, settleKo: settle, candleHintKo };
}

function isPrimaryRbBand(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  if (o.kind !== 'channelBand') return false;
  if (!id.startsWith('merged-desk-rb-') && !extra.includes('merged-desk-rb-channel')) return false;
  if (extra.includes('merged-desk-rb-mid') || extra.includes('merged-desk-rb-confluence')) return false;
  return extra.includes('merged-desk-rb-primary') || extra.includes('merged-desk-rb-visual-ai');
}

function isRbBand(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  return (
    o.kind === 'channelBand' &&
    (id.startsWith('merged-desk-rb-') || extra.includes('merged-desk-rb-channel') || extra.includes('merged-desk-blue-red-channel'))
  );
}

function markerLooksShort(m: AtlasPulseMarker): boolean {
  const t = `${m.text || ''} ${m.id || ''} ${m.color || ''}`.toLowerCase();
  if (m.position === 'aboveBar' && /▼|❌|숏|short|fail|down/.test(t)) return true;
  if (/#ef4444|#f43f5e|#fb7185|#e11d48/.test(String(m.color || '').toLowerCase())) return true;
  if (/\bshort\b|숏|▼|s★|s◆/.test(t)) return true;
  return m.position === 'aboveBar';
}

function markerLooksLong(m: AtlasPulseMarker): boolean {
  const t = `${m.text || ''} ${m.id || ''} ${m.color || ''}`.toLowerCase();
  if (m.position === 'belowBar' && /▲|✅|롱|long/.test(t)) return true;
  if (/#22c55e|#4ade80|#14b8a6|#2dd4bf/.test(String(m.color || '').toLowerCase())) return true;
  if (/\blong\b|롱|▲|l★|l◆/.test(t)) return true;
  return m.position === 'belowBar';
}

/** 최근 봉에서 롱·숏 동시 마커 제거. 과거 확정봉은 유지. */
export function filterRbVisualMarkers(
  markers: AtlasPulseMarker[],
  verdict: RbVisualVerdict,
  recentLimit = 10
): AtlasPulseMarker[] {
  if (!markers.length) return markers;
  const times = [...new Set(markers.map((m) => Number(m.time)).filter((t) => Number.isFinite(t)))].sort(
    (a, b) => a - b
  );
  const recent = new Set(times.slice(-Math.max(3, recentLimit)));
  const out: AtlasPulseMarker[] = [];
  const byTime = new Map<number, AtlasPulseMarker[]>();
  for (const m of markers) {
    const t = Number(m.time);
    if (!Number.isFinite(t)) continue;
    const arr = byTime.get(t) ?? [];
    arr.push(m);
    byTime.set(t, arr);
  }
  for (const [t, group] of byTime) {
    if (!recent.has(t) || verdict.side === 'WAIT') {
      if (verdict.side === 'WAIT' && recent.has(t) && group.length > 1) {
        const keep = group.filter((m) => /core-mk|rb-core/.test(String(m.id || '')));
        out.push(...(keep.length ? keep.slice(0, 1) : []));
        continue;
      }
      out.push(...group);
      continue;
    }
    const preferLong = verdict.side === 'LONG';
    const picked = group.filter((m) => (preferLong ? markerLooksLong(m) : markerLooksShort(m)));
    if (picked.length) {
      const core = picked.find((m) => /core-mk|confirm|fail|안착|확정/.test(`${m.id || ''}${m.text || ''}`));
      out.push(core ?? picked[0]!);
      continue;
    }
    const coreAny = group.find((m) => /core-mk/.test(String(m.id || '')));
    if (coreAny) out.push(coreAny);
  }
  return out;
}

export function applyMergedDeskRbVisualAi(params: {
  overlays: OverlayItem[];
  markers: AtlasPulseMarker[];
  analysis?: AnalyzeResponse | null;
  stance?: MergedDeskRbMasterStance | null;
  primary?: PrimaryLite | null;
  coreSummaryKo?: string | null;
}): { overlays: OverlayItem[]; markers: AtlasPulseMarker[]; verdict: RbVisualVerdict } {
  const verdict = resolveRbVisualVerdict(params);
  const sideCls = verdict.side === 'LONG' ? 'long' : verdict.side === 'SHORT' ? 'short' : 'wait';
  const hasRb = params.overlays.some(isRbBand);
  const overlays = params.overlays
    .map((o) => {
      if (!isPrimaryRbBand(o) && !isRbBand(o)) return o;
      if (!isPrimaryRbBand(o)) return o;
      const extra = String(o.overlayZoneExtraClass || '');
      return {
        ...o,
        label: `${verdict.zoneKo}·${verdict.settleKo}`,
        zoneFaceBase: verdict.zoneKo,
        zoneFaceSignal: verdict.settleKo,
        zoneFaceLang: 'ko' as const,
        overlayZoneExtraClass: `${extra} merged-desk-rb-visual-ai merged-desk-rb-visual--${sideCls} merged-desk-zone-label-on merged-desk-money-zone-keep`.trim(),
        labelTooltip: `${verdict.zoneKo} · ${verdict.settleKo} · ${verdict.candleHintKo} · 클릭: 구간 설명 · 확률 단정 아님`,
        labelBackgroundColor:
          verdict.side === 'LONG'
            ? 'rgba(21,128,61,0.96)'
            : verdict.side === 'SHORT'
              ? 'rgba(153,27,27,0.96)'
              : 'rgba(69,26,3,0.94)',
        labelTextColor: '#f8fafc',
      };
    })
    .filter((o) => {
      const id = String(o.id || '');
      const lab = String(o.zoneFaceBase || o.label || '')
        .split('·')[0]!
        .trim();
      if (!hasRb) {
        if (DETACHED_EN.test(lab)) {
          const ko = /^RES$/i.test(lab) ? '숏구간' : /^SUP$/i.test(lab) ? '롱구간' : lab;
          o.label = ko;
          o.zoneFaceBase = ko;
          o.zoneFaceLang = 'ko';
        }
        return true;
      }
      /** 파랑빨강띠가 있으면 축 멀리 RES/SUP/NECK 글자 숨김 — 롱/숏은 띠 라벨이 담당 */
      if (/^(RES|SUP|NECK)$/i.test(lab)) return false;
      if (id.includes('super-ai-knowledge-supply') && verdict.side !== 'SHORT') return false;
      if (id.includes('super-ai-knowledge-demand') && verdict.side !== 'LONG') return false;
      if (id.startsWith('merged-desk-rb-core-pin') && verdict.side !== 'WAIT') {
        const extraPin = String(o.overlayZoneExtraClass || '');
        if (verdict.side === 'LONG' && extraPin.includes('merged-desk-rb-core-pin--short')) return false;
        if (verdict.side === 'SHORT' && extraPin.includes('merged-desk-rb-core-pin--long')) return false;
      }
      if (DETACHED_EN.test(lab)) {
        const ko = lab === 'BOS' ? '구조돌파' : lab === 'CH' ? '추세전환' : lab;
        o.label = ko;
        o.zoneFaceBase = ko;
        o.zoneFaceLang = 'ko';
        o.overlayZoneExtraClass = `${String(o.overlayZoneExtraClass || '')} merged-desk-zone-label-on`.trim();
      }
      return true;
    });

  return {
    overlays,
    markers: filterRbVisualMarkers(params.markers, verdict),
    verdict,
  };
}
