import 'dart:ui';
import 'package:flutter/material.dart';
import '../ai/tf_theme.dart';

/// Shows TF tone and density level.
class TfThemeBadge extends StatelessWidget {
  final String tf;

  const TfThemeBadge({super.key, required this.tf});

  @override
  Widget build(BuildContext context) {
    final th = TfTheme.of(tf);

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.35),
            border: Border.all(color: th.tone.withOpacity(0.35), width: 1),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: th.tone.withOpacity(0.95),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${th.tf} · D${th.densityLevel}',
                style: TextStyle(
                  color: Colors.white.withOpacity(0.92),
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