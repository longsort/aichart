
import 'candle.dart';

/// ✅ 확정 종가 계산기
/// - 입력: 캔들 배열(시간 오름차순)
/// - 출력: 마지막 '확정된' 4H/1D/1W/1M 종가
class ClosePriceCalculator {
  static double? lastConfirmedClose(List<Candle> candles, Duration tf) {
    if (candles.isEmpty) return null;
    // 마지막 캔들의 종료시각이 현재시각보다 충분히 과거면 확정으로 본다.
    // (실전에서는 거래소 타임/서버 타임으로 교체 가능)
    final now = DateTime.now().millisecondsSinceEpoch;
    final last = candles.last.t;
    final tfMs = tf.inMilliseconds;
    // 캔들 시작시각 기준으로 다음 경계가 지났으면 확정
    final boundary = ((last ~/ tfMs) + 1) * tfMs;
    final confirmed = now >= boundary;
    return confirmed ? candles.last.c : (candles.length >= 2 ? candles[candles.length - 2].c : candles.last.c);
  }

  static Map<String, double?> compute({
    required List<Candle> candles4h,
    required List<Candle> candles1d,
    required List<Candle> candles1w,
    required List<Candle> candles1m,
  }) {
    return {
      "4h": lastConfirmedClose(candles4h, const Duration(hours: 4)),
      "1d": lastConfirmedClose(candles1d, const Duration(days: 1)),
      "1w": lastConfirmedClose(candles1w, const Duration(days: 7)),
      // 1M은 월 경계가 달라서, 기본은 30일로 잡고(추후 교체 가능)
      "1m": lastConfirmedClose(candles1m, const Duration(days: 30)),
    };
  }
}
