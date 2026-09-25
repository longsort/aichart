import 'dart:ui';
import 'package:flutter/material.dart';
import '../ai/tf_preset.dart';

/// Shows current TF preset summary (compact).
/// Put near the top bar or inside the decision card.
class TfPresetBadge extends StatelessWidget {
  final String tf;
  final double decisionPct;

  const TfPresetBadge({
    super.key,
    required this.tf,
    required this.decisionPct,
  });

  @override
  Widget build(BuildContext context) {
    final p = TfPreset.of(tf);
    final watch = decisionPct < p.minSignalPct;

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.35),
            border: Border.all(color: Colors.white.withOpacity(0.12), width: 1),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.schedule, size: 14, color: Colors.white70),
              const SizedBox(width: 7),
              Text(
                '${p.tf} · steps ${p.futureBaseSteps} · ${watch ? "WATCH" : "SIGNAL"} ≥ ${p.minSignalPct.toStringAsFixed(0)}%',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.90),
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.15,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}