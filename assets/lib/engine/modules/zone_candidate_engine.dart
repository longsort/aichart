import '../../models/candle.dart';
import '../../models/zone.dart';

/// 초보도 이해되는 “구간 후보 3개” 뽑기
/// - 지지 1개
/// - 저항 1개
/// - 박스 1개
class ZoneCandidateEngine {
  /// candles: 최신이 뒤에 오도록 정렬된 리스트
  static List<ZoneCandidate> top3({
    required List<Candle> candles,
  }) {
    if (candles.length < 30) {
      return const [];
    }
    final recent = candles.length > 120 ? candles.sublist(candles.length - 120) : candles;
    final lastClose = recent.last.close;
    final tol = _autoTol(lastClose); // 가격 근처 허용 오차(대충 0.08% 정도)

    final support = _bestLevel(recent, tol, isSupport: true);
    final resistance = _bestLevel(recent, tol, isSupport: false);
    final box = _bestBox(recent);

    return [support, resistance, box].whereType<ZoneCandidate>().toList();
  }

  static double _autoTol(double price) {
    // 0.08% 기본 (BTC 기준 7~8만이면 60~70달러)
    return price * 0.0008;
  }

  static ZoneCandidate? _bestLevel(
    List<Candle> candles,
    double tol, {
    required bool isSupport,
  }) {
    // 피벗 후보 모으기: 최근 저점/고점
    final levels = <double>[];
    for (var i = 2; i < candles.length - 2; i++) {
      final c = candles[i];
      final p = isSupport ? c.low : c.high;
      // 간단 피벗: 주변 2개보다 낮거나(지지) 높거나(저항)
      final left1 = isSupport ? candles[i - 1].low : candles[i - 1].high;
      final left2 = isSupport ? candles[i - 2].low : candles[i - 2].high;
      final right1 = isSupport ? candles[i + 1].low : candles[i + 1].high;
      final right2 = isSupport ? candles[i + 2].low : candles[i + 2].high;
      final ok = isSupport
          ? (p <= left1 && p <= left2 && p <= right1 && p <= right2)
          : (p >= left1 && p >= left2 && p >= right1 && p >= right2);
      if (ok) levels.add(p);
    }

    if (levels.isEmpty) {
      // fallback: 최저/최고
      final v = isSupport
          ? candles.map((e) => e.low).reduce((a, b) => a < b ? a : b)
          : candles.map((e) => e.high).reduce((a, b) => a > b ? a : b);
      return ZoneCandidate(
        type: isSupport ? ZoneType.support : ZoneType.resistance,
        low: v - tol,
        high: v + tol,
        score: 55,
        reason: '최근 극값(단순) 기준',
      );
    }

    // 레벨들을 “가격대 묶음”으로 클러스터링
    final clusters = <double, int>{}; // mid -> touchCount
    for (final lv in levels) {
      double? key;
      for (final k in clusters.keys) {
        if ((lv - k).abs() <= tol) {
          key = k;
          break;
        }
      }
      if (key == null) {
        clusters[lv] = 1;
      } else {
        clusters[key] = (clusters[key] ?? 0) + 1;
      }
    }

    // 터치 많은 구간이 “핵심”
    double bestMid = clusters.keys.first;
    int bestTouch = clusters[bestMid] ?? 0;
    clusters.forEach((k, v) {
      if (v > bestTouch) {
        bestTouch = v;
        bestMid = k;
      }
    });

    // 점수(초보용): 터치가 많을수록 + 최근일수록
    final recencyBoost = _recencyBoost(candles, bestMid, tol, isSupport: isSupport);
    final raw = (bestTouch * 12 + recencyBoost).clamp(40, 95);

    return ZoneCandidate(
      type: isSupport ? ZoneType.support : ZoneType.resistance,
      low: bestMid - tol,
      high: bestMid + tol,
      score: raw,
      reason: '터치 ${bestTouch}회 + 최근반응 $recencyBoost',
    );
  }

  static int _recencyBoost(
    List<Candle> candles,
    double mid,
    double tol, {
    required bool isSupport,
  }) {
    // 최근 30봉 안에 반응이 있으면 가점
    final start = candles.length > 30 ? candles.length - 30 : 0;
    var hit = 0;
    for (var i = start; i < candles.length; i++) {
      final c = candles[i];
      final p = isSupport ? c.low : c.high;
      if ((p - mid).abs() <= tol) hit++;
    }
    return (hit * 8).clamp(0, 40);
  }

  static ZoneCandidate _bestBox(List<Candle> candles) {
    // “최근에 좁게 모여있는 구간”을 박스로 본다.
    final win = 24; // 약 6시간(15m 기준)
    var bestScore = -1;
    double bestLow = candles.last.low;
    double bestHigh = candles.last.high;
    for (var i = 0; i <= candles.length - win; i++) {
      final slice = candles.sublist(i, i + win);
      final low = slice.map((e) => e.low).reduce((a, b) => a < b ? a : b);
      final high = slice.map((e) => e.high).reduce((a, b) => a > b ? a : b);
      final width = (high - low).abs();
      if (width <= 0) continue;

      // 좁을수록 + 안에서 종가가 많이 머물수록 점수
      final inside = slice.where((c) => c.close >= low && c.close <= high).length;
      final score = ((inside / win) * 100 - (width / (slice.last.close) * 100) * 80).round();
      if (score > bestScore) {
        bestScore = score;
        bestLow = low;
        bestHigh = high;
      }
    }

    final s = bestScore.clamp(40, 92);
    return ZoneCandidate(
      type: ZoneType.box,
      low: bestLow,
      high: bestHigh,
      score: s,
      reason: '최근 박스(좁은 구간) 후보',
    );
  }
}
