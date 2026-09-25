
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

class InfoRailV2 extends StatelessWidget {
  final FuState state;
  const InfoRailV2({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    final price = state.price;
    final chLow = state.s1;
    final chHigh = state.r1;
    final chMid = (chLow + chHigh) / 2.0;

    // Best-effort pulls (safe even if lists empty)
    final ob = state.obZones.isNotEmpty ? state.obZones.first.low : 0.0;
    final bpr = state.bprZones.isNotEmpty ? state.bprZones.first.low : 0.0;
    final mb = state.mbZones.isNotEmpty ? state.mbZones.first.low : 0.0;

    final fvgL = state.reactLow;
    final fvgH = state.reactHigh;

    final fail = state.stop > 0 ? state.stop : (state.finalDir == "SHORT" ? price * 1.01 : price * 0.99);

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0F14),
        border: Border(
          right: BorderSide(color: Colors.white.withOpacity(0.08)),
          left: BorderSide(color: Colors.white.withOpacity(0.08)),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          color: Colors.black.withOpacity(0.22),
          padding: const EdgeInsets.all(10),
          child: DefaultTextStyle(
            style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 11, height: 1.2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _blockTitle("NOW"),
                _big(price),
                const SizedBox(height: 10),

                _blockTitle("CONTEXT"),
                _kv("Gate", _gateText()),
                _kv("Bias", state.finalDir),
                _kv("Conf", "${state.confidence}%"),
                const SizedBox(height: 10),

                _blockTitle("LEVELS"),
                _kvC("CH-H", chHigh, Colors.lightBlueAccent),
                _kvC("CH-M", chMid, Colors.lightBlueAccent.withOpacity(0.9)),
                _kvC("CH-L", chLow, Colors.lightBlueAccent),
                const SizedBox(height: 6),
                _kvC("OB", ob, Colors.purpleAccent),
                _kvC("FVG", null, Colors.tealAccent, range: [fvgL, fvgH]),
                _kvC("BPR", bpr, Colors.orangeAccent),
                _kvC("MB", mb, Colors.grey),
                const SizedBox(height: 10),

                _blockTitle("RISK"),
                _kvC("FAIL", fail, const Color(0xFFFF6B6B)),
                _kv("Rule", "5% fixed"),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _gateText() {
    if (state.noTradeLock) return "NO-TRADE";
    // ?¸ë ˆ?´ë” ëª¨ë“œ: ?•ì • ì»??í–¥(?¨ë°œ ë°©ì?)
    if (state.showSignal && state.confidence >= 75) return "ENTER";
    if (state.confidence >= 40) return "WATCH";
    return "WAIT";
  }

  Widget _blockTitle(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(t, style: TextStyle(color: Colors.white.withOpacity(0.55), fontSize: 10, fontWeight: FontWeight.w900)),
      );

  Widget _big(double v) => Text(
        v.toStringAsFixed(0),
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
      );

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Expanded(child: Text(k, style: TextStyle(color: Colors.white.withOpacity(0.55)))),
            Text(v, style: const TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
      );

  Widget _kvC(String k, double? v, Color c, {List<double>? range}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Expanded(child: Text(k, style: TextStyle(color: c.withOpacity(0.85)))),
            Text(
              range != null
                  ? "${range[0].toStringAsFixed(0)}-${range[1].toStringAsFixed(0)}"
                  : (v ?? 0).toStringAsFixed(0),
              style: TextStyle(fontWeight: FontWeight.w900, color: c),
            ),
          ],
        ),
      );
}
