'use client';

import { normalizeChartTimeframe } from '@/lib/constants';
import type { MtfSignalBoardDigest, MtfBarFlags } from '@/lib/mtfSignalBoardDigest';

/** 모크업과 동일하게 상위 단기~일봉 4TF만 표시 */
const MOCKUP_TFS = ['15m', '1h', '4h', '1d'] as const;

export type MergedMtfRow = {
  tf: string;
  verdict: string;
  confidence: number;
  board?: MtfSignalBoardDigest;
  symbol?: string;
};

type Props = {
  symbol: string;
  chartTimeframe: string;
  mtfSignals: MergedMtfRow[];
  mtfBoardStickyByTf?: Record<string, MtfSignalBoardDigest>;
};

function scoreLong(lb: MtfBarFlags | undefined): number {
  if (!lb) return 0;
  return (
    (lb.rocketLong ? 3 : 0) +
    (lb.bandLong ? 2 : 0) +
    (lb.closingLong ? 2 : 0) +
    (lb.deltaYang ? 1 : 0)
  );
}

function scoreShort(lb: MtfBarFlags | undefined): number {
  if (!lb) return 0;
  return (
    (lb.rocketShort ? 3 : 0) +
    (lb.bandShort ? 2 : 0) +
    (lb.closingShort ? 2 : 0) +
    (lb.deltaEum ? 1 : 0)
  );
}

function statusFromFlags(lb: MtfBarFlags | undefined): string {
  if (!lb) return '데이터 수집 중…';
  const p: string[] = [];
  if (lb.closingLong) p.push('롱 안착 중');
  if (lb.closingShort) p.push('숏 안착 중');
  if (lb.closingNeutral) p.push('EQ50 중립');
  if (lb.bandLong && !lb.bandShort) p.push('EQ50 상회');
  else if (lb.bandShort && !lb.bandLong) p.push('EQ50 하회');
  else if (lb.bandLong || lb.bandShort) p.push('밴드 반응');
  if (lb.rocketLong) p.push('추세 롱 유지');
  if (lb.rocketShort) p.push('추세 숏 유지');
  if (lb.deltaYang) p.push('수요 반응');
  if (lb.deltaEum) p.push('공급 반응');
  if (p.length === 0) p.push('관망 · 신호 대기');
  return p.slice(0, 4).join(' | ');
}

function bullCell(active: boolean, dim: boolean) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        opacity: dim ? 0.35 : 1,
        filter: active ? 'none' : 'grayscale(0.85)',
      }}
      title={active ? '롱 쪽 신호 강함' : '롱 약함'}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? 'rgba(34,197,94,0.22)' : 'rgba(51,65,85,0.35)',
          border: active ? '1px solid rgba(74,222,128,0.55)' : '1px solid rgba(71,85,105,0.5)',
        }}
      >
        🐂
      </span>
    </div>
  );
}

function bearCell(active: boolean, dim: boolean) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        opacity: dim ? 0.35 : 1,
        filter: active ? 'none' : 'grayscale(0.85)',
      }}
      title={active ? '숏 쪽 신호 강함' : '숏 약함'}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? 'rgba(239,68,68,0.2)' : 'rgba(51,65,85,0.35)',
          border: active ? '1px solid rgba(248,113,113,0.5)' : '1px solid rgba(71,85,105,0.5)',
        }}
      >
        🐻
      </span>
    </div>
  );
}

