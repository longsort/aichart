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
  /**
   * 월초 데스크: 전월 마감 품질·월봉 개장일 안착/실패 판단 카드 중심.
   * 차트·엔진 수집은 AI_ZONE과 동일 프리셋(amx·고래 툴킷).
   */
  | 'MONTH_START_DESK'
  /**
   * 존·라인 개선: LinReg 추세선 + CP 밴드 채널 + HotZone + Strike E/SL/TP + 안착캔들.
   * 마감·안착 대비 차트에 parkf·cptc·hotzone을 유지(Strike 레이어는 이 3종을 숨김).
   */
  | 'ZONE_LINE_PRO'
  /** 캔들+브리핑 융합 모드: 캔들 흐름 요약과 실행 브리핑을 한 카드로 결합 */
  | 'FUSION_MODE'
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
  | 'SMART_MONEY_MVP'
  /**
   * 벤치마크·레퍼런스: GitHub OSS·차트 라이브러리·ailongshort 기능 대조 보드.
   * 차트 엔진 수집(amx) 없음 — 정적 레퍼런스·비교 UI 중심.
   */
  | 'REFERENCE_DESK'
  /**
   * 통합·분석: 차트 캔들분석(존·아이콘·구조·밴드) + 카드분석(롱/숏·고래·VRVP·타임라인) ARES/TV식 한 화면.
   * amx=1 · monthDesk 통합펄스 + mergedAdvanced 레이어.
   */
  | 'MERGED_ANALYSIS_DESK';

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
  /** 우측 축·시간축 등 차트 스케일 글자 크기 (lightweight-charts layout.fontSize, 1~20 사용자 입력) */
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
   * 롱/숏 확정·타점 단계(후보/확정/타점진입/무효) 시 텔레그램 본문 알림.
   * `telegramMergedDeskAutoEnabled` ON이면 통합·분석 경로가 우선(이 설정 무시).
   * `telegramHqZoneTouchEnabled` 가 ON이고 통합텔레 OFF이면 무시됨(진입존만 발송).
   * `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` 필요.
   */
  telegramConfirmEnabled: boolean;
  /** 텔레 확정 알림에 「후보 4/5」 단계도 포함 */
  telegramConfirmCandidate: boolean;
  /** 확정·★타점·TP·진입존 터치 텔레에 캔들 PNG 첨부 (기본 ON). */
  telegramConfirmChartImageEnabled: boolean;
  /**
   * 서버 크론: 통합·분석 스윙중투 ENTER·★타점·TP·무효를 앱 미접속으로 분석→차트 PNG→텔레그램.
   * 기본 ON. OFF면 레거시 HQ/확정/HTF 경로.
   */
  telegramMergedDeskAutoEnabled: boolean;
  /** 통합텔레 — 플랜 ENTER(자리 대기) 발송 */
  telegramSendPlanEnterEnabled: boolean;
  /** 통합텔레 — E 접촉·★타점·돌파안착 발송 */
  telegramSendAtEntryEnabled: boolean;
  /** 통합텔레 — TP1/2/3 도달 발송 */
  telegramSendTpHitEnabled: boolean;
  /** 통합텔레 — 무효/INV 이탈 발송 + PNG */
  telegramSendInvalidEnabled: boolean;
  /** 통합텔레 — ENTER류는 ActiveTrade 진입허용 필수 */
  telegramSendRequireEntryAllowed: boolean;
  /** 통합텔레 — 마스터 잠금/WAIT면 ENTER류 스킵 */
  telegramSendRequireMasterUnlock: boolean;
  /** 통합텔레 — 뉴스 임박 창이면 ENTER류 스킵 */
  telegramSendNewsSkipEnter: boolean;
  /**
   * 고확률 롱/숏 진입 zone 터치 시 서버 크론이 차트 캡처→텔레그램 (앱 미접속).
   * 통합텔레 ON이면 ENTER와 함께 보조(되돌림 터치). 기본 OFF(스팸 방지).
   * 통합텔레 OFF + 이 설정 ON이면 기존처럼 진입존만 발송.
   */
  telegramHqZoneTouchEnabled: boolean;
  /**
   * 기관밴드 반응·HotZone·안착구간 터치 시 서버가 차트 PNG를 텔레그램으로 전송 (앱 미접속).
   * 기본 ON. 크론 `/api/cron/telegram-auto-alert`.
   */
  telegramZoneTouchAlertEnabled: boolean;
  /**
   * 핵심 추천: 롱/숏 진입자리 · $$$$ 돈구간 첫 터치 → 텔레그램(+PNG).
   * 서버 크론 자동스캔 · 앱 미접속. 기본 ON.
   */
  telegramMoneyEntryTouchEnabled: boolean;
  /**
   * 1분 봉(BTC/ETH): 로켓·기관밴드·HotZone·존/선 접근·OB/구조 확정이 잡힐 때 텔레그램 자동 전송.
   * 수동 테스트 버튼과 무관 — 사용자가 여기만 켜면 동작.
   * HQ 진입존 모드 ON이면 비활성.
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
   * 멀티 TF(1m~1M): `telegramMultiTfSymbols`×`telegramMultiTfTimeframes`마다 /api/analyze로 백그라운드 감지.
   * 통합분석 차트 TF와 동일. 진입존텔레 ON이면 HQ 터치 경로가 우선.
   */
  telegramMultiTfEnabled: boolean;
  /** 멀티TF 텔레 심볼(엔진 HTF 자동과 동일하게 BTC/ETHUSDT 권장). */
  telegramMultiTfSymbols: string[];
  /** 멀티TF 텔레 타임프레임(1h·4h·1d·1w·1M 권장 — 그 외·저번 TF는 워처에서 제외). */
  telegramMultiTfTimeframes: string[];
  /** 멀티TF: 심볼×TF **한 바퀴** 끝난 뒤 다음 루프까지 대기(초, 30~600). */
  telegramMultiTfIntervalSec: number;
  /**
   * 서버 크론(`/api/cron/mtf-board-telegram`): MTF 보드 카드를 PNG로 텔레 전송.
   * `telegramMultiTfSymbols` 를 사용합니다.
   */
  telegramMtfBoardImageEnabled: boolean;
  /** MTF 보드 PNG 전송 최소 간격(분, 5~180). */
  telegramMtfBoardMinIntervalMin: number;
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
   * TV 캡처형 구조 롱/숏: EMA200 + 리본(8/55) + BOS/CHOCH/MSB 정렬 시 L/S 핀·스탠스(참고·확정 아님).
   * 통합·분석 데스크에서는 엔진에 기본 포함.
   */
  showTvStructureLs: boolean;
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
  /** 볼트·거래량 컨플루언스(통합작도 데스크) */
  chartBoltVolumeConfluence: boolean;
  /** 바이낸스 등 taker 매수 체결량이 있을 때 체결 우세 막대 라벨 */
  chartVolumeTakerFlowMarkers: boolean;
  /** 존 돌파 인정 시 최소 몸통/레인지 비율(%). 0이면 필터 없음 */
  chartVolumeZoneBreakMinBodyPct: number;
  /** 거래량 패널 마커 최소 봉 간격(0=제한 없음, 2=기본·인접 봉은 우선순위로 압축) */
  chartVolumeMarkerMinBarGap: number;
  /** 통합작도(병합 고급 데스크): 집중 덱 모드 — 끄면 최강분석급 풀 병합 */
  chartMergedAdvancedFocusDeck: boolean;
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
  /**
   * 마감·안착: 스윙 EQ50(중투) 참고대 + 무효 + TP1~3 가로선(클라이언트 전용, 참고용).
   */
  chartMonthDeskTypeomEnabled: boolean;
  /**
   * 마감 타점 존·가로선: time2에서 **시간축 가시 우끝(빈 축)** 까지 채우는 비율(0~100).
   * 0=time2에서 멈춤, 100=우끝까지(마지막 봉 X가 아닌 플롯 우측 기준).
   */
  chartMonthDeskTypeomRightExtendPct: number;
  /**
   * 마감·안착 HUD 세션 기준 문구: `chart_candle`=선택 TF 봉 종가, `utc_calendar`=UTC 일 경계 근사(참고만).
   */
  chartMonthDeskSessionBasis: 'chart_candle' | 'utc_calendar';
  /**
   * 마감·안착: `pullbackHotZoneEngine`(phz-*) 눌림 핫존 차트·우측 HUD 표시. 끄면 엔진 계산도 생략.
   */
  chartMonthDeskPullbackHotZoneEnabled: boolean;
  /**
   * 모든 TF 차트: 롱/숏 구간 + 핵심 타점(E) + 손절(SL) + TP1~3 가로선·HUD(Trade Atlas).
   * 분·시·일·주·월 봉 공통 — analyze·존·ATR·구조 교차 합성(참고용).
   */
  chartTradeAtlasEnabled: boolean;
  chartTradeAtlasShowHud: boolean;
  chartTradeAtlasShowZones: boolean;
  chartTradeAtlasShowLevels: boolean;
  /** 벤치마크 LWC — 구조(BOS/CHoCH·키레벨·S/R) */
  chartReferenceDeskLayerStructure: boolean;
  /** 벤치마크 LWC — 존(FVG·OB·반응·major S/R) */
  chartReferenceDeskLayerZones: boolean;
  /** 벤치마크 LWC — 패턴(하모닉·patternVision) */
  chartReferenceDeskLayerPatterns: boolean;
  /** 벤치마크 LWC — MTF 마커(보드 신호·multiTF 요약) */
  chartReferenceDeskLayerMtfMarkers: boolean;
  /** assets/CHART_OVERLAY_KEYS 작도 규칙(EQL 점선·BPR·OB 완화·PRZ 색) */
  chartReferenceDeskAssetsDrawingGuide: boolean;
  /** 마감·안착: 여러 존 중 핵심 롱 지지·반등 구간 1곳 강조 */
  chartMonthDeskCoreLongHighlightEnabled: boolean;
  /** 마감·안착: SMC 교재식 CHoCH·BOS·OB·플레이북 단계 차트·범례 */
  chartMonthDeskSmcDiagramEnabled: boolean;
  /** 마감·안착 SMC 밀도 — lite: CHoCH·BOS 2개·OB 1·타점존 1 / full: 플레이북 전체 존 */
  chartMonthDeskSmcDiagramDensity: 'lite' | 'full';
  /** 마감·안착: $$$$ 롱/숏 돈구간(EQH·EQL·내부구간·스윕 유동성 풀) */
  chartMonthDeskMoneyZoneEnabled: boolean;
  /**
   * 마감·안착 **간결+요약** 한 칩 — 라인요약(우측 카드·E/SL/TP) ON/OFF만.
   * zone·차트 존은 이 칩과 무관(번갈아 사라지지 않음). 차트 밀도는 chartMonthDeskOverlayDensity 별도.
   */
  chartMonthDeskClearSummaryEnabled: boolean;
  /**
   * 마감·안착 차트 밀도: `clear`는 타점과 겹치는 phz 장식(TP 라벨·경로 번호·핫태그 등)을 빼고 그리기 순서 정리(기본).
   * `rich`는 핫존 모드와 동일하게 phz 전부 표시.
   */
  chartMonthDeskOverlayDensity: 'clear' | 'rich';
  /**
   * 마감·안착: SMC $$$$·BOS/CHOCH·풀 zone을 차트에 전부 표시.
   * true = 풀별 zone·마크 표시 / false(기본) = 핵심 $$$$ 1개 + 연합 E·SL·TP만 병합.
   */
  chartMonthDeskFullSmcLayers: boolean;
  /**
   * 마감·안착: 연합·타입옴 zone 숨김·라벨 축소(옵트인). 기본 false=분석 레이어 전부 유지.
   */
  chartMonthDeskCompactOverlayLabels: boolean;
  /** 마감·안착: 플랜·핵심 라인 우측 `[상향 실패]`·`[마감 성공]` 등 기능별 마감·안착 라벨. */
  chartMonthDeskFeatureSettleLabels: boolean;
  /**
   * 우측 라인 마감·안착 칩 밀도.
   * `summary`(기본): 진입·손절 + 도달한 TP만 — TP마다 [실패] 남발 방지.
   * `full`: 모든 라인에 칩. `off`: 칩 없음(가격만).
   */
  chartMonthDeskSettleLabelMode: 'off' | 'summary' | 'full';
  /** 마감·안착: 좌측 상단 기능별 상태 스트립(우측 라벨과 중복). 기본 OFF. */
  chartMonthDeskSettleFeatureStrip: boolean;
  /** 마감·안착: 돌파·안착 단계를 캔들 본체 색으로 표시. 기본 OFF(라벨 우선). */
  chartMonthDeskSettleCandlePaint: boolean;
  /** 마감·안착 차트 레이어 — strike(타점만) / standard / full */
  chartMonthDeskLayerMode: 'strike' | 'standard' | 'full' | 'zoneLinePro';
  /** 마감·안착 Strike Desk — 핵심 롱·숏 E/SL/TP 통합 레이어·HUD. */
  chartMonthDeskStrikeDeskEnabled: boolean;
  /**
   * 마감·안착 차트 플로팅 HUD(게이지·Strike카드·핫존카드 등).
   * false(기본)=캔들·zone·line만. true=기존 차트 카드 HUD 복원.
   */
  chartMonthDeskFloatingHudEnabled: boolean;
  /** 마감·안착 — 보드+캔들+Strike 병합 시그널 (zone·line HTML 오버레이) */
  chartMonthDeskMergedSignalEnabled: boolean;
  /**
   * 연합 데스크 밴드 — 기관밴드·로켓 유지, CP·LinReg·HotZone·Strike·보드·캔들을
   * **별도 LineSeries** 스텝 밴드로 표시 (기관밴드와 색·가격 분리).
   */
  chartMonthDeskFusionDeskBandEnabled: boolean;
  /** Triple·연합밴드 — BigBeluga 시그널 밴드 (1=안쪽, 2=중간, 3=바깥, all=전부) */
  chartTripleTrendSignalBand: '1' | '2' | '3' | 'all';
  /** Triple·연합밴드 — 추세 전환 세로 점선 (BigBeluga trend_change) */
  chartTripleTrendChangeLinesEnabled: boolean;
  /** 통합·분석 — 초록/빨강 기관 SuperTrend 존상·존하 밴드 (마감·안착에서 이전) */
  chartMergedInstitutionalBandEnabled: boolean;
  /**
   * 깔끔 zone·line — 카드·글자 없이 존 터치 고합류 롱/숏만 캔들 ▲/▼ 아이콘.
   * 기관밴드·연합밴드·로켓·Strike 존 면은 유지.
   */
  chartMonthDeskCleanIconSignalsEnabled: boolean;
  /**
   * 아틀라스 펄스 데스크 — 기관밴드·로켓 유지, 돌파⚡·안착◆·확인★·E/SL/TP·▲▼ 타점을
   * 카드 없이 차트 zone·line·아이콘만으로 통합 표시.
   */
  chartMonthDeskAtlasPulseDeskEnabled: boolean;
  /**
   * 통합 펄스 엔진 — 상단 칩(Strike·밴드·안착·존·가로선 등)을 하나로 병합.
   * 기관밴드·로켓 유지, 차트는 ⚡◆★▲▼ + E/SL/TP만.
   */
  chartMonthDeskUnifiedPulseEngineEnabled: boolean;
  /** 마감·안착 — 차트 클릭 시 MTF 정밀 핫존·타점·반등 zone·line */
  chartMonthDeskClickPrecisionEnabled: boolean;
  /** 마감·안착: 핵심 숏 저항·하락 zone·라인 강조. */
  chartMonthDeskCoreShortHighlightEnabled: boolean;
  /** 마감·안착: 돌파 후 상·하방 연동 경로 점선(↑↓ TP 체인). 기본 ON. */
  chartMonthDeskBreakoutFollowPath: boolean;
  /** 마감·안착: ParkF LinReg + 고래 ALR 추세·채널 (미래 연장). 기본 OFF — 고래 차트 팩 사용 */
  chartMonthDeskLinRegTrendlinesEnabled: boolean;
  /** 마감·안착: 고래 모드 ChartPrime(cptc) + ParkF 피벗 TL + AI 압축 존. 기본 ON */
  chartMonthDeskWhaleChartPackEnabled: boolean;
  /** 마감·안착: 차트 OHLC·거래량 = Bitget BTCUSDT.P (USDT-M). OFF면 바이낸스 현물 */
  chartMonthDeskBitgetCandles: boolean;
  /** 마감·안착: 미래 예측(고스트) 캔들 + 타점 라벨 (피벗 채널 추세선 없음) */
  chartMonthDeskAdvancedPathEnabled: boolean;
  /**
   * 통합·분석 Mirage zone 면 라벨 — 짧은 표시(기본 ON).
   * OFF면 기존처럼 긴 한글 면 라벨.
   */
  chartMirageZoneFaceCompact: boolean;
  /** Mirage zone 면 라벨 언어 — ko 짧은 한글 / en 약어 */
  chartMirageZoneFaceLang: 'ko' | 'en';
  /**
   * Mirage zone 면 신호 표시 — progressive: 모바일에서 접근·선택 시만 2번째 토큰.
   * always: 항상 2토큰까지 표시.
   */
  chartMirageZoneFaceReveal: 'always' | 'progressive';
  /** 통합·분석 — 고신뢰 캔들 패턴 1개 + 넥라인 (데스크 방향 정렬) */
  chartMergedDeskActionablePatternEnabled: boolean;
  /** 통합·분석 — 와이코프/엘리엇/삼각·쐐기 사이클 상단 진행 + TR 면·가격선 */
  chartMergedDeskCycleProgressEnabled: boolean;
  /** 통합·분석 — 실전연습 큐(금지/지정가/E체결후보). 자동주문 아님 */
  chartMergedDeskLivePracticeCueEnabled: boolean;
  /** 통합·분석 — 차트 위 존·면 글자 라벨 ON/OFF (면·선은 유지) */
  chartMergedDeskOverlayLabelsEnabled: boolean;
  /**
   * 통합·분석 — 우측 가격축 알약(E/SL/TP·종가마감 createPriceLine 제목) ON/OFF.
   * 차트 본문 HTML 라벨(`chartMergedDeskOverlayLabelsEnabled`)과 분리.
   */
  chartMergedDeskRightAxisPricesEnabled: boolean;
  /**
   * 통합·분석 VRVP 최다거래(POC) 막대 길이.
   * short=좌측 짧은 막대 / extend20=마지막 봉+우측 20봉까지 가로 연장
   */
  chartMergedDeskVrvpPocExtend: 'short' | 'extend20';
  /**
   * 통합·분석 가로 점선 시각 정리(삭제·숨김 아님).
   * classic=기존 전폭 / soft=전폭·연하게 / tail=1차선 전폭·보조선 우측꼬리(+20)
   */
  chartMergedDeskHLineClean: 'classic' | 'soft' | 'tail';
  /**
   * AI 파랑빨강띠 매매 스타일 — 단타(단기)·스윙·중투(장기) 표결·호라이즌 가중.
   */
  chartMergedDeskRbTradeStyle: 'scalp' | 'swing' | 'mid';
  /** 통합·분석 — assets 353 이미지 참조 AI 자동 작도 */
  chartMergedDeskAssetsChartAiEnabled: boolean;
  /** 통합·분석 — Super AI (353 전체 융합·실시간 적응 작도) */
  chartMergedDeskSuperAiEnabled: boolean;
  /** 통합·분석 — Zone Battle AI 카드(HUD) 표시 */
  chartMergedDeskZoneBattleHudEnabled: boolean;
  /** 통합·분석 — 통합구름(롱초록·숏빨강 ST 구름, SMC 작도와 별도) */
  chartMergedDeskUnifiedCloudEnabled: boolean;
  /** 통합·분석 — btccion 스타일 캔들 작도(반응/돌파/무효/헌트/경로/빔) */
  chartMergedDeskBtccionDrawEnabled: boolean;
  /** 통합·분석 — 파란·빨간 평행채널 띠 */
  chartMergedDeskBlueRedChannelsEnabled: boolean;
  /** 통합·분석 — AI톤 팔레트(배경·기능색). OFF면 기존색 유지 */
  chartMergedDeskAiToneEnabled: boolean;
  /**
   * 통합차트 유로맵 — 레이어별 ON/OFF·색·농도.
   * 키는 `lib/mergedDeskEuromapStyle.ts` 레이어 id.
   */
  chartMergedDeskEuromap: Record<string, { on?: boolean; hex?: string; opacity?: number }>;
  /** 통합차트 존·면 전체 농도(15~100). 낮을수록 연함 */
  chartMergedDeskZoneFillOpacity: number;
  /** 파란·빨간 띠 — 단기 채널 표시 */
  chartMergedDeskRbShowShort: boolean;
  /** 파란·빨간 띠 — 장기 채널 표시 */
  chartMergedDeskRbShowLong: boolean;
  /** 파란·빨간 띠 — 단기∩장기 중착 복도 표시 */
  chartMergedDeskRbShowConfluence: boolean;
  /** 파란·빨간 띠 — 상/하 경계선 표시 */
  chartMergedDeskRbShowEdges: boolean;
  /** 파란·빨간 띠 — 중심선 표시 */
  chartMergedDeskRbShowMid: boolean;
  /** 파란·빨간 띠 — 채널 라벨 표시 */
  chartMergedDeskRbShowLabels: boolean;
  /** 파란·빨간 띠 — 상승 통로(초록) 색 */
  chartMergedDeskRbBullHex: string;
  /** 파란·빨간 띠 — 하락 통로(빨강) 색 */
  chartMergedDeskRbBearHex: string;
  /** 파란·빨간 띠 — 중착 복도 색 */
  chartMergedDeskRbConfluenceHex: string;
  /** 파란·빨간 띠 — 면 투명도(0~60%) */
  chartMergedDeskRbFillOpacity: number;
  /** 파란·빨간 띠 — 경계선 굵기(1~4px) */
  chartMergedDeskRbLineWidth: number;
  /** 파란·빨간 띠 — 채널 폭 배율(0.5~2.0x) */
  chartMergedDeskRbWidthScale: number;
  /** 파란·빨간 띠 — 최소 품질(이하 채널 숨김, 0=전부) */
  chartMergedDeskRbMinQuality: number;
  /** 파란·빨간 띠 눌림 진입 zone (기관밴드·$$$$·로켓·거래량 합류) */
  chartMergedDeskRbPullbackEntryEnabled: boolean;
  /** 눌림 타점 — E/SL/TP/무효 가격선 표시 */
  chartMergedDeskRbPullbackLinesEnabled: boolean;
  /** 눌림 타점 — 이 점수 미만이면 작도하지 않음 */
  chartMergedDeskRbPullbackMinScore: number;
  /** 눌림 타점 — 상위 채널 역행 보조 타점도 표시 */
  chartMergedDeskRbPullbackCounterTrend: boolean;
  /** 라벨 개별 이동 — 켜면 저장된 라벨 위치가 적용되고 차트에서 드래그로 옮길 수 있다 */
  chartLabelIndividualMove: boolean;
  /** 파랑·빨강 띠 레일을 붙일 자리 — 자동/꼬리/몸통 */
  chartMergedDeskRbAnchorMode: 'auto' | 'wick' | 'body';
  /** 파랑·빨강 띠 라벨 글자 크기(px) */
  chartMergedDeskRbLabelFontSize: number;
  /** 파랑·빨강 띠 라벨 좌우 이동(px, 음수는 왼쪽) */
  chartMergedDeskRbLabelShiftX: number;
  /** 파랑·빨강 띠 라벨 위아래 이동(px, 음수는 위) */
  chartMergedDeskRbLabelShiftY: number;
  /** 채널 핵심 — 돌파해야 할 자리·안착 zone */
  chartMergedDeskRbCoreZonesEnabled: boolean;
  /** 파란·빨간 띠 ↔ 거래량 도식(상승=초록 / 하락=빨강 / 횡보=수급비율, 수급 합류) */
  chartMergedDeskRbVolumeSyncEnabled: boolean;
  /** 통합·분석 — 선진 거래량(매수/매도 스택 + 진입참고 마커). 자동주문 아님 */
  chartMergedDeskAdvVolumeEnabled: boolean;
  /** 파랑·빨강 띠 — Zone패널(전투·수급·돌파) 합류 AI 채널 면 */
  chartMergedDeskRbAiZoneFaceEnabled: boolean;
  /** 채널 핵심 — 돌파/안착/실패 봉 위아래 이모티콘 */
  chartMergedDeskRbCoreMarkersEnabled: boolean;
  /** 채널 핵심 — 돌파·안착·실패 캔들 색 */
  chartMergedDeskRbCoreCandlePaintEnabled: boolean;
  /** 통합·분석 — 스윙작도 레이어 */
  chartMergedDeskSwingDrawEnabled: boolean;
  /** 통합·분석 — 라벨 기본 정렬(좌·중·우). 개별 저장값이 있으면 개별 우선 */
  chartMergedDeskLabelAlignDefault: 'left' | 'center' | 'right';
  /** 고래 모드: Multi-Anchored LinReg 채널(ALR) */
  whaleAnchoredLinRegEnabled: boolean;
  /** 고래 ALR: 로그 스케일 회귀 */
  whaleAlrLogScale: boolean;
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
  telegramConfirmEnabled: false,
  telegramConfirmCandidate: false,
  telegramConfirmChartImageEnabled: true,
  telegramMergedDeskAutoEnabled: true,
  telegramSendPlanEnterEnabled: true,
  telegramSendAtEntryEnabled: true,
  telegramSendTpHitEnabled: true,
  telegramSendInvalidEnabled: true,
  telegramSendRequireEntryAllowed: true,
  telegramSendRequireMasterUnlock: true,
  telegramSendNewsSkipEnter: true,
  telegramHqZoneTouchEnabled: false,
  telegramZoneTouchAlertEnabled: true,
  telegramMoneyEntryTouchEnabled: true,
  telegramAuto1mEnabled: false,
  telegramAuto1mImageMode: 'smart',
  telegramHtfZonePackEnabled: false,
  telegramHtfSealedBarOnly: true,
  telegramMultiTfEnabled: false,
  telegramMultiTfSymbols: ['BTCUSDT', 'ETHUSDT'],
  telegramMultiTfTimeframes: ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'],
  telegramMultiTfIntervalSec: 120,
  telegramMtfBoardImageEnabled: false,
  telegramMtfBoardMinIntervalMin: 15,
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
  showTvStructureLs: false,
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
  chartMergedAdvancedFocusDeck: true,
  chartBoltVolumeConfluence: true,
  chartCandleClassicUpHex: '#22C55E',
  chartCandleClassicDownHex: '#EF4444',
  chartCandleMonoUpHex: '#FFFFFF',
  chartCandleMonoDownBodyHex: '#10151D',
  chartCandleMonoOutlineHex: '#FFFFFF',
  chartCandleCompositeLayers: true,
  chartLineZoneProximitySensitivity: 1,
  chartSmcStructureTraceBars: 2,
  chartMonthDeskTypeomEnabled: true,
  chartMonthDeskTypeomRightExtendPct: 0,
  chartMonthDeskSessionBasis: 'chart_candle',
  chartMonthDeskPullbackHotZoneEnabled: true,
  chartTradeAtlasEnabled: true,
  chartTradeAtlasShowHud: true,
  chartTradeAtlasShowZones: true,
  chartTradeAtlasShowLevels: true,
  chartReferenceDeskLayerStructure: true,
  chartReferenceDeskLayerZones: true,
  chartReferenceDeskLayerPatterns: true,
  chartReferenceDeskLayerMtfMarkers: true,
  chartReferenceDeskAssetsDrawingGuide: true,
  chartMonthDeskCoreLongHighlightEnabled: true,
  chartMonthDeskSmcDiagramEnabled: true,
  chartMonthDeskSmcDiagramDensity: 'lite',
  chartMonthDeskMoneyZoneEnabled: true,
  chartMonthDeskClearSummaryEnabled: false,
  chartMonthDeskOverlayDensity: 'clear',
  chartMonthDeskFullSmcLayers: true,
  chartMonthDeskCompactOverlayLabels: false,
  chartMonthDeskFeatureSettleLabels: false,
  chartMonthDeskSettleLabelMode: 'off',
  chartMonthDeskSettleFeatureStrip: false,
  chartMonthDeskSettleCandlePaint: true,
  chartMonthDeskLayerMode: 'strike',
  chartMonthDeskStrikeDeskEnabled: true,
  chartMonthDeskFloatingHudEnabled: false,
  chartMonthDeskClickPrecisionEnabled: true,
  chartMonthDeskMergedSignalEnabled: false,
  chartMonthDeskFusionDeskBandEnabled: true,
  chartTripleTrendSignalBand: '3',
  chartTripleTrendChangeLinesEnabled: false,
  chartMergedInstitutionalBandEnabled: true,
  chartMonthDeskCleanIconSignalsEnabled: true,
  chartMonthDeskAtlasPulseDeskEnabled: true,
  chartMonthDeskUnifiedPulseEngineEnabled: true,
  chartMonthDeskCoreShortHighlightEnabled: true,
  chartMonthDeskBreakoutFollowPath: true,
  chartMonthDeskLinRegTrendlinesEnabled: false,
  chartMonthDeskWhaleChartPackEnabled: true,
  chartMonthDeskBitgetCandles: true,
  chartMonthDeskAdvancedPathEnabled: true,
  chartMirageZoneFaceCompact: true,
  chartMirageZoneFaceLang: 'ko',
  chartMirageZoneFaceReveal: 'progressive',
  chartMergedDeskActionablePatternEnabled: true,
  chartMergedDeskCycleProgressEnabled: true,
  chartMergedDeskLivePracticeCueEnabled: true,
  chartMergedDeskOverlayLabelsEnabled: true,
  chartMergedDeskRightAxisPricesEnabled: true,
  chartMergedDeskVrvpPocExtend: 'short',
  chartMergedDeskHLineClean: 'tail',
  chartMergedDeskRbTradeStyle: 'swing',
  chartMergedDeskAssetsChartAiEnabled: true,
  chartMergedDeskSuperAiEnabled: true,
  chartMergedDeskZoneBattleHudEnabled: true,
  chartMergedDeskUnifiedCloudEnabled: true,
  chartMergedDeskBtccionDrawEnabled: true,
  chartMergedDeskBlueRedChannelsEnabled: true,
  chartMergedDeskAiToneEnabled: false,
  chartMergedDeskEuromap: {},
  chartMergedDeskZoneFillOpacity: 46,
  chartMergedDeskRbShowShort: true,
  chartMergedDeskRbShowLong: true,
  chartMergedDeskRbShowConfluence: true,
  chartMergedDeskRbShowEdges: true,
  chartMergedDeskRbShowMid: true,
  chartMergedDeskRbShowLabels: true,
  chartMergedDeskRbBullHex: '#22C55E',
  chartMergedDeskRbBearHex: '#EF4444',
  chartMergedDeskRbConfluenceHex: '#CA8A04',
  chartMergedDeskRbFillOpacity: 18,
  chartMergedDeskRbLineWidth: 2.5,
  chartMergedDeskRbWidthScale: 1,
  chartMergedDeskRbMinQuality: 0,
  chartMergedDeskRbPullbackEntryEnabled: true,
  chartMergedDeskRbPullbackLinesEnabled: true,
  chartMergedDeskRbPullbackMinScore: 45,
  chartMergedDeskRbPullbackCounterTrend: true,
  chartLabelIndividualMove: false,
  chartMergedDeskRbAnchorMode: 'auto',
  chartMergedDeskRbLabelFontSize: 10,
  chartMergedDeskRbLabelShiftX: 0,
  chartMergedDeskRbLabelShiftY: 0,
  chartMergedDeskRbCoreZonesEnabled: true,
  chartMergedDeskRbVolumeSyncEnabled: true,
  chartMergedDeskAdvVolumeEnabled: true,
  chartMergedDeskRbAiZoneFaceEnabled: true,
  chartMergedDeskRbCoreMarkersEnabled: false,
  chartMergedDeskRbCoreCandlePaintEnabled: true,
  chartMergedDeskSwingDrawEnabled: true,
  chartMergedDeskLabelAlignDefault: 'right',
  whaleAnchoredLinRegEnabled: true,
  whaleAlrLogScale: false,
  chartCandleRuleDebug: false,
  pageLayout: { ...defaultPageLayout },
};

