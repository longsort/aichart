'use client';

import type { MonthDeskStrikeDeskBundle, MonthDeskStrikeLeg } from '@/lib/monthDeskStrikeDesk';
import type { MonthDeskVisualTheme } from '@/lib/monthDeskVisualTheme';
import type { StrikeAiPhase } from '@/lib/monthDeskStrikeAiSignal';

type Props = {
  bundle: MonthDeskStrikeDeskBundle;
  theme: MonthDeskVisualTheme;
  symbol: string;
};

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

const PHASE_ACCENT: Record<StrikeAiPhase, string> = {
  hot: '#fde047',
  align: '#2dd4bf',
  scan: '#94a3b8',
  caution: '#f87171',
};

function ConfluenceGauge({ score, phase }: { score: number; phase: StrikeAiPhase }) {
  const accent = PHASE_ACCENT[phase];
  return (
    <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} viewBox="0 0 72 72">
        <defs>
          <linearGradient id="strikeAiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity={0.9} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <circle cx={36} cy={36} r={30} fill="none" stroke="rgba(51,65,85,0.5)" strokeWidth={6} />
        <circle
          cx={36}
          cy={36}
          r={30}
          fill="none"
          stroke="url(#strikeAiGrad)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 188.5} 188.5`}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 900, color: accent, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>confluence</span>
      </div>
    </div>
  );
}

