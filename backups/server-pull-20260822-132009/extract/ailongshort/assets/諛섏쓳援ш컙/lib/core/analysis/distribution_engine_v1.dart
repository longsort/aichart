import '../models/fu_candle.dart';
import 'breakout_quality_engine_v1.dart';
import 'volume_quality_engine_v1.dart';

/// 분산매도(상단 던짐) 점수화 v1
/// - 저항/상단 근접 + 매수 체결은 많은데(또는 거래량은 큰데) 위로 못 가는 상황을 높게 본다.
/// - 실데이터(체결/오더북/CVD) 붙기 전에는 OHLCV 휴리스틱으로 동작.
class DistributionEngineV1 {
  /// return: (distributionScore 0~100, reason)
  static ({int score, String reason}) eval({
    required List<FuCandle> candles,
    required double px,
    required double resist,
    required int tapeBuyPct, // 0~100 (없으면 50)
    required int obImbalance, // 0~100 (없으면 50)
    required int instBias, // 0~100
    required BreakoutQualityV1 bq,
    required VolumeQualityV1 vq,
  }) {
    if (candles.isEmpty || px <= 0) return (score: 50, reason: '데이터 부족');

    bool nearRes = false;
    if (resist > 0) {
      final distPct = ((px - resist).abs() / resist) * 100.0;
      nearRes = distPct <= 0.25;
    }

    double score = 50;

    if (nearRes) score += 18;

    // 상단에서 긴 윗꼬리(올렸다가 눌림)
    final last = candles.last;
    final range = (last.high - last.low).abs().clamp(1e-9, double.infinity);
    final upperWick = (last.high - max2(last.open, last.close)).clamp(0, double.infinity);
    final wickRatio = (upperWick / range).clamp(0, 1);
    if (wickRatio >= 0.35) score += 16;
    else if (wickRatio >= 0.22) score += 8;

    // 매수 체결 비중 높지만(>55) 오더북 우위가 약하면(<=50) 분산 가점
    if (tapeBuyPct >= 55 && obImbalance <= 50) score += 18;
    if (instBias <= 45) score += 10;

    // 돌파 실패/가짜면 분산쪽 가점
    if (bq.labelKo.contains('실패')) score += 12;

    // 거래량이 좋은데 못 가면 분산 강화
    if (vq.score >= 60 && bq.labelKo.contains('실패')) score += 8;

    final out = score.round().clamp(0, 100);

    final parts = <String>[];
    if (nearRes) parts.add('저항 근처');
    if (wickRatio >= 0.22) parts.add('윗꼬리');
    if (tapeBuyPct >= 55 && obImbalance <= 50) parts.add('매수 많아도 막힘');
    if (bq.labelKo.contains('실패')) parts.add('돌파 실패');
    if (out >= 70) parts.add('분산 강함');
    final reason = parts.isEmpty ? '분산 계산 중' : parts.join(' · ');

    return (score: out, reason: reason);
  }

  static double max2(double a, double b) => a > b ? a : b;
}
