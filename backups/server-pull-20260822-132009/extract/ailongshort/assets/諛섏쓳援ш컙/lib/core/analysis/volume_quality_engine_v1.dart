import '../models/fu_state.dart';

class VolumeQualityV1 {
  final String labelKo; // 강함/보통/약함/없음
  final int score; // 0~100
  final double ratio; // 현재/평균
  final String reason;
  const VolumeQualityV1({required this.labelKo, required this.score, required this.ratio, required this.reason});
}

/// 거래량 '질' 간단 판정
/// - 마지막 캔들 거래량 vs 최근 N개 평균
/// - N=20 기본
class VolumeQualityEngineV1 {
  final int lookback;
  const VolumeQualityEngineV1({this.lookback = 20});

  /// FuEngine 호환용(정적 호출)
  static VolumeQualityV1 eval(List<FuCandle> candles, {int lookback = 20}) {
    if (candles.length < 3) {
      return const VolumeQualityV1(labelKo: '없음', score: 0, ratio: 0, reason: '캔들 부족');
    }
    final last = candles.last;
    final v = last.volume;
    if (v <= 0) {
      return const VolumeQualityV1(labelKo: '없음', score: 0, ratio: 0, reason: '거래량 데이터 없음');
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
      return const VolumeQualityV1(labelKo: '보통', score: 50, ratio: 1, reason: '평균 계산 불가(표본 부족)');
    }
    final ratio = v / avg;
    if (ratio >= 2.2) {
      return VolumeQualityV1(labelKo: '강함', score: 85, ratio: ratio, reason: '평균 대비 거래량 급증');
    }
    if (ratio >= 1.3) {
      return VolumeQualityV1(labelKo: '보통', score: 65, ratio: ratio, reason: '평균 이상 거래량');
    }
    return VolumeQualityV1(labelKo: '약함', score: 40, ratio: ratio, reason: '평균 이하 거래량');
  }

  VolumeQualityV1 analyze(FuState s) {
    final cs = s.candles;
    if (cs.length < 3) {
      return const VolumeQualityV1(labelKo: '없음', score: 0, ratio: 0, reason: '캔들 부족');
    }
    final last = cs.last;
    final v = last.volume;
    if (v <= 0) {
      return const VolumeQualityV1(labelKo: '없음', score: 0, ratio: 0, reason: '거래량 데이터 없음');
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
      return const VolumeQualityV1(labelKo: '보통', score: 50, ratio: 1, reason: '평균 계산 불가(표본 부족)');
    }
    final ratio = v / avg;
    if (ratio >= 2.2) {
      return VolumeQualityV1(labelKo: '강함', score: 85, ratio: ratio, reason: '평균 대비 거래량 급증');
    }
    if (ratio >= 1.3) {
      return VolumeQualityV1(labelKo: '보통', score: 65, ratio: ratio, reason: '평균 이상 거래량');
    }
    return VolumeQualityV1(labelKo: '약함', score: 40, ratio: ratio, reason: '평균 이하 거래량');
  }
}
