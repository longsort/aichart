import 'dart:ui';
import 'package:flutter/material.dart';

/// Shows target reach probabilities near the future path end or target lines.
/// Example: TP1 62% / TP2 41% / TP3 24%
class TargetsProbLabel extends StatelessWidget {
  final double x;
  final double y;
  final List<double> tpsPct; // [tp1,tp2,tp3] 0~100
  final String prefix; // 'TP'

  const TargetsProbLabel({
    super.key,
    required this.x,
    required this.y,
    required this.tpsPct,
    this.prefix = 'TP',
  });

  @override
  Widget build(BuildContext context) {
    final p = tpsPct.map((e) => e.clamp(0, 100).toDouble()).toList();

    return Positioned(
      left: x,
      top: y,
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
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _tp('${prefix}1', p.length > 0 ? p[0] : 0, const Color(0xFF2CCBFF)),
                  const SizedBox(width: 6),
                  _tp('${prefix}2', p.length > 1 ? p[1] : 0, const Color(0xFF2BFFB7)),
                  const SizedBox(width: 6),
                  _tp('${prefix}3', p.length > 2 ? p[2] : 0, const Color(0xFFFFC857)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _tp(String t, double pct, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withOpacity(0.25), width: 1),
      ),
      child: Text(
        '$t ${pct.toStringAsFixed(0)}%',
        style: TextStyle(
          color: Colors.white.withOpacity(0.92),
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}