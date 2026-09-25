import 'dart:ui';
import 'package:flutter/material.dart';

/// Shows dual probability at a zone:
/// - 반전확률 (reversal)
/// - 돌파확률 (breakout)
/// Put it inside a zone box or near its edge.
class DualProbLabel extends StatelessWidget {
  final Rect rect;
  final String title; // '저항' or '지지'
  final double reversalPct; // 0~100
  final double breakoutPct; // 0~100
  final bool isResistance;  // resistance => red tone, support => green tone

  const DualProbLabel({
    super.key,
    required this.rect,
    required this.title,
    required this.reversalPct,
    required this.breakoutPct,
    required this.isResistance,
  });

  @override
  Widget build(BuildContext context) {
    final rev = reversalPct.clamp(0, 100).toDouble();
    final brk = breakoutPct.clamp(0, 100).toDouble();

    final base = isResistance ? const Color(0xFFFF4D6D) : const Color(0xFF2BFFB7);
    final left = rect.left + 8;
    final top = rect.top + 8;

    return Positioned(
      left: left,
      top: top,
      child: IgnorePointer(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.35),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: base.withOpacity(0.40), width: 1),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _pill('${title} 반전 ${rev.toStringAsFixed(0)}%', base),
                  const SizedBox(width: 8),
                  _pill('돌파 ${brk.toStringAsFixed(0)}%', const Color(0xFF2CCBFF)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _pill(String t, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withOpacity(0.28), width: 1),
      ),
      child: Text(
        t,
        style: TextStyle(
          color: Colors.white.withOpacity(0.92),
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.1,
        ),
      ),
    );
  }
}