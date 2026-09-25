
import 'dart:math';
import 'package:flutter/material.dart';

class EvidencePulse extends StatefulWidget {
  final Widget child;
  final int evidenceCount;
  const EvidencePulse({super.key, required this.child, required this.evidenceCount});

  @override
  State<EvidencePulse> createState() => _EvidencePulseState();
}

class _EvidencePulseState extends State<EvidencePulse>
    with SingleTickerProviderStateMixin {
  late AnimationController _c;
  int _last = 0;

  @override
  void initState() {
    super.initState();
    _last = widget.evidenceCount;
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 180),
    );
  }

  @override
  void didUpdateWidget(covariant EvidencePulse oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.evidenceCount != _last) {
      _last = widget.evidenceCount;
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) {
        final t = Curves.easeOut.transform(_c.value);
        final scale = 1.0 + 0.06 * sin(t * pi);
        final glow = 0.18 * (1 - t);

        return Transform.scale(
          scale: scale,
          child: Container(
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(
                  color: Colors.white.withOpacity(glow),
                  blurRadius: 24 * glow,
                  spreadRadius: 6 * glow,
                )
              ],
            ),
            child: child,
          ),
        );
      },
      child: widget.child,
    );
  }
}
