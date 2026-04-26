import { SETTINGS_CHANGED_EVENT } from './useSettingsChangeTick';
import { DEFAULT_PARKF_TRENDLINE_COLORS } from './chartHexColor';
import type { ParkfTrendlineOpts } from './parkfLinregTrendlineEngine';
import type { AiCompressionPresetId } from './aiCompressionPresets';
import type { EternyMacdAdxHistogramMode } from './eternyMacdAdxPro';

const KEY = 'ailongshort-settings';
const USER_KEY = 'ailongshort-briefing-user';
const BACKUP_KEY = 'ailongshort-settings-backup';
const LAST_GOOD_KEY = 'ailongshort-settings-last-good';

function currentSettingsKey(): string {
  if (typeof window === 'undefined') return KEY;
  const u = (window.localStorage.getItem(USER_KEY) || '').trim().toLowerCase();
  return u ? `${KEY}::${u}` : KEY;
}

function scopedKey(base: string): string {
  if (typeof window === 'undefined') return base;
  const u = (window.localStorage.getItem(USER_KEY) || '').trim().toLowerCase();
  return u ? `${base}::${u}` : base;
}

function readStoredSettingsCandidate(keys: string[]): Partial<UserSettings> | null {
  if (typeof window === 'undefined') return null;
  for (const k of keys) {
    try {
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // ignore broken candidate and continue
    }
  }
  return null;
}

export type UIMode =
  | 'FULL'
  | 'FOCUS'
  | 'EXECUTION'
  | 'SMART'
  /**
   * 최강분석: 차트는 FULL과 동일 전체 오버레이 + 레이어·고래 부가 표시 전부 ON, 분석 요청은 amx(수집) ON.
   * 엔진 로직 변경 없음 — 보이는 것·API 쿼리만 극대화.
   */
  | 'MAX_ANALYSIS'
  /**
   * 통합작도: 캔들분석 작도 레이어 + 스마트/실행형 엔진 병합을 한 화면.
   * `/api/analyze`·amx·레이어 프리셋은 최강분석과 동일(잡음 기본 OFF) — 배치만 TV·작도식.
   */
  | 'UNIFIED_DESK'
  /** AI 분석(AI_ZONE): 합성(최강) 엔진 수집 + 고래 툴킷(핫존·핵심 S/R·DRS·LQB 등) + AI 요약·사다리 브리핑 */
  | 'AI_ZONE'
  | 'CANDLE_ANALYSIS'
  /** Bible mode: textbook-style candle pattern callouts merged with execution-style engine overlays. */
  | 'BIBLE_MODE'
  /**
   * 눌림(핫존) 작도: 피보·눌림 매수 존·TP/SL·예상 파동·핀바/거래량 참고 오버레이.
   * 교육·시각화용 — 엔진 시그널과 별개 근사.
   */
  | 'HOT_ZONE'
  | 'TAPPOINT'
  | 'EVOLUTION'
  | 'WHALE'
  /**
   * SMC 통합: 최강분석·하모닉·고래 툴킷을 한 프리셋 — `/api/analyze`는 amx=1(최강분석과 동일 수집).
   */
  | 'SMC_DESK'
  /**
   * SMC 데스크 · 합성: SMC_DESK와 동일 차트·수집(amx) — 우측 합성 패널(컨플루언스·시나리오·플랜·MTF·워치·리플레이 근사).
   */
  | 'SMC_DESK_COMPOSITE'
  /**
   * SMC 데스크 · 델타집중: 합성작도/Δ만 기본 노출, 기존 SMC 레이어는 사용자가 원할 때만 표시.
   */
  | 'SMC_DELTA_DESK'
  /**
   * 세력·고래·상승시작 MVP: 기존 레이어는 잠금, 전용 점수·진입/SL/TP 오버레이만 표시.
   */
  | 'SMART_MONEY_MVP';

/** 화면 고정(fixed) 패널 좌표(px) */
export type PageLayoutPoint = { left: number; top: number };

/**
 * 메인 페이지(헤더·MTF·차트 카드·우측 패널) 표시/배치.
 * Windows·모바일 공용 — 터치 드래그로 이동 가능한 플로팅 모드 포함.
 */
export type PageLayoutSettings = {
  /** 상단 "AI 트레이더" 제목 블록 */
  showPageTitle: boolean;
  /** 상단 툴바(로그아웃·심볼·뱃지 등) 전체 */
  showMainToolbar: boolean;
  /** 툴바를 본문 흐름이 아닌 화면 고정 + 드래그 이동 */
  mainToolbarFloat: boolean;
  /** 플로팅 툴바 위치. null이면 기본 좌상단 근처 */
  mainToolbarPos: PageLayoutPoint | null;
  showGroupAccount: boolean;
  showGroupThemeAlerts: boolean;
  showGroupSymbol: boolean;
  showGroupStatus: boolean;
  showMtfStrip: boolean;
  mtfStripFloat: boolean;
  mtfStripPos: PageLayoutPoint | null;
  /** 차트 카드 상단 제목·엔진 뱃지 줄 */
  showChartCardHeader: boolean;
  /** 우측 AI·탭 패널 전체 */
  showRightPanel: boolean;
};

export const defaultPageLayout: PageLayoutSettings = {
  showPageTitle: true,
  showMainToolbar: true,
  mainToolbarFloat: false,
  mainToolbarPos: null,
  showGroupAccount: true,
  showGroupThemeAlerts: true,
  showGroupSymbol: true,
  showGroupStatus: true,
  showMtfStrip: true,
  mtfStripFloat: false,
  mtfStripPos: null,
  showChartCardHeader: true,
  showRightPanel: true,
};

export function mergePageLayout(raw: Partial<PageLayoutSettings> | null | undefined): PageLayoutSettings {
  const d = defaultPageLayout;
  if (!raw || typeof raw !== 'object') return { ...d };
  const pointOr = (p: unknown, fallback: PageLayoutPoint | null): PageLayoutPoint | null => {
    if (p === null) return null;
    if (!p || typeof p !== 'object') return fallback;
    const o = p as { left?: unknown; top?: unknown };
    if (typeof o.left === 'number' && typeof o.top === 'number' && Number.isFinite(o.left) && Number.isFinite(o.top)) {
      return { left: o.left, top: o.top };
    }
    return fallback;
  };
  return {
    showPageTitle: typeof raw.showPageTitle === 'boolean' ? raw.showPageTitle : d.showPageTitle,
    showMainToolbar: typeof raw.showMainToolbar === 'boolean' ? raw.showMainToolbar : d.showMainToolbar,
    mainToolbarFloat: typeof raw.mainToolbarFloat === 'boolean' ? raw.mainToolbarFloat : d.mainToolbarFloat,
    mainToolbarPos: raw.mainToolbarPos !== undefined ? pointOr(raw.mainToolbarPos, d.mainToolbarPos) : d.mainToolbarPos,
    showGroupAccount: typeof raw.showGroupAccount === 'boolean' ? raw.showGroupAccount : d.showGroupAccount,
    showGroupThemeAlerts: typeof raw.showGroupThemeAlerts === 'boolean' ? raw.showGroupThemeAlerts : d.showGroupThemeAlerts,
    showGroupSymbol: typeof raw.showGroupSymbol === 'boolean' ? raw.showGroupSymbol : d.showGroupSymbol,
    showGroupStatus: typeof raw.showGroupStatus === 'boolean' ? raw.showGroupStatus : d.showGroupStatus,
    showMtfStrip: typeof raw.showMtfStrip === 'boolean' ? raw.showMtfStrip : d.showMtfStrip,
    mtfStripFloat: typeof raw.mtfStripFloat === 'boolean' ? raw.mtfStripFloat : d.mtfStripFloat,
    mtfStripPos: raw.mtfStripPos !== undefined ? pointOr(raw.mtfStripPos, d.mtfStripPos) : d.mtfStripPos,
    showChartCardHeader: typeof raw.showChartCardHeader === 'boolean' ? raw.showChartCardHeader : d.showChartCardHeader,
    showRightPanel: typeof raw.showRightPanel === 'boolean' ? raw.showRightPanel : d.showRightPanel,
  };
}

/** 기관밴드 접촉 마커 — A/B/C 등급별 독립 표시(다중 선택) */
export type InstitutionalBandTouchTierMask = { A: boolean; B: boolean; C: boolean };

export function tierMaskFromMinTier(min: 'A' | 'B' | 'C'): InstitutionalBandTouchTierMask {
  if (min === 'A') return { A: true, B: false, C: false };
  if (min === 'B') return { A: true, B: true, C: false };
  return { A: true, B: true, C: true };
}

/** 예전 단일 `institutionalBandTouchMinTier` 필드와 근사 동기화(호환·내보내기) */
export function institutionalBandTouchMinTierFromMask(m: InstitutionalBandTouchTierMask): 'A' | 'B' | 'C' {
  if (m.C) return 'C';
  if (m.B) return 'B';
  if (m.A) return 'A';
  return 'C';
}

/** 저장·병합 후 항상 A/B/C 세 키가 boolean으로만 유지되게 함(다중 터치 등급 독립 유지) */
export function coerceInstitutionalBandTouchTierMask(merged: UserSettings): void {
  const tm = merged.institutionalBandTouchTierMask;
  if (tm && typeof tm === 'object') {
    merged.institutionalBandTouchTierMask = {
      A: tm.A === true,
      B: tm.B === true,
      C: tm.C === true,
    };
  } else {
    merged.institutionalBandTouchTierMask = tierMaskFromMinTier(
      merged.institutionalBandTouchMinTier === 'A' ||
        merged.institutionalBandTouchMinTier === 'B' ||
        merged.institutionalBandTouchMinTier === 'C'
        ? merged.institutionalBandTouchMinTier
        : 'B',
    );
  }
}

/** 모드별 기능 ON/OFF 오버라이드. 없으면 전역 show* 사용 */
export type ModeFeatureOverrides = Partial<Record<UIMode, Partial<{
  showStructure: boolean;
  showZones: boolean;
  showLabels: boolean;
  showScenario: boolean;
  showFib: boolean;
  showRsi: boolean;
  showHarmonic: boolean;
  /** ChartPrime 스타일 피벗 트렌드 채널 + 유동성(LV/MV/HV) 브레이크 라벨 */
  showChartPrimeTrendChannels: boolean;
  showPo3: boolean;
  showCandle: boolean;
  showBpr: boolean;
  showVision: boolean;
  showVisionTriangle: boolean;
  showVisionFlag: boolean;
  showVisionWedge: boolean;
  showVisionReversal: boolean;
  showVisionRange: boolean;
  showReactionZone: boolean;
  showWhaleZone: boolean;
  showLvrb: boolean;
  showVolatilityTrendScore: boolean;
  /** 타이롱식 봉마감 신호(돌파·장대·꼬리·흐름) — 캔들 패턴과 별도 토글 */
  showTailongClose: boolean;
  showTailongCloseBreakout: boolean;
  showTailongCloseWick: boolean;
  showTailongCloseBody: boolean;
  showTailongCloseFlow: boolean;
  /** WHALE 확장: 정밀 진입 합의 점수(충돌 억제) */
  whalePrecisionEntryEnabled: boolean;
  /** WHALE 확장: 정밀 점수 통과 신호만 자동 알림 */
  whalePrecisionAlertEnabled: boolean;
  /** 고래 모드: 세트 구조·반등 경로(가로선 + 요약) 표시 */
  whaleStructureBounceEnabled?: boolean;
  /** ChartPrime 채널 바깥 면 거래량 연동 — 모드별로 다르게 둘 수 있음 */
  chartPrimeTrendChannelsVolumeBg?: boolean;
}>>>;

