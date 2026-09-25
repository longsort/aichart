import 'dart:math';
import '../models/fu_state.dart';
import '../models/future_path_dto.dart';

class FuturePathEngine {
  /// v1: 안전한 기본값 엔진(빌드 안정 최우선)
  /// - reactLow/high + mtfPulse 다수결로 방향(bias)을 정하고,
  /// - MAIN/ALT/FAIL 3경로(5파동 느낌) poly를 생성한다.
  /// - 이후 CHOCH/BOS/MSB/EQH/EQL 구조 엔진으로 교체해도 DTO/렌더는 그대로.
  static FuturePathDTO build({
    required String symbol,
    required String tf,
    required String structureTag,
    required List<FuCandle> candles,
    /// Optional higher-timeframe candles used for swing targets/structure.
    /// Example: chart=5m/15m, swing=1h+.
    List<FuCandle>? swingCandles,
    required double reactLow,
    required double reactHigh,
    required Map<String, FuTfPulse> mtfPulse,
    required int selected,

    // === 정확도 보정(선택) ===
    // 0~100, 50=중립
    int closeScore = 50,
    int breakoutScore = 50,
    int volumeScore = 50,
    int forceScore = 50,
    int absorptionScore = 50,
    int defenseScore = 50,
    int distributionScore = 50,
    int sweepRisk = 50,
  }) {
    final last = candles.isNotEmpty ? candles.last.close : (reactHigh + reactLow) / 2;

    var biasLong = _isLongBias(mtfPulse);
    // 구조 태그가 있으면 미래경로의 '방향'을 구조 우선으로 보정
    final st = structureTag.toUpperCase();
    if (st.contains('MSB_UP') || st.contains('BOS_UP') || st.contains('CHOCH_UP')) biasLong = true;
    if (st.contains('MSB_DN') || st.contains('BOS_DN') || st.contains('CHOCH_DN')) biasLong = false;
    final baseProbs = _deriveProb(mtfPulse);
    final ss = _structureScore(mtfPulse);
    var probs = _applyScoreToProb(baseProbs, ss);

    // 구조 기반 확률 재가중(정확도 우선):
    // - BOS: MAIN 가중
    // - CHOCH: MAIN/ALT 2분기(FAIL 낮춤)
    // - MSB: MAIN 크게, FAIL 낮춤
    if (st.contains('MSB_')) {
      probs = (min(90, probs.$1 + 12), max(5, probs.$2 - 4), max(5, probs.$3 - 8));
    } else if (st.contains('BOS_')) {
      probs = (min(85, probs.$1 + 8), max(8, probs.$2 - 3), max(7, probs.$3 - 5));
    } else if (st.contains('CHOCH_')) {
      final main = min(75, probs.$1 + 4);
      final alt  = min(60, probs.$2 + 6);
      final fail = max(8, probs.$3 - 10);
      probs = (main, alt, fail);
    }

    // === 마감/돌파/거래량 + 세력(Force) 기반 확률 보정 ===
    // - close/breakout/volume/force/defense/absorption↑ → MAIN↑
    // - distribution/sweepRisk↑ → FAIL↑
    probs = _reweightBySignals(
      probs,
      closeScore: closeScore,
      breakoutScore: breakoutScore,
      volumeScore: volumeScore,
      forceScore: forceScore,
      defenseScore: defenseScore,
      absorptionScore: absorptionScore,
      distributionScore: distributionScore,
      sweepRisk: sweepRisk,
      isChoch: st.contains('CHOCH_'),
    );

    final range = (reactHigh - reactLow).abs();
    final step = range > 0 ? range : max(last.abs() * 0.006, 1.0);

    final swing = (swingCandles != null && swingCandles.isNotEmpty) ? swingCandles : candles;
    final atr = _atr14(swing);

    // (2) Level Snap: 구조/캔들 극값 기반으로 INV/T1/T2를 '근처면' 흡착
    final snapTh = max(step * 0.35, atr * 1.2);
    final loEx = _recentExtremeLow(swing, lookback: 30);
    final hiEx = _recentExtremeHigh(swing, lookback: 30);

    final inv0 = biasLong ? reactLow : reactHigh;
    final t10  = biasLong ? reactHigh : reactLow;

    final inv = biasLong ? _snap(inv0, loEx, snapTh) : _snap(inv0, hiEx, snapTh);
    final t1  = biasLong ? _snap(t10, hiEx, snapTh) : _snap(t10, loEx, snapTh);
    final ext = atr > 0 ? atr * 1.35 : step;
    final t2  = biasLong ? (t1 + ext) : (t1 - ext);

    // normalized X points in the right 30% future area
    const xs = <double>[0.70, 0.78, 0.86, 0.94, 0.98];

    List<FuturePolyPoint> mk(List<double> ps) =>
        List<FuturePolyPoint>.generate(xs.length, (i) => FuturePolyPoint(xs[i], ps[i]));

    // MAIN: sweep -> retest -> push
    final mainP = biasLong
        ? <double>[last, (last + t1) / 2, (last + inv) / 2, t1, t2]
        : <double>[last, (last + t1) / 2, (last + inv) / 2, t1, t2];

    // ALT: deeper retest
    final alt2 = biasLong ? (reactHigh + step * 0.55) : (reactLow - step * 0.55);
    final altP = biasLong
        ? <double>[last, (last + inv) / 2, inv, (inv + t1) / 2, alt2]
        : <double>[last, (last + inv) / 2, inv, (inv + t1) / 2, alt2];

    // FAIL: break structure
    final failDeep = biasLong ? (reactLow - step * 0.35) : (reactHigh + step * 0.35);
    final failP = biasLong
        ? <double>[last, (last + inv) / 2, inv, (inv + failDeep) / 2, failDeep]
        : <double>[last, (last + inv) / 2, inv, (inv + failDeep) / 2, failDeep];

    final levels = FutureLevels(inv: inv, t1: t1, t2: t2, reactLow: reactLow, reactHigh: reactHigh);

    return FuturePathDTO(
      symbol: symbol,
      tf: tf,
      generatedAt: DateTime.now(),
      selected: selected.clamp(0, 2),
      probMain: probs.$1,
      probAlt: probs.$2,
      probFail: probs.$3,
      structureScore: ss,
      levels: levels,
      main: FuturePath(name: 'MAIN', poly: mk(mainP), inv: inv, t1: t1, t2: t2),
      alt: FuturePath(name: 'ALT', poly: mk(altP), inv: inv, t1: t1, t2: t2),
      fail: FuturePath(name: 'FAIL', poly: mk(failP), inv: inv, t1: t1, t2: t2),
    );
  }


static double _atr14(List<FuCandle> candles, {int len = 14}) {
  if (candles.length < 2) return 0;
  final n = candles.length;
  final start = max(1, n - len);
  double sum = 0;
  int cnt = 0;
  for (int i = start; i < n; i++) {
    final c = candles[i];
    final p = candles[i-1];
    final tr = max(c.high - c.low, max((c.high - p.close).abs(), (c.low - p.close).abs()));
    sum += tr;
    cnt++;
  }
  return cnt == 0 ? 0 : sum / cnt;
}

static double _recentExtremeLow(List<FuCandle> candles, {int lookback = 20}) {
  if (candles.isEmpty) return 0;
  final start = max(0, candles.length - lookback);
  double lo = candles[start].low;
  for (int i = start + 1; i < candles.length; i++) {
    if (candles[i].low < lo) lo = candles[i].low;
  }
  return lo;
}

static double _recentExtremeHigh(List<FuCandle> candles, {int lookback = 20}) {
  if (candles.isEmpty) return 0;
  final start = max(0, candles.length - lookback);
  double hi = candles[start].high;
  for (int i = start + 1; i < candles.length; i++) {
    if (candles[i].high > hi) hi = candles[i].high;
  }
  return hi;
}

static double _snap(double base, double candidate, double threshold) {
  if (threshold <= 0) return base;
  return (candidate - base).abs() <= threshold ? candidate : base;
}


static int _structureScore(Map<String, FuTfPulse> mtfPulse) {
  if (mtfPulse.isEmpty) return 50;
  int up = 0, dn = 0;
  double s = 0, r = 0;
  for (final p in mtfPulse.values) {
    final d = p.dir.toUpperCase();
    if (d == 'LONG' || d == 'UP') up++;
    if (d == 'SHORT' || d == 'DOWN') dn++;
    s += p.strength.toDouble();
    r += p.risk.toDouble();
  }
  final n = mtfPulse.length;
  final avgS = s / n;
  final avgR = r / n;
  final consensus = (n == 0) ? 0.0 : ( (up - dn).abs() / n ).clamp(0.0, 1.0); // 0..1
  final cPct = consensus * 100.0;

  // 0..100
  final score = (0.45 * avgS + 0.35 * (100.0 - avgR) + 0.20 * cPct).round();
  return score.clamp(0, 100);
}

static (int,int,int) _applyScoreToProb((int,int,int) base, int score) {
  // score>50: main↑, score<50: fail↑ (ALT는 중간 흡수)
  final main0 = base.$1;
  final shift = ((score - 50) * 0.18).round(); // -9..+9 정도
  final main = (main0 + shift).clamp(30, 85);

  final remain = 100 - main;
  final alt = (remain * 0.45).round().clamp(10, 50);
  final fail = (100 - main - alt).clamp(5, 60);
  return (main, alt, fail);
}

