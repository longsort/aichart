import 'dart:ui';
import 'package:flutter/material.dart';
import '../ai/smart_place.dart';

class ZoneProbLabel extends StatelessWidget {
  final Rect zoneRect;
  final Rect viewport;
  final String title;
  final double probPct;
  final Color tone;
  final EdgeInsets safeInsets;

  const ZoneProbLabel({
    super.key,
    required this.zoneRect,
    required this.viewport,
    required this.title,
    required this.probPct,
    required this.tone,
    this.safeInsets = EdgeInsets.zero,
  });

  @override
  Widget build(BuildContext context) {
    final raw = SmartPlace.nearZone(zoneRect, viewport);
    final pos = SmartPlace.clampToRect(raw, viewport, inset: safeInsets);
    return Positioned(
      left: pos.dx,
      top: (pos.dy - 36).clamp(
        safeInsets.top,
        (viewport.bottom - safeInsets.bottom - 30).clamp(0.0, viewport.bottom),
      ),
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
                border: Border.all(color: tone.withOpacity(0.35), width: 1),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.layers, size: 14, color: tone.withOpacity(0.95)),
                  const SizedBox(width: 7),
                  Text('$title ${probPct.clamp(0,100).toStringAsFixed(0)}%', style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 11, fontWeight: FontWeight.w900)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}