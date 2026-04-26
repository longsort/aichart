import 'dart:math';

import '../models/candle.dart';
import 'learning/learning_engine.dart';

/// Result object consumed by UI.
class Decision {
  final String title; // "�? / "?? / "관�?
  final String subtitle;
  final int evidenceHit;
  final int evidenceTotal;
  final int score; // 0..100
  final int confidence; // 0..100
  final Map<String, int> meters; // progress bars

  const Decision({
    required this.title,
    required this.subtitle,
    required this.evidenceHit,
    required this.evidenceTotal,
    required this.score,
    required this.confidence,
    required this.meters,
  });

  /// Backward compatibility with older UI patches.
  String get action => title;

  /// Older widgets expect a 'detail' string.
  String get detail => subtitle;

  /// Older widgets expect a 'locked' flag (NO-TRADE lock).
  /// We lock when evidence is very low (prevents risky entries).
  bool get locked => evidenceHit < 2;
}

/// Minimal zone bundle.
class KeyZones {
  final double? support;
  final double? resistance;
  const KeyZones({this.support, this.resistance});
}

/// Optional TyRong bundle (probabilities 0..100).
class TyRongResult {
  final int p1;
  final int p3;
  final int p5;
  const TyRongResult({required this.p1, required this.p3, required this.p5});
}

class DecisionEngineV2 {
  /// Evaluate using real candles. Keeps output stable even with short history.
  static Future<Decision> evaluate({
    required List<Candle> candles,
    required double currentPrice,
    required bool swingMode,
    required KeyZones zones,
    required TyRongResult? tyRong,
    int evidenceNeed = 5,
  }) async {
    final penalty = await LearningEngine.conservatismPenalty(window: 160);

    final n = candles.length;
    if (n < 30) {
      final meters = <String, int>{
        '?�름(방향)': 20,
        '차트 모양(?�정)': 50,
        '?�손 ?�직임(?�들�?': 30,
        '?�림·물량(급등??': 30,
        '?�험??: min(90, 40 + penalty),
      };
      return Decision(
        title: '관�?,
        subtitle: '?�이?��? ?�직 부족해?? (캔들 ?? $n)',
        evidenceHit: 0,
        evidenceTotal: evidenceNeed,
        score: 40,
        confidence: max(10, 40 - penalty),
        meters: meters,
      );
    }

    final closes = candles.map((c) => c.close).toList(growable: false);
    final highs = candles.map((c) => c.high).toList(growable: false);
    final lows = candles.map((c) => c.low).toList(growable: false);
    final vols = candles.map((c) => c.volume).toList(growable: false);

    final emaFast = _ema(closes, 20);
    final emaSlow = _ema(closes, 50);
    final rsi = _rsi(closes, 14);
    final atr = _atr(highs, lows, closes, 14);

    final emaSlope = emaSlow.last - emaSlow[max(0, emaSlow.length - 6)];
    final trendUp = emaFast.last > emaSlow.last && emaSlope > 0;
    final trendDn = emaFast.last < emaSlow.last && emaSlope < 0;

    final rsiNow = rsi.last;
    final momentumUp = rsiNow >= 52;
    final momentumDn = rsiNow <= 48;

    final atrPct = (atr.last / max(1e-9, currentPrice)) * 100.0;
    final volatilityOk = swingMode ? atrPct <= 2.6 : atrPct <= 1.6;

    final volAvg = vols.sublist(max(0, vols.length - 20)).reduce((a, b) => a + b) / min(20, vols.length);
    final volSpike = vols.last > volAvg * 1.6;

    final nearSupport = zones.support != null
        ? ((currentPrice - zones.support!).abs() / currentPrice) <= (swingMode ? 0.012 : 0.008)
        : false;
    final nearResistance = zones.resistance != null
        ? ((currentPrice - zones.resistance!).abs() / currentPrice) <= (swingMode ? 0.012 : 0.008)
        : false;

    final tyUp = (tyRong?.p3 ?? 50) >= 55 || (tyRong?.p5 ?? 50) >= 55;
    final tyDn = (tyRong?.p3 ?? 50) <= 45 || (tyRong?.p5 ?? 50) <= 45;

    int longHit = 0;
    if (trendUp) longHit++;
    if (momentumUp) longHit++;
    if (volatilityOk) longHit++;
    if (nearSupport) longHit++;
    if (tyUp) longHit++;

    int shortHit = 0;
    if (trendDn) shortHit++;
    if (momentumDn) shortHit++;
    if (volatilityOk) shortHit++;
    if (nearResistance) shortHit++;
    if (tyDn) shortHit++;

    final riskBase = swingMode ? 45 : 55;
    int risk = riskBase + (volSpike ? 12 : 0) + (volatilityOk ? 0 : 15) + penalty;
    risk = risk.clamp(0, 100);

    final bestHit = max(longHit, shortHit);
    final bias = longHit == shortHit ? 0 : (longHit > shortHit ? 1 : -1);

    String title;
    String subtitle;

    if (bestHit < 3) {
      title = '관�?;
      subtitle = '근거가 ?�직 부족해?? (�?$longHit/$evidenceNeed · ??$shortHit/$evidenceNeed)';
    } else {
      if (bias > 0) {
        title = '�?;
        subtitle = '근거 $longHit/$evidenceNeed ?�치. (?�윙 ${swingMode ? "ON" : "OFF"})';
      } else if (bias < 0) {
        title = '??;
        subtitle = '근거 $shortHit/$evidenceNeed ?�치. (?�윙 ${swingMode ? "ON" : "OFF"})';
      } else {
        title = '관�?;
        subtitle = '�???근거가 비슷?�요. (�?$longHit · ??$shortHit)';
      }
    }

    final baseScore = 50 + (bestHit * 8) - (volSpike ? 5 : 0) - (volatilityOk ? 0 : 8);
    final score = baseScore.clamp(0, 100);
    final conf = (55 + (bestHit * 7) - risk * 0.35).round().clamp(0, 100);

    final meters = <String, int>{
      '?�름(방향)': _pctFromBool(trendUp || trendDn, 70, 35),
      '차트 모양(?�정)': (100 - (atrPct * 18)).round().clamp(0, 100),
      '?�손 ?�직임(?�들�?': volSpike ? 70 : 35,
      '?�림·물량(급등??': (volSpike ? 65 : 40) + (momentumUp || momentumDn ? 10 : 0),
      '?�험??: risk,
    };

    return Decision(
      title: title,
      subtitle: subtitle,
      evidenceHit: bestHit,
      evidenceTotal: evidenceNeed,
      score: score,
      confidence: conf,
      meters: meters,
    );
  }

