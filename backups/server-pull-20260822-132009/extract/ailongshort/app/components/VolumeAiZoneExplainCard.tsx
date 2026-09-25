'use client';

import type { VolumeAiExplainMetric, VolumeVerdictSide } from '@/lib/volumeAiZoneEngine';

type Props = {
  title: string;
  summary: string;
  subtitle: string;
  verdictSide: VolumeVerdictSide;
  verdictKo: string;
  verdictReasonKo: string;
  verdictStrength: number;
  invalidationKo: string;
  verdictColor: string;
  metrics: VolumeAiExplainMetric[];
  footnote: string;
  accent?: string;
  onClose: () => void;
};

function MetricRow({ m }: { m: VolumeAiExplainMetric }) {
  return (
    <div className={`volume-ai-explain__row volume-ai-explain__row--${m.tone}`}>
      <span className="volume-ai-explain__label">{m.label}</span>
      <span className="volume-ai-explain__sentence">{m.sentence}</span>
    </div>
  );
}

/** 거래량 구간 — 롱/숏/관망 확정 카드 */
export function VolumeAiZoneExplainCard({
  title,
  summary,
  subtitle,
  verdictSide,
  verdictKo,
  verdictReasonKo,
  verdictStrength,
  invalidationKo,
  verdictColor,
  metrics,
  footnote,
  accent,
  onClose,
}: Props) {
  const sideCls =
    verdictSide === 'LONG' ? 'long' : verdictSide === 'SHORT' ? 'short' : 'wait';

  return (
    <div
      className="volume-ai-explain"
      role="dialog"
      aria-label={title}
      style={accent ? { borderColor: `${accent}66` } : undefined}
    >
      <div className="volume-ai-explain__head">
        <div>
          <div className="volume-ai-explain__title">{title}</div>
          <div className="volume-ai-explain__sub">{subtitle}</div>
        </div>
        <button type="button" className="volume-ai-explain__close" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      <div
        className={`volume-ai-verdict volume-ai-verdict--${sideCls}`}
        style={{ borderColor: `${verdictColor}88`, background: `${verdictColor}18` }}
      >
        <div className="volume-ai-verdict__badge" style={{ color: verdictColor }}>
          {verdictSide === 'LONG' ? '롱' : verdictSide === 'SHORT' ? '숏' : '관망'}
        </div>
        <div className="volume-ai-verdict__main">
          <div className="volume-ai-verdict__ko">{verdictKo}</div>
          <div className="volume-ai-verdict__reason">{verdictReasonKo}</div>
          <div className="volume-ai-verdict__inv">{invalidationKo}</div>
        </div>
        <div className="volume-ai-verdict__score">{verdictStrength}점</div>
      </div>
      <div className="volume-ai-explain__body">
        {metrics
          .filter((m) => m.label !== '확정' && m.label !== '무효')
          .map((m) => (
            <MetricRow key={m.label} m={m} />
          ))}
      </div>
      <div className="volume-ai-explain__foot">{footnote}</div>
    </div>
  );
}
