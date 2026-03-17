import 'package:flutter/material.dart';
import '../../core/coach_analyzer.dart';
import '../../core/symbol_controller.dart';
import '../../engine/central/decision_logger.dart';

class CoachScreen extends StatelessWidget {
  const CoachScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AI 코치')),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: ValueListenableBuilder<List<DecisionLogEntry>>(
          valueListenable: DecisionLogger.I.logs,
          builder: (context, all, _) {
            final sym = SymbolController.I.symbol.value;
            final logs = all.where((e) => e.symbol == sym).toList();
            final text = CoachAnalyzer.I.buildSummary(logs);

            return Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.white.withOpacity(0.10)),
                color: Colors.white.withOpacity(0.04),
              ),
              child: SingleChildScrollView(
                child: Text(
                  text,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.86),
                    fontWeight: FontWeight.w700,
                    height: 1.35,
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
