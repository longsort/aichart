import 'package:flutter/material.dart';

class PulseDot extends StatefulWidget {
  final bool on;
  const PulseDot({super.key, required this.on});

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat(reverse: true);
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.on ? Colors.greenAccent : Colors.white24;
    return FadeTransition(
      opacity: Tween(begin: 0.35, end: 1.0).animate(_c),
      child: Icon(Icons.circle, size: 10, color: color),
    );
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }
}