import 'package:flutter/material.dart';
import '../../services/bitget_api.dart';

class OrderBookStrengthBoxesV46 extends StatelessWidget {
  final String category;
  final String symbol;
  final double lastPrice;

  const OrderBookStrengthBoxesV46({
    super.key,
    required this.category,
    required this.symbol,
    required this.lastPrice,
  });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<OrderBook>(
      future: BitgetApi.getOrderBook(category: category, symbol: symbol, limit: 50),
      builder: (context, snap) {
        if (!snap.hasData) {
          return _card(context, const Text('오더북 강도: 로딩...', style: TextStyle(color: Colors.white70)));
        }
        final ob = snap.data!;
        final supports = _topBuckets(ob.bids, isBid: true);
        final resists = _topBuckets(ob.asks, isBid: false);

        return _card(
          context,
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('오더북 강도(근접 가격대)', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              _rowTitle('지지(매수 대기)', Colors.greenAccent),
              const SizedBox(height: 6),
              _boxes(supports, isSupport: true),
              const SizedBox(height: 10),
              _rowTitle('저항(매도 대기)', Colors.redAccent),
              const SizedBox(height: 6),
              _boxes(resists, isSupport: false),
              const SizedBox(height: 6),
              Text('※ 체결이 아닌 “대기물량(호가)” 기반. (limit=50)', style: TextStyle(color: Colors.white54, fontSize: 11)),
            ],
          ),
        );
      },
    );
  }

  Widget _card(BuildContext context, Widget child) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.65),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white12, width: 1),
      ),
      child: child,
    );
  }

  Widget _rowTitle(String t, Color c) {
    return Row(
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(6))),
        const SizedBox(width: 8),
        Text(t, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800)),
      ],
    );
  }

  List<_Bucket> _topBuckets(List<List<double>> levels, {required bool isBid}) {
    // levels: [price, qty]
    final step = (lastPrice * 0.0015).clamp(0.5, 50.0); // 0.15% bucket, min 0.5
    final Map<int, double> sums = {};
    for (final lv in levels) {
      if (lv.length < 2) continue;
      final p = lv[0];
      final q = lv[1];
      // bucket key around step
      final k = (p / step).floor();
      sums[k] = (sums[k] ?? 0) + q;
    }
    final buckets = sums.entries.map((e) {
      final lo = e.key * step;
      final hi = (e.key + 1) * step;
      return _Bucket(lo: lo, hi: hi, strength: e.value);
    }).toList();

    buckets.sort((a, b) => b.strength.compareTo(a.strength));
    return buckets.take(3).toList();
  }

  Widget _boxes(List<_Bucket> buckets, {required bool isSupport}) {
    if (buckets.isEmpty) {
      return const Text('데이터 없음', style: TextStyle(color: Colors.white54));
    }
    final maxS = buckets.map((e) => e.strength).fold<double>(0, (a, b) => a > b ? a : b).clamp(1e-9, double.infinity);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: buckets.map((b) {
        final pct = (b.strength / maxS * 100.0).clamp(0, 100);
        final color = isSupport ? Colors.greenAccent : Colors.redAccent;
        return Container(
          width: 210,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.black54,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withOpacity(0.35), width: 1),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${_money(b.lo)} ~ ${_money(b.hi)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            LinearProgressIndicator(
              value: pct / 100.0,
              backgroundColor: Colors.white12,
              valueColor: AlwaysStoppedAnimation<Color>(color),
              minHeight: 8,
            ),
            const SizedBox(height: 6),
            Text('강도 ${pct.toStringAsFixed(0)}%', style: TextStyle(color: color.withOpacity(0.9), fontWeight: FontWeight.w900, fontSize: 12)),
          ]),
        );
      }).toList(),
    );
  }

  String _money(double v) {
    if (v >= 1000) return v.toStringAsFixed(0);
    return v.toStringAsFixed(2);
  }
}

class _Bucket {
  final double lo;
  final double hi;
  final double strength;
  const _Bucket({required this.lo, required this.hi, required this.strength});
}