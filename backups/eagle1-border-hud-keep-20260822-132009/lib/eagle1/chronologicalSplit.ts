/**
 * Time-series split. Random shuffle is forbidden.
 */

export type Eagle1ChronoSplit = {
  trainEnd: number;
  valEnd: number;
  holdoutEnd: number;
  train: number[];
  validation: number[];
  holdout: number[];
};

export function chronologicalSplit(
  length: number,
  ratios?: { train?: number; validation?: number }
): Eagle1ChronoSplit {
  const n = Math.max(0, Math.floor(length));
  const trainR = ratios?.train ?? 0.6;
  const valR = ratios?.validation ?? 0.2;
  const trainEnd = Math.floor(n * trainR);
  const valEnd = Math.floor(n * (trainR + valR));
  const train: number[] = [];
  const validation: number[] = [];
  const holdout: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < trainEnd) train.push(i);
    else if (i < valEnd) validation.push(i);
    else holdout.push(i);
  }
  return { trainEnd, valEnd, holdoutEnd: n, train, validation, holdout };
}

export function isChronological(indices: number[]): boolean {
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] <= indices[i - 1]) return false;
  }
  return true;
}

export function rejectShuffledSplit(split: Eagle1ChronoSplit): string | null {
  if (!isChronological(split.train) || !isChronological(split.validation) || !isChronological(split.holdout)) {
    return 'split indices are not chronological';
  }
  const lastTrain = split.train.length ? split.train[split.train.length - 1] : -1;
  const firstVal = split.validation[0];
  const lastVal = split.validation.length ? split.validation[split.validation.length - 1] : lastTrain;
  const firstHold = split.holdout[0];
  if (firstVal != null && lastTrain >= firstVal) return 'train overlaps validation';
  if (firstHold != null && lastVal >= firstHold) return 'validation overlaps holdout';
  return null;
}
