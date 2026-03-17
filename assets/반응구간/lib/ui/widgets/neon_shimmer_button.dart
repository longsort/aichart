import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'neon_theme.dart';

class NeonShimmerButton extends StatefulWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool danger;
  final bool compact;

  const NeonShimmerButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.danger = false,
    this.compact = false,
  });

  @override
  State<NeonShimmerButton> createState() => _NeonShimmerButtonState();
}

class _NeonShimmerButtonState extends State<NeonShimmerButton> with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final base = widget.danger ? t.bad : t.accent;

    final padV = widget.compact ? 10.0 : 12.0;
    final padH = widget.compact ? 12.0 : 14.0;

    return AnimatedBuilder(
      animation: _ac,
      builder: (context, _) {
        final v = _ac.value;
        final shimmer = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(v * math.pi * 2));
        final glow = 0.10 + 0.25 * (0.5 + 0.5 * math.cos(v * math.pi * 2));
        return GestureDetector(
          onTap: widget.onPressed,
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: padH, vertical: padV),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: LinearGradient(
                begin: Alignment(-1 + 2 * v, -1),
                end: Alignment(1 + 2 * v, 1),
                colors: [
                  base.withOpacity(0.20),
                  base.withOpacity(0.45 * shimmer),
                  base.withOpacity(0.20),
                ],
              ),
              border: Border.all(color: base.withOpacity(0.55 + 0.25 * shimmer), width: 1.4),
              boxShadow: [
                BoxShadow(
                  color: base.withOpacity(glow),
                  blurRadius: 18,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: Center(
              child: Text(
                widget.text,
                style: TextStyle(
                  color: t.fg,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.2,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
