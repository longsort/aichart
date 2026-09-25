/**
 * 기관밴드 스캘프 A안 — 손절 8% · 익절 8% ROE (구 TP15는 8로).
 * 확정 수익 아님.
 */
import {
  defaultCoinSkillRisk,
  writeCoinSkillRiskMap,
  type AutoTradeCoinKey,
  type CoinSkillRiskMap,
} from '@/lib/mergedDeskCoinSkillRisk';
import {
  readAutoTradeConfig,
  writeAutoTradeConfig,
  AUTO_TRADE_SYMBOL_OPTIONS,
} from '@/lib/mergedDeskAutoTradeConfig';
import { writeTapointModeConfig } from '@/lib/eagle1Tapoint/config';
import { saveSettings, sessionScopedStorageKey } from '@/lib/settings';
import { syncServerArm } from '@/lib/mergedDeskServerArmClient';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import {
  INST_BAND_SCALP_A_LEV,
  INST_BAND_SCALP_A_SL_ROE,
  INST_BAND_SCALP_A_TP1_ROE,
  INST_BAND_SCALP_A_TAG,
  resolveInstBandATp1RoePct,
} from '@/lib/eagle1Tapoint/institutionalBandTapPlan';

export {
  INST_BAND_SCALP_A_TP1_ROE,
  INST_BAND_SCALP_A_SL_ROE,
  INST_BAND_SCALP_A_LEV,
  INST_BAND_SCALP_A_TAG,
};

const COINS: AutoTradeCoinKey[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];

/**
 * 타점엔진 기동 시 A안 기본값을 칩·스킬·서버 ARM에 반영.
 */
export async function applyInstBandScalpADefaults(opts?: {
  forceAllChipsOn?: boolean;
}): Promise<{ ok: boolean; noteKo: string }> {
  if (typeof window === 'undefined') {
    return { ok: false, noteKo: '브라우저 전용' };
  }

  try {
    const bootKey = sessionScopedStorageKey('ailongshort.eagle1Tapoint.aDefaults.boot.v1');
    if (window.sessionStorage.getItem(bootKey) === '1') {
      return { ok: true, noteKo: '기관밴드A · 세션유지' };
    }
    window.sessionStorage.setItem(bootKey, '1');
  } catch {
    /* ignore */
  }

  saveSettings({
    chartMergedInstitutionalBandEnabled: true,
    tapointSharedInstitutionalBand2Enabled: true,
  });
  try {
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }

  writeTapointModeConfig({
    enabled: true,
    autoExecute: true,
    tapOnly: true,
    confirmAlertOn: true,
  });

  const prev = readAutoTradeConfig();
  const syms = AUTO_TRADE_SYMBOL_OPTIONS.map((o) => o.id);
  writeAutoTradeConfig({
    enabled: true,
    liveArmed: true,
    strategyScalp: false,
    aiZoneDriveEnabled: false,
    enabledSymbols: opts?.forceAllChipsOn === false ? prev.enabledSymbols : syms,
    scalpTp1RoePct: resolveInstBandATp1RoePct(INST_BAND_SCALP_A_TP1_ROE),
    scalpSlRoePct: INST_BAND_SCALP_A_SL_ROE,
    leverage: Math.max(
      10,
      Math.min(125, Number(prev.leverage) || INST_BAND_SCALP_A_LEV)
    ),
  });

  const map: CoinSkillRiskMap = {};
  for (const coin of COINS) {
    const d = defaultCoinSkillRisk(coin);
    map[coin] = {
      ...d,
      tp1RoePct: resolveInstBandATp1RoePct(INST_BAND_SCALP_A_TP1_ROE),
      slRoePct: INST_BAND_SCALP_A_SL_ROE,
      leverage: Math.max(d.leverage, 10),
      updatedAt: Date.now(),
    };
  }
  writeCoinSkillRiskMap(map);

  try {
    await fetch('/api/merged-desk/coin-skill-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ risks: map }),
    });
  } catch {
    /* 서버 스킬 동기화 실패해도 로컬은 적용 */
  }

  await syncServerArm(readAutoTradeConfig());

  return {
    ok: true,
    noteKo: `기관밴드A · TP${INST_BAND_SCALP_A_TP1_ROE}% / SL${INST_BAND_SCALP_A_SL_ROE}%ROE · 밴드1·2 ON · 자동실행·ARM`,
  };
}
