import '../models/fu_state.dart';

class VolumeQualityV1 {
  final String labelKo; // 강함/보통/?�함/?�음
  final int score; // 0~100
  final double ratio; // ?�재/?�균
  final String reason;
  const VolumeQualityV1({required this.labelKo, required this.score, required this.ratio, required this.reason});
}

/// 거래??'�? 간단 ?�정
/// - 마�?�?캔들 거래??vs 최근 N�??�균
/// - N=20 기본
class VolumeQualityEngineV1 {
  final int lookback;
  const VolumeQualityEngineV1({this.lookback = 20});

  /// FuEngine ?�환???�적 ?�출)
  static VolumeQualityV1 eval(List<FuCandle> candles, {int lookback = 20}) {
    if (candles.length < 3) {
      return const VolumeQualityV1(labelKo: '?�음', score: 0, ratio: 0, reason: '캔들 부�?);
    }
    final last = candles.last;
    final v = last.volume;
    if (v <= 0) {
      return const VolumeQualityV1(labelKo: '?�음', score: 0, ratio: 0, reason: '거래???�이???�음');
    }
    final n = lookback.clamp(3, candles.length - 1);
    double sum = 0;
    int cnt = 0;
    for (int i = candles.length - 1 - n; i < candles.length - 1; i++) {
      final vv = candles[i].volume;
      if (vv > 0) {
        sum += vv;
        cnt++;
      }
    }
    final avg = cnt > 0 ? (sum / cnt) : 0;
    if (avg <= 0) {
      return const VolumeQualityV1(labelKo: '보통', score: 50, ratio: 1, reason: '?�균 계산 불�?(?�본 부�?');
    }
    final ratio = v / avg;
    if (ratio >= 2.2) {
      return VolumeQualityV1(labelKo: '강함', score: 85, ratio: ratio, reason: '?�균 ?��?거래??급증');
    }
    if (ratio >= 1.3) {
      return VolumeQualityV1(labelKo: '보통', score: 65, ratio: ratio, reason: '?�균 ?�상 거래??);
    }
    return VolumeQualityV1(labelKo: '?�함', score: 40, ratio: ratio, reason: '?�균 ?�하 거래??);
  }

  VolumeQualityV1 analyze(FuState s) {
    final cs = s.candles;
    if (cs.length < 3) {
      return const VolumeQualityV1(labelKo: '?�음', score: 0, ratio: 0, reason: '캔들 부�?);
    }
    final last = cs.last;
    final v = last.volume;
    if (v <= 0) {
      return const VolumeQualityV1(labelKo: '?�음', score: 0, ratio: 0, reason: '거래???�이???�음');
    }
    final n = lookback.clamp(3, cs.length - 1);
    double sum = 0;
    int cnt = 0;
    for (int i = cs.length - 1 - n; i < cs.length - 1; i++) {
      final vv = cs[i].volume;
      if (vv > 0) {
        sum += vv;
        cnt++;
      }
    }
    final avg = cnt > 0 ? (sum / cnt) : 0;
    if (avg <= 0) {
      return const VolumeQualityV1(labelKo: '보통', score: 50, ratio: 1, reason: '?�균 계산 불�?(?�본 부�?');
    }
    final ratio = v / avg;
    if (ratio >= 2.2) {
      return VolumeQualityV1(labelKo: '강함', score: 85, ratio: ratio, reason: '?�균 ?��?거래??급증');
    }
    if (ratio >= 1.3) {
      return VolumeQualityV1(labelKo: '보통', score: 65, ratio: ratio, reason: '?�균 ?�상 거래??);
    }
    return VolumeQualityV1(labelKo: '?�함', score: 40, ratio: ratio, reason: '?�균 ?�하 거래??);
  }
}
