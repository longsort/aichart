import '../../services/bitget_api.dart';

/// 최근 체결(fills)을 가격 밴드로 묶어 BUY/SELL 우세를 계산합니다.
class TapeBand {
  final double low;
  final double high;
  final double buyVol;
  final double sellVol;
  final int trades;

  const TapeBand({
    required this.low,
    required this.high,
    required this.buyVol,
    required this.sellVol,
    required this.trades,
  });

  double get totalVol => buyVol + sellVol;
  double get buyPct => totalVol <= 0 ? 0 : (buyVol / totalVol) * 100.0;
  double get sellPct => totalVol <= 0 ? 0 : (sellVol / totalVol) * 100.0;

  bool get buyDominant => buyVol >= sellVol;
}

class TradeTapeAggregatorV47 {
  /// bandPcnt: 가격대 폭(비율). 예) 0.001 = 0.1%
  static List<TapeBand> aggregate(
    List<PublicFill> fills, {
    required double lastPrice,
    double bandPcnt = 0.001,
    int maxBands = 12,
  }) {
    if (fills.isEmpty || lastPrice <= 0) return const <TapeBand>[];
    final step = (lastPrice * bandPcnt).clamp(0.5, lastPrice); // 최소 0.5
    final Map<int, _Acc> m = {};
    for (final f in fills) {
      final idx = (f.price / step).floor();
      final a = m.putIfAbsent(idx, () => _Acc());
      a.trades += 1;
      if (f.side == 'buy') {
        a.buy += f.size;
      } else if (f.side == 'sell') {
        a.sell += f.size;
      } else {
        // side가 비어있으면 중립으로 처리(양쪽 반반)
        a.buy += f.size * 0.5;
        a.sell += f.size * 0.5;
      }
    }

    final bands = m.entries.map((e) {
      final low = e.key * step;
      final high = low + step;
      return TapeBand(
        low: low,
        high: high,
        buyVol: e.value.buy,
        sellVol: e.value.sell,
        trades: e.value.trades,
      );
    }).toList();

    bands.sort((a, b) => b.totalVol.compareTo(a.totalVol));
    if (bands.length > maxBands) {
      return bands.sublist(0, maxBands);
    }
    return bands;
  }
}

class _Acc {
  double buy = 0;
  double sell = 0;
  int trades = 0;
}
