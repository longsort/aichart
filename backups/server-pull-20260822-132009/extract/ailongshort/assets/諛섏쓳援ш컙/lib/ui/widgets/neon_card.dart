import 'package:flutter/material.dart';

class NeonCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;

  const NeonCard({super.key, required this.child, this.padding = const EdgeInsets.all(14)});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withOpacity(0.08),
            Colors.white.withOpacity(0.03),
          ],
        ),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
        boxShadow: [
          BoxShadow(
            blurRadius: 24,
            spreadRadius: 1,
            color: Colors.purpleAccent.withOpacity(0.10),
          ),
          BoxShadow(
            blurRadius: 14,
            spreadRadius: 0,
            color: Colors.cyanAccent.withOpacity(0.06),
          ),
        ],
      ),
      child: child,
    );
  }
}
