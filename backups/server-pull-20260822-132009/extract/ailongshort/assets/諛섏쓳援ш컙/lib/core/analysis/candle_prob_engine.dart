import '../models/fu_state.dart';

/// 미니차트 아래에 뿌릴 “한눈 칩(네모)” 계산기.
/// - 외부 CSV 없어도: 현재 들고 있는 candles로 통계/확률을 계산
/// - 외부 CSV를 붙이면 정확도가 더 올라가지만(추후), 우선은 앱 단독으로 동작

class ChipItem {
  final String title;
  final String value;
  final ChipTone tone;
  const ChipItem({required this.title, required this.value, required this.tone});
}

enum ChipTone { good, bad, warn, neutral }

class CandleProbEngine {
  /// 기본: 마지막 240봉 정도로 계산(너무 짧으면 있는 만큼).
  /// 1W/1M/1Y는 봉 수가 적을 수 있으므로 최소 12봉부터 칩 표시(이전 30 → 12로 완화).
  List<ChipItem> buildChips(List<FuCandle> candles, {
    String currentDir = 'NEUTRAL',
    int currentProb = 0,
    int sweepRisk = 0,
  }) {
    const int minCandles = 12; // 1Y(~14봉) 등 장기 TF 활성화
    if (candles.length < minCandles) {
      return const [
        ChipItem(title: '데이터', value: '부족', tone: ChipTone.warn),
        ChipItem(title: '상승(1봉)', value: '--', tone: ChipTone.neutral),
        ChipItem(title: '상승(3봉)', value: '--', tone: ChipTone.neutral),
        ChipItem(title: '상승(5봉)', value: '--', tone: ChipTone.neutral),
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

    // “장대/볼륨스파이크” 조건이 걸렸을 때의 히스토리 조건부 확률
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
    final dirKo = dir == 'LONG' ? '롱' : dir == 'SHORT' ? '숏' : '관망';

    return [
      ChipItem(
        title: '방향',
        value: '$dirKo ${currentProb > 0 ? '$currentProb%' : ''}'.trim(),
        tone: dir == 'LONG' ? ChipTone.good : dir == 'SHORT' ? ChipTone.bad : ChipTone.neutral,
      ),
      ChipItem(
        title: '패턴',
        value: pattern.label,
        tone: pattern.tone,
      ),
      ChipItem(
        title: '레짐',
        value: regime.label,
        tone: regime.tone,
      ),
      ChipItem(
        title: '장대',
        value: isLarge ? (isBull ? '장대양봉' : '장대음봉') : '없음',
        tone: isLarge ? (isBull ? ChipTone.good : ChipTone.bad) : ChipTone.neutral,
      ),
      ChipItem(
        title: '볼륨',
        value: isVolSpike ? '스파이크' : '보통',
        tone: isVolSpike ? ChipTone.warn : ChipTone.neutral,
      ),
      // ⚠️ 여기 확률은 “롱/숏 확정”이 아니라, 조건부 통계 기반의 **상승(UP) 확률**이다.
      // 사용자 혼동 방지: ‘확률’ 대신 ‘상승(UP)’로 표기.
      ChipItem(
        title: '상승(1봉)',
        value: _pct(p1),
        tone: _toneByPct(p1),
      ),
      ChipItem(
        title: '상승(3봉)',
        value: _pct(p3),
        tone: _toneByPct(p3),
      ),
      ChipItem(
        title: '상승(5봉)',
        value: _pct(p5),
        tone: _toneByPct(p5),
      ),
      ChipItem(
        title: '장대재출현',
        value: _pct(replarge5),
        tone: _toneByPct(replarge5),
      ),
      ChipItem(
        title: '스윕위험',
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
    // 조건부 표본 수가 너무 작으면 단순 모멘텀으로 대체
    final stats = _conditionalSample(data, now);
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

      // 현재 “상태”와 최대한 비슷한 과거 표본을 모음
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
    // 아주 단순: 최근 20봉에서 상승봉 비율 + 추세 기울기
    final recent = data.length > 40 ? data.sublist(data.length - 40) : data;
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
    // 40봉 회귀로 간단 패턴(상승쐐기/하락쐐기/삼각수렴/없음)
    final w = data.length > 60 ? data.sublist(data.length - 60) : data;
    final highs = w.map((c) => c.high).toList();
    final lows = w.map((c) => c.low).toList();

    final hs = _slope(highs);
    final ls = _slope(lows);
    final range0 = (highs.first - lows.first).abs();
    final range1 = (highs.last - lows.last).abs();
    final narrowing = range1 < range0 * 0.7;

    // 상승쐐기: 둘 다 상승 + 저점선이 더 가파름 + 수렴
    if (narrowing && hs > 0 && ls > 0 && ls > hs * 1.2) {
      return const _Pattern('상승쐐기', ChipTone.warn);
    }
    // 하락쐐기: 둘 다 하락 + 고점선이 더 가파름 + 수렴(상방 이탈 가능)
    if (narrowing && hs < 0 && ls < 0 && hs.abs() > ls.abs() * 1.2) {
      return const _Pattern('하락쐐기', ChipTone.good);
    }
    // 삼각수렴: 고점 하락 + 저점 상승 + 수렴
    if (narrowing && hs < 0 && ls > 0) {
      return const _Pattern('삼각수렴', ChipTone.warn);
    }
    return const _Pattern('없음', ChipTone.neutral);
  }

  _Pattern _detectRegime(List<FuCandle> data) {
    // 간단 레짐: 추세/횡보
    final w = data.length > 80 ? data.sublist(data.length - 80) : data;
    final closes = w.map((c) => c.close).toList();
    final sl = _slope(closes);
    final atr = _atr(w);
    final strength = atr > 0 ? (sl.abs() / atr) : 0.0;

    if (strength >= 0.22) {
      return _Pattern(sl > 0 ? '상승추세' : '하락추세', sl > 0 ? ChipTone.good : ChipTone.bad);
    }
    return const _Pattern('레인지', ChipTone.neutral);
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
