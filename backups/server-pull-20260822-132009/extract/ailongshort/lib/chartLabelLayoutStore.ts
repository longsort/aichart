/**
 * 차트 라벨 개별 배치 저장소.
 *
 * ChartView가 쓰던 localStorage 키를 그대로 읽고 쓴다. 차트 밖(설정 패널)에서
 * 라벨을 옮길 수 있게 하려고 키 규칙·직렬화만 공용으로 뺐다.
 * 값을 바꾸면 `CHART_LABEL_LAYOUT_EVENT`를 쏘고, ChartView가 그때 다시 읽는다.
 */

export const CHART_LABEL_LAYOUT_EVENT = 'ailongshort-chart-label-layout-changed';

const OVERLAY_OFFSETS_KEY = 'ailongshort-overlay-offsets';
const OVERLAY_FONT_SIZES_KEY = 'ailongshort-overlay-font-sizes';
const OVERLAY_LABEL_H_SHIFT_KEY = 'ailongshort-overlay-label-h-shift';
const OVERLAY_LABEL_V_SHIFT_KEY = 'ailongshort-overlay-label-v-shift';

export const LABEL_SHIFT_X_MIN = -200;
export const LABEL_SHIFT_X_MAX = 200;
export const LABEL_SHIFT_Y_MIN = -200;
export const LABEL_SHIFT_Y_MAX = 200;

export type LabelOffset = { dx: number; dy: number };

/**
 * 차트 설정 ON/OFF는 id 단위로 저장되는데, 엔진이 TF마다 봉 인덱스·가격뿐 아니라
 * TF 토큰(1m/5m/1h/4h/1d/1w/1M/1Y 등)도 id에 포함해 같은 오버레이가 TF별 다른 id가 될 수 있음.
 * 숫자 꼬리 + TF 토큰을 제거한 **논리 키**로 묶어, 한 TF에서 ON/OFF 해도 전 TF에 동일 적용.
 */
function isTfToken(seg: string): boolean {
  if (!seg) return false;
  const s = seg.trim();
  return (
    /^(?:\d+(?:m|h|d|w)|\d+M|\d+Y)$/i.test(s) ||
    /^tf[_-]?(?:\d+(?:m|h|d|w)|\d+M|\d+Y)$/i.test(s) ||
    /^timeframe[_-]?(?:\d+(?:m|h|d|w)|\d+M|\d+Y)$/i.test(s)
  );
}

/** 핫존 등 id에 티커가 들어가면 심볼만 바꿔도 키가 달라져 차트 설정이 '초기화'처럼 보임 — 논리 키에서 제거 */
function isLikelySymbolToken(seg: string): boolean {
  const s = seg.trim();
  if (s.length < 5) return false;
  return /^[A-Z0-9]{3,}(?:USDT|USDC|BUSD|FDUSD|PERP|USD)$/i.test(s);
}

function baseKeyParts(id: string): string[] {
  return id.split('-').filter((seg) => !isTfToken(seg) && !isLikelySymbolToken(seg));
}

export function stableOverlayLabelKey(id: string): string {
  if (!id || typeof id !== 'string') return id;
  const parts = baseKeyParts(id);
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last) || /^\d+\.\d+$/.test(last)) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join('-');
}

/**
 * 라벨 배치 전용 키.
 *
 * `stableOverlayLabelKey`는 숫자 꼬리를 전부 떼어내서 zone-1·zone-2처럼 서로 다른 라벨이
 * 한 키로 합쳐진다. ON/OFF에는 그게 맞지만 위치 조정에는 라벨이 뭉쳐 움직이는 문제가 된다.
 * 여기서는 가격·타임스탬프처럼 매번 바뀌는 긴 숫자만 떼고, 1~3자리 인덱스는 남겨 라벨을 구분한다.
 */
export function stableOverlayLabelLayoutKey(id: string): string {
  if (!id || typeof id !== 'string') return id;
  const parts = baseKeyParts(id);
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (/^\d{4,}$/.test(last) || /^\d+\.\d+$/.test(last)) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join('-');
}

function isOffsetBlock(v: unknown): v is Record<string, LabelOffset> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const vals = Object.values(v);
  if (vals.length === 0) return false;
  const s = vals[0] as { dx?: unknown; dy?: unknown };
  return typeof s?.dx === 'number' && typeof s?.dy === 'number';
}

function normalize(m: Record<string, LabelOffset>): Record<string, LabelOffset> {
  const out: Record<string, LabelOffset> = {};
  for (const [key, val] of Object.entries(m)) {
    if (!val || typeof val.dx !== 'number' || typeof val.dy !== 'number') continue;
    out[stableOverlayLabelKey(key)] = val;
  }
  return out;
}