export type UserSettings = {
  theme: 'dark' | 'light';
  showStructure: boolean;
  showZones: boolean;
  showLabels: boolean;
  showScenario: boolean;
  showFib: boolean;
  showRsi: boolean;
  showHarmonic: boolean;
  /** ChartPrime 스타일 피벗 트렌드 채널 + 유동성(LV/MV/HV) 브레이크 라벨 */
  showChartPrimeTrendChannels: boolean;
  /** ChartPrime 채널 바깥 면: 거래량 정규화에 따른 색(Pine Volume BG) — /api/analyze에 cpVolBg로 전달(모드 오버라이드 없을 때 기본) */
  chartPrimeTrendChannelsVolumeBg: boolean;
  /** Pine Length — 피벗 좌우 봉 수 (2~30) */
  chartPrimeTrendChannelsLength: number;
  /** true면 Length 대신 ATR%·TF 기반 자동 피벗 길이 */
  chartPrimeTrendChannelsAutoLength: boolean;
  /** Pine Wait for Break */
  chartPrimeTrendChannelsWait: boolean;
  /** Pine Extend Line */
  chartPrimeTrendChannelsExtend: boolean;
  /** Pine Show Last Channel (false면 이전 채널 선을 비움) */
  chartPrimeTrendChannelsShowLastOnly: boolean;
  /** Pine linefill — 채널 면(밴드) 표시 */
  chartPrimeTrendChannelsShowFills: boolean;
  /**
   * ChartPrime 채널 폭(ATR×6 오프셋) 배율. 1=기본, 0.5 전후면 밴드가 캔들·스윙에 더 밀착.
   * `chartTradeSetupFocus` 켜면 이 값에 추가로 약 0.52배가 곱해짐.
   */
  chartPrimeTrendChannelsWidthScale: number;
  /**
   * 매매 착시: CP 채널을 좁혀 캔들에 밀착 + `ls-plan-entry`/`sl`/`tp*` 가로선 굵게(진입·손절·익절 가독).
   * 별도 모드 없이 SMC 데스크·최강분석 등 기존 모드에서 토글.
   */
  chartTradeSetupFocus: boolean;
  /**
   * 데스크합성 모드: 진입/SL/TP를 차트에 직접 작도(`smc-composite-*`). 기본 ON.
   * ON이면 동일 데이터의 `ls-plan-*` 가로선은 숨겨 중복을 막습니다.
   */
  chartSmcCompositeChartDrawing: boolean;
  /** 데스크합성: 우측 요약 패널(플로팅). 기본 OFF — 차트 작도 우선 */
  chartSmcDeskCompositeFloatingPanel: boolean;
  /** 데스크Δ 모드: 기존 SMC 레이어(합류/볼배/플레이북/구간돌파 등) 표시 허용 */
  chartSmcDeltaDeskShowLegacy: boolean;
  /** Δ유동성 필터: aiFusion·합성 규칙에서 레짐/함정(trap) 반영 */
  chartDepthDeltaRegimeFilter: boolean;
  /** Δ정렬 가중: 컨플루언스 점수·태그에 정렬 가중 반영 */
  chartDepthDeltaAlignmentWeight: boolean;
  /** Δ기반 TP 확장: 합성 작도 TP/SL을 델타 강도 기반으로 자동 조정 */
  chartDepthDeltaTpAdaptive: boolean;
  /** CP 채널 상단·저항 계열 선/면 #RRGGBB */
  chartPrimeTrendChannelsTopHex: string;
  /** CP 채널 중앙선 #RRGGBB */
  chartPrimeTrendChannelsCenterHex: string;
  /** CP 채널 하단·지지 계열 선/면 #RRGGBB */
  chartPrimeTrendChannelsBottomHex: string;
  showPo3: boolean;
  showCandle: boolean;
  showBpr: boolean;
  showRsiPanel: boolean;
  showMacdPanel: boolean;
  showBbPanel: boolean;
  showVision: boolean;
  showVisionTriangle: boolean;
  showVisionFlag: boolean;
  showVisionWedge: boolean;
  showVisionReversal: boolean;
  showVisionRange: boolean;
  showReactionZone: boolean;
  /** 세력/고래 매수·매도 구간 (거래소 API 기반 zone 확률) — 실행 화면 기본 표시 */
  showWhaleZone: boolean;
  /** Lakshmi LVRB — 저변동 레인지 박스·롱/숏 돌파 라벨 (앱 내 Pine 로직 포팅) */
  showLvrb: boolean;
  /** Volatility Trend Score [BackQuant] — ▲L / ▼S 전환 마커 */
  showVolatilityTrendScore: boolean;
  showTailongClose: boolean;
  showTailongCloseBreakout: boolean;
  showTailongCloseWick: boolean;
  showTailongCloseBody: boolean;
  showTailongCloseFlow: boolean;
  /** 레이블 위치 조정 모드 (겹친 레이블 드래그/버튼으로 이동) */
  overlayLabelEditMode: boolean;
  /** 전체 라벨 기본 글자 크기 (8~24) */
  overlayLabelFontSize: number;
  /** 우측 축·시간축 등 차트 스케일 글자 크기 (lightweight-charts layout.fontSize, 10~18) */
  chartScaleFontSize: number;
  /** 존/줄 옆 오버레이 가격 표시 글자 크기 (8~18) */
  overlayPriceStripFontSize: number;
  /** 가로줄(키레벨 등) 굵기 */
  overlayLineThickness: 'thin' | 'normal' | 'thick';
  webhookEnabled: boolean;
  webhookMinConfidence: number;
  /** 확정/준비 신호 시 브라우저 알림·진동 */
  signalAlertEnabled: boolean;
  /** 확정/준비 신호 시 소리 알림 */
  signalSoundEnabled: boolean;
  /**
   * 1분 봉(BTC/ETH): 로켓·기관밴드·HotZone·존/선 접근·OB/구조 확정이 잡힐 때 텔레그램 자동 전송.
   * 수동 테스트 버튼과 무관 — 사용자가 여기만 켜면 동작.
   */
  telegramAuto1mEnabled: boolean;
  /**
   * 1m 자동: UI·저장용. 실제 전송은 **항상** 풀프레임+캔버스 캡처 시도 후 텔레(캡처 실패 시 본문만).
   */
  telegramAuto1mImageMode: 'off' | 'smart' | 'always';
  /**
   * 1h/4h/1d/1w/1M: HotZone·기관밴드(초록/빨강)·강한존·존·선 접근·구조 마감(확정/실패)을 텔레 본문에 포함.
   * (로켓/선행/매집고정과 함께 병합되거나, 단독 키로도 발송)
   */
  telegramHtfZonePackEnabled: boolean;
  /**
   * 위 팩을 **직전 마감봉** 기준으로만 평가(기본). 끄면 형성 중인 봉 기준(알림 빈도↑).
   */
  telegramHtfSealedBarOnly: boolean;
  /**
   * HTF(1h~1M) 멀티: `telegramMultiTfSymbols`×`telegramMultiTfTimeframes`마다 /api/analyze로 백그라운드 감지, 조건 충족 시 텔레(본문만, 차트 캡처 없음).
   * **현재 차트에 켜 둔 TF와 무관**하게 지정한 조합만 순회.
   */
  telegramMultiTfEnabled: boolean;
  /** 멀티TF 텔레 심볼(엔진 HTF 자동과 동일하게 BTC/ETHUSDT 권장). */
  telegramMultiTfSymbols: string[];
  /** 멀티TF 텔레 타임프레임(1h·4h·1d·1w·1M 권장 — 그 외·저번 TF는 워처에서 제외). */
  telegramMultiTfTimeframes: string[];
  /** 멀티TF: 심볼×TF **한 바퀴** 끝난 뒤 다음 루프까지 대기(초, 30~600). */
  telegramMultiTfIntervalSec: number;
  favoriteSymbols: string[];
  /** 스윙 타점 레버리지 계산용 시드(USDT). 사용자 입력. */
  swingSeedUsdt: number;
  /** 가상매매 시드(USDT). 사용자 입력. 이 시드로 자동 가상매매 시도. */
  virtualTradeSeedUsdt: number;
  /** 가상매매 백그라운드 켜기 — 차트 무관하게 각 TF별 자동 분석·진입 */
  virtualTradeEnabled: boolean;
  /** 가상매매 추적 심볼 (백그라운드에서 분석할 심볼 목록) */
  virtualTradeSymbols: string[];
  /** 가상매매 추적 타임프레임 (분/시/일/주/달) */
  virtualTradeTimeframes: string[];
  /** 가상매매 사용자 수익권(레버리지 손익 기준, %) */
  virtualTradeTargetProfitPct: number;
  /** TP/SL 적용 모드. auto=신호값, manual=사용자 지정 퍼센트 */
  virtualTradeTpSlMode: 'auto' | 'manual';
  /** 수동 손절 퍼센트 */
  virtualTradeManualStopPct: number;
  /** 수동 목표1 퍼센트 */
  virtualTradeManualTp1Pct: number;
  /** 수동 목표2 퍼센트 */
  virtualTradeManualTp2Pct: number;
  /** 수동 목표3 퍼센트 */
  virtualTradeManualTp3Pct: number;
  /** 영어 라벨을 한글로 번역 (차트 오버레이) */
  translateLabelsToKo: boolean;
  /** 모드별 기능 ON/OFF. 선택한 모드에서 개별 토글 */
  modeFeatureOverrides?: ModeFeatureOverrides;
  /** Zone 시그널 민감도(0.7~1.3). 낮을수록 보수, 높을수록 공격적 */
  zoneSignalSensitivity: number;
  /** LuxAlgo 스타일 자동 추세선 피벗 룩백(좌우 동일 봉 수, 2~15) */
  trendlineLookback: number;
  /** ParkF LinReg·피벗 추세선 색 (#RRGGBB) */
  parkfLinRegBaseHex: string;
  parkfLinRegLargeHex: string;
  parkfLinRegMediumHex: string;
  parkfLinRegSmallHex: string;
  parkfTrendPrimaryHex: string;
  parkfTrendSecondaryHex: string;
  /** ParkF LinReg·피벗 엔진 — Pine 옵션(색 제외). 비어 있으면 기본값 */
  parkfEngineOpts?: Partial<ParkfTrendlineOpts>;
  /** BOS 돌파 봉에 리테스트 없이도 RSI/안착 맞으면 구조 로켓(추가 신호) */
  structureBreakoutRocketWithoutRetest: boolean;
  /** 차트에 그릴 구조 세트업(E/SL/TP) 개수 상한 (4~12) */
  structurePriceLinesMax: number;
  /** 차트 텍스트·핀 라벨 일괄 숨김 (모바일·전체화면 정리) */
  chartBulkHideLabels: boolean;
  /** 가격 가로선·구조선·피보·추세선 등 선 일괄 숨김 */
  chartBulkHideHLines: boolean;
  /** 존·FVG·OB·BPR·반응구간 등 면 일괄 숨김 */
  chartBulkHideZones: boolean;
  /**
   * 브리핑 verdict(LONG/SHORT)만으로 차트에 색 시그널(글자 없음).
   * wash=전체에 옅은 녹/적 톤, edge=우측 가느다란 띠, priceLine=현재가 가로선만 녹/적.
   */
  chartVerdictTint: 'off' | 'wash' | 'edge' | 'priceLine';
  /**
   * TV식 SuperTrend 스텝 밴드 — 롱 시 가격 아래 초록, 숏 시 위 빨강(실전 차트 공통).
   */
  showInstitutionalSuperBand: boolean;
  /** 기관밴드(아래/롱) 선 색상 (#RRGGBB) */
  institutionalBandLongHex: string;
  /** 기관밴드(위/숏) 선 색상 (#RRGGBB) */
  institutionalBandShortHex: string;
  /**
   * 고래 엔진 매집/분배 존을 고래 모드가 아닐 때도 차트에 병합(세력·기관 흐름 존 — 교육·참고).
   */
  institutionalFlowZonesEnabled: boolean;
  /** SuperTrend 현재 국면 요약 배지(우측 상단) */
  showInstitutionalTrendBadge: boolean;
  /**
   * 기관밴드 접촉·반등 마커(ST·L/S, 등급별) — 끄면 스텝 라인·배지만 표시.
   */
  institutionalBandTouchMarkers: boolean;
  /** 접촉 마커 최소 품질 — A만 켜면 고득점 구간만(잡신호 감소) */
  institutionalBandTouchMinTier: 'A' | 'B' | 'C';
  /** 접촉 마커 등급별 ON/OFF — 여러 등급 동시 선택 가능. `institutionalBandTouchMinTier`는 마스크와 동기화해 둠 */
  institutionalBandTouchTierMask: InstitutionalBandTouchTierMask;
  /**
   * 밴드 접촉 마커 정밀 모드: OBV·거래량(SMA 대비) 확인 후,
   * `/api/analyze` 오버레이에 EQ·저항·지지 등이 있으면 밴드가 그 근처일 때만 채택.
   */
  /** @deprecated UI는 `institutionalBandTouchReinforced`만 사용 — 구버전 저장 호환 */
  institutionalBandTouchPrecision: boolean;
  /**
   * @deprecated UI는 `institutionalBandTouchReinforced`만 사용
   */
  institutionalBandTouchConfluence: boolean;
  /**
   * 접촉정밀 + 밴드합류 통합(합류 점수 + 정밀 게이트 + 합류 최소점수 +5).
   */
  institutionalBandTouchReinforced: boolean;
  /**
   * Bitcoin Power Law Bands (TradingView Pine 포팅) — BTCUSDT 등 BTC 기축 심볼에서만 표시, 교육·참고.
   */
  showBitcoinPowerLawBands: boolean;
  /** Smart Adaptive Signal — 차트에 롱(황소)·숏(독수리) 마커 및 목표선 (모드 공통, 설정으로 끔) */
  showSmartAdaptiveSignal: boolean;
  /** SMC 데스크: EQ(균형선) — 클라이언트 캔들·스윙 기준 */
  showSmcDeskEq: boolean;
  /** 프리미엄 / 디스카운트 면 */
  showSmcDeskPremiumDiscount: boolean;
  /** 단순화 오더블럭(Bull/Bear-OB) */
  showSmcDeskOrderBlocks: boolean;
  /** BOS / CHOCH / MSB 라벨·선 */
  showSmcDeskStructure: boolean;
  /** 존별 거래량 비중 라벨(EQ 기준) */
  showSmcDeskZoneStrength: boolean;
  /**
   * SMC 데스크: 차트 우상단 **AI 롱·숏 합성·5요소 확정** 패널(엔진·RSI·존·MTF·SMC합류 등 `aiFusionSignal` + `confirmedSignal`).
   */
  chartSmcDeskAiFusionPanel: boolean;
  /**
   * SMC 데스크: LinReg 근접 + 엔진 OB + 최근 BOS/CHOCH **2/3 이상** 합류 시 전용 마커·존(기존 로켓·L 마커와 별도 id).
   */
  showSmcDeskConfluenceLs: boolean;
  /**
   * SMC 데스크: 최신 캔들 근처 **볼배** 라벨 오버레이(종합·SMC합류·MTF·확정게이트 요약은 툴팁).
   * 기본 끔 — 툴바에서만 켬.
   */
  showSmcDeskBallboyHud: boolean;
  /**
   * SMC 데스크: 최근 구간 고저 대비 **마지막 봉 종가 돌파** 면·핀(상승/하락·시도/확정 휴리스틱).
   */
  showSmcDeskRangeBreakoutZones: boolean;
  /**
   * SMC 데스크: BOS→유동성 스윕→CHoCH 순서 충족 시 **타점 존·단계 라벨**(교재식 플레이북 v1).
   */
  showSmcDeskEntryPlaybook: boolean;
  /** 스윙 피벗 좌우 봉 수 (SMC 데스크) */
  smcDeskSwingPivot: number;
  /**
   * BOS/CHOCH/MSB 돌파 봉에 단계별(마감·안착·실패·trace) 캔들 색 — `lib/smcDeskOverlay`와 동일 규격.
   * `chartCandleCompositeLayers`가 켜져 있으면 테두리 우선순위에서 구조가 pre3보다 앞서며 본봉은 OHLC 방향색 유지.
   */
  chartSmcStructurePhaseCandles: boolean;
  /**
   * 호가·체결 기반 고래 구간(strongZone) 차트 면/라벨 최소 갱신 간격(ms).
   * 분석 폴링이 잦아도 매 응답마다 존이 바뀌어 깜빡이지 않게 함(500~60000).
   */
  chartStrongZoneMinRefreshMs: number;
  /**
   * 캔들분석·통합작도: 차트에 매수·매도(지지·저항) 존·가로 띠 위주만 표시.
   * 추세선·비전·해시피보·BOS웨이브 등 비-존 레이어는 숨김(교육·집중용).
   */
  chartBuySellZoneFocus: boolean;
  /**
   * 선물·스팟 공통: 분석 응답의 TF별 **종가 마감** 가로선(close-1m ~ close-monthly) 표시.
   * 끄면 종가선만 숨기고, 다른 키레벨·구조선은 `구조` 등 기존 토글을 따름.
   */
  chartTfCloseSettlementLines: boolean;
  /** 종가 마감선을 TF별 색이 아닌 **흰색** 가로선(라벨·축 가격띠 톤 동일)으로 통일 */
  chartTfCloseLinesWhite: boolean;
  /** 구조 로켓 HUD(🚀/📉) 및 동일 캔들 마커 크기 — 100=기본, 50~200% */
  lsRocketScalePct: number;
  /** 캔들분석(점수·타이롱 등) 보조 마커 — 기존 L/S·로켓과 겹치지 않는 봉에만 */
  showUnifiedCandleMarkers: boolean;
  /** 보조 마커 최대 개수(전체) */
  candleAnalysisMarkerMax: number;
  /** 캔들분석: 진입·안착 등 브라우저 알림(권한 필요) */
  candleAnalysisBrowserNotify: boolean;
  /** 캔들분석: 룰 코멘트 아래 AI 한 줄(로그인·API 키 필요) */
  candleAnalysisAiComment: boolean;
  /**
   * 캔들분석: 매집대·피보·사이클·시나리오 등 자동 레이어는 차트에 안 그림 → 해설 패널 텍스트만.
   * 차트에는 오더블럭(OB) 존만 유지. 끄면 이전처럼 자동 전부 차트 표시.
   */
  candleAnalysisAutoCommentaryOnly: boolean;
  /**
   * 캔들분석 핵심 뷰: 스마트 존을 요약하고 핵심 돌파·지지·저항 가로선 + 이론 경로(점선) + 확정 배지.
   * 끄면 FVG·비전·엘리엇·기존 플레이북 경로까지 전부 표시(이전과 유사).
   */
  candleAnalysisExecutiveView: boolean;
  /** 캔들분석 유사 과거 경로(청록): 최소 매칭 구간 수 2~8 */
  candleAnalysisPathMinMatches: number;
  /** 0=타임프레임별 자동 H, 양수면 고정 봉 수 */
  candleAnalysisPathHorizonBars: number;
  /** 유사도 상위 후보 개수 3~12 */
  candleAnalysisPathTopMatches: number;
  /** 유사도에 log 거래량 Z 차이 가중 0~2 */
  candleAnalysisPathWeightVolume: number;
  /** 유사도에 RSI(14) 차이 가중 0~2 */
  candleAnalysisPathWeightRsi: number;
  /** 청록 점선 기울기(엔진 편향 반영 후) 0.82~1.4 */
  candleAnalysisPathMemorySteepen: number;
  /** 보라 이론 경로 마지막 목표 구간 기울기 0.85~1.38 */
  candleAnalysisPathTheorySteepen: number;
  /** 핵심 뷰: 현재가→목표 한 줄 직진 보라 점선 */
  candleAnalysisDirectTheoryPath: boolean;
  /**
   * 캔들분석: Hash Auto Fibonacci 스타일(동적 룩백·피보·골든포켓·ATR SL) — TradingView Pine 로직 포팅(교육·참고).
   */
  candleAnalysisHashFibEnabled: boolean;
  candleAnalysisHashFibShowGoldenPocket: boolean;
  candleAnalysisHashFibShowAtrSl: boolean;
  candleAnalysisHashFibAutoLookback: boolean;
  candleAnalysisHashFibManualLookback: number;
  candleAnalysisHashFibDynMult: number;
  candleAnalysisHashFibShowExtension: boolean;
  candleAnalysisHashFibShowSwingMarkers: boolean;
  /** HTF 캔들 미연동 시 켜도 MTF 배지는 대부분 꺼짐 */
  candleAnalysisHashFibShowMtf: boolean;
  /**
   * 캔들분석: BOSWaves · Institutional Delta Sweeps (유동성 풀·스윕·BUY/SELL 존 투영) — Pine 포팅(교육·참고).
   */
  candleAnalysisBosWavesEnabled: boolean;
  candleAnalysisBosWavesShowLiqPools: boolean;
  candleAnalysisBosWavesShowZigZag: boolean;
  candleAnalysisBosWavesShowSweepHighlight: boolean;
  candleAnalysisBosWavesShowSweepLabels: boolean;
  candleAnalysisBosWavesShowProjectedZones: boolean;
  /**
   * 캔들분석: UAlgo VIFVG (역 FVG + 거래량 Bull/Bear/Str 막대) — Pine 포팅. CC BY-NC-SA 4.0.
   */
  candleAnalysisVifvgEnabled: boolean;
  candleAnalysisVifvgShowGhost: boolean;
  candleAnalysisVifvgShowLastN: number;
  candleAnalysisVifvgFvgThresholdAtr: number;
  candleAnalysisVifvgStrictMode: boolean;
  /**
   * 캔들분석: AlgoAlpha Breaker Blocks (Z-스코어 임펄스·OB→브레이커·리젝션 마커) — Pine 포팅(교육·참고).
   */
  candleAnalysisBreakerBlocksEnabled: boolean;
  candleAnalysisBreakerBlocksPreventOverlap: boolean;
  candleAnalysisBreakerBlocksZLen: number;
  candleAnalysisBreakerBlocksMaxAge: number;
  candleAnalysisBreakerBlocksBullHex: string;
  candleAnalysisBreakerBlocksBearHex: string;
  /**
   * 캔들분석: BOSWaves·VIFVG·브레이커 등 **존형 차트 레이어** 표시.
   * 끄면 해설·토글(활성화)은 유지되고 차트 위 존만 숨김(기본 끔).
   */
  candleAnalysisZoneChartVisible: boolean;
  /**
   * 캔들분석: 엔진 Supply/Demand 핵심 존만 TV 스타일(반투명 띠·Supply/Demand 라벨)로 표시.
   * BOS·VIFVG 등 존 차트(존 버튼)와 별개 — 기본 켜짐.
   */
  candleAnalysisCoreSdZones: boolean;
  /**
   * 캔들분석: 스마트/실행과 동일 소스의 엔진 오버레이(구조·존·키레벨·하모닉·RSI·비전 등)를 차트에 합성.
   * 끄면 캔들분석 전용 레이어만 표시.
   */
  candleAnalysisMergeEngineOverlays: boolean;
  /** 캔들분석: 스마트 오버레이 / 가이드 존 */
  candleAnalysisShowSmartGuide: boolean;
  /** 캔들분석: 엘리엇 MVP 오버레이(핵심 뷰에서는 기본 숨김) */
  candleAnalysisShowElliottMvp: boolean;
  /** 캔들분석: 플레이북 경로(핵심 뷰에서는 기본 숨김) */
  candleAnalysisShowPlaybookPath: boolean;
  /**
   * 캔들분석: 자동 분석 존(OB 등) 차트 레이어.
   * `candleAnalysisAutoCommentaryOnly`가 켜 있으면 해설만·차트 없음(기존과 동일).
   */
  candleAnalysisShowAutoZones: boolean;
  /** 캔들분석: 엔진 FVG(구조와 동일 소스) */
  candleAnalysisShowEngineFvg: boolean;
  /** 캔들분석: 추세선·삼각/쐐기 패턴비전(핵심 뷰에서는 기본 숨김) */
  candleAnalysisShowTrendPattern: boolean;
  /** 장대봉 직전 2캔 유사도(기록 대비) 임계 — 0.55~1.0, 기본 1.0(완전 일치에 가깝게) */
  pre3SimilarityThreshold: number;
  /** Pre3 반짝: 마지막 봉이 마감된 뒤에만 확정(matched). 끄면 형성 중 봉에도 반짝 */
  pre3ConfirmOnCloseOnly: boolean;
  /** 세력고래 모드: 2~3캔들 기반 장대봉 예고 박스 자동 작도 */
  whaleShowForecastBoxes: boolean;
  /** 세력고래 모드: 횡보+매수 우세 매집 박스 자동 작도 */
  whaleShowAccumulationBoxes: boolean;
  /** 세력고래 모드: 횡보+매도 우세 분배 박스 자동 작도 */
  whaleShowDistributionBoxes: boolean;
  /** 세력고래 모드: 확정(고정) 박스만 표시 */
  whaleOnlyLockedBoxes: boolean;
  /** 세력고래 모드: MSB-OB 지그재그 길이 */
  whaleZigzagLen: number;
  /** 세력고래 모드: MSB 전환 fib 계수 */
  whaleFibFactor: number;
  /** 세력고래 모드: 깨진/구간 이탈 박스 자동 삭제 */
  whaleDeleteBrokenBoxes: boolean;
  /** 세력고래 모드: Bu-OB 박스 색상 (#RRGGBB) */
  whaleBuObHex: string;
  /** 세력고래 모드: Be-OB 박스 색상 (#RRGGBB) */
  whaleBeObHex: string;
  /** 세력고래 모드: Bu-BB/MB 박스 색상 (#RRGGBB) */
  whaleBuBbHex: string;
  /** 세력고래 모드: Be-BB/MB 박스 색상 (#RRGGBB) */
  whaleBeBbHex: string;
  /** 세력고래 모드: 유사 선반영 최소 샘플 수 (방향별) */
  whaleSimilarityMinSamples: number;
  /** 세력고래 모드: 사전 분석 기록(JSON) 우선 사용 */
  whaleUsePrecomputedMemory: boolean;
  /** 세력고래 모드: 예측 시야 N봉(2~6) */
  whalePredictHorizonBars: number;
  /** 세력고래 모드: 예측 라벨 최소 신뢰도(55~95) */
  whalePredictMinConfidence: number;
  /** 세력고래 모드: 예측 성능 라벨(최근 적중률) 표시 */
  whalePredictShowHitRate: boolean;
  /** 세력고래 모드: 롱/숏 정밀 진입(합의 점수·충돌 억제) */
  whalePrecisionEntryEnabled: boolean;
  /** 세력고래 모드: 정밀 합의 점수 통과 신호만 텔레그램 자동 전송 */
  whalePrecisionAlertEnabled: boolean;
  /** 세력고래 모드: Lux Hot Zone Radar(S/R 열지도) 표시 */
  whaleHotZoneEnabled: boolean;
  /** 세력고래 모드: Hot Zone Lookback */
  whaleHotZoneLookback: number;
  /** 세력고래 모드: Hot Zone 해상도(가격 bin 개수) */
  whaleHotZoneResolution: number;
  /** 세력고래 모드: Hot Zone S/R 민감도(%) */
  whaleHotZoneSrThreshold: number;
  /** 세력고래 모드: Hot Zone 그라데이션 레이어 수 */
  whaleHotZoneLayers: number;
  /** 세력고래 모드: 핵심 지지/저항(major S/R zone+line) 강제 유지 */
  whaleCoreSrZoneEnabled: boolean;
  /** 세력고래 모드: HyperTrend 표시 */
  whaleHyperTrendEnabled: boolean;
  /** HyperTrend 배수 */
  whaleHyperTrendMult: number;
  /** HyperTrend slope */
  whaleHyperTrendSlope: number;
  /** HyperTrend 폭(%) */
  whaleHyperTrendWidthPct: number;
  /** 세력고래: Dynamic R/S PRO (피벗·ATR 존, ChartWhizzperer 요약) */
  whaleDynamicRsProEnabled: boolean;
  /** 세력고래: Liquidity Bias Pro (BSL/SSL·바이어스, Pine 요약) */
  whaleLiquidityBiasEnabled: boolean;
  /** 고래 모드: 세트 구조·반등 경로(차트 점선 + 패널) */
  whaleStructureBounceEnabled: boolean;
  /** 고래 Trendoscope ACP: 지그재그 length (1~80) */
  whaleAcpZigzagLength: number;
  /** 고래 Trendoscope ACP: 지그재그 depth (1~500) */
  whaleAcpDepth: number;
  /** 고래 Trendoscope ACP: 런타임 JSON 패치(고급) */
  whaleAcpSettingsJson: string;
  /** Macd + Adx PRO 패널(ETERNY) 입력·표시 옵션 */
  eternyMacdAdxFastLen: number;
  eternyMacdAdxSlowLen: number;
  eternyMacdAdxSignalLen: number;
  eternyMacdAdxAdxLen: number;
  eternyMacdAdxAdxSmoothing: number;
  eternyMacdAdxThreshold: number;
  eternyMacdAdxHistogramMode: EternyMacdAdxHistogramMode;
  eternyMacdAdxShowAdxLine: boolean;
  eternyMacdAdxShowAdxThreshold: boolean;
  eternyMacdAdxAlertsEnabled: boolean;
  eternyMacdAdxAlertsBrowser: boolean;
  /** 존 반응 카드: 기준가 대비 근접 판정(비율, API 기본 0.003과 동일 스케일) */
  zoneReactionProximityPct: number;
  /** 존 반응 카드 표시 */
  zoneReactionCardEnabled: boolean;
  /** 존 터치 로컬 로그(근접 시 기록) */
  zoneReactionTouchLogEnabled: boolean;
  /** Pine 호환: Exhaustion Zone [by rukich] — 리바운드 밴드·신호 세로 배경 */
  showExhaustionZoneRukich: boolean;
  /** AI 모드: 압축 평균 레인지 상한 = ATR×(0.35~0.65) */
  aiCompressionAvgRangeAtr: number;
  /** AI 모드: 압축 구간 단일 봉 레인지 상한 = ATR×(0.5~0.85) */
  aiCompressionMaxRangeAtr: number;
  /** AI 모드: 변위(장대) 봉 최소 레인지 = ATR×(0.95~1.45) */
  aiImpulseRangeAtr: number;
  /** AI 모드: 변위 봉 최소 몸통 = ATR×(0.35~0.65) */
  aiImpulseBodyAtr: number;
  /** AI 모드: 압축 판정 시 거래량 축소(중앙값 대비) 요구 */
  aiCompressionVolumeFilter: boolean;
  /** AI 압축→장대: 프리셋(슬라이더 직접 조절 시 custom) */
  aiCompressionPreset: AiCompressionPresetId;
  /** A: 캔들 위·아래 마커에 신뢰도·점수 등 메타(텍스트·접미사) 표시 */
  chartMarkerMetaA: boolean;
  /** B: 봉 클릭 시 해당 봉의 마커 요약 패널 */
  chartMarkerClickDetailB: boolean;
  /** C: 켜면 아래 레이어 토글이 적용됨. 끄면 L/S·로켓·보조·선확 레이어 전부 표시(기존과 동일) */
  chartMarkerDensityC: boolean;
  /** C 켜짐일 때만 사용 — L/S 원 마커 */
  chartMarkerLayerLs: boolean;
  /** C 켜짐일 때만 사용 — 구조 로켓 🚀📉 */
  chartMarkerLayerRocket: boolean;
  /** C 켜짐일 때만 사용 — 캔들점수·타이롱 보조 마커 */
  chartMarkerLayerAux: boolean;
  /** C 켜짐일 때만 사용 — 선반영(선확) 차트 마커 */
  chartMarkerLayerFrontRun: boolean;
  /** 존 면색 — 공급·숏·저항 계열(엔진 빨강 존). #RRGGBB */
  zoneFillSupplyHex: string;
  /** 존 면색 — 수요·롱·지지 계열(엔진 초록 존). #RRGGBB */
  zoneFillDemandHex: string;
  /** 존 면색 — 중립·BPR·진입 반응구간 등(엔진 파랑 존). #RRGGBB */
  zoneFillNeutralHex: string;
  /** 존 면색 — 경고·저항 반응·목표 등(엔진 노랑 존). #RRGGBB */
  zoneFillWarningHex: string;
  /** 존(FVG·OB·반응 등) 면의 우측 끝 — 차트 가장자리 / 최신 봉 / 존 시점+N봉 */
  zoneHorizontalExtendMode: 'chartEdge' | 'lastCandle' | 'pastZoneEnd';
  /** pastZoneEnd 모드: 존의 뒤쪽 시간 이후 몇 봉까지 연장 (0~80) */
  zoneExtendPastEndBars: number;
  /** 존 고정 강도(0.6~2.4): 클수록 축소 시 최소 존 폭/높이를 더 보수적으로 유지 */
  zoneStickyStrength: number;
  /** WAD 고래 BUY 마커(거래량 패널). #RRGGBB */
  wadMarkerBuyHex: string;
  /** WAD 고래 SELL 마커(거래량 패널). #RRGGBB */
  wadMarkerSellHex: string;
  /** 캔들 스타일: classic=초록·빨강(테두리 없음), monochrome=TV식(상승 채움·하락 어두운 몸통+밝은 테두리·심지) */
  chartCandleStyle: 'classic' | 'monochrome';
  /** 거래량 막대: WAD 스타일(매수/매도 볼륨 분리 색 + 34봉 SMA×4 고래 BUY/SELL 라벨) */
  chartVolumeIntelligence: boolean;
  /** 거래량 패널: 총거래량/이동평균 대비 단계색(RVOL). WAD 켜진 때만 의미 있음 */
  chartVolumeRvolTiers: boolean;
  /** 거래량 이동평균선(SMA) 봉 수. 0이면 라인 끔 */
  chartVolumeMaPeriod: number;
  /** 분석 buy/sell 존 경계 돌파 + 거래량 확인 시 거래량 막대 위 마커 */
  chartVolumeZoneBreakMarkers: boolean;
  /** RVOL 폭증(임계 이상) 막대 위 라벨 */
  chartVolumeRvolSpikeMarkers: boolean;
  /** 거래량 대비 작은 몸통(흡수·클라이맥스 후보) 막대 위 라벨 */
  chartVolumeAbsorptionMarkers: boolean;
  /** 바이낸스 등 taker 매수 체결량이 있을 때 체결 우세 막대 라벨 */
  chartVolumeTakerFlowMarkers: boolean;
  /** 존 돌파 인정 시 최소 몸통/레인지 비율(%). 0이면 필터 없음 */
  chartVolumeZoneBreakMinBodyPct: number;
  /** 거래량 패널 마커 최소 봉 간격(0=제한 없음, 2=기본·인접 봉은 우선순위로 압축) */
  chartVolumeMarkerMinBarGap: number;
  /** classic 모드 상승 캔들 #RRGGBB */
  chartCandleClassicUpHex: string;
  /** classic 모드 하락 캔들 #RRGGBB */
  chartCandleClassicDownHex: string;
  /** monochrome 상승 몸통·심지·상승 테두리 #RRGGBB */
  chartCandleMonoUpHex: string;
  /** monochrome 하락 몸통(배경에 가깝게) #RRGGBB */
  chartCandleMonoDownBodyHex: string;
  /** monochrome 하락 테두리·하락 심지 #RRGGBB */
  chartCandleMonoOutlineHex: string;
  /**
   * 여러 신호가 같은 봉에 겹칠 때: 본봉은 OHLC 방향(클래식/모노 색), 테두리는 우선 신호·심지는 둘째 신호로 분리.
   * 끄면 예전처럼 한 규칙만 적용(pre3가 있으면 구조·근접 스킵).
   */
  chartCandleCompositeLayers: boolean;
  /** 가로 줄·존 근접 반짝 민감도. 1=기본, 클수록 같은 거리에서 더 잘 감지(대략 0.4~2.5). */
  chartLineZoneProximitySensitivity: number;
  /** 구조 돌파 직후 몇 봉까지 연한 trace 톤(0이면 끔). */
  chartSmcStructureTraceBars: number;
  /** 크로스헤어 위 봉의 캔들 색 규칙 설명(검증·교육용). */
  chartCandleRuleDebug: boolean;
  /** 메인 페이지 레이아웃(헤더·MTF·차트 카드 헤더·우측 패널 표시·플로팅) */
  pageLayout: PageLayoutSettings;
};