  static bool _isLongBias(Map<String, FuTfPulse> mtfPulse) {
    if (mtfPulse.isEmpty) return true;
    int up = 0, dn = 0;
    for (final p in mtfPulse.values) {
      final d = p.dir.toUpperCase();
      if (d == 'LONG' || d == 'UP') up++;
      if (d == 'SHORT' || d == 'DOWN') dn++;
    }
    return up >= dn;
  }

  /// returns (main, alt, fail)
  static (int,int,int) _deriveProb(Map<String, FuTfPulse> mtfPulse) {
    if (mtfPulse.isEmpty) return (55, 30, 15);
    double s = 0, r = 0;
    for (final p in mtfPulse.values) {
      s += p.strength.toDouble();
      r += p.risk.toDouble();
    }
    s /= mtfPulse.length;
    r /= mtfPulse.length;

    final main = (50 + ((s - r) / 2)).round().clamp(30, 80);
    final alt  = ((100 - main) * 0.45).round().clamp(10, 40);
    final fail = (100 - main - alt).clamp(5, 50);
    return (main, alt, fail);
  }

  /// Aggregate lower-timeframe candles into a coarser series by fixed grouping.
  /// - group = number of base candles per one aggregated candle.
  /// - This is used to derive swing targets from 1h+ while rendering 5m/15m.
  static List<FuCandle> aggregateByGroup(List<FuCandle> base, int group) {
    if (group <= 1 || base.isEmpty) return base;
    final out = <FuCandle>[];
    for (int i = 0; i < base.length; i += group) {
      final jEnd = min(i + group, base.length);
      final slice = base.sublist(i, jEnd);
      if (slice.isEmpty) continue;
      final open = slice.first.open;
      final close = slice.last.close;
      double high = slice.first.high;
      double low = slice.first.low;
      double vol = 0;
      for (final c in slice) {
        if (c.high > high) high = c.high;
        if (c.low < low) low = c.low;
        vol += c.volume;
      }
      out.add(FuCandle(open: open, high: high, low: low, close: close, ts: slice.last.ts, volume: vol));
    }
    return out;
  }

