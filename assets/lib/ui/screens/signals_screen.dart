import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/data/bitget/bitget_live_store.dart';
import 'package:fulink_pro_ultra/engine/core/core_engine.dart';
import 'package:fulink_pro_ultra/engine/core/core_engine_compat.dart';
import 'package:fulink_pro_ultra/engine/evidence/evidence_engine.dart';
import 'package:fulink_pro_ultra/ui/widgets/bitget_live_header.dart';
import 'package:fulink_pro_ultra/ui/widgets/multitf_consensus_bar.dart';
import 'package:fulink_pro_ultra/ui/widgets/ai_conclusion_card.dart';

class SignalsScreen extends StatelessWidget {
  const SignalsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = BitgetLiveStore.I;
    final core = CoreEngine();
    final evEngine = EvidenceEngine();

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            const BitgetLiveHeader(symbol: 'BTCUSDT'),
            const SizedBox(height: 8),
            const MultiTfConsensusBar(),
            const SizedBox(height: 8),

            ValueListenableBuilder(
              valueListenable: store.ticker,
              builder: (_, __, ___) {
                final prices = store.prices;
                final vols = store.vols;

                final s15 = analyzeCompat(core, tf: '15m', prices: prices, volumes: vols);
                final s1h = analyzeCompat(core, tf: '1h', prices: prices, volumes: vols);
                final s4h = analyzeCompat(core, tf: '4h', prices: prices, volumes: vols);

                // Resolve fields safely (support multiple snapshot shapes)
                double getScore(dynamic s) {
                  try {
                    final v = s?.score;
                    if (v is num) return v.toDouble();
                  } catch (_) {}
                  return 0.50;
                }

                double getRisk(dynamic s) {
                  try {
                    final v = s?.risk;
                    if (v is num) return v.toDouble();
                  } catch (_) {}
                  return 0.35;
                }

                String getWhale(dynamic s) {
                  try {
                    final v = s?.whale;
                    if (v != null) return v.toString();
                  } catch (_) {}
                  return store.whaleGrade;
                }

                int pct(double v01) => (v01 * 100).round().clamp(0, 100);

                final up15 = pct(getScore(s15));
                final up1h = pct(getScore(s1h));
                final up4h = pct(getScore(s4h));

                final risk01 = getRisk(s15).clamp(0.0, 1.0);
                final whale = getWhale(s15);
                final streak = store.whaleStreak;

                // simple proxies
                final momentum = ((up15 - 50) / 50.0).clamp(-1.0, 1.0);
                final volSpike01 = (vols.isEmpty ? 0.0 : 0.7); // placeholder; will wire later

                final ev = evEngine.evaluate(
                  up15: up15.toDouble(),
                  up1h: up1h.toDouble(),
                  up4h: up4h.toDouble(),
                  whaleGrade: whale,
                  whaleStreak: streak,
                  risk01: risk01,
                  momentum: momentum,
                  volSpike01: volSpike01,
                );

                final decide = evEngine.decide(ev: ev, up15: up15, risk: (risk01 * 100).round());

                return AiConclusionCard(
                  decision: decide['decision']?.toString() ?? 'NO-TRADE',
                  confidence: (decide['confidence'] as int?) ?? 50,
                  evidence: ev,
                  up15: up15,
                  risk: (risk01 * 100).round(),
                  whale: whale,
                  whaleStreak: streak,
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}