/// Timeframe presets for Fulink Pro UI/Signals.
///
/// 목적:
/// - TF(15m/1h/4h/1D/1W/1M/1Y)별
///   1) 표기 밀도(라벨/마커/박스 수)
///   2) 미래 경로 길이(steps)
///   3) 확률 임계값(롱/숏 출력 최소 %)
///   4) TIMEOUT 기준(자동판정)
/// 을 자동으로 바꾸기.
class TfPreset {
  final String tf; // '15m','1h','4h','1D','1W','1M','1Y'
  final int futureBaseSteps;     // future path steps before confidence scaling
  final double minSignalPct;     // below this => WATCH
  final int maxZoneLabels;       // how many zone labels to show
  final int maxMarkers;          // how many entry markers to show
  final int timeoutMinutes;      // AutoJudge timeout suggestion

  const TfPreset({
    required this.tf,
    required this.futureBaseSteps,
    required this.minSignalPct,
    required this.maxZoneLabels,
    required this.maxMarkers,
    required this.timeoutMinutes,
  });

  static TfPreset of(String tf) {
    final t = tf.toLowerCase();

    // NOTE: 유저 룰: 선물 신호는 20% 이상만 '확정', 미만은 WATCH.
    const minPct = 20.0;

    if (t == '15m' || t == '15') {
      return const TfPreset(tf: '15m', futureBaseSteps: 60, minSignalPct: minPct, maxZoneLabels: 3, maxMarkers: 2, timeoutMinutes: 90);
    }
    if (t == '1h' || t == '60m' || t == '60') {
      return const TfPreset(tf: '1h', futureBaseSteps: 72, minSignalPct: minPct, maxZoneLabels: 3, maxMarkers: 2, timeoutMinutes: 240);
    }
    if (t == '4h' || t == '240m' || t == '240') {
      return const TfPreset(tf: '4h', futureBaseSteps: 84, minSignalPct: minPct, maxZoneLabels: 2, maxMarkers: 1, timeoutMinutes: 720);
    }
    if (t == '1d' || t == '1D') {
      return const TfPreset(tf: '1D', futureBaseSteps: 90, minSignalPct: minPct, maxZoneLabels: 2, maxMarkers: 1, timeoutMinutes: 2880);
    }
    if (t == '1w' || t == '1W') {
      return const TfPreset(tf: '1W', futureBaseSteps: 100, minSignalPct: minPct, maxZoneLabels: 1, maxMarkers: 1, timeoutMinutes: 10080);
    }
    if (t == '1m' || t == '1M') {
      return const TfPreset(tf: '1M', futureBaseSteps: 120, minSignalPct: minPct, maxZoneLabels: 1, maxMarkers: 1, timeoutMinutes: 43200);
    }
    if (t == '1y' || t == '1Y' || t == 'year') {
      return const TfPreset(tf: '1Y', futureBaseSteps: 140, minSignalPct: minPct, maxZoneLabels: 1, maxMarkers: 1, timeoutMinutes: 525600);
    }

    // fallback
    return const TfPreset(tf: '15m', futureBaseSteps: 60, minSignalPct: minPct, maxZoneLabels: 3, maxMarkers: 2, timeoutMinutes: 90);
  }
}