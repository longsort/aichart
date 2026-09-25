
import 'package:flutter/material.dart';
import '../core/models/engine_models.dart';
import 'widgets/glass_card.dart';
import 'widgets/sparkline.dart';

class FullScreenView extends StatelessWidget {
  final double price;
  final List<double> closes;
  final EngineConsensus? consensus;
  final ProbabilityOutput? prob;
  final RiskPlan? risk;
  final LiquidityOutput? liquidity;
  final StructureOutput? structure;

  const FullScreenView({
    super.key,
    required this.price,
    required this.closes,
    required this.consensus,
    required this.prob,
    required this.risk,
    required this.liquidity,
    required this.structure,
  });

  String _biasText(MarketBias b) {
    switch (b) {
      case MarketBias.long:
        return "LONG";
      case MarketBias.short:
        return "SHORT";
      case MarketBias.neutral:
      default:
        return "NEUTRAL";
    }
  }

  @override
  Widget build(BuildContext context) {
    final co = consensus;
    final po = prob;
    final rp = risk;

    return Scaffold(
      appBar: AppBar(title: const Text("Fullscreen")),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              flex: 7,
              child: GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text("CHART", style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    Expanded(child: Sparkline(data: closes)),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 3,
              child: GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text("FUTURE SCENARIOS", style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    if (po != null)
                      ...po.scenarios.map((s) => Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Text(
                              "${s.name} ${_biasText(s.bias)}  ${s.probability}% -> ${s.target.toStringAsFixed(1)}",
                              style: const TextStyle(fontSize: 12),
                            ),
                          )),
                    const Divider(),
                    Text("GATE: ${co?.gate.name ?? '-'}", style: const TextStyle(fontSize: 12)),
                    Text("CONF: ${co?.confidence ?? '-'}%", style: const TextStyle(fontSize: 12)),
                    Text("ENTRY: ${rp?.entry.toStringAsFixed(1) ?? '-'}", style: const TextStyle(fontSize: 12)),
                    Text("STOP: ${rp?.stop.toStringAsFixed(1) ?? '-'}", style: const TextStyle(fontSize: 12)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
