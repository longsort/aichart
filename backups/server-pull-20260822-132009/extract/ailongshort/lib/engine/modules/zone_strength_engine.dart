import 'dart:math';

import '../../models/candle.dart';
import '../../models/zone.dart';
import '../../services/bitget_api.dart';

/// Active Zone(?ïÏ†ï Íµ¨Í∞Ñ)???Ä??/// - ?§ÏãúÍ∞?Ï≤¥Í≤∞/?§ÎçîÎ∂ÅÏúºÎ°??úÎ∞©???°Ïàò)?ùÏ? ?úÎö´Î¶??åÌåå?ïÎ†•)???êÏàò
/// - Í≥ºÍ±∞ ?†ÏÇ¨(Ï∫îÎì§ Í∏∞Î∞ò) % ?µÍ≥Ñ
class ZoneStrengthEngine {
  static Future<ZoneStrength> analyze({
    required ZoneCandidate zone,
    required List<Candle> candles,
    required String category,
    required String symbol,
  }) async {
    // 1) ?§ÏãúÍ∞??∞Ïù¥??    final fills = await BitgetApi.getRecentFills(category: category, symbol: symbol, limit: 100);
    final ob = await BitgetApi.getOrderBook(category: category, symbol: symbol, limit: 50);

    final window = _window(zone);
    final inZoneFills = fills.where((f) => f.price >= window.low && f.price <= window.high).toList();
    double buyVol = 0;
    double sellVol = 0;
    for (final f in inZoneFills) {
      if (f.side == 'buy') {
        buyVol += f.size;
      } else if (f.side == 'sell') {
        sellVol += f.size;
      }
    }
    final holdSec = _holdSeconds(inZoneFills);

    final absorption = _absorptionScore(zone, candles, inZoneFills, buyVol, sellVol, holdSec);
    final breakout = _breakoutScore(zone, candles, ob, buyVol, sellVol);

    final hist = _historicalStats(zone, candles);

    return ZoneStrength(
      absorption: absorption,
      breakout: breakout,
      buyVol: buyVol,
      sellVol: sellVol,
      holdSec: holdSec,
      samples: hist.samples,
      upProb1: hist.upProb1,
      avgUp1: hist.avgUp1,
      avgDown1: hist.avgDown1,
      upProb3: hist.upProb3,
      avgUp3: hist.avgUp3,
      avgDown3: hist.avgDown3,
      failProb3: hist.failProb3,
      mfe5: hist.mfe5,
      mae5: hist.mae5,

      // 5Î¥?Ï¢ÖÍ? Í∏∞Ï?(?ïÎ•†/?âÍ∑†)
      upProb5: hist.upProb5,
      avgUp5: hist.avgUp5,
      avgDown5: hist.avgDown5,
    );
  }

  static ({double low, double high}) _window(ZoneCandidate z) {
    // Íµ¨Í∞Ñ ?êÏ≤¥Î•?Í∏∞Î≥∏?ºÎ°ú ?òÎêò, ?¥Ïßù ?¨Ïú†Î•??îÎã§.
    final pad = max(1e-9, (z.high - z.low).abs() * 0.25);
    return (low: z.low - pad, high: z.high + pad);
  }

  static int _holdSeconds(List<PublicFill> fills) {
    if (fills.length < 2) return 0;
    final s = fills.first.tsMs;
    final e = fills.last.tsMs;
    return max(0, ((e - s) / 1000).round());
  }

  static int _absorptionScore(
    ZoneCandidate zone,
    List<Candle> candles,
    List<PublicFill> fills,
    double buyVol,
    double sellVol,
    int holdSec,
  ) {
    // Ï¥àÎ≥¥?? ?úÏ≤¥Í≤?ÎßéÏù¥ + ?§Îûò Î≤ÑÌ? + Î∞îÎ°ú Î∞òÎì±/?Ä??±∞Î∂Ä??    final last = candles.isNotEmpty ? candles.last : null;
    final totalVol = max(1e-9, buyVol + sellVol);
    final imbalance = ((buyVol - sellVol) / totalVol).clamp(-1.0, 1.0);
    final volScore = (min(1.0, totalVol / _baselineVol(candles)) * 100).round();
    final holdScore = (min(1.0, holdSec / 120.0) * 100).round();
    int rejectScore = 40;
    if (last != null) {
      if (zone.type == ZoneType.support) {
        // ÏßÄÏßÄ: ?Ä??Ï∞çÍ≥† ?ÑÎ°ú ?åÎ≥µ?àÎÇò
        final wick = (last.close - last.low).clamp(0.0, 1e18);
        final range = max(1e-9, last.high - last.low);
        rejectScore = (min(1.0, wick / range) * 100).round();
      } else if (zone.type == ZoneType.resistance) {
        // ?Ä?? Í≥†Ï†ê Ï∞çÍ≥† ?ÑÎûòÎ°?Î∞Ä?∏ÎÇò
        final wick = (last.high - last.close).clamp(0.0, 1e18);
        final range = max(1e-9, last.high - last.low);
        rejectScore = (min(1.0, wick / range) * 100).round();
      } else {
        rejectScore = 55;
      }
    }

    // imbalance??ÏßÄÏßÄ?êÏÑú??+Î©?Í∞Ä?? ?Ä??óê?úÎäî -Î©?Í∞Ä??    double imb = imbalance;
    if (zone.type == ZoneType.resistance) imb = -imb;
    final imbScore = ((imb + 1) / 2 * 100).round();

    final raw = (volScore * 0.3 + holdScore * 0.25 + rejectScore * 0.25 + imbScore * 0.2);
    return raw.round().clamp(0, 100);
  }

