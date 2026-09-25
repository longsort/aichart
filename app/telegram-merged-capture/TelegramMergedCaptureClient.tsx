'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AnalyzeResponse, Candle } from '@/types';
import type { UIMode } from '@/lib/settings';
import MergedAnalysisDeskView from '@/app/components/mergedAnalysis/MergedAnalysisDeskView';
import type { ChartSnapshotRef } from '@/app/components/ChartView';

const ChartView = dynamic(() => import('@/app/components/ChartView'), { ssr: false });

type Props = {
  symbol: string;
  timeframe: string;
  captureKey: string;
};

export function TelegramMergedCaptureClient({ symbol, timeframe, captureKey }: Props) {
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const chartSnapshotRef = useRef<ChartSnapshotRef>(null);
  const readyRef = useRef(false);
  const uiMode: UIMode = 'MERGED_ANALYSIS_DESK';

  useEffect(() => {
    document.body.classList.add('telegram-merged-capture-mode');
    return () => {
      document.body.classList.remove('telegram-merged-capture-mode');
      delete document.body.dataset.telegramCaptureReady;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = new URLSearchParams({
          symbol,
          timeframe,
          key: captureKey,
        });
        const r = await fetch(`/api/telegram/capture-bootstrap?${q}`, { cache: 'no-store' });
        const j = (await r.json()) as { ok?: boolean; analysis?: AnalyzeResponse; error?: string };
        if (cancelled) return;
        if (!r.ok || !j.ok || !j.analysis) {
          setErr(String(j.error || r.status));
          setLoading(false);
          return;
        }
        setAnalysis(j.analysis);
        setLoading(false);
      } catch (e: unknown) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, captureKey]);

  const markReady = useCallback((candles: Candle[]) => {
    if (readyRef.current || candles.length < 8) return;
    readyRef.current = true;
    document.body.dataset.telegramCaptureReady = '1';
    const frame = document.querySelector('.tv-frame');
    if (frame instanceof HTMLElement) {
      frame.dataset.telegramCaptureReady = '1';
    }
  }, []);

  if (err) {
    return (
      <div data-telegram-capture-error="1" style={{ color: '#f87171', padding: 16 }}>
        capture bootstrap failed: {err}
      </div>
    );
  }

  return (
    <div className="telegram-merged-capture-shell">
      <MergedAnalysisDeskView
        telegramCaptureMode
        wrapEagle1Hud={false}
        shareMergedServerChart
        uiMode={uiMode}
        onUiModeChange={() => {}}
        symbol={symbol}
        timeframe={timeframe}
        theme="dark"
        analysis={analysis}
        loading={loading}
        fusionCandles={null}
        onRequestChartTf={() => {}}
        chartSnapshotRef={chartSnapshotRef}
        chartSlot={({
          mergedDeskPack,
          mergedStrikeBundle,
          onMirageZoneSelect,
          selectedMirageZoneId,
          onMergedDeskChartCandlesChange,
        }) => (
          <ChartView
            ref={chartSnapshotRef}
            useParentMergedDeskPack
            mergedDeskPack={mergedDeskPack}
            mergedStrikeBundle={mergedStrikeBundle}
            onMirageZoneSelect={onMirageZoneSelect}
            selectedMirageZoneId={selectedMirageZoneId}
            onMergedDeskChartCandlesChange={(candles, _tf) => {
              onMergedDeskChartCandlesChange?.(candles, _tf);
              markReady(candles);
            }}
            symbol={symbol}
            timeframe={timeframe}
            analysis={analysis!}
            setTimeframe={() => {}}
            theme="dark"
            uiMode={uiMode}
            onUiModeChange={() => {}}
          />
        )}
      />
    </div>
  );
}
