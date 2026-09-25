import 'dart:math';

import '../core/exchange.dart';
import '../model/candle.dart';

enum TradeState { wait, enter, hold, risk, exit }

class DecisionResult {
  const DecisionResult({
    required this.state,
    required this.longPct,
    required this.shortPct,
    required this.rangePct,
    required this.entry,
    required this.stop,
    required this.target,
    required this.support,
    required this.resistance,
    required this.vwap,
    required this.zoneLo,
    required this.zoneHi,
    required this.zoneHoldPct,
    required this.zoneBreakPct,
    required this.whaleSummary,
    required this.whaleStrength,
    required this.bidAskHint,
    required this.triggerText,
  });

  final TradeState state;
  final int longPct;
  final int shortPct;
  final int rangePct;
  final double? entry;
  final double? stop;
  final double? target;
  final double? support;
  final double? resistance;
  final double? vwap;
  final double? zoneLo;
  final double? zoneHi;
  final int zoneHoldPct;
  final int zoneBreakPct;
  final String whaleSummary;
  final int whaleStrength; // 0~100
  final String bidAskHint;
  final String triggerText;
}

class DecisionEngine {
  /// "한 곳"에서만 결론/상태 계산.
  /// - candles: 선택 TF 기준
  /// - lastPrice: 실시간 현재가
  static DecisionResult compute({
    required List<Candle> candles,
    required double? lastPrice,
    required Tf tf,
  }) {
    if (candles.length < 20 || lastPrice == null) {
      return const DecisionResult(
        state: TradeState.wait,
        longPct: 0,
        shortPct: 0,
        rangePct: 100,
        entry: null,
        stop: null,
        target: null,
        support: null,
        resistance: null,
        vwap: null,
        zoneLo: null,
        zoneHi: null,
        zoneHoldPct: 50,
        zoneBreakPct: 50,
        whaleSummary: '뚜렷한 흔적 없음',
        whaleStrength: 0,
        bidAskHint: '호가 정보 없음',
        triggerText: '데이터 부족',
      );
    }

    final closes = candles.map((c) => c.close).toList(growable: false);
    final opens = candles.map((c) => c.open).toList(growable: false);
    final vols = candles.map((c) => c.volume).toList(growable: false);

    final ema12 = _ema(closes, 12);
    final ema26 = _ema(closes, 26);
    final rsi14 = _rsi(closes, 14);
    final vwap = _vwap(candles);

    // 지지/저항 (최근 스윙 기반 단순)
    final recent = candles.sublist(max(0, candles.length - 60));
    final support = recent.map((c) => c.low).reduce(min);
    final resistance = recent.map((c) => c.high).reduce(max);

    // 반응구간: (지지~지지+폭)
    final width = max(1.0, (resistance - support) * 0.12);
    final zoneLo = support;
    final zoneHi = support + width;

    // 힘(가짜 큰손): 거래량 스파이크로 대체
    final avgVol = vols.reduce((a, b) => a + b) / vols.length;
    final lastVol = vols.last;
    final volSpike = avgVol <= 0 ? 0 : ((lastVol / avgVol) * 50).clamp(0, 100).toInt();
    final whaleStrength = volSpike;
    final whaleSummary = volSpike >= 70
        ? '큰손 매수/매도 흔적 (거래량 급증)'
        : (volSpike >= 40 ? '큰손 관찰 필요' : '뚜렷한 흔적 없음');

    // 방향 점수
    final trendUp = ema12 > ema26;
    final momentumUp = rsi14 >= 55;
    final aboveVwap = lastPrice > vwap;
    final scoreUp = (trendUp ? 1 : 0) + (momentumUp ? 1 : 0) + (aboveVwap ? 1 : 0) + (volSpike >= 60 ? 1 : 0);
    final scoreDn = 4 - scoreUp;

    int longPct = (scoreUp / 4 * 100).round();
    int shortPct = (scoreDn / 4 * 100).round();
    int rangePct = max(0, 100 - max(longPct, shortPct));

    // 상태 결정
    final state = _stateFrom(longPct: longPct, shortPct: shortPct, lastPrice: lastPrice, support: support, resistance: resistance);

    // "진입가 1개" 규칙
    final entry = _oneEntry(lastPrice: lastPrice, support: support, resistance: resistance, preferLong: longPct >= shortPct);
    final sl = _oneStop(entry: entry, support: support, resistance: resistance, preferLong: longPct >= shortPct);
    final tp = _oneTarget(entry: entry, support: support, resistance: resistance, preferLong: longPct >= shortPct);

    // 반응 확률 (구간 유지/이탈)
    final inZone = lastPrice >= zoneLo && lastPrice <= zoneHi;
    final zoneHoldPct = inZone ? 72 : 55;
    final zoneBreakPct = 100 - zoneHoldPct;
    final triggerText = inZone
        ? '구간 위 유지 → 롱 준비 / 이탈 → 관망'
        : (lastPrice < zoneLo ? '지지 이탈 → 위험/정리 고려' : '지지 위 → 눌림 대기');

    final bidAskHint = '호가(프리뷰): 스프레드/심도는 다음 단계에서 연결';

    return DecisionResult(
      state: state,
      longPct: longPct,
      shortPct: shortPct,
      rangePct: rangePct,
      entry: entry,
      stop: sl,
      target: tp,
      support: support,
      resistance: resistance,
      vwap: vwap,
      zoneLo: zoneLo,
      zoneHi: zoneHi,
      zoneHoldPct: zoneHoldPct,
      zoneBreakPct: zoneBreakPct,
      whaleSummary: whaleSummary,
      whaleStrength: whaleStrength,
      bidAskHint: bidAskHint,
      triggerText: triggerText,
    );
  }

