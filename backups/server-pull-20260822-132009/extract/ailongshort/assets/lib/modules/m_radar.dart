import 'dart:math';
import 'package:flutter/material.dart';
import '../common.dart';

class ModRadar extends StatefulWidget {
  const ModRadar({super.key});
  @override
  State<ModRadar> createState() => _ModRadarState();
}

class _ModRadarState extends State<ModRadar> with SingleTickerProviderStateMixin {
  final rnd = Random();
  late AnimationController a;

  List<double> evidence = List.filled(6, 0.2);
  List<double> trend = [];

  @override
  void initState() {
    super.initState();
    a = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();
  }

  @override
  void dispose() {
    a.dispose();
    super.dispose();
  }

  void update() {
    final i = rnd.nextInt(6);
    evidence[i] = (evidence[i] + rnd.nextDouble() * 0.25).clamp(0.0, 1.0);
    final avg = evidence.reduce((a, b) => a + b) / evidence.length;
    trend.add(avg);
    if (trend.length > 16) trend.removeAt(0);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final p = sin(a.value * 2 * pi).abs();
    final avg = evidence.reduce((a, b) => a + b) / evidence.length;
    final c = heat(avg);

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("Evidence Radar"), foregroundColor: Colors.white),
      body: Center(
        child: GestureDetector(
          onTap: update,
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: cardDeco().copyWith(
              boxShadow: [BoxShadow(color: c.withOpacity(0.25 + 0.25 * p), blurRadius: 80, spreadRadius: 20)],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text("${(avg * 100).round()}%", style: TextStyle(color: c, fontSize: 40, fontWeight: FontWeight.w900)),
                const SizedBox(height: 14),
                SizedBox(width: 180, height: 180, child: CustomPaint(painter: RadarPainter(evidence, c))),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: trend
                      .map((e) => Container(
                            width: 8,
                            height: 24,
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            decoration: BoxDecoration(color: heat(e), borderRadius: BorderRadius.circular(6)),
                          ))
                      .toList(),
                ),
                const SizedBox(height: 8),
                Text("Tap = collect evidence", style: TextStyle(color: Colors.white.withOpacity(0.55), fontWeight: FontWeight.w800)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class RadarPainter extends CustomPainter {
  final List<double> v;
  final Color c;
  RadarPainter(this.v, this.c);

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final r = size.width / 2;
    final path = Path();

    for (int i = 0; i < v.length; i++) {
      final ang = (2 * pi / v.length) * i - pi / 2;
      final rr = r * v[i];
      final p = Offset(center.dx + cos(ang) * rr, center.dy + sin(ang) * rr);
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();

    final paint = Paint()..color = c.withOpacity(0.35)..style = PaintingStyle.fill;
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