  static double _baselineVol(List<Candle> candles) {
    // Ï∫îÎì§ volume ?âÍ∑†??Î≤†Ïù¥?§Î°ú ?¨Ïö©(?∞Ïù¥???ÜÏúºÎ©?1)
    final recent = candles.length > 20 ? candles.sublist(candles.length - 20) : candles;
    final vols = recent.map((c) => c.volume).where((v) => v > 0).toList();
    if (vols.isEmpty) return 1.0;
    return vols.reduce((a, b) => a + b) / vols.length;
  }

  static int _breakoutScore(
    ZoneCandidate zone,
    List<Candle> candles,
    OrderBook ob,
    double buyVol,
    double sellVol,
  ) {
    // Ï¥àÎ≥¥?? ?úÎ≤Ω ?áÏùå + ?úÏ™Ω Ï≤¥Í≤∞ ?∞ÏúÑ + Í≥ÑÏÜç ?åÎü¨Î∂ôÏùå??    final last = candles.isNotEmpty ? candles.last : null;
    final totalVol = max(1e-9, buyVol + sellVol);
    final imbalance = ((buyVol - sellVol) / totalVol).clamp(-1.0, 1.0);

    // ?§ÎçîÎ∂?Î≤? ÏßÄÏßÄÎ©?bids, ?Ä??©¥ asks, Î∞ïÏä§Î©??????ïÏ? Ï™?    final wall = _wallQty(zone, ob);
    final wallScore = (100 - min(100.0, wall * 10).round()).clamp(0, 100); // Î≤ΩÏù¥ ?¥ÏàòÎ°??åÌåå ?¥Î†µ??
    int pressScore = 50;
    if (last != null) {
      // ?ëÍ∑º ?çÎèÑ: ÏµúÍ∑º 5Î¥âÏóê??zone Í∑ºÏ≤òÎ°??êÏ£º ?§Î©¥ ?ïÎ†•
      final n = min(5, candles.length);
      final slice = candles.sublist(candles.length - n);
      final hits = slice.where((c) {
        final p = c.close;
        return p >= zone.low && p <= zone.high;
      }).length;
      pressScore = (hits / n * 100).round();
    }

    // imbalance Î∞©Ìñ•: ÏßÄÏßÄ??Îß§ÎèÑ ?∞ÏÑ∏Î©??òÎ∞© ?åÌåå ?ïÎ†•, ?Ä??? Îß§Ïàò ?∞ÏÑ∏Î©??ÅÎ∞© ?ïÎ†•
    double imb = 0.0;
    if (zone.type == ZoneType.support) imb = -imbalance;
    if (zone.type == ZoneType.resistance) imb = imbalance;
    if (zone.type == ZoneType.box) imb = imbalance.abs();
    final imbScore = ((imb.abs()).clamp(0.0, 1.0) * 100).round();

    final raw = (wallScore * 0.35 + pressScore * 0.25 + imbScore * 0.25 + 50 * 0.15);
    return raw.round().clamp(0, 100);
  }

  static double _wallQty(ZoneCandidate zone, OrderBook ob) {
    double sumQty(List<List<double>> side) {
      if (side.isEmpty) return 0;
      double s = 0;
      for (final lv in side) {
        final p = lv[0];
        final q = lv[1];
        if (p >= zone.low && p <= zone.high) s += q;
      }
      return s;
    }

    if (zone.type == ZoneType.support) return sumQty(ob.bids);
    if (zone.type == ZoneType.resistance) return sumQty(ob.asks);

    final b = sumQty(ob.bids);
    final a = sumQty(ob.asks);
    return min(a, b);
  }

