import 'package:flutter/material.dart';
import '../../engine/central/decision_logger.dart';
import '../../core/symbol_controller.dart';
import '../widgets/backtest_gauge.dart';

class BacktestScreen extends StatefulWidget {
  const BacktestScreen({super.key});

  @override
  State<BacktestScreen> createState() => _BacktestScreenState();
}

class _BacktestScreenState extends State<BacktestScreen> {
  int _idx = 0;

  Color _bg(String decision) {
    if (decision.contains('Î°?)) return const Color(0xFF00FF7A).withOpacity(0.10);
    if (decision.contains('??)) return const Color(0xFFFF2D55).withOpacity(0.10);
    return Colors.transparent;
  }

  /// ?Ä?•Îêú ??™©??ÏµúÏÜå?ïÎ≥¥Îß??àÏñ¥?? ?πÏãú ?êÎÇå??"?¨ÌòÑ"?òÍ∏∞ ?ÑÌïú Í∞ÄÎ≤ºÏö¥ Îß§Ìïë
  /// - decision(Î°??? + ?©Ïùò/?†Î¢∞ ??Í≤åÏù¥ÏßÄ/Î∞îÎäò Í∞??∞Ï∂ú
  (double longPct, double shortPct, double needle) _map(DecisionLogEntry e) {
    final dir = e.decision.contains('Î°?) ? 1.0 : (e.decision.contains('??) ? -1.0 : 0.0);
    final cons = (e.consensus).clamp(0.0, 1.0);
    final conf = (e.confidence).clamp(0.0, 1.0);

    // Ï§ëÏã¨ 50/50?êÏÑú ?úÏûë, Î∞©Ìñ•/?©Ïùò/?†Î¢∞Î°?ÏπòÏö∞ÏπòÍ≤å
    final bias = (dir * (0.35 + (conf - 0.5) * 0.4 + (cons - 0.5) * 0.3)).clamp(-1.0, 1.0);
    final longPct = (0.5 + bias * 0.35).clamp(0.0, 1.0);
    final shortPct = (1.0 - longPct).clamp(0.0, 1.0);
    return (longPct, shortPct, bias);
  }

  @override
  Widget build(BuildContext context) {
    final sym = SymbolController.I.symbol.value;
    final list = DecisionLogger.I.logs.value.where((e) => e.symbol == sym).toList();

    final total = list.length;
    final cur = total == 0 ? null : list[_idx.clamp(0, total - 1)];

    return Scaffold(
      appBar: AppBar(title: const Text('Î∞±ÌÖå?§Ìä∏(?¨ÌòÑ)')),
      body: Container(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(0.0, -0.85),
            radius: 1.6,
            colors: [
              cur == null ? Colors.transparent : _bg(cur.decision),
              Colors.black,
            ],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              if (cur == null)
                const Expanded(child: Center(child: Text('Í∏∞Î°ù???ÜÏäµ?àÎã§')))
              else ...[
                // Í≤åÏù¥ÏßÄ ?¨ÌòÑ
                AspectRatio(
                  aspectRatio: 2.2,
                  child: Builder(builder: (_) {
                    final m = _map(cur);
                    return BacktestHalfGauge(
                      longPct: m.$1,
                      shortPct: m.$2,
                      needleBias: m.$3,
                    );
                  }),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white.withOpacity(0.10)),
                      color: Colors.white.withOpacity(0.04),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${cur.symbol} ??${cur.decision}',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 18,
                              color: cur.decision.contains('Î°?)
                                  ? const Color(0xFF00FF7A)
                                  : (cur.decision.contains('??) ? const Color(0xFFFF2D55) : Colors.white),
                            )),
                        const SizedBox(height: 8),
                        Text('?©Ïùò ${(cur.consensus * 100).round()}% / ?†Î¢∞ ${(cur.confidence * 100).round()}%',
                            style: TextStyle(color: Colors.white.withOpacity(0.78), fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text('Í≤∞Í≥º: ${cur.result}',
                            style: TextStyle(color: Colors.white.withOpacity(0.78), fontWeight: FontWeight.w800)),
                        const Spacer(),
                        Text('(${_idx + 1} / $total)', style: TextStyle(color: Colors.white.withOpacity(0.55))),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _idx > 0 ? () => setState(() => _idx--) : null,
                      child: const Text('?¥Ï†Ñ', style: TextStyle(fontWeight: FontWeight.w900)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _idx < total - 1 ? () => setState(() => _idx++) : null,
                      child: const Text('?§Ïùå', style: TextStyle(fontWeight: FontWeight.w900)),
                    ),
                  ),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }
}
