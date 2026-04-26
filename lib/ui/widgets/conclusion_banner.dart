import 'package:flutter/material.dart';
import 'package:ailongshort/engine/decision_engine_v2.dart' show Decision;

/// Top banner that summarizes the current decision.
/// Kept UI-simple to avoid breaking the main layout.
class ConclusionBanner extends StatelessWidget {
  final Decision? decision;
  const ConclusionBanner({super.key, required this.decision});

  @override
  Widget build(BuildContext context) {
    final d = decision;
    if (d == null) return const SizedBox.shrink();

    final bg = d.locked
        ? const Color(0xFF3A2A2A)
        : (d.action.contains('??) || d.action.contains('Î°?))
            ? const Color(0xFF1D3B31)
            : (d.action.contains('??) || d.action.contains('??))
                ? const Color(0xFF3B1D27)
                : const Color(0xFF2D2F3A);

    final border = d.locked
        ? const Color(0xFFFF6B6B)
        : const Color(0xFF4AA3FF);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg.withOpacity(0.85),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border.withOpacity(0.6), width: 1.2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'ÏßÄÍ∏?Ï∂îÏ≤ú: ${d.action}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              Text(
                '?†Î¢∞ ${(d.confidence * 100).round()}%',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.white.withOpacity(0.85),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            d.detail,
            style: TextStyle(
              fontSize: 13,
              height: 1.25,
              color: Colors.white.withOpacity(0.85),
            ),
          ),
          if (d.locked) ...[
            const SizedBox(height: 6),
            Text(
              '???†Í∏à: Î≥Ä?ôÏÑ±/Î∂àÏùºÏπ?Íµ¨Í∞Ñ',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white.withOpacity(0.9),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
