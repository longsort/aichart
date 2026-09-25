/**
 * 단타 / 스윙 / 중기 — 같은 AI 점수를 모든 TF에 복사하지 않는다.
 * 프레임이 없으면 데이터 없음. 확률 숫자는 만들지 않는다.
 */
import { normalizeMtfTf, type MtfSequenceReport } from './mtfSequence';

export type Eagle1HorizonId = 'scalp' | 'swing' | 'position';

export type Eagle1HorizonVerdict = {
  id: Eagle1HorizonId;
  labelKo: string;
  status: 'LONG' | 'SHORT' | 'WAIT' | '데이터 없음';
  tfs: string[];
};

function verdictFromBiases(biases: Array<'bullish' | 'bearish'>): Eagle1HorizonVerdict['status'] {
  if (!biases.length) return 'WAIT';
  const bull = biases.filter((b) => b === 'bullish').length;
  const bear = biases.filter((b) => b === 'bearish').length;
  if (bull > 0 && bear > 0) return 'WAIT';
  if (bull > bear) return 'LONG';
  if (bear > bull) return 'SHORT';
  return 'WAIT';
}

function pickHorizon(
  mtf: MtfSequenceReport | null | undefined,
  id: Eagle1HorizonId,
  labelKo: string,
  tfs: string[]
): Eagle1HorizonVerdict {
  const frames = mtf?.frames ?? [];
  const hit = tfs
    .map((tf) => frames.find((f) => normalizeMtfTf(f.tf) === tf && f.state !== '데이터 없음'))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));
  if (!hit.length) {
    return { id, labelKo, status: '데이터 없음', tfs };
  }
  const biases = hit
    .map((f) => f.bias)
    .filter((b): b is 'bullish' | 'bearish' => b === 'bullish' || b === 'bearish');
  return { id, labelKo, status: verdictFromBiases(biases), tfs };
}

export function eagle1HorizonVerdicts(mtf: MtfSequenceReport | null | undefined): Eagle1HorizonVerdict[] {
  return [
    pickHorizon(mtf, 'scalp', '단타', ['5m', '15m']),
    pickHorizon(mtf, 'swing', '스윙', ['1H', '4H']),
    pickHorizon(mtf, 'position', '중기', ['4H', '1D']),
  ];
}
