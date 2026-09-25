'use client';

import type { BreakoutFollowChain } from '@/lib/breakoutFollowChain';

type Props = {
  chain: BreakoutFollowChain | null | undefined;
};

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

export function BreakoutFollowHud({ chain }: Props) {
  if (!chain || chain.phase === 'idle') return null;

  const accent =
    chain.bias === 'LONG' ? '#4ade80' : chain.bias === 'SHORT' ? '#f87171' : '#fcd34d';

  return (
    <div
      className="breakout-follow-hud"
      style={{
        position: 'absolute',
        left: '50%',
        top: 8,
        transform: 'translateX(-50%)',
        zIndex: 2510,
        maxWidth: 'min(92%, 520px)',
        pointerEvents: 'none',
        fontSize: 10,
        lineHeight: 1.35,
        color: '#e2e8f0',
        background: 'rgba(8,12,24,0.88)',
        border: `1px solid ${accent}55`,
        borderRadius: 8,
        padding: '6px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}
      title={[chain.headlineKo, chain.actionLineKo, chain.oppositeLineKo, ...chain.bullets].join('\n')}
    >
      <div style={{ fontWeight: 800, color: accent, marginBottom: 3 }}>{chain.headlineKo}</div>
      <div style={{ opacity: 0.95 }}>{chain.actionLineKo}</div>
      {chain.upPath.length > 0 && (
        <div style={{ marginTop: 4, color: '#86efac' }}>
          ↑{' '}
          {chain.upPath.map((n) => `${n.labelKo} ${fmt(n.price)}`).join(' → ')}
        </div>
      )}
      {chain.downPath.length > 0 && (
        <div style={{ marginTop: 2, color: '#fca5a5' }}>
          ↓{' '}
          {chain.downPath.map((n) => `${n.labelKo} ${fmt(n.price)}`).join(' → ')}
        </div>
      )}
      {chain.narrativeLlm && (
        <div style={{ marginTop: 4, fontSize: 9, color: '#cbd5e1', fontStyle: 'italic' }}>
          {chain.narrativeLlm}
        </div>
      )}
    </div>
  );
}
