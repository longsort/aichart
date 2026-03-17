import 'dart:math' as math;


class EntryPlan {
  final double entry;
  final double sl;
  final double tp1;
  final double tp2;
  final double tp3;
  final double rr1;
  final double rr2;
  final double rr3;
  final double leverageRec;
  final double qtyBtc; // position size in BTC
  final double marginUsdt;

  const EntryPlan({
    required this.entry,
    required this.sl,
    required this.tp1,
    required this.tp2,
    required this.tp3,
    required this.rr1,
    required this.rr2,
    required this.rr3,
    required this.leverageRec,
    required this.qtyBtc,
    required this.marginUsdt,
  });
}

class EntryPlanner {
  /// 초보용 자동 추천:
  /// - 롱: entry=현재가, sl=지지 아래(폭), tp=저항 근처(분할)
  /// - 숏: entry=현재가, sl=저항 위, tp=지지 근처
  ///
  /// 리스크 5%: accountUsdt * 0.05 = 최대 손실
  /// qty = risk / |entry-sl|
  /// leverage는 "청산 여유"를 단순히 제한: 손절폭(%)의 1/2를 최소 증거금률로 가정
  static EntryPlan plan({
    required bool isLong,
    required double price,
    required double s1,
    required double r1,
    required double accountUsdt,
    required double riskPct, // 5
  }) {
    final entry = price;

    // SL/TP 기본 계산
    // 구간 폭(지지-저항) 기반으로 안전 완충
    final span = (r1 - s1).abs();
    final pad = span <= 0 ? price * 0.003 : span * 0.10; // 10% of span
    double sl, tp1, tp2, tp3;

    if (isLong) {
      sl = (s1 - pad);
      // tp는 저항 근처 분할
      tp1 = entry + (r1 - entry) * 0.55;
      tp2 = entry + (r1 - entry) * 0.80;
      tp3 = r1;
    } else {
      sl = (r1 + pad);
      tp1 = entry - (entry - s1) * 0.55;
      tp2 = entry - (entry - s1) * 0.80;
      tp3 = s1;
    }

    // 손절폭
    final riskPerBtc = (entry - sl).abs();
    final maxLoss = (accountUsdt * (riskPct / 100.0)).clamp(0.0, accountUsdt);
    final qty = riskPerBtc <= 0 ? 0.0 : (maxLoss / riskPerBtc);

    // notional/margin
    final notional = qty * entry;

    // 추천 레버리지 (핵심룰: 손절폭 기반 + 청산버퍼)
    final slPct = entry <= 0 ? 0.0 : (riskPerBtc / entry) * 100.0;
    double lev;
    if (slPct >= 5.0) {
      lev = 3.0;
    } else if (slPct >= 3.0) {
      lev = 5.0;
    } else if (slPct >= 2.0) {
      lev = 8.0;
    } else if (slPct >= 1.2) {
      lev = 10.0;
    } else if (slPct >= 0.8) {
      lev = 12.0;
    } else {
      lev = 15.0;
    }
    // liquidation buffer: 대략 1/leverage 안쪽으로 손절이 들어오면 위험 → 레버리지 상한
    final maxLevByLiq = slPct <= 0 ? 25.0 : (80.0 / slPct); // 80% 버퍼
    lev = math.min(lev, maxLevByLiq);
    lev = lev.clamp(2.0, 25.0);

    final margin = lev <= 0 ? 0.0 : (notional / lev);

    double rr(double tp) {
      final gain = (tp - entry).abs();
      return riskPerBtc <= 0 ? 0.0 : (gain / riskPerBtc);
    }

    return EntryPlan(
      entry: entry,
      sl: sl,
      tp1: tp1,
      tp2: tp2,
      tp3: tp3,
      rr1: rr(tp1),
      rr2: rr(tp2),
      rr3: rr(tp3),
      leverageRec: lev,
      qtyBtc: qty,
      marginUsdt: margin,
    );
  }
}