import '../models/fu_candle.dart';
import 'close_context_engine_v1.dart';
import 'breakout_quality_engine_v1.dart';
import 'volume_quality_engine_v1.dart';

/// 방어(가격 지킴) 점수화 v1
/// - 지지/반응구간에서 '꼬리로 찍고 종가로 지키는' 패턴을 높게 본다.
/// - 실데이터(체결/오더북/CVD) 붙기 전에는 OHLCV 휴리스틱으로 동작.
class DefenseEngineV1 {
  /// return: (defenseScore 0~100, reason)
  static ({int score, String reason}) eval({
    required List<FuCandle> candles,
    required double px,
    required double support,
    required double reactLow,
    required double reactHigh,
    required CloseContextV1 cc,
    required BreakoutQualityV1 bq,
    required VolumeQualityV1 vq,
  }) {
    if (candles.isEmpty || px <= 0) return (score: 50, reason: '데이터 부족');
    final last = candles.last;

    final bool hasBand = reactLow > 0 && reactHigh > 0;
    final bool inBand = hasBand && px >= reactLow && px <= reactHigh;

    // 캔들 특성
    final range = (last.high - last.low).abs().clamp(1e-9, double.infinity);
    final lowerWick = (min2(last.open, last.close) - last.low).clamp(0, double.infinity);
    final closePos = ((last.close - last.low) / range).clamp(0, 1); // 0=저점,1=고점

    // 지지 근접(퍼센트) 기준
    bool nearSup = false;
    if (support > 0) {
      final distPct = ((px - support).abs() / support) * 100.0;
      nearSup = distPct <= 0.25;
    }
    if (inBand) nearSup = true;

    double score = 50;

    if (nearSup) score += 18;

    // 아래꼬리 길수록(찍고 올린) 방어 가점
    final wickRatio = (lowerWick / range).clamp(0, 1);
    if (wickRatio >= 0.35) score += 18;
    else if (wickRatio >= 0.22) score += 10;

    // 종가 위치가 위쪽이면 방어 성공
    if (closePos >= 0.62) score += 14;
    else if (closePos <= 0.38) score -= 10;

    // 돌파 실패(상단에서)일 경우 방어 점수는 낮춤
    if (bq.labelKo.contains('실패')) score -= 8;

    // 거래량 질이 좋으면 방어 신뢰 상승
    score += (vq.score - 50) * 0.18;

    // 캔들 마감 품질(확정감)
    score += (cc.score - 50) * 0.10;

    final out = score.round().clamp(0, 100);

    final parts = <String>[];
    if (nearSup) parts.add('지지/반응 근처');
    if (wickRatio >= 0.22) parts.add('아래꼬리');
    if (closePos >= 0.62) parts.add('종가 상단');
    if (vq.score >= 60) parts.add('거래량 좋음');
    if (out >= 70) parts.add('방어 강함');
    final reason = parts.isEmpty ? '방어 계산 중' : parts.join(' · ');

    return (score: out, reason: reason);
  }

  static double min2(double a, double b) => a < b ? a : b;
}
