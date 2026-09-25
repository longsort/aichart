import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'fx_config.dart';
import 'neon_theme.dart';

class FxParticlesBg extends StatefulWidget {
  final Widget child;
  const FxParticlesBg({super.key, required this.child});

  @override
  State<FxParticlesBg> createState() => _FxParticlesBgState();
}

class _FxParticlesBgState extends State<FxParticlesBg> with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(vsync: this, duration: const Duration(milliseconds: 2000))..repeat();
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!FxConfig.showMode) return widget.child;
    final t = NeonTheme.of(context);

    return AnimatedBuilder(
      animation: _ac,
      builder: (context, _) {
        return Stack(
          children: [
            Positioned.fill(
              child: RepaintBoundary(
                child: CustomPaint(
                  painter: _ParticlePainter(
                    p: _ac.value,
                    bg: t.bg,
                    accent: t.accent,
                    good: t.good,
                    bad: t.bad,
                    intensity: FxConfig.intensity,
                  ),
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

class _ParticlePainter extends CustomPainter {
  final double p;
  final Color bg;
  final Color accent;
  final Color good;
  final Color bad;
  final double intensity;

  _ParticlePainter({
    required this.p,
    required this.bg,
    required this.accent,
    required this.good,
    required this.bad,
    required this.intensity,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final b = Paint()..color = bg;
    canvas.drawRect(Offset.zero & size, b);

    // 모드�?배경 ?�출 (FX 모드 변�?
    if (FxConfig.mode == 1) {
      _paintMatrix(canvas, size);
      return;
    }
    if (FxConfig.mode == 2) {
      _paintNebula(canvas, size);
      return;
    }
    _paintLaser(canvas, size);
  }

  void _paintLaser(Canvas canvas, Size size) {
    final rng = _HashRng(seed: (p * 1000000000).toInt());
    final n = (22 + 58 * intensity).round();

    final laserCount = (2 + 5 * intensity).round();
    for (int i = 0; i < laserCount; i++) {
      final y = rng.nextDouble() * size.height;
      final sway = math.sin((p * 6.2831853) + i) * 40.0 * intensity;
      final c = (i % 3 == 0 ? accent : (i % 3 == 1 ? good : bad)).withOpacity(0.08 + 0.10 * intensity);
      final paint = Paint()
        ..color = c
        ..strokeWidth = 1.0 + 1.2 * intensity;
      canvas.drawLine(Offset(-40, y + sway), Offset(size.width + 40, y - sway), paint);
    }

    for (int i = 0; i < n; i++) {
      final x = rng.nextDouble() * size.width;
      final y = rng.nextDouble() * size.height;
      final rr = 0.8 + rng.nextDouble() * (2.2 + 1.8 * intensity);
      final c = (i % 3 == 0 ? accent : (i % 3 == 1 ? good : bad)).withOpacity(0.06 + 0.14 * intensity);
      final paint = Paint()
        ..shader = RadialGradient(
          colors: [c, c.withOpacity(0)],
        ).createShader(Rect.fromCircle(center: Offset(x, y), radius: rr * 10));
      canvas.drawCircle(Offset(x, y), rr * 10, paint);
    }
  }

  void _paintMatrix(Canvas canvas, Size size) {
    final rng = _HashRng(seed: (p * 1000000000).toInt() ^ 0xA5A5A5);
    final cols = (10 + 22 * intensity).round();
    final colW = size.width / cols;
    for (int i = 0; i < cols; i++) {
      final x = i * colW + colW * 0.5;
      final speed = 0.4 + rng.nextDouble() * (1.6 + 1.8 * intensity);
      final phase = (p * speed + rng.nextDouble()) % 1.0;
      final headY = phase * size.height;
      final tail = 120 + 220 * intensity;
      final paint = Paint()
        ..strokeWidth = 1.0 + 1.3 * intensity
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            good.withOpacity(0.0),
            good.withOpacity(0.06 + 0.10 * intensity),
            good.withOpacity(0.20 + 0.18 * intensity),
          ],
          stops: const [0.0, 0.55, 1.0],
        ).createShader(Rect.fromLTWH(x - 2, headY - tail, 4, tail));

      canvas.drawLine(Offset(x, headY - tail), Offset(x, headY), paint);
      // ?�드 ??강력??보이???�낌)
      final dot = Paint()..color = accent.withOpacity(0.22 + 0.20 * intensity);
      canvas.drawCircle(Offset(x, headY), 2.2 + 2.0 * intensity, dot);
    }
  }

  void _paintNebula(Canvas canvas, Size size) {
    final rng = _HashRng(seed: (p * 1000000000).toInt() ^ 0x1F2E3D);
    final n = (12 + 28 * intensity).round();
    for (int i = 0; i < n; i++) {
      final x = rng.nextDouble() * size.width;
      final y = rng.nextDouble() * size.height;
      final rr = 18 + rng.nextDouble() * (54 + 120 * intensity);
      final c = (i % 3 == 0 ? accent : (i % 3 == 1 ? good : bad)).withOpacity(0.05 + 0.10 * intensity);
      final paint = Paint()
        ..shader = RadialGradient(
          colors: [c, c.withOpacity(0)],
        ).createShader(Rect.fromCircle(center: Offset(x, y), radius: rr));
      canvas.drawCircle(Offset(x, y), rr, paint);
    }

    // ?�???�윙 ?�인
    final sway = math.sin(p * 6.2831853) * (28.0 + 46.0 * intensity);
    final paint = Paint()
      ..color = accent.withOpacity(0.05 + 0.08 * intensity)
      ..strokeWidth = 1.2 + 1.6 * intensity;
    canvas.drawLine(Offset(-40, size.height * 0.35 + sway), Offset(size.width + 40, size.height * 0.35 - sway), paint);
    canvas.drawLine(Offset(-40, size.height * 0.68 - sway), Offset(size.width + 40, size.height * 0.68 + sway), paint);
  }

  @override
  bool shouldRepaint(covariant _ParticlePainter oldDelegate) {
    return oldDelegate.p != p || oldDelegate.intensity != intensity;
  }
}

class _HashRng {
  int _x;
  _HashRng({required int seed}) : _x = seed ^ 0x9E3779B9;

  int _next() {
    _x ^= (_x << 13) & 0xFFFFFFFF;
    _x ^= (_x >> 17) & 0xFFFFFFFF;
    _x ^= (_x << 5) & 0xFFFFFFFF;
    return _x & 0x7FFFFFFF;
  }

  double nextDouble() => _next() / 0x7FFFFFFF;
}
