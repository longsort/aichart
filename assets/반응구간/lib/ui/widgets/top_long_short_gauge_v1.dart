import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/central/decision_engine_v1.dart';

class TopLongShortGaugeV1 extends StatelessWidget {
  const TopLongShortGaugeV1({super.key});

  String _label(TradeDirection d) {
    switch (d) {
      case TradeDirection.long:
        return 'LONG';
      case TradeDirection.short:
        return 'SHORT';
      case TradeDirection.neutral:
      default:
        return 'NEUTRAL';
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder(
      valueListenable: DecisionStoreV1.I.state,
      builder: (context, DecisionState s, _) {
        final v = (s.finalScore + 100.0) / 200.0; // -100~+100 -> 0~1
        final locked = s.noTradeLock;

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withOpacity(0.10)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Text(
                    _label(s.direction),
                    style: TextStyle(
                      color: locked ? Colors.white54 : Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.2,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '${s.finalScore.toStringAsFixed(0)}',
                    style: TextStyle(
                      color: locked ? Colors.white38 : Colors.white70,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  if (locked)
                    Row(
                      children: [
                        const Icon(Icons.lock, size: 16, color: Colors.white54),
                        const SizedBox(width: 6),
                        Text(
                          s.reason,
                          style: const TextStyle(color: Colors.white54, fontSize: 12),
                        ),
                      ],
                    )
                  else
                    Text(
                      '확신 ${s.confidence.toStringAsFixed(0)}%',
                      style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              // Main gauge
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: v.clamp(0.0, 1.0),
                  minHeight: 12,
                  backgroundColor: Colors.white.withOpacity(0.10),
                  valueColor: AlwaysStoppedAnimation(
                    locked
                        ? Colors.white24
                        : (s.finalScore >= 0 ? Colors.greenAccent : Colors.redAccent),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('SHORT', style: TextStyle(color: Colors.redAccent, fontSize: 11, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  const Text('LONG', style: TextStyle(color: Colors.greenAccent, fontSize: 11, fontWeight: FontWeight.w700)),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
