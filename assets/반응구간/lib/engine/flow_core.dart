import '../services/bitget_api.dart';

class FlowSnapshot {
  final int buyStrength;   // 0~100
  final int sellStrength;  // 0~100
  final int obImbalance;   // 0~100
  final int absorption;    // 0~100
  final double cvd;        // 누적 델타(최근 체결 구간)
  final double tradeNotional;
  final double depthNotional;

  const FlowSnapshot({
    required this.buyStrength,
    required this.sellStrength,
    required this.obImbalance,
    required this.absorption,
    required this.cvd,
    required this.tradeNotional,
    required this.depthNotional,
  });
}

class FlowCore {
  static int _clamp01(int v) => v.clamp(0, 100);

  /// 최근 체결 + 오더북(상단) 기반의 간단 Flow 지표 계산
  /// - buy/sell 강도: 최근 체결에서 buy/sell 비율
  /// - CVD: (buySize - sellSize) 누적
  /// - 오더북 불균형: 상단 depth에서 bid/ask notional 비율
  /// - 흡수/방어: depthNotional / tradeNotional 비율을 0~100으로 스케일
  static FlowSnapshot compute({
    required List<PublicFill> fills,
    required OrderBook ob,
    int depthLevels = 20,
  }) {
    double buyQty = 0;
    double sellQty = 0;
    double cvd = 0;
    double tradeNotional = 0;

    for (final f in fills) {
      final q = f.size;
      final px = f.price;
      if (q <= 0 || px <= 0) continue;
      tradeNotional += px * q;

      final s = f.side.toLowerCase();
      if (s == 'buy') {
        buyQty += q;
        cvd += q;
      } else if (s == 'sell') {
        sellQty += q;
        cvd -= q;
      }
    }

    final totQty = buyQty + sellQty;
    final buyStrength = totQty <= 0 ? 50 : ((buyQty / totQty) * 100).round();
    final sellStrength = 100 - buyStrength;

    double bidNotional = 0;
    double askNotional = 0;

    int k = 0;
    for (final b in ob.bids) {
      if (k++ >= depthLevels) break;
      final px = b.isNotEmpty ? b[0] : 0.0;
      final q = b.length > 1 ? b[1] : 0.0;
      if (px <= 0 || q <= 0) continue;
      bidNotional += px * q;
    }
    k = 0;
    for (final a in ob.asks) {
      if (k++ >= depthLevels) break;
      final px = a.isNotEmpty ? a[0] : 0.0;
      final q = a.length > 1 ? a[1] : 0.0;
      if (px <= 0 || q <= 0) continue;
      askNotional += px * q;
    }

    final depthNotional = bidNotional + askNotional;
    final obImbalance = depthNotional <= 0
        ? 50
        : (((bidNotional - askNotional) / depthNotional) * 50 + 50).round();

    // 흡수/방어(간단): 오더북 유동성(상단) / 최근 체결 규모 비율
    // 체결이 크면 흡수는 낮아지고, 오더북이 두꺼우면 흡수는 높아짐
    final ratio = tradeNotional <= 0 ? 1.0 : (depthNotional / tradeNotional);
    final absorption = _clamp01((ratio * 25).round()); // 경험적 스케일

    return FlowSnapshot(
      buyStrength: _clamp01(buyStrength),
      sellStrength: _clamp01(sellStrength),
      obImbalance: _clamp01(obImbalance),
      absorption: _clamp01(absorption),
      cvd: cvd,
      tradeNotional: tradeNotional,
      depthNotional: depthNotional,
    );
  }
}
