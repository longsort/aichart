/**
 * PHASE 19 — MASTER Final Acceptance checklist.
 * ok === true only when ALL items pass. No fake pass.
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { coreZoneFusionAcceptanceA } from './coreZoneFusionEngine';
import { strategyFusionAcceptanceB } from './strategyZoneFusionEngine';
import { flowConfirmationAcceptanceI } from './flowConfirmationEngine';
import { continuationAcceptanceGH } from './continuationEngine';
import { executionLevelsAcceptancePriceCoords } from './executionLevels';
import { historicalEventStoreAcceptance } from './historicalEventStore';
import { replayFusionParityAcceptanceD } from './replayEngine';
import { calibrationGateAcceptance, runCalibrationGate } from './calibrationGate';
import { historicalPathAcceptanceJ } from './historicalPathGate';
import { mergedDeskPracticalUiAcceptance } from './mergedDeskPracticalUi';
import { historicalZoneCacheAcceptance } from './historicalZoneCache';
import { screenshotVisualContractAcceptance } from './screenshotVisualContract';
import { runVisualLayoutSelftest, EAGLE1_VISUAL_CONTRACT } from './visualLayoutContract';
import { EAGLE1_HEAT_UNDERLAY } from './heatUnderlayPolicy';
import { OVERLAY_BUDGET_BY_MODE } from './overlayBudget';

export type MasterAcceptanceItem = {
  id: string;
  title: string;
  ok: boolean;
  note: string;
};

function fromNotes(
  id: string,
  title: string,
  result: { ok: boolean; notes: string[] }
): MasterAcceptanceItem {
  return {
    id,
    title,
    ok: result.ok,
    note: result.ok ? 'PASS' : result.notes.join('; ') || 'FAIL',
  };
}

export function runMasterAcceptanceChecklist(): {
  ok: boolean;
  items: MasterAcceptanceItem[];
  summaryKo: string;
} {
  const items: MasterAcceptanceItem[] = [];

  items.push(fromNotes('A', 'CORE Zone Fusion Acceptance A', coreZoneFusionAcceptanceA()));
  items.push(fromNotes('B', 'Strategy Zone Fusion Acceptance B', strategyFusionAcceptanceB()));
  items.push(fromNotes('I', 'Flow Confirmation Acceptance I', flowConfirmationAcceptanceI()));
  items.push(fromNotes('GH', 'Continuation Acceptance G/H', continuationAcceptanceGH()));
  items.push(
    fromNotes('EXEC_PX', 'Execution Levels price coordinates', executionLevelsAcceptancePriceCoords())
  );

  const tmpRoot = path.join(os.tmpdir(), `eagle1-master-acc-${Date.now()}`);
  try {
    fs.mkdirSync(tmpRoot, { recursive: true });
    items.push(
      fromNotes('HIST_EVT', 'Historical Event Store', historicalEventStoreAcceptance(tmpRoot))
    );
  } catch (e) {
    items.push({
      id: 'HIST_EVT',
      title: 'Historical Event Store',
      ok: false,
      note: e instanceof Error ? e.message : String(e),
    });
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  items.push(fromNotes('D', 'Replay Fusion Parity Acceptance D', replayFusionParityAcceptanceD()));
  items.push(fromNotes('CALIB', 'Calibration Gate', calibrationGateAcceptance()));
  items.push(fromNotes('J', 'Historical Path Acceptance J', historicalPathAcceptanceJ()));
  items.push(fromNotes('UI16', 'Merged Desk Practical UI (PHASE 16)', mergedDeskPracticalUiAcceptance()));
  items.push(fromNotes('HZ17', 'Historical Zone Cache (PHASE 17)', historicalZoneCacheAcceptance()));
  items.push(fromNotes('VIS18', 'Screenshot Visual Contract (PHASE 18)', screenshotVisualContractAcceptance()));

  /** Static: setupScore ≠ win rate · scoresEqualForbidden */
  const calib = runCalibrationGate({
    setupScore: 70,
    historicalWinRate: 0.55,
    sampleSize: 40,
  });
  const scoresOk =
    calib.scoresEqualForbidden === true &&
    (calib.historicalWinRate == null ||
      Math.round(calib.historicalWinRate * 100) !== Math.round(calib.setupScore ?? -1));
  items.push({
    id: 'SCORE_SPLIT',
    title: 'Setup score ≠ historical win rate',
    ok: scoresOk,
    note: scoresOk
      ? 'PASS · scoresEqualForbidden'
      : `FAIL · setup=${calib.setupScore} hist=${calib.historicalWinRate}`,
  });

  /** Whale card UI forbidden */
  const visual = runVisualLayoutSelftest({ hasWhaleCardUi: false, heatCoverCandles: false });
  const whaleOk =
    visual.ok &&
    visual.contract.whaleCardUiForbidden === true &&
    EAGLE1_VISUAL_CONTRACT.whaleCardUiForbidden === true &&
    EAGLE1_HEAT_UNDERLAY.coverCandlesForbidden === true;
  items.push({
    id: 'NO_WHALE',
    title: 'No whale card / heat-on-candle UI',
    ok: whaleOk,
    note: whaleOk
      ? 'PASS · visualLayout whaleCardUiForbidden + heat HUD strip'
      : visual.fails.join('; ') || 'FAIL',
  });

  /** Practical CORE 1+1 / budget caps */
  const coreA = items.find((i) => i.id === 'A');
  const budget = OVERLAY_BUDGET_BY_MODE.practical;
  const practicalOk =
    (coreA?.ok ?? false) &&
    budget.maxZoneFaces <= 4 &&
    budget.maxPriceLines <= 12 &&
    budget.heatOnCandleForbidden === true;
  items.push({
    id: 'PRACTICAL_MAX',
    title: 'Practical mode max CORE 1+1 · overlay budget',
    ok: practicalOk,
    note: practicalOk
      ? `PASS · zoneFaces≤${budget.maxZoneFaces} priceLines≤${budget.maxPriceLines}`
      : `FAIL · ${coreA?.note || 'budget'}`,
  });

  const failed = items.filter((i) => !i.ok);
  const ok = failed.length === 0;
  const summaryKo = ok
    ? `MASTER Acceptance ALL PASS · ${items.length}항`
    : `MASTER Acceptance FAIL · ${failed.length}/${items.length} · ${failed.map((f) => f.id).join(',')}`;

  return { ok, items, summaryKo };
}