/** 간결+요약 — 라인요약 UI만 묶음 (zone·차트 레이어는 건드리지 않음) */
export type MonthDeskClearSummaryBundleSettings = Pick<
  UserSettings,
  | 'chartMonthDeskClearSummaryEnabled'
  | 'chartMonthDeskSettleLabelMode'
  | 'chartMonthDeskFeatureSettleLabels'
>;

export function isMonthDeskClearSummaryBundleOn(
  settings: Pick<UserSettings, 'chartMonthDeskClearSummaryEnabled'>
): boolean {
  return settings.chartMonthDeskClearSummaryEnabled !== false;
}

/** ON: 라인요약(카드+우측E/SL/TP) 전부 동시 / OFF: 라인요약 전부 끔 — zone은 유지 */
export function monthDeskClearSummaryBundlePatch(enabled: boolean): MonthDeskClearSummaryBundleSettings {
  if (enabled) {
    return {
      chartMonthDeskClearSummaryEnabled: true,
      chartMonthDeskSettleLabelMode: 'full',
      chartMonthDeskFeatureSettleLabels: true,
    };
  }
  return {
    chartMonthDeskClearSummaryEnabled: false,
    chartMonthDeskSettleLabelMode: 'off',
    chartMonthDeskFeatureSettleLabels: false,
  };
}

