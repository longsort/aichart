'use client';



import { useEffect, useRef, useState } from 'react';

import { getStoredBriefingPassword, getStoredBriefingUser } from '@/lib/clientAiCredentials';

import type { MonthDeskUnifiedBriefingSnapshot } from '@/lib/monthDeskUnifiedPrecisionBriefing';



export function useMonthDeskUnifiedBriefingNarrate(

  symbol: string,

  chartTf: string,

  snapshot: MonthDeskUnifiedBriefingSnapshot | null

) {

  const [narrative, setNarrative] = useState('');

  const [loading, setLoading] = useState(false);

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

      snapshot.actionLine,

      snapshot.conflictModules.join(','),

    ].join('::');



    if (dedupeRef.current === dedupeKey) return;

    dedupeRef.current = dedupeKey;



    let cancelled = false;

    setLoading(true);

    const controller = new AbortController();

    const timer = window.setTimeout(() => controller.abort(), 14_000);



    void (async () => {

      try {

        const res = await fetch('/api/month-desk-unified-briefing-narrate', {

          method: 'POST',

          credentials: 'same-origin',

          headers: { 'Content-Type': 'application/json' },

          signal: controller.signal,

          body: JSON.stringify({

            symbol,

            chartTf,

            briefing: {

              masterDirection: snapshot.masterDirection,

              masterGrade: snapshot.masterGrade,

              syncPct: snapshot.gauges.syncPct,

              longPct: snapshot.gauges.longPct,

              shortPct: snapshot.gauges.shortPct,

              confidence: snapshot.gauges.confidence,

              gatesPct: snapshot.gauges.gatesPct,

              precisionFusion: snapshot.gauges.precisionFusion,

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
                    whale: snapshot.external.whale?.headlineKo,
                    signalHistory: snapshot.external.signalHistory?.compareKo,
                  }
                : null,

              conflictModules: snapshot.conflictModules,

              scenarios: snapshot.scenarios.map((sc) => ({

                key: sc.key,

                label: sc.labelKo,

                line: sc.lineKo,

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

              tradeLevels: snapshot.tradeLevels,

              mtfBoard: snapshot.mtfBoard.map((r) => ({

                tf: r.tf,

                direction: r.direction,

                verdict: r.verdictKo,

              })),

              reasonsKo: snapshot.reasonsKo.slice(0, 5),

            },

            briefingLogin: {

              user: getStoredBriefingUser().trim(),

              password: getStoredBriefingPassword(),

            },

          }),

        });

        const data = (await res.json().catch(() => ({}))) as { narrative?: string };

        if (cancelled || !res.ok) return;

        const text = typeof data.narrative === 'string' ? data.narrative.trim() : '';

        if (text) setNarrative(text);

      } catch {

        /* ignore */

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

  }, [symbol, chartTf, snapshot]);



  return { narrative, llmNarrative: narrative, loading };

}

