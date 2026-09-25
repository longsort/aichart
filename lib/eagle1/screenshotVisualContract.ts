/**
 * PHASE 18 — Screenshot / visual contract (data rules, not pixel golden images).
 * Price coordinates · opacity · readability. NO hardcoded BTC prices as truth.
 * Aligns with IMPLEMENTATION_PLAN Practical Mode + overlayBudget practical caps.
 */

import { OVERLAY_BUDGET_BY_MODE } from './overlayBudget';
import { EAGLE1_HEAT_UNDERLAY } from './heatUnderlayPolicy';
import { EAGLE1_VISUAL_CONTRACT } from './visualLayoutContract';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Roles that must live in price-space (createPriceLine / LineSeries / zone price1·price2) — never pixel Y as truth */
export const SCREENSHOT_PRICE_SPACE_ROLES = [
  'CORE',
  'A+',
  'ENTRY',
  'STOP',
  'TP1',
  'TP2',
  'TP3',
  'POC',
  'INVALIDATION',
] as const;

export type ScreenshotVisualContract = {
  coordinateSpace: 'price';
  priceSpaceRoles: readonly string[];
  practicalMax: {
    coreSupport: 1;
    coreResist: 1;
    mainEntry: 1;
    stop: 1;
    tpLevels: 3;
    zoneFaces: number;
    priceLines: number;
    structureMarks: number;
    pathSegments: number;
  };
  opacity: {
    zoneFillMax: number;
    heatStripMax: number;
    heatCoverCandlesForbidden: true;
  };
  readability: {
    koreanCompactLabels: true;
    noHardcodedTruthPrices: true;
    noWhaleCardUi: true;
    eagle1HudStyleKept: true;
  };
  layoutRef: {
    whaleCardUiForbidden: true;
    heatCoverCandlesForbidden: true;
    referenceHint: string;
  };
  summaryKo: string;
};

const practicalBudget = OVERLAY_BUDGET_BY_MODE.practical;

/**
 * Visual rules as data. Counts/ratios only — never embed market prices.
 */
export const SCREENSHOT_VISUAL_CONTRACT: ScreenshotVisualContract = {
  coordinateSpace: 'price',
  priceSpaceRoles: [...SCREENSHOT_PRICE_SPACE_ROLES],
  practicalMax: {
    coreSupport: 1,
    coreResist: 1,
    mainEntry: 1,
    stop: 1,
    tpLevels: 3,
    zoneFaces: practicalBudget.maxZoneFaces,
    priceLines: practicalBudget.maxPriceLines,
    structureMarks: practicalBudget.maxStructureMarks,
    pathSegments: practicalBudget.maxPathSegments,
  },
  opacity: {
    zoneFillMax: 0.45,
    heatStripMax: EAGLE1_HEAT_UNDERLAY.maxOpacity,
    heatCoverCandlesForbidden: true,
  },
  readability: {
    koreanCompactLabels: true,
    noHardcodedTruthPrices: true,
    noWhaleCardUi: true,
    eagle1HudStyleKept: true,
  },
  layoutRef: {
    whaleCardUiForbidden: EAGLE1_VISUAL_CONTRACT.whaleCardUiForbidden,
    heatCoverCandlesForbidden: EAGLE1_VISUAL_CONTRACT.heatCoverCandlesForbidden,
    referenceHint: EAGLE1_VISUAL_CONTRACT.referenceHint,
  },
  summaryKo:
    '실전: CORE≤1+1 · 진입1 · SL1 · TP≤3 · 가격좌표(라인/존) · 픽셀 Y 금지 · 고래카드 금지 · 히트는 HUD strip만',
};

function contractShapeOk(c: ScreenshotVisualContract, notes: string[]): void {
  if (c.coordinateSpace !== 'price') notes.push('coordinateSpace must be price');
  for (const role of ['CORE', 'A+', 'ENTRY', 'STOP', 'TP1'] as const) {
    if (!c.priceSpaceRoles.includes(role)) notes.push(`missing price-space role ${role}`);
  }
  if (c.practicalMax.coreSupport !== 1 || c.practicalMax.coreResist !== 1) {
    notes.push('practical CORE must be 1+1');
  }
  if (c.practicalMax.mainEntry !== 1 || c.practicalMax.stop !== 1) {
    notes.push('practical entry/stop must be 1');
  }
  if (c.practicalMax.tpLevels !== 3) notes.push('practical TP must be 3 slots');
  if (c.practicalMax.zoneFaces > practicalBudget.maxZoneFaces) {
    notes.push('zoneFaces exceeds overlay budget practical');
  }
  if (c.practicalMax.priceLines > practicalBudget.maxPriceLines) {
    notes.push('priceLines exceeds overlay budget practical');
  }
  if (!(c.opacity.zoneFillMax > 0 && c.opacity.zoneFillMax <= 0.55)) {
    notes.push('zoneFillMax opacity out of readable range');
  }
  if (c.opacity.heatStripMax !== EAGLE1_HEAT_UNDERLAY.maxOpacity) {
    notes.push('heatStripMax must match heat underlay policy');
  }
  if (!c.opacity.heatCoverCandlesForbidden) notes.push('heat must not cover candles');
  if (!c.readability.noHardcodedTruthPrices) notes.push('noHardcodedTruthPrices required');
  if (!c.readability.noWhaleCardUi || !c.layoutRef.whaleCardUiForbidden) {
    notes.push('whale card UI must stay forbidden');
  }
}

/**
 * Reject BTC-like price literals in this source file (truth prices forbidden).
 * Allows small counts (≤999) and opacity decimals already in AST as numbers < 1000.
 */
function assertNoHardcodedBtcPricesInSource(notes: string[]): void {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const srcPath = path.join(here, 'screenshotVisualContract.ts');
    const src = fs.readFileSync(srcPath, 'utf8');
    /** Strip comments / strings roughly — catch bare integer literals used as prices */
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/'[^']*'/g, ' ')
      .replace(/"[^"]*"/g, ' ');
    const re = /\b([1-9]\d{3,6})\b/g;
    let m: RegExpExecArray | null;
    const hits: string[] = [];
    const lo = Math.pow(10, 3);
    const hi = Math.pow(10, 6) - 1;
    while ((m = re.exec(stripped)) != null) {
      const n = Number(m[1]);
      /** Allow year-ish / small config only under 1000 already excluded; 4–6 digit = suspect price */
      if (n >= lo && n <= hi) hits.push(m[1]!);
    }
    if (hits.length) {
      notes.push(`hardcoded price-like literals forbidden in contract file: ${[...new Set(hits)].join(',')}`);
    }
  } catch (e) {
    notes.push(`source audit failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function screenshotVisualContractAcceptance(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  contractShapeOk(SCREENSHOT_VISUAL_CONTRACT, notes);
  assertNoHardcodedBtcPricesInSource(notes);

  /** Deep values must not smuggle market prices (5–6 digit integers) */
  const json = JSON.stringify(SCREENSHOT_VISUAL_CONTRACT);
  const priceLike = json.match(/\b[1-9]\d{4,5}\b/g);
  if (priceLike?.length) {
    notes.push(`contract JSON contains price-like numbers: ${priceLike.join(',')}`);
  }

  return { ok: notes.length === 0, notes };
}
