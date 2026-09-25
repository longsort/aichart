'use client';

import { forwardRef, useEffect, useState } from 'react';
import type { ChartSnapshotRef } from './chartSnapshotRef';

type ChartViewProps = Record<string, unknown>;

type ChartViewMod = typeof import('./ChartView').default;

/** 모듈 평가 즉시 컴파일 — useEffect까지 기다리지 않음 */
let cachedChartView: ChartViewMod | null = null;
let chartViewError: string | null = null;
const chartViewChunk: Promise<ChartViewMod | null> =
  typeof window !== 'undefined'
    ? import('./ChartView')
        .then((m) => {
          cachedChartView = m.default;
          return m.default;
        })
        .catch((e) => {
          chartViewError = e instanceof Error ? e.message : '차트 모듈 로드 실패';
          return null;
        })
    : Promise.resolve(null);

const ChartViewLazy = forwardRef<ChartSnapshotRef, ChartViewProps>(function ChartViewLazy(props, ref) {
  const [Comp, setComp] = useState<ChartViewMod | null>(() => cachedChartView);
  const [err, setErr] = useState<string | null>(() => chartViewError);
  useEffect(() => {
    if (cachedChartView) {
      setComp(() => cachedChartView);
      return;
    }
    let alive = true;
    void chartViewChunk.then((mod) => {
      if (!alive) return;
      if (mod) setComp(() => mod);
      else if (chartViewError) setErr(chartViewError);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (err) {
    return (
      <div className="chart-wrap" style={{ minHeight: 280, background: '#0b1220', color: '#fca5a5', padding: 16, fontSize: 13 }}>
        차트 로드 오류 · {err}
        <div style={{ marginTop: 8, color: '#94a3b8' }}>Ctrl+Shift+R 후 다시 시도</div>
      </div>
    );
  }
  if (!Comp) {
    return (
      <div
        className="chart-wrap"
        style={{
          minHeight: 280,
          background: '#0b1220',
          color: '#94a3b8',
          padding: 16,
          fontSize: 13,
        }}
      >
        차트 엔진 준비 중…
      </div>
    );
  }
  return <Comp {...props} ref={ref as never} />;
});

export default ChartViewLazy;
