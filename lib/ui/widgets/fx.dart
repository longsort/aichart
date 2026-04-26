import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'neon_theme.dart';
import 'fx_config.dart';

Route<T> fxRoute<T>(Widget page, {bool fromRight = true}) {
  return PageRouteBuilder<T>(
    transitionDuration: const Duration(milliseconds: 520),
    reverseTransitionDuration: const Duration(milliseconds: 420),
    pageBuilder: (_, __, ___) => page,
    transitionsBuilder: (context, anim, sec, child) {
      final curve = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);
      final dx = fromRight ? 0.14 : -0.14;
      final slide = Tween<Offset>(begin: Offset(dx, 0.02), end: Offset.zero).animate(curve);
      final fade = Tween<double>(begin: 0.0, end: 1.0).animate(curve);
      return FadeTransition(
        opacity: fade,
        child: SlideTransition(position: slide, child: child),
      );
    },
  );
}

class FxPop extends StatelessWidget {
  final Widget child;
  final int delayMs;
  const FxPop({super.key, required this.child, this.delayMs = 0});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeOutCubic,
      builder: (context, v, _) {
        final t = (v - (delayMs / 900)).clamp(0.0, 1.0);
        final dy = (1 - t) * 10;
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, dy), child: child),
        );
      },
    );
  }
}

class FxGlowBg extends StatefulWidget {
  final Widget child;
  const FxGlowBg({super.key, required this.child});

  @override
  State<FxGlowBg> createState() => _FxGlowBgState();
}

class _FxGlowBgState extends State<FxGlowBg> with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(vsync: this, duration: const Duration(seconds: 6))..repeat();
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    if (!FxConfig.showMode) return widget.child;
    return AnimatedBuilder(
      animation: _ac,
      builder: (context, _) {
        final v = _ac.value;
        final k = FxConfig.intensity;
        final a = (0.08 + 0.10 * k) + (0.04 + 0.08 * k) * math.sin(v * math.pi * 2);
        final b = (0.08 + 0.10 * k) + (0.04 + 0.08 * k) * math.cos(v * math.pi * 2);
        return Stack(
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _GlowPainter(
                  bg: t.bg,
                  c1: t.accent.withOpacity(a),
                  c2: t.good.withOpacity(b),
                  c3: t.bad.withOpacity(a),
                  p: v,
                ),
              ),
            ),
            widget.child,
          ],
        );
      },
    );
  }
}

class _GlowPainter extends CustomPainter {
  final Color bg;
  final Color c1;
  final Color c2;
  final Color c3;
  final double p;

  _GlowPainter({required this.bg, required this.c1, required this.c2, required this.c3, required this.p});

  @override
  void paint(Canvas canvas, Size size) {
    final b = Paint()..color = bg;
    canvas.drawRect(Offset.zero & size, b);

    void blob(Offset center, double r, Color c) {
      final paint = Paint()
        ..shader = RadialGradient(
          colors: [c, c.withOpacity(0)],
        ).createShader(Rect.fromCircle(center: center, radius: r));
      canvas.drawCircle(center, r, paint);
    }

    final w = size.width, h = size.height;
    blob(Offset(w * (0.2 + 0.6 * p), h * 0.18), w * 0.55, c1);
    blob(Offset(w * (0.75 - 0.55 * p), h * 0.55), w * 0.60, c2);
    blob(Offset(w * (0.35 + 0.4 * math.sin(p * math.pi * 2)), h * 0.92), w * 0.65, c3);
  }

  @override
  bool shouldRepaint(covariant _GlowPainter old) => true;
}

class FxPulse extends StatefulWidget {
  final Widget child;
  final bool active;
  const FxPulse({super.key, required this.child, required this.active});

  @override
  State<FxPulse> createState() => _FxPulseState();
}

class _FxPulseState extends State<FxPulse> with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    if (widget.active) _ac.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant FxPulse oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !_ac.isAnimating) _ac.repeat(reverse: true);
    if (!widget.active && _ac.isAnimating) _ac.stop();
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!FxConfig.showMode) return widget.child;
    // ?†Ô∏è Transform.scale?Ä Î∂ÄÎ™??úÏïΩ??Îπ°Îπ°?òÎ©¥ RenderFlex overflowÎ•??†Î∞ú?????àÏùå.
    // (?πÌûà Sliver/PersistentHeader ?àÏóê?? => ClipRectÎ°??àÏ†Ñ?òÍ≤å ?òÎùº??Í≤ΩÍ≥† ?úÍ±∞.
    return ClipRect(
      child: AnimatedBuilder(
        animation: _ac,
        builder: (context, _) {
          final s = 1.0 + ((FxConfig.showMode && widget.active) ? 0.03 * _ac.value : 0.0);
          return Transform.scale(scale: s, child: widget.child);
        },
      ),
    );
  }
}


class FxSpin extends StatefulWidget {
  final Widget child;
  final bool active;
  const FxSpin({super.key, required this.child, required this.active});

  @override
  State<FxSpin> createState() => _FxSpinState();
}

class _FxSpinState extends State<FxSpin> with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(vsync: this, duration: const Duration(seconds: 3));
    if (widget.active) _ac.repeat();
  }

  @override
  void didUpdateWidget(covariant FxSpin oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !_ac.isAnimating) _ac.repeat();
    if (!widget.active && _ac.isAnimating) _ac.stop();
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!FxConfig.showMode) return widget.child;
    return AnimatedBuilder(
      animation: _ac,
      builder: (context, _) {
        final a = (FxConfig.showMode && widget.active) ? _ac.value * 6.283185307179586 : 0.0;
        return Transform.rotate(angle: a, child: widget.child);
      },
    );
  }
}