/** 차트 캔들 분석 기능 기본값 — 전부 활성화 */
export const defaultSettings: UserSettings = {
  theme: 'dark',
  showStructure: true,
  showZones: true,
  showLabels: true,
  showScenario: true,
  showFib: true,
  showRsi: true,
  showHarmonic: true,
  showChartPrimeTrendChannels: true,
  chartPrimeTrendChannelsVolumeBg: false,
  chartPrimeTrendChannelsLength: 8,
  chartPrimeTrendChannelsAutoLength: true,
  chartPrimeTrendChannelsWait: true,
  chartPrimeTrendChannelsExtend: false,
  chartPrimeTrendChannelsShowLastOnly: true,
  chartPrimeTrendChannelsShowFills: true,
  chartPrimeTrendChannelsWidthScale: 1,
  chartTradeSetupFocus: false,
  chartSmcCompositeChartDrawing: true,
  chartSmcDeskCompositeFloatingPanel: false,
  chartSmcDeltaDeskShowLegacy: false,
  chartDepthDeltaRegimeFilter: true,
  chartDepthDeltaAlignmentWeight: true,
  chartDepthDeltaTpAdaptive: true,
  chartPrimeTrendChannelsTopHex: '#337C4F',
  chartPrimeTrendChannelsCenterHex: '#9CA3AF',
  chartPrimeTrendChannelsBottomHex: '#A52D2D',
  showPo3: true,
  showCandle: true,
  showBpr: true,
  showRsiPanel: true,
  showMacdPanel: true,
  showBbPanel: true,
  showVision: true,
  showVisionTriangle: true,
  showVisionFlag: true,
  showVisionWedge: true,
  showVisionReversal: true,
  showVisionRange: true,
  showReactionZone: true,
  showWhaleZone: true,
  showLvrb: false,
  showVolatilityTrendScore: true,
  showTailongClose: true,
  showTailongCloseBreakout: true,
  showTailongCloseWick: true,
  showTailongCloseBody: true,
  showTailongCloseFlow: true,
  overlayLabelEditMode: false,
  overlayLabelFontSize: 11,
  chartScaleFontSize: 12,
  overlayPriceStripFontSize: 10,
  overlayLineThickness: 'normal',
  webhookEnabled: false,
  webhookMinConfidence: 70,
  signalAlertEnabled: true,
  signalSoundEnabled: true,
  telegramAuto1mEnabled: false,
  telegramAuto1mImageMode: 'smart',
  telegramHtfZonePackEnabled: true,
  telegramHtfSealedBarOnly: true,
  telegramMultiTfEnabled: false,
  telegramMultiTfSymbols: ['BTCUSDT', 'ETHUSDT'],
  telegramMultiTfTimeframes: ['1h', '4h', '1d', '1w', '1M'],
  telegramMultiTfIntervalSec: 120,
  favoriteSymbols: [],
  swingSeedUsdt: 3000,
  virtualTradeSeedUsdt: 1000,
  virtualTradeEnabled: true,
  virtualTradeSymbols: ['BTCUSDT'],
  virtualTradeTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'],
  virtualTradeTargetProfitPct: 5,
  virtualTradeTpSlMode: 'auto',
  virtualTradeManualStopPct: 0.88,
  virtualTradeManualTp1Pct: 1.2,
  virtualTradeManualTp2Pct: 2.4,
  virtualTradeManualTp3Pct: 3.6,
  translateLabelsToKo: false,
  modeFeatureOverrides: {},
  zoneSignalSensitivity: 1.0,
  trendlineLookback: 3,
  parkfLinRegBaseHex: DEFAULT_PARKF_TRENDLINE_COLORS.linRegBaseHex,
  parkfLinRegLargeHex: DEFAULT_PARKF_TRENDLINE_COLORS.linRegLargeHex,
  parkfLinRegMediumHex: DEFAULT_PARKF_TRENDLINE_COLORS.linRegMediumHex,
  parkfLinRegSmallHex: DEFAULT_PARKF_TRENDLINE_COLORS.linRegSmallHex,
  parkfTrendPrimaryHex: DEFAULT_PARKF_TRENDLINE_COLORS.trendPrimaryHex,
  parkfTrendSecondaryHex: DEFAULT_PARKF_TRENDLINE_COLORS.trendSecondaryHex,
  structureBreakoutRocketWithoutRetest: false,
  structurePriceLinesMax: 8,
  chartBulkHideLabels: false,
  chartBulkHideHLines: false,
  chartBulkHideZones: false,
  chartVerdictTint: 'off',
  showInstitutionalSuperBand: true,
  institutionalBandLongHex: '#22C55E',
  institutionalBandShortHex: '#EF4444',
  institutionalFlowZonesEnabled: true,
  showInstitutionalTrendBadge: true,
  institutionalBandTouchMarkers: true,
  institutionalBandTouchMinTier: 'B',
  institutionalBandTouchTierMask: tierMaskFromMinTier('B'),
  institutionalBandTouchPrecision: false,
  institutionalBandTouchConfluence: false,
  institutionalBandTouchReinforced: false,
  showBitcoinPowerLawBands: false,
  showSmartAdaptiveSignal: true,
  showSmcDeskEq: false,
  showSmcDeskPremiumDiscount: false,
  showSmcDeskOrderBlocks: false,
  showSmcDeskStructure: false,
  showSmcDeskZoneStrength: false,
  chartSmcDeskAiFusionPanel: true,
  showSmcDeskConfluenceLs: true,
  showSmcDeskBallboyHud: false,
  showSmcDeskRangeBreakoutZones: false,
  showSmcDeskEntryPlaybook: true,
  smcDeskSwingPivot: 2,
  chartSmcStructurePhaseCandles: true,
  chartStrongZoneMinRefreshMs: 4000,
  chartBuySellZoneFocus: false,
  chartTfCloseSettlementLines: true,
  chartTfCloseLinesWhite: true,
  lsRocketScalePct: 100,
  showUnifiedCandleMarkers: true,
  candleAnalysisMarkerMax: 18,
  candleAnalysisBrowserNotify: false,
  candleAnalysisAiComment: false,
  candleAnalysisAutoCommentaryOnly: true,
  candleAnalysisExecutiveView: true,
  candleAnalysisPathMinMatches: 3,
  candleAnalysisPathHorizonBars: 0,
  candleAnalysisPathTopMatches: 6,
  candleAnalysisPathWeightVolume: 0.45,
  candleAnalysisPathWeightRsi: 0.35,
  candleAnalysisPathMemorySteepen: 1.18,
  candleAnalysisPathTheorySteepen: 1.2,
  candleAnalysisDirectTheoryPath: true,
  candleAnalysisHashFibEnabled: true,
  candleAnalysisHashFibShowGoldenPocket: true,
  candleAnalysisHashFibShowAtrSl: true,
  candleAnalysisHashFibAutoLookback: true,
  candleAnalysisHashFibManualLookback: 10,
  candleAnalysisHashFibDynMult: 9,
  candleAnalysisHashFibShowExtension: false,
  candleAnalysisHashFibShowSwingMarkers: true,
  candleAnalysisHashFibShowMtf: false,
  candleAnalysisBosWavesEnabled: true,
  candleAnalysisBosWavesShowLiqPools: true,
  candleAnalysisBosWavesShowZigZag: true,
  candleAnalysisBosWavesShowSweepHighlight: true,
  candleAnalysisBosWavesShowSweepLabels: true,
  candleAnalysisBosWavesShowProjectedZones: true,
  candleAnalysisVifvgEnabled: true,
  candleAnalysisVifvgShowGhost: true,
  candleAnalysisVifvgShowLastN: 10,
  candleAnalysisVifvgFvgThresholdAtr: 0.5,
  candleAnalysisVifvgStrictMode: true,
  candleAnalysisBreakerBlocksEnabled: true,
  candleAnalysisBreakerBlocksPreventOverlap: true,
  candleAnalysisBreakerBlocksZLen: 100,
  candleAnalysisBreakerBlocksMaxAge: 500,
  candleAnalysisBreakerBlocksBullHex: '#00ffbb',
  candleAnalysisBreakerBlocksBearHex: '#ff1100',
  candleAnalysisZoneChartVisible: false,
  candleAnalysisCoreSdZones: true,
  candleAnalysisMergeEngineOverlays: true,
  candleAnalysisShowSmartGuide: true,
  candleAnalysisShowElliottMvp: true,
  candleAnalysisShowPlaybookPath: true,
  candleAnalysisShowAutoZones: true,
  candleAnalysisShowEngineFvg: true,
  candleAnalysisShowTrendPattern: true,
  pre3SimilarityThreshold: 1,
  pre3ConfirmOnCloseOnly: true,
  whaleShowForecastBoxes: false,
  whaleShowAccumulationBoxes: true,
  whaleShowDistributionBoxes: true,
  whaleOnlyLockedBoxes: true,
  whaleZigzagLen: 9,
  whaleFibFactor: 0.33,
  whaleDeleteBrokenBoxes: true,
  whaleBuObHex: '#22C55E',
  whaleBeObHex: '#EF4444',
  whaleBuBbHex: '#4ADE80',
  whaleBeBbHex: '#F87171',
  whaleSimilarityMinSamples: 60,
  whaleUsePrecomputedMemory: true,
  whalePredictHorizonBars: 3,
  whalePredictMinConfidence: 65,
  whalePredictShowHitRate: true,
  whalePrecisionEntryEnabled: false,
  whalePrecisionAlertEnabled: false,
  whaleHotZoneEnabled: false,
  whaleHotZoneLookback: 200,
  whaleHotZoneResolution: 30,
  whaleHotZoneSrThreshold: 80,
  whaleHotZoneLayers: 3,
  whaleCoreSrZoneEnabled: true,
  whaleHyperTrendEnabled: false,
  whaleHyperTrendMult: 5,
  whaleHyperTrendSlope: 14,
  whaleHyperTrendWidthPct: 80,
  whaleDynamicRsProEnabled: false,
  whaleLiquidityBiasEnabled: false,
  whaleStructureBounceEnabled: false,
  whaleAcpZigzagLength: 8,
  whaleAcpDepth: 55,
  whaleAcpSettingsJson: '',
  eternyMacdAdxFastLen: 12,
  eternyMacdAdxSlowLen: 26,
  eternyMacdAdxSignalLen: 9,
  eternyMacdAdxAdxLen: 14,
  eternyMacdAdxAdxSmoothing: 14,
  eternyMacdAdxThreshold: 20,
  eternyMacdAdxHistogramMode: 'filtered' as const,
  eternyMacdAdxShowAdxLine: false,
  eternyMacdAdxShowAdxThreshold: false,
  eternyMacdAdxAlertsEnabled: false,
  eternyMacdAdxAlertsBrowser: false,
  zoneReactionProximityPct: 0.003,
  zoneReactionCardEnabled: false,
  zoneReactionTouchLogEnabled: true,
  showExhaustionZoneRukich: false,
  aiCompressionAvgRangeAtr: 0.5,
  aiCompressionMaxRangeAtr: 0.65,
  aiImpulseRangeAtr: 1.12,
  aiImpulseBodyAtr: 0.48,
  aiCompressionVolumeFilter: false,
  aiCompressionPreset: 'balanced',
  chartMarkerMetaA: true,
  chartMarkerClickDetailB: true,
  chartMarkerDensityC: false,
  chartMarkerLayerLs: true,
  chartMarkerLayerRocket: true,
  chartMarkerLayerAux: true,
  chartMarkerLayerFrontRun: true,
  zoneFillSupplyHex: '#EF4444',
  zoneFillDemandHex: '#22C55E',
  zoneFillNeutralHex: '#3B82F6',
  zoneFillWarningHex: '#EAB308',
  zoneHorizontalExtendMode: 'chartEdge',
  zoneExtendPastEndBars: 12,
  zoneStickyStrength: 1,
  wadMarkerBuyHex: '#16A34A',
  wadMarkerSellHex: '#DC2626',
  chartCandleStyle: 'classic',
  chartVolumeIntelligence: true,
  chartVolumeRvolTiers: true,
  chartVolumeMaPeriod: 20,
  chartVolumeZoneBreakMarkers: true,
  chartVolumeRvolSpikeMarkers: true,
  chartVolumeAbsorptionMarkers: true,
  chartVolumeTakerFlowMarkers: true,
  chartVolumeZoneBreakMinBodyPct: 0,
  chartVolumeMarkerMinBarGap: 2,
  chartCandleClassicUpHex: '#22C55E',
  chartCandleClassicDownHex: '#EF4444',
  chartCandleMonoUpHex: '#FFFFFF',
  chartCandleMonoDownBodyHex: '#10151D',
  chartCandleMonoOutlineHex: '#FFFFFF',
  chartCandleCompositeLayers: true,
  chartLineZoneProximitySensitivity: 1,
  chartSmcStructureTraceBars: 2,
  chartCandleRuleDebug: false,
  pageLayout: { ...defaultPageLayout },
};

