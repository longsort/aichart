'use client';

import type { MergedDeskAssetsSuperAiBrief } from '@/lib/mergedDeskAssetsSuperAi';

type Props = {
  brief: MergedDeskAssetsSuperAiBrief;
  onClose?: () => void;
};

export function MergedDeskAssetsSuperAiHud({ brief, onClose }: Props) {
  const dirClass =
    brief.direction === 'LONG'
      ? 'merged-desk-super-ai-hud__verdict--long'
      : brief.direction === 'SHORT'
        ? 'merged-desk-super-ai-hud__verdict--short'
        : 'merged-desk-super-ai-hud__verdict--wait';

  const dirLabel =
    brief.direction === 'LONG' ? '▲ LONG' : brief.direction === 'SHORT' ? '▼ SHORT' : '◆ WAIT';

  return (
    <div className="merged-desk-super-ai-hud" role="status" aria-label="Super AI 롱숏 분석">
      <div className="merged-desk-super-ai-hud__head">
        <span className="merged-desk-super-ai-hud__badge">353 AI</span>
        <span className="merged-desk-super-ai-hud__conf">{brief.confidencePct}%</span>
        {onClose && (
          <button type="button" className="merged-desk-super-ai-hud__close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        )}
      </div>

      <div className={`merged-desk-super-ai-hud__verdict ${dirClass}`}>{dirLabel}</div>
      <div className="merged-desk-super-ai-hud__vote">
        롱 {brief.longPct}% · 숏 {brief.shortPct}% · 격차 {brief.edgePct}%
      </div>

      <div className="merged-desk-super-ai-hud__title">{brief.headlineKo}</div>
      <div className="merged-desk-super-ai-hud__stat">
        assets {brief.catalogTotal}장 · {brief.matchedAllCount}개 일치 · 플레이북 {brief.verdict.topPlaybookLabel} · zone {brief.fusedZoneCount}
      </div>
      <ul className="merged-desk-super-ai-hud__list">
        {brief.adaptiveLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {brief.invalidationKo && (
        <div className="merged-desk-super-ai-hud__inval">{brief.invalidationKo}</div>
      )}
      {brief.topRefs.length > 0 && (
        <div className="merged-desk-super-ai-hud__refs">
          {brief.topRefs.slice(0, 3).map((r) => (
            <span key={r.id} className="merged-desk-super-ai-hud__ref-chip" title={r.reasonKo}>
              {r.titleKo}
            </span>
          ))}
        </div>
      )}
      <div className="merged-desk-super-ai-hud__foot">353자료+캔들 · 조건부 참고 · 확정 수익 아님</div>
    </div>
  );
}