  static int _pctFromBool(bool v, int on, int off) => v ? on : off;

  static List<double> _ema(List<double> values, int period) {
    final out = List<double>.filled(values.length, values.first);
    final k = 2.0 / (period + 1);
    double prev = values.first;
    for (int i = 0; i < values.length; i++) {
      final v = values[i];
      prev = (v * k) + (prev * (1 - k));
      out[i] = prev;
    }
    return out;
  }

  static List<double> _rsi(List<double> closes, int period) {
    final out = List<double>.filled(closes.length, 50);
    double gain = 0, loss = 0;
    for (int i = 1; i < closes.length; i++) {
      final diff = closes[i] - closes[i - 1];
      final g = diff > 0 ? diff : 0.0;
      final l = diff < 0 ? -diff : 0.0;
      if (i <= period) {
        gain += g;
        loss += l;
        if (i == period) {
          final rs = loss == 0 ? 100.0 : gain / loss;
          out[i] = 100 - (100 / (1 + rs));
        }
      } else {
        gain = (gain * (period - 1) + g) / period;
        loss = (loss * (period - 1) + l) / period;
        final rs = loss == 0 ? 100.0 : gain / loss;
        out[i] = 100 - (100 / (1 + rs));
      }
      out[i] = out[i].clamp(0, 100);
    }
    for (int i = 0; i < min(period, closes.length); i++) {
      out[i] = out[min(period, closes.length - 1)];
    }
    return out;
  }

  static List<double> _atr(List<double> highs, List<double> lows, List<double> closes, int period) {
    final tr = List<double>.filled(closes.length, 0);
    for (int i = 1; i < closes.length; i++) {
      final h = highs[i], l = lows[i], pc = closes[i - 1];
      final a = h - l;
      final b = (h - pc).abs();
      final c = (l - pc).abs();
      tr[i] = max(a, max(b, c));
    }
    final out = List<double>.filled(closes.length, 0);
    double prev = tr.take(min(tr.length, period + 1)).reduce((a, b) => a + b) / max(1, period);
    for (int i = 0; i < closes.length; i++) {
      if (i < period) {
        out[i] = prev;
      } else {
        prev = (prev * (period - 1) + tr[i]) / period;
        out[i] = prev;
      }
    }
    return out;
  }
}