/**
 * 최강분석·통합작도 공통: `/api/analyze`·amx 수집은 그대로(데이터 풍부) — **화면은 TV·작도식으로 읽기 쉽게** 잡음 레이어는 기본 OFF.
 * 구조·존·라벨·시나리오·피보·RSI·캔들·BPR·반응·고래구간·CP채널·비전(삼각·쐐기·반전)·핵심 타이롱만 ON.
 * 하모닉·PO3·LVRB·비전 깃발·레인지·VTS·고래 예측박스·핫존·하이퍼·타이롱 몸통·플로우 등은 ⚙ 모드별에서 다시 켤 수 있음.
 */
function effectiveFeatureTogglesMaxAnalysis(settings: UserSettings) {
  return {
    showStructure: true,
    showZones: true,
    showLabels: true,
    showScenario: true,
    showFib: true,
    showRsi: true,
    showHarmonic: false,
    showChartPrimeTrendChannels: true,
    chartPrimeTrendChannelsVolumeBg: settings.chartPrimeTrendChannelsVolumeBg,
    showPo3: false,
    showCandle: true,
    showBpr: true,
    showVision: true,
    showVisionTriangle: true,
    showVisionFlag: false,
    showVisionWedge: true,
    showVisionReversal: true,
    showVisionRange: false,
    showReactionZone: true,
    showWhaleZone: true,
    showLvrb: false,
    showVolatilityTrendScore: false,
    showTailongClose: true,
    showTailongCloseBreakout: true,
    showTailongCloseWick: true,
    showTailongCloseBody: false,
    showTailongCloseFlow: false,
    whaleShowForecastBoxes: false,
    whaleShowAccumulationBoxes: true,
    whaleShowDistributionBoxes: false,
    whaleOnlyLockedBoxes: false,
    whaleZigzagLen: settings.whaleZigzagLen,
    whaleFibFactor: settings.whaleFibFactor,
    whaleDeleteBrokenBoxes: true,
    whaleBuObHex: settings.whaleBuObHex,
    whaleBeObHex: settings.whaleBeObHex,
    whaleBuBbHex: settings.whaleBuBbHex,
    whaleBeBbHex: settings.whaleBeBbHex,
    whaleSimilarityMinSamples: settings.whaleSimilarityMinSamples,
    whaleUsePrecomputedMemory: true,
    whalePredictHorizonBars: 3,
    whalePredictMinConfidence: 65,
    whalePredictShowHitRate: true,
    whalePrecisionEntryEnabled: true,
    whalePrecisionAlertEnabled: true,
    whaleHotZoneEnabled: false,
    whaleHotZoneLookback: settings.whaleHotZoneLookback,
    whaleHotZoneResolution: settings.whaleHotZoneResolution,
    whaleHotZoneSrThreshold: settings.whaleHotZoneSrThreshold,
    whaleHotZoneLayers: settings.whaleHotZoneLayers,
    whaleCoreSrZoneEnabled: false,
    whaleHyperTrendEnabled: false,
    whaleHyperTrendMult: settings.whaleHyperTrendMult,
    whaleHyperTrendSlope: settings.whaleHyperTrendSlope,
    whaleHyperTrendWidthPct: settings.whaleHyperTrendWidthPct,
    whaleDynamicRsProEnabled: false,
    whaleLiquidityBiasEnabled: false,
    whaleStructureBounceEnabled: false,
  };
}

