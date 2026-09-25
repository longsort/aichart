import 'package:flutter/foundation.dart';

/// 차트 시각 설정(사용자 조절용)
/// - 엔진/분석과 분리: 렌더링만 즉시 반영
class ChartViewPrefs {
  static final ValueNotifier<double> obOpacity = ValueNotifier<double>(0.16);
  static final ValueNotifier<double> fvgOpacity = ValueNotifier<double>(0.12);
  static final ValueNotifier<double> bprOpacity = ValueNotifier<double>(0.18);

  static final ValueNotifier<bool> showZonePrices = ValueNotifier<bool>(true);

  // 표시 토글(초기값: 전부 ON)
  static final ValueNotifier<bool> showOB = ValueNotifier<bool>(true);
  static final ValueNotifier<bool> showFVG = ValueNotifier<bool>(true);
  static final ValueNotifier<bool> showBPR = ValueNotifier<bool>(true);
}
