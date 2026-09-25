'use client';

import { useEffect, useRef, useState } from 'react';
import { getStoredBriefingPassword, getStoredBriefingUser } from '@/lib/clientAiCredentials';
import type { MergedIntegratedHubSnapshotFull } from '@/lib/mergedAnalysisPrecisionEnrichment';
import type { MergedIntegratedMtfTfRow } from '@/lib/mergedIntegratedMtfBoard';

export function useMergedIntegratedNarrate(
  symbol: string,
  chartTf: string,
  snapshot: MergedIntegratedHubSnapshotFull | null,
  mtfBoard: MergedIntegratedMtfTfRow[]
) {
  const [narrative, setNarrative] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dedupeRef = useRef('');

  useEffect(() => {
    if (!snapshot || !symbol) {
      setNarrative('');
      return;
    }

    const dedupeKey = [
      symbol,
      chartTf,
      snapshot.masterDirection,
      snapshot.masterGrade,
      snapshot.gauges.syncPct,
      snapshot.gauges.longPct,
      snapshot.gauges.gatesPct,
      snapshot.gauges.precisionFusion,
      snapshot.consensus.alignedTfCount,
      snapshot.conflictModules.join(','),
      snapshot.precision?.precisionGrade,
      mtfBoard.map((r) => `${r.tf}:${r.direction}`).join('|'),
    ].join('::');

    if (dedupeRef.current === dedupeKey) return;
    dedupeRef.current = dedupeKey;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 14_000);

    void (async () => {
      try {
        const res = await fetch('/api/merged-integrated-narrate', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            symbol,
            chartTf,
            integrated: {
              masterDirection: snapshot.masterDirection,
              masterGrade: snapshot.masterGrade,
              syncPct: snapshot.gauges.syncPct,
              longPct: snapshot.gauges.longPct,
              shortPct: snapshot.gauges.shortPct,
              confidence: snapshot.gauges.confidence,
              mtfAlignPct: snapshot.gauges.mtfAlignPct,
              gatesPct: snapshot.gauges.gatesPct,
              precisionFusion: snapshot.gauges.precisionFusion,
              precisionGrade: snapshot.precision?.precisionGrade ?? null,
              headlineKo: snapshot.headlineKo,
              actionLine: snapshot.actionLine,
              confirmHeadlineKo: snapshot.confirmHeadlineKo,
              deterministicNarrativeKo: snapshot.deterministicNarrativeKo,
              htfContextKo: snapshot.htfContextKo,
              ltfContextKo: snapshot.ltfContextKo,
              flowKo: snapshot.flowKo,
              structurePathKo: snapshot.structurePathKo,
              riskKo: snapshot.riskKo,
              external: snapshot.external
                ? {
                    news: snapshot.external.news,
                    whale: snapshot.external.whale
                      ? {
                          headline: snapshot.external.whale.headlineKo,
                          aligned: snapshot.external.whale.alignedWithMaster,
                        }
                      : null,
                    signalHistory: snapshot.external.signalHistory?.compareKo,
                  }
                : null,
              mtfStatistics: snapshot.mtfStatistics
                ? {
                    verdict: snapshot.mtfStatistics.statisticalVerdict,
                    longPct: snapshot.mtfStatistics.weightedLongPct,
                    shortPct: snapshot.mtfStatistics.weightedShortPct,
                    activeStrike: snapshot.mtfStatistics.activeStrike,
                    tiers: snapshot.mtfStatistics.tiers.map((t) => ({
                      tier: t.tier,
                      verdict: t.dominantDirection,
                      longPct: t.longPct,
                    })),
                  }
                : null,
              analysisFusion: snapshot.analysisFusion
                ? {
                    depthScore: snapshot.analysisFusion.depthScore,
                    depthGrade: snapshot.analysisFusion.depthGrade,
                    depthLabelKo: snapshot.analysisFusion.depthLabelKo,
                    rsiContextKo: snapshot.analysisFusion.rsiContextKo,
                    regimeContextKo: snapshot.analysisFusion.regimeContextKo,
                    confirmationMet: snapshot.analysisFusion.confirmationPoints.filter((p) => p.met).length,
                    confirmationTotal: snapshot.analysisFusion.confirmationPoints.length,
                    dimensions: snapshot.analysisFusion.dimensions.map((d) => ({
                      key: d.key,
                      label: d.labelKo,
                      score: d.score,
                      tone: d.tone,
                    })),
                    keyLevels: snapshot.analysisFusion.keyLevels.slice(0, 6).map((l) => ({
                      label: l.labelKo,
                      price: l.price,
                      kind: l.kind,
                    })),
                  }
                : null,
              conflictModules: snapshot.conflictModules,
              scenarios: snapshot.scenarios.map((sc) => ({
                key: sc.key,
                label: sc.labelKo,
                line: sc.lineKo,
                level: sc.level,
              })),
              gatePartials: snapshot.gatePartials.map((g) => ({
                label: g.label,
                score: g.score,
                pass: g.pass,
              })),
              modules: snapshot.modules.map((m) => ({
                label: m.labelKo,
                direction: m.direction,
                aligned: m.aligned,
                detail: m.detailKo,
              })),
              consensusSummary: snapshot.consensus.summaryKo,
              reasonsKo: snapshot.reasonsKo.slice(0, 6),
              tradeLevels: snapshot.tradeLevels,
              mtfBoard: mtfBoard.map((r) => ({
                tf: r.tf,
                direction: r.direction,
                verdict: r.verdictKo,
                long: r.longScore,
                short: r.shortScore,
              })),
            },
            briefingLogin: {
              user: getStoredBriefingUser().trim(),
              password: getStoredBriefingPassword(),
            },
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { narrative?: string; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || 'AI 설명 실패');
          return;
        }
        const text = typeof data.narrative === 'string' ? data.narrative.trim() : '';
        if (text) setNarrative(text);
      } catch {
        if (!cancelled) setError(null);
      } finally {
        if (!cancelled) setLoading(false);
        window.clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [symbol, chartTf, snapshot, mtfBoard]);

  const llmNarrative = narrative;
  const engineNarrative = snapshot?.deterministicNarrativeKo ?? '';

  return {
    narrative: llmNarrative || engineNarrative,
    llmNarrative,
    engineNarrative,
    loading,
    error,
    hasLlm: Boolean(llmNarrative),
  };
}