/**
 * SMC 통합 데스크: **최강분석과 동일** 차트 레이어 + **하모닉**(통합작도와 동일) + 고래 툴킷(핫존·핵심 S/R·하이퍼·DRS·유동성 편향) 기본 ON.
 * `/api/analyze`·amx는 최강과 동일. 개별 조정은 ⚙ `modeFeatureOverrides[SMC_DESK]`.
 */
function effectiveFeatureTogglesSmcDesk(settings: UserSettings) {
  const max = effectiveFeatureTogglesMaxAnalysis(settings);
  return {
    ...max,
    showHarmonic: true,
    whaleHotZoneEnabled: true,
    whaleCoreSrZoneEnabled: true,
    whaleHyperTrendEnabled: true,
    whaleDynamicRsProEnabled: true,
    whaleLiquidityBiasEnabled: true,
  };
}

/**
 * SMC 데스크 · 델타집중: 차트 기본은 합성작도/Δ 확인용으로 최대한 절제.
 * 기존 레이어는 `chartSmcDeltaDeskShowLegacy` 또는 모드 오버라이드로 복귀 가능.
 */
function effectiveFeatureTogglesSmcDeltaDesk(settings: UserSettings) {
  return {
    ...effectiveFeatureTogglesMaxAnalysis(settings),
    showStructure: false,
    showZones: false,
    showLabels: true,
    showScenario: false,
    showFib: false,
    showRsi: false,
    showHarmonic: false,
    showChartPrimeTrendChannels: false,
    chartPrimeTrendChannelsVolumeBg: false,
    showPo3: false,
    showCandle: false,
    showBpr: false,
    showVision: false,
    showVisionTriangle: false,
    showVisionFlag: false,
    showVisionWedge: false,
    showVisionReversal: false,
    showVisionRange: false,
    showReactionZone: false,
    showWhaleZone: false,
    showLvrb: false,
    showVolatilityTrendScore: false,
    showTailongClose: false,
    showTailongCloseBreakout: false,
    showTailongCloseWick: false,
    showTailongCloseBody: false,
    showTailongCloseFlow: false,
    whaleShowForecastBoxes: false,
    whaleShowAccumulationBoxes: false,
    whaleShowDistributionBoxes: false,
    whaleHotZoneEnabled: false,
    whaleCoreSrZoneEnabled: false,
    whaleHyperTrendEnabled: false,
    whaleDynamicRsProEnabled: false,
    whaleLiquidityBiasEnabled: false,
  };
}

