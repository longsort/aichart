'use client';

import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { StrikeAiPhase } from '@/lib/monthDeskStrikeAiSignal';

type Props = {
  bundle: MonthDeskStrikeDeskBundle;
  collapsed?: boolean;
  onToggle?: () => void;
};

function fmt(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

const PHASE_STYLE: Record<
  StrikeAiPhase,
  { bg: string; border: string; color: string; glow: string }
> = {
  hot: {
    bg: 'rgba(88,28,135,0.55)',
    border: 'rgba(253,224,71,0.75)',
    color: '#fde047',
    glow: '0 0 24px rgba(250,204,21,0.35)',
  },
  align: {
    bg: 'rgba(15,118,110,0.35)',
    border: 'rgba(45,212,191,0.55)',
    color: '#5eead4',
    glow: '0 0 16px rgba(45,212,191,0.2)',
  },
  scan: {
    bg: 'rgba(30,41,59,0.65)',
    border: 'rgba(100,116,139,0.45)',
    color: '#94a3b8',
    glow: 'none',
  },
  caution: {
    bg: 'rgba(127,29,29,0.4)',
    border: 'rgba(248,113,113,0.55)',
    color: '#fca5a5',
    glow: '0 0 14px rgba(248,113,113,0.25)',
  },
};

function ConfluenceRing({ score, phase }: { score: number; phase: StrikeAiPhase }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const style = PHASE_STYLE[phase];
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
      <circle cx={22} cy={22} r={r} fill="none" stroke="rgba(51,65,85,0.6)" strokeWidth={4} />
      <circle
        cx={22}
        cy={22}
        r={r}
        fill="none"
        stroke={style.color}
        strokeWidth={4}
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
        style={{ filter: phase === 'hot' ? 'drop-shadow(0 0 4px rgba(250,204,21,0.6))' : undefined }}
      />
      <text x={22} y={24} textAnchor="middle" fontSize={11} fontWeight={900} fill={style.color}>
        {score}
      </text>
    </svg>
  );
}

function miniLeg(
  label: string,
  leg: NonNullable<MonthDeskStrikeDeskBundle['long']>,
  accent: string,
  active: boolean,
  aiConf?: number,
  aiTag?: string
) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '7px 9px',
        borderRadius: 9,
        border: active ? `1px solid ${accent}` : '1px solid rgba(51,65,85,0.55)',
        background: active
          ? `linear-gradient(135deg, ${accent}22, rgba(15,23,42,0.55))`
          : 'rgba(15,23,42,0.5)',
        boxShadow: active ? `0 0 12px ${accent}22` : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: accent }}>{label}</span>
        {aiTag && (
          <span style={{ fontSize: 7, fontWeight: 800, color: accent, opacity: 0.9 }}>{aiTag}</span>
        )}
      </div>
      <div style={{ fontSize: 8, color: '#94a3b8', lineHeight: 1.5, marginTop: 4 }}>
        E <span style={{ color: '#facc15', fontWeight: 800 }}>{fmt(leg.entry)}</span>
        {aiConf != null && (
          <span style={{ color: '#a78bfa', marginLeft: 4 }}>· {aiConf}</span>
        )}
        <br />
        SL <span style={{ color: '#f87171' }}>{fmt(leg.stopLoss)}</span>
        <br />
        TP{' '}
        <span style={{ color: '#86efac' }}>{fmt(leg.tp1)}</span>
        <span style={{ color: '#64748b' }}> / </span>
        <span style={{ color: '#7dd3fc' }}>{fmt(leg.tp2)}</span>
        <span style={{ color: '#64748b' }}> / </span>
        <span style={{ color: '#c4b5fd' }}>{fmt(leg.tp3)}</span>
      </div>
    </div>
  );
}

/** 차트 우상단 — AI Strike zone·line 시그널 HUD */
export function MonthDeskStrikeChartHud({ bundle, collapsed, onToggle }: Props) {
  const ai = bundle.ai;
  const phase = ai?.phase ?? 'scan';
  const style = PHASE_STYLE[phase];
  const longAccent = '#4ade80';
  const shortAccent = '#f87171';

  return (
    <div
      className="month-desk-strike-ai-hud"
      style={{
        position: 'absolute',
        right: 10,
        top: 10,
        zIndex: 2490,
        maxWidth: 'min(92vw, 340px)',
        pointerEvents: onToggle ? 'auto' : 'none',
        padding: collapsed ? '6px 10px' : '10px 12px',
        borderRadius: 12,
        border: `1px solid ${style.border}`,
        background: 'linear-gradient(145deg, rgba(6,12,24,0.96), rgba(15,23,42,0.92))',
        boxShadow: `0 10px 28px rgba(0,0,0,0.5), ${style.glow}`,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!collapsed && ai && <ConfluenceRing score={ai.confluence} phase={phase} />}
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, color: style.color, letterSpacing: '0.04em' }}>
              AI Strike · Zone Line
            </div>
            <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>
              {bundle.timeframe} · {bundle.primaryKo}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {ai && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 900,
                padding: '3px 8px',
                borderRadius: 999,
                background: style.bg,
                color: style.color,
                border: `1px solid ${style.border}`,
              }}
            >
              {ai.phaseKo}
            </span>
          )}
          {onToggle && (
            <button
              type="button"
              className="tool-chip tool-chip-button"
              style={{ fontSize: 8, padding: '2px 6px' }}
              onClick={onToggle}
            >
              {collapsed ? '+' : '−'}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {ai && (
            <div style={{ fontSize: 9, fontWeight: 700, color: '#e2e8f0', marginTop: 8, lineHeight: 1.35 }}>
              {ai.headlineKo}
            </div>
          )}
          {ai && ai.chain.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {ai.chain.map((link) => (
                <span
                  key={link.label}
                  style={{
                    fontSize: 7,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: link.ok ? 'rgba(34,197,94,0.18)' : 'rgba(51,65,85,0.5)',
                    color: link.ok ? '#86efac' : '#64748b',
                    border: `1px solid ${link.ok ? 'rgba(74,222,128,0.35)' : 'rgba(71,85,105,0.4)'}`,
                  }}
                >
                  {link.icon} {link.label}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {bundle.long &&
              miniLeg(
                '롱',
                bundle.long,
                longAccent,
                bundle.primary === 'LONG',
                ai?.long?.confluence,
                ai?.long?.tagKo
              )}
            {bundle.short &&
              miniLeg(
                '숏',
                bundle.short,
                shortAccent,
                bundle.primary === 'SHORT',
                ai?.short?.confluence,
                ai?.short?.tagKo
              )}
          </div>
          <div style={{ fontSize: 7, color: '#475569', marginTop: 8, lineHeight: 1.4 }}>
            AI zone·line·안착 융합 · 참고용 조건부 분석
          </div>
        </>
      )}
    </div>
  );
}
