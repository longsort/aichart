import 'dart:math';
import '../data/models/candle.dart';

class TyronProResult {
  final String bias; // LONG / SHORT / NEUTRAL
  final int confidence; // 0..100
  final bool absorbBull;
  final bool absorbBear;
  final List<String> reasons; // compact bullets
  final List<double> pathMain; // relative returns (0.0..)
  final List<double> pathAlt;

  const TyronProResult({
    required this.bias,
    required this.confidence,
    required this.absorbBull,
    required this.absorbBear,
    required this.reasons,
    required this.pathMain,
    required this.pathAlt,
  });
}

/// ?€?´ë¡± PRO v2 (ê°œí¸):
/// - ê¼¬ë¦¬ ?¡ìˆ˜(engulf/absorb) + RSI ëª¨ë©˜?€ + ë³¼ë¥¨ ?¤íŒŒ?´í¬(ê°„ì´) ê¸°ë°˜
/// - ê²°ê³¼: bias/conf + "ë¯¸ë˜ ê²½ë¡œ(?ì„ )"???ë? ?˜ìµë¥??œí€€??///
/// NOTE: ë³??”ì§„?€ 'ê²°ì •??zip' ?„ë¡œ?íŠ¸?ì„œ ?ˆì „?˜ê²Œ ?™ì‘?˜ë„ë¡?///       ?¸ë? ?˜ì¡´???†ì´(?¼ì´ë¸ŒëŸ¬ë¦??†ì´) êµ¬í˜„??
class TyronProEngine {
  static TyronProResult analyze(List<Candle> candles, {int rsiLen = 14, int pathLen = 18}) {
    if (candles.length < max(60, rsiLen + 10)) {
      return const TyronProResult(
        bias: 'NEUTRAL',
        confidence: 0,
        absorbBull: false,
        absorbBear: false,
        reasons: <String>['?°ì´??ë¶€ì¡?],
        pathMain: <double>[],
        pathAlt: <double>[],
      );
    }

    final last = candles.last;
    final atr = _atr(candles, 14);
    final body = (last.c - last.o).abs();
    final upperWick = last.h - max(last.o, last.c);
    final lowerWick = min(last.o, last.c) - last.l;

    // Absorption (wick dominance + close recovery)
    final bool bullAbsorb = atr > 0 &&
        lowerWick >= atr * 0.45 &&
        lowerWick >= body * 1.2 &&
        last.c >= (last.o + body * 0.35); // closes not too low
    final bool bearAbsorb = atr > 0 &&
        upperWick >= atr * 0.45 &&
        upperWick >= body * 1.2 &&
        last.c <= (last.o - body * 0.35); // closes not too high

    // RSI momentum + micro divergence proxy
    final rsi = _rsi(candles, rsiLen);
    final rsiPrev = _rsi(candles.sublist(0, candles.length - 1), rsiLen);
    final rsiSlope = rsi - rsiPrev;

    // Volume spike proxy (relative to median of recent 30)
    final vols = candles.skip(max(0, candles.length - 40)).map((e) => e.v).toList()..sort();
    final medV = vols.isEmpty ? 0.0 : vols[vols.length ~/ 2];
    final volSpike = medV > 0 ? (last.v / medV) : 1.0;

    // Score assembly
    double score = 0.0;
    final reasons = <String>[];

    if (bullAbsorb) {
      score += 0.55;
      reasons.add('?„ë˜ê¼¬ë¦¬ ?¡ìˆ˜(ë¡?');
    }
    if (bearAbsorb) {
      score -= 0.55;
      reasons.add('?—ê¼¬ë¦??¡ìˆ˜(??');
    }

    if (rsiSlope.abs() > 0.8) {
      score += rsiSlope > 0 ? 0.12 : -0.12;
      reasons.add(rsiSlope > 0 ? 'RSI ëª¨ë©˜?€?? : 'RSI ëª¨ë©˜?€??);
    }

    if (volSpike >= 1.35) {
      score += score >= 0 ? 0.10 : -0.10;
      reasons.add('ê±°ë˜???¤íŒŒ?´í¬');
    }

    // Bias + confidence
    final bias = score >= 0.18 ? 'LONG' : (score <= -0.18 ? 'SHORT' : 'NEUTRAL');
    final conf = (min(1.0, score.abs() / 0.85) * 100.0).round().clamp(0, 100);

    if (reasons.isEmpty) reasons.add('ì¤‘ë¦½(ê·¼ê±° ?½í•¨)');

    // Build future path as relative returns using ATR and score (safe deterministic)
    final pathMain = _buildPath(pathLen: pathLen, atr: atr, price: last.c, score: score, main: true);
    final pathAlt = _buildPath(pathLen: max(10, (pathLen * 0.7).round()), atr: atr, price: last.c, score: score, main: false);

    return TyronProResult(
      bias: bias,
      confidence: conf,
      absorbBull: bullAbsorb,
      absorbBear: bearAbsorb,
      reasons: reasons.take(4).toList(),
      pathMain: pathMain,
      pathAlt: pathAlt,
    );
  }

  static List<double> _buildPath({required int pathLen, required double atr, required double price, required double score, required bool main}) {
    if (atr <= 0 || price <= 0) return const <double>[];
    final dir = score >= 0 ? 1.0 : -1.0;
    final strength = min(1.0, score.abs());
    final step = (atr / price) * (0.45 + 0.75 * strength);
    final wiggle = main ? 0.12 : 0.22;

    final out = <double>[];
    double acc = 0.0;
    for (int i = 0; i < pathLen; i++) {
      // S-curve acceleration then flatten
      final t = i / max(1, pathLen - 1);
      final curve = (1 / (1 + exp(-6 * (t - 0.35)))) * (1 - 0.35 * t);
      final noise = (sin((i + 1) * 1.7) * wiggle) * step;
      acc += dir * step * curve + noise;
      out.add(acc);
    }
    return out;
  }

  static double _atr(List<Candle> c, int len) {
    if (c.length < len + 2) return 0.0;
    final start = c.length - len;
    double sum = 0.0;
    for (int i = start; i < c.length; i++) {
      final cur = c[i];
      final prevClose = c[i - 1].c;
      final tr = max(cur.h - cur.l, max((cur.h - prevClose).abs(), (cur.l - prevClose).abs()));
      sum += tr;
    }
    return sum / len;
  }

  static double _rsi(List<Candle> c, int len) {
    if (c.length < len + 2) return 50.0;
    double gain = 0.0;
    double loss = 0.0;
    final start = c.length - len;
    for (int i = start; i < c.length; i++) {
      final diff = c[i].c - c[i - 1].c;
      if (diff >= 0) {
        gain += diff;
      } else {
        loss += -diff;
      }
    }
    if (gain == 0 && loss == 0) return 50.0;
    if (loss == 0) return 100.0;
    final rs = gain / loss;
    return 100.0 - (100.0 / (1.0 + rs));
  }
}
