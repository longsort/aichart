import 'package:flutter/foundation.dart';

/// 앱 설정(단일 소스)
/// - 토글(실시간) + 숫자 설정(수수료/계좌/레버리지/확률컷 등) 통합
///
/// 과거 패치에서 AppSettings가 2개로 갈라져 설정 반영이 반쪽만 되는 문제가 있었음.
/// 이 파일이 유일한 진짜 설정 소스.
class AppSettings {
  AppSettings._();
  static final AppSettings I = AppSettings._();

  // =====================
  // 토글(실시간)
  // =====================
  final ValueNotifier<bool> enableBackground = ValueNotifier<bool>(true);
  final ValueNotifier<bool> enableSystemNotify = ValueNotifier<bool>(true);
  final ValueNotifier<bool> enableAutoGuard = ValueNotifier<bool>(true);
  final ValueNotifier<bool> enableAutoLog = ValueNotifier<bool>(true);

  // =====================
  // 차트 오버레이(표시/투명도)
  // =====================
  /// 오더블록(OB)
  /// - GAP 개편 기준: 차트는 최대한 깔끔하게(표시는 기본 OFF, 계산은 유지)
  final ValueNotifier<bool> showOB = ValueNotifier<bool>(false);
  /// FVG
  final ValueNotifier<bool> showFVG = ValueNotifier<bool>(false);
  /// BPR
  final ValueNotifier<bool> showBPR = ValueNotifier<bool>(false);
  /// MB(미티게이션 블록)
  final ValueNotifier<bool> showMB = ValueNotifier<bool>(false);
  /// BOS/CHoCH 라벨
  final ValueNotifier<bool> showStructureLabels = ValueNotifier<bool>(true);

  /// BOS 표시(구조 이벤트)
  /// - 일부 UI에서 showBOS / showCHoCH 개별 토글을 사용한다.
  /// - 구형 코드와의 호환을 위해 기본값 true.
  final ValueNotifier<bool> showBOS = ValueNotifier<bool>(true);

  /// CHoCH 표시(구조 전환 이벤트)
  final ValueNotifier<bool> showCHoCH = ValueNotifier<bool>(true);

  /// 오버레이 영역 투명도(0~1)
  final ValueNotifier<double> zoneOpacity = ValueNotifier<double>(0.18);
  /// 라벨(텍스트/테두리) 투명도(0~1)
  final ValueNotifier<double> labelOpacity = ValueNotifier<double>(0.9);

  // =====================
  // 차트 라벨 사용자 조정 (미래경로 화면)
  // =====================
  /// 라벨 배경색
  final ValueNotifier<int> chartLabelBgColor = ValueNotifier<int>(0xFF1A1D24);
  /// 라벨 글자색
  final ValueNotifier<int> chartLabelTextColor = ValueNotifier<int>(0xFFFFFFFF);
  /// 라벨 글자 크기 (8~20)
  final ValueNotifier<double> chartLabelFontSize = ValueNotifier<double>(11.0);
  /// 라벨 전체 X 이동 (-100~100)
  final ValueNotifier<double> chartLabelOffsetX = ValueNotifier<double>(0.0);
  /// 라벨 전체 Y 이동 (-100~100)
  final ValueNotifier<double> chartLabelOffsetY = ValueNotifier<double>(0.0);
  /// 표시할 SMC 구간 수(3~6). 적을수록 겹침 감소.
  final ValueNotifier<int> chartMaxSmcZones = ValueNotifier<int>(4);

  // =====================
  // 알림/브리핑
  // =====================
  static bool notifyEnabled = true;
  static int notifyCooldownMin = 10;
  // 실전 운영 기본: confirm(강한 신호)만 알림
  static int notifyMinProb = 75; // 알림 최소 확률
  static String ntfyUrl = 'https://ntfy.sh/fulinkpro';

  // =====================
  // 트레이딩 기본값
  // =====================
  /// 선물 기준 왕복 수수료(진입+청산)
  /// - 0.0008 = 0.08%
  static double feeRoundTrip = 0.0008;

  /// 계좌(USDT)
  static double accountUsdt = 100.0;

  /// 고정 리스크(%)
  /// - 기본 5%
  static double riskPct = 5.0;

  /// B/S(확정) 최소 확률 컷
  // 실전 운영 기본: 신호 남발 방지
  static int signalMinProb = 75;

  /// 레버리지 오버라이드
  /// - 0이면 자동(엔진 추천)
  static double leverageOverride = 0.0;

  
  /// 자동 레버리지 상한(캡)
  /// - 결정 엔진이 계산한 레버리지가 이 값을 넘으면 캡으로 제한
  static double leverageCap = 25.0;
// =====================
  // 유로 패스 (EUR 구독/프리미엄)
  // =====================
  /// 유로 패스 활성화 여부 (실제 결제는 스텁; 나중에 EUR 연동)
  final ValueNotifier<bool> euroPassActive = ValueNotifier<bool>(false);
  /// 만료 시각(ms). 0 이하면 무기한.
  final ValueNotifier<int> euroPassExpiryMs = ValueNotifier<int>(0);
}
