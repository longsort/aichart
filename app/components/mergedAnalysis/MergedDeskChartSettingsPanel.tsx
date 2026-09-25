'use client';

/**
 * 통합모드 차트설정 — 통합 차트에 그려지는 분석만.
 * 유로맵식: 레이어 ON/OFF · 색 · 농도. 다른 모드 설정 없음.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  CHART_LABEL_FOCUS_EVENT,
  CHART_LABEL_LAYOUT_EVENT,
  CHART_LABEL_REGISTRY_EVENT,
  chartTextHideLabelKey,
  getLabelShift,
  isChartTextIdHidden,
  isChartTextPillLabelHidden,
  isChartTextWhiteLabelHidden,
  LABEL_SHIFT_X_MAX,
  LABEL_SHIFT_X_MIN,
  readHiddenChartTextIds,
  readLabelHShifts,
  readRenderedChartLabels,
  setChartTextIdVisible,
  setLabelHShift,
  setManyChartTextIdsVisible,
  stableOverlayLabelLayoutKey,
} from '@/lib/chartLabelLayoutStore';
import { THIS_MUCH_IDS } from '@/lib/mergedDeskThisMuchMeasure';
import {
  EUROMAP_GROUPS,
  getEuromapLayerStyle,
  MERGED_DESK_EUROMAP_LAYERS,
  type EuromapLayerDef,
} from '@/lib/mergedDeskEuromapStyle';
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type UserSettings,
} from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import {
  MERGED_DESK_CHART_DISPLAY_TICK_EVENT,
  OPEN_MERGED_DESK_CHART_SETTINGS_EVENT,
  resetMergedDeskChartDisplayAll,
} from '@/lib/mergedDeskChartDisplaySettings';
import { MergedDeskChartSettingsBlock } from '@/app/components/mergedAnalysis/MergedDeskChartSettingsBlock';

const PANEL_UI_KEY = 'ailongshort-merged-desk-chart-settings-ui-v2';
const PANEL_OPEN_SECTIONS_KEY = 'ailongshort-merged-desk-chart-settings-sections-v2';
const ZONE_LABEL_POSITION_KEY = 'ailongshort-zone-label-position';
const ZONE_LABEL_H_SHIFT_KEY = 'ailongshort-zone-label-h-shift';

type ZoneLabelPos = 'left' | 'center' | 'right';

export type MergedDeskLabelTarget = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelTargets?: MergedDeskLabelTarget[];
  symbol?: string;
};

function Chip(props: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className={`tool-chip tool-chip-button ${props.active ? 'tool-chip-active' : ''}`}
      onClick={props.onClick}
      title={props.title}
      style={{ padding: '5px 9px', fontSize: 11, ...props.style }}
    >
      {props.children}
    </button>
  );
}

function bumpDisplayTick() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MERGED_DESK_CHART_DISPLAY_TICK_EVENT));
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

function chartTextRowId(id: string): string {
  return String(id || '').replace(/#whitext$/, '');
}

function coreFaceBaseFromLabel(label: string): string | null {
  const t = String(label || '')
    .replace(/^흰글자·/, '')
    .replace(/^노랑·/, '')
    .replace(/^◆+/g, '')
    .trim();
  if (/핵심실패|핵심돌파\s*실패/.test(t)) return '핵심실패';
  const m = t.match(/^(핵심돌파|핵심안착|핵심실패)/);
  return m ? m[1] : null;
}

function looksLikeYellowChartText(id: string, label: string): boolean {
  if (String(label || '').startsWith('흰글자·') || String(label || '').startsWith('축·')) return false;
  const s = String(id || '').toLowerCase();
  const t = String(label || '');
  if (s.includes('rb-core') || s.includes('rb-gate') || s.includes('rb-ai-face')) return true;
  return /핵심돌파|핵심안착|핵심실패|단기상승|장기상승|상승추세|하락추세|회수관점|★/.test(t);
}

function looksLikeWhiteChartText(id: string, label: string): boolean {
  if (String(label || '').startsWith('흰글자·')) return true;
  const s = String(id || '').toLowerCase();
  const t = String(label || '');
  if (s.includes('rb-core-break') || s.includes('rb-core-settle') || s.includes('rb-core-fail')) return false;
  if (s.includes('mlsp') || s.includes('rb-ai') || s.includes('-gate')) return true;
  return /게이트|AI채널면|채널면|매수면|매도면|\$\$\$\$/.test(t);
}

export function MergedDeskChartSettingsPanel({ open, onOpenChange, labelTargets }: Props) {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    zone: true,
    channel: true,
    line: false,
    marker: false,
    volume: false,
    text: true,
    candle: false,
  });
  const [hiddenTextTick, setHiddenTextTick] = useState(0);
  const [labelShiftTick, setLabelShiftTick] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [zoneLabelPosition, setZoneLabelPositionState] = useState<ZoneLabelPos>(() => {
    if (typeof window === 'undefined') return 'right';
    try {
      const raw = window.localStorage.getItem(ZONE_LABEL_POSITION_KEY);
      if (raw === 'center' || raw === 'left' || raw === 'right') return raw;
    } catch {
      /* ignore */
    }
    return 'right';
  });
  const [zoneLabelHShift, setZoneLabelHShiftState] = useState(0);

  const setZoneLabelPosition = useCallback((p: ZoneLabelPos) => {
    setZoneLabelPositionState(p);
    try {
      window.localStorage.setItem(ZONE_LABEL_POSITION_KEY, p);
    } catch {
      /* ignore */
    }
    bumpDisplayTick();
  }, []);

  const setZoneLabelHShift = useCallback((n: number) => {
    const v = Math.max(-200, Math.min(200, Math.round(n)));
    setZoneLabelHShiftState(v);
    try {
      if (v === 0) window.localStorage.removeItem(ZONE_LABEL_H_SHIFT_KEY);
      else window.localStorage.setItem(ZONE_LABEL_H_SHIFT_KEY, String(v));
    } catch {
      /* ignore */
    }
    bumpDisplayTick();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PANEL_UI_KEY);
      if (raw) {
        const j = JSON.parse(raw) as { x?: number; y?: number };
        if (typeof j.x === 'number' && typeof j.y === 'number') setPos({ x: j.x, y: j.y });
      }
      const rawSec = window.localStorage.getItem(PANEL_OPEN_SECTIONS_KEY);
      if (rawSec) {
        const j = JSON.parse(rawSec) as Record<string, boolean>;
        if (j && typeof j === 'object') setOpenSections((prev) => ({ ...prev, ...j }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setSettings(loadSettings());
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync);
    window.addEventListener(MERGED_DESK_CHART_DISPLAY_TICK_EVENT, sync);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, sync);
      window.removeEventListener(MERGED_DESK_CHART_DISPLAY_TICK_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    setSettings(loadSettings());
    try {
      const raw = window.localStorage.getItem(ZONE_LABEL_POSITION_KEY);
      if (raw === 'center' || raw === 'left' || raw === 'right') setZoneLabelPositionState(raw);
      const hs = window.localStorage.getItem(ZONE_LABEL_H_SHIFT_KEY);
      const n = hs != null ? parseInt(hs, 10) : 0;
      setZoneLabelHShiftState(Number.isFinite(n) ? Math.max(-200, Math.min(200, n)) : 0);
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOpen = () => onOpenChange(true);
    window.addEventListener(OPEN_MERGED_DESK_CHART_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MERGED_DESK_CHART_SETTINGS_EVENT, onOpen);
  }, [onOpenChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onFocus = () => {
      onOpenChange(true);
      setOpenSections((prev) => {
        const next = { ...prev, text: true };
        try {
          window.localStorage.setItem(PANEL_OPEN_SECTIONS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    };
    window.addEventListener(CHART_LABEL_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(CHART_LABEL_FOCUS_EVENT, onFocus);
  }, [onOpenChange]);

  const [portalHost, setPortalHost] = useState<Element | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setPortalHost(document.fullscreenElement ?? null);
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const [renderedLabels, setRenderedLabels] = useState<MergedDeskLabelTarget[]>(() =>
    readRenderedChartLabels()
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setRenderedLabels(readRenderedChartLabels());
    sync();
    window.addEventListener(CHART_LABEL_REGISTRY_EVENT, sync);
    const onHide = () => {
      setHiddenTextTick((v) => v + 1);
      setLabelShiftTick((v) => v + 1);
    };
    window.addEventListener(CHART_LABEL_LAYOUT_EVENT, onHide);
    return () => {
      window.removeEventListener(CHART_LABEL_REGISTRY_EVENT, sync);
      window.removeEventListener(CHART_LABEL_LAYOUT_EVENT, onHide);
    };
  }, [open]);

  const uniqueLabels = useMemo<MergedDeskLabelTarget[]>(() => {
    const seen = new Set<string>();
    const rows: MergedDeskLabelTarget[] = [];
    for (const t of [...(labelTargets ?? []), ...renderedLabels]) {
      const id = String(t?.id || '').trim();
      const text = String(t?.label || '').trim();
      if (!id || !text) continue;
      const key = `${stableOverlayLabelLayoutKey(id)}|${chartTextHideLabelKey(text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ id, label: text });
    }
    return rows;
  }, [labelTargets, renderedLabels]);

  const thisMuchRows = useMemo(() => {
    void hiddenTextTick;
    const preferred = [
      { id: THIS_MUCH_IDS.zoneTouch, label: 'MB/OB터치' },
      { id: THIS_MUCH_IDS.zoneYo, label: '요만큼존' },
      { id: THIS_MUCH_IDS.zoneYi, label: '이만큼존' },
      { id: THIS_MUCH_IDS.labelYo, label: '요만큼' },
      { id: THIS_MUCH_IDS.labelYi, label: '이만큼' },
      { id: THIS_MUCH_IDS.labelTouch, label: '터치라벨' },
      { id: THIS_MUCH_IDS.edgeTg, label: '목표선' },
    ];
    const fromChart = uniqueLabels.filter(
      (r) =>
        String(r.id).includes('thismuch') ||
        String(r.label).startsWith('요이만·') ||
        /요만큼|이만큼/.test(r.label)
    );
    const seen = new Set<string>();
    const out: MergedDeskLabelTarget[] = [];
    for (const r of [...preferred, ...fromChart]) {
      const id = String(r.id || '').trim();
      const label = String(r.label || '').replace(/^요이만·/, '').trim();
      if (!id || !label) continue;
      const key = `${stableOverlayLabelLayoutKey(id)}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id, label });
    }
    return out;
  }, [uniqueLabels, hiddenTextTick]);

  const allLabelControlRows = useMemo(() => {
    void hiddenTextTick;
    const seen = new Set<string>();
    const out: MergedDeskLabelTarget[] = [];
    for (const r of uniqueLabels) {
      const id = String(r.id || '').trim();
      const label = String(r.label || '').trim();
      if (!id || !label) continue;
      const key = `${stableOverlayLabelLayoutKey(id)}|${chartTextHideLabelKey(label)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id, label });
    }
    return out;
  }, [uniqueLabels, hiddenTextTick]);

  const yellowFaceRows = useMemo(() => {
    void hiddenTextTick;
    const seen = new Set<string>();
    const out: MergedDeskLabelTarget[] = [];
    for (const r of uniqueLabels) {
      if (!looksLikeYellowChartText(r.id, r.label)) continue;
      const display = r.label.replace(/^노랑·/, '').replace(/^◆+/, '').trim();
      if (display.startsWith('가격·') || r.label.startsWith('가격·') || r.label.startsWith('가격핀·')) continue;
      if (coreFaceBaseFromLabel(display)) continue;
      const lk = chartTextHideLabelKey(display);
      if (!display || !lk || seen.has(lk)) continue;
      seen.add(lk);
      out.push({ id: chartTextRowId(r.id), label: display });
    }
    return out;
  }, [uniqueLabels, hiddenTextTick]);

  const coreFaceLabelRows = useMemo(() => {
    void hiddenTextTick;
    const byFace = new Map<string, MergedDeskLabelTarget>();
    for (const r of uniqueLabels) {
      const id = String(r.id || '').toLowerCase();
      const face = coreFaceBaseFromLabel(r.label);
      if (!face) continue;
      if (
        !id.includes('rb-core-break') &&
        !id.includes('rb-core-settle') &&
        !id.includes('rb-core-fail') &&
        !/핵심돌파|핵심안착|핵심실패/.test(r.label)
      ) {
        continue;
      }
      if (!byFace.has(face)) byFace.set(face, { id: chartTextRowId(r.id), label: face });
    }
    const order = ['핵심돌파', '핵심안착', '핵심실패'] as const;
    const out = order.filter((f) => byFace.has(f)).map((f) => byFace.get(f)!);
    for (const [face, row] of byFace) {
      if (!order.includes(face as (typeof order)[number])) out.push(row);
    }
    return out;
  }, [uniqueLabels, hiddenTextTick]);

  const pricePinRows = useMemo(() => {
    void hiddenTextTick;
    const seen = new Set<string>();
    const out: MergedDeskLabelTarget[] = [];
    for (const r of uniqueLabels) {
      if (!r.label.startsWith('가격핀·')) continue;
      const display = r.label.replace(/^가격핀·/, '').trim();
      const key = `${chartTextRowId(r.id)}|${display}`;
      if (!display || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: chartTextRowId(r.id), label: display });
    }
    return out;
  }, [uniqueLabels, hiddenTextTick]);

  const whiteFaceRows = useMemo(() => {
    void hiddenTextTick;
    const seen = new Set<string>();
    const out: MergedDeskLabelTarget[] = [];
    for (const r of uniqueLabels) {
      if (r.label.startsWith('가격핀·') || r.label.startsWith('가격·')) continue;
      if (!r.label.startsWith('흰글자·') && !looksLikeWhiteChartText(r.id, r.label)) continue;
      const display = r.label.replace(/^흰글자·/, '').replace(/^◆+/, '').trim();
      const lk = chartTextHideLabelKey(display);
      if (!display || !lk || seen.has(lk)) continue;
      seen.add(lk);
      out.push({ id: chartTextRowId(r.id), label: display });
    }
    return out;
  }, [uniqueLabels, hiddenTextTick]);

  const apply = useCallback((patch: Partial<UserSettings>) => {
    const next = saveSettings({ ...loadSettings(), ...patch });
    setSettings(next);
    bumpDisplayTick();
  }, []);

  const patchEuromap = useCallback((layerId: string, patch: { on?: boolean; hex?: string; opacity?: number }) => {
    const prev = loadSettings();
    const map = { ...(prev.chartMergedDeskEuromap || {}) };
    map[layerId] = { ...(map[layerId] || {}), ...patch };
    apply({ chartMergedDeskEuromap: map });
  }, [apply]);

  const setLayerOn = useCallback(
    (layer: EuromapLayerDef, on: boolean) => {
      if (layer.onKey) {
        apply({ [layer.onKey]: on } as Partial<UserSettings>);
        return;
      }
      patchEuromap(layer.id, { on });
    },
    [apply, patchEuromap]
  );

  const setLayerHex = useCallback(
    (layer: EuromapLayerDef, hex: string) => {
      if (layer.hexKey) {
        apply({ [layer.hexKey]: hex } as Partial<UserSettings>);
        return;
      }
      patchEuromap(layer.id, { hex });
    },
    [apply, patchEuromap]
  );

  const setLayerOpacity = useCallback(
    (layer: EuromapLayerDef, opacity: number) => {
      if (layer.opacityKey === 'chartMergedDeskRbFillOpacity') {
        apply({ chartMergedDeskRbFillOpacity: Math.round((opacity / 100) * 60) });
        return;
      }
      if (layer.opacityKey) {
        apply({ [layer.opacityKey]: opacity } as Partial<UserSettings>);
        return;
      }
      patchEuromap(layer.id, { opacity });
    },
    [apply, patchEuromap]
  );

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(PANEL_OPEN_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const startDrag = (e: ReactMouseEvent) => {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { ox: e.clientX, oy: e.clientY, sx: r.left, sy: r.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const x = dragRef.current.sx + (ev.clientX - dragRef.current.ox);
      const y = dragRef.current.sy + (ev.clientY - dragRef.current.oy);
      setPos({ x: Math.max(8, x), y: Math.max(8, y) });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (panelRef.current) {
        const r = panelRef.current.getBoundingClientRect();
        try {
          window.localStorage.setItem(PANEL_UI_KEY, JSON.stringify({ x: r.left, y: r.top }));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onFullReset = () => {
    const ok =
      typeof window === 'undefined' ||
      window.confirm('통합차트 스타일을 전부 초기화할까요?\nON/OFF·색·농도가 기본값으로 돌아갑니다.');
    if (!ok) return;
    const next = resetMergedDeskChartDisplayAll();
    setSettings(next);
    bumpDisplayTick();
  };

  const q = query.trim().toLowerCase();
  const layerMatches = (l: EuromapLayerDef) => !q || l.label.toLowerCase().includes(q);

  const renderLayerRow = (layer: EuromapLayerDef) => {
    const st = getEuromapLayerStyle(settings, layer);
    return (
      <div key={layer.id} className="md-euromap-row" title={layer.hint || layer.label}>
        <button
          type="button"
          className={`md-euromap-eye ${st.on ? 'is-on' : ''}`}
          onClick={() => setLayerOn(layer, !st.on)}
          aria-label={`${layer.label} ${st.on ? '끄기' : '켜기'}`}
        >
          {st.on ? '●' : '○'}
        </button>
        <span className="md-euromap-name">{layer.label}</span>
        <input
          type="color"
          value={st.hex}
          disabled={!st.on}
          onChange={(e) => setLayerHex(layer, e.target.value.toUpperCase())}
          title="기능 색"
        />
        <input
          type="range"
          min={15}
          max={100}
          value={st.opacity}
          disabled={!st.on}
          onChange={(e) => setLayerOpacity(layer, Number(e.target.value))}
          title="연하게 ← → 진하게"
        />
        <span className="md-euromap-pct">{st.opacity}%</span>
      </div>
    );
  };

  if (!open || typeof document === 'undefined') return null;

  const panelStyle: CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : { position: 'fixed', right: 16, top: 72 };

  const labelsOn = settings.chartMergedDeskOverlayLabelsEnabled !== false && settings.chartBulkHideLabels !== true;
  const zoneOp = Math.max(15, Math.min(100, Number(settings.chartMergedDeskZoneFillOpacity) || 46));

  const node = (
    <div
      ref={panelRef}
      className="merged-desk-chart-settings-panel md-euromap-panel"
      role="dialog"
      aria-label="차트조절"
      style={panelStyle}
    >
      <header className="merged-desk-chart-settings-panel__head">
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onMouseDown={startDrag}
          title="드래그로 이동"
          style={{ cursor: 'grab', padding: '4px 8px', fontSize: 10 }}
        >
          ↕
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#e0f2fe' }}>차트조절</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
            폭락구간 라벨 · 글자 · 좌중우 · 존색 · 레이어
          </div>
        </div>
        <Chip onClick={onFullReset} style={{ fontWeight: 800, borderColor: 'rgba(248,113,113,0.5)', color: '#fecaca' }}>
          초기화
        </Chip>
        <Chip onClick={() => onOpenChange(false)}>닫기</Chip>
      </header>

      <div className="merged-desk-chart-settings-panel__search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="레이어 검색 (폭락구간, 존, 채널, TP…)"
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: 11,
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.28)',
            background: 'rgba(15,23,42,0.85)',
            color: '#e2e8f0',
          }}
        />
      </div>

      <div className="merged-desk-chart-settings-panel__body">
        <MergedDeskChartSettingsBlock
          settings={settings}
          apply={apply}
          zoneLabelPosition={zoneLabelPosition}
          setZoneLabelPosition={setZoneLabelPosition}
          zoneLabelHShift={zoneLabelHShift}
          setZoneLabelHShift={setZoneLabelHShift}
          onFullResetDone={() => {
            setSettings(loadSettings());
            bumpDisplayTick();
          }}
        />
        <div className="md-euromap-global">
          <span>면 전체 농도</span>
          <input
            type="range"
            min={15}
            max={100}
            value={zoneOp}
            onChange={(e) => apply({ chartMergedDeskZoneFillOpacity: Number(e.target.value) })}
          />
          <b>{zoneOp}%</b>
          <Chip
            active={labelsOn}
            onClick={() => apply({ chartMergedDeskOverlayLabelsEnabled: true, chartBulkHideLabels: false })}
            title="차트 모든 글자 라벨 ON"
          >
            모든라벨 ON
          </Chip>
          <Chip
            active={!labelsOn}
            onClick={() => apply({ chartMergedDeskOverlayLabelsEnabled: false, chartBulkHideLabels: true })}
            title="차트 모든 글자 라벨 OFF"
          >
            모든라벨 OFF
          </Chip>
        </div>

        <div
          className="md-euromap-global"
          style={{
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 8,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(232,121,249,0.45)',
            background: 'rgba(88,28,135,0.28)',
          }}
        >
          <b style={{ width: '100%', fontSize: 11, color: '#f5d0fe' }}>
            요만큼·이만큼 세트 · 푸시아 · 라벨별 ON/OFF·좌우
          </b>
          <Chip
            active={settings.chartMergedDeskThisMuchEnabled !== false}
            onClick={() =>
              apply({
                chartMergedDeskThisMuchEnabled: settings.chartMergedDeskThisMuchEnabled === false,
              })
            }
            title="시안과 동일 · 터치+요만큼+이만큼 세트 · TF별 구조 · A네온마젠타"
            style={{
              borderColor: 'rgba(255,46,182,0.55)',
              color: settings.chartMergedDeskThisMuchEnabled !== false ? '#ff9ad8' : undefined,
            }}
          >
            {settings.chartMergedDeskThisMuchEnabled !== false ? '요이만 ON' : '요이만 OFF'}
          </Chip>
          <Chip
            active={settings.chartMergedDeskRbSmcPoisEnabled !== false}
            onClick={() =>
              apply({
                chartMergedDeskRbSmcPoisEnabled: settings.chartMergedDeskRbSmcPoisEnabled === false,
              })
            }
            title="超级MSB·OB·BB·MB"
          >
            {settings.chartMergedDeskRbSmcPoisEnabled !== false ? '超级MSB ON' : '超级MSB OFF'}
          </Chip>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#e2e8f0',
              flex: '1 1 200px',
            }}
          >
            (참고) 전역 좌우
            <input
              type="range"
              min={-160}
              max={160}
              step={4}
              value={Math.max(-160, Math.min(160, Number(settings.chartMergedDeskGlobalLabelShiftX) || 0))}
              onChange={(e) => apply({ chartMergedDeskGlobalLabelShiftX: Number(e.target.value) })}
              style={{ flex: 1 }}
              title="모든 라벨 공통 이동 — 개별 이동은 아래 슬라이더"
            />
            <b style={{ minWidth: 40 }}>
              {Number(settings.chartMergedDeskGlobalLabelShiftX) > 0 ? '+' : ''}
              {Number(settings.chartMergedDeskGlobalLabelShiftX) || 0}px
            </b>
          </label>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {thisMuchRows.map((r) => {
              void labelShiftTick;
              const on = !isChartTextIdHidden(r.id, readHiddenChartTextIds(), r.label);
              const hx = getLabelShift(readLabelHShifts(), r.id);
              return (
                <div
                  key={`tm-${r.id}-${r.label}`}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: 'rgba(15,23,42,0.35)',
                  }}
                >
                  <Chip
                    active={on}
                    title={`${r.label} 표시`}
                    onClick={() => {
                      setChartTextIdVisible(r.id, !on, r.label);
                      setHiddenTextTick((v) => v + 1);
                      bumpDisplayTick();
                    }}
                    style={{ minWidth: 88, borderColor: 'rgba(232,121,249,0.4)' }}
                  >
                    {on ? 'ON' : 'OFF'} · {r.label}
                  </Chip>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 10,
                      color: '#e9d5ff',
                      flex: '1 1 160px',
                    }}
                  >
                    좌← →우
                    <input
                      type="range"
                      min={LABEL_SHIFT_X_MIN}
                      max={LABEL_SHIFT_X_MAX}
                      step={2}
                      value={hx}
                      onChange={(e) => {
                        setLabelHShift(r.id, Number(e.target.value) || 0);
                        setLabelShiftTick((v) => v + 1);
                      }}
                      style={{ flex: 1, accentColor: '#E879F9' }}
                    />
                    <b style={{ minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>
                      {hx > 0 ? `+${hx}` : hx}px
                    </b>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="md-euromap-global"
          style={{
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 8,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(96,165,250,0.35)',
            background: 'rgba(30,58,138,0.22)',
          }}
        >
          <b style={{ width: '100%', fontSize: 11, color: '#bfdbfe' }}>파랑빨강띠 · 통로 배경색</b>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0' }}>
            롱(상승)
            <input
              type="color"
              value={
                /^#[0-9A-Fa-f]{6}$/i.test(String(settings.chartMergedDeskRbBullHex || ''))
                  ? String(settings.chartMergedDeskRbBullHex)
                  : '#22C55E'
              }
              onChange={(e) => apply({ chartMergedDeskRbBullHex: e.target.value.toUpperCase() })}
              title="롱 통로 배경"
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0' }}>
            숏(하락)
            <input
              type="color"
              value={
                /^#[0-9A-Fa-f]{6}$/i.test(String(settings.chartMergedDeskRbBearHex || ''))
                  ? String(settings.chartMergedDeskRbBearHex)
                  : '#EF4444'
              }
              onChange={(e) => apply({ chartMergedDeskRbBearHex: e.target.value.toUpperCase() })}
              title="숏 통로 배경"
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0', flex: '1 1 140px' }}>
            농도
            <input
              type="range"
              min={4}
              max={48}
              value={Math.max(4, Math.min(48, Number(settings.chartMergedDeskRbFillOpacity) || 18))}
              onChange={(e) => apply({ chartMergedDeskRbFillOpacity: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <b>{Math.max(4, Math.min(48, Number(settings.chartMergedDeskRbFillOpacity) || 18))}</b>
          </label>
          <Chip
            onClick={() =>
              apply({
                chartMergedDeskRbBullHex: '#3B82F6',
                chartMergedDeskRbBearHex: '#EF4444',
                chartMergedDeskRbFillOpacity: 18,
              })
            }
            title="고전 파랑·빨강 통로"
          >
            파랑빨강 프리셋
          </Chip>
          <Chip
            onClick={() =>
              apply({
                chartMergedDeskRbBullHex: defaultSettings.chartMergedDeskRbBullHex,
                chartMergedDeskRbBearHex: defaultSettings.chartMergedDeskRbBearHex,
                chartMergedDeskRbFillOpacity: defaultSettings.chartMergedDeskRbFillOpacity,
              })
            }
            title="기본 초록·빨강"
          >
            기본색
          </Chip>
        </div>

        {EUROMAP_GROUPS.map((g) => {
          const rows = MERGED_DESK_EUROMAP_LAYERS.filter((l) => l.group === g.id && layerMatches(l));
          if (!rows.length) return null;
          const openG = !!openSections[g.id];
          return (
            <section key={g.id} className="merged-desk-chart-settings-panel__section">
              <button
                type="button"
                className="merged-desk-chart-settings-panel__section-head"
                onClick={() => toggleSection(g.id)}
              >
                <span style={{ fontSize: 11, color: '#7dd3fc' }}>{openG ? '▾' : '▸'}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#bfdbfe' }}>{g.title}</span>
                <span style={{ fontSize: 10, color: '#64748b' }}>{rows.length}</span>
              </button>
              {openG && (
                <div style={{ padding: '4px 0 10px' }}>
                  {rows.map(renderLayerRow)}
                  {g.id === 'zone' && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 10, color: '#fde68a', marginBottom: 6 }}>
                        핵심 글자 각각 OFF
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(
                          [
                            { id: 'merged-desk-rb-core-break-zone', label: '핵심돌파' },
                            { id: 'merged-desk-rb-core-settle-zone', label: '핵심안착' },
                            { id: 'merged-desk-rb-core-fail-zone', label: '핵심실패' },
                          ] as const
                        ).map((preset) => {
                          const live = coreFaceLabelRows.find((r) => r.label === preset.label);
                          const row = live || preset;
                          const on = !isChartTextPillLabelHidden(row.label, readHiddenChartTextIds());
                          return (
                            <Chip
                              key={`core-face-${row.label}`}
                              active={on}
                              title={`${row.label} 글자+붙은 가격태그`}
                              onClick={() => {
                                setChartTextIdVisible(row.id, !on, `노랑·${row.label}`);
                                setHiddenTextTick((v) => v + 1);
                                bumpDisplayTick();
                              }}
                            >
                              {row.label}
                            </Chip>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 10, color: '#fde68a', margin: '10px 0 6px' }}>
                        동그라미+테두리 가격핀 각각 OFF · 차트에서 더블클릭도 OFF
                      </div>
                      {pricePinRows.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#64748b' }}>차트에 뜨면 여기 나옵니다.</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {pricePinRows.map((r) => {
                            const on = !isChartTextIdHidden(r.id, readHiddenChartTextIds());
                            return (
                              <Chip
                                key={`zone-pin-${r.id}-${r.label}`}
                                active={on}
                                title={`${r.label} 가격핀`}
                                onClick={() => {
                                  setChartTextIdVisible(r.id, !on);
                                  setHiddenTextTick((v) => v + 1);
                                  bumpDisplayTick();
                                }}
                              >
                                {r.label}
                              </Chip>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}

        <section className="merged-desk-chart-settings-panel__section">
          <button
            type="button"
            className="merged-desk-chart-settings-panel__section-head"
            onClick={() => toggleSection('text')}
          >
            <span style={{ fontSize: 11, color: '#7dd3fc' }}>{openSections.text ? '▾' : '▸'}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#bfdbfe' }}>지금 차트 글자</span>
          </button>
                          {openSections.text && (
            <div style={{ padding: '4px 0 12px' }}>
              <div style={{ fontSize: 10, color: '#f5d0fe', marginBottom: 6 }}>
                차트에 뜨는 라벨 전부 · 각각 ON/OFF · 각각 좌우 이동
              </div>
              {allLabelControlRows.length === 0 ? (
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                  차트에 라벨이 뜨면 여기 전부 나옵니다.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    marginBottom: 12,
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  {allLabelControlRows.map((r) => {
                    void labelShiftTick;
                    const hideLab = r.label.startsWith('노랑·')
                      ? r.label
                      : r.label.startsWith('흰글자·')
                        ? r.label
                        : r.label.startsWith('요이만·')
                          ? r.label.replace(/^요이만·/, '')
                          : r.label;
                    const on = !isChartTextIdHidden(r.id, readHiddenChartTextIds(), hideLab);
                    const hx = getLabelShift(readLabelHShifts(), r.id);
                    const short = r.label.length > 28 ? `${r.label.slice(0, 26)}…` : r.label;
                    return (
                      <div
                        key={`all-${r.id}-${r.label}`}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 4px',
                          borderRadius: 5,
                          background: 'rgba(15,23,42,0.4)',
                        }}
                      >
                        <Chip
                          active={on}
                          title={r.label}
                          onClick={() => {
                            setChartTextIdVisible(r.id, !on, hideLab);
                            setHiddenTextTick((v) => v + 1);
                            bumpDisplayTick();
                          }}
                          style={{ minWidth: 72, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {on ? 'ON' : 'OFF'} · {short}
                        </Chip>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            color: '#94a3b8',
                            flex: '1 1 140px',
                          }}
                        >
                          좌우
                          <input
                            type="range"
                            min={LABEL_SHIFT_X_MIN}
                            max={LABEL_SHIFT_X_MAX}
                            step={2}
                            value={hx}
                            onChange={(e) => {
                              setLabelHShift(r.id, Number(e.target.value) || 0);
                              setLabelShiftTick((v) => v + 1);
                            }}
                            style={{ flex: 1 }}
                          />
                          <b style={{ minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>
                            {hx > 0 ? `+${hx}` : hx}
                          </b>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#fde68a', marginBottom: 6 }}>
                동그라미 가격핀 · 더블클릭 OFF
              </div>
              {pricePinRows.length === 0 ? (
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                  차트에 동그라미+테두리 가격핀이 뜨면 여기 나옵니다.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {pricePinRows.map((r) => {
                    const on = !isChartTextIdHidden(r.id, readHiddenChartTextIds());
                    return (
                      <Chip
                        key={`pin-${r.id}-${r.label}`}
                        active={on}
                        title={`${r.label} 가격핀`}
                        onClick={() => {
                          setChartTextIdVisible(r.id, !on);
                          setHiddenTextTick((v) => v + 1);
                          bumpDisplayTick();
                        }}
                      >
                        {r.label}
                      </Chip>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#fde68a', marginBottom: 6 }}>노란 알약</div>
              {yellowFaceRows.length === 0 ? (
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>차트에 뜨면 여기 나옵니다.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {yellowFaceRows.map((r) => {
                    const on = !isChartTextPillLabelHidden(r.label, readHiddenChartTextIds());
                    return (
                      <Chip
                        key={`y-${r.id}-${r.label}`}
                        active={on}
                        onClick={() => {
                          setChartTextIdVisible(r.id, !on, `노랑·${r.label}`);
                          setHiddenTextTick((v) => v + 1);
                          bumpDisplayTick();
                        }}
                      >
                        {r.label}
                      </Chip>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#e2e8f0', marginBottom: 6 }}>흰 글자</div>
              {whiteFaceRows.length === 0 ? (
                <div style={{ fontSize: 11, color: '#64748b' }}>차트에 뜨면 여기 나옵니다.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {whiteFaceRows.map((r) => {
                    const on = !isChartTextWhiteLabelHidden(r.label, readHiddenChartTextIds());
                    return (
                      <Chip
                        key={`w-${r.id}-${r.label}`}
                        active={on}
                        onClick={() => {
                          setChartTextIdVisible(r.id, !on, `흰글자·${r.label}`);
                          setHiddenTextTick((v) => v + 1);
                          bumpDisplayTick();
                        }}
                      >
                        {r.label}
                      </Chip>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Chip
                  onClick={() => {
                    const all = [...yellowFaceRows, ...whiteFaceRows];
                    setManyChartTextIdsVisible(
                      all.map((r) => r.id),
                      true,
                      all.map((r) =>
                        yellowFaceRows.some((y) => y.id === r.id && y.label === r.label)
                          ? `노랑·${r.label}`
                          : `흰글자·${r.label}`
                      )
                    );
                    setHiddenTextTick((v) => v + 1);
                    bumpDisplayTick();
                  }}
                >
                  글자 전부 ON
                </Chip>
                <Chip
                  onClick={() => {
                    const all = [...yellowFaceRows, ...whiteFaceRows];
                    setManyChartTextIdsVisible(
                      all.map((r) => r.id),
                      false,
                      all.map((r) =>
                        yellowFaceRows.some((y) => y.id === r.id && y.label === r.label)
                          ? `노랑·${r.label}`
                          : `흰글자·${r.label}`
                      )
                    );
                    setHiddenTextTick((v) => v + 1);
                    bumpDisplayTick();
                  }}
                >
                  글자 전부 OFF
                </Chip>
              </div>
            </div>
          )}
        </section>

        <section className="merged-desk-chart-settings-panel__section">
          <button
            type="button"
            className="merged-desk-chart-settings-panel__section-head"
            onClick={() => toggleSection('candle')}
          >
            <span style={{ fontSize: 11, color: '#7dd3fc' }}>{openSections.candle ? '▾' : '▸'}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#bfdbfe' }}>캔들</span>
          </button>
          {openSections.candle && (
            <div style={{ padding: '6px 0 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Chip
                active={settings.chartMergedDeskAiToneEnabled === true}
                onClick={() => apply({ chartMergedDeskAiToneEnabled: settings.chartMergedDeskAiToneEnabled !== true })}
              >
                AI톤
              </Chip>
              <Chip
                active={settings.chartMergedDeskAnchoredVwapEnabled !== false}
                onClick={() =>
                  apply({
                    chartMergedDeskAnchoredVwapEnabled: settings.chartMergedDeskAnchoredVwapEnabled === false,
                  })
                }
                title="전모드 공유 Anchored VWAP · 핀·설정 유지"
              >
                AVWAP
              </Chip>
              <Chip
                active={settings.chartMergedDeskAvwapAutoExtremeEnabled === true}
                onClick={() =>
                  apply({
                    chartMergedDeskAvwapAutoExtremeEnabled:
                      settings.chartMergedDeskAvwapAutoExtremeEnabled !== true,
                    ...(settings.chartMergedDeskAvwapAutoExtremeEnabled !== true
                      ? { chartMergedDeskAnchoredVwapEnabled: true }
                      : {}),
                  })
                }
                title="절대 고/저 자동 앵커"
              >
                {settings.chartMergedDeskAvwapAutoExtremeEnabled === true ? '극값ON' : '자동극값'}
              </Chip>
              <Chip
                active={settings.chartMergedDeskSessionVwapEnabled === true}
                onClick={() =>
                  apply({
                    chartMergedDeskSessionVwapEnabled: settings.chartMergedDeskSessionVwapEnabled !== true,
                  })
                }
                title="UTC 세션 VWAP"
              >
                {settings.chartMergedDeskSessionVwapEnabled === true ? '세션ON' : '세션VWAP'}
              </Chip>
              <Chip
                active={settings.chartMergedDeskAvwapPlaceArmed === true}
                onClick={() =>
                  apply({
                    chartMergedDeskAvwapPlaceArmed: settings.chartMergedDeskAvwapPlaceArmed !== true,
                    ...(settings.chartMergedDeskAvwapPlaceArmed !== true
                      ? {
                          chartMergedDeskAnchoredVwapEnabled: true,
                          chartMergedDeskAvwapUserPinsHidden: false,
                        }
                      : {}),
                  })
                }
                title="ON 후 차트 클릭으로 고·저 핀 (더블클릭 아님)"
              >
                {settings.chartMergedDeskAvwapPlaceArmed === true ? '찍기중' : 'AVWAP찍기'}
              </Chip>
              <Chip
                active={settings.chartMergedDeskAvwapUserPinsHidden === true}
                onClick={() =>
                  apply({
                    chartMergedDeskAvwapUserPinsHidden: settings.chartMergedDeskAvwapUserPinsHidden !== true,
                  })
                }
                title="찍은 AVWAP 숨김"
              >
                찍기숨김
              </Chip>
              <Chip
                active={settings.chartMergedDeskAnchoredVwapHtf === '1w'}
                onClick={() =>
                  apply({
                    chartMergedDeskAnchoredVwapHtf:
                      settings.chartMergedDeskAnchoredVwapHtf === '1w' ? '1d' : '1w',
                  })
                }
                title="앵커 TF 일↔주"
              >
                {settings.chartMergedDeskAnchoredVwapHtf === '1w' ? 'AVWAP주' : 'AVWAP일'}
              </Chip>
              <label className="md-euromap-row" style={{ margin: 0, flex: '1 1 160px' }}>
                <span className="md-euromap-name">양봉</span>
                <input
                  type="color"
                  value={String(settings.chartCandleClassicUpHex || defaultSettings.chartCandleClassicUpHex)}
                  onChange={(e) => apply({ chartCandleClassicUpHex: e.target.value.toUpperCase() })}
                />
              </label>
              <label className="md-euromap-row" style={{ margin: 0, flex: '1 1 160px' }}>
                <span className="md-euromap-name">음봉</span>
                <input
                  type="color"
                  value={String(settings.chartCandleClassicDownHex || defaultSettings.chartCandleClassicDownHex)}
                  onChange={(e) => apply({ chartCandleClassicDownHex: e.target.value.toUpperCase() })}
                />
              </label>
            </div>
          )}
        </section>
      </div>
    </div>
  );

  return createPortal(node, portalHost || document.body);
}
