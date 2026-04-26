import type { Candle } from '@/types';
import type { EngineMvpInput, EngineMvpOutput } from '@/engine/types';
import { scoreCandles } from '@/engine/candles/candleEngine';
import { detectSwings } from '@/engine/swings/swingEngine';
import { deriveStructure } from '@/engine/structure/structureEngine';
import { computeZoneSignal } from '@/engine/signals/zoneSignalEngine';
import { buildAnalysisPanel } from '@/engine/panel/panelBuilder';

export function runChartMvpEngine(input: EngineMvpInput): EngineMvpOutput {
  const candles: Candle[] = input.candles ?? [];
  const candleScores = scoreCandles(candles, 150);
  const swings = detectSwings(candles, 3, 3);
  const structure = deriveStructure(candles, swings);
  const zoneSignal = computeZoneSignal(input);
  const panel = buildAnalysisPanel(input, structure, zoneSignal);
  return { candleScores, swings, structure, zoneSignal, panel };
}
