import 'package:flutter/material.dart';

class MiniRealtimeAnim extends StatefulWidget {
  final Widget child;
  const MiniRealtimeAnim({super.key, required this.child});

  @override
  State<MiniRealtimeAnim> createState() => _MiniRealtimeAnimState();
}

class _MiniRealtimeAnimState extends State<MiniRealtimeAnim>
    with SingleTickerProviderStateMixin {
  late AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    )..repeat(reverse: true);
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
        final s = 1.0 + (_c.value * 0.015);
        return Transform.scale(scale: s, child: child);
      },
      child: widget.child,
    );
  }
}