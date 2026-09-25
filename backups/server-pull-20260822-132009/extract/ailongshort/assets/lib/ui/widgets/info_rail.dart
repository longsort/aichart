import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';

class InfoRail extends StatelessWidget {
  final double price;
  final double channelLow;
  final double channelMid;
  final double channelHigh;
  final double ob;
  final double fvgLow;
  final double fvgHigh;
  final double bpr;
  final double mb;

  const InfoRail({
    super.key,
    required this.price,
    required this.channelLow,
    required this.channelMid,
    required this.channelHigh,
    required this.ob,
    required this.fvgLow,
    required this.fvgHigh,
    required this.bpr,
    required this.mb,
  });

  Widget _row(String k, String v, Color c, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(k, style: TextStyle(color: c.withOpacity(0.7), fontSize: 11))),
          Text(
            v,
            style: TextStyle(
              color: c,
              fontSize: 11,
              fontWeight: bold ? FontWeight.w900 : FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 120,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        border: Border(left: BorderSide(color: Colors.white.withOpacity(0.1))),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _row("PRICE", price.toStringAsFixed(0), Colors.white, bold: true),
          const SizedBox(height: 6),
          _row("CH-L", channelLow.toStringAsFixed(0), Colors.lightBlueAccent),
          _row("CH-M", channelMid.toStringAsFixed(0), Colors.lightBlueAccent),
          _row("CH-H", channelHigh.toStringAsFixed(0), Colors.lightBlueAccent),
          const SizedBox(height: 6),
          _row("OB", ob.toStringAsFixed(0), Colors.purpleAccent),
          _row("FVG", "${fvgLow.toStringAsFixed(0)}-${fvgHigh.toStringAsFixed(0)}", Colors.tealAccent),
          _row("BPR", bpr.toStringAsFixed(0), Colors.orangeAccent),
          _row("MB", mb.toStringAsFixed(0), Colors.grey),
        ],
      ),
    );
  }
}
