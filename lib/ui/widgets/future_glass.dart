import 'dart:ui';
import 'package:flutter/material.dart';

class FutureGlass extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final double radius;

  const FutureGlass({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.radius = 18,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: Colors.white.withOpacity(0.10)),
          ),
          child: child,
        ),
      ),
    );
  }
}

class NeonPill extends StatelessWidget {
  final String text;
  final bool active;
  const NeonPill({super.key, required this.text, required this.active});

  @override
  Widget build(BuildContext context) {
    final c = active ? Colors.greenAccent : Colors.white70;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(0.35)),
        color: c.withOpacity(0.08),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: c),
      ),
    );
  }
}