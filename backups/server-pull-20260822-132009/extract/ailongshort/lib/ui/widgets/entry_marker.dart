import 'dart:ui';
import 'package:flutter/material.dart';
import '../ai/smart_place.dart';

class EntryMarker extends StatelessWidget {
  final Offset pos;     // desired pixel pos
  final Rect viewport;
  final String dir;     // LONG / SHORT
  final double probPct; // 0~100
  final double rr;
  final EdgeInsets safeInsets;

  const EntryMarker({
    super.key,
    required this.pos,
    required this.viewport,
    required this.dir,
    required this.probPct,
    required this.rr,
    this.safeInsets = EdgeInsets.zero,
  });

  @override
  Widget build(BuildContext context) {
    final p = probPct.clamp(0, 100).toDouble();
    final watch = p < 20.0;

    final isLong = dir.toUpperCase().contains('LONG');
    final tone = watch ? const Color(0xFFFFC857) : (isLong ? const Color(0xFF2BFFB7) : const Color(0xFFFF4D6D));
    final label = watch
        ? 'ê´€ë§?
        : (isLong ? 'ë¡? : (dir.toUpperCase().contains('SHORT') ? '?? : dir.toUpperCase()));

    final placed = SmartPlace.clampToRect(
      Offset(pos.dx + 10, pos.dy - 18),
      viewport,
      inset: safeInsets,
    );

    return Positioned(
      left: placed.dx,
      top: placed.dy,
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
                border: Border.all(color: tone.withOpacity(0.40), width: 1),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(isLong ? Icons.trending_up : Icons.trending_down, size: 14, color: tone.withOpacity(0.95)),
                  const SizedBox(width: 7),
                  Text('$label ${p.toStringAsFixed(0)}% Â· RR ${rr.toStringAsFixed(2)}', style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 11, fontWeight: FontWeight.w900)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}