'use client';



import { useEffect, useMemo, useState } from 'react';

import type { AnalyzeResponse, Candle } from '@/types';

import type { MergedTradeJudgment } from '@/lib/mergedAnalysisDeskEngine';

import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';

import {

  buildMergedMtfConsensus,

  type MergedMtfConsensusResult,

} from '@/lib/mergedAnalysisMtfConsensus';

import { useTfCloseSettleBoard } from '@/lib/useTfCloseSettleBoard';

import { useMergedIntegratedHubContext } from './MergedIntegratedHubContext';

import styles from './MergedAnalysisDesk.module.css';



const CONSENSUS_COLLAPSED_KEY = 'ailongshort-merged-mtf-consensus-collapsed';



type Props = {

  symbol: string;

  chartTf: string;

  analysis: AnalyzeResponse | null;

  candles: Candle[] | null;

  trade: MergedTradeSignal | null;

  judgment: MergedTradeJudgment | null;

  theme?: 'dark' | 'light';

  /** 통합 허브 내부 — 상단 헤더 게이지와 MTF fetch 공유 */

  embedded?: boolean;

};



function fmt(n: number | null | undefined): string {

  if (n == null || !Number.isFinite(n) || n === 0) return '—';

  const a = Math.abs(n);

  const frac = a >= 1000 ? 1 : a >= 1 ? 2 : 4;

  return n.toLocaleString(undefined, { maximumFractionDigits: frac });

}



function dirClass(dir: string): string {

  if (dir === 'LONG') return styles.mtfConsensusDirLong;

  if (dir === 'SHORT') return styles.mtfConsensusDirShort;

  return styles.mtfConsensusDirNeutral;

}



