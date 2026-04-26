'use client';

import type { AnalyzeResponse } from '@/types';

type Hint = { icon: string; title: string; text: string };

function hintsFromSummary(summary: string): Hint[] {
  const s = summary.trim();
  if (!s) return [];
  const out: Hint[] = [];
  const push = (h: Hint) => {
    if (!out.some((x) => x.title === h.title)) out.push(h);
  };
  if (/🚀|강력\s*매수|강한\s*매수|강세\s*추세/i.test(s)) {
    push({
      icon: '🚀',
      title: '강한 상승 톤',
      text: '요약이 강한 상승·추세 쪽으로 기울어 있습니다. 리스크·손절 규칙은 그대로 적용하세요.',
    });
  }
  if (/📉|조정|눌림|되돌림/i.test(s)) {
    push({
      icon: '📉',
      title: '조정·눌림 가능성',
      text: '단기 하락·조정을 말하는 경우가 많습니다. 추격 진입보다 구간·무효화 가격을 먼저 확인하세요.',
    });
  }
  if (/🌤|기술적\s*반등|반등/i.test(s)) {
    push({
      icon: '🌤',
      title: '기술적 반등',
      text: '하락 추세 속 단기 반등일 수 있습니다. 추격보다 관망·청산 검토 비중이 큽니다.',
    });
  }
  if (/🌊|급락|하락세|붕괴|현금/i.test(s)) {
    push({
      icon: '🌊',
      title: '약화·하방 톤',
      text: '다 시간대 약화 서술일 수 있습니다. 포지션 크기·관망을 검토합니다.',
    });
  }
  if (/💤|횡보|혼조|방향\s*없|명확한\s*방향이\s*없/i.test(s)) {
    push({
      icon: '💤',
      title: '횡보·혼조',
      text: '방향성이 낮다는 뜻으로 읽는 경우가 많습니다. 과매매·추격을 줄입니다.',
    });
  }
  return out.slice(0, 4);
}

export default function AiAnalysisLineHints({ analysis }: { analysis: AnalyzeResponse | null }) {
  const summary = (analysis?.summary || '').trim();
  const hints = hintsFromSummary(summary);
  if (!hints.length) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid rgba(148,163,184,0.28)',
        background: 'rgba(2,6,23,0.55)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', marginBottom: 8, letterSpacing: '0.04em' }}>
        AI 요약 힌트 (키워드 기반)
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.5, color: '#e2e8f0' }}>
        {hints.map((h) => (
          <li key={h.title} style={{ marginBottom: 8 }}>
            <span style={{ marginRight: 6 }}>{h.icon}</span>
            <strong style={{ color: '#cbd5e1' }}>{h.title}</strong>
            {' — '}
            {h.text}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 8, fontSize: 9, color: '#64748b' }}>
        요약 문구가 바뀌면 힌트도 달라질 수 있습니다. 참고용이며 확정 신호가 아닙니다.
      </div>
    </div>
  );
}