  static (int,int,int) _reweightBySignals(
    (int,int,int) base, {
    required int closeScore,
    required int breakoutScore,
    required int volumeScore,
    required int forceScore,
    required int defenseScore,
    required int absorptionScore,
    required int distributionScore,
    required int sweepRisk,
    required bool isChoch,
  }) {
    int main = base.$1;
    int alt = base.$2;
    int fail = base.$3;

    // Normalize inputs around 50
    int d(int v) => (v - 50).clamp(-50, 50);

    // MAIN booster: close/breakout/volume + force/defense/absorption
    final boost = (
          d(closeScore) * 0.06 +
          d(breakoutScore) * 0.07 +
          d(volumeScore) * 0.06 +
          d(forceScore) * 0.05 +
          d(defenseScore) * 0.05 +
          d(absorptionScore) * 0.04
        )
        .round();

    // FAIL booster: distribution + sweepRisk
    final danger = (d(distributionScore) * 0.06 + d(sweepRisk) * 0.08).round();

    // CHOCH는 본래 분기 상태 → MAIN 과가중을 약화시키고 ALT를 더 살림
    if (isChoch) {
      main += (boost * 0.75).round();
      alt += (boost * 0.25).round();
    } else {
      main += boost;
    }

    fail += danger;

    // Clamp and renormalize to 100
    main = main.clamp(10, 92);
    alt = alt.clamp(5, 80);
    fail = fail.clamp(5, 80);

    int sum = main + alt + fail;
    if (sum <= 0) return (55, 30, 15);

    // Scale to 100 keeping relative ratios
    final k = 100.0 / sum;
    main = (main * k).round();
    alt = (alt * k).round();
    fail = 100 - main - alt;

    // final guard
    if (fail < 5) {
      final delta = 5 - fail;
      fail = 5;
      if (main > alt) {
        main = (main - delta).clamp(10, 95);
      } else {
        alt = (alt - delta).clamp(5, 85);
      }
    }
    if (main < 10) main = 10;
    if (alt < 5) alt = 5;
    final fixSum = main + alt + fail;
    if (fixSum != 100) {
      main = (main * (100.0 / fixSum)).round();
      alt = (alt * (100.0 / fixSum)).round();
      fail = 100 - main - alt;
    }
    return (main, alt, fail);
  }
}
