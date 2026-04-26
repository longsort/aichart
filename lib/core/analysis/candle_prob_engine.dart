import '../models/fu_state.dart';

/// ë¯¸ë‹ˆì°¨íŠ¸ ?„ë˜??ë¿Œë¦´ ?œí•œ??ì¹??¤ëª¨)??ê³„ì‚°ê¸?
/// - ?¸ë? CSV ?†ì–´?? ?„ì¬ ?¤ê³  ?ˆëŠ” candlesë¡??µê³„/?•ë¥ ??ê³„ì‚°
/// - ?¸ë? CSVë¥?ë¶™ì´ë©??•í™•?„ê? ???¬ë¼ê°€ì§€ë§?ì¶”í›„), ?°ì„ ?€ ???¨ë…?¼ë¡œ ?™ì‘

class ChipItem {
  final String title;
  final String value;
  final ChipTone tone;
  const ChipItem({required this.title, required this.value, required this.tone});
}

enum ChipTone { good, bad, warn, neutral }

class CandleProbEngine {
  /// ê¸°ë³¸: ë§ˆì?ë§?240ë´??•ë„ë¡?ê³„ì‚°(?ˆë¬´ ì§§ìœ¼ë©??ˆëŠ” ë§Œí¼).
  /// 1W/1M/1Y??ë´??˜ê? ?ì„ ???ˆìœ¼ë¯€ë¡?ìµœì†Œ 12ë´‰ë???ì¹??œì‹œ(?´ì „ 30 ??12ë¡??„í™”).
  List<ChipItem> buildChips(List<FuCandle> candles, {
    String currentDir = 'NEUTRAL',
    int currentProb = 0,
    int sweepRisk = 0,
  }) {
    const int minCandles = 12; // 1Y(~14ë´? ???¥ê¸° TF ?œì„±??    if (candles.length < minCandles) {
      return const [
        ChipItem(title: '?°ì´??, value: 'ë¶€ì¡?, tone: ChipTone.warn),
        ChipItem(title: '?ìŠ¹(1ë´?', value: '--', tone: ChipTone.neutral),
        ChipItem(title: '?ìŠ¹(3ë´?', value: '--', tone: ChipTone.neutral),
        ChipItem(title: '?ìŠ¹(5ë´?', value: '--', tone: ChipTone.neutral),
      ];
    }

    final data = candles.length > 400 ? candles.sublist(candles.length - 400) : candles;

    final last = data.last;
    final body = (last.close - last.open).abs();
    final bodies = data.map((c) => (c.close - c.open).abs()).toList();
    final vols = data.map((c) => c.volume).toList();
    final bodyAvg = _avg(bodies);
    final volAvg = _avg(vols);

    final isBull = last.close >= last.open;
    final isLarge = bodyAvg > 0 ? (body >= bodyAvg * 2.0) : false;
    final isVolSpike = volAvg > 0 ? (last.volume >= volAvg * 1.6) : false;

    // ?œì¥?€/ë³¼ë¥¨?¤íŒŒ?´í¬??ì¡°ê±´??ê±¸ë ¸???Œì˜ ?ˆìŠ¤? ë¦¬ ì¡°ê±´ë¶€ ?•ë¥ 
    final cond = _Condition(
      large: isLarge,
      bull: isBull,
      volSpike: isVolSpike,
    );

    final p1 = _nextDirectionProb(data, cond, horizon: 1);
    final p3 = _nextDirectionProb(data, cond, horizon: 3);
    final p5 = _nextDirectionProb(data, cond, horizon: 5);
    final replarge5 = _reLargeProb(data, cond, horizon: 5);

    final pattern = _detectPattern(data);
    final regime = _detectRegime(data);

    final dir = currentDir.toUpperCase();
    final dirKo = dir == 'LONG' ? 'ë¡? : dir == 'SHORT' ? '?? : 'ê´€ë§?;

