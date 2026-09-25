import '../services/bitget_api.dart';

/// Flow(체결/오더북)에서 UI에 바로 꽂을 0~100 값들을 만듭니다.
///
/// ✅ 원칙
/// - 테마/앱 스타일 의존 없음
/// - 값은 0~100 정규화
/// - 실패해도 앱이 죽지 않도록 호출부에서 try/catch 권장
class FlowSnapshot {
  final int buyStrength; // 0~100
  final int sellStrength; // 0~100
  final int obImbalance; // 0~100
  final int absorption; // 0~100
  final double cvd; // signed
  final String note;

  const FlowSnapshot({
    required this.buyStrength,
    required this.sellStrength,
    required this.obImbalance,
    required this.absorption,
    required this.cvd,
    required this.note,
  });
}

class FlowMetrics {
  static int _clamp01(int v) => v < 0 ? 0 : (v > 100 ? 100 : v);

  /// 최근 체결을 이용해 buy/sell 강도와 CVD를 계산합니다.
  ///
  /// - buyVol, sellVol: 체결 size 합
  /// - cvd: buyVol - sellVol
  /// - strength: buyVol 비중을 0~100으로
  static ({int buyStrength, int sellStrength, double cvd}) fromFills(
    List<PublicFill> fills,
  ) {
    double buyVol = 0;
    double sellVol = 0;

    for (final f in fills) {
      final sz = f.size;
      if (sz <= 0) continue;
      if (f.side == 'buy') {
        buyVol += sz;
      } else if (f.side == 'sell') {
        sellVol += sz;
      }
    }

    final tot = buyVol + sellVol;
    if (tot <= 0) {
      return (buyStrength: 50, sellStrength: 50, cvd: 0.0);
    }

    final buyPct = (buyVol / tot) * 100.0;
    final buyS = _clamp01(buyPct.round());
    final sellS = _clamp01(100 - buyS);
    final cvd = buyVol - sellVol;
    return (buyStrength: buyS, sellStrength: sellS, cvd: cvd);
  }

  /// 오더북 상/하단 물량 비율로 불균형(0~100)을 계산합니다.
  ///
  /// - 50: 균형
  /// - 100: 매수벽(비드) 우세
  /// - 0: 매도벽(애스크) 우세
  static int orderbookImbalance(OrderBook ob, {int depth = 20}) {
    double bid = 0;
    double ask = 0;

    for (final b in ob.bids.take(depth)) {
      if (b.length < 2) continue;
      bid += b[1];
    }
    for (final a in ob.asks.take(depth)) {
      if (a.length < 2) continue;
      ask += a[1];
    }
    final tot = bid + ask;
    if (tot <= 0) return 50;
    final pct = (bid / tot) * 100.0;
    return _clamp01(pct.round());
  }

  /// 흡수(방어) 추정: 현재가 주변(상/하) 근접 물량의 균형과 CVD 방향을 같이 봅니다.
  ///
  /// - 값이 높을수록 '방어/흡수'가 있다고 가정
  static int absorptionScore({
    required OrderBook ob,
    required double lastPrice,
    required double cvd,
    double pctBand = 0.0015, // 0.15%
  }) {
    final low = lastPrice * (1 - pctBand);
    final high = lastPrice * (1 + pctBand);

    double bidNear = 0;
    double askNear = 0;

    for (final b in ob.bids) {
      if (b.length < 2) continue;
      final p = b[0];
      final q = b[1];
      if (p >= low) bidNear += q;
      else break;
    }

    for (final a in ob.asks) {
      if (a.length < 2) continue;
      final p = a[0];
      final q = a[1];
      if (p <= high) askNear += q;
      else break;
    }

    final tot = bidNear + askNear;
    if (tot <= 0) return 50;

    // 근접 물량이 균형에 가까울수록(=휩쏘 대비) 흡수 점수를 약간 올림
    final balance = 1.0 - ((bidNear - askNear).abs() / tot); // 0~1

    // CVD가 0보다 크면 매수 주도 → 방어 점수 가산
    final cvdBoost = cvd == 0 ? 0.0 : (cvd > 0 ? 0.12 : -0.12);

    final score = ((balance + cvdBoost).clamp(0.0, 1.0) * 100.0).round();
    return _clamp01(score);
  }

  static FlowSnapshot build({
    required List<PublicFill> fills,
    required OrderBook ob,
    required double lastPrice,
  }) {
    final f = fromFills(fills);
    final obImb = orderbookImbalance(ob);
    final abs = absorptionScore(ob: ob, lastPrice: lastPrice, cvd: f.cvd);
    return FlowSnapshot(
      buyStrength: f.buyStrength,
      sellStrength: f.sellStrength,
      obImbalance: obImb,
      absorption: abs,
      cvd: f.cvd,
      note: '실데이터: fills ${fills.length}건 · depth ${ob.bids.length}/${ob.asks.length}',
    );
  }
}