/** 오프셋은 심볼 단위로 묶여 있다 — TF를 바꿔도 맞춰둔 위치가 유지되게 */
export function readLabelOffsets(symbol: string): Record<string, LabelOffset> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(OVERLAY_OFFSETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const symBlock = parsed[symbol];
    if (isOffsetBlock(symBlock)) return normalize(symBlock);

    const prefix = `${symbol}|`;
    const merged: Record<string, LabelOffset> = {};
    for (const k of Object.keys(parsed)) {
      if (k.startsWith(prefix) && isOffsetBlock(parsed[k])) {
        Object.assign(merged, parsed[k] as Record<string, LabelOffset>);
      }
    }
    if (Object.keys(merged).length) return normalize(merged);

    const hasScopedShape = Object.values(parsed).some(
      (v) => v && typeof v === 'object' && !Array.isArray(v) && !('dx' in (v as object))
    );
    if (!hasScopedShape && isOffsetBlock(parsed)) return normalize(parsed);
    return {};
  } catch {
    return {};
  }
}

export function writeLabelOffsets(symbol: string, next: Record<string, LabelOffset>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(OVERLAY_OFFSETS_KEY);
    let root: Record<string, Record<string, LabelOffset>> = {};
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const hasScopedShape = Object.values(parsed).some(
          (v) => v && typeof v === 'object' && !Array.isArray(v) && !('dx' in (v as object))
        );
        root = hasScopedShape ? (parsed as Record<string, Record<string, LabelOffset>>) : {};
      }
    }
    const prefix = `${symbol}|`;
    for (const k of Object.keys(root)) {
      if (k === symbol || k.startsWith(prefix)) delete root[k];
    }
    root[symbol] = normalize(next);
    window.localStorage.setItem(OVERLAY_OFFSETS_KEY, JSON.stringify(root));
  } catch {
    /* ignore */
  }
}

