'use client';

import { memo, useState } from 'react';
import type { AnalyzeResponse } from '@/types';
import { clearAllowedFailedContexts, isFailedContextAllowed, setFailedContextAllowed } from '@/lib/virtualTradeStore';

type Props = {
  analysis: AnalyzeResponse | null;
};

function AutonomousLearningCardInner({ analysis }: Props) {
  const learning = analysis?.signalLearning;
  const adaptive = analysis?.adaptiveLearningSignal;
  const gate = analysis?.learningFilter;
  const lsPlan = analysis?.lsSignalPlan;
  const candleStats = analysis?.learningCandleStats;
  const [allowVersion, setAllowVersion] = useState(0);

  return (
    <div className="card panel-pad" style={{ borderRadius: 12 }}>
      <div className="section-title" style={{ marginTop: 0 }}>자율학습 카드 (LS TP/SL 누적)</div>
      {!learning ? (
        <div className="subtle" style={{ marginTop: 8, fontSize: 12 }}>
          학습 데이터가 아직 없습니다. 분석이 몇 번 누적되면 자동으로 채워집니다.
        </div>
      ) : (
        <>
          {adaptive && (
            <div className="mini-card" style={{ marginTop: 8, marginBottom: 8 }}>
              <div className="metric-label">학습 브리핑</div>
              <div className={`mini-value ${adaptive.direction === 'LONG' ? 'c-long' : adaptive.direction === 'SHORT' ? 'c-short' : ''}`}>
                {adaptive.direction === 'LONG' ? '롱' : adaptive.direction === 'SHORT' ? '숏' : '보류'} · {adaptive.confidence}%
              </div>
              <div className="subtle" style={{ fontSize: 11, marginTop: 6 }}>
                {adaptive.briefing}
              </div>
            </div>
          )}
          {gate && (
            <div className="mini-card" style={{ marginTop: 8, marginBottom: 8, border: `1px solid ${gate.passed ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}` }}>
              <div className="metric-label">학습 필터 게이트</div>
              <div className={`mini-value ${gate.passed ? 'c-long' : 'c-short'}`}>
                {gate.passed ? '통과 (신호 표시)' : '차단 (WATCH 강등)'}
              </div>
              <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                점수 {gate.score} / 기준 {gate.threshold}
              </div>
            </div>
          )}
          {lsPlan && (
            <div className="mini-card" style={{ marginTop: 8, marginBottom: 8 }}>
              <div className="metric-label">현재 L/S TP·SL</div>
              <div className={`mini-value ${lsPlan.direction === 'LONG' ? 'c-long' : 'c-short'}`}>
                {lsPlan.direction === 'LONG' ? '롱' : '숏'} · RR {lsPlan.rr.toFixed(2)}
              </div>
              <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                Entry {lsPlan.entry.toFixed(2)} · SL {lsPlan.stopLoss.toFixed(2)}
              </div>
              <div className="subtle" style={{ fontSize: 11 }}>
                TP1 {lsPlan.targets[0].toFixed(2)} · TP2 {lsPlan.targets[1].toFixed(2)} · TP3 {lsPlan.targets[2].toFixed(2)}
              </div>
            </div>
          )}
          <div className="mini-grid" style={{ marginTop: 8, marginBottom: 8 }}>
            <div className="mini-card"><div className="metric-label">총 신호</div><div className="metric-value">{learning.total}</div></div>
            <div className="mini-card"><div className="metric-label">성공률</div><div className={`mini-value ${learning.successRate >= 55 ? 'c-long' : 'c-short'}`}>{learning.successRate.toFixed(1)}%</div></div>
            <div className="mini-card"><div className="metric-label">실패율</div><div className="mini-value c-short">{learning.failRate.toFixed(1)}%</div></div>
            <div className="mini-card"><div className="metric-label">TP1/2/3</div><div className="mini-value c-long">{learning.tp1Count}/{learning.tp2Count}/{learning.tp3Count}</div></div>
            <div className="mini-card"><div className="metric-label">SL</div><div className="mini-value c-short">{learning.slCount}</div></div>
            <div className="mini-card"><div className="metric-label">미종결</div><div className="mini-value">{learning.openCount}</div></div>
          </div>
          {learning.sampleSources && (
            <div className="mini-card" style={{ marginBottom: 8 }}>
              <div className="metric-label">샘플 소스 현황 (현재 TF)</div>
              <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                Confirmed {learning.sampleSources.confirmed} · Triggered {learning.sampleSources.triggered} · Ready {learning.sampleSources.ready}
              </div>
              <div className="subtle" style={{ fontSize: 11 }}>
                RSI {learning.sampleSources.rsi} · 구조로켓 {learning.sampleSources.structureRockets ?? 0} · 병합 최종 {learning.sampleSources.merged}
              </div>
            </div>
          )}
          {!!learning.slFailures?.length && (
            <div className="mini-card" style={{ marginBottom: 8 }}>
              <div className="metric-label">차트 SL 배제</div>
              <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                선행 봉에서 SL이 먼저 맞은 {learning.slFailures.length}건은 해당 시점 L/S·구조 로켓(🚀·📉) 표시를 숨깁니다.
              </div>
            </div>
          )}
          {candleStats && (
            <div className="mini-card" style={{ marginBottom: 8 }}>
              <div className="metric-label">캔들 누적 현황 (현재 TF)</div>
              <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                학습 fetch {candleStats.fetched}개 · 화면 표시 {candleStats.visible}개
              </div>
            </div>
          )}
          {!!analysis?.featureProbabilities?.length && (
            <div className="mini-card" style={{ marginBottom: 8 }}>
              <div className="metric-label">기능별 상승/하락·지지/저항 확률</div>
              <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
                {analysis.featureProbabilities.slice(0, 6).map((f) => (
                  <div key={f.key} style={{ fontSize: 11, color: '#cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                      <span style={{ color: f.directionBias === 'LONG' ? '#22C55E' : f.directionBias === 'SHORT' ? '#EF4444' : '#94a3b8' }}>
                        {f.directionBias === 'LONG' ? '롱우세' : f.directionBias === 'SHORT' ? '숏우세' : '중립'}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      상승 {f.riseProb}% · 하락 {f.fallProb}% · 지지 {f.supportProb}% · 저항 {f.resistanceProb}% · 샘플 {f.samples}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mini-card" style={{ marginBottom: 8 }}>
            <div className="metric-label">워크포워드(OOS)</div>
            <div className={`mini-value ${learning.walkForward.oosPassed ? 'c-long' : 'c-short'}`}>
              {learning.walkForward.oosPassed ? '통과' : '미통과'} · {learning.walkForward.oosWinRate.toFixed(1)}%
            </div>
            <div className="subtle" style={{ fontSize: 11 }}>
              Train {learning.walkForward.trainWinRate.toFixed(1)}% · OOS 샘플 {learning.walkForward.oosSamples}
            </div>
          </div>
          <div className="subtle" style={{ fontSize: 11, marginBottom: 8 }}>
            신호 발생 이후 캔들로 TP/SL 결과를 자동 누적 평가합니다.
          </div>
          {(learning.failedContextsTop5?.length ?? 0) > 0 && (
            <div className="mini-card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div className="metric-label">실패 컨텍스트 상위 5 (회피중)</div>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={{ padding: '1px 8px', fontSize: 10 }}
                  onClick={() => {
                    clearAllowedFailedContexts();
                    setAllowVersion(v => v + 1);
                  }}
                  title="허용중 예외를 전부 초기화하고 다시 회피 규칙 적용"
                >
                  허용 초기화
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {learning.failedContextsTop5!.map((x, i) => {
                  const dt = x.lastAt ? new Date(x.lastAt * 1000).toLocaleString('ko-KR') : '-';
                  const allowed = isFailedContextAllowed(x.context);
                  return (
                    <div key={`${x.context}-${i}-${allowVersion}`} style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>#{i + 1} {x.count}회 · {x.context}</span>
                      <button
                        type="button"
                        className="tool-chip tool-chip-button"
                        style={{ padding: '1px 8px', fontSize: 10, border: `1px solid ${allowed ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, color: allowed ? '#22C55E' : '#EF4444' }}
                        onClick={() => {
                          setFailedContextAllowed(x.context, !allowed);
                          setAllowVersion(v => v + 1);
                        }}
                        title={allowed ? '예외 허용 해제(다시 회피)' : '예외 허용(회피 제외)'}
                      >
                        {allowed ? '허용중' : '회피중'}
                      </button>
                      <span style={{ color: '#64748b' }}>최근 {dt}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {learning.recent.slice(0, 10).map((e, i) => {
              const date = new Date(e.time * 1000);
              const d = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
              const oc = e.outcome.startsWith('TP') ? '#22C55E' : e.outcome === 'SL' ? '#EF4444' : '#94a3b8';
              return (
                <div key={`${e.time}-${i}`} className="mini-card" style={{ padding: '6px 8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                    <span>{d} · {e.verdict}</span>
                    <span style={{ color: oc, fontWeight: 700 }}>{e.outcome}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(AutonomousLearningCardInner);