  static TradeState _stateFrom({
    required int longPct,
    required int shortPct,
    required double lastPrice,
    required double support,
    required double resistance,
  }) {
    final nearSupport = (lastPrice - support).abs() / max(1.0, lastPrice) < 0.01;
    final nearResistance = (resistance - lastPrice).abs() / max(1.0, lastPrice) < 0.01;
    if (lastPrice < support * 0.995) return TradeState.risk;
    if (longPct >= 70 && nearSupport) return TradeState.enter;
    if (shortPct >= 70 && nearResistance) return TradeState.enter;
    if (max(longPct, shortPct) >= 55) return TradeState.hold;
    return TradeState.wait;
  }

  static double _oneEntry({
    required double lastPrice,
    required double support,
    required double resistance,
    required bool preferLong,
  }) {
    if (preferLong) {
      // 눌림: 지지와 현재가 중간
      return ((support + lastPrice) / 2).toDouble();
    }
    // 숏: 저항과 현재가 중간
    return ((resistance + lastPrice) / 2).toDouble();
  }

  static double _oneStop({
    required double entry,
    required double support,
    required double resistance,
    required bool preferLong,
  }) {
    if (preferLong) {
      return min(entry * 0.99, support * 0.995).toDouble();
    }
    return max(entry * 1.01, resistance * 1.005).toDouble();
  }

  static double _oneTarget({
    required double entry,
    required double support,
    required double resistance,
    required bool preferLong,
  }) {
    if (preferLong) {
      return max(entry * 1.015, resistance * 0.995).toDouble();
    }
    return min(entry * 0.985, support * 1.005).toDouble();
  }

  static double _ema(List<double> values, int period) {
    if (values.isEmpty) return 0;
    final k = 2 / (period + 1);
    double ema = values.first;
    for (int i = 1; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  static double _rsi(List<double> values, int period) {
    if (values.length < period + 1) return 50;
    double gain = 0;
    double loss = 0;
    for (int i = values.length - period; i < values.length; i++) {
      final diff = values[i] - values[i - 1];
      if (diff >= 0) {
        gain += diff;
      } else {
        loss += -diff;
      }
    }
    if (loss == 0) return 100;
    final rs = (gain / period) / (loss / period);
    return 100 - (100 / (1 + rs));
  }

  static double _vwap(List<Candle> candles) {
    double pv = 0;
    double v = 0;
    for (final c in candles) {
      final typical = (c.high + c.low + c.close) / 3;
      pv += typical * c.volume;
      v += c.volume;
    }
    if (v <= 0) return candles.last.close;
    return pv / v;
  }
}
