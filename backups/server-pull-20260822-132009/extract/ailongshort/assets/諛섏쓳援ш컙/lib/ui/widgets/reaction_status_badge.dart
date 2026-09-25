import 'dart:ui';
import 'package:flutter/material.dart';

/// Shows live approach/inside status for zone interaction.
class ReactionStatusBadge extends StatelessWidget {
  final bool inside;
  final double approachScore; // 0~1

  const ReactionStatusBadge({
    super.key,
    required this.inside,
    required this.approachScore,
  });

  @override
  Widget build(BuildContext context) {
    final a = (approachScore.clamp(0, 1) * 100).toDouble();

    final border = inside ? const Color(0xFF2BFFB7) : const Color(0xFFFFC857);
    final txt = inside ? 'ZONE IN' : 'APPROACH ${a.toStringAsFixed(0)}%';

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.35),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: border.withOpacity(0.55), width: 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(inside ? Icons.radio_button_checked : Icons.radar, size: 14, color: border.withOpacity(0.95)),
              const SizedBox(width: 7),
              Text(
                txt,
                style: TextStyle(
                  color: Colors.white.withOpacity(0.92),
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}