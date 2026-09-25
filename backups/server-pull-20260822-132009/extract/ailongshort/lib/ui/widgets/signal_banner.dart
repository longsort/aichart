
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
      t = "Î°??∞ÏÑ∏";
    } else if (result.side == SignalSide.short) {
      c = Colors.red;
      t = "???∞ÏÑ∏";
    } else {
      c = Colors.grey;
      t = "Í¥ÄÎß?;
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
          Text("?†Ìò∏ Í∞ïÎèÑ: ${result.strength}"),
          Text("Í∑ºÍ±∞ ?ºÏπò: ${result.evidenceHit}/${result.evidenceTotal}"),
          const SizedBox(height: 6),
          Text(result.reason),
        ],
      ),
    );
  }
}
