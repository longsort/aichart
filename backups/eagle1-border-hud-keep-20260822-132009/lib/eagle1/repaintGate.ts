import type { Eagle1RepaintAudit } from '@/lib/eagle1/repaintAudit';

export type Eagle1RepaintGate = {
  confirmedSignalBlocked: boolean;
  code: 'ok' | 'REPAINT_AUDIT_FAIL';
  reason: string;
};

export function evaluateRepaintGate(audit: Eagle1RepaintAudit | null | undefined): Eagle1RepaintGate {
  if (!audit) {
    return {
      confirmedSignalBlocked: false,
      code: 'ok',
      reason: '리페인트 감사 파일 없음 — 런타임 causal 검사만 사용',
    };
  }
  if (!audit.passed || audit.confirmedSignalBlocked) {
    return {
      confirmedSignalBlocked: true,
      code: 'REPAINT_AUDIT_FAIL',
      reason: audit.failures.join('; ') || 'REPAINT_AUDIT_FAIL',
    };
  }
  return { confirmedSignalBlocked: false, code: 'ok', reason: 'ok' };
}