  static _Hist _historicalStats(ZoneCandidate zone, List<Candle> candles) {
    // Ï∫îÎì§ Í∏∞Î∞ò ?úÏú†??Î∞òÏùë???µÍ≥Ñ (Ï¥àÎ≥¥??
    if (candles.length < 40) {
      return const _Hist.empty();
    }
    final window = _window(zone);
    final touches = <int>[];
    for (var i = 0; i < candles.length - 6; i++) {
      final c = candles[i];
      bool hit = false;
      if (zone.type == ZoneType.support) {
        hit = c.low >= window.low && c.low <= window.high;
      } else if (zone.type == ZoneType.resistance) {
        hit = c.high >= window.low && c.high <= window.high;
      } else {
        hit = c.close >= window.low && c.close <= window.high;
      }
      if (hit) touches.add(i);
    }

    if (touches.isEmpty) return const _Hist.empty();

    int up1 = 0;
    int up3 = 0;
    int up5 = 0;
    double sumUp1 = 0;
    double sumDown1 = 0;
    double sumUp3 = 0;
    double sumDown3 = 0;
    double sumUp5 = 0;
    double sumDown5 = 0;
    int fail3 = 0;
    double mfe5 = 0;
    double mae5 = 0;

    for (final idx in touches) {
      final entry = candles[idx].close;
      // 1Î¥?      final c1 = candles[idx + 1].close;
      final r1 = (c1 - entry) / entry * 100;
      if (r1 >= 0) {
        up1++;
        sumUp1 += r1;
      } else {
        sumDown1 += r1; // negative
      }

      // 3Î¥?      final c3 = candles[idx + 3].close;
      final r3 = (c3 - entry) / entry * 100;
      if (r3 >= 0) {
        up3++;
        sumUp3 += r3;
      } else {
        fail3++;
        sumDown3 += r3;
      }

      // 5Î¥?(Ï¢ÖÍ? Í∏∞Ï?)
      final c5 = candles[idx + 5].close;
      final r5 = (c5 - entry) / entry * 100;
      if (r5 >= 0) {
        up5++;
        sumUp5 += r5;
      } else {
        sumDown5 += r5;
      }

      // 5Î¥?MFE/MAE
      final slice = candles.sublist(idx + 1, idx + 6);
      final maxHigh = slice.map((e) => e.high).reduce(max);
      final minLow = slice.map((e) => e.low).reduce(min);
      final _mfe = (maxHigh - entry) / entry * 100;
      final _mae = (minLow - entry) / entry * 100; // negative
      mfe5 += _mfe;
      mae5 += _mae;
    }

    final n = touches.length.toDouble();
    return _Hist(
      samples: touches.length,
      upProb1: up1 / n,
      avgUp1: up1 == 0 ? 0 : (sumUp1 / up1),
      avgDown1: (touches.length - up1) == 0 ? 0 : (sumDown1 / (touches.length - up1)),
      upProb3: up3 / n,
      avgUp3: up3 == 0 ? 0 : (sumUp3 / up3),
      avgDown3: (touches.length - up3) == 0 ? 0 : (sumDown3 / (touches.length - up3)),
      failProb3: fail3 / n,
      mfe5: mfe5 / n,
      mae5: mae5 / n,

      upProb5: up5 / n,
      avgUp5: up5 == 0 ? 0 : (sumUp5 / up5),
      avgDown5: (touches.length - up5) == 0 ? 0 : (sumDown5 / (touches.length - up5)),
    );
  }
}

class _Hist {
  final int samples;
  final double upProb1;
  final double avgUp1;
  final double avgDown1;
  final double upProb3;
  final double avgUp3;
  final double avgDown3;
  final double failProb3;
  final double mfe5;
  final double mae5;

  final double upProb5;
  final double avgUp5;
  final double avgDown5;

  const _Hist({
    required this.samples,
    required this.upProb1,
    required this.avgUp1,
    required this.avgDown1,
    required this.upProb3,
    required this.avgUp3,
    required this.avgDown3,
    required this.failProb3,
    required this.mfe5,
    required this.mae5,

    required this.upProb5,
    required this.avgUp5,
    required this.avgDown5,
  });

  const _Hist.empty()
      : samples = 0,
        upProb1 = 0,
        avgUp1 = 0,
        avgDown1 = 0,
        upProb3 = 0,
        avgUp3 = 0,
        avgDown3 = 0,
        failProb3 = 0,
        mfe5 = 0,
        mae5 = 0,
        upProb5 = 0,
        avgUp5 = 0,
        avgDown5 = 0;
}