export default function MergedAnalysisMtfConsensusCard({

  symbol,

  chartTf,

  analysis,

  candles,

  trade,

  judgment,

  theme = 'dark',

  embedded = false,

}: Props) {

  const hubCtx = useMergedIntegratedHubContext();

  const useHub = embedded && hubCtx != null;



  const [collapsed, setCollapsed] = useState(!embedded);

  const [mtfRows, setMtfRows] = useState<Array<{ tf: string; analyze: AnalyzeResponse | null }>>([]);

  const [mtfLoading, setMtfLoading] = useState(false);

  const { board: localSettleBoard } = useTfCloseSettleBoard(symbol, !useHub);



  useEffect(() => {

    if (embedded) return;

    try {

      const raw = window.localStorage.getItem(CONSENSUS_COLLAPSED_KEY);

      if (raw === '0' || raw === 'false') setCollapsed(false);

      else if (raw === '1' || raw === 'true') setCollapsed(true);

    } catch {

      /* ignore */

    }

  }, [embedded]);



  useEffect(() => {

    if (useHub) return;

    let cancelled = false;

    setMtfLoading(true);

    const q = new URLSearchParams({

      symbol,

      timeframe: chartTf,

      excludeTf: chartTf,

    });

    void fetch(`/api/mtf-signal-board?${q.toString()}`, { credentials: 'same-origin' })

      .then((r) => r.json())

      .then((j: { rows?: Array<{ tf: string; analyze: AnalyzeResponse }> }) => {

        if (cancelled) return;

        const rows = Array.isArray(j.rows)

          ? j.rows.map((row) => ({

              tf: row.tf,

              analyze: (row.analyze as AnalyzeResponse) ?? null,

            }))

          : [];

        setMtfRows(rows);

      })

      .catch(() => {

        if (!cancelled) setMtfRows([]);

      })

      .finally(() => {

        if (!cancelled) setMtfLoading(false);

      });

    return () => {

      cancelled = true;

    };

  }, [symbol, chartTf, useHub]);



  const consensus: MergedMtfConsensusResult | null = useMemo(() => {
    if (useHub) return hubCtx?.consensus ?? null;
    if (!analysis && !localSettleBoard && mtfRows.length === 0) return null;
    return buildMergedMtfConsensus({
      chartTf,
      analysis,
      candles,
      settleBoard: localSettleBoard,
      mtfAnalyzes: mtfRows,
      trade,
      judgment,
    });
  }, [useHub, hubCtx?.consensus, chartTf, analysis, candles, localSettleBoard, mtfRows, trade, judgment]);



  const loadingMtf = useHub ? hubCtx!.mtfLoading : mtfLoading;



  if (!consensus) return null;



  const toggle = () => {

    setCollapsed((prev) => {

      const next = !prev;

      if (!embedded) {

        try {

          window.localStorage.setItem(CONSENSUS_COLLAPSED_KEY, next ? '1' : '0');

        } catch {

          /* ignore */

        }

      }

      return next;

    });

  };



  const bm = consensus.boardMetrics;

  const longW = Math.max(6, Math.min(94, consensus.longPct));

  const shortW = Math.max(6, Math.min(94, consensus.shortPct));



  return (

    <section

      className={`${styles.mtfConsensusCard}${collapsed ? ` ${styles.mtfConsensusCollapsed}` : ''}${embedded ? ` ${styles.mtfConsensusEmbedded}` : ''}`}

      data-theme={theme}

      aria-label="AI MTF 합의 카드"

    >

      <button

        type="button"

        className={`${styles.mtfConsensusHead} ${dirClass(consensus.finalDirection)}`}

        onClick={toggle}

        aria-expanded={!collapsed}

      >

        <span className={styles.mtfConsensusHeadTitle}>

          <span className={styles.mtfConsensusAiTag}>AI CORE</span>

          MTF 합의 · {consensus.finalDirection === 'LONG' ? '롱' : consensus.finalDirection === 'SHORT' ? '숏' : '관망'}

          {useHub && hubCtx?.isLive ? (

            <span className={styles.mtfConsensusLiveTag}>LIVE</span>

          ) : null}

        </span>

        <span className={styles.mtfConsensusHeadMeta}>

          {consensus.grade !== '—' ? `등급 ${consensus.grade}` : '등급 —'} · {consensus.confidence}%

        </span>

        <span className={styles.mtfConsensusToggle}>{collapsed ? '펼치기 ▸' : '접기 ▾'}</span>

      </button>



      {!collapsed && (

        <div className={styles.mtfConsensusBody}>

          <div className={styles.mtfConsensusGauges}>

            <div className={styles.mtfConsensusGaugeItem}>

              <div className={styles.mtfConsensusGaugeLabel}>롱</div>

              <div className={styles.mtfConsensusGaugeVal} style={{ color: '#22c55e' }}>

                {consensus.longPct}%

              </div>

            </div>

            <div className={styles.mtfConsensusGaugeItem}>

              <div className={styles.mtfConsensusGaugeLabel}>숏</div>

              <div className={styles.mtfConsensusGaugeVal} style={{ color: '#ef4444' }}>

                {consensus.shortPct}%

              </div>

            </div>

            <div className={styles.mtfConsensusGaugeItem}>

              <div className={styles.mtfConsensusGaugeLabel}>확정</div>

              <div className={styles.mtfConsensusGaugeVal}>{consensus.gatesPassCount}/5</div>

            </div>

            <div className={styles.mtfConsensusGaugeItem}>

              <div className={styles.mtfConsensusGaugeLabel}>손익비</div>

              <div className={styles.mtfConsensusGaugeVal}>

                {consensus.trade.rr != null ? consensus.trade.rr.toFixed(2) : '—'}

              </div>

            </div>

          </div>



          <div className={styles.mtfConsensusBar}>

            <div className={styles.mtfConsensusBarLong} style={{ width: `${longW}%` }} />

            <div className={styles.mtfConsensusBarShort} style={{ width: `${shortW}%` }} />

          </div>



          <div className={styles.mtfConsensusSummary}>{consensus.summaryKo}</div>



          {consensus.conflict && (

            <div className={styles.mtfConsensusWarn}>MTF 롱·숏 혼재 — 단일 TF만으로 판단하지 마세요.</div>

          )}

          {consensus.mtfBlocked && (

            <div className={styles.mtfConsensusWarn}>상위 TF 반대 — 확정 게이트 억제 중.</div>

          )}



          <div className={styles.mtfConsensusTradeGrid}>

            <div><span>진입</span><strong>{fmt(consensus.trade.entry)}</strong></div>

            <div><span>손절</span><strong>{fmt(consensus.trade.stopLoss)}</strong></div>

            <div><span>TP1</span><strong>{fmt(consensus.trade.tp1)}</strong></div>

            <div><span>TP2</span><strong>{fmt(consensus.trade.tp2)}</strong></div>

            <div><span>TP3</span><strong>{fmt(consensus.trade.tp3)}</strong></div>

          </div>



          {bm && (

            <div className={styles.mtfConsensusCoreLine}>

              핵심보드 {bm.verdictLabel} · AI {bm.entryGrade} · {bm.readinessText ?? '확정 대기'}

            </div>

          )}



          <div className={styles.mtfConsensusMatrixHead}>

            TF별 합의 {loadingMtf ? '(MTF 로드…)' : ''}

          </div>

          <div className={styles.mtfConsensusMatrix}>

            {consensus.rows.map((row) => (

              <div

                key={row.tf}

                className={`${styles.mtfConsensusCell}${row.isChartTf ? ` ${styles.mtfConsensusCellChart}` : ''}`}

                title={row.sources.map((s) => s.labelKo).join(' · ') || '데이터 대기'}

              >

                <div className={styles.mtfConsensusCellTf}>{row.tfKo}</div>

                <div className={`${styles.mtfConsensusCellDir} ${dirClass(row.direction)}`}>

                  {row.direction === 'LONG'

                    ? '롱'

                    : row.direction === 'SHORT'

                      ? '숏'

                      : row.direction === 'WAIT'

                        ? '—'

                        : '중립'}

                </div>

                <div className={styles.mtfConsensusCellPct}>

                  L{row.longScore} / S{row.shortScore}

                </div>

              </div>

            ))}

          </div>



          {consensus.reasonsKo.length > 0 && (

            <ul className={styles.mtfConsensusReasons}>

              {consensus.reasonsKo.map((line) => (

                <li key={line}>{line}</li>

              ))}

            </ul>

          )}



          <p className={styles.mtfConsensusDisclaimer}>

            핵심보드·트레이드·마감안착·MTF digest 통계 합의 — 조건부 참고, 검증 필수.

          </p>

        </div>

      )}

    </section>

  );

}

