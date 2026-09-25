
import 'package:flutter/material.dart';
import 'dart:math';

void main() {
  runApp(const FulinkCN());
}

class FulinkCN extends StatelessWidget {
  const FulinkCN({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: DashboardCN(),
    );
  }
}

class DashboardCN extends StatefulWidget {
  const DashboardCN({super.key});

  @override
  State<DashboardCN> createState() => _DashboardCNState();
}

class _DashboardCNState extends State<DashboardCN>
    with SingleTickerProviderStateMixin {
  late AnimationController controller;

  @override
  void initState() {
    super.initState();
    controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat(reverse: true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedBuilder(
              animation: controller,
              builder: (_, __) {
                double v = controller.value;
                return Transform.rotate(
                  angle: pi * (v - 0.5),
                  child: CustomPaint(
                    size: const Size(280, 280),
                    painter: GaugePainter(v),
                  ),
                );
              },
            ),
            const SizedBox(height: 20),
            const Text(
              "当前判断：买入",
              style: TextStyle(color: Colors.greenAccent, fontSize: 20),
            ),
            const SizedBox(height: 12),
            const Text(
              "时间周期：快速 / 很快 / 普通 / 稳定 / 大趋势 / 每日 / 每周 / 每月",
              style: TextStyle(color: Colors.white70, fontSize: 12),
              textAlign: TextAlign.center,
            )
          ],
        ),
      ),
    );
  }
}

class GaugePainter extends CustomPainter {
  final double value;
  GaugePainter(this.value);

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.width / 2;

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 20
      ..shader = SweepGradient(
        colors: const [
          Colors.greenAccent,
          Colors.yellow,
          Colors.redAccent
        ],
      ).createShader(Rect.fromCircle(center: center, radius: radius));

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      pi,
      pi * value,
      false,
      paint,
    );
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => true;
}
