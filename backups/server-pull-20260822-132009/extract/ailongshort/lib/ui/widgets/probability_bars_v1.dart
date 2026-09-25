// FIX: probability_bars_v1.dart (nullable double safe)
// - Allow ProbabilityResultV1 to be constructed with nullable numbers (double?)
// - Avoid double? -> double errors at call sites (e.g., ultra_home_screen.dart)

import 'package:flutter/material.dart';

enum TradeDecision { long, short, noTrade }

class ProbabilityResultV1 {
  final TradeDecision decision;
  final double longProb;
  final double shortProb;
  final double noTradeProb;

  ProbabilityResultV1({
    required this.decision,
    num? longProb,
    num? shortProb,
    num? noTradeProb,
  })  : longProb = (longProb ?? 0).toDouble(),
        shortProb = (shortProb ?? 0).toDouble(),
        noTradeProb = (noTradeProb ?? 0).toDouble();
}

class ProbabilityBarsV1 extends StatelessWidget {
  final ProbabilityResultV1 _res;

  /// Backward compatible:
  /// - pass `result: ProbabilityResultV1(...)`
  /// - or pass decision/longProb/shortProb/noTradeProb directly
  ProbabilityBarsV1({
    super.key,
    ProbabilityResultV1? result,
    TradeDecision? decision,
    num? longProb,
    num? shortProb,
    num? noTradeProb,
  }) : _res = result ??
            ProbabilityResultV1(
              decision: decision ?? TradeDecision.noTrade,
              longProb: longProb,
              shortProb: shortProb,
              noTradeProb: noTradeProb,
            );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _bar('LONG', _res.longProb, Colors.green),
        _bar('SHORT', _res.shortProb, Colors.red),
        _bar('NO-TRADE', _res.noTradeProb, Colors.grey),
      ],
    );
  }

  Widget _bar(String label, double value, Color color) {
    final v = value.clamp(0.0, 100.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 80, child: Text(label, style: const TextStyle(color: Colors.white))),
          Expanded(
            child: LinearProgressIndicator(
              value: v / 100.0,
              backgroundColor: Colors.white12,
              valueColor: AlwaysStoppedAnimation<Color>(color),
              minHeight: 10,
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 50,
            child: Text('${v.toStringAsFixed(0)}%', style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
