
import 'dart:math' as math;

import '../models/fu_state.dart';
import '../app_settings.dart';

/// SUPER AGI v7 (핵심: 반응구간 + 스탑헌팅 밴드 + EV + 동적 레버)
/// - 기존 엔진/기능 삭제 없이 "추가"로 계산해 UI/브리핑에 사용
class SuperAgiV7Out {
  final String state; // WAIT/TEST/CONFIRM/FAIL/LOCK
  final double evR; // 기대값 (R 단위)
  final int stopHuntRisk; // 0~100
  final double huntBandLow;
  final double huntBandHigh;
  final double slRecommended;
  final double qty;
  final double leverage;
  final double tp1;
  final double tp2;
  final double tp3;
  final String managerLine1;
  final String managerLine2;

  const SuperAgiV7Out({
    required this.state,
    required this.evR,
    required this.stopHuntRisk,
    required this.huntBandLow,
    required this.huntBandHigh,
    required this.slRecommended,
    required this.qty,
    required this.leverage,
    required this.tp1,
    required this.tp2,
    required this.tp3,
    required this.managerLine1,
    required this.managerLine2,
  });
}

class SuperAgiV7 {
  /// k1: ATR 계수, k2: zoneWidth 계수
  final double kAtr;
  final double kZone;

  const SuperAgiV7({this.kAtr = 1.0, this.kZone = 0.20});

  SuperAgiV7Out compute({
    required FuState s,
    required double livePrice,
    double? seedUsdt,
  }) {
    final seed = (seedUsdt ?? AppSettings.accountUsdt).clamp(1.0, 1e12);
    final riskPct = AppSettings.riskPct.clamp(0.1, 50.0) / 100.0;
    final riskMoney = seed * riskPct;

    // 1) 반응구간(기존 엔진 산출)
    final zLow = (s.reactLow > 0 ? s.reactLow : math.min(s.s1, s.price)).toDouble();
    final zHigh = (s.reactHigh > 0 ? s.reactHigh : math.max(s.r1, s.price)).toDouble();
    final zWidth = (zHigh - zLow).abs().clamp(1e-9, 1e18);

    // 2) ATR(간단 14)
    final atr = _atr14(s.candles);

    // 3) 스탑헌팅 밴드 (구조 + 꼬리 + 안전버퍼)
    final buffer = math.max(atr * kAtr, zWidth * kZone);

    final (swingLow, swingHigh) = _swingRange(s.candles);
    final (wickLow, wickHigh, wickiness) = _wickCluster(s.candles);

    // 유동성 스윕 후보(간단: 최근 저/고 extremes)
    final extremeLow = _minLow(s.candles);
    final extremeHigh = _maxHigh(s.candles);

    // 헌팅 밴드
    final huntLow = math.min(math.min(swingLow, wickLow), extremeLow) - buffer;
    final huntHigh = math.max(math.max(swingHigh, wickHigh), extremeHigh) + buffer;

    // 4) 추천 SL: 방향에 따라 바깥
    final dir = s.finalDir.toUpperCase(); // LONG/SHORT/WATCH
    final slRec = dir == 'SHORT' ? huntHigh : huntLow;

    // 5) 동적 수량/레버 계산 (5% 리스크 고정)
    final entry = (s.entry > 0 ? s.entry : livePrice);
    final stopDist = (entry - slRec).abs().clamp(1e-9, 1e18);
    final qty = (riskMoney / stopDist).clamp(0.0, 1e12);
    final notional = qty * entry;
    final lev = (seed > 0 ? notional / seed : 0.0).clamp(0.0, 999.0);

    // 6) 목표(TP1/2/3): 기존 target이 있으면 그 구간 내 분할, 없으면 1R/2R/3R 구조
    final oneR = stopDist; // 가격 기준 1R 거리
    final target = s.target > 0 ? s.target : (dir == 'SHORT' ? entry - 3.0 * oneR : entry + 3.0 * oneR);
    final tp1 = entry + (target - entry) * 0.40;
    final tp2 = entry + (target - entry) * 0.75;
    final tp3 = target;

    // 7) P(win) 근사 + EV(R)
    final p = _pWin(s);
    final winR = ((tp3 - entry).abs() / stopDist).clamp(0.0, 50.0);
    final evR = (p * winR) - ((1.0 - p) * 1.0);

    // 8) StopHuntRisk(0~100): 꼬리/휘둘림 + zone 근접 횟수 + 구조/변동성
    final zoneTouches = _zoneTouchScore(s.candles, zLow, zHigh);
    final atrVsWidth = (atr / (zWidth + 1e-9)).clamp(0.0, 5.0);
    int risk = (wickiness * 55.0 + zoneTouches * 35.0 + atrVsWidth * 10.0).round().clamp(0, 100);

    // 9) 상태 머신
    final state = _stateMachine(s, livePrice, zLow, zHigh, risk);

    // 10) 매니저 2줄 브리핑
    final evTxt = '${evR >= 0 ? '+' : ''}${evR.toStringAsFixed(2)}R';
    final riskTxt = '헌팅위험 ${risk}';
    final levTxt = '레버 ${lev.toStringAsFixed(1)}x';
    final slTxt = 'SL ${slRec.toStringAsFixed(0)}';
    final line1 = '${stateLabel(state)} · ${dirLabel(dir)} · EV $evTxt';
    final line2 = '${riskTxt} · ${slTxt} · ${levTxt}';

    return SuperAgiV7Out(
      state: state,
      evR: evR,
      stopHuntRisk: risk,
      huntBandLow: huntLow,
      huntBandHigh: huntHigh,
      slRecommended: slRec,
      qty: qty,
      leverage: lev,
      tp1: tp1,
      tp2: tp2,
      tp3: tp3,
      managerLine1: line1,
      managerLine2: line2,
    );
  }

