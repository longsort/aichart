import 'dart:ui';
import 'package:flutter/material.dart';

class HudCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final double radius;
  final double blur;
  final Color? borderColor;

  const HudCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(12),
    this.radius = 18,
    this.blur = 16,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    final bc = borderColor ?? Colors.white.withOpacity(0.08);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: bc, width: 1),
            boxShadow: [
              BoxShadow(
                color: (borderColor ?? Colors.cyanAccent).withOpacity(0.10),
                blurRadius: 22,
                spreadRadius: 0.5,
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}