/** 세력/고래/CVD MVP 전용: 기존 레이어 잠금, 캔들 위 전용 신호만 노출 */
function effectiveFeatureTogglesSmartMoneyMvp(settings: UserSettings) {
  return {
    ...effectiveFeatureTogglesMaxAnalysis(settings),
    showStructure: true,
    showZones: true,
    showLabels: true,
    showScenario: true,
    showFib: false,
    showRsi: false,
    showHarmonic: false,
    showChartPrimeTrendChannels: true,
    chartPrimeTrendChannelsVolumeBg: true,
    showPo3: false,
    showCandle: false,
    showBpr: false,
    showVision: false,
    showVisionTriangle: false,
    showVisionFlag: false,
    showVisionWedge: false,
    showVisionReversal: false,
    showVisionRange: false,
    showReactionZone: false,
    showWhaleZone: false,
    showLvrb: false,
    showVolatilityTrendScore: false,
    showTailongClose: false,
    showTailongCloseBreakout: false,
    showTailongCloseWick: false,
    showTailongCloseBody: false,
    showTailongCloseFlow: false,
    whaleShowForecastBoxes: false,
    whaleShowAccumulationBoxes: false,
    whaleShowDistributionBoxes: false,
    whaleHotZoneEnabled: false,
    whaleCoreSrZoneEnabled: false,
    whaleHyperTrendEnabled: false,
    whaleDynamicRsProEnabled: false,
    whaleLiquidityBiasEnabled: false,
  };
}

