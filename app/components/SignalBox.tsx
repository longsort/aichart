'use client';

import { memo, useMemo } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import { defaultSettings, loadSettings } from '@/lib/settings';
import { buildUnifiedLsSignal } from '@/lib/unifiedSignalEngine';
import { buildProfileFromPanelFeatures, DEFAULT_UNIFIED_PANEL_FEATURES, type UnifiedPanelFeatures } from '@/lib/unifiedSignalPanelProfile';
import { FUSION_DIRECTION_LABEL_KO, SIGNAL_GRADE_LABEL_KO } from '@/lib/unifiedSignalTypes';
import { useSettingsChangeTick } from '@/lib/useSettingsChangeTick';
import { fusionTheme } from '@/lib/fusionUiTheme';

type Props = {
  analysis: AnalyzeResponse | null;
  candles?: Candle[] | null;
  panelFeatures?: UnifiedPanelFeatures;
};

function SignalBoxInner({ analysis, candles, panelFeatures }: Props) {
  const settingsTick = useSettingsChangeTick();
  const fusionProfile = useMemo(() => {
    const pf = panelFeatures ?? DEFAULT_UNIFIED_PANEL_FEATURES;
    const s = typeof window !== 'undefined' ? loadSettings() : defaultSettings;
    return buildProfileFromPanelFeatures(pf, {
      showRsiIndicators: s.showRsi,
      showMacdPanel: s.showMacdPanel,
      showBbPanel: s.showBbPanel,
    });
  }, [panelFeatures, settingsTick]);
  const fusion = useMemo(
    () =>
      analysis
        ? buildUnifiedLsSignal(
            analysis,
            fusionProfile,
            candles && candles.length >= 30 ? { candles } : undefined,
          )
        : null,
    [analysis, fusionProfile, candles],
  );
  const s = analysis?.frontRunSignal;

  if (!analysis) {
    return (
      <div
        className="card panel-pad"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 14,
          background: 'linear-gradient(160deg, rgba(15,23,42,0.98) 0%, rgba(49,46,129,0.15) 100%)',
          boxShadow: '0 0 0 1px rgba(99,102,241,0.12), 0 12px 40px -16px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="section-title"
          style={{
            marginTop: 0,
            fontSize: 18,
            background: 'linear-gradient(90deg, #f1f5f9, #a5b4fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          신호 박스
        </div>
        <div className="subtle" style={{ marginTop: 10 }}>분석 로드 후 표시</div>
      </div>
    );
  }

  const ft = fusionTheme(fusion!.grade);
  const mix = Math.max(1, fusion!.longDisplay + fusion!.shortDisplay);
  const longPct = Math.round((fusion!.longDisplay / mix) * 100);

  return (
    <div
      className="card panel-pad"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 14,
        background: 'linear-gradient(165deg, rgba(15,23,42,0.99) 0%, rgba(76,29,149,0.18) 50%, rgba(15,23,42,0.97) 100%)',
        boxShadow: '0 0 0 1px rgba(167,139,250,0.15), 0 18px 48px -18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          top: -30,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 280,
          height: 120,
          background: `radial-gradient(ellipse at center, ${ft.glow}, transparent 70%)`,
          opacity: 0.7,
        }}
      />
      <div
        className="section-title"
        style={{
          marginTop: 0,
          fontSize: 18,
          position: 'relative',
          zIndex: 1,
          background: 'linear-gradient(92deg, #f8fafc 0%, #c4b5fd 50%, #22d3ee 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontWeight: 900,
          letterSpacing: '-0.02em',
        }}
      >
        신호 박스
      </div>
      <div
        style={{
          marginTop: 12,
          position: 'relative',
          zIndex: 1,
          padding: '14px 14px 12px',
          borderRadius: 12,
          border: `1px solid ${ft.ring}`,
          background: 'linear-gradient(150deg, rgba(15,23,42,0.88) 0%, rgba(49,46,129,0.28) 100%)',
          boxShadow: `0 0 36px -12px ${ft.glow}, inset 0 1px 0 rgba(255,255,255,0.09)`,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 8 }}>통합 퓨전</div>
        <div
          style={{
            height: 7,
            borderRadius: 999,
            overflow: 'hidden',
            display: 'flex',
            marginBottom: 10,
            background: 'rgba(0,0,0,0.4)',
            boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              width: `${longPct}%`,
              background: 'linear-gradient(90deg, #166534, #4ade80)',
              boxShadow: '0 0 10px rgba(74,222,128,0.45)',
            }}
          />
          <div style={{ flex: 1, background: 'linear-gradient(90deg, #f87171, #b91c1c)' }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: ft.main, textShadow: `0 0 24px ${ft.glow}` }}>
            {SIGNAL_GRADE_LABEL_KO[fusion!.grade]}
          </span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>{FUSION_DIRECTION_LABEL_KO[fusion!.direction]}</span>
        </div>
        <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
          롱 <span style={{ color: '#86efac', fontWeight: 700 }}>{fusion!.longDisplay}</span>
          {' / '}
          숏 <span style={{ color: '#fca5a5', fontWeight: 700 }}>{fusion!.shortDisplay}</span>
          {' · 격차 '}
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>{fusion!.edge > 0 ? '+' : ''}{fusion!.edge}</span>
        </div>
        {analysis.confirmedSignal && (() => {
          const cs = analysis.confirmedSignal;
          const ok = cs.confirmed && cs.direction;
          const n = [cs.structure, cs.rsi, cs.supportResistance, cs.close, cs.fvgZone].filter(Boolean).length;
          return (
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', marginBottom: 6 }}>5요소 확정</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    background: ok ? 'rgba(34,197,94,0.22)' : 'rgba(255,214,102,0.12)',
                    color: ok ? '#86efac' : '#fde047',
                    border: `1px solid ${ok ? 'rgba(34,197,94,0.4)' : 'rgba(255,214,102,0.35)'}`,
                  }}
                >
                  {ok ? '확정' : '준비'} {n}/5
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>
                  {cs.direction === 'LONG' ? '롱' : cs.direction === 'SHORT' ? '숏' : '방향–'}
                </span>
              </div>
            </div>
          );
        })()}
      </div>
      {!s ? (
        <div
          className="subtle"
          style={{
            marginTop: 12,
            position: 'relative',
            zIndex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(30,41,59,0.45)',
            border: '1px dashed rgba(148,163,184,0.35)',
            textAlign: 'center',
          }}
        >
          선행·실행 신호 계산 대기중
        </div>
      ) : (
        <>
          <div className="mini-grid" style={{ marginTop: 14, position: 'relative', zIndex: 1 }}>
            {(() => {
              const c = s.direction === 'LONG' ? '#4ade80' : s.direction === 'SHORT' ? '#f87171' : '#94a3b8';
              const stateKo =
                s.state === 'TRIGGERED' ? '확정' :
                s.state === 'READY' ? '준비' :
                s.state === 'WATCH' ? '관찰' :
                s.state === 'INVALID' ? '무효' : '신호없음';
              const dirKo = s.direction === 'LONG' ? '롱' : s.direction === 'SHORT' ? '숏' : '없음';
              return (
                <>
                  <div className="mini-card" style={{ border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 4px 14px -8px rgba(0,0,0,0.4)' }}>
                    <div className="metric-label">상태</div>
                    <div className="mini-value" style={{ color: c, textShadow: `0 0 16px ${c}55` }}>{stateKo}</div>
                  </div>
                  <div className="mini-card" style={{ border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 4px 14px -8px rgba(0,0,0,0.4)' }}>
                    <div className="metric-label">방향</div>
                    <div className="mini-value" style={{ color: c }}>{dirKo}</div>
                  </div>
                  <div className="mini-card" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                    <div className="metric-label">신뢰도</div>
                    <div className="metric-value">{s.confidence}%</div>
                  </div>
                  <div className="mini-card" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                    <div className="metric-label">점수</div>
                    <div className="metric-value">{s.totalScore}</div>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="subtle" style={{ marginTop: 8, position: 'relative', zIndex: 1 }}>
            Entry {s.entry?.toFixed?.(2) ?? '-'} · Stop {s.stop?.toFixed?.(2) ?? '-'}
          </div>
          <div className="subtle">
            TP {s.tp1?.toFixed?.(2) ?? '-'} / {s.tp2?.toFixed?.(2) ?? '-'} / {s.tp3?.toFixed?.(2) ?? '-'}
          </div>
          <div className="subtle">
            RR {s.rr?.toFixed?.(2) ?? '-'} · Lev {s.leverage?.toFixed?.(2) ?? '-'}x · Size {s.positionSize ? Math.round(s.positionSize) : '-'} USDT · Risk {s.riskAmount ? Math.round(s.riskAmount) : '-'} USDT
          </div>
          {s.thresholds && (
            <div className="subtle" style={{ marginTop: 8, fontSize: 11 }}>
              기준값 ({String(s.thresholds.timeframe).toUpperCase()} · {s.thresholds.regime})
              {' '}· 확정 S{ s.thresholds.triggered.setup }/T{ s.thresholds.triggered.trigger }/합{ s.thresholds.triggered.total }
              {' '}· 준비 S{ s.thresholds.ready.setup }/T{ s.thresholds.ready.trigger }
              {' '}· 관찰 S{ s.thresholds.watch.setup }/T&lt;{ s.thresholds.watch.triggerUpper }
            </div>
          )}
          {(s.reasons?.length ?? 0) > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
              {s.reasons.slice(0, 5).map((r, i) => <div key={`${r.code}-${i}`}>- {r.label} (+{r.score})</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(SignalBoxInner);