function migrateMonthDeskClearSummaryBundle(merged: UserSettings, parsed: Partial<UserSettings>): void {
  if (!('chartMonthDeskClearSummaryEnabled' in parsed)) {
    merged.chartMonthDeskClearSummaryEnabled =
      merged.chartMonthDeskOverlayDensity !== 'rich' &&
      merged.chartMonthDeskSettleLabelMode === 'summary' &&
      merged.chartMonthDeskFeatureSettleLabels !== false;
  }
}

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
    whaleAnchoredLinRegEnabled: true,
    whaleAlrLogScale: settings.whaleAlrLogScale,
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
  if (uiMode === 'FUSION_MODE') {
    const fusionMode = effectiveFeatureTogglesAiZone(settings);
    const overrides = settings.modeFeatureOverrides?.[uiMode];
    return overrides ? { ...fusionMode, ...overrides } : fusionMode;
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
  /** 마감·안착 데스크: 차트 맑음 기본 — 핫존과 동일 프리셋. ⚙ 오버라이드로 레이어 개별 활성화 가능. */
  if (uiMode === 'MONTH_START_DESK') {
    const md = {
      ...base,
      showStructure: false,
      showZones: false,
      showLabels: false,
      showScenario: false,
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
      /** 반응구간(노랑·파랑) — 숏 우선 반응대·진입대. 핵심 보드 참고 패널과 동일 소스 */
      showReactionZone: true,
      showWhaleZone: false,
      showLvrb: false,
      showVolatilityTrendScore: false,
      showTailongClose: false,
      showTailongCloseBreakout: false,
      showTailongCloseWick: false,
      showTailongCloseBody: false,
      showTailongCloseFlow: false,
      /** 고래 모드와 동일 볼륨 Hot Zone — 마감·안착 차트에 기본 표시(모드 오버라이드로 끔 가능) */
      whaleHotZoneEnabled: true,
      whaleCoreSrZoneEnabled: false,
      whaleHyperTrendEnabled: false,
      whaleDynamicRsProEnabled: false,
      whaleLiquidityBiasEnabled: false,
      whaleStructureBounceEnabled: false,
      /** Strike Desk — 핵심 롱·숏 E/SL/TP 최우선 */
      chartMonthDeskLayerMode: 'strike' as const,
      chartMonthDeskStrikeDeskEnabled: true,
      chartMonthDeskFloatingHudEnabled: false,
      chartMonthDeskClickPrecisionEnabled: true,
  chartMonthDeskMergedSignalEnabled: false,
  chartMonthDeskFusionDeskBandEnabled: false,
  chartTripleTrendSignalBand: '3',
  chartTripleTrendChangeLinesEnabled: false,
  chartMergedInstitutionalBandEnabled: false,
  chartMonthDeskCleanIconSignalsEnabled: true,
  chartMonthDeskAtlasPulseDeskEnabled: true,
  chartMonthDeskUnifiedPulseEngineEnabled: true,
      chartMonthDeskCoreShortHighlightEnabled: true,
      chartMonthDeskSettleCandlePaint: true,
      chartSmcStructurePhaseCandles: true,
      chartMonthDeskClearSummaryEnabled: true,
      chartMonthDeskSettleFeatureStrip: false,
      chartTradeAtlasShowHud: false,
      chartMonthDeskOverlayDensity: 'clear' as const,
      chartMonthDeskMoneyZoneEnabled: true,
      chartMonthDeskCoreLongHighlightEnabled: true,
    };
    return overrides ? { ...md, ...overrides } : md;
  }
  /** 통합·분석: ARES/TV식 — Strike·펄스 + 기관밴드·CP/LinReg 줄선 */
  if (uiMode === 'MERGED_ANALYSIS_DESK') {
    const mad = {
      ...base,
      showStructure: false,
      showZones: false,
      showLabels: false,
      showScenario: false,
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
      showReactionZone: true,
      showWhaleZone: false,
      showLvrb: false,
      showVolatilityTrendScore: false,
      showTailongClose: true,
      showTailongCloseBreakout: true,
      showTailongCloseWick: false,
      showTailongCloseBody: false,
      showTailongCloseFlow: false,
      whaleHotZoneEnabled: false,
      whaleCoreSrZoneEnabled: false,
      whaleHyperTrendEnabled: false,
      whaleDynamicRsProEnabled: false,
      whaleLiquidityBiasEnabled: false,
      whaleStructureBounceEnabled: false,
      chartMonthDeskLayerMode: 'full' as const,
      chartMonthDeskStrikeDeskEnabled: true,
      chartMonthDeskFloatingHudEnabled: true,
      chartMonthDeskClickPrecisionEnabled: true,
      chartMonthDeskMergedSignalEnabled: true,
      chartMonthDeskCleanIconSignalsEnabled: true,
      chartMonthDeskAtlasPulseDeskEnabled: true,
      chartMonthDeskUnifiedPulseEngineEnabled: true,
      chartMonthDeskCoreShortHighlightEnabled: true,
      chartMonthDeskSettleCandlePaint: true,
      chartSmcStructurePhaseCandles: true,
      chartMonthDeskClearSummaryEnabled: false,
      chartMonthDeskSettleFeatureStrip: false,
      chartTradeAtlasShowHud: false,
      chartMonthDeskOverlayDensity: 'clear' as const,
      chartMonthDeskMoneyZoneEnabled: true,
      chartMonthDeskCoreLongHighlightEnabled: true,
      chartMergedAdvancedFocusDeck: true,
      chartMonthDeskBitgetCandles: settings.chartMonthDeskBitgetCandles !== false,
      /** 표시·일괄·레이어는 사용자 저장값 우선 (차트설정에서 전부 조절) */
      chartBulkHideLabels: settings.chartBulkHideLabels === true,
      chartBulkHideZones: settings.chartBulkHideZones === true,
      chartBulkHideHLines: settings.chartBulkHideHLines === true,
      chartMirageZoneFaceCompact: settings.chartMirageZoneFaceCompact !== false,
      chartMirageZoneFaceLang: settings.chartMirageZoneFaceLang === 'en' ? ('en' as const) : ('ko' as const),
      chartMirageZoneFaceReveal:
        settings.chartMirageZoneFaceReveal === 'always' ? ('always' as const) : ('progressive' as const),
      chartMergedInstitutionalBandEnabled: settings.chartMergedInstitutionalBandEnabled !== false,
      chartMonthDeskFusionDeskBandEnabled: settings.chartMonthDeskFusionDeskBandEnabled !== false,
      chartMergedDeskActionablePatternEnabled: settings.chartMergedDeskActionablePatternEnabled !== false,
      chartMergedDeskCycleProgressEnabled: settings.chartMergedDeskCycleProgressEnabled !== false,
      chartMergedDeskLivePracticeCueEnabled: settings.chartMergedDeskLivePracticeCueEnabled !== false,
      chartMergedDeskOverlayLabelsEnabled: settings.chartMergedDeskOverlayLabelsEnabled !== false,
      chartMergedDeskRightAxisPricesEnabled: settings.chartMergedDeskRightAxisPricesEnabled !== false,
      chartMergedDeskVrvpPocExtend:
        settings.chartMergedDeskVrvpPocExtend === 'extend20' ? ('extend20' as const) : ('short' as const),
      chartMergedDeskHLineClean:
        settings.chartMergedDeskHLineClean === 'classic' || settings.chartMergedDeskHLineClean === 'soft'
          ? settings.chartMergedDeskHLineClean
          : ('tail' as const),
      chartMergedDeskRbTradeStyle:
        settings.chartMergedDeskRbTradeStyle === 'scalp' || settings.chartMergedDeskRbTradeStyle === 'mid'
          ? settings.chartMergedDeskRbTradeStyle
          : ('swing' as const),
      chartMergedDeskAssetsChartAiEnabled: settings.chartMergedDeskAssetsChartAiEnabled !== false,
      chartMergedDeskSuperAiEnabled: settings.chartMergedDeskSuperAiEnabled !== false,
      chartMergedDeskZoneBattleHudEnabled: settings.chartMergedDeskZoneBattleHudEnabled !== false,
      chartMergedDeskUnifiedCloudEnabled: settings.chartMergedDeskUnifiedCloudEnabled !== false,
      chartMergedDeskBtccionDrawEnabled: settings.chartMergedDeskBtccionDrawEnabled !== false,
      chartMergedDeskBlueRedChannelsEnabled: settings.chartMergedDeskBlueRedChannelsEnabled !== false,
      chartMergedDeskRbVolumeSyncEnabled: settings.chartMergedDeskRbVolumeSyncEnabled !== false,
      chartMergedDeskAdvVolumeEnabled: settings.chartMergedDeskAdvVolumeEnabled !== false,
      chartMergedDeskAiToneEnabled: settings.chartMergedDeskAiToneEnabled === true,
      chartMergedDeskEuromap:
        settings.chartMergedDeskEuromap && typeof settings.chartMergedDeskEuromap === 'object'
          ? settings.chartMergedDeskEuromap
          : {},
      chartMergedDeskZoneFillOpacity: Math.max(
        15,
        Math.min(100, Number(settings.chartMergedDeskZoneFillOpacity) || 46)
      ),
      chartMergedDeskSwingDrawEnabled: settings.chartMergedDeskSwingDrawEnabled !== false,
      chartMergedDeskLabelAlignDefault:
        settings.chartMergedDeskLabelAlignDefault === 'left' ||
        settings.chartMergedDeskLabelAlignDefault === 'center'
          ? settings.chartMergedDeskLabelAlignDefault
          : ('right' as const),
      overlayLabelFontSize: settings.overlayLabelFontSize,
      chartScaleFontSize: Math.max(1, Math.min(20, Math.round(Number(settings.chartScaleFontSize) || 12))),
      overlayPriceStripFontSize: settings.overlayPriceStripFontSize,
      zoneFillSupplyHex: settings.zoneFillSupplyHex,
      zoneFillDemandHex: settings.zoneFillDemandHex,
      zoneFillNeutralHex: settings.zoneFillNeutralHex,
      zoneFillWarningHex: settings.zoneFillWarningHex,
      showRsiPanel: true,
      showMacdPanel: true,
    };
    return overrides ? { ...mad, ...overrides } : mad;
  }
  /** 존·라인 개선: LinReg + CP + HotZone + Strike — 잡음(phz·SMC 다이어그램) 기본 OFF */
  if (uiMode === 'ZONE_LINE_PRO') {
    const zlp = {
      ...base,
      showStructure: false,
      showZones: false,
      showLabels: false,
      showScenario: false,
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
      showReactionZone: true,
      showWhaleZone: false,
      showLvrb: false,
      showVolatilityTrendScore: false,
      showTailongClose: false,
      showTailongCloseBreakout: false,
      showTailongCloseWick: false,
      showTailongCloseBody: false,
      showTailongCloseFlow: false,
      whaleHotZoneEnabled: true,
      whaleCoreSrZoneEnabled: true,
      whaleHyperTrendEnabled: false,
      whaleDynamicRsProEnabled: false,
      whaleLiquidityBiasEnabled: false,
      whaleStructureBounceEnabled: true,
      chartMonthDeskLayerMode: 'zoneLinePro' as const,
      chartMonthDeskStrikeDeskEnabled: true,
      chartMonthDeskFloatingHudEnabled: false,
      chartMonthDeskClickPrecisionEnabled: true,
  chartMonthDeskMergedSignalEnabled: false,
  chartMonthDeskFusionDeskBandEnabled: true,
  chartTripleTrendSignalBand: '3',
  chartTripleTrendChangeLinesEnabled: false,
  chartMonthDeskCleanIconSignalsEnabled: true,
  chartMonthDeskAtlasPulseDeskEnabled: true,
  chartMonthDeskUnifiedPulseEngineEnabled: true,
      chartMonthDeskCoreShortHighlightEnabled: true,
      chartMonthDeskSettleCandlePaint: true,
      chartSmcStructurePhaseCandles: true,
      chartMonthDeskClearSummaryEnabled: true,
      chartMonthDeskSettleFeatureStrip: false,
      chartTradeAtlasShowHud: false,
      chartMonthDeskOverlayDensity: 'clear' as const,
      chartMonthDeskMoneyZoneEnabled: false,
      chartMonthDeskCoreLongHighlightEnabled: true,
      chartMonthDeskPullbackHotZoneEnabled: true,
      chartBulkHideZones: false,
      chartBulkHideLabels: false,
      chartBulkHideHLines: false,
      showInstitutionalTrendBadge: false,
    };
    return overrides ? { ...zlp, ...overrides } : zlp;
  }
  /** 벤치마크·레퍼런스: 차트 레이어 전부 OFF — 보드만 표시 */
  if (uiMode === 'REFERENCE_DESK') {
    const rd = {
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
    return overrides ? { ...rd, ...overrides } : rd;
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

/** 옛 파랑 상승띠·탁한 빨강 → 초록/선명빨강 통로 (사용자 커스텀 색은 유지) */
function migrateMergedDeskRbCorridorPalette(
  merged: UserSettings,
  parsed: Partial<UserSettings>
): void {
  const bull = String(parsed.chartMergedDeskRbBullHex || '').trim().toUpperCase();
  const bear = String(parsed.chartMergedDeskRbBearHex || '').trim().toUpperCase();
  const conf = String(parsed.chartMergedDeskRbConfluenceHex || '').trim().toUpperCase();
  if (!bull || bull === '#5B8EC4' || bull === '#3B82F6' || bull === '#60A5FA' || bull === '#2563EB') {
    merged.chartMergedDeskRbBullHex = '#22C55E';
  }
  if (!bear || bear === '#C98989') {
    merged.chartMergedDeskRbBearHex = '#EF4444';
  }
  if (!conf || conf === '#9589B8') {
    merged.chartMergedDeskRbConfluenceHex = '#CA8A04';
  }
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
    migrateMonthDeskClearSummaryBundle(merged, { ...parsed, ...merged });
    Object.assign(
      merged,
      monthDeskClearSummaryBundlePatch(merged.chartMonthDeskClearSummaryEnabled !== false)
    );
    /** TT 추세 전환 세로 점선 — 차트에서 항상 비표시 (설정·서버값 무시) */
    merged.chartTripleTrendChangeLinesEnabled = false;
    migrateMergedDeskRbCorridorPalette(merged, parsed);
    merged.chartScaleFontSize = Math.max(
      1,
      Math.min(20, Math.round(Number(merged.chartScaleFontSize) || 12))
    );
    merged.chartMergedDeskVrvpPocExtend =
      merged.chartMergedDeskVrvpPocExtend === 'extend20' ? 'extend20' : 'short';
    merged.chartMergedDeskHLineClean =
      merged.chartMergedDeskHLineClean === 'classic' || merged.chartMergedDeskHLineClean === 'soft'
        ? merged.chartMergedDeskHLineClean
        : 'tail';
    merged.chartMergedDeskRbTradeStyle =
      merged.chartMergedDeskRbTradeStyle === 'scalp' || merged.chartMergedDeskRbTradeStyle === 'mid'
        ? merged.chartMergedDeskRbTradeStyle
        : 'swing';
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
    Object.assign(
      next,
      monthDeskClearSummaryBundlePatch(next.chartMonthDeskClearSummaryEnabled !== false)
    );
    next.chartTripleTrendChangeLinesEnabled = false;
    next.chartScaleFontSize = Math.max(
      1,
      Math.min(20, Math.round(Number(next.chartScaleFontSize) || 12))
    );
    next.chartMergedDeskVrvpPocExtend =
      next.chartMergedDeskVrvpPocExtend === 'extend20' ? 'extend20' : 'short';
    next.chartMergedDeskHLineClean =
      next.chartMergedDeskHLineClean === 'classic' || next.chartMergedDeskHLineClean === 'soft'
        ? next.chartMergedDeskHLineClean
        : 'tail';
    next.chartMergedDeskRbTradeStyle =
      next.chartMergedDeskRbTradeStyle === 'scalp' || next.chartMergedDeskRbTradeStyle === 'mid'
        ? next.chartMergedDeskRbTradeStyle
        : 'swing';
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
    migrateMonthDeskClearSummaryBundle(merged, srv);
    Object.assign(
      merged,
      monthDeskClearSummaryBundlePatch(merged.chartMonthDeskClearSummaryEnabled !== false)
    );
    merged.chartTripleTrendChangeLinesEnabled = false;
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
