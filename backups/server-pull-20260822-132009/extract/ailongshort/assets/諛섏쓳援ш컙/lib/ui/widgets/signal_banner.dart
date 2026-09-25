
import 'package:flutter/material.dart';
import '../../engine/signal_engine.dart';

class SignalBanner extends StatelessWidget {
  final SignalResult result;
  const SignalBanner({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    Color c;
    String t;
    if (result.side == SignalSide.long) {
      c = Colors.green;
      t = "롱 우세";
    } else if (result.side == SignalSide.short) {
      c = Colors.red;
      t = "숏 우세";
    } else {
      c = Colors.grey;
      t = "관망";
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.withOpacity(0.15),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(t, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: c)),
          const SizedBox(height: 6),
          Text("신호 강도: ${result.strength}"),
          Text("근거 일치: ${result.evidenceHit}/${result.evidenceTotal}"),
          const SizedBox(height: 6),
          Text(result.reason),
        ],
      ),
    );
  }
}
