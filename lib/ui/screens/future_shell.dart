import 'package:flutter/material.dart';
import '../widgets/future_glass.dart';

class FutureShell extends StatelessWidget {
  final Widget child;
  final String title;
  final String subtitle;

  const FutureShell({
    super.key,
    required this.child,
    this.title = 'Fulink Pro ??2100 HUD',
    this.subtitle = 'Decision-first interface',
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // 배경 그라?�이??
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF070A12),
                Color(0xFF060818),
                Color(0xFF050712),
              ],
            ),
          ),
        ),

        // ?�제 기존 ?�면
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              children: [
                FutureGlass(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      const Text('??, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
                            const SizedBox(height: 2),
                            Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.white70)),
                          ],
                        ),
                      ),
                      const NeonPill(text: 'LIVE', active: true),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Expanded(child: child),
              ],
            ),
          ),
        ),
      ],
    );
  }
}