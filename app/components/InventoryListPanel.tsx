'use client';

import { useEffect, useMemo, useState } from 'react';

type MovementKind =
  | 'direct_inbound'
  | 'register_pending_in'
  | 'apply_pending_in'
  | 'register_pending_out'
  | 'commit_outbound';

type Item = {
  id: string;
  name: string;
  nominalSize: string;
  ratingK: string;
  standardCode: string;
  flangeType: string;
  faceType: string;
  spec: string;
  category: string;
  unit: string;
  stockQty: number;
  pendingInQty: number;
  pendingOutQty: number;
  minQty: number;
  location: string;
  note: string;
  updatedAt: string;
};

type Movement = {
  at: string;
  itemId: string;
  itemName: string;
  nominalSize: string;
  kind: MovementKind;
  qty: number;
  note: string;
};

const AUTH_KEY = 'inventory-list-auth-v1';
const STORE_KEY = 'inventory-list-items-v2';
const MOVEMENT_KEY = 'inventory-list-movements-v1';
const SIZE_KEY = 'inventory-list-sizes-v1';
const PRESSURE_KEY = 'inventory-list-pressure-groups-v1';
const LOW_RULE_KEY = 'inventory-list-low-rule-v1';
const SIZE_LOW_RULE_KEY = 'inventory-list-size-low-rule-v1';
const FONT_SCALE_KEY = 'inventory-list-font-scale-v1';

const K_RATINGS = ['5K', '10K', '16K', '20K', '30K', '40K', '63K', '150LB', '300LB', '600LB'] as const;
const BAR_RATINGS = ['DIN10BAR', 'DIN16BAR', 'DIN25BAR', 'DIN40BAR'] as const;
const PAGE_COLUMNS = ['DIN4308', 'DIN3578', 'SPRING_SAFE'] as const;
const DEFAULT_PRESSURE_GROUPS = [...K_RATINGS, ...BAR_RATINGS, ...PAGE_COLUMNS] as const;
const STANDARD_CODES = ['DIN4308', 'DIN3578', 'SPRING_SAFETY', 'KS', 'JIS', 'ASME'] as const;
const FLANGE_TYPES = ['안전변', '제수변', 'SOFF', 'SORF', 'BLFF', 'BLRF', 'WN', 'SW'] as const;
const FACE_TYPES = ['FF', 'RF', 'RTJ', 'TG'] as const;
const CORE_SPLIT_TYPES = ['SOFF', 'SORF', 'BLRF', 'BLFF'] as const;
const DEFAULT_NOMINAL_SIZES = [
  '15A', '20A', '25A', '32A', '40A', '50A', '65A', '80A', '90A', '100A', '125A',
  '150A', '200A', '250A', '300A', '350A', '400A', '450A', '500A', '550A', '600A', '650A', '700A', '750A', '800A',
] as const;

const DEFAULT_ITEMS: Item[] = [
  {
    id: 'NPS-15A-001',
    name: '플랜지 기본 품목',
    nominalSize: '15A',
    ratingK: '10K',
    standardCode: 'DIN4308',
    flangeType: '제수변',
    faceType: 'FF',
    spec: '카다록 규격 입력',
    category: 'FLANGE',
    unit: 'EA',
    stockQty: 0,
    pendingInQty: 0,
    pendingOutQty: 0,
    minQty: 5,
    location: 'A-1',
    note: '카다록 Nominal Pipe Size 기준 관리',
    updatedAt: new Date().toISOString(),
  },
];

const EMPTY_DRAFT: Item = {
  id: '',
  name: '',
  nominalSize: '15A',
  ratingK: '10K',
  standardCode: 'DIN4308',
  flangeType: '제수변',
  faceType: 'FF',
  spec: '',
  category: 'FLANGE',
  unit: 'EA',
  stockQty: 0,
  pendingInQty: 0,
  pendingOutQty: 0,
  minQty: 0,
  location: '',
  note: '',
  updatedAt: '',
};

function coerceItem(raw: Partial<Item>): Item {
  const nominalSize = String(raw.nominalSize || '15A').trim().toUpperCase() || '15A';
  const ratingK = String(raw.ratingK || '10K').trim().toUpperCase() || '10K';
  const standardCode = STANDARD_CODES.includes((raw as any).standardCode as (typeof STANDARD_CODES)[number])
    ? String((raw as any).standardCode)
    : 'DIN4308';
  const flangeType = FLANGE_TYPES.includes((raw as any).flangeType as (typeof FLANGE_TYPES)[number])
    ? String((raw as any).flangeType)
    : '제수변';
  const faceType = FACE_TYPES.includes((raw as any).faceType as (typeof FACE_TYPES)[number])
    ? String((raw as any).faceType)
    : 'FF';
  return {
    id: String(raw.id || '').trim().toUpperCase(),
    name: String(raw.name || ''),
    nominalSize,
    ratingK,
    standardCode,
    flangeType,
    faceType,
    spec: String(raw.spec || ''),
    category: String(raw.category || 'FLANGE'),
    unit: String(raw.unit || 'EA'),
    stockQty: Number(raw.stockQty) || 0,
    pendingInQty: Number((raw as any).pendingInQty ?? (raw as any).inboundPendingQty) || 0,
    pendingOutQty: Number((raw as any).pendingOutQty) || 0,
    minQty: Number(raw.minQty) || 0,
    location: String(raw.location || ''),
    note: String(raw.note || ''),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

function loadItems(): Item[] {
  if (typeof window === 'undefined') return DEFAULT_ITEMS;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_ITEMS;
    const parsed = JSON.parse(raw) as Partial<Item>[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ITEMS;
    return parsed.map(coerceItem);
  } catch {
    return DEFAULT_ITEMS;
  }
}

function saveItems(items: Item[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(items));
}

function loadMovements(): Movement[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MOVEMENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Movement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMovements(rows: Movement[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MOVEMENT_KEY, JSON.stringify(rows.slice(0, 300)));
}

function normalizeSize(raw: string): string {
  return String(raw || '').trim().toUpperCase();
}

function loadSizes(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_NOMINAL_SIZES];
  try {
    const raw = window.localStorage.getItem(SIZE_KEY);
    if (!raw) return [...DEFAULT_NOMINAL_SIZES];
    const parsed = JSON.parse(raw) as string[];
    const cleaned = Array.isArray(parsed)
      ? parsed.map(normalizeSize).filter(Boolean)
      : [];
    return cleaned.length ? [...new Set(cleaned)] : [...DEFAULT_NOMINAL_SIZES];
  } catch {
    return [...DEFAULT_NOMINAL_SIZES];
  }
}

function saveSizes(rows: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SIZE_KEY, JSON.stringify([...new Set(rows.map(normalizeSize).filter(Boolean))]));
}

function normalizePressureGroup(raw: string): string {
  return String(raw || '').trim().toUpperCase();
}

function loadPressureGroups(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_PRESSURE_GROUPS];
  try {
    const raw = window.localStorage.getItem(PRESSURE_KEY);
    if (!raw) return [...DEFAULT_PRESSURE_GROUPS];
    const parsed = JSON.parse(raw) as string[];
    const cleaned = Array.isArray(parsed)
      ? parsed.map(normalizePressureGroup).filter(Boolean)
      : [];
    return cleaned.length ? [...new Set(cleaned)] : [...DEFAULT_PRESSURE_GROUPS];
  } catch {
    return [...DEFAULT_PRESSURE_GROUPS];
  }
}

function savePressureGroups(rows: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PRESSURE_KEY, JSON.stringify([...new Set(rows.map(normalizePressureGroup).filter(Boolean))]));
}

function loadLowRuleMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOW_RULE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}

function saveLowRuleMap(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOW_RULE_KEY, JSON.stringify(map));
}

function loadSizeLowRuleMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SIZE_LOW_RULE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}

function saveSizeLowRuleMap(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SIZE_LOW_RULE_KEY, JSON.stringify(map));
}

function loadFontScale(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = Number(window.localStorage.getItem(FONT_SCALE_KEY));
    if (!Number.isFinite(raw)) return 1;
    return Math.max(0.75, Math.min(1.8, raw));
  } catch {
    return 1;
  }
}

function saveFontScale(v: number) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FONT_SCALE_KEY, String(v));
}

function parseScanPayload(rawInput: string): { code: string; qty?: number } {
  const raw = String(rawInput || '').trim();
  if (!raw) return { code: '' };
  const normalized = raw.replace(/\s+/g, '');
  const m = normalized.match(/^(.*?)(?:[\*xX,/:;|_-]+)(\d{1,6})$/);
  if (!m) return { code: normalized.toUpperCase() };
  const code = String(m[1] || '').trim().toUpperCase();
  const qtyNum = Number(m[2] || 0);
  if (!code) return { code: normalized.toUpperCase() };
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) return { code };
  return { code, qty: Math.floor(qtyNum) };
}

type OcrParsedRow = {
  nominalSize: string;
  qty: number;
  ratingK?: string;
  flangeType?: string;
  nameHint?: string;
};

type ScanApplyMode = 'inbound' | 'pending_in' | 'outbound' | 'stock_set';