/**
 * 고래(WHALE) 모드: 핵심만 기본 ON — 잡도형·하모닉·PO3·BPR·비전·반응구간·VTS·하이퍼·예고박스·타이롱 쐐기 등은 끔.
 * CP 채널(밴드) + 호가·체결 HotZone + 핵심 S/R + DRS + LQB + 정밀. LQB는 WHALE에서 보라/시안, DRS는 로즈/틴 팔레트로 겹침 감소.
 */
function effectiveFeatureTogglesWhale(settings: UserSettings) {
  return {
    showStructure: true,
    showZones: true,
    showLabels: true,
    showScenario: false,
    showFib: false,
    showRsi: true,
    showHarmonic: false,
    showChartPrimeTrendChannels: true,
    chartPrimeTrendChannelsVolumeBg: false,
    showPo3: false,
    showCandle: true,
    showBpr: false,
    showVision: false,
    showVisionTriangle: false,
    showVisionFlag: false,
    showVisionWedge: false,
    showVisionReversal: false,
    showVisionRange: false,
    showReactionZone: false,
    showWhaleZone: true,
    showLvrb: false,
    showVolatilityTrendScore: false,
    showTailongClose: true,
    showTailongCloseBreakout: true,
    showTailongCloseWick: false,
    showTailongCloseBody: false,
    showTailongCloseFlow: false,
    whaleShowForecastBoxes: false,
    whaleShowAccumulationBoxes: false,
    whaleShowDistributionBoxes: false,
    whaleOnlyLockedBoxes: false,
    whaleZigzagLen: settings.whaleZigzagLen,
    whaleFibFactor: settings.whaleFibFactor,
    whaleDeleteBrokenBoxes: settings.whaleDeleteBrokenBoxes,
    whaleBuObHex: settings.whaleBuObHex,
    whaleBeObHex: settings.whaleBeObHex,
    whaleBuBbHex: settings.whaleBuBbHex,
    whaleBeBbHex: settings.whaleBeBbHex,
    whaleSimilarityMinSamples: settings.whaleSimilarityMinSamples,
    whaleUsePrecomputedMemory: settings.whaleUsePrecomputedMemory,
    whalePredictHorizonBars: settings.whalePredictHorizonBars,
    whalePredictMinConfidence: settings.whalePredictMinConfidence,
    whalePredictShowHitRate: settings.whalePredictShowHitRate,
    whalePrecisionEntryEnabled: true,
    whalePrecisionAlertEnabled: true,
    whaleHotZoneEnabled: true,
    whaleHotZoneLookback: settings.whaleHotZoneLookback,
    whaleHotZoneResolution: settings.whaleHotZoneResolution,
    whaleHotZoneSrThreshold: settings.whaleHotZoneSrThreshold,
    whaleHotZoneLayers: settings.whaleHotZoneLayers,
    whaleCoreSrZoneEnabled: true,
    whaleHyperTrendEnabled: false,
    whaleHyperTrendMult: settings.whaleHyperTrendMult,
    whaleHyperTrendSlope: settings.whaleHyperTrendSlope,
    whaleHyperTrendWidthPct: settings.whaleHyperTrendWidthPct,
    whaleDynamicRsProEnabled: true,
    whaleLiquidityBiasEnabled: true,
    whaleStructureBounceEnabled: true,
  };
}

/**
 * AI 분석 모드: `effectiveFeatureTogglesMaxAnalysis`(합성/최강과 동일한 차트·수집 범위) + 하모닉,
 * + 키 이름이 `whale`로 시작하는 **고래 툴킷** 필드는 `effectiveFeatureTogglesWhale`과 동일 취지로 덮어씀(핫존·핵심S/R·DRS·LQB·세트 반등 등).
 */
function effectiveFeatureTogglesAiZone(settings: UserSettings) {
  const max = effectiveFeatureTogglesMaxAnalysis(settings);
  const w = effectiveFeatureTogglesWhale(settings);
  const o: Record<string, unknown> = { ...max, showHarmonic: true };
  for (const k of Object.keys(w) as (keyof typeof w)[]) {
    if (String(k).startsWith('whale')) o[k] = w[k] as unknown;
  }
  return o as ReturnType<typeof effectiveFeatureTogglesMaxAnalysis> & { showHarmonic: boolean };
}

/** `chartTradeSetupFocus` 시 CP 채널 폭에 곱하는 추가 배율 — 캔들·스윙에 더 밀착 */
export const CHART_TRADE_SETUP_FOCUS_WIDTH_MULT = 0.52;

/** CP 채널 폭(ATR×6 오프셋) — 수동 배율 × 매매착시 시 추가 좁힘. `/api/analyze?cpW`·차트 클라 계산 공통 */
export function effectiveChartPrimeChannelWidthScale(
  settings: Pick<UserSettings, 'chartPrimeTrendChannelsWidthScale' | 'chartTradeSetupFocus'>
): number {
  const raw = Number(settings.chartPrimeTrendChannelsWidthScale);
  const base = Number.isFinite(raw) ? Math.max(0.15, Math.min(4, raw)) : 1;
  return base * (settings.chartTradeSetupFocus === true ? CHART_TRADE_SETUP_FOCUS_WIDTH_MULT : 1);
}

