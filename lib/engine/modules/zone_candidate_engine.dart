import '../../models/candle.dart';
import '../../models/zone.dart';

/// ì´ˆë³´???´í•´?˜ëŠ” ?œêµ¬ê°??„ë³´ 3ê°œâ€?ë½‘ê¸°
/// - ì§€ì§€ 1ê°?/// - ?€??1ê°?/// - ë°•ìŠ¤ 1ê°?class ZoneCandidateEngine {
  /// candles: ìµœì‹ ???¤ì— ?¤ë„ë¡??•ë ¬??ë¦¬ìŠ¤??  static List<ZoneCandidate> top3({
    required List<Candle> candles,
  }) {
    if (candles.length < 30) {
      return const [];
    }
    final recent = candles.length > 120 ? candles.sublist(candles.length - 120) : candles;
    final lastClose = recent.last.close;
    final tol = _autoTol(lastClose); // ê°€ê²?ê·¼ì²˜ ?ˆìš© ?¤ì°¨(?€ì¶?0.08% ?•ë„)

    final support = _bestLevel(recent, tol, isSupport: true);
    final resistance = _bestLevel(recent, tol, isSupport: false);
    final box = _bestBox(recent);

    return [support, resistance, box].whereType<ZoneCandidate>().toList();
  }

  static double _autoTol(double price) {
    // 0.08% ê¸°ë³¸ (BTC ê¸°ì? 7~8ë§Œì´ë©?60~70?¬ëŸ¬)
    return price * 0.0008;
  }

  static ZoneCandidate? _bestLevel(
    List<Candle> candles,
    double tol, {
    required bool isSupport,
  }) {
    // ?¼ë²— ?„ë³´ ëª¨ìœ¼ê¸? ìµœê·¼ ?€??ê³ ì 
    final levels = <double>[];
    for (var i = 2; i < candles.length - 2; i++) {
      final c = candles[i];
      final p = isSupport ? c.low : c.high;
      // ê°„ë‹¨ ?¼ë²—: ì£¼ë? 2ê°œë³´????±°??ì§€ì§€) ?’ê±°???€??
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
      // fallback: ìµœì?/ìµœê³ 
      final v = isSupport
          ? candles.map((e) => e.low).reduce((a, b) => a < b ? a : b)
          : candles.map((e) => e.high).reduce((a, b) => a > b ? a : b);
      return ZoneCandidate(
        type: isSupport ? ZoneType.support : ZoneType.resistance,
        low: v - tol,
        high: v + tol,
        score: 55,
        reason: 'ìµœê·¼ ê·¹ê°’(?¨ìˆœ) ê¸°ì?',
      );
    }

    // ?ˆë²¨?¤ì„ ?œê?ê²©ë? ë¬¶ìŒ?ìœ¼ë¡??´ëŸ¬?¤í„°ë§?    final clusters = <double, int>{}; // mid -> touchCount
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

    // ?°ì¹˜ ë§ì? êµ¬ê°„???œí•µ?¬â€?    double bestMid = clusters.keys.first;
    int bestTouch = clusters[bestMid] ?? 0;
    clusters.forEach((k, v) {
      if (v > bestTouch) {
        bestTouch = v;
        bestMid = k;
      }
    });

    // ?ìˆ˜(ì´ˆë³´??: ?°ì¹˜ê°€ ë§ì„?˜ë¡ + ìµœê·¼?¼ìˆ˜ë¡?    final recencyBoost = _recencyBoost(candles, bestMid, tol, isSupport: isSupport);
    final raw = (bestTouch * 12 + recencyBoost).clamp(40, 95);

    return ZoneCandidate(
      type: isSupport ? ZoneType.support : ZoneType.resistance,
      low: bestMid - tol,
      high: bestMid + tol,
      score: raw,
      reason: '?°ì¹˜ ${bestTouch}??+ ìµœê·¼ë°˜ì‘ $recencyBoost',
    );
  }

  static int _recencyBoost(
    List<Candle> candles,
    double mid,
    double tol, {
    required bool isSupport,
  }) {
    // ìµœê·¼ 30ë´??ˆì— ë°˜ì‘???ˆìœ¼ë©?ê°€??    final start = candles.length > 30 ? candles.length - 30 : 0;
    var hit = 0;
    for (var i = start; i < candles.length; i++) {
      final c = candles[i];
      final p = isSupport ? c.low : c.high;
      if ((p - mid).abs() <= tol) hit++;
    }
    return (hit * 8).clamp(0, 40);
  }

  static ZoneCandidate _bestBox(List<Candle> candles) {
    // ?œìµœê·¼ì— ì¢ê²Œ ëª¨ì—¬?ˆëŠ” êµ¬ê°„?ì„ ë°•ìŠ¤ë¡?ë³¸ë‹¤.
    final win = 24; // ??6?œê°„(15m ê¸°ì?)
    var bestScore = -1;
    double bestLow = candles.last.low;
    double bestHigh = candles.last.high;
    for (var i = 0; i <= candles.length - win; i++) {
      final slice = candles.sublist(i, i + win);
      final low = slice.map((e) => e.low).reduce((a, b) => a < b ? a : b);
      final high = slice.map((e) => e.high).reduce((a, b) => a > b ? a : b);
      final width = (high - low).abs();
      if (width <= 0) continue;

      // ì¢ì„?˜ë¡ + ?ˆì—??ì¢…ê?ê°€ ë§ì´ ë¨¸ë¬¼?˜ë¡ ?ìˆ˜
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
      reason: 'ìµœê·¼ ë°•ìŠ¤(ì¢ì? êµ¬ê°„) ?„ë³´',
    );
  }
}
