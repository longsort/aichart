import 'dart:ui';
import 'package:flutter/material.dart';
import '../ai/smart_place.dart';

class TargetsProbLabelSmart extends StatelessWidget {
  final Offset tpEnd;
  final Rect viewport;
  final List<double> tpsPct;
  final EdgeInsets safeInsets;

  const TargetsProbLabelSmart({
    super.key,
    required this.tpEnd,
    required this.viewport,
    required this.tpsPct,
    this.safeInsets = EdgeInsets.zero,
  });

  @override
  Widget build(BuildContext context) {
    final raw = SmartPlace.nearLineEnd(tpEnd, viewport);
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
                border: Border.all(color: Colors.white.withOpacity(0.10), width: 1),
              ),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  _tp('목표1', tpsPct.isNotEmpty ? tpsPct[0] : 0, const Color(0xFF2CCBFF)),
                  const SizedBox(width: 6),
                  _tp('목표2', tpsPct.length > 1 ? tpsPct[1] : 0, const Color(0xFF2BFFB7)),
                  const SizedBox(width: 6),
                  _tp('목표3', tpsPct.length > 2 ? tpsPct[2] : 0, const Color(0xFFFFC857)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _tp(String t, double pct, Color c) {
    final p = pct.clamp(0, 100).toDouble();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withOpacity(0.25), width: 1),
      ),
      child: Text('$t ${p.toStringAsFixed(0)}%', style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }
}