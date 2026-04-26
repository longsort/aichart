
import 'package:flutter/material.dart';

/// 지지/?�??가격�? ?�모 박스 (간편)
class PriceBoxesV1 extends StatelessWidget {
  final List<double> supports;
  final List<double> resists;
  final double? lastPrice;

  const PriceBoxesV1({
    super.key,
    required this.supports,
    required this.resists,
    required this.lastPrice,
  });

  @override
  Widget build(BuildContext context) {
    final lp = lastPrice;
    if ((supports.isEmpty && resists.isEmpty) || lp == null) {
      return const SizedBox.shrink();
    }

    final sup = supports.take(3).toList();
    final res = resists.take(3).toList();

    return Card(
      elevation: 0,
      color: Colors.black.withOpacity(0.25),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('?�심 가격�?(박스)',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ...sup.map((p) => _box(price: p, lastPrice: lp, isSupport: true)),
                ...res.map((p) => _box(price: p, lastPrice: lp, isSupport: false)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _box({required double price, required double lastPrice, required bool isSupport}) {
    final diffPct = ((lastPrice - price).abs() / lastPrice * 100);
    final strength = diffPct < 0.3 ? '강함' : (diffPct < 0.8 ? '보통' : '?�함');

    final color = isSupport ? Colors.greenAccent : Colors.redAccent;
    final bg = isSupport ? Colors.greenAccent.withOpacity(0.08) : Colors.redAccent.withOpacity(0.08);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.45), width: 1.2),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_fmt(price),
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: color)),
          const SizedBox(height: 2),
          Text('${isSupport ? "지지" : "?�??} · $strength',
              style: const TextStyle(fontSize: 11, color: Colors.white70)),
        ],
      ),
    );
  }

  String _fmt(double v) {
    if (v >= 1000) return v.toStringAsFixed(0);
    if (v >= 100) return v.toStringAsFixed(1);
    return v.toStringAsFixed(2);
  }
}
