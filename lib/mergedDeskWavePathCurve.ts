/**
 * 파동 이동경로 — 직선이 아닌 굴곡(베지어) 샘플 점.
 * 마지막 캔들 → 다음 목표 사이를 부드러운 경로로 쪼개 trendLine 세그먼트에 씀.
 */
export type CurveSample = { time: number; price: number };

/** 2점 + 제어점 이차 베지어 */
export function sampleQuadraticBezier(
  a: CurveSample,
  b: CurveSample,
  control: CurveSample,
  steps: number
): CurveSample[] {
  const n = Math.max(2, Math.min(16, Math.round(steps)));
  const out: CurveSample[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const time = u * u * a.time + 2 * u * t * control.time + t * t * b.time;
    const price = u * u * a.price + 2 * u * t * control.price + t * t * b.price;
    out.push({ time, price });
  }
  return out;
}

/**
 * a→b 굴곡 제어점 — 중간 시각 + 가격을 경로 방향으로 휘게.
 * ampPct: 가격 스팬 대비 굴곡 강도 (0.08~0.22)
 */
export function wavePathBendControl(
  a: CurveSample,
  b: CurveSample,
  opts?: { ampPct?: number; upwardBias?: boolean | null }
): CurveSample {
  const midT = (a.time + b.time) / 2;
  const midP = (a.price + b.price) / 2;
  const dP = b.price - a.price;
  const span = Math.max(Math.abs(dP), Math.abs(a.price) * 0.002);
  const amp = span * (opts?.ampPct ?? 0.14);
  /** 상승 레그는 살짝 위로 볼록, 하락은 아래로 — 이미지형 굴곡 */
  let bend = dP >= 0 ? amp : -amp;
  if (opts?.upwardBias === true) bend = Math.abs(amp);
  if (opts?.upwardBias === false) bend = -Math.abs(amp);
  return {
    time: midT,
    price: midP + bend * 0.85,
  };
}

/** a→b를 굴곡 세그먼트 점으로 (끝점 포함, 시작 중복 가능) */
export function curveWaveSegment(
  a: CurveSample,
  b: CurveSample,
  steps = 7,
  upwardBias?: boolean | null
): CurveSample[] {
  const ctrl = wavePathBendControl(a, b, { upwardBias });
  return sampleQuadraticBezier(a, b, ctrl, steps);
}

/** 여러 꼭짓점을 굴곡으로 이은 폴리라인 (연속) */
export function curveWavePolyline(
  nodes: CurveSample[],
  stepsPerLeg = 6,
  upwardBias?: boolean | null
): CurveSample[] {
  if (nodes.length < 2) return nodes.slice();
  const out: CurveSample[] = [{ ...nodes[0]! }];
  for (let i = 0; i < nodes.length - 1; i++) {
    const leg = curveWaveSegment(nodes[i]!, nodes[i + 1]!, stepsPerLeg, upwardBias);
    for (let j = 1; j < leg.length; j++) out.push(leg[j]!);
  }
  return out;
}
