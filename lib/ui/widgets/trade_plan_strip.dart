import 'package:flutter/material.dart';

class TradePlanStrip extends StatelessWidget {
  final double entry, sl, tp1, tp2, tp3;
  const TradePlanStrip({
    super.key,
    required this.entry,
    required this.sl,
    required this.tp1,
    required this.tp2,
    required this.tp3,
  });

  @override
  Widget build(BuildContext context) {
    String f(double v) => v.toStringAsFixed(1);
    return Container(
      padding: const EdgeInsets.all(8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('E ${f(entry)}'),
          Text('SL ${f(sl)}'),
          Text('TP ${f(tp1)}/${f(tp2)}/${f(tp3)}'),
        ],
      ),
    );
  }
}