/** 현재 모드에서 적용되는 기능 설정 (전역 + 모드별 오버라이드) */
export function getEffectiveFeatureToggles(settings: UserSettings, uiMode: UIMode) {
  if (uiMode === 'SMC_DESK' || uiMode === 'SMC_DESK_COMPOSITE') {
    const smc = effectiveFeatureTogglesSmcDesk(settings);
    const overrides = settings.modeFeatureOverrides?.[uiMode];
    return overrides ? { ...smc, ...overrides } : smc;
  }
  if (uiMode === 'SMC_DELTA_DESK') {
    const dd = effectiveFeatureTogglesSmcDeltaDesk(settings);
    const overrides = settings.modeFeatureOverrides?.[uiMode];
    return overrides ? { ...dd, ...overrides } : dd;
  }
  if (uiMode === 'SMART_MONEY_MVP') {
    const mvp = effectiveFeatureTogglesSmartMoneyMvp(settings);
    const overrides = settings.modeFeatureOverrides?.[uiMode];
    return overrides ? { ...mvp, ...overrides } : mvp;
  }
  if (uiMode === 'MAX_ANALYSIS') {
    const max = effectiveFeatureTogglesMaxAnalysis(settings);
    const overrides = settings.modeFeatureOverrides?.[uiMode];
    return overrides ? { ...max, ...overrides } : max;
  }
  /** 통합작도: 최강분석 + 하모닉·FVG(존 ON 시) 등 통합 시그널 표시 */
  if (uiMode === 'UNIFIED_DESK') {
    const max = effectiveFeatureTogglesMaxAnalysis(settings);
    const unifiedDesk = { ...max, showHarmonic: true };
    const overrides = settings.modeFeatureOverrides?.[uiMode];
    return overrides ? { ...unifiedDesk, ...overrides } : unifiedDesk;
  }
  if (uiMode === 'AI_ZONE') {
    const aiZone = effectiveFeatureTogglesAiZone(settings);
    const overrides = settings.modeFeatureOverrides?.[uiMode];
    return overrides ? { ...aiZone, ...overrides } : aiZone;
  }
  const base = {
    showStructure:
      uiMode === 'EXECUTION' ||
      uiMode === 'SMART' ||
      uiMode === 'CANDLE_ANALYSIS' ||
      uiMode === 'BIBLE_MODE' ||
      uiMode === 'TAPPOINT'
        ? true
        : settings.showStructure,
    showZones:
      uiMode === 'EXECUTION' ||
      uiMode === 'SMART' ||
      uiMode === 'CANDLE_ANALYSIS' ||
      uiMode === 'BIBLE_MODE' ||
      uiMode === 'TAPPOINT'
        ? true
        : settings.showZones,
    showLabels: settings.showLabels,
    showScenario: settings.showScenario,
    showFib: settings.showFib,
    showRsi:
      uiMode === 'EXECUTION' ||
      uiMode === 'SMART' ||
      uiMode === 'CANDLE_ANALYSIS' ||
      uiMode === 'BIBLE_MODE' ||
      uiMode === 'TAPPOINT'
        ? true
        : settings.showRsi,
    showHarmonic: settings.showHarmonic,
    showChartPrimeTrendChannels: settings.showChartPrimeTrendChannels,
    chartPrimeTrendChannelsVolumeBg: settings.chartPrimeTrendChannelsVolumeBg,
    showPo3: settings.showPo3,
    showCandle: settings.showCandle,
    showBpr: settings.showBpr,
    showVision: settings.showVision,
    showVisionTriangle: settings.showVisionTriangle,
    showVisionFlag: settings.showVisionFlag,
    showVisionWedge: settings.showVisionWedge,
    showVisionReversal: settings.showVisionReversal,
    showVisionRange: settings.showVisionRange,
    showReactionZone: settings.showReactionZone,
    showWhaleZone: settings.showWhaleZone,
    showLvrb: settings.showLvrb,
    showVolatilityTrendScore: settings.showVolatilityTrendScore,
    showTailongClose: settings.showTailongClose,
    showTailongCloseBreakout: settings.showTailongCloseBreakout,
    showTailongCloseWick: settings.showTailongCloseWick,
    showTailongCloseBody: settings.showTailongCloseBody,
    showTailongCloseFlow: settings.showTailongCloseFlow,
    whaleShowForecastBoxes: settings.whaleShowForecastBoxes,
    whaleShowAccumulationBoxes: settings.whaleShowAccumulationBoxes,
    whaleShowDistributionBoxes: settings.whaleShowDistributionBoxes,
    whaleOnlyLockedBoxes: settings.whaleOnlyLockedBoxes,
    whaleZigzagLen: settings.whaleZigzagLen,
    whaleFibFactor: settings.whaleFibFactor,
    whaleDeleteBrokenBoxes: settings.whaleDeleteBrokenBoxes,
    whaleBuObHex: settings.whaleBuObHex,
    whaleBeObHex: settings.whaleBeObHex,
    whaleBuBbHex: settings.whaleBuBbHex,
    whaleBeBbHex: settings.whaleBeBbHex,
    whaleSimilarityMinSamples: settings.whaleSimilarityMinSamples,
    whaleUsePrecomputedMemory: settings.whaleUsePrecomputedMemory,
    whalePredictHorizonBars: settings.whalePredictHorizonBars,
    whalePredictMinConfidence: settings.whalePredictMinConfidence,
    whalePredictShowHitRate: settings.whalePredictShowHitRate,
    whalePrecisionEntryEnabled: settings.whalePrecisionEntryEnabled,
    whalePrecisionAlertEnabled: settings.whalePrecisionAlertEnabled,
    whaleHotZoneEnabled: settings.whaleHotZoneEnabled,
    whaleHotZoneLookback: settings.whaleHotZoneLookback,
    whaleHotZoneResolution: settings.whaleHotZoneResolution,
    whaleHotZoneSrThreshold: settings.whaleHotZoneSrThreshold,
    whaleHotZoneLayers: settings.whaleHotZoneLayers,
    whaleCoreSrZoneEnabled: settings.whaleCoreSrZoneEnabled,
    whaleHyperTrendEnabled: settings.whaleHyperTrendEnabled,
    whaleHyperTrendMult: settings.whaleHyperTrendMult,
    whaleHyperTrendSlope: settings.whaleHyperTrendSlope,
    whaleHyperTrendWidthPct: settings.whaleHyperTrendWidthPct,
    whaleDynamicRsProEnabled: settings.whaleDynamicRsProEnabled,
    whaleLiquidityBiasEnabled: settings.whaleLiquidityBiasEnabled,
    whaleStructureBounceEnabled: settings.whaleStructureBounceEnabled,
  };
  const overrides = settings.modeFeatureOverrides?.[uiMode];
  /**
   * 핫존(눌림) 모드: 차트 지저분함 방지 — 분석 엔진 풀오버레이는 기본 OFF.
   * 존·피보·TP/SL은 `pullbackHotZoneEngine` 전용 레이어만 사용(ChartView에서 병합).
   * ⚙ 모드별 오버라이드로 구조·고래·CP채널 등 다시 켤 수 있음.
   */
  if (uiMode === 'HOT_ZONE') {
    const hz = {
      ...base,
      showStructure: false,
      showZones: false,
      showLabels: false,
      showScenario: false,
      showFib: false,
      showRsi: false,
      showHarmonic: false,
      showChartPrimeTrendChannels: false,
      chartPrimeTrendChannelsVolumeBg: false,
      showPo3: false,
      showCandle: false,
      showBpr: false,
      showVision: false,
      showVisionTriangle: false,
      showVisionFlag: false,
      showVisionWedge: false,
      showVisionReversal: false,
      showVisionRange: false,
      showReactionZone: false,
      showWhaleZone: false,
      showLvrb: false,
      showVolatilityTrendScore: false,
      showTailongClose: false,
      showTailongCloseBreakout: false,
      showTailongCloseWick: false,
      showTailongCloseBody: false,
      showTailongCloseFlow: false,
      whaleHotZoneEnabled: false,
      whaleCoreSrZoneEnabled: false,
      whaleHyperTrendEnabled: false,
      whaleDynamicRsProEnabled: false,
      whaleLiquidityBiasEnabled: false,
      whaleStructureBounceEnabled: false,
    };
    return overrides ? { ...hz, ...overrides } : hz;
  }
  /** 고래 모드: 깔끔·핵심 프리셋 — DRS+HotZone+핵심S/R+LQB+CP·정밀 (잡도형·비전·박스 등 끔). 오버라이드로 복원 가능. */
  if (uiMode === 'WHALE') {
    const w = effectiveFeatureTogglesWhale(settings);
    return overrides ? { ...w, ...overrides } : w;
  }
  /** 실행 모드도 고래 툴킷 기본값을 동일 적용 (사용자 요청) */
  if (uiMode === 'EXECUTION') {
    const executionWhaleDefaults = {
      showWhaleZone: true,
      showChartPrimeTrendChannels: true,
      whaleHotZoneEnabled: true,
      whaleCoreSrZoneEnabled: true,
      whaleHyperTrendEnabled: true,
      whaleDynamicRsProEnabled: true,
      whaleLiquidityBiasEnabled: true,
    };
    return { ...base, ...executionWhaleDefaults, ...(overrides || {}) };
  }
  if (!overrides) return base;
  return { ...base, ...overrides };
}

/** 예전 `AI_CORE` 키 → `MAX_ANALYSIS` (로컬·서버 설정 JSON 호환) */
function migrateLegacyModeFeatureOverrides(mfo: ModeFeatureOverrides | undefined): ModeFeatureOverrides | undefined {
  if (!mfo || typeof mfo !== 'object') return mfo;
  const raw = mfo as Record<string, unknown>;
  if (!('AI_CORE' in raw)) return mfo;
  const next = { ...raw } as Record<string, unknown>;
  if (!('MAX_ANALYSIS' in next)) next.MAX_ANALYSIS = raw.AI_CORE;
  delete next.AI_CORE;
  return next as ModeFeatureOverrides;
}

export function loadSettings(): UserSettings {
  try {
    const parsed =
      readStoredSettingsCandidate([
        currentSettingsKey(),
        scopedKey(BACKUP_KEY),
        scopedKey(LAST_GOOD_KEY),
        KEY, // legacy fallback
      ]) ?? null;
    if (parsed) {
      const merged = { ...defaultSettings, ...parsed };
      merged.pageLayout = mergePageLayout({
        ...defaultPageLayout,
        ...(parsed.pageLayout && typeof parsed.pageLayout === 'object' ? parsed.pageLayout : {}),
      });
      merged.modeFeatureOverrides = migrateLegacyModeFeatureOverrides(merged.modeFeatureOverrides);
      if (!('aiCompressionPreset' in parsed)) {
        merged.aiCompressionPreset = 'custom';
      }
      if (!('institutionalBandTouchReinforced' in parsed)) {
        merged.institutionalBandTouchReinforced =
          merged.institutionalBandTouchPrecision === true || merged.institutionalBandTouchConfluence === true;
      }
      coerceInstitutionalBandTouchTierMask(merged);
      return merged;
    }
  } catch {}
  const d = { ...defaultSettings };
  coerceInstitutionalBandTouchTierMask(d);
  return d;
}

export function saveSettings(s: Partial<UserSettings>) {
  try {
    const curr = loadSettings();
    const next = { ...defaultSettings, ...curr, ...s } as UserSettings;
    next.pageLayout = mergePageLayout({
      ...curr.pageLayout,
      ...(s.pageLayout && typeof s.pageLayout === 'object' ? s.pageLayout : {}),
    });
    coerceInstitutionalBandTouchTierMask(next);
    if (typeof window !== 'undefined') {
      const payload = JSON.stringify(next);
      window.localStorage.setItem(currentSettingsKey(), payload);
      // Upgrade-safe backups: keep redundant snapshots per user scope.
      window.localStorage.setItem(scopedKey(BACKUP_KEY), payload);
      window.localStorage.setItem(scopedKey(LAST_GOOD_KEY), payload);
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      void fetch('/api/user-settings', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: next }),
      }).catch(() => {});
    }
    return next;
  } catch {}
  return loadSettings();
}

export async function syncSettingsFromServer(): Promise<UserSettings> {
  const local = loadSettings();
  if (typeof window === 'undefined') return local;
  try {
    const res = await fetch('/api/user-settings', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return local;
    const data = await res.json() as { settings?: Partial<UserSettings> };
    const srv = data.settings || {};
    const merged = { ...defaultSettings, ...local, ...srv };
    merged.pageLayout = mergePageLayout({
      ...defaultPageLayout,
      ...(local.pageLayout && typeof local.pageLayout === 'object' ? local.pageLayout : {}),
      ...(srv.pageLayout && typeof srv.pageLayout === 'object' ? srv.pageLayout : {}),
    });
    merged.modeFeatureOverrides = migrateLegacyModeFeatureOverrides(merged.modeFeatureOverrides);
    coerceInstitutionalBandTouchTierMask(merged);
    const payload = JSON.stringify(merged);
    window.localStorage.setItem(currentSettingsKey(), payload);
    window.localStorage.setItem(scopedKey(BACKUP_KEY), payload);
    window.localStorage.setItem(scopedKey(LAST_GOOD_KEY), payload);
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    return merged;
  } catch {
    return local;
  }
}
