/**
 * 텔레그램 자동 발송 정책 — 테스트 전송과 별개.
 * 서버 크론(`/api/cron/telegram-auto-alert`) 한 소스.
 * 확정 수익·자동주문 아님. 후보(candidate)는 보내지 않음.
 */
import type { UserSettings } from '@/lib/settings';
import type { ConfirmNotifyKind } from '@/lib/tradeConfirmDesk';
import type { TelegramMergedDeskEval } from '@/lib/telegramServerMergedDeskEval';
import { MERGED_DESK_AUTO_ALERT_TFS } from '@/lib/telegramServerMergedDeskEval';

export type TelegramSendPolicy = {
  masterOn: boolean;
  /** 플랜 ENTER · 자리 대기 */
  planEnter: boolean;
  /** E 접촉 · ★타점 · 돌파안착 */
  atEntry: boolean;
  tpHit: boolean;
  invalid: boolean;
  hqTouch: boolean;
  newsSkipEnter: boolean;
  requireEntryAllowed: boolean;
  requireMasterUnlock: boolean;
  chartImage: boolean;
};

const ENTER_KINDS = new Set<ConfirmNotifyKind>(['confirmed', 'confirmed_full', 'at_entry']);

export function readTelegramSendPolicy(s: UserSettings): TelegramSendPolicy {
  return {
    masterOn: s.telegramMergedDeskAutoEnabled !== false,
    planEnter: s.telegramSendPlanEnterEnabled !== false,
    atEntry: s.telegramSendAtEntryEnabled !== false,
    tpHit: s.telegramSendTpHitEnabled !== false,
    invalid: s.telegramSendInvalidEnabled !== false,
    hqTouch: s.telegramHqZoneTouchEnabled === true,
    newsSkipEnter: s.telegramSendNewsSkipEnter !== false,
    requireEntryAllowed: s.telegramSendRequireEntryAllowed !== false,
    requireMasterUnlock: s.telegramSendRequireMasterUnlock !== false,
    chartImage: s.telegramConfirmChartImageEnabled !== false,
  };
}

export function isTelegramMergedAutoTf(tf: string): boolean {
  return MERGED_DESK_AUTO_ALERT_TFS.has(String(tf || '').toLowerCase());
}

function enterGatesOk(ev: TelegramMergedDeskEval, policy: TelegramSendPolicy): boolean {
  if (policy.newsSkipEnter && ev.newsBlocked) return false;
  if (policy.requireEntryAllowed) {
    const at = ev.pack.activeTradePlan;
    if (at && (at.direction === 'LONG' || at.direction === 'SHORT')) {
      if (!at.entryAllowed || at.status === 'WAIT' || at.status === 'INVALID') return false;
    } else if (!ev.swing.stance.startsWith('ENTER')) {
      return false;
    }
  }
  if (policy.requireMasterUnlock) {
    const m = ev.pack.masterFutures;
    if (m && m.entryAllowed === false) return false;
  }
  return true;
}

/** detect 이후 — 설정·게이트로 ENTER류/무효만 통과. 후보는 항상 차단. */
export function applyTelegramSendPolicyToConfirmKind(
  kind: ConfirmNotifyKind | null,
  ev: TelegramMergedDeskEval,
  policy: TelegramSendPolicy
): ConfirmNotifyKind | null {
  if (!kind || kind === 'candidate') return null;
  if (kind === 'invalid') return policy.invalid ? kind : null;
  if (kind === 'confirmed') {
    if (!policy.planEnter) return null;
    return enterGatesOk(ev, policy) ? kind : null;
  }
  if (kind === 'confirmed_full' || kind === 'at_entry') {
    if (!policy.atEntry) return null;
    return enterGatesOk(ev, policy) ? kind : null;
  }
  return null;
}

export function telegramSendPolicySummaryKo(p: TelegramSendPolicy): string {
  if (!p.masterOn) return '통합텔레 OFF';
  const bits = [
    p.planEnter ? 'ENTER' : null,
    p.atEntry ? '타점/안착' : null,
    p.tpHit ? 'TP' : null,
    p.invalid ? '무효' : null,
    p.hqTouch ? 'HQ터치' : null,
  ].filter(Boolean);
  return `15m↑ · ${bits.join('·') || '조건없음'}${p.newsSkipEnter ? ' · 뉴스창스킵' : ''}`;
}