function pickBestSplitPoint(nums: number[], knownSizeSet: Set<number>): number {
  if (nums.length < 4) return Math.floor(nums.length / 2);
  let bestIdx = Math.floor(nums.length / 2);
  let bestScore = -1;
  for (let i = 2; i <= nums.length - 2; i += 1) {
    const left = nums.slice(0, i);
    const right = nums.slice(i);
    const leftKnown = left.filter((n) => knownSizeSet.has(n) || (n >= 15 && n <= 800)).length;
    const rightSmall = right.filter((n) => n >= 1 && n <= 500).length;
    const uniqRight = new Set(right).size;
    const repeatBonus = right.length - uniqRight;
    const score = leftKnown * 3 + rightSmall * 2 + repeatBonus;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function parseOcrRowsFromText(rawText: string): OcrParsedRow[] {
  const text = String(rawText || '').toUpperCase();
  if (!text.trim()) return [];
  const lines = text
    .split(/\r?\n/)
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const knownSizeSet = new Set(
    DEFAULT_NOMINAL_SIZES.map((s) => Number(String(s).replace(/[^0-9]/g, ''))).filter((n) => Number.isFinite(n) && n > 0)
  );
  const out: OcrParsedRow[] = [];
  let currentRating = '';
  let currentFlange = '';
  let currentName = '';
  for (const line of lines) {
    const rating = line.match(/(DIN\d{1,3}BAR|\d{1,3}K|\d{2,4}LB)/)?.[1];
    const flange = line.match(/\b(SOFF|SORF|BLRF|BLFF|WN|SW|FF|RF)\b/)?.[1];
    if (rating) currentRating = rating;
    if (flange) currentFlange = flange;
    if (rating || flange) currentName = line;
    const pairRegex = /\b(\d{2,4})\s+(\d{1,5})\b/g;
    const pairs = [...line.matchAll(pairRegex)];
    for (const p of pairs) {
      const sizeNum = Number(p[1]);
      const qtyNum = Number(p[2]);
      if (!Number.isFinite(sizeNum) || !Number.isFinite(qtyNum)) continue;
      if (!knownSizeSet.has(sizeNum)) continue;
      if (qtyNum <= 0 || qtyNum > 100000) continue;
      out.push({
        nominalSize: `${Math.floor(sizeNum)}A`,
        qty: Math.floor(qtyNum),
        ratingK: currentRating || undefined,
        flangeType: currentFlange || undefined,
        nameHint: currentName || undefined,
      });
    }
  }
  if (out.length) return out;

  // Fallback A: SOFF/SORF/BLRF/BLFF 섹션별 복원
  const flangeMatches = [...text.matchAll(/\b(SOFF|SORF|BLRF|BLFF)\b/g)];
  if (flangeMatches.length) {
    const sectionRows: OcrParsedRow[] = [];
    for (let i = 0; i < flangeMatches.length; i += 1) {
      const fm = flangeMatches[i]!;
      const start = fm.index ?? 0;
      const end = i + 1 < flangeMatches.length ? (flangeMatches[i + 1]!.index ?? text.length) : text.length;
      const section = text.slice(start, end);
      const rating = section.match(/(DIN\d{1,3}BAR|\d{1,3}K|\d{2,4}LB)/)?.[1];
      const flange = fm[1];
      const nums = (section.match(/\d{1,5}/g) || [])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 2000);
      if (nums.length < 4) continue;
      const split = pickBestSplitPoint(nums, knownSizeSet);
      const left = nums.slice(0, split).filter((n) => knownSizeSet.has(n));
      const right = nums.slice(split).filter((n) => n >= 1 && n <= 500);
      const count = Math.min(left.length, right.length, 120);
      for (let j = 0; j < count; j += 1) {
        sectionRows.push({
          nominalSize: `${Math.floor(left[j]!)}A`,
          qty: Math.floor(right[j]!),
          ratingK: rating || undefined,
          flangeType: flange || undefined,
          nameHint: section.slice(0, 80).replace(/\s+/g, ' ').trim(),
        });
      }
    }
    if (sectionRows.length) return sectionRows;
  }

  // Fallback B: 전체 숫자열 분리 추정
  const nums = (text.match(/\d{1,5}/g) || [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 2000);
  if (nums.length < 4) return [];
  const split = pickBestSplitPoint(nums, knownSizeSet);
  const left = nums.slice(0, split).filter((n) => knownSizeSet.has(n));
  const right = nums.slice(split).filter((n) => n >= 1 && n <= 500);
  const count = Math.min(left.length, right.length, 120);
  const fallbackRows: OcrParsedRow[] = [];
  for (let i = 0; i < count; i += 1) {
    fallbackRows.push({
      nominalSize: `${Math.floor(left[i]!)}A`,
      qty: Math.floor(right[i]!),
    });
  }
  return fallbackRows;
}

function parseInvoiceStyleRows(rawText: string): OcrParsedRow[] {
  const normalizeLikelyQty = (v: number) => {
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (v < 10) return v * 10; // OCR 50->5, 30->3 보정
    if (v > 5000) return 0;
    return Math.floor(v);
  };
  const stabilizeBySection = (rows: OcrParsedRow[]) => {
    if (!rows.length) return rows;
    const grouped = new Map<string, OcrParsedRow[]>();
    for (const r of rows) {
      const k = `${r.ratingK || 'NA'}|${r.flangeType || 'NA'}`;
      const arr = grouped.get(k) || [];
      arr.push(r);
      grouped.set(k, arr);
    }
    const out: OcrParsedRow[] = [];
    for (const rowsInSection of grouped.values()) {
      const freq = new Map<number, number>();
      for (const r of rowsInSection) {
        const q = normalizeLikelyQty(r.qty);
        if (q > 0) freq.set(q, (freq.get(q) || 0) + 1);
      }
      let modeQty = 0;
      let modeCnt = 0;
      for (const [q, c] of freq.entries()) {
        if (c > modeCnt) {
          modeQty = q;
          modeCnt = c;
        }
      }
      for (const r of rowsInSection) {
        const q = normalizeLikelyQty(r.qty);
        const fixedQty =
          modeQty > 0 && modeCnt >= 2 && (q <= 0 || q < modeQty / 3 || q > modeQty * 3)
            ? modeQty
            : q;
        if (fixedQty <= 0) continue;
        out.push({ ...r, qty: fixedQty });
      }
    }
    return out;
  };
  const text = String(rawText || '').toUpperCase();
  if (!text.trim()) return [];
  const lines = text
    .split(/\r?\n/)
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out: OcrParsedRow[] = [];
  const knownSizeSet = new Set(
    DEFAULT_NOMINAL_SIZES.map((s) => Number(String(s).replace(/[^0-9]/g, ''))).filter((n) => Number.isFinite(n) && n > 0)
  );
  let currentRating = '';
  let currentFlange = '';
  let currentQty = 0;
  let inTable = false;
  for (const line of lines) {
    if (/FAX|TEL|요청일|납기|연락처/.test(line)) continue;
    if (/품\s*명|규\s*격|수\s*량|운송방법/.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    const rating = line.match(/(DIN\d{1,3}BAR|\d{1,3}K|\d{2,4}LB)/)?.[1];
    const flange = line.match(/\b(SOFF|SORF|BLRF|BLFF)\b/)?.[1];
    if (rating) currentRating = rating;
    if (flange) currentFlange = flange;
    const nums = (line.match(/\d{1,4}/g) || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (!nums.length) continue;
    // "규격 수량" 한 줄: 품명 숫자(SSC13, DIN16)는 앞에 섞일 수 있으므로
    // 허용 규격값을 먼저 찾고, 그 뒤 숫자를 수량으로 잡는다.
    if (nums.length >= 2) {
      let pickedSize = 0;
      let pickedQty = 0;
      for (let i = 0; i < nums.length - 1; i += 1) {
        const s = nums[i]!;
        if (!knownSizeSet.has(s)) continue;
        const q = normalizeLikelyQty(nums[i + 1]!);
        if (q >= 1 && q <= 5000) {
          pickedSize = s;
          pickedQty = q;
          break;
        }
      }
      if (!pickedSize || !pickedQty) {
        // 마지막 2개도 보조로 확인
        const s = nums[nums.length - 2]!;
        const q = normalizeLikelyQty(nums[nums.length - 1]!);
        if (knownSizeSet.has(s) && q >= 1 && q <= 5000) {
          pickedSize = s;
          pickedQty = q;
        }
      }
      if (pickedSize && pickedQty) {
        currentQty = pickedQty;
        out.push({
          nominalSize: `${Math.floor(pickedSize)}A`,
          qty: Math.floor(pickedQty),
          ratingK: currentRating || undefined,
          flangeType: currentFlange || undefined,
          nameHint: `${currentRating || ''} ${currentFlange || ''}`.trim() || undefined,
        });
      }
      continue;
    }
    // "규격"만 줄로 분리된 경우 -> 마지막 수량 사용
    const s = nums[0]!;
    if (knownSizeSet.has(s) && currentQty > 0) {
      out.push({
        nominalSize: `${Math.floor(s)}A`,
        qty: Math.floor(currentQty),
        ratingK: currentRating || undefined,
        flangeType: currentFlange || undefined,
        nameHint: `${currentRating || ''} ${currentFlange || ''}`.trim() || undefined,
      });
    } else if (s >= 1 && s <= 500) {
      currentQty = normalizeLikelyQty(s);
    }
  }
  const stabilized = stabilizeBySection(out);
  return stabilized.sort((a, b) => {
    const as = Number(a.nominalSize.replace(/[^0-9]/g, '')) || 0;
    const bs = Number(b.nominalSize.replace(/[^0-9]/g, '')) || 0;
    return as - bs;
  });
}

function loadAuth() {
  if (typeof window === 'undefined') return { id: 'admin', pw: '1234' };
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return { id: 'admin', pw: '1234' };
    const parsed = JSON.parse(raw) as { id?: string; pw?: string };
    return {
      id: String(parsed?.id || 'admin'),
      pw: String(parsed?.pw || '1234'),
    };
  } catch {
    return { id: 'admin', pw: '1234' };
  }
}

export default function InventoryListPanel({
  open,
  onClose,
  fullViewport = false,
}: {
  open: boolean;
  onClose: () => void;
  fullViewport?: boolean;
}) {
  const [authed, setAuthed] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [loginErr, setLoginErr] = useState('');

  const [items, setItems] = useState<Item[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [nominalSizes, setNominalSizes] = useState<string[]>([...DEFAULT_NOMINAL_SIZES]);
  const [pressureGroups, setPressureGroups] = useState<string[]>([...DEFAULT_PRESSURE_GROUPS]);
  const [lowRuleMap, setLowRuleMap] = useState<Record<string, number>>({});
  const [sizeLowRuleMap, setSizeLowRuleMap] = useState<Record<string, number>>({});
  const [fontScale, setFontScale] = useState(1);
  const [sizeInput, setSizeInput] = useState('');
  const [pressureInput, setPressureInput] = useState('');
  const [ruleSize, setRuleSize] = useState('15A');
  const [ruleGroup, setRuleGroup] = useState('10K');
  const [ruleQty, setRuleQty] = useState(0);
  const [sizeRuleQty, setSizeRuleQty] = useState(0);
  const [draft, setDraft] = useState<Item>(EMPTY_DRAFT);
  const [q, setQ] = useState('');
  const [sizeTab, setSizeTab] = useState<string>('ALL');
  const [kTab, setKTab] = useState<string>('ALL');
  const [standardTab, setStandardTab] = useState<string>('ALL');
  const [flangeTab, setFlangeTab] = useState<string>('ALL');
  const [faceTab, setFaceTab] = useState<string>('ALL');

  const [moveItemId, setMoveItemId] = useState('');
  const [moveKind, setMoveKind] = useState<MovementKind>('direct_inbound');
  const [moveQty, setMoveQty] = useState(0);
  const [moveNote, setMoveNote] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanText, setScanText] = useState('');
  const [scanMode, setScanMode] = useState<ScanApplyMode>('pending_in');
  const [scanRowsDraft, setScanRowsDraft] = useState<OcrParsedRow[]>([]);
  const [scanStrict, setScanStrict] = useState(false);

  useEffect(() => {
    if (!open) return;
    const loadedItems = loadItems();
    const loadedSizes = loadSizes();
    const loadedGroups = loadPressureGroups();
    const loadedLowMap = loadLowRuleMap();
    const loadedSizeLowMap = loadSizeLowRuleMap();
    const loadedScale = loadFontScale();
    const mergedSizes = [...loadedSizes];
    const mergedGroups = [...loadedGroups];
    for (const it of loadedItems) {
      const s = normalizeSize(it.nominalSize);
      if (s && !mergedSizes.includes(s)) mergedSizes.push(s);
      const g = normalizePressureGroup(it.ratingK);
      if (g && !mergedGroups.includes(g)) mergedGroups.push(g);
    }
    setNominalSizes(mergedSizes);
    setPressureGroups(mergedGroups);
    setLowRuleMap(loadedLowMap);
    setSizeLowRuleMap(loadedSizeLowMap);
    setFontScale(loadedScale);
    saveSizes(mergedSizes);
    savePressureGroups(mergedGroups);
    setItems(loadedItems);
    setMovements(loadMovements());
    setAuthed(false);
    setLoginId('');
    setLoginPw('');
    setLoginErr('');
    setDraft(EMPTY_DRAFT);
    setQ('');
    setSizeTab('ALL');
    setKTab('ALL');
    setStandardTab('ALL');
    setFlangeTab('ALL');
    setFaceTab('ALL');
    setMoveItemId('');
    setMoveKind('direct_inbound');
    setMoveQty(0);
    setMoveNote('');
    setSizeInput('');
    setPressureInput('');
    setRuleSize(mergedSizes[0] || '15A');
    setRuleGroup(mergedGroups[0] || '10K');
    setRuleQty(0);
    setSizeRuleQty(0);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((x) => {
      if (sizeTab !== 'ALL' && x.nominalSize !== sizeTab) return false;
      if (kTab !== 'ALL' && x.ratingK !== kTab) return false;
      if (standardTab !== 'ALL' && x.standardCode !== standardTab) return false;
      if (flangeTab !== 'ALL' && x.flangeType !== flangeTab) return false;
      if (faceTab !== 'ALL' && x.faceType !== faceTab) return false;
      if (!needle) return true;
      return (
        x.id.toLowerCase().includes(needle) ||
        x.name.toLowerCase().includes(needle) ||
        `${x.standardCode} ${x.flangeType} ${x.faceType} ${x.ratingK} ${x.spec}`.toLowerCase().includes(needle) ||
        x.category.toLowerCase().includes(needle)
      );
    });
  }, [items, q, sizeTab, kTab, standardTab, flangeTab, faceTab]);

  const stat = useMemo(() => {
    const pool = items.filter(
      (x) =>
        (sizeTab === 'ALL' || x.nominalSize === sizeTab) &&
        (kTab === 'ALL' || x.ratingK === kTab) &&
        (standardTab === 'ALL' || x.standardCode === standardTab) &&
        (flangeTab === 'ALL' || x.flangeType === flangeTab) &&
        (faceTab === 'ALL' || x.faceType === faceTab)
    );
    const stock = pool.reduce((s, x) => s + x.stockQty, 0);
    const pendingIn = pool.reduce((s, x) => s + x.pendingInQty, 0);
    const pendingOut = pool.reduce((s, x) => s + x.pendingOutQty, 0);
    const available = stock + pendingIn - pendingOut;
    const shortage = pool.filter((x) => x.stockQty + x.pendingInQty - x.pendingOutQty <= x.minQty).length;
    return { stock, pendingIn, pendingOut, available, shortage, count: pool.length };
  }, [items, sizeTab, kTab, standardTab, flangeTab, faceTab]);

  const matrixMap = useMemo(() => {
    const m = new Map<string, { stock: number; pendingIn: number; pendingOut: number; min: number; count: number }>();
    for (const it of items) {
      const key = `${it.nominalSize}|${it.ratingK}|${it.flangeType}`;
      const row = m.get(key) ?? { stock: 0, pendingIn: 0, pendingOut: 0, min: 0, count: 0 };
      row.stock += it.stockQty;
      row.pendingIn += it.pendingInQty;
      row.pendingOut += it.pendingOutQty;
      row.min += it.minQty;
      row.count += 1;
      m.set(key, row);
    }
    return m;
  }, [items]);

  const sizeAvailMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of nominalSizes) m.set(s, 0);
    for (const it of items) {
      if (standardTab !== 'ALL' && it.standardCode !== standardTab) continue;
      if (flangeTab !== 'ALL' && it.flangeType !== flangeTab) continue;
      if (faceTab !== 'ALL' && it.faceType !== faceTab) continue;
      if (kTab !== 'ALL' && it.ratingK !== kTab) continue;
      const curr = m.get(it.nominalSize) ?? 0;
      m.set(it.nominalSize, curr + (it.stockQty + it.pendingInQty - it.pendingOutQty));
    }
    return m;
  }, [items, nominalSizes, standardTab, flangeTab, faceTab, kTab]);

  if (!open) return null;

  const onLogin = () => {
    const auth = loadAuth();
    const ok = loginId.trim() === auth.id && loginPw === auth.pw;
    if (!ok) {
      setLoginErr('ID 또는 비밀번호가 다릅니다.');
      return;
    }
    setAuthed(true);
    setLoginErr('');
  };

  const upsertItem = () => {
    const id = draft.id.trim().toUpperCase();
    const name = draft.name.trim();
    if (!id || !name) {
      alert('품목코드와 품목명은 필수입니다.');
      return;
    }
    const normSize = normalizeSize(draft.nominalSize);
    if (!normSize) {
      alert('Size를 입력/선택하세요.');
      return;
    }
    const next = coerceItem({ ...draft, id, name, updatedAt: new Date().toISOString() });
    next.nominalSize = normSize;
    next.ratingK = normalizePressureGroup(next.ratingK);
    const copy = [...items];
    const idx = copy.findIndex((x) => x.id === id);
    if (idx >= 0) copy[idx] = next;
    else copy.unshift(next);
    setItems(copy);
    saveItems(copy);
    if (!nominalSizes.includes(normSize)) {
      const sizeNext = [...nominalSizes, normSize];
      setNominalSizes(sizeNext);
      saveSizes(sizeNext);
    }
    if (!moveItemId) setMoveItemId(id);
    if (next.ratingK && !pressureGroups.includes(next.ratingK)) {
      const groupNext = [...pressureGroups, next.ratingK];
      setPressureGroups(groupNext);
      savePressureGroups(groupNext);
    }
  };

  const addSize = () => {
    const ns = normalizeSize(sizeInput);
    if (!ns) return;
    if (nominalSizes.includes(ns)) {
      alert('이미 있는 Size 입니다.');
      return;
    }
    const next = [...nominalSizes, ns];
    setNominalSizes(next);
    saveSizes(next);
    setSizeInput('');
  };

  const renameSelectedSize = () => {
    if (sizeTab === 'ALL') {
      alert('변경할 Size를 먼저 선택하세요.');
      return;
    }
    const nextName = normalizeSize(window.prompt(`${sizeTab} -> 새 Size 이름`, sizeTab) || '');
    if (!nextName || nextName === sizeTab) return;
    if (nominalSizes.includes(nextName)) {
      alert('이미 존재하는 Size 이름입니다.');
      return;
    }
    const nextSizes = nominalSizes.map((s) => (s === sizeTab ? nextName : s));
    const nextItems = items.map((x) => (x.nominalSize === sizeTab ? { ...x, nominalSize: nextName } : x));
    const nextMoves = movements.map((m) => (m.nominalSize === sizeTab ? { ...m, nominalSize: nextName } : m));
    setNominalSizes(nextSizes);
    setItems(nextItems);
    setMovements(nextMoves);
    setSizeTab(nextName);
    saveSizes(nextSizes);
    saveItems(nextItems);
    saveMovements(nextMoves);
  };

  const deleteSelectedSize = () => {
    if (sizeTab === 'ALL') {
      alert('삭제할 Size를 먼저 선택하세요.');
      return;
    }
    if (nominalSizes.length <= 1) {
      alert('Size는 최소 1개 이상 필요합니다.');
      return;
    }
    const replacements = nominalSizes.filter((s) => s !== sizeTab);
    const suggested = replacements[0]!;
    const replacement = normalizeSize(window.prompt(`${sizeTab} 삭제 시 대체 Size 입력`, suggested) || '');
    if (!replacement || !replacements.includes(replacement)) {
      alert('대체 Size가 올바르지 않습니다.');
      return;
    }
    const nextSizes = nominalSizes.filter((s) => s !== sizeTab);
    const nextItems = items.map((x) => (x.nominalSize === sizeTab ? { ...x, nominalSize: replacement } : x));
    const nextMoves = movements.map((m) => (m.nominalSize === sizeTab ? { ...m, nominalSize: replacement } : m));
    setNominalSizes(nextSizes);
    setItems(nextItems);
    setMovements(nextMoves);
    setSizeTab(replacement);
    saveSizes(nextSizes);
    saveItems(nextItems);
    saveMovements(nextMoves);
  };

  const addPressureGroup = () => {
    const g = normalizePressureGroup(pressureInput);
    if (!g) return;
    if (pressureGroups.includes(g)) {
      alert('이미 있는 그룹입니다.');
      return;
    }
    const next = [...pressureGroups, g];
    setPressureGroups(next);
    savePressureGroups(next);
    setPressureInput('');
  };

  const renameSelectedGroup = () => {
    if (kTab === 'ALL') {
      alert('변경할 그룹을 먼저 선택하세요.');
      return;
    }
    const nextName = normalizePressureGroup(window.prompt(`${kTab} -> 새 그룹 이름`, kTab) || '');
    if (!nextName || nextName === kTab) return;
    if (pressureGroups.includes(nextName)) {
      alert('이미 존재하는 그룹입니다.');
      return;
    }
    const nextGroups = pressureGroups.map((g) => (g === kTab ? nextName : g));
    const nextItems = items.map((x) => (x.ratingK === kTab ? { ...x, ratingK: nextName } : x));
    setPressureGroups(nextGroups);
    setItems(nextItems);
    setKTab(nextName);
    savePressureGroups(nextGroups);
    saveItems(nextItems);
  };

  const deleteSelectedGroup = () => {
    if (kTab === 'ALL') {
      alert('삭제할 그룹을 먼저 선택하세요.');
      return;
    }
    if (pressureGroups.length <= 1) {
      alert('그룹은 최소 1개 이상 필요합니다.');
      return;
    }
    const replacements = pressureGroups.filter((g) => g !== kTab);
    const suggested = replacements[0]!;
    const replacement = normalizePressureGroup(window.prompt(`${kTab} 삭제 시 대체 그룹 입력`, suggested) || '');
    if (!replacement || !replacements.includes(replacement)) {
      alert('대체 그룹이 올바르지 않습니다.');
      return;
    }
    const nextGroups = pressureGroups.filter((g) => g !== kTab);
    const nextItems = items.map((x) => (x.ratingK === kTab ? { ...x, ratingK: replacement } : x));
    setPressureGroups(nextGroups);
    setItems(nextItems);
    setKTab(replacement);
    savePressureGroups(nextGroups);
    saveItems(nextItems);
  };

  const applyLowRule = () => {
    const s = normalizeSize(ruleSize);
    const g = normalizePressureGroup(ruleGroup);
    const q = Math.max(0, Math.floor(ruleQty));
    if (!s || !g) return;
    const key = `${s}|${g}`;
    const next = { ...lowRuleMap, [key]: q };
    setLowRuleMap(next);
    saveLowRuleMap(next);
  };

  const clearLowRule = () => {
    const s = normalizeSize(ruleSize);
    const g = normalizePressureGroup(ruleGroup);
    const key = `${s}|${g}`;
    const next = { ...lowRuleMap };
    delete next[key];
    setLowRuleMap(next);
    saveLowRuleMap(next);
  };

  const applySizeLowRule = () => {
    const s = normalizeSize(sizeTab === 'ALL' ? ruleSize : sizeTab);
    const q = Math.max(0, Math.floor(sizeRuleQty));
    if (!s) return;
    const next = { ...sizeLowRuleMap, [s]: q };
    setSizeLowRuleMap(next);
    saveSizeLowRuleMap(next);
  };

  const clearSizeLowRule = () => {
    const s = normalizeSize(sizeTab === 'ALL' ? ruleSize : sizeTab);
    if (!s) return;
    const next = { ...sizeLowRuleMap };
    delete next[s];
    setSizeLowRuleMap(next);
    saveSizeLowRuleMap(next);
  };

  const quickSetPairRule = (size: string, group: string) => {
    const s = normalizeSize(size);
    const g = normalizePressureGroup(group);
    const key = `${s}|${g}`;
    const current = lowRuleMap[key];
    const ask = window.prompt(
      `${s} / ${g} 부족 기준 입력 (숫자)\n- 비우고 확인: 기준 삭제`,
      current != null ? String(current) : ''
    );
    if (ask == null) return;
    const raw = ask.trim();
    if (!raw) {
      const next = { ...lowRuleMap };
      delete next[key];
      setLowRuleMap(next);
      saveLowRuleMap(next);
      setRuleSize(s);
      setRuleGroup(g);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      alert('0 이상 숫자만 입력하세요.');
      return;
    }
    const next = { ...lowRuleMap, [key]: Math.floor(n) };
    setLowRuleMap(next);
    saveLowRuleMap(next);
    setRuleSize(s);
    setRuleGroup(g);
    setRuleQty(Math.floor(n));
  };

  const quickSetRuleByPressureClick = (group: string) => {
    const pickedSize = normalizeSize(sizeTab === 'ALL' ? ruleSize : sizeTab);
    if (!pickedSize) {
      alert('먼저 Size를 선택하세요.');
      return;
    }
    quickSetPairRule(pickedSize, group);
  };

  const removeItem = (id: string) => {
    const next = items.filter((x) => x.id !== id);
    setItems(next);
    saveItems(next);
    if (moveItemId === id) setMoveItemId('');
  };

  const runMovement = (targetItemId: string, kind: MovementKind, rawQty: number, note: string) => {
    const qty = Math.max(0, Math.floor(rawQty));
    if (!targetItemId || qty <= 0) {
      alert('이동할 품목과 수량을 입력하세요.');
      return false;
    }
    const idx = items.findIndex((x) => x.id === targetItemId);
    if (idx < 0) {
      alert('품목을 찾을 수 없습니다.');
      return false;
    }
    const target = { ...items[idx]! };
    if (kind === 'direct_inbound') {
      target.stockQty += qty;
    } else if (kind === 'register_pending_in') {
      target.pendingInQty += qty;
    } else if (kind === 'apply_pending_in') {
      const useQty = Math.min(qty, target.pendingInQty);
      target.pendingInQty -= useQty;
      target.stockQty += useQty;
    } else if (kind === 'register_pending_out') {
      target.pendingOutQty += qty;
    } else if (kind === 'commit_outbound') {
      const useQty = Math.min(qty, target.pendingOutQty);
      target.pendingOutQty -= useQty;
      target.stockQty = Math.max(0, target.stockQty - useQty);
    }
    target.updatedAt = new Date().toISOString();

    const next = [...items];
    next[idx] = target;
    setItems(next);
    saveItems(next);

    const row: Movement = {
      at: new Date().toISOString(),
      itemId: target.id,
      itemName: target.name,
      nominalSize: target.nominalSize,
      kind,
      qty,
      note: note.trim(),
    };
    const nextLog = [row, ...movements].slice(0, 300);
    setMovements(nextLog);
    saveMovements(nextLog);
    return true;
  };

  const applyMovement = () => {
    const ok = runMovement(moveItemId, moveKind, moveQty, moveNote);
    if (!ok) return;
    setMoveQty(0);
    setMoveNote('');
  };

  const quickMove = (kind: MovementKind, qty: number) => {
    const useQty = Math.max(1, Math.floor(qty || 1));
    const ok = runMovement(moveItemId, kind, useQty, `빠른처리 ${useQty}`);
    if (!ok) return;
    setMoveKind(kind);
    setMoveQty(useQty);
  };

  const scanModeToMovementKind = (mode: ScanApplyMode): MovementKind => {
    if (mode === 'inbound') return 'direct_inbound';
    if (mode === 'pending_in') return 'register_pending_in';
    if (mode === 'outbound') return 'commit_outbound';
    return 'direct_inbound';
  };

  const applySelectedScanModeNow = () => {
    const qty = Math.max(1, Math.floor(moveQty || 1));
    if (scanMode === 'stock_set') {
      const idx = items.findIndex((x) => x.id === moveItemId);
      if (idx < 0) {
        alert('스캔/품목 선택 후 사용하세요.');
        return;
      }
      const next = [...items];
      next[idx] = { ...next[idx]!, stockQty: qty, updatedAt: new Date().toISOString() };
      setItems(next);
      saveItems(next);
      return;
    }
    const kind = scanModeToMovementKind(scanMode);
    const ok = runMovement(moveItemId, kind, qty, `스캔 ${scanMode}`);
    if (!ok) return;
    setMoveKind(kind);
  };

  const applyOcrRows = (rows: OcrParsedRow[]) => {
    if (!rows.length) {
      alert('반영할 스캔 항목이 없습니다.');
      return;
    }
    const nextItems = [...items];
    for (const row of rows) {
      const useRating = normalizePressureGroup(row.ratingK || ruleGroup || '10K');
      const useFlange = FLANGE_TYPES.includes((row.flangeType || '') as any)
        ? String(row.flangeType)
        : (draft.flangeType || 'SOFF');
      const idx = nextItems.findIndex(
        (x) =>
          x.nominalSize === row.nominalSize &&
          x.ratingK === useRating &&
          x.flangeType === useFlange
      );
      if (idx >= 0) {
        const it = { ...nextItems[idx]! };
        if (scanMode === 'inbound') it.stockQty += row.qty;
        else if (scanMode === 'pending_in') it.pendingInQty += row.qty;
        else if (scanMode === 'outbound') it.stockQty = Math.max(0, it.stockQty - row.qty);
        else if (scanMode === 'stock_set') it.stockQty = Math.max(0, row.qty);
        it.updatedAt = new Date().toISOString();
        nextItems[idx] = it;
        continue;
      }
      const id = `${row.nominalSize}-${useRating}-${useFlange}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      nextItems.unshift(
        coerceItem({
          ...EMPTY_DRAFT,
          id,
          name: row.nameHint || `${row.nominalSize} ${useRating} ${useFlange}`,
          nominalSize: row.nominalSize,
          ratingK: useRating,
          flangeType: useFlange,
          stockQty: scanMode === 'inbound' || scanMode === 'stock_set' ? row.qty : 0,
          pendingInQty: scanMode === 'pending_in' ? row.qty : 0,
          updatedAt: new Date().toISOString(),
        })
      );
    }
    setItems(nextItems);
    saveItems(nextItems);
    alert(`스캔 반영 완료: ${rows.length}건 (모드: ${scanMode})`);
    setScanRowsDraft([]);
  };

  const applyScanCode = (rawCode: string) => {
    const parsed = parseScanPayload(rawCode);
    const code = parsed.code;
    if (!code) return;
    setScanText(rawCode);
    setQ(code);
    const exact = items.find((x) => x.id.toUpperCase() === code);
    const similar = items.find(
      (x) =>
        x.id.toUpperCase().includes(code) ||
        x.name.toUpperCase().includes(code) ||
        `${x.nominalSize} ${x.ratingK} ${x.flangeType}`.toUpperCase().includes(code)
    );
    const hit = exact || similar;
    if (!hit) {
      alert(`스캔값: ${code}\n일치 품목을 찾지 못했습니다. 검색창에 반영했으니 확인하세요.`);
      return;
    }
    setMoveItemId(hit.id);
    if (typeof parsed.qty === 'number' && parsed.qty > 0) {
      setMoveQty(parsed.qty);
      if (scanMode !== 'stock_set') {
        const kind = scanModeToMovementKind(scanMode);
        void runMovement(hit.id, kind, parsed.qty, `스캔 자동 ${scanMode}`);
        setMoveKind(kind);
      }
    }
    setDraft(hit);
    setSizeTab(hit.nominalSize);
    setKTab(hit.ratingK);
    alert(
      `스캔 인식 완료: ${code}\n선택 품목: ${hit.id} · ${hit.name}${typeof parsed.qty === 'number' ? `\n수량 자동입력: ${parsed.qty}` : ''}`
    );
  };

  const onScanImage = async (file?: File | null) => {
    if (!file) return;
    const BarcodeDetectorCtor = (window as any).BarcodeDetector as
      | (new (opts?: { formats?: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> })
      | undefined;
    try {
      setScanBusy(true);
      if (BarcodeDetectorCtor) {
        const bitmap = await createImageBitmap(file);
        const detector = new BarcodeDetectorCtor({
          formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'],
        });
        const found = await detector.detect(bitmap);
        if (typeof (bitmap as any).close === 'function') (bitmap as any).close();
        const code = found.find((x) => x.rawValue)?.rawValue || '';
        if (code) {
          applyScanCode(code);
          return;
        }
      }
      const Tesseract = await import('tesseract.js');
      const OCR_LANG = 'kor+eng';
      const canvasToBlob = async (canvas: HTMLCanvasElement): Promise<Blob | null> => {
        return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      };
      const makeContrastCanvas = (src: HTMLCanvasElement) => {
        const out = document.createElement('canvas');
        out.width = src.width;
        out.height = src.height;
        const octx = out.getContext('2d');
        const sctx = src.getContext('2d');
        if (!octx || !sctx) return src;
        const img = sctx.getImageData(0, 0, src.width, src.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          const bw = gray > 165 ? 255 : 0;
          d[i] = bw;
          d[i + 1] = bw;
          d[i + 2] = bw;
        }
        octx.putImageData(img, 0, 0);
        return out;
      };
      const cropTableCanvas = (src: HTMLCanvasElement) => {
        const out = document.createElement('canvas');
        const x = Math.floor(src.width * 0.06);
        const y = Math.floor(src.height * 0.12);
        const w = Math.max(10, Math.floor(src.width * 0.88));
        const h = Math.max(10, Math.floor(src.height * 0.78));
        out.width = w;
        out.height = h;
        const ctx = out.getContext('2d');
        if (!ctx) return src;
        ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
        return out;
      };
      const buildAngleCanvas = async (angle: 0 | 90 | 270) => {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (typeof (bitmap as any).close === 'function') (bitmap as any).close();
          return null;
        }
        if (angle === 0) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          ctx.drawImage(bitmap, 0, 0);
        } else {
          canvas.width = bitmap.height;
          canvas.height = bitmap.width;
          ctx.save();
          if (angle === 90) {
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
          } else {
            ctx.translate(0, canvas.height);
            ctx.rotate(-Math.PI / 2);
          }
          ctx.drawImage(bitmap, 0, 0);
          ctx.restore();
        }
        if (typeof (bitmap as any).close === 'function') (bitmap as any).close();
        return canvas;
      };
      const readRowsByAngle = async (angle: 0 | 90 | 270) => {
        const baseCanvas = await buildAngleCanvas(angle);
        if (!baseCanvas) return { text: '', rows: [], angle };
        const variants = [
          { label: 'raw', canvas: baseCanvas },
          { label: 'contrast', canvas: makeContrastCanvas(baseCanvas) },
          { label: 'crop', canvas: cropTableCanvas(baseCanvas) },
          { label: 'crop-contrast', canvas: makeContrastCanvas(cropTableCanvas(baseCanvas)) },
        ];
        let bestText = '';
        let bestRows: OcrParsedRow[] = [];
        for (const v of variants) {
          const blob = await canvasToBlob(v.canvas);
          if (!blob) continue;
          const ocr = await Tesseract.recognize(blob, OCR_LANG);
          const text = ocr?.data?.text || '';
          if (!bestText && text) bestText = text;
          const a = parseOcrRowsFromText(text);
          const b = parseInvoiceStyleRows(text);
          const rows = (b.length > a.length ? b : a).filter((r) => r.qty > 0 && r.qty <= 5000);
          if (rows.length > bestRows.length) {
            bestRows = rows;
            bestText = text || bestText;
          }
          if (bestRows.length >= 10) break;
        }
        return { text: bestText, rows: bestRows, angle };
      };

      const tries = [0, 90, 270] as const;
      let bestText = '';
      let rows: OcrParsedRow[] = [];
      let usedAngle: 0 | 90 | 270 = 0;
      for (const angle of tries) {
        const r = await readRowsByAngle(angle);
        if (!bestText && r.text) bestText = r.text;
        if (r.rows.length > rows.length) {
          rows = r.rows;
          usedAngle = angle;
        }
        if (rows.length >= 2) break;
      }
      if (!bestText.trim()) {
        alert('이미지에서 문자를 읽지 못했습니다. 스캔값 직접 입력을 사용하세요.');
        return;
      }
      if (!rows.length) {
        setScanText(bestText.slice(0, 80));
        alert('문자는 읽었지만 (규격/수량) 패턴을 찾지 못했습니다. 스캔값 직접 입력을 사용하세요.');
        return;
      }
      const invoiceRows = parseInvoiceStyleRows(bestText);
      const finalRows = invoiceRows.length > rows.length ? invoiceRows : rows;
      const dedup = new Map<string, OcrParsedRow>();
      for (const row of finalRows) {
        const key = `${row.nominalSize}|${row.ratingK || ''}|${row.flangeType || ''}`;
        dedup.set(key, row);
      }
      const allowedSizes = new Set(
        [...new Set([...nominalSizes, ...DEFAULT_NOMINAL_SIZES])].map((v) =>
          normalizeSize(v)
        )
      );
      const cleanRows = [...dedup.values()].filter(
        (r) => allowedSizes.has(normalizeSize(r.nominalSize)) && r.qty > 0 && r.qty <= 5000
      );
      const strictRows = cleanRows.filter(
        (r) => !!r.ratingK && !!r.flangeType
      );
      const finalAcceptedRows = scanStrict ? strictRows : cleanRows;
      if (!finalAcceptedRows.length) {
        alert(
          scanStrict
            ? '엄격 스캔 조건(압력/형식 포함)에 맞는 항목이 없습니다. 숫자 우선이면 엄격 모드를 끄고 재시도하세요.'
            : '스캔 후보를 만들지 못했습니다. 사진을 더 정면/선명하게 촬영해 주세요.'
        );
        return;
      }
      setScanRowsDraft(finalAcceptedRows);
      alert(`스캔 후보 ${finalAcceptedRows.length}건 준비 완료 (OCR ${usedAngle}°). 아래 미리보기에서 반영하세요.`);
    } catch {
      alert('스캔 처리 중 오류가 발생했습니다.');
    } finally {
      setScanBusy(false);
    }
  };

  const adjustCellStock = (
    nominalSize: string,
    group: string,
    flangeType: (typeof CORE_SPLIT_TYPES)[number],
    currentStock: number
  ) => {
    const input = window.prompt(
      `${nominalSize} / ${group} / ${flangeType}\n재고 조정값 입력: +5, -3, 12(직접설정)`,
      String(currentStock)
    );
    if (input == null) return;
    const raw = input.trim();
    if (!raw) return;
    let nextStock = currentStock;
    if (/^[+-]\d+(\.\d+)?$/.test(raw)) {
      nextStock = Math.max(0, currentStock + Number(raw));
    } else if (/^\d+(\.\d+)?$/.test(raw)) {
      nextStock = Math.max(0, Number(raw));
    } else {
      alert('형식 오류: +5 / -3 / 12 형태로 입력하세요.');
      return;
    }

    const idx = items.findIndex(
      (x) =>
        x.nominalSize === nominalSize &&
        x.ratingK === group &&
        x.flangeType === flangeType
    );
    const nextItems = [...items];
    if (idx >= 0) {
      nextItems[idx] = {
        ...nextItems[idx]!,
        stockQty: nextStock,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const id = `${nominalSize}-${group}-${flangeType}-${Date.now()}`;
      nextItems.unshift(
        coerceItem({
          ...EMPTY_DRAFT,
          id,
          name: `${nominalSize} ${group} ${flangeType}`,
          category: 'FLANGE',
          nominalSize,
          ratingK: group,
          flangeType,
          stockQty: nextStock,
          updatedAt: new Date().toISOString(),
        })
      );
    }
    setItems(nextItems);
    saveItems(nextItems);
  };

  const recentLog = movements.filter((x) => (sizeTab === 'ALL' || x.nominalSize === sizeTab)).slice(0, 20);

  return (
    <div
      role="dialog"
      aria-modal
      onClick={() => {
        if (!fullViewport) onClose();
      }}
      style={{
        position: fullViewport ? 'relative' : 'fixed',
        inset: 0,
        zIndex: fullViewport ? 'auto' : 12000,
        background: fullViewport ? 'transparent' : 'rgba(2,6,23,0.66)',
        display: 'flex',
        alignItems: fullViewport ? 'stretch' : 'center',
        justifyContent: 'center',
        padding: fullViewport ? 0 : 14,
        minHeight: fullViewport ? '100vh' : undefined,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card panel-pad"
        style={{
          width: fullViewport ? '100vw' : 'min(1300px, 98vw)',
          maxWidth: fullViewport ? '100vw' : undefined,
          minHeight: fullViewport ? '100vh' : undefined,
          maxHeight: fullViewport ? '100vh' : '95vh',
          overflow: 'auto',
          borderRadius: fullViewport ? 0 : 14,
          fontSize: `${Math.round(13 * fontScale)}px`,
        }}
      >
        <div className="space-between" style={{ marginBottom: 10 }}>
          <div>
            <div className="section-title" style={{ marginTop: 0 }}>재고관리 LIST · Nominal Pipe Size</div>
            <div className="subtle" style={{ fontSize: 11 }}>좌측 Size × 상단 압력·규격 그룹(K/LB/BAR/규격) · 재고/입고대기/출고예정/가용 한눈 보기</div>
          </div>
          <button type="button" className="tool-chip tool-chip-button" onClick={onClose}>닫기</button>
        </div>

        {!authed ? (
          <div style={{ maxWidth: 360 }}>
            <div className="subtle" style={{ marginBottom: 8, fontSize: 12 }}>
              ID/비번 입력 후 재고관리 화면이 열립니다. (초기값: admin / 1234)
            </div>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="ID"
              style={{ width: '100%', marginBottom: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}
            />
            <input
              type="password"
              value={loginPw}
              onChange={(e) => setLoginPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onLogin()}
              placeholder="비밀번호"
              style={{ width: '100%', marginBottom: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}
            />
            {loginErr && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{loginErr}</div>}
            <button type="button" className="tool-chip tool-chip-button tool-chip-active" onClick={onLogin}>로그인</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => {
                  setStandardTab('DIN4308');
                  setFlangeTab('제수변');
                  setFaceTab('ALL');
                  setKTab('DIN10BAR');
                }}
              >
                제수변4308 페이지
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => {
                  setStandardTab('DIN3578');
                  setFlangeTab('제수변');
                  setFaceTab('ALL');
                  setKTab('DIN16BAR');
                }}
              >
                제수변3578 페이지
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => {
                  setStandardTab('SPRING_SAFETY');
                  setFlangeTab('안전변');
                  setFaceTab('ALL');
                  setKTab('ALL');
                }}
              >
                스프링안전변 페이지
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <button type="button" className={`tool-chip tool-chip-button${sizeTab === 'ALL' ? ' tool-chip-active' : ''}`} onClick={() => setSizeTab('ALL')}>전체</button>
              {nominalSizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`tool-chip tool-chip-button${sizeTab === s ? ' tool-chip-active' : ''}`}
                  onClick={() => setSizeTab(s)}
                  style={{
                    color:
                      (sizeAvailMap.get(s) ?? 0) <= (sizeLowRuleMap[s] ?? -1)
                        ? '#fda4af'
                        : undefined,
                    borderColor:
                      (sizeAvailMap.get(s) ?? 0) <= (sizeLowRuleMap[s] ?? -1)
                        ? 'rgba(239,68,68,0.5)'
                        : undefined,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                value={sizeInput}
                onChange={(e) => setSizeInput(e.target.value)}
                placeholder="Size 추가 (예: 850A)"
                style={{ minWidth: 180, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit', fontSize: 12 }}
              />
              <button type="button" className="tool-chip tool-chip-button" onClick={addSize}>Size 추가</button>
              <button type="button" className="tool-chip tool-chip-button" onClick={renameSelectedSize}>선택 Size 이름수정</button>
              <button type="button" className="tool-chip tool-chip-button" onClick={deleteSelectedSize}>선택 Size 삭제</button>
              <input
                value={pressureInput}
                onChange={(e) => setPressureInput(e.target.value)}
                placeholder="그룹 추가 (예: PN16)"
                style={{ minWidth: 180, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit', fontSize: 12 }}
              />
              <button type="button" className="tool-chip tool-chip-button" onClick={addPressureGroup}>그룹 추가</button>
              <button type="button" className="tool-chip tool-chip-button" onClick={renameSelectedGroup}>선택 그룹 이름수정</button>
              <button type="button" className="tool-chip tool-chip-button" onClick={deleteSelectedGroup}>선택 그룹 삭제</button>
            </div>
            <div className="card panel-pad" style={{ marginBottom: 10 }}>
              <div className="section-title" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>부족 기준/글자 크기</div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 100px auto auto auto', alignItems: 'center' }}>
                <select value={ruleSize} onChange={(e) => setRuleSize(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                  {nominalSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={ruleGroup} onChange={(e) => setRuleGroup(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                  {pressureGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <input type="number" value={ruleQty} onChange={(e) => setRuleQty(Number(e.target.value) || 0)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
                <button type="button" className="tool-chip tool-chip-button" onClick={applyLowRule}>기준 저장</button>
                <button type="button" className="tool-chip tool-chip-button" onClick={clearLowRule}>기준 삭제</button>
                <input type="number" value={sizeRuleQty} onChange={(e) => setSizeRuleQty(Number(e.target.value) || 0)} placeholder="선택 Size 기준" style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
                <button type="button" className="tool-chip tool-chip-button" onClick={applySizeLowRule}>선택 Size 기준 저장</button>
                <button type="button" className="tool-chip tool-chip-button" onClick={clearSizeLowRule}>선택 Size 기준 삭제</button>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button type="button" className="tool-chip tool-chip-button" onClick={() => { const n = Math.max(0.75, Number((fontScale - 0.05).toFixed(2))); setFontScale(n); saveFontScale(n); }}>A-</button>
                  <button type="button" className="tool-chip tool-chip-button" onClick={() => { const n = Math.min(1.8, Number((fontScale + 0.05).toFixed(2))); setFontScale(n); saveFontScale(n); }}>A+</button>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <button type="button" className={`tool-chip tool-chip-button${standardTab === 'ALL' ? ' tool-chip-active' : ''}`} onClick={() => setStandardTab('ALL')}>표준 전체</button>
              {STANDARD_CODES.map((v) => (
                <button key={v} type="button" className={`tool-chip tool-chip-button${standardTab === v ? ' tool-chip-active' : ''}`} onClick={() => setStandardTab(v)}>{v}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <button type="button" className={`tool-chip tool-chip-button${flangeTab === 'ALL' ? ' tool-chip-active' : ''}`} onClick={() => setFlangeTab('ALL')}>형식 전체</button>
              {FLANGE_TYPES.map((v) => (
                <button key={v} type="button" className={`tool-chip tool-chip-button${flangeTab === v ? ' tool-chip-active' : ''}`} onClick={() => setFlangeTab(v)}>{v}</button>
              ))}
              <button type="button" className={`tool-chip tool-chip-button${faceTab === 'ALL' ? ' tool-chip-active' : ''}`} onClick={() => setFaceTab('ALL')}>면형 전체</button>
              {FACE_TYPES.map((v) => (
                <button key={v} type="button" className={`tool-chip tool-chip-button${faceTab === v ? ' tool-chip-active' : ''}`} onClick={() => setFaceTab(v)}>{v}</button>
              ))}
            </div>

            <div className="mini-grid" style={{ marginBottom: 10 }}>
              <div className="mini-card"><div className="metric-label">품목수</div><div className="mini-value">{stat.count}</div></div>
              <div className="mini-card"><div className="metric-label">재고</div><div className="mini-value c-long">{stat.stock.toLocaleString()}</div></div>
              <div className="mini-card"><div className="metric-label">입고대기</div><div className="mini-value" style={{ color: '#fbbf24' }}>{stat.pendingIn.toLocaleString()}</div></div>
              <div className="mini-card"><div className="metric-label">출고예정</div><div className="mini-value c-short">{stat.pendingOut.toLocaleString()}</div></div>
              <div className="mini-card"><div className="metric-label">가용재고</div><div className={`mini-value ${stat.available >= 0 ? 'c-long' : 'c-short'}`}>{stat.available.toLocaleString()}</div></div>
              <div className="mini-card"><div className="metric-label">안전재고 미달</div><div className={`mini-value ${stat.shortage > 0 ? 'c-short' : 'c-long'}`}>{stat.shortage}</div></div>
            </div>

            <div
              className="card panel-pad"
              style={{
                marginBottom: 12,
                overflowX: 'auto',
                overflowY: 'visible',
                position: 'relative',
              }}
            >
              <div className="section-title" style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>Size × 압력·규격 그룹 통합 보드</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <button type="button" className={`tool-chip tool-chip-button${kTab === 'ALL' ? ' tool-chip-active' : ''}`} onClick={() => setKTab('ALL')}>전체 그룹</button>
                {pressureGroups.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`tool-chip tool-chip-button${kTab === k ? ' tool-chip-active' : ''}`}
                    onClick={() => {
                      setKTab(k);
                      quickSetRuleByPressureClick(k);
                    }}
                    title={`현재 선택 Size 기준으로 ${k} 부족수량 설정`}
                  >
                    {k === 'SPRING_SAFE' ? '안전변' : k}
                  </button>
                ))}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                  <button type="button" className="tool-chip tool-chip-button" onClick={() => { const n = Math.max(0.75, Number((fontScale - 0.05).toFixed(2))); setFontScale(n); saveFontScale(n); }}>A-</button>
                  <button type="button" className="tool-chip tool-chip-button" onClick={() => { const n = Math.min(1.8, Number((fontScale + 0.05).toFixed(2))); setFontScale(n); saveFontScale(n); }}>A+</button>
                </span>
              </div>
              <div style={{ maxHeight: fullViewport ? '72vh' : '62vh', overflowY: 'auto', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 48, position: 'sticky', top: 0, left: 0, background: 'rgba(15,23,42,0.98)', zIndex: 5, textAlign: 'left', padding: '6px 6px', borderBottom: '1px solid rgba(148,163,184,0.2)', fontSize: `${Math.round(10 * fontScale)}px` }}>Size</th>
                      {pressureGroups.map((k) => (
                        <th
                          key={k}
                          onClick={() => quickSetRuleByPressureClick(k)}
                          title={`현재 선택 Size 기준으로 ${k} 부족수량 설정`}
                          style={{
                            position: 'sticky',
                            top: 0,
                            textAlign: 'left',
                            padding: '6px 4px',
                            borderBottom: '1px solid rgba(148,163,184,0.2)',
                            fontSize: `${Math.round(9 * fontScale)}px`,
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            color: ruleGroup === k ? '#67e8f9' : undefined,
                            background: 'rgba(15,23,42,0.98)',
                            zIndex: 4,
                          }}
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nominalSizes.map((size) => (
                      <tr key={size}>
                        <td style={{ position: 'sticky', left: 0, background: 'rgba(2,6,23,0.96)', zIndex: 1, padding: '6px 6px', borderBottom: '1px solid rgba(148,163,184,0.08)', fontWeight: 700, fontSize: `${Math.round(10 * fontScale)}px` }}>
                          {size}
                        </td>
                        {pressureGroups.map((k) => {
                        const showOnly =
                          flangeTab !== 'ALL' &&
                          CORE_SPLIT_TYPES.includes(flangeTab as (typeof CORE_SPLIT_TYPES)[number])
                            ? [flangeTab as (typeof CORE_SPLIT_TYPES)[number]]
                            : [...CORE_SPLIT_TYPES];
                        const parts = showOnly.map((ft) => {
                          const row = matrixMap.get(`${size}|${k}|${ft}`) ?? { stock: 0, pendingIn: 0, pendingOut: 0, min: 0, count: 0 };
                          const avail = row.stock + row.pendingIn - row.pendingOut;
                          return { ft, ...row, avail };
                        });
                        const stock = parts.reduce((s, x) => s + x.stock, 0);
                        const pendingIn = parts.reduce((s, x) => s + x.pendingIn, 0);
                        const pendingOut = parts.reduce((s, x) => s + x.pendingOut, 0);
                        const min = parts.reduce((s, x) => s + x.min, 0);
                        const count = parts.reduce((s, x) => s + x.count, 0);
                        const avail = stock + pendingIn - pendingOut;
                        const lowKey = `${size}|${k}`;
                        const sizeLine = sizeLowRuleMap[size];
                        const lowLine = lowRuleMap[lowKey] ?? (typeof sizeLine === 'number' ? sizeLine : min);
                        const bad = count > 0 && avail <= lowLine;
                        return (
                          <td
                            key={`${size}-${k}`}
                            style={{
                              padding: '4px 4px',
                              borderBottom: '1px solid rgba(148,163,184,0.08)',
                              background: count === 0 ? 'transparent' : bad ? 'rgba(127,29,29,0.28)' : 'rgba(20,83,45,0.2)',
                              fontSize: `${Math.round(9 * fontScale)}px`,
                              lineHeight: 1.25,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {parts.map((p) => (
                              <div key={p.ft} style={{ opacity: 0.9, color: bad ? '#fda4af' : undefined }}>
                                {p.ft}{' '}
                                <button
                                  type="button"
                                  onClick={() => adjustCellStock(size, k, p.ft, p.stock)}
                                  title={`${size}/${k}/${p.ft} 재고 조정`}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: bad ? '#fda4af' : '#86efac',
                                    padding: 0,
                                    margin: 0,
                                    fontSize: 'inherit',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                  }}
                                >
                                  {p.stock}
                                </button>
                              </div>
                            ))}
                            <div style={{ opacity: 0.85, color: bad ? '#fda4af' : undefined }}>입 {pendingIn} · 출 {pendingOut}</div>
                            <div style={{ fontWeight: 800, color: bad ? '#fda4af' : '#86efac' }}>가 {avail}</div>
                            {count > 0 && (
                              <div style={{ fontSize: 8, color: bad ? '#fda4af' : '#94a3b8' }}>
                                기준 {lowLine}{bad ? ' · 부족' : ''}
                              </div>
                            )}
                          </td>
                        );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 12 }}>
              <input value={draft.id} onChange={(e) => setDraft((p) => ({ ...p, id: e.target.value }))} placeholder="품목코드" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
              <input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="품목명" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
              <select value={draft.nominalSize} onChange={(e) => setDraft((p) => ({ ...p, nominalSize: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                {nominalSizes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={draft.ratingK} onChange={(e) => setDraft((p) => ({ ...p, ratingK: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                {pressureGroups.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={draft.standardCode} onChange={(e) => setDraft((p) => ({ ...p, standardCode: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                {STANDARD_CODES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={draft.flangeType} onChange={(e) => setDraft((p) => ({ ...p, flangeType: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                {FLANGE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={draft.faceType} onChange={(e) => setDraft((p) => ({ ...p, faceType: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                {FACE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <input value={draft.spec} onChange={(e) => setDraft((p) => ({ ...p, spec: e.target.value }))} placeholder="규격" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
              <input value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))} placeholder="카테고리" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
              <input value={draft.location} onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))} placeholder="보관위치" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
              <input type="number" value={draft.stockQty} onChange={(e) => setDraft((p) => ({ ...p, stockQty: Number(e.target.value) || 0 }))} placeholder="재고" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
              <input type="number" value={draft.minQty} onChange={(e) => setDraft((p) => ({ ...p, minQty: Number(e.target.value) || 0 }))} placeholder="안전재고" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
              <input value={draft.unit} onChange={(e) => setDraft((p) => ({ ...p, unit: e.target.value }))} placeholder="단위" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button type="button" className="tool-chip tool-chip-button tool-chip-active" onClick={upsertItem}>품목 저장/수정</button>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색(코드/품명/규격)" style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
            </div>

            <div className="card panel-pad" style={{ marginBottom: 12 }}>
              <div className="section-title" style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>입출고 처리</div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1.2fr 1fr 2fr auto' }}>
                <select value={moveItemId} onChange={(e) => setMoveItemId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                  <option value="">품목 선택</option>
                  {filtered.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.name}</option>)}
                </select>
                <select value={moveKind} onChange={(e) => setMoveKind(e.target.value as MovementKind)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
                  <option value="direct_inbound">직접입고</option>
                  <option value="register_pending_in">입고대기 등록</option>
                  <option value="apply_pending_in">입고대기→재고반영</option>
                  <option value="register_pending_out">출고예정 등록</option>
                  <option value="commit_outbound">출고확정(재고차감)</option>
                </select>
                <input type="number" value={moveQty} onChange={(e) => setMoveQty(Number(e.target.value) || 0)} placeholder="수량" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
                <input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} placeholder="메모" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
                <button type="button" className="tool-chip tool-chip-button" onClick={applyMovement}>적용</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" className="tool-chip tool-chip-button" onClick={() => quickMove('direct_inbound', moveQty || 1)}>+입고</button>
                <button type="button" className="tool-chip tool-chip-button" onClick={() => quickMove('register_pending_in', moveQty || 1)}>+입고대기</button>
                <button type="button" className="tool-chip tool-chip-button" onClick={() => quickMove('apply_pending_in', moveQty || 1)}>입고대기 반영</button>
                <button type="button" className="tool-chip tool-chip-button" onClick={() => quickMove('register_pending_out', moveQty || 1)}>+출고예정</button>
                <button type="button" className="tool-chip tool-chip-button" onClick={() => quickMove('commit_outbound', moveQty || 1)}>출고확정</button>
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(148,163,184,0.14)' }}>
                <div className="subtle" style={{ fontSize: 11, marginBottom: 6 }}>
                  사진 스캔: 바코드/QR 또는 문서표(OCR) 업로드/촬영 → 자동 선택/수량 반영
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button type="button" className={`tool-chip tool-chip-button${scanMode === 'inbound' ? ' tool-chip-active' : ''}`} onClick={() => setScanMode('inbound')}>입고 스캔</button>
                  <button type="button" className={`tool-chip tool-chip-button${scanMode === 'pending_in' ? ' tool-chip-active' : ''}`} onClick={() => setScanMode('pending_in')}>입고대기 스캔</button>
                  <button type="button" className={`tool-chip tool-chip-button${scanMode === 'outbound' ? ' tool-chip-active' : ''}`} onClick={() => setScanMode('outbound')}>출고 스캔</button>
                  <button type="button" className={`tool-chip tool-chip-button${scanMode === 'stock_set' ? ' tool-chip-active' : ''}`} onClick={() => setScanMode('stock_set')}>재고실사 스캔</button>
                  <button type="button" className={`tool-chip tool-chip-button${scanStrict ? ' tool-chip-active' : ''}`} onClick={() => setScanStrict((v) => !v)}>
                    {scanStrict ? '엄격 모드 ON' : '숫자 우선 모드 ON'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      void onScanImage(e.target.files?.[0]);
                      e.currentTarget.value = '';
                    }}
                    style={{ maxWidth: 260, fontSize: 12 }}
                  />
                  <input
                    value={scanText}
                    onChange={(e) => setScanText(e.target.value)}
                    placeholder="스캔값 직접 입력 (예: NPS-15A-001*12)"
                    style={{ minWidth: 180, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}
                  />
                  <button type="button" className="tool-chip tool-chip-button" onClick={() => applyScanCode(scanText)}>스캔값 적용</button>
                  <button type="button" className="tool-chip tool-chip-button" onClick={applySelectedScanModeNow}>선택모드 즉시반영</button>
                  {scanBusy && <span className="subtle" style={{ fontSize: 11 }}>스캔 중...</span>}
                </div>
                {scanRowsDraft.length > 0 && (
                  <div style={{ marginTop: 10, border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, padding: 8 }}>
                    <div className="subtle" style={{ marginBottom: 6, fontSize: 11 }}>
                      스캔 미리보기 {scanRowsDraft.length}건 (오탐 항목은 삭제 후 반영)
                    </div>
                    <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflow: 'auto' }}>
                      {scanRowsDraft.map((row, idx) => (
                        <div key={`${row.nominalSize}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '80px 70px 90px 80px auto', gap: 6, alignItems: 'center' }}>
                          <input value={row.nominalSize} onChange={(e) => {
                            const next = [...scanRowsDraft];
                            next[idx] = { ...next[idx]!, nominalSize: normalizeSize(e.target.value) };
                            setScanRowsDraft(next);
                          }} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
                          <input type="number" value={row.qty} onChange={(e) => {
                            const next = [...scanRowsDraft];
                            next[idx] = { ...next[idx]!, qty: Math.max(0, Number(e.target.value) || 0) };
                            setScanRowsDraft(next);
                          }} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
                          <input value={row.ratingK || ''} onChange={(e) => {
                            const next = [...scanRowsDraft];
                            next[idx] = { ...next[idx]!, ratingK: normalizePressureGroup(e.target.value) };
                            setScanRowsDraft(next);
                          }} placeholder="압력" style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
                          <input value={row.flangeType || ''} onChange={(e) => {
                            const next = [...scanRowsDraft];
                            next[idx] = { ...next[idx]!, flangeType: e.target.value.toUpperCase() };
                            setScanRowsDraft(next);
                          }} placeholder="형식" style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'inherit' }} />
                          <button type="button" className="tool-chip tool-chip-button" onClick={() => {
                            const next = scanRowsDraft.filter((_, i) => i !== idx);
                            setScanRowsDraft(next);
                          }}>삭제</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button type="button" className="tool-chip tool-chip-button tool-chip-active" onClick={() => applyOcrRows(scanRowsDraft)}>미리보기 반영</button>
                      <button type="button" className="tool-chip tool-chip-button" onClick={() => setScanRowsDraft([])}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="list" style={{ marginBottom: 12 }}>
              {filtered.map((it) => (
                <div key={it.id} className="list-item" style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <div><strong>{it.id}</strong><div className="subtle" style={{ fontSize: 11 }}>{it.nominalSize}/{it.ratingK} · {it.standardCode} · {it.flangeType}/{it.faceType}</div></div>
                  <div>{it.name}</div>
                  <div className={it.stockQty <= it.minQty ? 'c-short' : 'c-long'}>재고 {it.stockQty} {it.unit}</div>
                  <div className="c-short">출고예정 {it.pendingOutQty}</div>
                  <div style={{ color: '#fbbf24' }}>입고대기 {it.pendingInQty}</div>
                  <div className="subtle">최소 {it.minQty} · {it.location || '-'}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="tool-chip tool-chip-button" onClick={() => setDraft(it)}>불러오기</button>
                    <button type="button" className="tool-chip tool-chip-button" onClick={() => removeItem(it.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="card panel-pad">
              <div className="section-title" style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>최근 이력</div>
              <div className="list">
                {recentLog.length === 0 && <div className="list-item subtle">이력 없음</div>}
                {recentLog.map((r, i) => (
                  <div key={`${r.at}-${i}`} className="list-item" style={{ display: 'grid', gridTemplateColumns: '170px 1fr 140px 120px 1fr', gap: 8 }}>
                    <div className="subtle" style={{ fontSize: 11 }}>{new Date(r.at).toLocaleString('ko-KR')}</div>
                    <div>{r.itemId} · {r.itemName}</div>
                    <div>{r.nominalSize}</div>
                    <div>
                      {r.kind === 'direct_inbound' && '직접입고'}
                      {r.kind === 'register_pending_in' && '입고대기등록'}
                      {r.kind === 'apply_pending_in' && '입고대기반영'}
                      {r.kind === 'register_pending_out' && '출고예정등록'}
                      {r.kind === 'commit_outbound' && '출고확정'}
                      {' '}· {r.qty}
                    </div>
                    <div className="subtle">{r.note || '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