export function readLabelFontSizes(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(OVERLAY_FONT_SIZES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLabelFontSizes(next: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OVERLAY_FONT_SIZES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function readNumberMap(key: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function writeNumberMap(key: string, map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * 라벨 글자만 옮기는 이동량. 존·띠 도형은 그대로 두므로,
 * 도형까지 함께 움직이는 `LabelOffset`(드래그용)과 구분해서 쓴다.
 */
export function readLabelHShifts(): Record<string, number> {
  return readNumberMap(OVERLAY_LABEL_H_SHIFT_KEY);
}

export function readLabelVShifts(): Record<string, number> {
  return readNumberMap(OVERLAY_LABEL_V_SHIFT_KEY);
}

export function getLabelShift(map: Record<string, number>, id: string): number {
  const k = stableOverlayLabelKey(id);
  const v = map[k] ?? map[id];
  return Number.isFinite(v) ? (v as number) : 0;
}

function setShift(key: string, id: string, value: number, min: number, max: number): void {
  const v = Math.max(min, Math.min(max, Math.round(value)));
  const k = stableOverlayLabelKey(id);
  const cur = readNumberMap(key);
  const next = { ...cur };
  if (v === 0) delete next[k];
  else next[k] = v;
  if (k !== id) delete next[id];
  writeNumberMap(key, next);
  notifyLabelLayoutChanged();
}

export function setLabelHShift(id: string, value: number): void {
  setShift(OVERLAY_LABEL_H_SHIFT_KEY, id, value, LABEL_SHIFT_X_MIN, LABEL_SHIFT_X_MAX);
}

export function setLabelVShift(id: string, value: number): void {
  setShift(OVERLAY_LABEL_V_SHIFT_KEY, id, value, LABEL_SHIFT_Y_MIN, LABEL_SHIFT_Y_MAX);
}

export function clearAllLabelShifts(): void {
  writeNumberMap(OVERLAY_LABEL_H_SHIFT_KEY, {});
  writeNumberMap(OVERLAY_LABEL_V_SHIFT_KEY, {});
  notifyLabelLayoutChanged();
}

/**
 * 라벨 미세 이동(설정 패널 "라벨 개별 조정" 전용).
 *
 * 기존 h/v-shift는 라벨마다 다른 좌표식(left·right·클램프·가격축 고정) 한가운데로 들어가서
 * 어떤 라벨은 먹고 어떤 라벨은 무시됐다. 이 값은 좌표식을 건드리지 않고 CSS `translate`로만
 * 적용한다. `transform`과 별개 속성이라 기존 `transform:...!important`와도 부딪히지 않는다.
 */
const OVERLAY_LABEL_NUDGE_KEY = 'ailongshort-overlay-label-nudge';
const OVERLAY_LABEL_NUDGE_FS_KEY = 'ailongshort-overlay-label-nudge-fs';

export const LABEL_NUDGE_MIN = -400;
export const LABEL_NUDGE_MAX = 400;

export function readLabelNudges(): Record<string, LabelOffset> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(OVERLAY_LABEL_NUDGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, LabelOffset> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      const dx = Number((v as LabelOffset)?.dx);
      const dy = Number((v as LabelOffset)?.dy);
      if (Number.isFinite(dx) && Number.isFinite(dy)) out[k] = { dx, dy };
    }
    return out;
  } catch {
    return {};
  }
}

export function getLabelNudge(map: Record<string, LabelOffset>, id: string): LabelOffset {
  return map[stableOverlayLabelLayoutKey(id)] ?? map[id] ?? { dx: 0, dy: 0 };
}

export function setLabelNudge(id: string, dx: number, dy: number): void {
  if (typeof window === 'undefined') return;
  const clamp = (n: number) => Math.max(LABEL_NUDGE_MIN, Math.min(LABEL_NUDGE_MAX, Math.round(n)));
  const k = stableOverlayLabelLayoutKey(id);
  const next = { ...readLabelNudges() };
  const x = clamp(dx);
  const y = clamp(dy);
  if (x === 0 && y === 0) delete next[k];
  else next[k] = { dx: x, dy: y };
  if (k !== id) delete next[id];
  try {
    window.localStorage.setItem(OVERLAY_LABEL_NUDGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  notifyLabelLayoutChanged();
}

export function readLabelNudgeFontSizes(): Record<string, number> {
  return readNumberMap(OVERLAY_LABEL_NUDGE_FS_KEY);
}

export function getLabelNudgeFontSize(map: Record<string, number>, id: string): number | null {
  const v = map[stableOverlayLabelLayoutKey(id)] ?? map[id];
  return Number.isFinite(v) ? (v as number) : null;
}

/** value가 null이면 개별 지정을 지우고 원래 크기로 되돌린다 */
export function setLabelNudgeFontSize(id: string, value: number | null): void {
  const k = stableOverlayLabelLayoutKey(id);
  const next = { ...readNumberMap(OVERLAY_LABEL_NUDGE_FS_KEY) };
  if (value == null) delete next[k];
  else next[k] = Math.max(6, Math.min(32, Math.round(value)));
  if (k !== id) delete next[id];
  writeNumberMap(OVERLAY_LABEL_NUDGE_FS_KEY, next);
  notifyLabelLayoutChanged();
}

export function clearAllLabelNudges(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(OVERLAY_LABEL_NUDGE_KEY);
  } catch {
    /* ignore */
  }
  writeNumberMap(OVERLAY_LABEL_NUDGE_FS_KEY, {});
  notifyLabelLayoutChanged();
}

/**
 * 차트가 실제로 그린 라벨 목록. 설정 패널의 "라벨 개별 조정"이 이 목록을 쓴다.
 * 팩(overlays)만 보면 차트 안에서 생성·병합된 라벨이 빠지므로, 화면에 뜬 것을 그대로 받는다.
 */
export const CHART_LABEL_REGISTRY_EVENT = 'ailongshort-chart-label-registry-changed';

export type ChartLabelTarget = { id: string; label: string };

let renderedChartLabels: ChartLabelTarget[] = [];
let renderedChartLabelsSig = '';

export function publishRenderedChartLabels(list: ChartLabelTarget[]): void {
  const seen = new Set<string>();
  const next: ChartLabelTarget[] = [];
  for (const it of list ?? []) {
    const id = String(it?.id ?? '').trim();
    const label = String(it?.label ?? '').trim();
    if (!id || !label) continue;
    const dedupe = `${id}\u0000${chartTextHideLabelKey(label) || label}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    next.push({ id, label });
  }
  const sig = next.map((x) => `${x.id}\u0000${x.label}`).join('\u0001');
  if (sig === renderedChartLabelsSig) return;
  renderedChartLabelsSig = sig;
  renderedChartLabels = next;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHART_LABEL_REGISTRY_EVENT));
  }
}

export function readRenderedChartLabels(): ChartLabelTarget[] {
  return renderedChartLabels;
}

/** 차트 위 글자만 ON/OFF — 존·선 도형은 유지. 설정 패널 ↔ ChartView 공용. */
export const OVERLAY_CHART_TEXT_HIDDEN_KEY = 'ailongshort-overlay-chart-text-hidden-ids';

function chartTextHideKeys(id: string): string[] {
  const raw = String(id || '').trim();
  if (!raw) return [];
  const keys = new Set<string>([raw, stableOverlayLabelKey(raw), stableOverlayLabelLayoutKey(raw)]);
  return [...keys].filter(Boolean);
}

/** 표시 문구로 묶음. `흰글자·` = 우측 흰 글자만, 그 외 = 노란/알약 캡션 */
export function chartTextHideLabelKey(label: string): string {
  const raw = String(label || '').trim();
  const white = raw.startsWith('흰글자·');
  const t = raw
    .replace(/^흰글자·/, '')
    .replace(/^노랑·/, '')
    .replace(/^축·/, '')
    .replace(/^◆+/g, '')
    .replace(/\s+/g, '')
    .replace(/[·•]/g, '');
  if (!t) return '';
  return `${white ? 'textw' : 'text'}:${t.slice(0, 48)}`;
}

function textKeyKind(key: string): 'white' | 'pill' | '' {
  if (key.startsWith('textw:')) return 'white';
  if (key.startsWith('text:')) return 'pill';
  return '';
}

function textKeyMatches(hiddenKey: string, labelKey: string): boolean {
  const hk = textKeyKind(hiddenKey);
  const lk = textKeyKind(labelKey);
  if (!hk || !lk || hk !== lk) return false;
  const a = hiddenKey.slice(hk === 'white' ? 6 : 5);
  const b = labelKey.slice(lk === 'white' ? 6 : 5);
  if (!a || !b) return false;
  if (a === b) return true;
  /** 핵심돌파 ≠ AI채널면, $$$$롱-65 ≠ $$$$롱-01 — 접두로 묶지 않음 */
  return false;
}

/** 우측 하얀 글자만 — 오버레이 id와 무관. 노란 알약과 따로 ON/OFF */
export function isChartTextWhiteLabelHidden(label: string, hidden?: Iterable<string>): boolean {
  const lk = chartTextHideLabelKey(`흰글자·${String(label || '').replace(/^흰글자·/, '')}`);
  if (!lk) return false;
  const set = hidden instanceof Set ? hidden : new Set(hidden ?? readHiddenChartTextIds());
  for (const h of set) {
    if (textKeyMatches(h, lk)) return true;
  }
  return false;
}

/** 우측 축·가격 숫자 알약 (64,953.60) */
export function isChartTextPriceLabelHidden(priceFmt: string, hidden?: Iterable<string>): boolean {
  const fmt = String(priceFmt || '').replace(/^가격·/, '').replace(/^축·/, '').trim();
  if (!fmt) return false;
  return isChartTextPillLabelHidden(`가격·${fmt}`, hidden);
}

export function isChartTextPillLabelHidden(label: string, hidden?: Iterable<string>): boolean {
  const raw = String(label || '')
    .replace(/^흰글자·/, '')
    .replace(/^노랑·/, '')
    .trim();
  const lk = chartTextHideLabelKey(raw);
  if (!lk || !lk.startsWith('text:') || lk.startsWith('textw:')) return false;
  const set = hidden instanceof Set ? hidden : new Set(hidden ?? readHiddenChartTextIds());
  for (const h of set) {
    if (textKeyMatches(h, lk)) return true;
  }
  return false;
}

export function readHiddenChartTextIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OVERLAY_CHART_TEXT_HIDDEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isChartTextIdHidden(id: string, hidden?: Iterable<string>, label?: string): boolean {
  const set = hidden instanceof Set ? hidden : new Set(hidden ?? readHiddenChartTextIds());
  for (const k of chartTextHideKeys(id)) {
    if (set.has(k)) return true;
  }
  const lk = chartTextHideLabelKey(label || '');
  if (lk) {
    for (const h of set) {
      if (textKeyMatches(h, lk)) return true;
    }
  }
  return false;
}

function writeHiddenChartTextIds(ids: Iterable<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OVERLAY_CHART_TEXT_HIDDEN_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* ignore */
  }
  notifyLabelLayoutChanged();
}

export function setChartTextIdVisible(id: string, visible: boolean, label?: string): void {
  const next = new Set(readHiddenChartTextIds());
  const lab = String(label || '');
  const lk = chartTextHideLabelKey(lab);
  /** 글자 토글은 id를 넣지 않음 — 핵심돌파 OFF가 AI채널면·매수면까지 같이 꺼지는 것 방지 */
  const labelOnly =
    lab.startsWith('흰글자·') ||
    lab.startsWith('노랑·') ||
    lab.startsWith('가격·') ||
    lab.startsWith('축·') ||
    /핵심돌파|핵심안착|핵심실패|AI채널면|매수면|매도면|\$\$\$\$/.test(lab);
  const keys = labelOnly || !String(id || '').trim()
    ? [lk].filter(Boolean)
    : [...chartTextHideKeys(id), lk].filter(Boolean);
  for (const k of keys) {
    if (visible) next.delete(k);
    else next.add(k);
  }
  if (visible && lk) {
    for (const h of [...next]) {
      if (textKeyMatches(h, lk)) next.delete(h);
    }
  }
  writeHiddenChartTextIds(next);
}

export function setManyChartTextIdsVisible(
  ids: string[],
  visible: boolean,
  labels?: string[]
): void {
  const next = new Set(readHiddenChartTextIds());
  ids.forEach((id, i) => {
    const lab = String(labels?.[i] || '');
    const lk = chartTextHideLabelKey(lab);
    const labelOnly =
      lab.startsWith('흰글자·') ||
      lab.startsWith('노랑·') ||
      lab.startsWith('가격·') ||
      lab.startsWith('축·') ||
      /핵심돌파|핵심안착|핵심실패|AI채널면|매수면|매도면|\$\$\$\$/.test(lab);
    const keys = labelOnly || !String(id || '').trim()
      ? [lk].filter(Boolean)
      : [...chartTextHideKeys(id), lk].filter(Boolean);
    for (const k of keys) {
      if (visible) next.delete(k);
      else next.add(k);
    }
    if (visible && lk) {
      for (const h of [...next]) {
        if (textKeyMatches(h, lk)) next.delete(h);
      }
    }
  });
  writeHiddenChartTextIds(next);
}

export function clearHiddenChartTextIds(): void {
  writeHiddenChartTextIds([]);
}

export function mergedDeskPriceLineLabelId(title: string): string {
  const t = String(title || '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return `merged-desk-priceline-${t || 'line'}`;
}

export function notifyLabelLayoutChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHART_LABEL_LAYOUT_EVENT));
}

export function getLabelOffset(
  offsets: Record<string, LabelOffset>,
  id: string
): LabelOffset {
  const k = stableOverlayLabelKey(id);
  return offsets[k] ?? offsets[id] ?? { dx: 0, dy: 0 };
}

/** 한 라벨의 dx/dy를 절대값으로 지정. dx·dy가 모두 0이면 항목을 지운다 */
export function setLabelOffset(symbol: string, id: string, dx: number, dy: number): void {
  const k = stableOverlayLabelKey(id);
  const cur = readLabelOffsets(symbol);
  const next = { ...cur };
  if (dx === 0 && dy === 0) delete next[k];
  else next[k] = { dx, dy };
  if (k !== id) delete next[id];
  writeLabelOffsets(symbol, next);
  notifyLabelLayoutChanged();
}

export function getLabelFontSize(
  sizes: Record<string, number>,
  id: string,
  fallback: number
): number {
  const k = stableOverlayLabelKey(id);
  const v = sizes[k] ?? sizes[id];
  return Number.isFinite(v) ? (v as number) : fallback;
}

/** value가 null이면 개별 지정을 지우고 전역 기본 글자 크기로 되돌린다 */
export function setLabelFontSize(id: string, value: number | null): void {
  const k = stableOverlayLabelKey(id);
  const cur = readLabelFontSizes();
  const next = { ...cur };
  if (value == null) delete next[k];
  else next[k] = Math.max(7, Math.min(28, Math.round(value)));
  if (k !== id) delete next[id];
  writeLabelFontSizes(next);
  notifyLabelLayoutChanged();
}

export function clearAllLabelOffsets(symbol: string): void {
  writeLabelOffsets(symbol, {});
  notifyLabelLayoutChanged();
}

/** 차트 라벨 클릭 → 차트설정 목록에서 같은 행 하이라이트 */
export const CHART_LABEL_FOCUS_EVENT = 'ailongshort-chart-label-focus';

export type ChartLabelFocusDetail = { id: string; label: string };

export function focusChartLabelInSettings(id: string, label?: string): void {
  if (typeof window === 'undefined') return;
  const detail: ChartLabelFocusDetail = {
    id: String(id || '').trim(),
    label: String(label || '').trim(),
  };
  if (!detail.id && !detail.label) return;
  window.dispatchEvent(new Event('ailongshort-open-merged-desk-chart-settings'));
  window.dispatchEvent(new CustomEvent(CHART_LABEL_FOCUS_EVENT, { detail }));
}