    return [
      ChipItem(
        title: 'ë°©í–¥',
        value: '$dirKo ${currentProb > 0 ? '$currentProb%' : ''}'.trim(),
        tone: dir == 'LONG' ? ChipTone.good : dir == 'SHORT' ? ChipTone.bad : ChipTone.neutral,
      ),
      ChipItem(
        title: '?¨í„´',
        value: pattern.label,
        tone: pattern.tone,
      ),
      ChipItem(
        title: '?ˆì§',
        value: regime.label,
        tone: regime.tone,
      ),
      ChipItem(
        title: '?¥ë?',
        value: isLarge ? (isBull ? '?¥ë??‘ë´‰' : '?¥ë??Œë´‰') : '?†ìŒ',
        tone: isLarge ? (isBull ? ChipTone.good : ChipTone.bad) : ChipTone.neutral,
      ),
      ChipItem(
        title: 'ë³¼ë¥¨',
        value: isVolSpike ? '?¤íŒŒ?´í¬' : 'ë³´í†µ',
        tone: isVolSpike ? ChipTone.warn : ChipTone.neutral,
      ),
      // ? ï¸ ?¬ê¸° ?•ë¥ ?€ ?œë¡±/???•ì •?ì´ ?„ë‹ˆ?? ì¡°ê±´ë¶€ ?µê³„ ê¸°ë°˜??**?ìŠ¹(UP) ?•ë¥ **?´ë‹¤.
      // ?¬ìš©???¼ë™ ë°©ì?: ?˜í™•ë¥ â€??€???˜ìƒ??UP)?™ë¡œ ?œê¸°.
      ChipItem(
        title: '?ìŠ¹(1ë´?',
        value: _pct(p1),
        tone: _toneByPct(p1),
      ),
      ChipItem(
        title: '?ìŠ¹(3ë´?',
        value: _pct(p3),
        tone: _toneByPct(p3),
      ),
      ChipItem(
        title: '?ìŠ¹(5ë´?',
        value: _pct(p5),
        tone: _toneByPct(p5),
      ),
      ChipItem(
        title: '?¥ë??¬ì¶œ??,
        value: _pct(replarge5),
        tone: _toneByPct(replarge5),
      ),
      ChipItem(
        title: '?¤ìœ•?„í—˜',
        value: '${sweepRisk.clamp(0, 100)}%',
        tone: sweepRisk >= 70 ? ChipTone.bad : (sweepRisk >= 45 ? ChipTone.warn : ChipTone.neutral),
      ),
    ];
  }

  ChipTone _toneByPct(double p) {
    final v = (p * 100).round();
    if (v >= 65) return ChipTone.good;
    if (v <= 35) return ChipTone.bad;
    return ChipTone.warn;
  }

  String _pct(double p) {
    if (p <= 0) return '--';
    return '${(p * 100).round()}%';
  }

  double _nextDirectionProb(List<FuCandle> data, _Condition now, {required int horizon}) {
    // ì¡°ê±´ë¶€ ?œë³¸ ?˜ê? ?ˆë¬´ ?‘ìœ¼ë©??¨ìˆœ ëª¨ë©˜?€?¼ë¡œ ?€ì²?    final stats = _conditionalSample(data, now);
    if (stats.count < 20) {
      return _momentumProb(data, horizon: horizon);
    }

    int up = 0;
    int total = 0;
    for (final idx in stats.indices) {
      final end = idx + horizon;
      if (end >= data.length) continue;
      final base = data[idx].close;
      final future = data[end].close;
      total++;
      if (future >= base) up++;
    }
    if (total <= 0) return 0;
    return up / total;
  }

  double _reLargeProb(List<FuCandle> data, _Condition now, {required int horizon}) {
    final stats = _conditionalSample(data, now);
    if (stats.count < 20) return 0;

    final bodies = data.map((c) => (c.close - c.open).abs()).toList();
    final bodyAvg = _avg(bodies);
    if (bodyAvg <= 0) return 0;

    int hit = 0;
    int total = 0;
    for (final idx in stats.indices) {
      final end = (idx + horizon).clamp(0, data.length - 1);
      bool anyLarge = false;
      for (int j = idx + 1; j <= end; j++) {
        final b = (data[j].close - data[j].open).abs();
        if (b >= bodyAvg * 2.0) {
          anyLarge = true;
          break;
        }
      }
      total++;
      if (anyLarge) hit++;
    }
    if (total <= 0) return 0;
    return hit / total;
  }

  _Sample _conditionalSample(List<FuCandle> data, _Condition now) {
    final bodies = data.map((c) => (c.close - c.open).abs()).toList();
    final vols = data.map((c) => c.volume).toList();
    final bodyAvg = _avg(bodies);
    final volAvg = _avg(vols);

    bool isLarge(FuCandle c) {
      final b = (c.close - c.open).abs();
      return bodyAvg > 0 ? (b >= bodyAvg * 2.0) : false;
    }

    bool isVolSpike(FuCandle c) {
      return volAvg > 0 ? (c.volume >= volAvg * 1.6) : false;
    }

    final indices = <int>[];
    for (int i = 10; i < data.length - 6; i++) {
      final c = data[i];
      final bull = c.close >= c.open;
      final large = isLarge(c);
      final spike = isVolSpike(c);

      // ?„ì¬ ?œìƒ?œâ€ì? ìµœë???ë¹„ìŠ·??ê³¼ê±° ?œë³¸??ëª¨ìŒ
      if (now.large && !large) continue;
      if (!now.large && large) continue;
      if (now.volSpike && !spike) continue;
      if (!now.volSpike && spike) continue;
      if (now.bull != bull) continue;

      indices.add(i);
    }
    return _Sample(indices);
  }

  double _momentumProb(List<FuCandle> data, {required int horizon}) {
    // ?„ì£¼ ?¨ìˆœ: ìµœê·¼ 20ë´‰ì—???ìŠ¹ë´?ë¹„ìœ¨ + ì¶”ì„¸ ê¸°ìš¸ê¸?    final recent = data.length > 40 ? data.sublist(data.length - 40) : data;
    int up = 0;
    for (final c in recent) {
      if (c.close >= c.open) up++;
    }
    final upRatio = up / recent.length;
    final slope = (recent.last.close - recent.first.close) / (recent.length.toDouble());
    final bias = slope > 0 ? 0.05 : slope < 0 ? -0.05 : 0.0;
    final p = (upRatio + bias).clamp(0.05, 0.95);
    return p;
  }

  _Pattern _detectPattern(List<FuCandle> data) {
    // 40ë´??Œê?ë¡?ê°„ë‹¨ ?¨í„´(?ìŠ¹?ê¸°/?˜ë½?ê¸°/?¼ê°?˜ë ´/?†ìŒ)
    final w = data.length > 60 ? data.sublist(data.length - 60) : data;
    final highs = w.map((c) => c.high).toList();
    final lows = w.map((c) => c.low).toList();

    final hs = _slope(highs);
    final ls = _slope(lows);
    final range0 = (highs.first - lows.first).abs();
    final range1 = (highs.last - lows.last).abs();
    final narrowing = range1 < range0 * 0.7;

    // ?ìŠ¹?ê¸°: ?????ìŠ¹ + ?€?ì„ ????ê°€?Œë¦„ + ?˜ë ´
    if (narrowing && hs > 0 && ls > 0 && ls > hs * 1.2) {
      return const _Pattern('?ìŠ¹?ê¸°', ChipTone.warn);
    }
    // ?˜ë½?ê¸°: ?????˜ë½ + ê³ ì ? ì´ ??ê°€?Œë¦„ + ?˜ë ´(?ë°© ?´íƒˆ ê°€??
    if (narrowing && hs < 0 && ls < 0 && hs.abs() > ls.abs() * 1.2) {
      return const _Pattern('?˜ë½?ê¸°', ChipTone.good);
    }
    // ?¼ê°?˜ë ´: ê³ ì  ?˜ë½ + ?€???ìŠ¹ + ?˜ë ´
    if (narrowing && hs < 0 && ls > 0) {
      return const _Pattern('?¼ê°?˜ë ´', ChipTone.warn);
    }
    return const _Pattern('?†ìŒ', ChipTone.neutral);
  }

  _Pattern _detectRegime(List<FuCandle> data) {
    // ê°„ë‹¨ ?ˆì§: ì¶”ì„¸/?¡ë³´
    final w = data.length > 80 ? data.sublist(data.length - 80) : data;
    final closes = w.map((c) => c.close).toList();
    final sl = _slope(closes);
    final atr = _atr(w);
    final strength = atr > 0 ? (sl.abs() / atr) : 0.0;

    if (strength >= 0.22) {
      return _Pattern(sl > 0 ? '?ìŠ¹ì¶”ì„¸' : '?˜ë½ì¶”ì„¸', sl > 0 ? ChipTone.good : ChipTone.bad);
    }
    return const _Pattern('?ˆì¸ì§€', ChipTone.neutral);
  }

  double _atr(List<FuCandle> w) {
    if (w.length < 2) return 0;
    double sum = 0;
    int n = 0;
    for (int i = 1; i < w.length; i++) {
      final c = w[i];
      final p = w[i - 1];
      final tr = _max3(
        c.high - c.low,
        (c.high - p.close).abs(),
        (c.low - p.close).abs(),
      );
      sum += tr;
      n++;
    }
    return n > 0 ? sum / n : 0;
  }

  double _max3(double a, double b, double c) {
    var m = a;
    if (b > m) m = b;
    if (c > m) m = c;
    return m;
  }

  double _avg(List<double> xs) {
    if (xs.isEmpty) return 0;
    double s = 0;
    for (final v in xs) {
      s += v;
    }
    return s / xs.length;
  }

  double _slope(List<double> ys) {
    // simple linear regression slope vs index
    final n = ys.length;
    if (n < 2) return 0;
    double sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (int i = 0; i < n; i++) {
      final x = i.toDouble();
      final y = ys[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    final denom = (n * sumXX - sumX * sumX);
    if (denom == 0) return 0;
    return (n * sumXY - sumX * sumY) / denom;
  }
}

class _Condition {
  final bool large;
  final bool bull;
  final bool volSpike;
  const _Condition({required this.large, required this.bull, required this.volSpike});
}

class _Sample {
  final List<int> indices;
  const _Sample(this.indices);
  int get count => indices.length;
}

class _Pattern {
  final String label;
  final ChipTone tone;
  const _Pattern(this.label, this.tone);
}
