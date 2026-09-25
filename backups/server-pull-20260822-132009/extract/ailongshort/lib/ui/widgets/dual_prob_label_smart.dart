import 'dart:ui';
import 'package:flutter/material.dart';
import '../ai/smart_place.dart';

class DualProbLabelSmart extends StatelessWidget {
  final Rect zoneRect;
  final Rect viewport;
  final bool isResistance;
  final double aPct;
  final double bPct;
  final EdgeInsets safeInsets;

  const DualProbLabelSmart({
    super.key,
    required this.zoneRect,
    required this.viewport,
    required this.isResistance,
    required this.aPct,
    required this.bPct,
    this.safeInsets = EdgeInsets.zero,
  });

  @override
  Widget build(BuildContext context) {
    final base = isResistance ? const Color(0xFFFF4D6D) : const Color(0xFF2BFFB7);
    final aText = isResistance ? '반전' : '반등';
    final bText = isResistance ? '?�파' : '붕괴';
    final raw = SmartPlace.nearZone(zoneRect, viewport);
    final pos = SmartPlace.clampToRect(raw, viewport, inset: safeInsets);

    return Positioned(
      left: pos.dx,
      top: pos.dy,
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
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  _pill('$aText ${aPct.clamp(0,100).toStringAsFixed(0)}%', base),
                  
                  _pill('$bText ${bPct.clamp(0,100).toStringAsFixed(0)}%', const Color(0xFF2CCBFF)),
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
      child: Text(t, style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }
}