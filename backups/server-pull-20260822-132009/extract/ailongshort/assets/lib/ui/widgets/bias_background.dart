import 'package:flutter/material.dart';
import '../../core/app_core.dart';
import '../../data/snapshot/engine_snapshot.dart';

/// 모든 화면 공통 배경
/// - 롱 우세: 연한 초록
/// - 숏 우세: 연한 빨강
/// - 중립: 검정
class BiasBackground extends StatelessWidget {
  final Widget child;
  const BiasBackground({super.key, required this.child});

  Color _bgByBias(double bias) {
    if (bias >= 0.10) return const Color(0xFF00FF7A).withOpacity(0.10);
    if (bias <= -0.10) return const Color(0xFFFF2D55).withOpacity(0.10);
    return Colors.transparent;
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<EngineSnapshot>(
      stream: AppCore.I.stream,
      initialData: AppCore.I.last,
      builder: (context, snap) {
        final s = snap.data ?? EngineSnapshot.empty();
        final bg = _bgByBias(s.bias);
        return Container(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(0.0, -0.9),
              radius: 1.7,
              colors: [bg, Colors.black],
            ),
          ),
          child: child,
        );
      },
    );
  }
}