  static String stateLabel(String s) {
    switch (s) {
      case 'LOCK':
        return 'LOCK';
      case 'CONFIRM':
        return '확정';
      case 'TEST':
        return '테스트';
      case 'FAIL':
        return '실패';
      default:
        return '대기';
    }
  }

  static String dirLabel(String dir) {
    switch (dir) {
      case 'LONG':
        return '롱';
      case 'SHORT':
        return '숏';
      default:
        return '관망';
    }
  }

  static String _stateMachine(FuState s, double price, double zLow, double zHigh, int stopHuntRisk) {
    if (s.locked) return 'LOCK';
    if (stopHuntRisk >= 70) return 'LOCK';
    final inside = price >= zLow && price <= zHigh;
    if (!inside) return 'WAIT';

    // TEST: zone 안쪽 진입
    // CONFIRM: 볼륨이 평균보다 증가 + 유리방향 신호/확률
    final vNow = s.candles.isNotEmpty ? s.candles.last.volume : 0.0;
    final vAvg = _avgVol(s.candles, 20);
    final volOk = vAvg > 0 ? (vNow / vAvg) >= 1.25 : false;
    final p = _pWin(s);
    final confOk = p >= 0.55;

    if (volOk && confOk) return 'CONFIRM';
    return 'TEST';
  }

  static double _pWin(FuState s) {
    final sp = (s.signalProb / 100.0);
    if (sp > 0) return sp.clamp(0.05, 0.95);
    return (s.confidence / 100.0).clamp(0.05, 0.95);
  }

  static double _avgVol(List<FuCandle> c, int n) {
    if (c.isEmpty) return 0.0;
    final start = math.max(0, c.length - n);
    final slice = c.sublist(start);
    final sum = slice.fold<double>(0.0, (a, b) => a + b.volume);
    return sum / slice.length;
  }

  static double _atr14(List<FuCandle> c) {
    if (c.length < 2) return 0.0;
    final n = math.min(14, c.length - 1);
    double sum = 0.0;
    for (int i = c.length - n; i < c.length; i++) {
      if (i <= 0) continue;
      final hi = c[i].high;
      final lo = c[i].low;
      final prevClose = c[i - 1].close;
      final tr = math.max(hi - lo, math.max((hi - prevClose).abs(), (lo - prevClose).abs()));
      sum += tr;
    }
    return sum / n;
  }

  static (double, double) _swingRange(List<FuCandle> c) {
    if (c.length < 5) return ( _minLow(c), _maxHigh(c) );
    // 간단 프랙탈: 최근 50개 중 local min/max
    final start = math.max(2, c.length - 50);
    double swingLow = double.infinity;
    double swingHigh = -double.infinity;
    for (int i = start; i < c.length - 2; i++) {
      final l = c[i].low;
      final h = c[i].high;
      if (l < c[i-1].low && l < c[i-2].low && l < c[i+1].low && l < c[i+2].low) {
        swingLow = math.min(swingLow, l);
      }
      if (h > c[i-1].high && h > c[i-2].high && h > c[i+1].high && h > c[i+2].high) {
        swingHigh = math.max(swingHigh, h);
      }
    }
    if (swingLow == double.infinity) swingLow = _minLow(c);
    if (swingHigh == -double.infinity) swingHigh = _maxHigh(c);
    return (swingLow, swingHigh);
  }

  static (double, double, double) _wickCluster(List<FuCandle> c) {
    if (c.isEmpty) return (0.0, 0.0, 0.0);
    final start = math.max(0, c.length - 60);
    final slice = c.sublist(start);

    // wick 길이 비율 평균: (wick / range)
    double wickiness = 0.0;
    final lows = <double>[];
    final highs = <double>[];
    for (final k in slice) {
      lows.add(k.low);
      highs.add(k.high);
      final range = (k.high - k.low).abs().clamp(1e-9, 1e18);
      final lowerWick = (math.min(k.open, k.close) - k.low).clamp(0.0, 1e18);
      final upperWick = (k.high - math.max(k.open, k.close)).clamp(0.0, 1e18);
      wickiness += ((lowerWick + upperWick) / range);
    }
    wickiness = (wickiness / slice.length).clamp(0.0, 2.0);

    lows.sort();
    highs.sort();
    final wickLow = lows[(lows.length * 0.10).floor().clamp(0, lows.length - 1)];
    final wickHigh = highs[(highs.length * 0.90).floor().clamp(0, highs.length - 1)];
    return (wickLow, wickHigh, wickiness / 2.0); // 0~1 근사
  }

  static double _minLow(List<FuCandle> c) {
    if (c.isEmpty) return 0.0;
    double m = c.first.low;
    for (final k in c) { if (k.low < m) m = k.low; }
    return m;
  }
  static double _maxHigh(List<FuCandle> c) {
    if (c.isEmpty) return 0.0;
    double m = c.first.high;
    for (final k in c) { if (k.high > m) m = k.high; }
    return m;
  }

  static double _zoneTouchScore(List<FuCandle> c, double zLow, double zHigh) {
    if (c.isEmpty) return 0.0;
    final start = math.max(0, c.length - 30);
    final slice = c.sublist(start);
    int touches = 0;
    for (final k in slice) {
      if (k.low <= zHigh && k.high >= zLow) touches++;
    }
    return (touches / slice.length).clamp(0.0, 1.0);
  }
}