export default function MergedAdvancedMtfSidebar({
  symbol,
  chartTimeframe,
  mtfSignals,
  mtfBoardStickyByTf,
}: Props) {
  const chartTf = normalizeChartTimeframe(chartTimeframe);

  return (
    <aside
      className="merged-advanced-mtf-sidebar merged-advanced-mtf-sidebar--deck"
      aria-label="MTF 신호"
      style={{
        width: 288,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid rgba(148,163,184,0.2)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.02 }}>MTF 신호</div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
          {symbol} · 15m · 1h · 4h · 1d
        </div>
      </div>

      <div style={{ padding: '8px 10px 10px', flex: 1, overflow: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 1fr 72px',
            gap: 4,
            fontSize: 10,
            fontWeight: 700,
            color: '#94a3b8',
            textAlign: 'center',
            paddingBottom: 6,
            borderBottom: '1px solid rgba(51,65,85,0.6)',
            marginBottom: 8,
          }}
        >
          <span style={{ textAlign: 'left', paddingLeft: 2 }}>시간대</span>
          <span>롱</span>
          <span>숏</span>
          <span>바이어스</span>
        </div>

        {MOCKUP_TFS.map((tfKey) => {
          const tfNorm = normalizeChartTimeframe(String(tfKey));
          const row = mtfSignals.find((m) => normalizeChartTimeframe(m.tf) === tfNorm);
          const sticky =
            mtfBoardStickyByTf?.[tfNorm] ??
            mtfBoardStickyByTf?.[String(tfKey)] ??
            mtfBoardStickyByTf?.[tfKey as string];
          const b = row?.board ?? sticky;
          const lb = b?.lastBar;
          const sl = scoreLong(lb);
          const ss = scoreShort(lb);
          const longActive = sl >= ss && sl > 0;
          const shortActive = ss > sl && ss > 0;
          const v = String(row?.verdict || 'WATCH').toUpperCase();
          let biasLabel = '중립';
          let biasSub: string | null = null;
          let biasColor = '#94a3b8';
          let biasNeutral = true;
          if (v === 'LONG') {
            biasLabel = '롱 우세';
            biasSub = '▲';
            biasColor = '#4ade80';
            biasNeutral = false;
          } else if (v === 'SHORT') {
            biasLabel = '숏 우세';
            biasSub = '▼';
            biasColor = '#f87171';
            biasNeutral = false;
          }
          const isChartTf = normalizeChartTimeframe(tfKey) === chartTf;

          return (
            <div
              key={tfKey}
              style={{
                marginBottom: 10,
                padding: '8px 8px 10px',
                borderRadius: 10,
                background: isChartTf ? 'rgba(45,212,191,0.08)' : 'rgba(15,23,42,0.45)',
                border: isChartTf ? '1px solid rgba(45,212,191,0.28)' : '1px solid rgba(51,65,85,0.45)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 1fr 72px',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 11, color: isChartTf ? '#5eead4' : '#e2e8f0' }}>
                  {String(tfKey).toUpperCase()}
                  {isChartTf ? (
                    <span style={{ display: 'block', fontSize: 8, fontWeight: 600, color: '#64748b' }}>차트</span>
                  ) : null}
                </div>
                {bullCell(longActive, !longActive && !shortActive)}
                {bearCell(shortActive, !longActive && !shortActive)}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: biasNeutral ? 14 : 10,
                      fontWeight: 800,
                      color: biasColor,
                      lineHeight: 1.15,
                    }}
                    title={biasNeutral ? '방향성 중립' : undefined}
                  >
                    {biasNeutral ? '−' : biasLabel}
                  </div>
                  {!biasNeutral && biasSub ? (
                    <div style={{ fontSize: 11, color: biasColor, fontWeight: 800, marginTop: 1 }}>{biasSub}</div>
                  ) : null}
                  <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>{row?.confidence ?? '–'}%</div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 9,
                  color: '#94a3b8',
                  lineHeight: 1.4,
                  paddingLeft: 2,
                  borderTop: '1px solid rgba(51,65,85,0.35)',
                  paddingTop: 6,
                }}
              >
                {statusFromFlags(lb)}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: '8px 12px 12px',
          fontSize: 9,
          color: '#64748b',
          lineHeight: 1.35,
          borderTop: '1px solid rgba(51,65,85,0.45)',
        }}
      >
        <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>아이콘</div>
        🐂 롱 · 🐻 숏 · − 중립 · 테두리 강조 행 = 현재 차트 TF
      </div>
    </aside>
  );
}