function LegCard({
  leg,
  theme,
  active,
  aiConf,
  aiPhase,
  aiTag,
  chain,
}: {
  leg: MonthDeskStrikeLeg;
  theme: MonthDeskVisualTheme;
  active: boolean;
  aiConf?: number;
  aiPhase?: StrikeAiPhase;
  aiTag?: string;
  chain?: Array<{ icon: string; label: string; ok: boolean }>;
}) {
  const isLong = leg.side === 'LONG';
  const accent = isLong ? theme.long : theme.short;
  const phaseAccent = aiPhase ? PHASE_ACCENT[aiPhase] : accent;
  const hot = aiPhase === 'hot';

  return (
    <div
      className={hot ? 'month-desk-strike-leg--hot' : undefined}
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 14,
        border: active ? `2px solid ${phaseAccent}` : '2px solid rgba(71,85,105,0.45)',
        background: hot
          ? `linear-gradient(160deg, ${isLong ? 'rgba(22,101,52,0.35)' : 'rgba(127,29,29,0.35)'}, rgba(88,28,135,0.2))`
          : isLong
            ? 'rgba(22,101,52,0.18)'
            : 'rgba(127,29,29,0.18)',
        padding: '12px 14px',
        boxShadow: active
          ? `0 0 0 1px ${phaseAccent}44, 0 8px 24px ${phaseAccent}18`
          : 'none',
        transition: 'box-shadow 0.25s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: phaseAccent }}>
          {aiTag ?? (isLong ? '◆ 핵심 롱' : '◆ 핵심 숏')}
          {leg.strength === 'strong' ? ' ★' : ''}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            padding: '3px 9px',
            borderRadius: 999,
            background: 'rgba(15,23,42,0.7)',
            color: phaseAccent,
            border: `1px solid ${phaseAccent}44`,
          }}
        >
          {leg.statusKo}
          {aiConf != null ? ` · AI ${aiConf}` : ` · ${leg.score}점`}
        </span>
      </div>

      <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 8, lineHeight: 1.35 }}>{leg.headlineKo}</div>

      {chain && chain.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {chain.slice(0, 5).map((link) => (
            <span
              key={link.label}
              style={{
                fontSize: 8,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
                background: link.ok ? `${accent}22` : 'rgba(30,41,59,0.6)',
                color: link.ok ? accent : '#64748b',
                border: `1px solid ${link.ok ? `${accent}44` : 'rgba(71,85,105,0.35)'}`,
              }}
            >
              {link.icon} {link.label}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '54px 1fr',
          gap: '5px 10px',
          fontSize: 11,
          padding: '8px 10px',
          borderRadius: 10,
          background: 'rgba(15,23,42,0.45)',
          border: '1px solid rgba(51,65,85,0.35)',
        }}
      >
        <span style={{ color: theme.textMuted, fontWeight: 700 }}>타점 E</span>
        <span style={{ color: '#facc15', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{fmtPx(leg.entry)}</span>
        <span style={{ color: theme.textMuted, fontWeight: 700 }}>손절 SL</span>
        <span style={{ color: '#f87171', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtPx(leg.stopLoss)}</span>
        <span style={{ color: theme.textMuted, fontWeight: 700 }}>수익 TP1</span>
        <span style={{ color: '#86efac', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPx(leg.tp1)}</span>
        <span style={{ color: theme.textMuted, fontWeight: 700 }}>수익 TP2</span>
        <span style={{ color: '#7dd3fc', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPx(leg.tp2)}</span>
        <span style={{ color: theme.textMuted, fontWeight: 700 }}>수익 TP3</span>
        <span style={{ color: '#c4b5fd', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtPx(leg.tp3)}</span>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 8,
          fontSize: 9,
          color: theme.textMuted,
        }}
      >
        <span>R1≈{leg.rr1.toFixed(1)}</span>
        <span>R3≈{leg.rr3.toFixed(1)}</span>
        <span>리스크 {leg.riskPct.toFixed(2)}%</span>
        <span>목표 {leg.rewardPct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

/** 마감·안착 AI Strike Desk — zone·line 시그널 보드 */
export default function MonthDeskStrikeDesk({ bundle, theme, symbol }: Props) {
  const ai = bundle.ai;
  const phase = ai?.phase ?? 'scan';
  const phaseAccent = PHASE_ACCENT[phase];

  return (
    <section
      className="month-desk-strike-ai-board"
      style={{
        borderRadius: 16,
        border: `1px solid ${phaseAccent}55`,
        background: `linear-gradient(165deg, ${theme.bg}, rgba(15,23,42,0.92))`,
        padding: '14px 16px',
        marginBottom: 12,
        boxShadow: phase === 'hot' ? `0 0 32px ${phaseAccent}18` : '0 8px 24px rgba(0,0,0,0.25)',
      }}
      aria-label="AI Strike Desk"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          {ai && <ConfluenceGauge score={ai.confluence} phase={phase} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: theme.text, letterSpacing: '-0.02em' }}>
              AI Strike · Zone Line
            </div>
            <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 3 }}>
              {symbol} · {bundle.timeframe} · 종가 {fmtPx(bundle.close)}
            </div>
            {ai && (
              <div style={{ fontSize: 11, fontWeight: 700, color: phaseAccent, marginTop: 6, lineHeight: 1.35 }}>
                {ai.headlineKo}
              </div>
            )}
            {ai && (
              <div style={{ fontSize: 9, color: theme.textMuted, marginTop: 4, lineHeight: 1.4 }}>{ai.sublineKo}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {ai && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 900,
                padding: '5px 12px',
                borderRadius: 8,
                background:
                  phase === 'hot'
                    ? 'rgba(88,28,135,0.5)'
                    : bundle.primary === 'LONG'
                      ? 'rgba(34,197,94,0.2)'
                      : bundle.primary === 'SHORT'
                        ? 'rgba(248,113,113,0.2)'
                        : 'rgba(51,65,85,0.45)',
                color: phaseAccent,
                border: `1px solid ${phaseAccent}66`,
                whiteSpace: 'nowrap',
              }}
            >
              {ai.phaseKo} · {bundle.primaryKo}
            </span>
          )}
          {ai && (
            <span style={{ fontSize: 8, color: theme.textMuted }}>
              정렬 {ai.alignment > 0 ? `+${ai.alignment} 롱` : ai.alignment < 0 ? `${ai.alignment} 숏` : '중립'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {bundle.long ? (
          <LegCard
            leg={bundle.long}
            theme={theme}
            active={bundle.primary === 'LONG'}
            aiConf={ai?.long?.confluence}
            aiPhase={ai?.long?.phase}
            aiTag={ai?.long?.tagKo}
            chain={ai?.long?.chain}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 140, fontSize: 10, color: theme.textMuted, padding: 12 }}>롱 타점 없음</div>
        )}
        {bundle.short ? (
          <LegCard
            leg={bundle.short}
            theme={theme}
            active={bundle.primary === 'SHORT'}
            aiConf={ai?.short?.confluence}
            aiPhase={ai?.short?.phase}
            aiTag={ai?.short?.tagKo}
            chain={ai?.short?.chain}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 140, fontSize: 10, color: theme.textMuted, padding: 12 }}>숏 타점 없음</div>
        )}
      </div>

      <p style={{ fontSize: 9, color: theme.textMuted, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }}>
        AI zone·line·마감안착 체인 융합 참고 타점 — 확정 수익·투자 권유 아님. SL 이탈·가짜돌파 시 시나리오 재검토.
      </p>
    </section>
  );
}
